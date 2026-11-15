import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Linking,
  AppState,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

import { Header } from '@/components/layout/Header';
import {
  fetchParentByUserId,
  fetchParentStudents,
  fetchFees,
  fetchGatewayActive,
  createPaymentLink,
  checkOnlinePayment,
  onlineCharges,
  reconcilePayments,
  fetchSchool,
} from '@/services/api';
import { SPACING, RADIUS, formatDate, formatCurrency } from '@/lib/utils';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { ReceiptSheet } from '@/components/fees/ReceiptSheet';
import { MobileListSkeleton, MobileInlineSkeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/context/AuthContext';
import type { Student, Fee, School } from '@/types';
import { appAlert } from '@/components/ui/AppDialog';
import { RefreshScrollView } from '@/components/ui/RefreshScrollView';

interface ChildInfo {
  student: Student;
  className: string;
  sectionName: string;
}

type FeeStructureMode = 'monthly' | 'quarterly' | 'annually';

interface SchoolFeeStructureItem {
  id: string;
  name: string;
  fee_type: string;
  class_id: string | null;
  amount: number;
  frequency: 'one_time' | 'monthly' | 'quarterly' | 'annual';
  is_active: boolean;
}

const MONTH_ORDER = [
  'April', 'May', 'June', 'July', 'August', 'September',
  'October', 'November', 'December', 'January', 'February', 'March',
] as const;
type MonthName = typeof MONTH_ORDER[number];

const MONTH_ABBR: Record<MonthName, string> = {
  April: 'Apr', May: 'May', June: 'Jun', July: 'Jul', August: 'Aug',
  September: 'Sep', October: 'Oct', November: 'Nov', December: 'Dec',
  January: 'Jan', February: 'Feb', March: 'Mar',
};

const QUARTERS = [
  { id: 'Q1', label: 'Quarter 1 (Apr – Jun)', short: 'Q1 · Apr–Jun' },
  { id: 'Q2', label: 'Quarter 2 (Jul – Sep)', short: 'Q2 · Jul–Sep' },
  { id: 'Q3', label: 'Quarter 3 (Oct – Dec)', short: 'Q3 · Oct–Dec' },
  { id: 'Q4', label: 'Quarter 4 (Jan – Mar)', short: 'Q4 · Jan–Mar' },
] as const;

function addMonthsToDate(dateStr: string | undefined, monthsToAdd: number): string {
  const base = dateStr ? new Date(dateStr) : new Date();
  if (Number.isNaN(base.getTime())) {
    const fallback = new Date();
    fallback.setMonth(fallback.getMonth() + monthsToAdd);
    return fallback.toISOString().split('T')[0];
  }
  base.setMonth(base.getMonth() + monthsToAdd);
  return base.toISOString().split('T')[0];
}

interface InstallmentPlanInfo {
  mode: FeeStructureMode;
  totalPeriods: number;
  paidPeriods: number;
  currentPeriodIndex: number;
  currentPeriodLabel: string;
  nextPeriodLabel: string | null;
  installmentAmount: number;
  monthsToAdvance: number;
  isPaymentWindowOpen: boolean;
  windowStatusText: string;
}

function computeInstallmentPlan(
  fee: Fee,
  mode: FeeStructureMode,
  paidInCurrentSessionCount: number
): InstallmentPlanInfo {
  const total = Number(fee.amount) || 0;
  const paid = Number(fee.paid_amount) || 0;
  const remaining = Math.max(0, total - paid);
  const now = new Date();
  const isAfter25th = now.getDate() >= 25;

  if (mode === 'monthly') {
    const unit = total / 12;
    const paidMonths =
      remaining <= 0 || fee.status === 'paid'
        ? 12
        : unit > 0
          ? Math.min(11, Math.floor((paid + 0.5) / unit))
          : 0;
    const currentIdx = Math.min(11, paidMonths);
    const currentLabel = `${MONTH_ORDER[currentIdx]} Month`;
    const nextLabel = currentIdx + 1 < 12 ? `${MONTH_ORDER[currentIdx + 1]} Month` : null;
    const isLastMonth = currentIdx === 11;
    const amountForThisMonth =
      remaining <= 0
        ? 0
        : isLastMonth
          ? remaining
          : Math.min(remaining, Math.max(1, Math.round(unit)));

    // 25th-of-the-month rule:
    // - Current due month (first unpaid installment) can be paid anytime.
    // - Once current month is paid, the NEXT month's payment window opens only from the 25th of the month onwards!
    // - If today >= 25th, 1 advance month (next month) window is open; once that advance month is also paid, the month after that waits until the 25th of next month.
    const maxInstallmentsAllowedNow = isAfter25th ? 2 : 1;
    const isWindowOpen =
      remaining > 0 &&
      (paidMonths === 0 || paidInCurrentSessionCount < maxInstallmentsAllowedNow);

    let windowStatusText = '';
    if (remaining <= 0) {
      windowStatusText = 'All 12 monthly installments paid.';
    } else if (!isWindowOpen) {
      windowStatusText = `Payment window for ${MONTH_ORDER[currentIdx]} will open on the 25th of the month.`;
    } else if (paidMonths > 0 && isAfter25th) {
      windowStatusText = `Month-End Window Open (After 25th): ${MONTH_ORDER[currentIdx]} fee payment is now open.`;
    } else {
      windowStatusText = `Current month (${MONTH_ORDER[currentIdx]}) payment window is open. Next month (${nextLabel || 'Next'}) opens after the 25th.`;
    }

    return {
      mode: 'monthly',
      totalPeriods: 12,
      paidPeriods: paidMonths,
      currentPeriodIndex: currentIdx,
      currentPeriodLabel: currentLabel,
      nextPeriodLabel: nextLabel,
      installmentAmount: amountForThisMonth,
      monthsToAdvance: 1,
      isPaymentWindowOpen: isWindowOpen,
      windowStatusText,
    };
  }

  if (mode === 'quarterly') {
    const unit = total / 4;
    const paidQuarters =
      remaining <= 0 || fee.status === 'paid'
        ? 4
        : unit > 0
          ? Math.min(3, Math.floor((paid + 0.5) / unit))
          : 0;
    const currentIdx = Math.min(3, paidQuarters);
    const currentLabel = QUARTERS[currentIdx].label;
    const nextLabel = currentIdx + 1 < 4 ? QUARTERS[currentIdx + 1].label : null;
    const isLastQuarter = currentIdx === 3;
    const amountForThisQuarter =
      remaining <= 0
        ? 0
        : isLastQuarter
          ? remaining
          : Math.min(remaining, Math.max(1, Math.round(unit)));

    return {
      mode: 'quarterly',
      totalPeriods: 4,
      paidPeriods: paidQuarters,
      currentPeriodIndex: currentIdx,
      currentPeriodLabel: currentLabel,
      nextPeriodLabel: nextLabel,
      installmentAmount: amountForThisQuarter,
      monthsToAdvance: 3,
      isPaymentWindowOpen: remaining > 0,
      windowStatusText: `Active Quarter: ${currentLabel}`,
    };
  }

  return {
    mode: 'annually',
    totalPeriods: 1,
    paidPeriods: remaining <= 0 || fee.status === 'paid' ? 1 : 0,
    currentPeriodIndex: 0,
    currentPeriodLabel: 'Full Annual Fee (12 Months)',
    nextPeriodLabel: null,
    installmentAmount: remaining,
    monthsToAdvance: 12,
    isPaymentWindowOpen: remaining > 0,
    windowStatusText: 'Full Academic Year One-Time Payment',
  };
}

export default function ParentFees() {
  const { user, profile, school: authSchool } = useAuth();

  const [children, setChildren] = useState<ChildInfo[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [fees, setFees] = useState<Fee[]>([]);
  const [schoolData, setSchoolData] = useState<School | null>(authSchool);
  const [schoolStructures, setSchoolStructures] = useState<SchoolFeeStructureItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [feesLoading, setFeesLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Track how many monthly payments were made in this cycle per fee id to enforce the 25th window rule
  const [sessionPaidCounts, setSessionPaidCounts] = useState<Record<string, number>>({});

  // Fee structure mode: Monthly | Quarterly | Annually
  const [structureMode, setStructureMode] = useState<FeeStructureMode>('monthly');

  // Pay modal state
  const [selectedFeeToPay, setSelectedFeeToPay] = useState<Fee | null>(null);
  const [onlineEnabled, setOnlineEnabled] = useState<boolean | null>(null);
  // Payment opened in the browser; checked when the parent comes back to the app.
  const [pendingPayment, setPendingPayment] = useState<{ id: string; fee: Fee; installment: number } | null>(null);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);

  // Official Receipt modal state
  const [receiptFee, setReceiptFee] = useState<Fee | null>(null);

  const loadChildren = useCallback(async () => {
    if (!user?.id) return;
    try {
      const parent = await fetchParentByUserId(user.id);
      if (!parent) return;

      const links = await fetchParentStudents(parent.id);
      const childInfos: ChildInfo[] = links.map((link) => {
        const student = link.student;
        return {
          student,
          className: student?.class?.name ?? 'Class',
          sectionName: student?.section?.name ?? '',
        };
      });

      setChildren(childInfos);

      const schoolId = profile?.school_id || childInfos[0]?.student?.school_id;
      if (schoolId) {
        const sch = await fetchSchool(schoolId, true);
        if (sch) {
          setSchoolData(sch);
          const rawStructures = (sch.settings as Record<string, unknown> | undefined)
            ?.fee_structures;
          if (Array.isArray(rawStructures)) {
            setSchoolStructures(
              (rawStructures as SchoolFeeStructureItem[]).filter(
                (s) => s.is_active && !String(s.id).startsWith('sample-')
              )
            );
          }
        }
      }
    } catch (err) {
      console.error('Parent fees load children error', err);
    }
  }, [user?.id, profile?.school_id]);

  const loadFees = useCallback(async (child: ChildInfo) => {
    setFeesLoading(true);
    try {
      const records = await fetchFees({ studentId: child.student.id });
      setFees(records);
    } catch (err) {
      console.error('Parent fees load records error', err);
    } finally {
      setFeesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadChildren().finally(() => setLoading(false));
  }, [loadChildren]);

  useEffect(() => {
    if (children.length > 0) {
      loadFees(children[selectedIndex]);
    }
  }, [children, selectedIndex, loadFees]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadChildren();
    if (children.length > 0) {
      await loadFees(children[selectedIndex]);
    }
    setRefreshing(false);
  }, [loadChildren, children, selectedIndex, loadFees]);

  const selectedChild = children[selectedIndex] ?? null;

  // Check if Admin has created a Quarterly or Annual Fee Structure plan for this school/class
  const hasQuarterlyPlan = useMemo(() => {
    const classId = selectedChild?.student.class_id;
    const fromStructure = schoolStructures.some(
      (s) =>
        s.frequency === 'quarterly' &&
        s.is_active &&
        (!s.class_id || s.class_id === classId)
    );
    const fromFees = fees.some(
      (f) =>
        /\b(Q1|Q2|Q3|Q4|Quarter|Quarterly)\b/i.test(f.fee_type)
    );
    return fromStructure || fromFees;
  }, [schoolStructures, fees, selectedChild?.student.class_id]);

  const hasAnnualPlan = useMemo(() => {
    const classId = selectedChild?.student.class_id;
    const fromStructure = schoolStructures.some(
      (s) =>
        s.frequency === 'annual' &&
        s.is_active &&
        (!s.class_id || s.class_id === classId)
    );
    const fromFees = fees.some((f) => /\b(Annual|Annually|Yearly)\b/i.test(f.fee_type));
    return fromStructure || fromFees;
  }, [schoolStructures, fees, selectedChild?.student.class_id]);

  useEffect(() => {
    if (structureMode === 'quarterly' && !hasQuarterlyPlan) {
      setStructureMode('monthly');
    } else if (structureMode === 'annually' && !hasAnnualPlan) {
      setStructureMode('monthly');
    }
  }, [structureMode, hasQuarterlyPlan, hasAnnualPlan]);

  const totalFees = fees.reduce((sum, f) => sum + Number(f.amount), 0);
  const totalPaid = fees.reduce((sum, f) => sum + Number(f.paid_amount), 0);
  const totalOutstanding = fees.reduce((sum, f) => sum + Number(f.remaining_amount), 0);

  const activeModalPlan = selectedFeeToPay
    ? computeInstallmentPlan(
        selectedFeeToPay,
        structureMode,
        sessionPaidCounts[selectedFeeToPay.id] || 0
      )
    : null;

  const handleSelectStructureMode = (mode: FeeStructureMode) => {
    if (mode === 'quarterly' && !hasQuarterlyPlan) {
      appAlert(
        'Quarterly Plan Not Available',
        'Quarterly payment option is only available when the school administrator creates a Quarterly Fee Plan.'
      );
      return;
    }
    if (mode === 'annually' && !hasAnnualPlan) {
      appAlert(
        'Annual Plan Not Available',
        'Annual payment option is only available when the school administrator creates an Annual Fee Plan.'
      );
      return;
    }
    setStructureMode(mode);
  };

  useEffect(() => {
    fetchGatewayActive().then(async (on) => {
      setOnlineEnabled(on);
      // Record any payment that finished while the app was closed.
      if (on) {
        const r = await reconcilePayments().catch(() => null);
        if (r?.applied && children[selectedIndex]) loadFees(children[selectedIndex]);
      }
    }).catch(() => setOnlineEnabled(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [children.length]);

  const finishPaid = useCallback(async (fee: Fee, installment: number, receipt?: string) => {
    setPendingPayment(null);
    if (children[selectedIndex]) await loadFees(children[selectedIndex]);
    const paidSoFar = Math.min(Number(fee.amount), Number(fee.paid_amount) + installment);
    setReceiptFee({
      ...fee,
      paid_amount: paidSoFar,
      remaining_amount: Math.max(0, Number(fee.amount) - paidSoFar),
      status: paidSoFar >= Number(fee.amount) ? 'paid' : 'partially_paid',
      payment_date: new Date().toISOString().split('T')[0],
      payment_method: 'Online (Razorpay)',
      receipt_number: receipt ?? fee.receipt_number,
    });
  }, [children, selectedIndex, loadFees]);

  const checkPending = useCallback(async (silent = false) => {
    if (!pendingPayment) return;
    setCheckingPayment(true);
    try {
      const r = await checkOnlinePayment(pendingPayment.id);
      if (r.status === 'paid') await finishPaid(pendingPayment.fee, pendingPayment.installment, r.receipt_number);
      else if (r.status === 'expired') { setPendingPayment(null); appAlert('Payment link expired', 'Please start the payment again.'); }
      else if (!silent) appAlert('Not received yet', 'We have not received the payment yet. If money was deducted, it is confirmed within a few minutes.');
    } catch (e) {
      if (!silent) appAlert('Could not check', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setCheckingPayment(false);
    }
  }, [pendingPayment, finishPaid]);

  // Coming back from the Razorpay page → check automatically.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active' && pendingPayment) checkPending(true); });
    return () => sub.remove();
  }, [pendingPayment, checkPending]);

  const handleConfirmPay = async () => {
    if (!selectedFeeToPay || !activeModalPlan) return;
    if (!onlineEnabled) {
      appAlert('Online payment not available', 'The school has not enabled online payment yet. Please pay at the school office.');
      return;
    }
    setProcessingPayment(true);
    try {
      const fee = selectedFeeToPay;
      const installment = activeModalPlan.installmentAmount;
      const remainingAfter = Number(fee.amount) - Number(fee.paid_amount) - installment;
      const nextDue = remainingAfter > 0 ? addMonthsToDate(fee.due_date, activeModalPlan.monthsToAdvance) : null;
      const link = await createPaymentLink({
        allocations: [{ fee_id: fee.id, amount: installment }],
        next_due_dates: nextDue ? { [fee.id]: nextDue } : {},
      });
      setSessionPaidCounts((prev) => ({ ...prev, [fee.id]: (prev[fee.id] || 0) + 1 }));
      setPendingPayment({ id: link.online_payment_id, fee, installment });
      setSelectedFeeToPay(null);
      await Linking.openURL(link.link_url);
    } catch (e) {
      appAlert('Payment could not start', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setProcessingPayment(false);
    }
  };

  const receiptSchool = useMemo(() => {
    const sch = (schoolData || authSchool) as (School & { affiliation_board?: string; affiliation_code?: string }) | null;
    const aff = sch?.affiliation_board
      ? `Affiliated to ${sch.affiliation_board}${sch.affiliation_code ? ` · Affiliation No. ${sch.affiliation_code}` : ''}`
      : null;
    return {
      name: sch?.name || 'School',
      address: sch?.address,
      phone: sch?.contact_number,
      email: sch?.email,
      logoUrl: sch?.logo_url,
      affiliation: aff,
      academicYear: sch?.academic_year,
    };
  }, [schoolData, authSchool]);

  const receiptStudent = useMemo(() => {
    if (!selectedChild) return null;
    const st = selectedChild.student;
    return {
      name: st.full_name,
      fatherName: st.father_name,
      className: `${selectedChild.className}${selectedChild.sectionName ? ` - ${selectedChild.sectionName}` : ''}`,
      admissionNo: st.admission_number || '—',
    };
  }, [selectedChild]);

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar style="dark" />
        <View style={styles.content}>
          <Header title="Fees & Payments" />
          <MobileListSkeleton rows={5} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.content}>
        <Header title="Fees & Payments" />

        <RefreshScrollView refreshing={refreshing} onRefresh={onRefresh}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {pendingPayment && (
            <View style={styles.pendingCard}>
              <Text style={styles.pendingTitle}>Waiting for payment</Text>
              <Text style={styles.pendingText}>
                {pendingPayment.fee.fee_type} · {formatCurrency(onlineCharges(pendingPayment.installment).total)}. Finish paying on the Razorpay page, then come back here.
              </Text>
              <View style={styles.pendingActions}>
                <Button label="I've paid — check" variant="primary" size="sm" loading={checkingPayment} onPress={() => checkPending(false)} style={{ flex: 1.4 }} />
                <Button label="Dismiss" variant="ghost" size="sm" onPress={() => setPendingPayment(null)} style={{ flex: 1 }} />
              </View>
            </View>
          )}

          {/* Child selector if multiple children */}
          {children.length > 1 && (
            <View style={styles.childSelectSection}>
              <Text style={styles.sectionTitle}>Select Child</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.childChipsScroll}
              >
                {children.map((child, idx) => {
                  const active = idx === selectedIndex;
                  return (
                    <TouchableOpacity
                      key={child.student.id}
                      onPress={() => setSelectedIndex(idx)}
                      activeOpacity={0.8}
                      style={[styles.childChip, active && styles.childChipActive]}
                    >
                      <Text style={[styles.childChipName, active && styles.childChipNameActive]}>
                        {child.student.full_name}
                      </Text>
                      <Text style={[styles.childChipSub, active && styles.childChipSubActive]}>
                        {child.className} - {child.sectionName}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Child Quick Header */}
          {selectedChild && children.length === 1 && (
            <View style={styles.singleChildBanner}>
              <View style={styles.singleChildDot} />
              <Text style={styles.singleChildText}>
                {selectedChild.student.full_name} · {selectedChild.className} - Section{' '}
                {selectedChild.sectionName}
              </Text>
            </View>
          )}

          {/* 3 Summary Stat Cards */}
          <View style={styles.statsCard}>
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statVal}>{formatCurrency(totalFees)}</Text>
                <Text style={styles.statLabel}>Total Fee</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={[styles.statVal, { color: '#059669' }]}>
                  {formatCurrency(totalPaid)}
                </Text>
                <Text style={styles.statLabel}>Paid</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text
                  style={[
                    styles.statVal,
                    { color: totalOutstanding > 0 ? '#DC2626' : '#059669' },
                  ]}
                >
                  {formatCurrency(totalOutstanding)}
                </Text>
                <Text style={styles.statLabel}>Remaining</Text>
              </View>
            </View>
          </View>

          {/* ── FEE STRUCTURE SELECTOR: MONTHLY | QUARTERLY | ANNUALLY ── */}
          <View style={styles.structureSelectorCard}>
            <View style={styles.structureHeaderRow}>
              <Text style={styles.structureTitle}>Fee Payment Structure</Text>
              <Text style={styles.structureSub}>
                Monthly window opens on the 25th of each month for the upcoming month. Quarterly &amp; Annual plans are available when enabled by School Admin.
              </Text>
            </View>

            <View style={styles.modeTabsRow}>
              {/* Monthly Tab — Always Available */}
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => handleSelectStructureMode('monthly')}
                style={[
                  styles.modeTab,
                  structureMode === 'monthly' && styles.modeTabActive,
                ]}
              >
                <Ionicons
                  name="calendar-outline"
                  size={18}
                  color={structureMode === 'monthly' ? '#FFFFFF' : '#1E5BD8'}
                />
                <Text
                  style={[
                    styles.modeTabTitle,
                    structureMode === 'monthly' && styles.modeTabTitleActive,
                  ]}
                >
                  Monthly
                </Text>
                <Text
                  style={[
                    styles.modeTabSub,
                    structureMode === 'monthly' && styles.modeTabSubActive,
                  ]}
                >
                  Opens 25th Monthly
                </Text>
              </TouchableOpacity>

              {/* Quarterly Tab — Only available if Admin created a Quarterly plan */}
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => handleSelectStructureMode('quarterly')}
                style={[
                  styles.modeTab,
                  structureMode === 'quarterly' && styles.modeTabActive,
                  !hasQuarterlyPlan && styles.modeTabDisabled,
                ]}
              >
                <Ionicons
                  name={hasQuarterlyPlan ? 'grid-outline' : 'lock-closed-outline'}
                  size={18}
                  color={
                    structureMode === 'quarterly'
                      ? '#FFFFFF'
                      : hasQuarterlyPlan
                        ? '#1E5BD8'
                        : '#94A3B8'
                  }
                />
                <Text
                  style={[
                    styles.modeTabTitle,
                    structureMode === 'quarterly' && styles.modeTabTitleActive,
                    !hasQuarterlyPlan && styles.modeTabTitleDisabled,
                  ]}
                >
                  Quarterly
                </Text>
                <Text
                  style={[
                    styles.modeTabSub,
                    structureMode === 'quarterly' && styles.modeTabSubActive,
                  ]}
                >
                  {hasQuarterlyPlan ? '4 Quarters (Q1–Q4)' : 'Admin Plan Required'}
                </Text>
              </TouchableOpacity>

              {/* Annually Tab — Only available if Admin created an Annual plan */}
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => handleSelectStructureMode('annually')}
                style={[
                  styles.modeTab,
                  structureMode === 'annually' && styles.modeTabActive,
                  !hasAnnualPlan && styles.modeTabDisabled,
                ]}
              >
                <Ionicons
                  name={hasAnnualPlan ? 'ribbon-outline' : 'lock-closed-outline'}
                  size={18}
                  color={
                    structureMode === 'annually'
                      ? '#FFFFFF'
                      : hasAnnualPlan
                        ? '#1E5BD8'
                        : '#94A3B8'
                  }
                />
                <Text
                  style={[
                    styles.modeTabTitle,
                    structureMode === 'annually' && styles.modeTabTitleActive,
                    !hasAnnualPlan && styles.modeTabTitleDisabled,
                  ]}
                >
                  Annually
                </Text>
                <Text
                  style={[
                    styles.modeTabSub,
                    structureMode === 'annually' && styles.modeTabSubActive,
                  ]}
                >
                  {hasAnnualPlan ? 'Full Year Plan' : 'Admin Plan Required'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── FEE CARDS ── */}
          <Text style={[styles.sectionTitle, { marginTop: SPACING.xs }]}>
            {structureMode === 'monthly'
              ? 'Monthly Fee Schedule'
              : structureMode === 'quarterly'
                ? 'Quarterly Fee Schedule'
                : 'Annual Fee Statement'}
          </Text>

          {feesLoading ? (
            <MobileInlineSkeleton rows={4} />
          ) : fees.length === 0 ? (
            <View style={styles.emptyWrap}>
              <EmptyState
                icon="cash-outline"
                title="No fee records"
                subtitle="Fee statements will appear here once published."
              />
            </View>
          ) : (
            <View style={styles.feesList}>
              {fees.map((fee) => {
                const plan = computeInstallmentPlan(
                  fee,
                  structureMode,
                  sessionPaidCounts[fee.id] || 0
                );
                const isFullyPaid = fee.status === 'paid' || Number(fee.remaining_amount) <= 0;
                const hasAnyPaid = Number(fee.paid_amount) > 0 || fee.status === 'paid';
                const pct =
                  Number(fee.amount) > 0
                    ? Math.min(
                        100,
                        Math.round((Number(fee.paid_amount) / Number(fee.amount)) * 100)
                      )
                    : 0;

                return (
                  <View key={fee.id} style={styles.feeCard}>
                    {/* Header: Fee Type & Status Badge */}
                    <View style={styles.feeHeaderRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.feeTypeTitle}>{fee.fee_type}</Text>
                        <Text style={styles.feeDueSub}>
                          {isFullyPaid
                            ? 'Paid in Full'
                            : `${plan.currentPeriodLabel} · Due: ${formatDate(fee.due_date)}`}
                        </Text>
                      </View>

                      <View
                        style={[
                          styles.statusBadge,
                          {
                            backgroundColor: isFullyPaid
                              ? '#ECFDF5'
                              : fee.status === 'partially_paid'
                                ? '#EBF2FE'
                                : '#FFFBEB',
                            borderColor: isFullyPaid
                              ? '#A7F3D0'
                              : fee.status === 'partially_paid'
                                ? '#BFD6FB'
                                : '#FDE68A',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusBadgeText,
                            {
                              color: isFullyPaid
                                ? '#059669'
                                : fee.status === 'partially_paid'
                                  ? '#1E5BD8'
                                  : '#D97706',
                            },
                          ]}
                        >
                          {isFullyPaid
                            ? 'PAID'
                            : `${plan.paidPeriods}/${plan.totalPeriods} PAID`}
                        </Text>
                      </View>
                    </View>

                    {/* Amount Breakdown */}
                    <View style={styles.amountBreakdownRow}>
                      <View style={styles.amountCol}>
                        <Text style={styles.amountColLabel}>Total Fee</Text>
                        <Text style={styles.amountColVal}>{formatCurrency(fee.amount)}</Text>
                      </View>

                      <View style={styles.amountCol}>
                        <Text style={styles.amountColLabel}>Paid</Text>
                        <Text style={[styles.amountColVal, { color: '#059669' }]}>
                          {formatCurrency(fee.paid_amount)}
                        </Text>
                      </View>

                      <View style={styles.amountCol}>
                        <Text style={styles.amountColLabel}>Remaining</Text>
                        <Text
                          style={[
                            styles.amountColVal,
                            { color: fee.remaining_amount > 0 ? '#DC2626' : '#64748B' },
                          ]}
                        >
                          {formatCurrency(fee.remaining_amount)}
                        </Text>
                      </View>
                    </View>

                    {/* ── MONTHLY PROGRESSIVE CHIPS WITH 25th DATE WINDOW ── */}
                    {structureMode === 'monthly' && (
                      <View style={styles.scheduleBox}>
                        <View style={styles.scheduleHeaderRow}>
                          <Text style={styles.scheduleTitle}>
                            Monthly Schedule ({plan.paidPeriods} of 12 Paid)
                          </Text>
                          {!isFullyPaid && (
                            <View
                              style={[
                                styles.windowPill,
                                !plan.isPaymentWindowOpen && styles.windowPillLocked,
                              ]}
                            >
                              <Ionicons
                                name={
                                  plan.isPaymentWindowOpen
                                    ? 'lock-open-outline'
                                    : 'lock-closed-outline'
                                }
                                size={11}
                                color={plan.isPaymentWindowOpen ? '#1E5BD8' : '#D97706'}
                              />
                              <Text
                                style={[
                                  styles.windowPillText,
                                  !plan.isPaymentWindowOpen && { color: '#B45309' },
                                ]}
                              >
                                {plan.isPaymentWindowOpen
                                  ? `${MONTH_ORDER[plan.currentPeriodIndex]} Window Open`
                                  : `Opens on 25th`}
                              </Text>
                            </View>
                          )}
                        </View>

                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.monthChipsRow}
                        >
                          {MONTH_ORDER.map((month, idx) => {
                            const isMonthPaid = idx < plan.paidPeriods || isFullyPaid;
                            const isCurrentDue = !isFullyPaid && idx === plan.currentPeriodIndex;

                            return (
                              <TouchableOpacity
                                key={month}
                                disabled={
                                  isMonthPaid || !isCurrentDue || !plan.isPaymentWindowOpen
                                }
                                onPress={() => setSelectedFeeToPay(fee)}
                                activeOpacity={0.8}
                                style={[
                                  styles.monthChip,
                                  isMonthPaid
                                    ? styles.monthChipPaid
                                    : isCurrentDue && plan.isPaymentWindowOpen
                                      ? styles.monthChipCurrent
                                      : isCurrentDue && !plan.isPaymentWindowOpen
                                        ? styles.monthChipLockedWindow
                                        : styles.monthChipUpcoming,
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.monthChipText,
                                    isMonthPaid
                                      ? styles.monthChipTextPaid
                                      : isCurrentDue && plan.isPaymentWindowOpen
                                        ? styles.monthChipTextCurrent
                                        : isCurrentDue && !plan.isPaymentWindowOpen
                                          ? { color: '#B45309' }
                                          : styles.monthChipTextUpcoming,
                                  ]}
                                >
                                  {MONTH_ABBR[month]}
                                </Text>
                                {isMonthPaid && (
                                  <Ionicons
                                    name="checkmark-circle"
                                    size={12}
                                    color="#059669"
                                    style={{ marginLeft: 3 }}
                                  />
                                )}
                                {isCurrentDue && !plan.isPaymentWindowOpen && (
                                  <Ionicons
                                    name="time-outline"
                                    size={11}
                                    color="#D97706"
                                    style={{ marginLeft: 3 }}
                                  />
                                )}
                              </TouchableOpacity>
                            );
                          })}
                        </ScrollView>

                        <Text style={styles.nextUpHint}>{plan.windowStatusText}</Text>
                      </View>
                    )}

                    {/* ── QUARTERLY PROGRESSIVE CHIPS ── */}
                    {structureMode === 'quarterly' && (
                      <View style={styles.scheduleBox}>
                        <View style={styles.scheduleHeaderRow}>
                          <Text style={styles.scheduleTitle}>
                            Quarterly Schedule ({plan.paidPeriods} of 4 Paid)
                          </Text>
                        </View>

                        <View style={styles.quarterGrid}>
                          {QUARTERS.map((q, idx) => {
                            const isQPaid = idx < plan.paidPeriods || isFullyPaid;
                            const isCurrentQ = !isFullyPaid && idx === plan.currentPeriodIndex;

                            return (
                              <TouchableOpacity
                                key={q.id}
                                disabled={isQPaid || !isCurrentQ}
                                onPress={() => setSelectedFeeToPay(fee)}
                                activeOpacity={0.8}
                                style={[
                                  styles.quarterChip,
                                  isQPaid
                                    ? styles.monthChipPaid
                                    : isCurrentQ
                                      ? styles.monthChipCurrent
                                      : styles.monthChipUpcoming,
                                ]}
                              >
                                <View
                                  style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                  }}
                                >
                                  <Text
                                    style={[
                                      styles.quarterChipTitle,
                                      isQPaid
                                        ? styles.monthChipTextPaid
                                        : isCurrentQ
                                          ? styles.monthChipTextCurrent
                                          : styles.monthChipTextUpcoming,
                                    ]}
                                  >
                                    {q.short}
                                  </Text>
                                  {isQPaid && (
                                    <Ionicons name="checkmark-circle" size={14} color="#059669" />
                                  )}
                                </View>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    )}

                    {/* Progress bar */}
                    <View style={styles.progressBarWrap}>
                      <View style={[styles.progressBarFill, { width: `${pct}%` }]} />
                    </View>

                    {/* Action Buttons: Pay + Official Receipt */}
                    <View style={styles.actionsRow}>
                      {!isFullyPaid && (
                        <Button
                          label={plan.isPaymentWindowOpen
                            ? `Pay ${plan.currentPeriodLabel} (${formatCurrency(plan.installmentAmount)})`
                            : `${plan.currentPeriodLabel} Opens on 25th`}
                          icon={plan.isPaymentWindowOpen ? 'card-outline' : 'lock-closed-outline'}
                          size="lg"
                          fullWidth
                          disabled={!plan.isPaymentWindowOpen}
                          onPress={() => setSelectedFeeToPay(fee)}
                        />
                      )}

                      {hasAnyPaid && (
                        <Button
                          label="View Receipt"
                          variant="outline"
                          icon="receipt-outline"
                          size="lg"
                          fullWidth
                          onPress={() => setReceiptFee(fee)}
                        />
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          <View style={{ height: SPACING.xxl }} />
        </RefreshScrollView>

        {/* ── MODAL 1: PAY FEE INSTALLMENT ── */}
        <Modal
          visible={!!selectedFeeToPay}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setSelectedFeeToPay(null)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalBox}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Fee Payment</Text>
                <TouchableOpacity onPress={() => setSelectedFeeToPay(null)}>
                  <Ionicons name="close" size={22} color="#64748B" />
                </TouchableOpacity>
              </View>

              {selectedFeeToPay && activeModalPlan && (
                <>
                  <View style={styles.modalSummaryBox}>
                    <View style={styles.modalPeriodBadge}>
                      <Text style={styles.modalPeriodBadgeText}>
                        {activeModalPlan.currentPeriodLabel.toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.modalFeeType}>{selectedFeeToPay.fee_type}</Text>
                    <Text style={styles.modalFeeAmount}>
                      {formatCurrency(activeModalPlan.installmentAmount)}
                    </Text>
                    {activeModalPlan.nextPeriodLabel && (
                      <Text style={styles.modalNextPeriodText}>
                        Next installment ({activeModalPlan.nextPeriodLabel}) opens from the 25th
                      </Text>
                    )}
                  </View>

                  {(() => {
                    const c = onlineCharges(activeModalPlan.installmentAmount);
                    return (
                      <View style={styles.breakdownBox}>
                        <View style={styles.breakdownRow}><Text style={styles.breakdownLabel}>Fee</Text><Text style={styles.breakdownValue}>{formatCurrency(c.fee)}</Text></View>
                        <View style={styles.breakdownRow}><Text style={styles.breakdownLabel}>Convenience fee (2%)</Text><Text style={styles.breakdownValue}>{formatCurrency(c.convenience)}</Text></View>
                        <View style={styles.breakdownRow}><Text style={styles.breakdownLabel}>GST (18% on convenience fee)</Text><Text style={styles.breakdownValue}>{formatCurrency(c.gst)}</Text></View>
                        <View style={[styles.breakdownRow, styles.breakdownTotalRow]}><Text style={styles.breakdownTotal}>Total</Text><Text style={styles.breakdownTotal}>{formatCurrency(c.total)}</Text></View>
                        <Text style={styles.breakdownHint}>Pay by UPI, card or net banking on the secure Razorpay page. No extra charge at the school office.</Text>
                      </View>
                    );
                  })()}
                  {onlineEnabled === false && (
                    <Text style={styles.breakdownWarn}>Online payment isn't enabled by the school yet. Please pay at the school office.</Text>
                  )}

                  <View style={styles.modalActionsRow}>
                    <Button
                      label="Cancel"
                      variant="ghost"
                      onPress={() => setSelectedFeeToPay(null)}
                      style={{ flex: 1 }}
                    />
                    <Button
                      label={
                        processingPayment
                          ? 'Processing...'
                          : `Pay ${formatCurrency(onlineCharges(activeModalPlan.installmentAmount).total)}`
                      }
                      variant="primary"
                      loading={processingPayment}
                      onPress={handleConfirmPay}
                      style={{ flex: 1.6 }}
                    />
                  </View>
                </>
              )}
            </View>
          </View>
        </Modal>

        {/* ── FEE RECEIPT (cash & online) ── */}
        <ReceiptSheet
          fee={receiptFee}
          onClose={() => setReceiptFee(null)}
          school={receiptSchool}
          student={receiptStudent}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  content: { flex: 1, backgroundColor: 'transparent' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: SPACING.md, paddingTop: SPACING.xs },

  childSelectSection: { marginBottom: SPACING.sm },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.2,
    marginBottom: 8,
  },
  childChipsScroll: { flexDirection: 'row', gap: 8 },
  childChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  childChipActive: { backgroundColor: '#EBF2FE', borderColor: '#1E5BD8' },
  childChipName: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  childChipNameActive: { color: '#1E5BD8' },
  childChipSub: { fontSize: 11, color: '#94A3B8', marginTop: 1 },
  childChipSubActive: { color: '#1A4FC4' },

  singleChildBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EBF2FE',
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: '#DCE8FD',
  },
  singleChildDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#1E5BD8', marginRight: 8 },
  singleChildText: { fontSize: 12, fontWeight: '600', color: '#1544AE' },

  statsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: SPACING.md,
  },
  statsRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  statItem: { flex: 1, alignItems: 'center' },
  statVal: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  statLabel: { fontSize: 11, color: '#64748B', marginTop: 2, fontWeight: '600' },
  statDivider: { width: 1, backgroundColor: '#F1F5F9', height: 28 },

  structureSelectorCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    marginBottom: SPACING.md,
  },
  structureHeaderRow: { marginBottom: 12 },
  structureTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  structureSub: { fontSize: 11, color: '#64748B', marginTop: 2, lineHeight: 16 },
  modeTabsRow: { flexDirection: 'row', gap: 8 },
  modeTab: {
    flex: 1,
    backgroundColor: '#F5F7FA',
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  modeTabActive: {
    backgroundColor: '#0B1736',
    borderColor: '#0B1736',
  },
  modeTabDisabled: {
    backgroundColor: '#F5F7FA',
    borderColor: '#E2E8F0',
    opacity: 0.65,
  },
  modeTabTitle: { fontSize: 12.5, fontWeight: '700', color: '#0F172A', marginTop: 4 },
  modeTabTitleActive: { color: '#FFFFFF' },
  modeTabTitleDisabled: { color: '#64748B' },
  modeTabSub: { fontSize: 9, fontWeight: '600', color: '#64748B', marginTop: 1, textAlign: 'center' },
  modeTabSubActive: { color: '#DCE8FD' },

  emptyWrap: { marginTop: 40 },
  feesList: { gap: 12 },
  feeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  feeHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  feeTypeTitle: { flexShrink: 1, fontSize: 15, fontWeight: '700', color: '#0F172A' },
  feeDueSub: { fontSize: 11, color: '#475569', fontWeight: '600', marginTop: 2 },
  statusBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  statusBadgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },

  amountBreakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F5F7FA',
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginVertical: SPACING.sm,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  amountCol: { alignItems: 'center' },
  amountColLabel: { fontSize: 10, color: '#94A3B8', fontWeight: '700', marginBottom: 2 },
  amountColVal: { fontSize: 14, fontWeight: '700', color: '#0F172A' },

  scheduleBox: {
    backgroundColor: '#F5F7FA',
    borderRadius: RADIUS.md,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
  },
  scheduleHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  scheduleTitle: { flexShrink: 1, fontSize: 11, fontWeight: '700', color: '#334155' },
  windowPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EBF2FE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
  },
  windowPillLocked: {
    backgroundColor: '#FFFBEB',
  },
  windowPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1E5BD8',
  },
  monthChipsRow: { flexDirection: 'row', gap: 6, paddingBottom: 4 },
  monthChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    borderWidth: 1.5,
  },
  monthChipPaid: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  monthChipCurrent: {
    backgroundColor: '#1E5BD8',
    borderColor: '#1A4FC4',
  },
  monthChipLockedWindow: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  monthChipUpcoming: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
  },
  monthChipText: { fontSize: 11, fontWeight: '700' },
  monthChipTextPaid: { color: '#065F46' },
  monthChipTextCurrent: { color: '#FFFFFF' },
  monthChipTextUpcoming: { color: '#94A3B8' },
  nextUpHint: {
    fontSize: 11,
    color: '#475569',
    marginTop: 6,
    lineHeight: 16,
  },

  quarterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  quarterChip: {
    width: '48%',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1.5,
  },
  quarterChipTitle: { fontSize: 11, fontWeight: '700' },

  progressBarWrap: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F1F5F9',
    marginTop: 2,
    marginBottom: 10,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 3,
  },

  actionsRow: {
    gap: 8,
  },


  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    padding: SPACING.md,
  },
  modalBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  modalTitle: { flexShrink: 1, fontSize: 17, fontWeight: '700', color: '#0F172A' },
  modalSummaryBox: {
    alignItems: 'center',
    backgroundColor: '#F5F7FA',
    borderRadius: RADIUS.lg,
    paddingVertical: 16,
    paddingHorizontal: 12,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalPeriodBadge: {
    backgroundColor: '#EBF2FE',
    borderWidth: 1,
    borderColor: '#BFD6FB',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    marginBottom: 6,
  },
  modalPeriodBadgeText: { fontSize: 10, fontWeight: '700', color: '#1E5BD8', letterSpacing: 0.4 },
  modalFeeType: { fontSize: 13, color: '#334155', fontWeight: '700' },
  breakdownBox: { borderWidth: 1, borderColor: '#E5E9F0', borderRadius: 14, padding: 12, marginBottom: 12 },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, gap: 8 },
  breakdownLabel: { flexShrink: 1, fontSize: 13, color: '#64748B' },
  breakdownValue: { fontSize: 13, color: '#0F172A', fontWeight: '600' },
  breakdownTotalRow: { borderTopWidth: 1, borderTopColor: '#F1F4F8', marginTop: 4, paddingTop: 8 },
  breakdownTotal: { fontSize: 14, color: '#0F172A', fontWeight: '700' },
  breakdownHint: { fontSize: 11, color: '#94A3B8', marginTop: 6 },
  breakdownWarn: { fontSize: 12, color: '#B45309', backgroundColor: '#FEF3E0', borderRadius: 10, padding: 10, marginBottom: 12 },
  pendingCard: { backgroundColor: '#FEF3E0', borderRadius: 14, padding: 12, marginBottom: 12 },
  pendingTitle: { fontSize: 14, fontWeight: '700', color: '#B45309' },
  pendingText: { fontSize: 12, color: '#92400E', marginTop: 2 },
  pendingActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  modalFeeAmount: { fontSize: 22, fontWeight: '700', color: '#1E5BD8', marginTop: 4 },
  modalNextPeriodText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#059669',
    marginTop: 6,
    textAlign: 'center',
  },
  modalActionsRow: { flexDirection: 'row', gap: 10, marginTop: SPACING.lg },

  // Receipt Modal Styles
});
