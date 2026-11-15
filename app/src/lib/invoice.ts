/**
 * Fee receipt (invoice) — shared data model, an A4 HTML template for the
 * PDF, and helpers to save / share / print it.
 *
 * The same `ReceiptData` drives both the in-app sheet and the PDF so the two
 * always show the same numbers.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import type { ReceiptOnlineCharges, ReceiptPaymentRow } from '@/services/api';

export interface ReceiptData {
  receiptNo: string;
  /** Receipt number of the payment this receipt is for (highlighted). */
  currentReceipt: string | null;
  issuedOn: string;
  school: {
    name: string;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    logoUrl?: string | null;
    affiliation?: string | null;
    academicYear?: string | null;
  };
  student: {
    name: string;
    fatherName?: string | null;
    className: string;
    admissionNo: string;
  };
  fee: {
    title: string;
    total: number;
    paid: number;
    balance: number;
    dueDate?: string | null;
  };
  payments: ReceiptPaymentRow[];
  online: Record<string, ReceiptOnlineCharges>;
}

// ── Formatting ───────────────────────────────────────────────

/** ₹1,23,456.00 — Indian digit grouping, done by hand so it works on Hermes. */
export function inr(n: number, decimals = 2): string {
  const neg = n < 0;
  const [int, dec] = Math.abs(n).toFixed(decimals).split('.');
  const last3 = int.slice(-3);
  const rest = int.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  const grouped = rest ? `${rest},${last3}` : last3;
  return `${neg ? '-' : ''}₹${grouped}${dec ? `.${dec}` : ''}`;
}

export function fmtDate(d?: string | null): string {
  if (!d) return '—';
  const date = new Date(d.length === 10 ? `${d}T00:00:00` : d);
  if (isNaN(date.getTime())) return '—';
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${String(date.getDate()).padStart(2, '0')} ${M[date.getMonth()]} ${date.getFullYear()}`;
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function below1000(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${ONES[h]} Hundred`);
  if (r) parts.push(r < 20 ? ONES[r] : `${TENS[Math.floor(r / 10)]}${r % 10 ? ` ${ONES[r % 10]}` : ''}`);
  return parts.join(' ');
}

/** 12345.5 → "Rupees Twelve Thousand Three Hundred Forty Five and Fifty Paise Only" */
export function amountInWords(amount: number): string {
  const rupees = Math.floor(Math.abs(amount));
  const paise = Math.round((Math.abs(amount) - rupees) * 100);
  const words = (n: number): string => {
    if (n === 0) return 'Zero';
    const parts: string[] = [];
    const crore = Math.floor(n / 10000000); n %= 10000000;
    const lakh = Math.floor(n / 100000); n %= 100000;
    const thousand = Math.floor(n / 1000); n %= 1000;
    if (crore) parts.push(`${words(crore)} Crore`);
    if (lakh) parts.push(`${below1000(lakh)} Lakh`);
    if (thousand) parts.push(`${below1000(thousand)} Thousand`);
    if (n) parts.push(below1000(n));
    return parts.join(' ');
  };
  return `Rupees ${words(rupees)}${paise ? ` and ${below1000(paise)} Paise` : ''} Only`;
}

// ── Derived values ───────────────────────────────────────────

export function receiptSummary(d: ReceiptData) {
  const current = d.currentReceipt
    ? d.payments.filter((p) => p.receipt_number === d.currentReceipt)
    : [];
  const thisAmount = current.length
    ? current.reduce((s, p) => s + p.amount, 0)
    : d.payments.length ? d.payments[d.payments.length - 1].amount : d.fee.paid;
  const lastRow = current[current.length - 1] ?? d.payments[d.payments.length - 1];
  const online = d.currentReceipt ? d.online[d.currentReceipt] : undefined;
  const fullyPaid = d.fee.balance <= 0.009;
  return {
    thisAmount,
    method: lastRow?.payment_method || (online ? 'Online' : 'Cash'),
    paidOn: online?.paid_at || lastRow?.payment_date || d.issuedOn,
    online,
    fullyPaid,
    statusLabel: fullyPaid ? 'PAID IN FULL' : 'PARTIALLY PAID',
  };
}

// ── HTML (A4) ────────────────────────────────────────────────

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || 'S';
}

export function receiptHtml(d: ReceiptData, logoDataUri?: string | null): string {
  const s = receiptSummary(d);
  const accent = '#1E5BD8';
  const stampColor = s.fullyPaid ? '#059669' : '#D97706';
  const contact = [d.school.phone && `Ph: ${esc(d.school.phone)}`, d.school.email && esc(d.school.email)].filter(Boolean).join(' &nbsp;·&nbsp; ');

  const rows = d.payments.length
    ? d.payments.map((p, i) => {
        const hl = d.currentReceipt && p.receipt_number === d.currentReceipt;
        return `<tr class="${hl ? 'hl' : ''}">
          <td class="c">${i + 1}</td>
          <td>${fmtDate(p.payment_date)}</td>
          <td class="mono">${esc(p.receipt_number || '—')}${hl ? ' <span class="tag">This receipt</span>' : ''}</td>
          <td>${esc(p.payment_method || '—')}</td>
          <td class="r">${inr(p.amount)}</td>
        </tr>`;
      }).join('')
    : `<tr class="hl"><td class="c">1</td><td>${fmtDate(s.paidOn)}</td><td class="mono">${esc(d.receiptNo)}</td><td>${esc(s.method)}</td><td class="r">${inr(d.fee.paid)}</td></tr>`;

  const onlineBlock = s.online ? `
    <div class="box online">
      <div class="box-h">Online payment charges</div>
      <table class="kv">
        <tr><td>Fee amount</td><td class="r">${inr(s.online.fee_amount)}</td></tr>
        <tr><td>Convenience fee (2%)</td><td class="r">${inr(s.online.convenience)}</td></tr>
        <tr><td>GST @ 18% on convenience fee</td><td class="r">${inr(s.online.gst)}</td></tr>
        <tr class="tot"><td>Total charged</td><td class="r">${inr(s.online.total)}</td></tr>
      </table>
      ${s.online.transaction_id ? `<div class="txn">Transaction ID: <span class="mono">${esc(s.online.transaction_id)}</span></div>` : ''}
    </div>` : '';

  return `<!doctype html><html><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
         color: #1E293B; font-size: 12px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { width: 210mm; min-height: 297mm; padding: 14mm 14mm 12mm; position: relative; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
  .brand { display: flex; gap: 12px; align-items: center; }
  .logo { width: 58px; height: 58px; border-radius: 14px; object-fit: contain; }
  .mono-logo { width: 58px; height: 58px; border-radius: 14px; background: ${accent}; color: #fff;
               font-weight: 800; font-size: 22px; display: flex; align-items: center; justify-content: center; }
  .sname { font-size: 19px; font-weight: 800; letter-spacing: -0.2px; color: #0F172A; }
  .muted { color: #64748B; font-size: 11px; line-height: 1.5; }
  .doc { text-align: right; }
  .doc-t { font-size: 22px; font-weight: 800; color: ${accent}; letter-spacing: 1.5px; }
  .doc table td { padding: 1px 0 1px 12px; font-size: 11px; }
  .doc table td:first-child { color: #64748B; }
  .bar { height: 4px; border-radius: 4px; background: linear-gradient(90deg, ${accent}, #60A5FA); margin: 14px 0 16px; }
  .grid { display: flex; gap: 12px; }
  .box { flex: 1; border: 1px solid #E2E8F0; border-radius: 10px; padding: 10px 12px; }
  .box-h { font-size: 10px; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px; }
  .kv { width: 100%; border-collapse: collapse; }
  .kv td { padding: 3px 0; vertical-align: top; }
  .kv td:first-child { color: #64748B; width: 44%; }
  .kv td.r, td.r { text-align: right; }
  .strong { font-weight: 700; color: #0F172A; }
  h3 { font-size: 12px; margin: 18px 0 8px; color: #0F172A; }
  table.items { width: 100%; border-collapse: collapse; }
  .items th { background: #F1F5F9; color: #475569; font-size: 10px; text-transform: uppercase; letter-spacing: 0.6px;
              text-align: left; padding: 8px 10px; }
  .items th:first-child { border-radius: 8px 0 0 8px; } .items th:last-child { border-radius: 0 8px 8px 0; text-align: right; }
  .items td { padding: 8px 10px; border-bottom: 1px solid #F1F5F9; }
  .items tr.hl td { background: #EBF2FE; font-weight: 600; }
  .c { text-align: center; width: 30px; }
  .mono { font-family: 'SF Mono', Menlo, Consolas, monospace; font-size: 11px; }
  .tag { font-family: -apple-system, Roboto, sans-serif; font-size: 9px; background: ${accent}; color: #fff;
         padding: 1px 6px; border-radius: 10px; margin-left: 4px; font-weight: 700; }
  .bottom { display: flex; gap: 12px; margin-top: 14px; align-items: flex-start; }
  .totals { width: 46%; margin-left: auto; border: 1px solid #E2E8F0; border-radius: 10px; padding: 10px 12px; }
  .tot td { font-weight: 800; color: #0F172A; border-top: 1px dashed #CBD5E1; padding-top: 7px !important; font-size: 13px; }
  .bal { color: ${s.fullyPaid ? '#059669' : '#DC2626'}; }
  .online { background: #F7F9FC; }
  .txn { margin-top: 6px; font-size: 10px; color: #64748B; }
  .words { margin-top: 14px; padding: 10px 12px; border-radius: 10px; background: #F8FAFC; border: 1px solid #E2E8F0; }
  .words b { color: #0F172A; }
  .tot td:first-child { color: #0F172A; }
  .sign { display: flex; justify-content: space-between; align-items: center; margin-top: 22px; gap: 16px; }
  .thanks { font-size: 15px; font-weight: 800; color: #0F172A; }
  .note { color: #64748B; font-size: 10.5px; line-height: 1.6; margin-top: 3px; }
  .stamp { transform: rotate(-10deg); border: 3px double ${stampColor}; color: ${stampColor}; border-radius: 12px;
           padding: 8px 16px; text-align: center; opacity: 0.85; flex-shrink: 0; margin-right: 8mm; }
  .stamp b { display: block; font-size: 18px; font-weight: 900; letter-spacing: 2px; }
  .stamp span { display: block; font-size: 9px; font-weight: 700; letter-spacing: 1px; margin-top: 2px; }
  .foot { position: absolute; left: 14mm; right: 14mm; bottom: 12mm; border-top: 1px solid #E2E8F0; padding-top: 8px;
          display: flex; justify-content: space-between; color: #94A3B8; font-size: 9.5px; }
</style></head><body><div class="page">
  <div class="top">
    <div class="brand">
      ${logoDataUri ? `<img class="logo" src="${logoDataUri}" />` : `<div class="mono-logo">${esc(initials(d.school.name))}</div>`}
      <div>
        <div class="sname">${esc(d.school.name)}</div>
        ${d.school.address ? `<div class="muted">${esc(d.school.address)}</div>` : ''}
        ${contact ? `<div class="muted">${contact}</div>` : ''}
        ${d.school.affiliation ? `<div class="muted">${esc(d.school.affiliation)}</div>` : ''}
      </div>
    </div>
    <div class="doc">
      <div class="doc-t">FEE RECEIPT</div>
      <table>
        <tr><td>Receipt No.</td><td class="strong mono">${esc(d.receiptNo)}</td></tr>
        <tr><td>Date</td><td class="strong">${fmtDate(s.paidOn)}</td></tr>
        ${d.school.academicYear ? `<tr><td>Session</td><td class="strong">${esc(d.school.academicYear)}</td></tr>` : ''}
      </table>
    </div>
  </div>
  <div class="bar"></div>

  <div class="grid">
    <div class="box">
      <div class="box-h">Received from</div>
      <table class="kv">
        <tr><td>Student</td><td class="strong">${esc(d.student.name)}</td></tr>
        ${d.student.fatherName ? `<tr><td>Father's name</td><td>${esc(d.student.fatherName)}</td></tr>` : ''}
        <tr><td>Class</td><td>${esc(d.student.className)}</td></tr>
        <tr><td>Admission No.</td><td class="mono">${esc(d.student.admissionNo)}</td></tr>
      </table>
    </div>
    <div class="box">
      <div class="box-h">Fee details</div>
      <table class="kv">
        <tr><td>Fee head</td><td class="strong">${esc(d.fee.title)}</td></tr>
        <tr><td>Payment mode</td><td>${esc(s.method)}</td></tr>
        ${d.fee.dueDate ? `<tr><td>Due date</td><td>${fmtDate(d.fee.dueDate)}</td></tr>` : ''}
        <tr><td>Status</td><td class="strong" style="color:${stampColor}">${s.statusLabel}</td></tr>
      </table>
    </div>
  </div>

  <h3>Payment history</h3>
  <table class="items">
    <thead><tr><th class="c">#</th><th>Date</th><th>Receipt No.</th><th>Mode</th><th>Amount</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="bottom">
    ${onlineBlock}
    <div class="totals">
      <table class="kv">
        <tr><td>Total fee</td><td class="r">${inr(d.fee.total)}</td></tr>
        <tr><td>Paid in this receipt</td><td class="r strong">${inr(s.thisAmount)}</td></tr>
        <tr><td>Total paid till date</td><td class="r">${inr(d.fee.paid)}</td></tr>
        <tr class="tot"><td>Balance due</td><td class="r bal">${inr(d.fee.balance)}</td></tr>
      </table>
    </div>
  </div>

  <div class="words">Amount received: <b>${inr(s.thisAmount)}</b> &nbsp;(${esc(amountInWords(s.thisAmount))})</div>

  <div class="sign">
    <div>
      <div class="thanks">Thank you for your payment!</div>
      <div class="note">Please keep this receipt for your records.${s.online ? ' The convenience fee and GST are gateway charges and are not part of the school fee.' : ''}
      ${d.school.phone ? `<br/>For any query, contact the school office at ${esc(d.school.phone)}.` : ''}</div>
    </div>
    <div class="stamp"><b>${s.statusLabel}</b><span>${esc(d.school.name.toUpperCase())}</span><span>${fmtDate(s.paidOn)}</span></div>
  </div>

  <div class="foot">
    <span>This is a computer-generated receipt and does not need a signature.</span>
    <span>Generated ${fmtDate(new Date().toISOString())} · Veducore</span>
  </div>
</div></body></html>`;
}

// ── Actions ──────────────────────────────────────────────────

type PrintModule = typeof import('expo-print');

/** expo-print is a native module. Load it lazily so an app binary built
 *  before it was added shows a clear message instead of crashing the screen. */
function loadPrint(): PrintModule {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-print') as PrintModule;
  } catch {
    throw new Error('PDF support is missing in this app build. Please install the latest version of the app.');
  }
}

/** The school logo as a data URI the PDF can render. Schools store the logo
 *  as a base64 data URI already; a normal http(s) URL is downloaded and inlined. */
async function logoAsDataUri(url?: string | null): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith('data:image/')) return url;
  if (!/^https?:\/\//i.test(url)) return null;
  try {
    const clean = url.split('?')[0];
    const ext = (clean.split('.').pop() || 'png').toLowerCase();
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'svg' ? 'image/svg+xml' : ext === 'webp' ? 'image/webp' : 'image/png';
    const target = `${FileSystem.cacheDirectory}receipt-logo.${ext}`;
    const dl = await Promise.race([
      FileSystem.downloadAsync(url, target),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000)),
    ]);
    if (dl.status !== 200) return null;
    const b64 = await FileSystem.readAsStringAsync(dl.uri, { encoding: FileSystem.EncodingType.Base64 });
    return `data:${mime};base64,${b64}`;
  } catch {
    return null;
  }
}

export function receiptFileName(d: ReceiptData) {
  const safe = `${d.receiptNo}-${d.student.name}`.replace(/[^A-Za-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return `Fee-Receipt-${safe}.pdf`;
}

/** Renders the PDF into the app cache and returns its uri + base64 content. */
export async function createReceiptPdf(d: ReceiptData): Promise<{ uri: string; base64: string }> {
  const Print = loadPrint();
  const logo = await logoAsDataUri(d.school.logoUrl);
  const res = await Print.printToFileAsync({ html: receiptHtml(d, logo), width: 595, height: 842, base64: true });
  const named = `${FileSystem.cacheDirectory}${receiptFileName(d)}`;
  try {
    await FileSystem.deleteAsync(named, { idempotent: true });
    await FileSystem.moveAsync({ from: res.uri, to: named });
    return { uri: named, base64: res.base64 ?? '' };
  } catch {
    return { uri: res.uri, base64: res.base64 ?? '' };
  }
}

const SAVE_DIR_KEY = 'veducore.receipts.saveDir';

/**
 * Downloads the receipt.
 * - Android: saved straight into a folder the parent picks once (Downloads
 *   is suggested); later downloads go to the same folder without asking.
 * - iOS: there is no public Downloads folder, so the system sheet opens with
 *   "Save to Files" (and WhatsApp, Mail, …).
 * Returns where it went so the UI can confirm.
 */
export async function downloadReceiptPdf(d: ReceiptData): Promise<{ savedTo: 'folder' | 'shared' | 'cancelled' }> {
  const pdf = await createReceiptPdf(d);

  if (Platform.OS === 'android' && pdf.base64) {
    const SAF = FileSystem.StorageAccessFramework;
    const write = async (dir: string) => {
      const fileUri = await SAF.createFileAsync(dir, receiptFileName(d).replace(/\.pdf$/, ''), 'application/pdf');
      await FileSystem.writeAsStringAsync(fileUri, pdf.base64, { encoding: FileSystem.EncodingType.Base64 });
    };

    const saved = await AsyncStorage.getItem(SAVE_DIR_KEY).catch(() => null);
    if (saved) {
      try { await write(saved); return { savedTo: 'folder' }; }
      catch { await AsyncStorage.removeItem(SAVE_DIR_KEY).catch(() => {}); }
    }
    const perm = await SAF.requestDirectoryPermissionsAsync(SAF.getUriForDirectoryInRoot('Download'));
    if (!perm.granted) return { savedTo: 'cancelled' };
    await write(perm.directoryUri);
    await AsyncStorage.setItem(SAVE_DIR_KEY, perm.directoryUri).catch(() => {});
    return { savedTo: 'folder' };
  }

  await sharePdfFile(pdf.uri, d);
  return { savedTo: 'shared' };
}

/** Opens the share sheet (WhatsApp, Mail, Drive, Save to Files…). */
export async function shareReceiptPdf(d: ReceiptData): Promise<void> {
  const pdf = await createReceiptPdf(d);
  await sharePdfFile(pdf.uri, d);
}

async function sharePdfFile(uri: string, d: ReceiptData) {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device');
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: `Fee Receipt ${d.receiptNo}`,
  });
}

export async function printReceipt(d: ReceiptData): Promise<void> {
  const Print = loadPrint();
  const logo = await logoAsDataUri(d.school.logoUrl);
  await Print.printAsync({ html: receiptHtml(d, logo) });
}
