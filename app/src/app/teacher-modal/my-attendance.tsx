import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Alert, ActivityIndicator, RefreshControl,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Header } from '@/components/layout/Header';
import { GlassCard } from '@/components/ui/GlassCard';
import { CalendarPicker, fmtLong, isoOf } from '@/components/ui/CalendarPicker';
import { COLORS, SPACING } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import {
  fetchTeacherByUserId, markMyAttendance, fetchMyStaffAttendance, applyLeave, fetchMyLeaves, cancelMyLeave,
  fetchHolidays, type StaffAttendanceRow, type StaffLeave,
} from '@/services/api';

const localISO = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return localISO(d); };
const fmt = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const time12 = (t: string | null) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

type Status = StaffAttendanceRow['status'];
const STATUS: Record<Status, { label: string; color: string; bg: string }> = {
  present: { label: 'Present', color: '#FFFFFF', bg: '#22C08A' },
  late: { label: 'Late', color: '#FFFFFF', bg: '#F59E0B' },
  half_day: { label: 'Half day', color: '#FFFFFF', bg: '#8B5CF6' },
  leave: { label: 'Leave', color: '#FFFFFF', bg: '#0EA5E9' },
  absent: { label: 'Absent', color: '#FFFFFF', bg: '#EF4444' },
};
const LEAVE: Record<StaffLeave['status'], { label: string; color: string; bg: string }> = {
  pending: { label: 'Pending', color: '#B45309', bg: '#FEF3E0' },
  approved: { label: 'Approved', color: '#15803D', bg: '#E6F8F1' },
  rejected: { label: 'Rejected', color: '#C53030', bg: '#FEECEC' },
  cancelled: { label: 'Cancelled', color: '#64748B', bg: '#F1F5F9' },
};

export default function MyAttendanceScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const today = localISO();
  const tomorrow = addDays(today, 1);

  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [cursor, setCursor] = useState({ y: new Date().getFullYear(), m: new Date().getMonth() });
  const [rows, setRows] = useState<StaffAttendanceRow[]>([]);
  const [todayRow, setTodayRow] = useState<StaffAttendanceRow | null>(null);
  const [leaves, setLeaves] = useState<StaffLeave[]>([]);
  const [holidays, setHolidays] = useState<Map<string, string>>(new Map());
  const [working, setWorking] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [marking, setMarking] = useState(false);

  const [type, setType] = useState<'full_day' | 'half_day'>('full_day');
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [applying, setApplying] = useState(false);

  const monthDays = useMemo(() => new Date(cursor.y, cursor.m + 1, 0).getDate(), [cursor]);
  const monthFrom = isoOf(cursor.y, cursor.m, 1);
  const monthTo = isoOf(cursor.y, cursor.m, monthDays);

  // Teacher, holidays, leave list, today's row.
  const loadBase = useCallback(async () => {
    if (!user?.id) return;
    const t = await fetchTeacherByUserId(user.id);
    if (!t) return;
    setTeacherId(t.id);
    const [l, h, todayRows] = await Promise.all([
      fetchMyLeaves(t.id),
      fetchHolidays(t.school_id).catch(() => []),
      fetchMyStaffAttendance(t.id, today, today),
    ]);
    setLeaves(l);
    setHolidays(new Map(h.filter(x => x.type !== 'working').map(x => [x.date, x.label ?? 'Holiday'])));
    setWorking(new Set(h.filter(x => x.type === 'working').map(x => x.date)));
    setTodayRow(todayRows[0] ?? null);
  }, [user?.id, today]);

  const loadMonth = useCallback(async () => {
    if (!teacherId) return;
    setRows(await fetchMyStaffAttendance(teacherId, monthFrom, monthTo).catch(() => []));
  }, [teacherId, monthFrom, monthTo]);

  useEffect(() => { loadBase().catch(() => {}).finally(() => setLoading(false)); }, [loadBase]);
  useEffect(() => { loadMonth(); }, [loadMonth]);

  const refresh = async () => { setRefreshing(true); await Promise.all([loadBase().catch(() => {}), loadMonth()]); setRefreshing(false); };

  const offDay = useCallback((iso: string) => {
    if (holidays.has(iso)) return holidays.get(iso)!;
    if (working.has(iso)) return null;
    return new Date(iso + 'T00:00:00').getDay() === 0 ? 'Sunday' : null;
  }, [holidays, working]);

  const byDate = useMemo(() => Object.fromEntries(rows.map(r => [r.attendance_date, r])), [rows]);
  const counts = useMemo(() => rows.reduce((m, r) => ({ ...m, [r.status]: (m[r.status] ?? 0) + 1 }), {} as Record<string, number>), [rows]);

  const workingDaysInRange = useMemo(() => {
    if (!from) return 0;
    const end = type === 'half_day' ? from : (to ?? from);
    let n = 0;
    for (let d = from; d <= end; d = addDays(d, 1)) if (!offDay(d)) n++;
    return n;
  }, [from, to, type, offDay]);

  const mark = async (checkOut: boolean) => {
    setMarking(true);
    try {
      const r = await markMyAttendance(checkOut);
      setTodayRow(r);
      loadMonth();
    } catch (e) {
      Alert.alert('Could not mark', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setMarking(false);
    }
  };

  const submit = async () => {
    if (!from) { Alert.alert('Pick a date', 'Tap the date box to choose your leave days.'); return; }
    const end = type === 'half_day' ? from : (to ?? from);
    if (from < tomorrow) { Alert.alert('Too late', 'Leave must be applied at least one day in advance.'); return; }
    if (workingDaysInRange === 0) { Alert.alert('No working days', 'The selected days are all Sundays or holidays.'); return; }
    if (!reason.trim()) { Alert.alert('Reason needed', 'Please add a short reason.'); return; }
    setApplying(true);
    try {
      await applyLeave(type, from, end, reason.trim());
      Alert.alert('Request sent', 'The office will review your leave.');
      setReason(''); setFrom(null); setTo(null); setType('full_day');
      loadBase().catch(() => {});
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
        try { await cancelMyLeave(l.id); refresh(); } catch (e) { Alert.alert('Could not cancel', e instanceof Error ? e.message : ''); }
      } },
    ]);
  };

  const shiftMonth = (n: number) => setCursor(c => { const d = new Date(c.y, c.m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const atCurrentMonth = cursor.y === new Date().getFullYear() && cursor.m === new Date().getMonth();
  const firstDow = new Date(cursor.y, cursor.m, 1).getDay();
  const todayOff = offDay(today);

  const dateLabel = !from ? 'Choose date' : type === 'half_day' || !to || to === from ? fmtLong(from) : `${fmtLong(from)} – ${fmtLong(to)}`;

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <Header title="My Attendance" showBack onBackPress={() => router.back()} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={COLORS.primary} />}>
          {loading ? <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} /> : !teacherId ? (
            <Text style={styles.muted}>Teacher profile not found.</Text>
          ) : (
            <>
              {/* Today */}
              <GlassCard padding={SPACING.md} style={styles.card}>
                <Text style={styles.muted}>{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
                <View style={styles.todayRow}>
                  <View style={styles.flex}>
                    <Text style={styles.todayStatus} numberOfLines={1}>
                      {todayRow ? STATUS[todayRow.status].label : todayOff ? `${todayOff} · no school` : 'Not marked yet'}
                    </Text>
                    {todayRow?.check_in ? (
                      <Text style={styles.todayTime} numberOfLines={1}>
                        In {time12(todayRow.check_in)}{todayRow.check_out ? ` · Out ${time12(todayRow.check_out)}` : ''}
                      </Text>
                    ) : null}
                  </View>
                  {!todayRow && !todayOff && (
                    <TouchableOpacity style={styles.primaryBtn} onPress={() => mark(false)} disabled={marking} activeOpacity={0.85}>
                      {marking ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.primaryBtnText}>Mark present</Text>}
                    </TouchableOpacity>
                  )}
                  {todayRow && todayRow.status !== 'leave' && todayRow.check_in && !todayRow.check_out && (
                    <TouchableOpacity style={styles.outlineBtn} onPress={() => mark(true)} disabled={marking} activeOpacity={0.85}>
                      <Text style={styles.outlineBtnText}>Check out</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </GlassCard>

              {/* Month calendar */}
              <GlassCard padding={SPACING.md} style={styles.card}>
                <View style={styles.monthRow}>
                  <TouchableOpacity onPress={() => shiftMonth(-1)} style={styles.navBtn} accessibilityLabel="Previous month">
                    <Ionicons name="chevron-back" size={18} color={COLORS.text} />
                  </TouchableOpacity>
                  <Text style={styles.monthText}>{new Date(cursor.y, cursor.m, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</Text>
                  <TouchableOpacity onPress={() => shiftMonth(1)} disabled={atCurrentMonth} style={[styles.navBtn, atCurrentMonth && { opacity: 0.3 }]} accessibilityLabel="Next month">
                    <Ionicons name="chevron-forward" size={18} color={COLORS.text} />
                  </TouchableOpacity>
                </View>
                <View style={styles.grid}>
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((w, i) => <Text key={i} style={styles.weekday}>{w}</Text>)}
                  {Array.from({ length: firstDow }).map((_, i) => <View key={`e${i}`} style={styles.cell} />)}
                  {Array.from({ length: monthDays }, (_, i) => {
                    const iso = isoOf(cursor.y, cursor.m, i + 1);
                    const r = byDate[iso];
                    const off = offDay(iso);
                    return (
                      <View key={iso} style={styles.cell}>
                        <View style={[styles.day, r ? { backgroundColor: STATUS[r.status].bg } : off ? styles.dayOff : null, iso === today && styles.dayToday]}>
                          <Text style={[styles.dayText, r ? { color: STATUS[r.status].color, fontWeight: '700' } : off ? styles.dayOffText : iso > today ? styles.dayFuture : null]}>
                            {i + 1}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
                <View style={styles.legend}>
                  {(Object.keys(STATUS) as Status[]).map(k => (
                    <View key={k} style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: STATUS[k].bg }]} />
                      <Text style={styles.legendText} numberOfLines={1}>{STATUS[k].label} {counts[k] ?? 0}</Text>
                    </View>
                  ))}
                </View>
              </GlassCard>

              {/* Apply leave */}
              <GlassCard padding={SPACING.md} style={styles.card}>
                <Text style={styles.sectionTitle}>Apply for leave</Text>
                <Text style={styles.hint}>At least one day in advance. The office approves it.</Text>

                <View style={styles.segment}>
                  {(['full_day', 'half_day'] as const).map(v => (
                    <TouchableOpacity key={v} style={[styles.segmentItem, type === v && styles.segmentActive]}
                      onPress={() => { setType(v); if (v === 'half_day') setTo(from); }}
                      accessibilityRole="button" accessibilityState={{ selected: type === v }}>
                      <Text style={[styles.segmentText, type === v && styles.segmentTextActive]}>{v === 'full_day' ? 'Full day' : 'Half day'}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.label}>{type === 'half_day' ? 'Date' : 'Dates'}</Text>
                <TouchableOpacity style={styles.dateBox} onPress={() => setPickerOpen(true)} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Choose leave dates">
                  <Ionicons name="calendar-outline" size={18} color={from ? '#5B6EE8' : COLORS.textLight} />
                  <Text style={[styles.dateText, !from && { color: COLORS.textLight }]} numberOfLines={1}>{dateLabel}</Text>
                  <Ionicons name="chevron-down" size={16} color={COLORS.textLight} />
                </TouchableOpacity>
                {from && (
                  <Text style={styles.hint}>
                    {type === 'half_day' ? 'Half day' : `${workingDaysInRange} working day${workingDaysInRange === 1 ? '' : 's'}`}
                    {type === 'full_day' && workingDaysInRange > 0 ? ' (Sundays & holidays not counted)' : ''}
                  </Text>
                )}

                <Text style={styles.label}>Reason</Text>
                <TextInput style={styles.input} value={reason} onChangeText={setReason}
                  placeholder="e.g. Family function" placeholderTextColor={COLORS.textLight} multiline maxLength={300} />

                <TouchableOpacity style={[styles.primaryBtn, styles.fullBtn]} onPress={submit} disabled={applying} activeOpacity={0.85}>
                  {applying ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.primaryBtnText}>Send request</Text>}
                </TouchableOpacity>
              </GlassCard>

              {/* My requests */}
              <Text style={[styles.sectionTitle, { marginBottom: SPACING.sm }]}>My leave requests</Text>
              {leaves.length === 0 ? (
                <GlassCard padding={SPACING.md} style={styles.card}><Text style={styles.muted}>No leave requests yet.</Text></GlassCard>
              ) : leaves.map(l => (
                <GlassCard key={l.id} padding={SPACING.md} style={styles.reqCard}>
                  <View style={styles.reqRow}>
                    <View style={styles.flex}>
                      <Text style={styles.reqTitle} numberOfLines={1}>
                        {l.leave_type === 'half_day' ? `Half day · ${fmt(l.from_date)}` : `${fmt(l.from_date)}${l.to_date !== l.from_date ? ` – ${fmt(l.to_date)}` : ''}`}
                      </Text>
                      <Text style={styles.reqMeta} numberOfLines={2}>
                        {l.leave_type === 'full_day' ? `${l.days} day${Number(l.days) === 1 ? '' : 's'} · ` : ''}{l.reason}
                      </Text>
                      {l.review_note ? <Text style={styles.reqNote} numberOfLines={2}>Office: {l.review_note}</Text> : null}
                    </View>
                    <View style={styles.reqSide}>
                      <View style={[styles.pill, { backgroundColor: LEAVE[l.status].bg }]}>
                        <Text style={[styles.pillText, { color: LEAVE[l.status].color }]}>{LEAVE[l.status].label}</Text>
                      </View>
                      {(l.status === 'pending' || l.status === 'approved') && l.from_date > today && (
                        <TouchableOpacity onPress={() => confirmCancel(l)} hitSlop={8}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
                      )}
                    </View>
                  </View>
                </GlassCard>
              ))}
            </>
          )}
          <View style={{ height: 32 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <CalendarPicker
        visible={pickerOpen}
        mode={type === 'half_day' ? 'single' : 'range'}
        from={from}
        to={to}
        minDate={tomorrow}
        offDay={offDay}
        title={type === 'half_day' ? 'Half day leave' : 'Leave dates'}
        onClose={() => setPickerOpen(false)}
        onConfirm={(f, t) => { setFrom(f); setTo(t); setPickerOpen(false); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  flex: { flex: 1, minWidth: 0 },
  content: { padding: SPACING.md },
  card: { marginBottom: SPACING.md },
  muted: { color: COLORS.textMuted, fontSize: 13 },
  hint: { color: COLORS.textLight, fontSize: 12, marginTop: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },

  todayRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  todayStatus: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  todayTime: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  primaryBtn: { backgroundColor: '#5B6EE8', borderRadius: 12, height: 40, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },
  outlineBtn: { borderWidth: 1, borderColor: '#5B6EE8', borderRadius: 12, height: 40, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  outlineBtnText: { color: '#5B6EE8', fontWeight: '600', fontSize: 14 },
  fullBtn: { marginTop: SPACING.md },

  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  navBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#F4F5FB', alignItems: 'center', justifyContent: 'center' },
  monthText: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: `${100 / 7}%`, textAlign: 'center', fontSize: 11, fontWeight: '600', color: COLORS.textLight, paddingVertical: 6 },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, padding: 3 },
  day: { flex: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontSize: 13, color: COLORS.text },
  dayOff: { backgroundColor: '#F4F5FB' },
  dayOffText: { color: '#CBD5E1' },
  dayFuture: { color: '#CBD5E1' },
  dayToday: { borderWidth: 2, borderColor: '#5B6EE8' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10, borderTopWidth: 1, borderTopColor: '#F1F2F8', paddingTop: 10, rowGap: 6 },
  legendItem: { width: '33.33%', flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 3 },
  legendText: { fontSize: 12, color: COLORS.textMuted, flexShrink: 1 },

  segment: { flexDirection: 'row', backgroundColor: '#F4F5FB', borderRadius: 12, padding: 3, marginTop: SPACING.md },
  segmentItem: { flex: 1, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  segmentActive: { backgroundColor: '#FFFFFF', shadowColor: '#5B6EE8', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 1 },
  segmentText: { fontSize: 13, color: COLORS.textMuted, fontWeight: '500' },
  segmentTextActive: { color: COLORS.text, fontWeight: '600' },
  label: { fontSize: 12, color: COLORS.textMuted, marginTop: SPACING.md, marginBottom: 6, fontWeight: '500' },
  dateBox: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 44, borderRadius: 12, borderWidth: 1, borderColor: '#E8EAF3', paddingHorizontal: 12, backgroundColor: '#FFFFFF' },
  dateText: { flex: 1, fontSize: 14, color: COLORS.text, fontWeight: '500' },
  input: { borderWidth: 1, borderColor: '#E8EAF3', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: COLORS.text, backgroundColor: '#FFFFFF', minHeight: 64, textAlignVertical: 'top' },

  reqCard: { marginBottom: SPACING.sm },
  reqRow: { flexDirection: 'row', gap: 12 },
  reqTitle: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  reqMeta: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  reqNote: { fontSize: 12, color: COLORS.textLight, marginTop: 2, fontStyle: 'italic' },
  reqSide: { alignItems: 'flex-end', gap: 8 },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { fontSize: 11, fontWeight: '700' },
  cancelText: { fontSize: 12, color: '#DC2626', fontWeight: '600' },
});
