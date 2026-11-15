import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, Modal, ScrollView, StyleSheet, TouchableOpacity, Image, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { fetchFeeReceiptDetails, type ReceiptOnlineCharges, type ReceiptPaymentRow } from '@/services/api';
import {
  type ReceiptData, inr, fmtDate, amountInWords, receiptSummary, printReceipt, downloadReceiptPdf,
} from '@/lib/invoice';
import type { Fee } from '@/types';
import { appAlert } from '@/components/ui/AppDialog';

const ACCENT = '#1E5BD8';

interface Props {
  fee: Fee | null;
  onClose: () => void;
  school: ReceiptData['school'];
  student: ReceiptData['student'] | null;
}

/** Full-screen fee receipt with Download PDF / Print. */
export function ReceiptSheet({ fee, onClose, school, student }: Props) {
  const insets = useSafeAreaInsets();
  const [details, setDetails] = useState<{ payments: ReceiptPaymentRow[]; online: Record<string, ReceiptOnlineCharges> } | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<'pdf' | 'print' | null>(null);
  const [logoFailed, setLogoFailed] = useState(false);

  useEffect(() => {
    if (!fee) return;
    let alive = true;
    setDetails(null);
    setLoading(true);
    fetchFeeReceiptDetails(fee.id)
      .then((d) => { if (alive) setDetails(d); })
      .catch(() => { if (alive) setDetails({ payments: [], online: {} }); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [fee]);

  const data: ReceiptData | null = useMemo(() => {
    if (!fee || !student || !details) return null;
    const payments = details.payments.length
      ? details.payments
      : Number(fee.paid_amount) > 0
        ? [{ id: fee.id, amount: Number(fee.paid_amount), payment_date: fee.payment_date || fee.updated_at,
             payment_method: fee.payment_method, receipt_number: fee.receipt_number }]
        : [];
    const current = fee.receipt_number || payments[payments.length - 1]?.receipt_number || null;
    return {
      receiptNo: current || `RCP-${fee.id.slice(0, 8).toUpperCase()}`,
      currentReceipt: current,
      issuedOn: fee.payment_date || fee.updated_at,
      school,
      student,
      fee: {
        title: fee.fee_type,
        total: Number(fee.amount),
        paid: Number(fee.paid_amount),
        balance: Math.max(0, Number(fee.remaining_amount ?? Number(fee.amount) - Number(fee.paid_amount))),
        dueDate: fee.due_date,
      },
      payments,
      online: details.online,
    };
  }, [fee, student, details, school]);

  const s = data ? receiptSummary(data) : null;

  async function run(kind: 'pdf' | 'print') {
    if (!data) return;
    setBusy(kind);
    try {
      if (kind === 'pdf') {
        const r = await downloadReceiptPdf(data);
        if (r.savedTo === 'folder') {
          appAlert('Receipt downloaded', 'The PDF has been saved to the folder you chose (Downloads).');
        }
      } else {
        await printReceipt(data);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (!/cancel|dismiss/i.test(msg)) appAlert('Could not create receipt', msg || 'Please try again.');
    } finally {
      setBusy(null);
    }
  }

  const initials = school.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
  const stampColor = s?.fullyPaid ? '#059669' : '#D97706';

  return (
    <Modal visible={!!fee} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: Math.max(insets.top, 12) }]}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={onClose} hitSlop={12} style={styles.iconBtn}>
            <Ionicons name="close" size={22} color="#0F172A" />
          </TouchableOpacity>
          <Text style={styles.topTitle}>Fee Receipt</Text>
          <TouchableOpacity onPress={() => run('print')} disabled={!data || !!busy} hitSlop={12} style={styles.iconBtn}>
            {busy === 'print' ? <ActivityIndicator size="small" color={ACCENT} /> : <Ionicons name="print-outline" size={21} color={data ? '#0F172A' : '#CBD5E1'} />}
          </TouchableOpacity>
        </View>

        {loading || !data || !s ? (
          <View style={styles.center}><ActivityIndicator color={ACCENT} /><Text style={styles.loadingText}>Preparing receipt…</Text></View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
            {/* Success header */}
            <View style={styles.hero}>
              <View style={[styles.heroIcon, { backgroundColor: s.fullyPaid ? '#ECFDF5' : '#FFFBEB' }]}>
                <Ionicons name={s.fullyPaid ? 'checkmark-circle' : 'time'} size={30} color={stampColor} />
              </View>
              <Text style={styles.heroAmount}>{inr(s.thisAmount)}</Text>
              <Text style={styles.heroSub}>paid on {fmtDate(s.paidOn)} · {s.method}</Text>
              <View style={[styles.statusPill, { backgroundColor: s.fullyPaid ? '#ECFDF5' : '#FFFBEB', borderColor: stampColor + '40' }]}>
                <Text style={[styles.statusPillText, { color: stampColor }]}>{s.statusLabel}</Text>
              </View>
            </View>

            {/* Paper */}
            <View style={styles.paper}>
              <View style={styles.paperAccent} />

              {/* School */}
              <View style={styles.schoolRow}>
                {school.logoUrl && !logoFailed ? (
                  <Image source={{ uri: school.logoUrl }} style={styles.logo} onError={() => setLogoFailed(true)} />
                ) : (
                  <View style={styles.logoFallback}><Text style={styles.logoFallbackText}>{initials || 'S'}</Text></View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.schoolName}>{school.name}</Text>
                  {school.address ? <Text style={styles.muted} numberOfLines={2}>{school.address}</Text> : null}
                  {school.phone || school.email ? (
                    <Text style={styles.muted} numberOfLines={1}>{[school.phone, school.email].filter(Boolean).join(' · ')}</Text>
                  ) : null}
                </View>
              </View>

              {/* Receipt meta */}
              <View style={styles.metaRow}>
                <Meta label="RECEIPT NO." value={data.receiptNo} mono />
                <Meta label="DATE" value={fmtDate(s.paidOn)} align="center" />
                {school.academicYear ? <Meta label="SESSION" value={school.academicYear} align="right" /> : null}
              </View>

              {/* Student */}
              <Section title="Received from">
                <KV k="Student" v={data.student.name} strong />
                {data.student.fatherName ? <KV k="Father's name" v={data.student.fatherName} /> : null}
                <KV k="Class" v={data.student.className} />
                <KV k="Admission No." v={data.student.admissionNo} />
              </Section>

              {/* Fee */}
              <Section title="Fee details">
                <KV k="Fee head" v={data.fee.title} strong />
                {data.fee.dueDate ? <KV k="Due date" v={fmtDate(data.fee.dueDate)} /> : null}
                <KV k="Payment mode" v={s.method} />
              </Section>

              {/* History */}
              <Section title={`Payment history (${data.payments.length})`}>
                {data.payments.map((p, i) => {
                  const hl = !!data.currentReceipt && p.receipt_number === data.currentReceipt;
                  return (
                    <View key={p.id + i} style={[styles.payRow, hl && styles.payRowHl]}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={styles.payDate}>{fmtDate(p.payment_date)}</Text>
                          {hl ? <View style={styles.tag}><Text style={styles.tagText}>This receipt</Text></View> : null}
                        </View>
                        <Text style={styles.payMeta} numberOfLines={1}>
                          {p.receipt_number || '—'} · {p.payment_method || '—'}
                        </Text>
                      </View>
                      <Text style={[styles.payAmt, hl && { color: ACCENT }]}>{inr(p.amount)}</Text>
                    </View>
                  );
                })}
              </Section>

              {/* Online charges */}
              {s.online ? (
                <Section title="Online payment charges">
                  <KV k="Fee amount" v={inr(s.online.fee_amount)} right />
                  <KV k="Convenience fee (2%)" v={inr(s.online.convenience)} right />
                  <KV k="GST @ 18% on convenience" v={inr(s.online.gst)} right />
                  <View style={styles.dash} />
                  <KV k="Total charged" v={inr(s.online.total)} right strong />
                  {s.online.transaction_id ? (
                    <Text style={[styles.muted, { marginTop: 6 }]}>Txn ID: {s.online.transaction_id}</Text>
                  ) : null}
                </Section>
              ) : null}

              {/* Totals */}
              <View style={styles.totals}>
                <KV k="Total fee" v={inr(data.fee.total)} right />
                <KV k="Paid in this receipt" v={inr(s.thisAmount)} right strong />
                <KV k="Total paid till date" v={inr(data.fee.paid)} right />
                <View style={styles.dash} />
                <View style={styles.kv}>
                  <Text style={[styles.k, styles.balanceK]}>Balance due</Text>
                  <Text style={[styles.balanceV, { color: s.fullyPaid ? '#059669' : '#DC2626' }]}>{inr(data.fee.balance)}</Text>
                </View>
              </View>

              <View style={styles.words}>
                <Text style={styles.wordsText}>{amountInWords(s.thisAmount)}</Text>
              </View>

              {/* Stamp */}
              <View pointerEvents="none" style={[styles.stamp, { borderColor: stampColor }]}>
                <Text style={[styles.stampText, { color: stampColor }]}>{s.fullyPaid ? 'PAID' : 'PART PAID'}</Text>
              </View>

              <Text style={styles.footNote}>Computer-generated receipt · no signature needed</Text>
            </View>
          </ScrollView>
        )}

        {/* Actions */}
        <View style={[styles.actions, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Button label="Close" variant="outline" onPress={onClose} style={{ flex: 1 }} />
          <Button
            label={busy === 'pdf' ? 'Creating PDF…' : 'Download PDF'}
            icon="download-outline"
            onPress={() => run('pdf')}
            loading={busy === 'pdf'}
            disabled={!data || !!busy}
            style={{ flex: 1.7 }}
          />
        </View>
      </View>
    </Modal>
  );
}

function Meta({ label, value, mono, align = 'left' }: { label: string; value: string; mono?: boolean; align?: 'left' | 'center' | 'right' }) {
  return (
    <View style={{ flex: 1, alignItems: align === 'left' ? 'flex-start' : align === 'center' ? 'center' : 'flex-end' }}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={[styles.metaValue, mono && styles.mono]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>
      {children}
    </View>
  );
}

function KV({ k, v, strong, right }: { k: string; v: string; strong?: boolean; right?: boolean }) {
  return (
    <View style={styles.kv}>
      <Text style={styles.k}>{k}</Text>
      <Text style={[styles.v, strong && styles.vStrong, right && { textAlign: 'right' }]} numberOfLines={2}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F1F5F9' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 8 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  topTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { color: '#64748B', fontSize: 13 },

  hero: { alignItems: 'center', marginBottom: 14 },
  heroIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  heroAmount: { fontSize: 30, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },
  heroSub: { fontSize: 13, color: '#64748B', marginTop: 2 },
  statusPill: { marginTop: 8, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  statusPillText: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },

  paper: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, paddingTop: 20, overflow: 'hidden',
    shadowColor: '#0F172A', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  paperAccent: { position: 'absolute', top: 0, left: 0, right: 0, height: 5, backgroundColor: ACCENT },
  schoolRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { width: 48, height: 48, borderRadius: 12, backgroundColor: '#F8FAFC' },
  logoFallback: { width: 48, height: 48, borderRadius: 12, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  logoFallbackText: { color: '#FFFFFF', fontWeight: '800', fontSize: 18 },
  schoolName: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  muted: { fontSize: 11.5, color: '#64748B', marginTop: 1 },

  metaRow: { flexDirection: 'row', marginTop: 14, paddingVertical: 10, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#F1F5F9', borderStyle: 'dashed' },
  metaLabel: { fontSize: 9.5, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.8 },
  metaValue: { fontSize: 13, fontWeight: '700', color: '#0F172A', marginTop: 2 },
  mono: { fontVariant: ['tabular-nums'], letterSpacing: 0.3 },

  section: { marginTop: 14 },
  sectionTitle: { fontSize: 10, fontWeight: '800', color: '#94A3B8', letterSpacing: 0.9, marginBottom: 6 },
  kv: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 3.5, gap: 12 },
  k: { fontSize: 13, color: '#64748B', flexShrink: 0 },
  v: { fontSize: 13, color: '#1E293B', flex: 1, textAlign: 'right' },
  vStrong: { fontWeight: '700', color: '#0F172A' },

  payRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, paddingHorizontal: 10, borderRadius: 10, marginBottom: 4, backgroundColor: '#F8FAFC' },
  payRowHl: { backgroundColor: '#EBF2FE' },
  payDate: { fontSize: 13, fontWeight: '600', color: '#0F172A' },
  payMeta: { fontSize: 11, color: '#64748B', marginTop: 1 },
  payAmt: { fontSize: 14, fontWeight: '700', color: '#0F172A', marginLeft: 8 },
  tag: { backgroundColor: ACCENT, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  tagText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800' },

  dash: { borderTopWidth: 1, borderColor: '#CBD5E1', borderStyle: 'dashed', marginVertical: 6 },
  totals: { marginTop: 16, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  balanceK: { fontWeight: '800', color: '#0F172A', fontSize: 14 },
  balanceV: { fontWeight: '800', fontSize: 16 },

  words: { marginTop: 12, padding: 10, borderRadius: 10, backgroundColor: '#F8FAFC' },
  wordsText: { fontSize: 11.5, color: '#475569', fontStyle: 'italic', lineHeight: 16 },

  stamp: {
    position: 'absolute', right: 18, top: 120, borderWidth: 3, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 4,
    transform: [{ rotate: '-14deg' }], opacity: 0.2,
  },
  stampText: { fontSize: 20, fontWeight: '900', letterSpacing: 2 },
  footNote: { marginTop: 14, textAlign: 'center', fontSize: 10.5, color: '#94A3B8' },

  actions: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 12, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderColor: '#E2E8F0' },
});
