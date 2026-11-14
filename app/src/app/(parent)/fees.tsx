import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

import { Header } from '@/components/layout/Header';
import {
  fetchParentByUserId,
  fetchParentStudents,
  fetchFees,
  updateFee,
  fetchSchool,
} from '@/services/api';
import { SPACING, RADIUS, formatDate, formatCurrency } from '@/lib/utils';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { MobileListSkeleton, MobileInlineSkeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/context/AuthContext';
import type { Student, Fee, School } from '@/types';

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
  const [paymentMethod, setPaymentMethod] = useState<'upi' | 'card' | 'netbanking'>('upi');
  const [processingPayment, setProcessingPayment] = useState(false);

  // Official Receipt modal state
  const [receiptFee, setReceiptFee] = useState<Fee | null>(null);
  const [lastPaidInstallmentAmount, setLastPaidInstallmentAmount] = useState<number | null>(null);

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
      Alert.alert(
        'Quarterly Plan Not Available',
        'Quarterly payment option is only available when the school administrator creates a Quarterly Fee Plan.'
      );
      return;
    }
    if (mode === 'annually' && !hasAnnualPlan) {
      Alert.alert(
        'Annual Plan Not Available',
        'Annual payment option is only available when the school administrator creates an Annual Fee Plan.'
      );
      return;
    }
    setStructureMode(mode);
  };

  const handleConfirmPay = async () => {
    if (!selectedFeeToPay || !activeModalPlan) return;
    setProcessingPayment(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const receiptNo = `RCP-${Math.floor(100000 + Math.random() * 900000)}`;

      const payNowAmount = activeModalPlan.installmentAmount;
      const newPaidAmount = Math.min(
        Number(selectedFeeToPay.amount),
        Number(selectedFeeToPay.paid_amount) + payNowAmount
      );
      const newRemaining = Math.max(0, Number(selectedFeeToPay.amount) - newPaidAmount);
      const newStatus = newRemaining <= 0 ? 'paid' : 'partially_paid';
      const nextDueDate =
        newRemaining > 0
          ? addMonthsToDate(selectedFeeToPay.due_date, activeModalPlan.monthsToAdvance)
          : selectedFeeToPay.due_date;
      const methodLabel = `Online (${paymentMethod.toUpperCase()})`;

      await updateFee(selectedFeeToPay.id, {
        paid_amount: newPaidAmount,
        remaining_amount: newRemaining,
        status: newStatus,
        due_date: nextDueDate,
        payment_date: today,
        payment_method: methodLabel,
        receipt_number: receiptNo,
      });

      setSessionPaidCounts((prev) => ({
        ...prev,
        [selectedFeeToPay.id]: (prev[selectedFeeToPay.id] || 0) + 1,
      }));

      const updatedFeeObj: Fee = {
        ...selectedFeeToPay,
        paid_amount: newPaidAmount,
        remaining_amount: newRemaining,
        status: newStatus,
        due_date: nextDueDate,
        payment_date: today,
        payment_method: methodLabel,
        receipt_number: receiptNo,
      };

      setSelectedFeeToPay(null);
      setLastPaidInstallmentAmount(payNowAmount);
      setReceiptFee(updatedFeeObj);

      if (children[selectedIndex]) {
        await loadFees(children[selectedIndex]);
      }
    } catch {
      Alert.alert('Payment Failed', 'Could not process payment.');
    } finally {
      setProcessingPayment(false);
    }
  };

  const handleShareReceipt = async (fee: Fee) => {
    const sName = schoolData?.name || authSchool?.name || 'School';
    const stuName = selectedChild?.student.full_name || 'Student';
    const clsName = selectedChild
      ? `${selectedChild.className} - Section ${selectedChild.sectionName}`
      : '';
    const admNo = selectedChild?.student.admission_number || '—';
    const receiptNo =
      fee.receipt_number || `RCP-${fee.id.slice(0, 6).toUpperCase()}`;
    const pDate = formatDate(fee.payment_date || fee.updated_at || new Date().toISOString());
    const pMethod = fee.payment_method || 'Cash (School Office)';

    const text = [
      `================================`,
      `${sName.toUpperCase()}`,
      `OFFICIAL FEE PAYMENT RECEIPT`,
      `================================`,
      `Receipt No : ${receiptNo}`,
      `Date       : ${pDate}`,
      `Student    : ${stuName}`,
      `Class      : ${clsName}`,
      `Adm No.    : ${admNo}`,
      `--------------------------------`,
      `Fee Type   : ${fee.fee_type}`,
      `Total Fee  : ${formatCurrency(fee.amount)}`,
      `Amount Paid: ${formatCurrency(lastPaidInstallmentAmount ?? fee.paid_amount)}`,
      `Total Paid : ${formatCurrency(fee.paid_amount)}`,
      `Balance Due: ${formatCurrency(fee.remaining_amount)}`,
      `Pay Mode   : ${pMethod}`,
      `Status     : ${Number(fee.remaining_amount) <= 0 ? 'PAID IN FULL' : 'PARTIALLY PAID'}`,
      `================================`,
    ].join('\n');

    try {
      await Share.share({ message: text, title: `Fee Receipt ${receiptNo}` });
    } catch {
      // ignore
    }
  };

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

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#5B6EE8"
              colors={['#5B6EE8']}
            />
          }
        >
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
                  color={structureMode === 'monthly' ? '#FFFFFF' : '#5B6EE8'}
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
                        ? '#5B6EE8'
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
                        ? '#5B6EE8'
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
                                ? '#EEF0FD'
                                : '#FFFBEB',
                            borderColor: isFullyPaid
                              ? '#A7F3D0'
                              : fee.status === 'partially_paid'
                                ? '#C7CDFB'
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
                                  ? '#5B6EE8'
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
                                color={plan.isPaymentWindowOpen ? '#5B6EE8' : '#D97706'}
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
                        <TouchableOpacity
                          disabled={!plan.isPaymentWindowOpen}
                          onPress={() => setSelectedFeeToPay(fee)}
                          activeOpacity={0.85}
                          style={[
                            styles.payNowBtn,
                            !plan.isPaymentWindowOpen && styles.payNowBtnDisabled,
                          ]}
                        >
                          <Ionicons
                            name={
                              plan.isPaymentWindowOpen
                                ? 'card-outline'
                                : 'lock-closed-outline'
                            }
                            size={16}
                            color="#FFFFFF"
                            style={{ marginRight: 6 }}
                          />
                          <Text style={styles.payNowBtnText}>
                            {plan.isPaymentWindowOpen
                              ? `Pay ${plan.currentPeriodLabel} (${formatCurrency(plan.installmentAmount)})`
                              : `${plan.currentPeriodLabel} Opens on 25th`}
                          </Text>
                        </TouchableOpacity>
                      )}

                      {hasAnyPaid && (
                        <TouchableOpacity
                          onPress={() => {
                            setLastPaidInstallmentAmount(null);
                            setReceiptFee(fee);
                          }}
                          activeOpacity={0.8}
                          style={styles.receiptBtn}
                        >
                          <Ionicons name="receipt-outline" size={16} color="#5B6EE8" />
                          <Text style={styles.receiptBtnText}>View Receipt</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          <View style={{ height: SPACING.xxl }} />
        </ScrollView>

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

                  <Text style={styles.modalSelectPayTitle}>Select Payment Method</Text>

                  <View style={styles.payMethodsWrap}>
                    {[
                      { id: 'upi', label: 'UPI / Google Pay / PhonePe', icon: 'phone-portrait-outline' },
                      { id: 'card', label: 'Debit / Credit Card', icon: 'card-outline' },
                      { id: 'netbanking', label: 'Net Banking', icon: 'business-outline' },
                    ].map((pm) => {
                      const active = paymentMethod === pm.id;
                      return (
                        <TouchableOpacity
                          key={pm.id}
                          onPress={() => setPaymentMethod(pm.id as typeof paymentMethod)}
                          style={[styles.payMethodOption, active && styles.payMethodOptionActive]}
                        >
                          <Ionicons
                            name={pm.icon as keyof typeof Ionicons.glyphMap}
                            size={18}
                            color={active ? '#5B6EE8' : '#64748B'}
                            style={{ marginRight: 10 }}
                          />
                          <Text
                            style={[styles.payMethodText, active && styles.payMethodTextActive]}
                          >
                            {pm.label}
                          </Text>
                          {active && (
                            <Ionicons
                              name="checkmark-circle"
                              size={18}
                              color="#5B6EE8"
                              style={{ marginLeft: 'auto' }}
                            />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>

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
                          : `Pay ${formatCurrency(activeModalPlan.installmentAmount)}`
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

        {/* ── MODAL 2: OFFICIAL FEE PAYMENT RECEIPT (FOR BOTH ADMIN CASH & APP ONLINE PAYMENTS) ── */}
        <Modal
          visible={!!receiptFee}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setReceiptFee(null)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.receiptModalBox}>
              {receiptFee && (
                <>
                  {/* Receipt Header */}
                  <View style={styles.receiptSchoolHeader}>
                    <View style={styles.receiptVerifiedIcon}>
                      <Ionicons name="checkmark-done-circle" size={32} color="#059669" />
                    </View>
                    <Text style={styles.receiptSchoolName}>
                      {schoolData?.name || authSchool?.name || 'School'}
                    </Text>
                    {schoolData?.address ? (
                      <Text style={styles.receiptSchoolAddress} numberOfLines={1}>
                        {schoolData.address}
                      </Text>
                    ) : null}
                    <View style={styles.officialReceiptBadge}>
                      <Text style={styles.officialReceiptBadgeText}>
                        OFFICIAL FEE PAYMENT RECEIPT
                      </Text>
                    </View>
                  </View>

                  {/* Receipt No & Date Row */}
                  <View style={styles.receiptMetaRow}>
                    <View>
                      <Text style={styles.receiptMetaLabel}>RECEIPT NO.</Text>
                      <Text style={styles.receiptMetaValue}>
                        {receiptFee.receipt_number ||
                          `RCP-${receiptFee.id.slice(0, 6).toUpperCase()}`}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.receiptMetaLabel}>PAYMENT DATE</Text>
                      <Text style={styles.receiptMetaValue}>
                        {formatDate(
                          receiptFee.payment_date ||
                            receiptFee.updated_at ||
                            new Date().toISOString()
                        )}
                      </Text>
                    </View>
                  </View>

                  {/* Student Details */}
                  <View style={styles.receiptStudentBox}>
                    <View style={styles.receiptDetailRow}>
                      <Text style={styles.receiptDetailKey}>Student Name</Text>
                      <Text style={styles.receiptDetailVal}>
                        {selectedChild?.student.full_name || 'Student'}
                      </Text>
                    </View>
                    <View style={styles.receiptDetailRow}>
                      <Text style={styles.receiptDetailKey}>Class &amp; Section</Text>
                      <Text style={styles.receiptDetailVal}>
                        {selectedChild
                          ? `${selectedChild.className} - Sec ${selectedChild.sectionName}`
                          : '—'}
                      </Text>
                    </View>
                    <View style={styles.receiptDetailRow}>
                      <Text style={styles.receiptDetailKey}>Admission No.</Text>
                      <Text style={styles.receiptDetailVal}>
                        {selectedChild?.student.admission_number || '—'}
                      </Text>
                    </View>
                    <View style={styles.receiptDetailRow}>
                      <Text style={styles.receiptDetailKey}>Payment Mode</Text>
                      <View style={styles.paymentModePill}>
                        <Text style={styles.paymentModePillText}>
                          {receiptFee.payment_method || 'Cash (School Office)'}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Fee Breakdown Table */}
                  <View style={styles.receiptTable}>
                    <View style={styles.receiptTableRow}>
                      <Text style={styles.receiptTableKey}>Fee Description</Text>
                      <Text style={styles.receiptTableVal}>{receiptFee.fee_type}</Text>
                    </View>
                    <View style={styles.receiptTableRow}>
                      <Text style={styles.receiptTableKey}>Total Fee Amount</Text>
                      <Text style={styles.receiptTableVal}>
                        {formatCurrency(receiptFee.amount)}
                      </Text>
                    </View>
                    {lastPaidInstallmentAmount !== null && (
                      <View style={styles.receiptTableRow}>
                        <Text style={styles.receiptTableKey}>Current Installment Paid</Text>
                        <Text style={[styles.receiptTableVal, { color: '#5B6EE8' }]}>
                          {formatCurrency(lastPaidInstallmentAmount)}
                        </Text>
                      </View>
                    )}
                    <View style={styles.receiptTableRow}>
                      <Text style={styles.receiptTableKey}>Total Amount Paid</Text>
                      <Text style={[styles.receiptTableVal, { color: '#059669', fontSize: 15 }]}>
                        {formatCurrency(receiptFee.paid_amount)}
                      </Text>
                    </View>
                    <View style={[styles.receiptTableRow, { borderBottomWidth: 0 }]}>
                      <Text style={styles.receiptTableKey}>Remaining Balance</Text>
                      <Text
                        style={[
                          styles.receiptTableVal,
                          {
                            color:
                              Number(receiptFee.remaining_amount) > 0 ? '#DC2626' : '#059669',
                          },
                        ]}
                      >
                        {formatCurrency(receiptFee.remaining_amount)}
                      </Text>
                    </View>
                  </View>

                  {/* Paid Stamp */}
                  <View style={styles.paidStampBar}>
                    <Ionicons name="shield-checkmark" size={16} color="#059669" />
                    <Text style={styles.paidStampText}>
                      PAYMENT VERIFIED ·{' '}
                      {Number(receiptFee.remaining_amount) <= 0
                        ? 'PAID IN FULL'
                        : 'INSTALLMENT PAID'}
                    </Text>
                  </View>

                  {/* Receipt Actions */}
                  <View style={styles.modalActionsRow}>
                    <Button
                      label="Close"
                      variant="ghost"
                      onPress={() => setReceiptFee(null)}
                      style={{ flex: 1 }}
                    />
                    <Button
                      label="Share / Download Receipt"
                      variant="primary"
                      onPress={() => handleShareReceipt(receiptFee)}
                      style={{ flex: 1.6 }}
                    />
                  </View>
                </>
              )}
            </View>
          </View>
        </Modal>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F5FB' },
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
  childChipActive: { backgroundColor: '#EEF0FD', borderColor: '#5B6EE8' },
  childChipName: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  childChipNameActive: { color: '#5B6EE8' },
  childChipSub: { fontSize: 11, color: '#94A3B8', marginTop: 1 },
  childChipSubActive: { color: '#4B5DD8' },

  singleChildBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF0FD',
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: '#DFE3FC',
  },
  singleChildDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#5B6EE8', marginRight: 8 },
  singleChildText: { fontSize: 12, fontWeight: '600', color: '#3B4DC8' },

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
    backgroundColor: '#F4F5FB',
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  modeTabActive: {
    backgroundColor: '#5B6EE8',
    borderColor: '#5B6EE8',
  },
  modeTabDisabled: {
    backgroundColor: '#F4F5FB',
    borderColor: '#E2E8F0',
    opacity: 0.65,
  },
  modeTabTitle: { fontSize: 12.5, fontWeight: '700', color: '#0F172A', marginTop: 4 },
  modeTabTitleActive: { color: '#FFFFFF' },
  modeTabTitleDisabled: { color: '#64748B' },
  modeTabSub: { fontSize: 9, fontWeight: '600', color: '#64748B', marginTop: 1, textAlign: 'center' },
  modeTabSubActive: { color: '#DFE3FC' },

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
  feeTypeTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
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
    backgroundColor: '#F4F5FB',
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
    backgroundColor: '#F4F5FB',
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
  scheduleTitle: { fontSize: 11, fontWeight: '700', color: '#334155' },
  windowPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EEF0FD',
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
    color: '#5B6EE8',
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
    backgroundColor: '#5B6EE8',
    borderColor: '#4B5DD8',
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
  payNowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#5B6EE8',
    borderRadius: RADIUS.md,
    paddingVertical: 11,
  },
  payNowBtnDisabled: {
    backgroundColor: '#94A3B8',
  },
  payNowBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },

  receiptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#EEF0FD',
    borderWidth: 1,
    borderColor: '#C7CDFB',
    borderRadius: RADIUS.md,
    paddingVertical: 10,
  },
  receiptBtnText: {
    color: '#5B6EE8',
    fontSize: 13,
    fontWeight: '700',
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
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  modalSummaryBox: {
    alignItems: 'center',
    backgroundColor: '#F4F5FB',
    borderRadius: RADIUS.lg,
    paddingVertical: 16,
    paddingHorizontal: 12,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalPeriodBadge: {
    backgroundColor: '#EEF0FD',
    borderWidth: 1,
    borderColor: '#C7CDFB',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    marginBottom: 6,
  },
  modalPeriodBadgeText: { fontSize: 10, fontWeight: '700', color: '#5B6EE8', letterSpacing: 0.4 },
  modalFeeType: { fontSize: 13, color: '#334155', fontWeight: '700' },
  modalFeeAmount: { fontSize: 22, fontWeight: '700', color: '#5B6EE8', marginTop: 4 },
  modalNextPeriodText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#059669',
    marginTop: 6,
    textAlign: 'center',
  },
  modalSelectPayTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  payMethodsWrap: { gap: 8 },
  payMethodOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  payMethodOptionActive: {
    backgroundColor: '#EEF0FD',
    borderColor: '#5B6EE8',
  },
  payMethodText: { fontSize: 13, fontWeight: '600', color: '#0F172A' },
  payMethodTextActive: { color: '#5B6EE8', fontWeight: '700' },
  modalActionsRow: { flexDirection: 'row', gap: 10, marginTop: SPACING.lg },

  // Receipt Modal Styles
  receiptModalBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  receiptSchoolHeader: {
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingBottom: 12,
    marginBottom: 12,
  },
  receiptVerifiedIcon: {
    marginBottom: 4,
  },
  receiptSchoolName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
  },
  receiptSchoolAddress: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    textAlign: 'center',
  },
  officialReceiptBadge: {
    marginTop: 8,
    backgroundColor: '#EEF0FD',
    borderWidth: 1,
    borderColor: '#C7CDFB',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
  },
  officialReceiptBadgeText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#5B6EE8',
    letterSpacing: 0.5,
  },
  receiptMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  receiptMetaLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 0.4,
  },
  receiptMetaValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 2,
  },
  receiptStudentBox: {
    backgroundColor: '#F4F5FB',
    borderRadius: RADIUS.md,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 7,
    marginBottom: 12,
  },
  receiptDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  receiptDetailKey: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  receiptDetailVal: {
    fontSize: 12.5,
    color: '#0F172A',
    fontWeight: '700',
  },
  paymentModePill: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
  },
  paymentModePillText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#065F46',
  },
  receiptTable: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    marginBottom: 12,
  },
  receiptTableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  receiptTableKey: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  receiptTableVal: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '700',
  },
  paidStampBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: RADIUS.md,
    paddingVertical: 9,
  },
  paidStampText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#065F46',
    letterSpacing: 0.4,
  },
});
