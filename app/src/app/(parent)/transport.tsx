import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

import { Header } from '@/components/layout/Header';
import {
  fetchParentByUserId,
  fetchParentStudents,
  fetchSchoolTransportData,
} from '@/services/api';
import { SPACING, RADIUS, formatCurrency } from '@/lib/utils';
import { MobileListSkeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/context/AuthContext';
import type { Student, StudentTransportAssignment } from '@/types';
import { RefreshScrollView } from '@/components/ui/RefreshScrollView';

interface ChildInfo {
  student: Student;
  className: string;
  sectionName: string;
}

export default function ParentTransport() {
  const { user, profile } = useAuth();

  const [children, setChildren] = useState<ChildInfo[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [assignments, setAssignments] = useState<Record<string, StudentTransportAssignment>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
        setAssignments(tData.assignments || {});
      }
    } catch (err) {
      console.error('Parent transport load error:', err);
    }
  }, [user?.id, profile?.school_id]);

  useEffect(() => {
    loadTransport().finally(() => setLoading(false));
  }, [loadTransport]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadTransport();
    setRefreshing(false);
  }, [loadTransport]);

  const selectedChild = children[selectedIndex] ?? null;
  const rawAssignment = selectedChild ? assignments[selectedChild.student.id] : undefined;
  // Only an approved/active assignment counts as "transport taken"
  const transport =
    rawAssignment && (!rawAssignment.status || rawAssignment.status === 'active' || rawAssignment.status === 'approved')
      ? rawAssignment
      : undefined;

  const vLabel = (t?: string) => (t === 'van' ? 'Van' : 'Bus');
  const per = (p?: string) => `/${(p || 'Monthly').toLowerCase().replace('ly', '')}`;
  const isVan = transport?.vehicle_type === 'van';

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
                      {child.className}{child.sectionName ? ` - ${child.sectionName}` : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {selectedChild && (
          <View style={styles.assignedCard}>
            <View style={styles.assignedHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <View style={styles.busIconWrap}>
                  <Ionicons name={isVan ? 'car' : 'bus'} size={20} color="#2563EB" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.assignedTitle}>
                    {selectedChild.student.full_name}&apos;s Transport
                  </Text>
                  <Text style={styles.assignedSub}>
                    {selectedChild.className}
                    {selectedChild.sectionName ? ` · Section ${selectedChild.sectionName}` : ''}
                  </Text>
                </View>
              </View>
              {transport ? (
                <View style={[styles.statusBadge, styles.activeBadge]}>
                  <Ionicons name="checkmark-circle" size={12} color="#059669" />
                  <Text style={[styles.statusBadgeText, { color: '#065F46' }]}>
                    {vLabel(transport.vehicle_type)}
                  </Text>
                </View>
              ) : (
                <View style={styles.inactiveBadge}>
                  <Text style={styles.inactiveBadgeText}>No Transport</Text>
                </View>
              )}
            </View>

            {transport ? (
              <View style={styles.assignedBody}>
                <View style={styles.vehicleRow}>
                  <Ionicons name={isVan ? 'car-outline' : 'bus-outline'} size={18} color="#1E5BD8" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.assignedLabel}>{vLabel(transport.vehicle_type).toUpperCase()}</Text>
                    <Text style={styles.assignedStopName}>
                      {vLabel(transport.vehicle_type)} {transport.bus_number || ''}
                    </Text>
                    {transport.route_name ? (
                      <Text style={styles.assignedLandmark}>Route: {transport.route_name}</Text>
                    ) : null}
                  </View>
                </View>

                <View style={[styles.assignedRow, styles.sectionDivider]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.assignedLabel}>STOP</Text>
                    <Text style={styles.assignedStopName}>{transport.stop_name}</Text>
                    {transport.area_landmark ? (
                      <Text style={styles.assignedLandmark}>Area: {transport.area_landmark}</Text>
                    ) : null}
                  </View>
                  <View style={styles.assignedAmountBox}>
                    <Text style={styles.assignedAmountLabel}>TRANSPORT FEE</Text>
                    <Text style={styles.assignedAmountVal}>
                      {formatCurrency(transport.amount)}
                      <Text style={{ fontSize: 11, fontWeight: '500' }}>{per(transport.fare_period)}</Text>
                    </Text>
                  </View>
                </View>

                <View style={styles.assignedMetaGrid}>
                  {transport.pickup_time || transport.drop_time ? (
                    <View style={styles.assignedMetaItem}>
                      <Ionicons name="time-outline" size={15} color="#059669" />
                      <Text style={styles.assignedMetaText}>
                        {transport.pickup_time ? `Pickup: ${transport.pickup_time}` : ''}
                        {transport.pickup_time && transport.drop_time ? ' · ' : ''}
                        {transport.drop_time ? `Drop: ${transport.drop_time}` : ''}
                      </Text>
                    </View>
                  ) : null}
                  <View style={styles.assignedMetaItem}>
                    <Ionicons name="person-outline" size={15} color="#475569" />
                    <Text style={styles.assignedMetaText}>
                      Driver: {transport.driver_name || 'School Transport Desk'}
                    </Text>
                  </View>
                  {transport.driver_phone ? (
                    <TouchableOpacity
                      style={styles.assignedMetaItem}
                      onPress={() => Linking.openURL(`tel:${transport.driver_phone}`)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="call-outline" size={15} color="#1E5BD8" />
                      <Text style={[styles.assignedMetaText, { color: '#1E5BD8' }]}>
                        {transport.driver_phone}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            ) : (
              <View style={styles.noTransportBox}>
                <View style={styles.noTransportIcon}>
                  <Ionicons name="bus-outline" size={26} color="#94A3B8" />
                </View>
                <Text style={styles.noTransportTitle}>You have not taken school transport</Text>
                <Text style={styles.noTransportSub}>
                  Please contact the school office if you want to start transport for {selectedChild.student.full_name}.
                </Text>
              </View>
            )}
          </View>
        )}

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
  vehicleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  sectionDivider: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#E2E8F0' },
  noTransportBox: { alignItems: 'center', paddingVertical: 18, paddingHorizontal: 8 },
  noTransportIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noTransportTitle: { fontSize: 14, fontWeight: '700', color: '#334155', marginTop: 10, textAlign: 'center' },
  noTransportSub: { fontSize: 12, color: '#64748B', marginTop: 4, textAlign: 'center', lineHeight: 17 },
  emptySmall: { fontSize: 12, color: '#64748B', marginTop: 4, lineHeight: 17 },
});
