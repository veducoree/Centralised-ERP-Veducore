import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Header } from '@/components/layout/Header';
import { GlassCard } from '@/components/ui/GlassCard';
import { COLORS, SPACING, RADIUS } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import {
  fetchTeacherByUserId, markMyAttendance, fetchMyStaffAttendance, applyLeave, fetchMyLeaves, cancelMyLeave,
  type StaffAttendanceRow, type StaffLeave,
} from '@/services/api';

const localISO = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return localISO(d); };
const fmt = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const time12 = (t: string | null) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
const isISO = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(new Date(v + 'T00:00:00').getTime());

const STATUS_LABEL: Record<StaffAttendanceRow['status'], { label: string; color: string }> = {
  present: { label: 'Present', color: '#059669' },
  late: { label: 'Late', color: '#D97706' },
  half_day: { label: 'Half day', color: '#7C3AED' },
  leave: { label: 'On leave', color: '#0284C7' },
  absent: { label: 'Absent', color: '#DC2626' },
};
const LEAVE_COLOR: Record<StaffLeave['status'], string> = {
  pending: '#D97706', approved: '#059669', rejected: '#DC2626', cancelled: '#64748B',
};

export default function MyAttendanceScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const today = localISO();
  const tomorrow = addDays(today, 1);

  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [todayRow, setTodayRow] = useState<StaffAttendanceRow | null>(null);
  const [month, setMonth] = useState<StaffAttendanceRow[]>([]);
  const [leaves, setLeaves] = useState<StaffLeave[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [marking, setMarking] = useState(false);
  const [type, setType] = useState<'full_day' | 'half_day'>('full_day');
  const [from, setFrom] = useState(tomorrow);
  const [to, setTo] = useState(tomorrow);
  const [reason, setReason] = useState('');
  const [applying, setApplying] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    try {
      const t = await fetchTeacherByUserId(user.id);
      if (!t) return;
      setTeacherId(t.id);
      const monthStart = today.slice(0, 8) + '01';
      const [rows, l] = await Promise.all([fetchMyStaffAttendance(t.id, monthStart, today), fetchMyLeaves(t.id)]);
      setMonth(rows);
      setTodayRow(rows.find(r => r.attendance_date === today) ?? null);
      setLeaves(l);
    } catch (err) {
      console.warn('My attendance load failed', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id, today]);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => month.reduce((m, r) => ({ ...m, [r.status]: (m[r.status] ?? 0) + 1 }), {} as Record<string, number>), [month]);

  const mark = async (checkOut: boolean) => {
    setMarking(true);
    try {
      const r = await markMyAttendance(checkOut);
      setTodayRow(r);
      Alert.alert(checkOut ? 'Checked out' : 'Marked present', checkOut ? `At ${time12(r.check_out)}` : `At ${time12(r.check_in)}`);
      load();
    } catch (e) {
      Alert.alert('Could not mark', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setMarking(false);
    }
  };

  const submit = async () => {
    const end = type === 'half_day' ? from : to;
    if (!isISO(from) || !isISO(end)) { Alert.alert('Check the dates', 'Use the format YYYY-MM-DD.'); return; }
    if (from < tomorrow) { Alert.alert('Too late', 'Leave must be applied at least one day in advance.'); return; }
    if (end < from) { Alert.alert('Check the dates', 'End date is before the start date.'); return; }
    if (!reason.trim()) { Alert.alert('Reason needed', 'Please add a reason.'); return; }
    setApplying(true);
    try {
      await applyLeave(type, from, end, reason.trim());
      Alert.alert('Request sent', 'The office will review your leave.');
      setReason(''); setFrom(tomorrow); setTo(tomorrow); setType('full_day');
      load();
    } catch (e) {
      Alert.alert('Could not apply', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setApplying(false);
    }
  };

  const confirmCancel = (l: StaffLeave) => {
    Alert.alert('Cancel leave?', 'If it was approved, those days go back to unmarked.', [
      { text: 'Keep', style: 'cancel' },
      { text: 'Cancel leave', style: 'destructive', onPress: async () => {
        try { await cancelMyLeave(l.id); load(); } catch (e) { Alert.alert('Could not cancel', e instanceof Error ? e.message : ''); }
      } },
    ]);
  };

  const quick = (n: number) => { const d = addDays(today, n); setFrom(d); if (to < d || type === 'half_day') setTo(d); };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <Header title="My Attendance" showBack onBackPress={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={COLORS.primary}
          onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
        {loading ? <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} /> : !teacherId ? (
          <Text style={styles.muted}>Teacher profile not found.</Text>
        ) : (
          <>
            {/* Today */}
            <GlassCard padding={SPACING.md}>
              <Text style={styles.muted}>{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
              {todayRow ? (
                <Text style={[styles.todayStatus, { color: STATUS_LABEL[todayRow.status].color }]}>
                  {STATUS_LABEL[todayRow.status].label}
                  {todayRow.check_in ? <Text style={styles.todayTime}>{`  in ${time12(todayRow.check_in)}`}</Text> : null}
                  {todayRow.check_out ? <Text style={styles.todayTime}>{`  · out ${time12(todayRow.check_out)}`}</Text> : null}
                </Text>
              ) : (
                <Text style={styles.todayStatus}>Not marked yet</Text>
              )}
              {!todayRow && (
                <TouchableOpacity style={styles.primaryBtn} onPress={() => mark(false)} disabled={marking} activeOpacity={0.85}>
                  {marking ? <ActivityIndicator color="#fff" /> : <><Ionicons name="checkmark-circle" size={18} color="#fff" /><Text style={styles.primaryBtnText}>Mark present</Text></>}
                </TouchableOpacity>
              )}
              {todayRow && todayRow.status !== 'leave' && todayRow.check_in && !todayRow.check_out && (
                <TouchableOpacity style={styles.outlineBtn} onPress={() => mark(true)} disabled={marking} activeOpacity={0.85}>
                  <Ionicons name="log-out-outline" size={18} color={COLORS.primary} /><Text style={styles.outlineBtnText}>Check out</Text>
                </TouchableOpacity>
              )}
              <View style={styles.countRow}>
                {(Object.keys(STATUS_LABEL) as StaffAttendanceRow['status'][]).map(k => (
                  <View key={k} style={styles.countItem}>
                    <Text style={[styles.countNum, { color: STATUS_LABEL[k].color }]}>{counts[k] ?? 0}</Text>
                    <Text style={styles.countLabel}>{STATUS_LABEL[k].label}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.hint}>This month so far</Text>
            </GlassCard>

            {/* Apply leave */}
            <GlassCard padding={SPACING.md} style={{ marginTop: SPACING.md }}>
              <Text style={styles.sectionTitle}>Apply for leave</Text>
              <Text style={styles.hint}>At least one day in advance. The office approves it.</Text>
              <View style={styles.segment}>
                {(['full_day', 'half_day'] as const).map(v => (
                  <TouchableOpacity key={v} style={[styles.segmentItem, type === v && styles.segmentActive]} onPress={() => { setType(v); setTo(from); }}>
                    <Text style={[styles.segmentText, type === v && styles.segmentTextActive]}>{v === 'full_day' ? 'Full day(s)' : 'Half day'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.quickRow}>
                {[1, 2, 3, 7].map(n => (
                  <TouchableOpacity key={n} style={[styles.quickChip, from === addDays(today, n) && styles.quickChipActive]} onPress={() => quick(n)}>
                    <Text style={[styles.quickText, from === addDays(today, n) && styles.quickTextActive]}>{n === 1 ? 'Tomorrow' : `+${n} days`}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.dateRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>{type === 'half_day' ? 'Date' : 'From'}</Text>
                  <TextInput style={styles.input} value={from} onChangeText={setFrom} placeholder="YYYY-MM-DD" autoCapitalize="none" />
                </View>
                {type === 'full_day' && (
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>To</Text>
                    <TextInput style={styles.input} value={to} onChangeText={setTo} placeholder="YYYY-MM-DD" autoCapitalize="none" />
                  </View>
                )}
              </View>
              <Text style={styles.label}>Reason</Text>
              <TextInput style={[styles.input, { minHeight: 64, textAlignVertical: 'top' }]} value={reason} onChangeText={setReason}
                placeholder="e.g. Family function" multiline />
              <TouchableOpacity style={styles.primaryBtn} onPress={submit} disabled={applying} activeOpacity={0.85}>
                {applying ? <ActivityIndicator color="#fff" /> : <><Ionicons name="paper-plane" size={16} color="#fff" /><Text style={styles.primaryBtnText}>Send request</Text></>}
              </TouchableOpacity>
            </GlassCard>

            {/* My requests */}
            <Text style={[styles.sectionTitle, { marginTop: SPACING.lg, marginBottom: SPACING.sm }]}>My leave requests</Text>
            {leaves.length === 0 ? <Text style={styles.muted}>No leave requests yet.</Text> : leaves.map(l => (
              <GlassCard key={l.id} padding={SPACING.md} style={{ marginBottom: SPACING.sm }}>
                <View style={styles.leaveRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.leaveTitle}>
                      {l.leave_type === 'half_day' ? `Half day · ${fmt(l.from_date)}` : `${fmt(l.from_date)}${l.to_date !== l.from_date ? ` – ${fmt(l.to_date)}` : ''} · ${l.days} day${Number(l.days) === 1 ? '' : 's'}`}
                    </Text>
                    <Text style={styles.muted} numberOfLines={2}>{l.reason}{l.review_note ? ` · Office: ${l.review_note}` : ''}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <Text style={[styles.leaveStatus, { color: LEAVE_COLOR[l.status] }]}>{l.status.toUpperCase()}</Text>
                    {(l.status === 'pending' || l.status === 'approved') && l.from_date > today && (
                      <TouchableOpacity onPress={() => confirmCancel(l)}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
                    )}
                  </View>
                </View>
              </GlassCard>
            ))}
          </>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.md },
  muted: { color: COLORS.textMuted, fontSize: 13 },
  hint: { color: COLORS.textLight, fontSize: 12, marginTop: 4 },
  todayStatus: { fontSize: 20, fontWeight: '700', color: COLORS.text, marginTop: 4 },
  todayTime: { fontSize: 13, fontWeight: '400', color: COLORS.textMuted },
  primaryBtn: { marginTop: SPACING.md, backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  primaryBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  outlineBtn: { marginTop: SPACING.md, borderWidth: 1, borderColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: 11, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  outlineBtnText: { color: COLORS.primary, fontWeight: '600', fontSize: 15 },
  countRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.borderLight, paddingTop: SPACING.sm },
  countItem: { alignItems: 'center', flex: 1 },
  countNum: { fontSize: 18, fontWeight: '700' },
  countLabel: { fontSize: 10, color: COLORS.textMuted, marginTop: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  segment: { flexDirection: 'row', backgroundColor: COLORS.borderLight, borderRadius: RADIUS.md, padding: 3, marginTop: SPACING.md },
  segmentItem: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: RADIUS.sm },
  segmentActive: { backgroundColor: '#fff' },
  segmentText: { fontSize: 13, color: COLORS.textMuted, fontWeight: '500' },
  segmentTextActive: { color: COLORS.text, fontWeight: '700' },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: SPACING.sm },
  quickChip: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  quickChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  quickText: { fontSize: 12, color: COLORS.textMuted },
  quickTextActive: { color: '#fff', fontWeight: '600' },
  dateRow: { flexDirection: 'row', gap: SPACING.sm },
  label: { fontSize: 12, color: COLORS.textMuted, marginTop: SPACING.sm, marginBottom: 4, fontWeight: '500' },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: COLORS.text, backgroundColor: '#fff' },
  leaveRow: { flexDirection: 'row', gap: SPACING.sm },
  leaveTitle: { fontSize: 14, fontWeight: '600', color: COLORS.text, marginBottom: 2 },
  leaveStatus: { fontSize: 11, fontWeight: '700' },
  cancelText: { fontSize: 12, color: '#DC2626', fontWeight: '600' },
});
