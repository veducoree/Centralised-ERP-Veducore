import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

import { Header } from '@/components/layout/Header';
import {
  fetchParentByUserId,
  fetchParentStudents,
  fetchSchoolTransportData,
  applyForTransport,
} from '@/services/api';
import { SPACING, RADIUS, formatCurrency } from '@/lib/utils';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { MobileListSkeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/context/AuthContext';
import { useTabNavigation } from '@/context/TabNavigationContext';
import type {
  Student,
  TransportBus,
  TransportStop,
  StudentTransportAssignment,
} from '@/types';
import { appAlert } from '@/components/ui/AppDialog';
import { RefreshScrollView } from '@/components/ui/RefreshScrollView';

interface ChildInfo {
  student: Student;
  className: string;
  sectionName: string;
}

export default function ParentTransport() {
  const { user, profile } = useAuth();
  const { setActiveTab } = useTabNavigation();

  const [children, setChildren] = useState<ChildInfo[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [buses, setBuses] = useState<TransportBus[]>([]);
  const [stops, setStops] = useState<TransportStop[]>([]);
  const [assignments, setAssignments] = useState<Record<string, StudentTransportAssignment>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Application selection state
  const [selectedBusFilter, setSelectedBusFilter] = useState<string>('all');
  const [selectedStopId, setSelectedStopId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const loadTransport = useCallback(async () => {
    if (!user?.id) return;
    try {
      const parent = await fetchParentByUserId(user.id);
      let childInfos: ChildInfo[] = [];
      if (parent) {
        const links = await fetchParentStudents(parent.id);
        childInfos = links.map((link) => {
          const student = link.student;
          return {
            student,
            className: student?.class?.name ?? 'Class',
            sectionName: student?.section?.name ?? '',
          };
        });
        setChildren(childInfos);
      }

      const schoolId = profile?.school_id || childInfos[0]?.student?.school_id;
      if (schoolId) {
        const tData = await fetchSchoolTransportData(schoolId);
        setBuses(tData.buses || []);
        setStops(tData.stops || []);
        setAssignments(tData.assignments || {});
      }
    } catch (err) {
      console.error('Parent transport load error:', err);
    }
  }, [user?.id, profile?.school_id]);

  useEffect(() => {
    loadTransport().finally(() => setLoading(false));
  }, [loadTransport]);

  const selectedChild = children[selectedIndex] ?? null;
  const childAssignment = selectedChild ? assignments[selectedChild.student.id] : undefined;

  useEffect(() => {
    if (childAssignment?.stop_id) {
      setSelectedStopId(childAssignment.stop_id);
    } else if (stops.length > 0 && !selectedStopId) {
      setSelectedStopId(stops[0].id);
    }
  }, [childAssignment?.stop_id, stops, selectedStopId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadTransport();
    setRefreshing(false);
  }, [loadTransport]);

  const filteredStops = useMemo(() => {
    if (selectedBusFilter === 'all') return stops;
    return stops.filter(
      (s) => s.bus_id === selectedBusFilter || s.bus_number === selectedBusFilter
    );
  }, [stops, selectedBusFilter]);

  const selectedStopObj = useMemo(
    () => stops.find((s) => s.id === selectedStopId) || null,
    [stops, selectedStopId]
  );

  const vLabel = (t?: string) => (t === 'van' ? 'Van' : 'Bus');
  const per = (p?: string) => `/${(p || 'Monthly').toLowerCase().replace('ly', '')}`;
  const isClosed = childAssignment?.status === 'rejected' || childAssignment?.status === 'stopped';

  const handleApplyTransport = async () => {
    if (!selectedChild) return;
    if (!selectedStopObj) {
      appAlert('Select Stop', 'Please select a stop to apply for transport.');
      return;
    }

    const schoolId = profile?.school_id || selectedChild.student.school_id;
    if (!schoolId) return;

    setSubmitting(true);
    try {
      const payload: StudentTransportAssignment = {
        student_id: selectedChild.student.id,
        student_name: selectedChild.student.full_name,
        class_name: selectedChild.className,
        section_name: selectedChild.sectionName,
        bus_id: selectedStopObj.bus_id,
        bus_number: selectedStopObj.bus_number,
        route_name: selectedStopObj.route_name,
        stop_id: selectedStopObj.id,
        stop_name: selectedStopObj.stop_name,
        area_landmark: selectedStopObj.area_landmark,
        amount: selectedStopObj.amount,
        pickup_time: selectedStopObj.pickup_time,
        drop_time: selectedStopObj.drop_time,
        driver_name: selectedStopObj.driver_name,
        driver_phone: selectedStopObj.driver_phone,
        status: 'pending',
        applied_by_parent: true,
        assigned_at: new Date().toISOString(),
      };

      const saved = await applyForTransport(schoolId, payload);
      setAssignments((prev) => ({
        ...prev,
        [selectedChild.student.id]: { ...saved, vehicle_type: selectedStopObj.vehicle_type, fare_period: selectedStopObj.fare_period },
      }));

      appAlert(
        'Transport Application Submitted',
        `Your transport application for ${selectedChild.student.full_name} at "${selectedStopObj.stop_name}" (${formatCurrency(selectedStopObj.amount)}) has been sent to the school admin.`
      );
    } catch (err) {
      appAlert('Error', err instanceof Error ? err.message : 'Could not submit transport application. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar style="dark" />
        <Header title="School Transport" />
        <MobileListSkeleton rows={5} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <Header title="School Transport" />

      <RefreshScrollView refreshing={refreshing} onRefresh={onRefresh}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
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

        {/* ── 1. CURRENT TRANSPORT STATUS FOR CHILD ── */}
        {selectedChild && (
          <View style={styles.assignedCard}>
            <View style={styles.assignedHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <View style={styles.busIconWrap}>
                  <Ionicons name="bus" size={20} color="#2563EB" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.assignedTitle}>
                    {selectedChild.student.full_name}&apos;s Transport Status
                  </Text>
                  <Text style={styles.assignedSub}>
                    {selectedChild.className} · Section {selectedChild.sectionName}
                  </Text>
                </View>
              </View>
              {childAssignment ? (
                <View
                  style={[
                    styles.statusBadge,
                    childAssignment.status === 'pending' || isClosed
                      ? styles.pendingBadge
                      : styles.activeBadge,
                  ]}
                >
                  <Ionicons
                    name={
                      childAssignment.status === 'pending'
                        ? 'time-outline'
                        : 'checkmark-circle'
                    }
                    size={12}
                    color={childAssignment.status === 'pending' ? '#D97706' : '#059669'}
                  />
                  <Text
                    style={[
                      styles.statusBadgeText,
                      {
                        color:
                          childAssignment.status === 'pending' ? '#B45309' : '#065F46',
                      },
                    ]}
                  >
                    {childAssignment.status === 'pending'
                      ? 'Pending Approval'
                      : childAssignment.status === 'rejected'
                        ? 'Not Approved'
                        : childAssignment.status === 'stopped'
                          ? 'Stopped'
                          : 'Active'}
                  </Text>
                </View>
              ) : (
                <View style={styles.inactiveBadge}>
                  <Text style={styles.inactiveBadgeText}>Not Applied</Text>
                </View>
              )}
            </View>

            {childAssignment ? (
              <View style={styles.assignedBody}>
                <View style={styles.assignedRow}>
                  <View style={{ flex: 1 }}>
                    {childAssignment.status === 'rejected' && childAssignment.reject_reason ? (
                      <Text style={[styles.assignedLandmark, { color: '#B91C1C', marginBottom: 6 }]}>
                        Reason from school: {childAssignment.reject_reason}
                      </Text>
                    ) : null}
                    <Text style={styles.assignedLabel}>STOP</Text>
                    <Text style={styles.assignedStopName}>{childAssignment.stop_name}</Text>
                    {childAssignment.area_landmark ? (
                      <Text style={styles.assignedLandmark}>
                        Area: {childAssignment.area_landmark}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.assignedAmountBox}>
                    <Text style={styles.assignedAmountLabel}>TRANSPORT FEE</Text>
                    <Text style={styles.assignedAmountVal}>
                      {formatCurrency(childAssignment.amount)}
                      <Text style={{ fontSize: 11, fontWeight: '500' }}>{per(childAssignment.fare_period)}</Text>
                    </Text>
                  </View>
                </View>

                <View style={styles.assignedMetaGrid}>
                  <View style={styles.assignedMetaItem}>
                    <Ionicons name={childAssignment.vehicle_type === 'van' ? 'car-outline' : 'bus-outline'} size={15} color="#1E5BD8" />
                    <Text style={styles.assignedMetaText}>
                      {vLabel(childAssignment.vehicle_type)} {childAssignment.bus_number || ''}
                      {childAssignment.route_name ? ` · Route: ${childAssignment.route_name}` : ''}
                    </Text>
                  </View>
                  {childAssignment.pickup_time ? (
                    <View style={styles.assignedMetaItem}>
                      <Ionicons name="time-outline" size={15} color="#059669" />
                      <Text style={styles.assignedMetaText}>
                        Pickup: {childAssignment.pickup_time}
                        {childAssignment.drop_time ? ` · Drop: ${childAssignment.drop_time}` : ''}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            ) : (
              <Text style={styles.emptySmall}>
                No stop selected yet. Pick a bus or van stop below and apply for transport.
              </Text>
            )}
          </View>
        )}

        {/* ── 2. APPLY FOR SCHOOL TRANSPORT (SELECT BUS & BUS STOP) ── */}
        <View style={styles.applyCard}>
          <Text style={styles.applyCardTitle}>
            {childAssignment ? 'Change Stop' : 'Apply for School Transport'}
          </Text>
          <Text style={styles.applyCardSub}>
            Select your preferred bus stop below and submit your application. It will be sent directly to the school administration.
          </Text>

          {stops.length === 0 ? (
            <EmptyState
              icon="bus-outline"
              title="No transport stops available"
              subtitle="Bus and van routes will appear here once the school adds them."
            />
          ) : (
            <>
              {/* Bus / Route Filter Chips */}
              {buses.length > 1 && (
                <View style={{ marginBottom: 12 }}>
                  <Text style={styles.fieldLabel}>Filter by Bus / Van</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 8 }}
                  >
                    <TouchableOpacity
                      onPress={() => setSelectedBusFilter('all')}
                      style={[
                        styles.busFilterChip,
                        selectedBusFilter === 'all' && styles.busFilterChipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.busFilterChipText,
                          selectedBusFilter === 'all' && styles.busFilterChipTextActive,
                        ]}
                      >
                        All ({stops.length} Stops)
                      </Text>
                    </TouchableOpacity>
                    {buses.map((b) => {
                      const active = selectedBusFilter === b.id;
                      return (
                        <TouchableOpacity
                          key={b.id}
                          onPress={() => setSelectedBusFilter(b.id)}
                          style={[
                            styles.busFilterChip,
                            active && styles.busFilterChipActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.busFilterChipText,
                              active && styles.busFilterChipTextActive,
                            ]}
                          >
                            {vLabel(b.vehicle_type)} {b.bus_number} · {b.route_name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              <Text style={styles.fieldLabel}>Select Your Stop</Text>
              <View style={styles.stopSelectList}>
                {filteredStops.map((stop, idx) => {
                  const isSelected = selectedStopId === stop.id;
                  const isCurrentApplied = childAssignment?.stop_id === stop.id;
                  return (
                    <TouchableOpacity
                      key={stop.id}
                      onPress={() => setSelectedStopId(stop.id)}
                      activeOpacity={0.8}
                      style={[
                        styles.stopOptionCard,
                        isSelected && styles.stopOptionCardSelected,
                      ]}
                    >
                      <View style={styles.radioOuter}>
                        {isSelected && <View style={styles.radioInner} />}
                      </View>

                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <Text style={styles.stopOptionName}>{stop.stop_name}</Text>
                          {isCurrentApplied && (
                            <View style={styles.currentStopBadge}>
                              <Text style={styles.currentStopBadgeText}>Current</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.stopOptionMeta}>
                          {vLabel(stop.vehicle_type)} {stop.bus_number || ''}
                          {stop.route_name ? ` · ${stop.route_name}` : ''}
                          {stop.stop_order ? ` · Stop #${stop.stop_order}` : ` · Stop #${idx + 1}`}
                        </Text>
                        {(stop.area_landmark || stop.pickup_time) && (
                          <Text style={styles.stopOptionSub}>
                            {stop.area_landmark ? `${stop.area_landmark}` : ''}
                            {stop.area_landmark && stop.pickup_time ? ' · ' : ''}
                            {stop.pickup_time ? `Pickup: ${stop.pickup_time}` : ''}
                          </Text>
                        )}
                      </View>

                      <View style={styles.stopFarePill}>
                        <Text style={styles.stopFareText}>{formatCurrency(stop.amount)}{per(stop.fare_period)}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {selectedStopObj && (
                <View style={styles.selectedSummaryBar}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.selectedSummaryLabel}>Selected Stop</Text>
                    <Text style={styles.selectedSummaryValue}>
                      {selectedStopObj.stop_name} ({vLabel(selectedStopObj.vehicle_type)} {selectedStopObj.bus_number || ''})
                    </Text>
                  </View>
                  <Text style={styles.selectedSummaryFare}>
                    {formatCurrency(selectedStopObj.amount)}
                  </Text>
                </View>
              )}

              <Button
                label={
                  submitting
                    ? 'Submitting Application...'
                    : childAssignment && !isClosed
                      ? childAssignment.status === 'pending' ? 'Update Application' : 'Request Stop Change'
                      : 'Apply for Transport'
                }
                variant="primary"
                loading={submitting}
                onPress={handleApplyTransport}
                style={{ marginTop: 14 }}
              />
            </>
          )}
        </View>

        <View style={{ height: SPACING.xxl }} />
      </RefreshScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: SPACING.md, paddingTop: SPACING.sm },

  childSelectSection: { marginBottom: SPACING.sm },
  sectionTitle: {
    fontSize: 15,
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

  assignedCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: SPACING.md,
  },
  assignedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  busIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  assignedTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  assignedSub: { fontSize: 11, color: '#64748B', marginTop: 1 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
  },
  activeBadge: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  pendingBadge: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  statusBadgeText: { fontSize: 10, fontWeight: '700' },
  inactiveBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
  },
  inactiveBadgeText: { fontSize: 10, fontWeight: '600', color: '#64748B' },
  assignedBody: {
    backgroundColor: '#F5F7FA',
    borderRadius: RADIUS.md,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  assignedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  assignedLabel: { flexShrink: 1, fontSize: 9, fontWeight: '700', color: '#2563EB', letterSpacing: 0.5 },
  assignedStopName: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginTop: 2 },
  assignedLandmark: { fontSize: 11, color: '#475569', marginTop: 2 },
  assignedAmountBox: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    alignItems: 'flex-end',
  },
  assignedAmountLabel: { fontSize: 9, fontWeight: '700', color: '#059669' },
  assignedAmountVal: { fontSize: 15, fontWeight: '700', color: '#065F46', marginTop: 1 },
  assignedMetaGrid: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    gap: 6,
  },
  assignedMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  assignedMetaText: { flexShrink: 1, fontSize: 12, color: '#334155', fontWeight: '600' },

  applyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  applyCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  applyCardSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 3,
    marginBottom: 14,
    lineHeight: 17,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 8,
  },
  busFilterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
    backgroundColor: '#F5F7FA',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  busFilterChipActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  busFilterChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  busFilterChipTextActive: {
    color: '#FFFFFF',
  },
  stopSelectList: {
    gap: 8,
  },
  stopOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F7FA',
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 12,
  },
  stopOptionCardSelected: {
    backgroundColor: '#EFF6FF',
    borderColor: '#2563EB',
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#2563EB',
  },
  stopOptionName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  currentStopBadge: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
  },
  currentStopBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  stopOptionMeta: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
    marginTop: 2,
  },
  stopOptionSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  stopFarePill: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginLeft: 8,
  },
  stopFareText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#059669',
  },
  selectedSummaryBar: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F5F7FA',
    borderWidth: 1,
    borderColor: '#DBEAFE',
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  selectedSummaryLabel: {
    flexShrink: 1,
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  selectedSummaryValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 1,
  },
  selectedSummaryFare: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2563EB',
  },
  emptySmall: { fontSize: 12, color: '#64748B', marginTop: 4, lineHeight: 17 },
});
