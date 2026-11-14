import React, { useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const pad = (n: number) => String(n).padStart(2, '0');
export const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const WEEK = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export interface CalendarPickerProps {
  visible: boolean;
  /** 'single' picks one day; 'range' picks a start and an end day. */
  mode: 'single' | 'range';
  from: string | null;
  to: string | null;
  /** Earliest selectable date (YYYY-MM-DD). */
  minDate?: string;
  /** Returns a reason when a day is an off-day (Sunday / holiday); shown greyed. */
  offDay?: (iso: string) => string | null;
  title?: string;
  onClose: () => void;
  onConfirm: (from: string, to: string) => void;
}

/** Bottom-sheet calendar used for leave dates. Pure JS, works in Expo Go. */
export function CalendarPicker({ visible, mode, from, to, minDate, offDay, title, onClose, onConfirm }: CalendarPickerProps) {
  const insets = useSafeAreaInsets();
  const start = from ?? minDate ?? isoOf(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  const [cursor, setCursor] = useState({ y: Number(start.slice(0, 4)), m: Number(start.slice(5, 7)) - 1 });
  const [selFrom, setSelFrom] = useState<string | null>(from);
  const [selTo, setSelTo] = useState<string | null>(to);

  useEffect(() => {
    if (!visible) return;
    setSelFrom(from);
    setSelTo(to);
    const s = from ?? minDate ?? start;
    setCursor({ y: Number(s.slice(0, 4)), m: Number(s.slice(5, 7)) - 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const cells = useMemo(() => {
    const first = new Date(cursor.y, cursor.m, 1).getDay();
    const days = new Date(cursor.y, cursor.m + 1, 0).getDate();
    return [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)] as (number | null)[];
  }, [cursor]);

  const minMonth = minDate ? { y: Number(minDate.slice(0, 4)), m: Number(minDate.slice(5, 7)) - 1 } : null;
  const canPrev = !minMonth || cursor.y > minMonth.y || (cursor.y === minMonth.y && cursor.m > minMonth.m);
  const shift = (n: number) => setCursor(c => {
    const d = new Date(c.y, c.m + n, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  const pick = (iso: string) => {
    if (mode === 'single') { setSelFrom(iso); setSelTo(iso); return; }
    if (!selFrom || (selFrom && selTo) || iso < selFrom) { setSelFrom(iso); setSelTo(null); return; }
    setSelTo(iso);
  };

  const ready = mode === 'single' ? !!selFrom : !!selFrom;
  const summary = !selFrom ? (mode === 'range' ? 'Tap the first day, then the last day' : 'Tap a day')
    : !selTo || selTo === selFrom ? fmtLong(selFrom)
    : `${fmtLong(selFrom)} – ${fmtLong(selTo)}`;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close calendar" />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.grabber} />
        <Text style={styles.title}>{title ?? 'Select date'}</Text>
        <Text style={styles.summary} numberOfLines={1}>{summary}</Text>

        <View style={styles.monthRow}>
          <TouchableOpacity onPress={() => shift(-1)} disabled={!canPrev} style={[styles.navBtn, !canPrev && { opacity: 0.3 }]} accessibilityLabel="Previous month">
            <Ionicons name="chevron-back" size={18} color="#0F172A" />
          </TouchableOpacity>
          <Text style={styles.monthText}>
            {new Date(cursor.y, cursor.m, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
          </Text>
          <TouchableOpacity onPress={() => shift(1)} style={styles.navBtn} accessibilityLabel="Next month">
            <Ionicons name="chevron-forward" size={18} color="#0F172A" />
          </TouchableOpacity>
        </View>

        <View style={styles.grid}>
          {WEEK.map((w, i) => <Text key={i} style={styles.weekday}>{w}</Text>)}
          {cells.map((d, i) => {
            if (d === null) return <View key={`e${i}`} style={styles.cell} />;
            const iso = isoOf(cursor.y, cursor.m, d);
            const disabled = !!minDate && iso < minDate;
            const off = offDay?.(iso) ?? null;
            const isEdge = iso === selFrom || iso === selTo;
            const inRange = !!selFrom && !!selTo && iso > selFrom && iso < selTo;
            return (
              <TouchableOpacity key={iso} style={styles.cell} disabled={disabled} onPress={() => pick(iso)}
                accessibilityLabel={`${fmtLong(iso)}${off ? `, ${off}` : ''}`} accessibilityState={{ disabled, selected: isEdge }}>
                <View style={[styles.day, inRange && styles.dayInRange, isEdge && styles.daySelected]}>
                  <Text style={[
                    styles.dayText,
                    off && !isEdge && styles.dayOff,
                    disabled && styles.dayDisabled,
                    inRange && styles.dayInRangeText,
                    isEdge && styles.daySelectedText,
                  ]}>{d}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.hint}>Grey days are Sundays or holidays and are not counted as leave.</Text>

        <View style={styles.actions}>
          <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={onClose}>
            <Text style={styles.btnGhostText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnPrimary, !ready && { opacity: 0.5 }]} disabled={!ready}
            onPress={() => { if (selFrom) onConfirm(selFrom, selTo ?? selFrom); }}>
            <Text style={styles.btnPrimaryText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export function fmtLong(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.35)' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 18, paddingTop: 8 },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#E2E8F0', marginBottom: 12 },
  title: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  summary: { fontSize: 13, color: '#5B6EE8', fontWeight: '600', marginTop: 2, marginBottom: 12 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  navBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#F4F5FB', alignItems: 'center', justifyContent: 'center' },
  monthText: { fontSize: 15, fontWeight: '600', color: '#0F172A' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: `${100 / 7}%`, textAlign: 'center', fontSize: 11, fontWeight: '600', color: '#94A3B8', paddingVertical: 6 },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, padding: 2 },
  day: { flex: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontSize: 14, color: '#0F172A', fontWeight: '500' },
  dayOff: { color: '#CBD5E1' },
  dayDisabled: { color: '#E2E8F0' },
  dayInRange: { backgroundColor: '#EEF0FD' },
  dayInRangeText: { color: '#3B4DC8' },
  daySelected: { backgroundColor: '#5B6EE8' },
  daySelectedText: { color: '#FFFFFF', fontWeight: '700' },
  hint: { fontSize: 11, color: '#94A3B8', marginTop: 8 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btn: { flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnGhost: { backgroundColor: '#F4F5FB' },
  btnGhostText: { fontSize: 14, fontWeight: '600', color: '#64748B' },
  btnPrimary: { backgroundColor: '#5B6EE8' },
  btnPrimaryText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
});
