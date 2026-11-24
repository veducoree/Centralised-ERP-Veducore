import { useRef, useState, useEffect, useCallback } from 'react';
import { Upload, Download, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { createStudent, fetchStudents } from '@/services/api';
import { joinName, normalizeMobile, splitFullName, tidyNameParts } from '@/lib/parentUtils';
import type { Class, Section } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BulkStudentUploadProps {
  open: boolean;
  onClose: () => void;
  schoolId: string;
  classes: (Class & { sections: Section[] })[];
  onSuccess: () => void;
}

interface ParsedRow {
  admission_number: string;
  full_name: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  father_name: string;
  mother_name: string;
  parent_email: string;
  phone_number: string;
  date_of_birth: string;
  gender: string;
  class_id: string;
  section_id: string;
  address: string;
  admission_date: string;
  // display only
  class_name: string;
  section_name: string;
  errors: string[];
}

interface ImportResult {
  success: number;
  failed: number;
  failedDetails: Array<{ rowIndex: number; admission_number: string; error: string }>;
  skipped: Array<{ rowIndex: number; admission_number: string; errors: string[] }>;
}

type Phase = 'upload' | 'preview' | 'importing' | 'done';

// ---------------------------------------------------------------------------
// Pure CSV parser (no external libraries)
// ---------------------------------------------------------------------------

function parseCSV(input: string): string[][] {
  // Excel's "CSV UTF-8" starts with a byte-order mark; it would break the first header.
  const text = input.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        // Peek ahead for escaped quote ("")
        if (i + 1 < text.length && text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        field += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ',') {
        row.push(field.trim());
        field = '';
        i++;
      } else if (ch === '\r') {
        // handle \r\n or lone \r
        row.push(field.trim());
        field = '';
        rows.push(row);
        row = [];
        if (i + 1 < text.length && text[i + 1] === '\n') i++;
        i++;
      } else if (ch === '\n') {
        row.push(field.trim());
        field = '';
        rows.push(row);
        row = [];
        i++;
      } else {
        field += ch;
        i++;
      }
    }
  }

  // Push the last field / row
  row.push(field.trim());
  if (row.some((f) => f !== '')) rows.push(row);

  return rows;
}

// ---------------------------------------------------------------------------
// Cleaning helpers — CSVs come from Excel / Google Sheets in many shapes
// ---------------------------------------------------------------------------

/** "Admission No." / "admission-number" / "\uFEFFadmission_number" → "admission_no" style key. */
function headerKey(h: string): string {
  return h.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

const HEADER_ALIASES: Record<string, string[]> = {
  admission_number: ['admission_number', 'admission_no', 'adm_no', 'admission', 'adm_number', 'sr_no', 'scholar_no'],
  full_name: ['full_name', 'student_name', 'student_full_name', 'name', 'student'],
  first_name: ['first_name', 'student_first_name', 'firstname', 'first', 'fname', 'given_name'],
  middle_name: ['middle_name', 'student_middle_name', 'middlename', 'middle', 'mname'],
  last_name: ['last_name', 'student_last_name', 'lastname', 'last', 'lname', 'surname'],
  father_name: ['father_name', 'father', 'fathers_name'],
  mother_name: ['mother_name', 'mother', 'mothers_name'],
  parent_email: ['parent_email', 'email', 'email_id'],
  phone_number: ['phone_number', 'phone', 'parent_phone', 'parent_mobile', 'mobile', 'mobile_number', 'mobile_no', 'contact', 'contact_number', 'emergency_contact'],
  date_of_birth: ['date_of_birth', 'dob', 'birth_date'],
  gender: ['gender', 'sex'],
  class_name: ['class_name', 'class', 'grade', 'standard', 'std'],
  section_name: ['section_name', 'section', 'sec'],
  address: ['address', 'full_address'],
  admission_date: ['admission_date', 'date_of_admission', 'doa'],
};

/** male | female | other, or null if it can't be read. Empty → male (old behaviour). */
function normalizeGender(raw: string): 'male' | 'female' | 'other' | null {
  const g = raw.trim().toLowerCase();
  if (!g) return 'male';
  if (['m', 'male', 'boy', 'b'].includes(g)) return 'male';
  if (['f', 'female', 'girl', 'g'].includes(g)) return 'female';
  if (['o', 'other', 'others', 'transgender', 't'].includes(g)) return 'other';
  return null;
}

/** Accepts 2010-05-15, 15/05/2010, 15-05-2010, 15.05.2010 (day first, as in India) → "2010-05-15".
 *  Returns '' for empty and null when it isn't a real date. */
function normalizeDate(raw: string): string | null {
  const v = raw.trim();
  if (!v) return '';
  let y: number, m: number, d: number;
  let match = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (match) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/))) {
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (y < 100) y += y > (new Date().getFullYear() % 100) ? 1900 : 2000;
  } else {
    return null;
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  if (y < 1950 || dt.getTime() > Date.now() + 366 * 86400000) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** "Class 6", "class-6", "6", "VI", "6th", "Std 6" all compare equal. */
const ROMAN: Record<string, string> = { i: '1', ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9', x: '10', xi: '11', xii: '12' };
function classKey(name: string): string {
  let k = name.trim().toLowerCase().replace(/\b(class|std|standard|grade)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  k = k.replace(/^(\d+)(st|nd|rd|th)$/, '$1');
  if (ROMAN[k]) k = ROMAN[k];
  return k.replace(/\s+/g, '');
}

// ---------------------------------------------------------------------------
// Sample CSV content
// ---------------------------------------------------------------------------

const SAMPLE_CSV = [
  'admission_number,first_name,middle_name,last_name,father_name,mother_name,parent_email,phone_number,date_of_birth,gender,class_name,section_name,address,admission_date',
  '2024001,Rahul,Kumar,Sharma,Raj Sharma,Meena Sharma,sharma.family@example.com,9876543210,2010-05-15,male,Class 6,A,123 Main Street,2024-04-01',
  '2024002,Priya,,Singh,Anil Singh,Renu Singh,singh.family@example.com,9876543211,2011-03-20,female,Class 7,B,456 Park Avenue,2024-04-01',
].join('\n');

function downloadSampleCsv() {
  const blob = new Blob([SAMPLE_CSV], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'sample_students.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BulkStudentUpload({ open, onClose, schoolId, classes, onSuccess }: BulkStudentUploadProps) {
  const [phase, setPhase] = useState<Phase>('upload');
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  // Parent logins actually created (or reused for siblings) during the import.
  const [createdCreds, setCreatedCreds] = useState<
    Array<{ admission_number: string; full_name: string; parent: string; login: string; password: string; note: string }>
  >([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Keep a ref to the latest onSuccess so the effect below never goes stale
  const onSuccessRef = useRef(onSuccess);
  useEffect(() => { onSuccessRef.current = onSuccess; });

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setPhase('upload');
      setParsedRows([]);
      setImporting(false);
      setImportResult(null);
      setDragOver(false);
      setFileError(null);
      setCreatedCreds([]);
    }
  }, [open]);

  // Call onSuccess when we move to 'done' and there were successes
  useEffect(() => {
    if (phase === 'done' && importResult && importResult.success > 0) {
      onSuccessRef.current();
    }
  }, [phase, importResult]);

  function reset() {
    setPhase('upload');
    setParsedRows([]);
    setImportResult(null);
    setFileError(null);
    setCreatedCreds([]);
  }

  function handleClose() {
    onClose();
    reset();
  }

  // ----- File handling -----

  const processFile = useCallback(
    (file: File) => {
      setFileError(null);
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
        setFileError('This is an Excel file. In Excel choose File → Save As → "CSV UTF-8 (Comma delimited)", then upload that .csv file.');
        return;
      }
      if (!lower.endsWith('.csv')) {
        setFileError('Please upload a .csv file.');
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => setFileError('Could not read the file. Please try again.');
      reader.onload = async (e) => {
        const text = (e.target?.result as string) ?? '';
        const rows = parseCSV(text);
        if (rows.length < 2) {
          setFileError('The file has no student rows. Keep the header row and add one student per row below it.');
          return;
        }

        const headerRow = rows[0].map(headerKey);
        const col = (field: string) => {
          for (const alias of HEADER_ALIASES[field] ?? [field]) {
            const i = headerRow.indexOf(alias);
            if (i >= 0) return i;
          }
          return -1;
        };

        const iAdm = col('admission_number');
        const iName = col('full_name');
        const iFirst = col('first_name');
        const iMiddle = col('middle_name');
        const iLast = col('last_name');
        const iFather = col('father_name');
        const iMother = col('mother_name');
        const iParentEmail = col('parent_email');
        const iPhone = col('phone_number');
        const iDob = col('date_of_birth');
        const iGender = col('gender');
        const iClass = col('class_name');
        const iSection = col('section_name');
        const iAddress = col('address');
        const iAdmDate = col('admission_date');

        const missing = [
          iAdm < 0 && 'admission_number',
          iName < 0 && iFirst < 0 && 'first_name (or full_name)',
          iPhone < 0 && 'phone_number',
          iClass < 0 && 'class_name',
          iSection < 0 && 'section_name',
        ].filter(Boolean);
        if (missing.length) {
          setFileError(`Missing column(s): ${missing.join(', ')}. Download the sample CSV to see the expected headers.`);
          return;
        }

        // Admission numbers already used in this school (case-insensitive).
        let existing = new Set<string>();
        try {
          const students = await fetchStudents(schoolId);
          existing = new Set(students.map((st) => (st.admission_number ?? '').trim().toLowerCase()));
        } catch {
          // the database still rejects duplicates at import time
        }
        const seen = new Map<string, number>();

        const parsed: ParsedRow[] = [];

        for (let i = 1; i < rows.length; i++) {
          const r = rows[i];
          // Skip completely empty rows
          if (r.every((f) => f === '')) continue;

          const get = (idx: number) => (idx >= 0 ? (r[idx] ?? '').trim() : '');

          const admission_number = get(iAdm).replace(/\s+/g, '');
          // first / middle / last columns win; an old-style full_name column is split.
          const tidyCase = (v: string) => v.replace(/\s+/g, ' ').trim()
            .replace(/(^|[\s'-])(\p{L})/gu, (_m: string, sep: string, ch: string) => sep + ch.toUpperCase());
          const parts = tidyNameParts(
            iFirst >= 0 && get(iFirst)
              ? { first_name: tidyCase(get(iFirst)), middle_name: tidyCase(get(iMiddle)), last_name: tidyCase(get(iLast)) }
              : splitFullName(tidyCase(get(iName))),
          );
          const full_name = joinName(parts);
          const father_name = get(iFather).replace(/\s+/g, ' ');
          const mother_name = get(iMother).replace(/\s+/g, ' ');
          const parent_email = get(iParentEmail).toLowerCase();
          const phoneRaw = get(iPhone);
          const phone_number = normalizeMobile(phoneRaw) ?? '';
          const dobRaw = get(iDob);
          const date_of_birth = normalizeDate(dobRaw);
          const genderRaw = get(iGender);
          const gender = normalizeGender(genderRaw);
          const class_name = get(iClass);
          const section_name = get(iSection);
          const address = get(iAddress);
          const admDateRaw = get(iAdmDate);
          const admission_date = normalizeDate(admDateRaw);

          const errors: string[] = [];

          const admKey = admission_number.toLowerCase();
          if (!admission_number) errors.push('Admission number required');
          else if (existing.has(admKey)) errors.push(`Admission number ${admission_number} already exists in this school`);
          else if (seen.has(admKey)) errors.push(`Admission number ${admission_number} repeated (also row ${seen.get(admKey)})`);
          if (admission_number && !seen.has(admKey)) seen.set(admKey, parsed.length + 1);

          if (!parts.first_name) errors.push('Student first name required');
          // Parent logs in with this number.
          if (!phoneRaw) errors.push('Parent mobile number required');
          else if (/e\+/i.test(phoneRaw)) errors.push('Mobile number was changed by Excel (looks like 9.87E+09). Format the column as Text and type it again');
          else if (!phone_number) errors.push(`Mobile "${phoneRaw}" is not a valid 10-digit number`);
          if (parent_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parent_email)) errors.push(`Email "${parent_email}" is not valid`);
          if (date_of_birth === null) errors.push(`Date of birth "${dobRaw}" not understood (use DD/MM/YYYY or YYYY-MM-DD)`);
          if (admission_date === null) errors.push(`Admission date "${admDateRaw}" not understood (use DD/MM/YYYY or YYYY-MM-DD)`);
          if (gender === null) errors.push(`Gender "${genderRaw}" not understood (use Male / Female / Other)`);

          let class_id = '';
          let section_id = '';

          if (!class_name) {
            errors.push('Class name required');
          } else {
            const wanted = classKey(class_name);
            const matchedClass =
              classes.find((c) => c.name.trim().toLowerCase() === class_name.toLowerCase()) ??
              classes.find((c) => classKey(c.name) === wanted);
            if (!matchedClass) {
              errors.push(`Class "${class_name}" not found`);
            } else {
              class_id = matchedClass.id;
              if (!section_name) {
                errors.push('Section name required');
              } else {
                const secKey = section_name.trim().toLowerCase().replace(/^(section|sec)\s*/, '');
                const matchedSection = matchedClass.sections.find(
                  (sec) => sec.name.trim().toLowerCase() === secKey || sec.name.trim().toLowerCase() === section_name.trim().toLowerCase()
                );
                if (!matchedSection) {
                  errors.push(`Section "${section_name}" not found in ${matchedClass.name}`);
                } else {
                  section_id = matchedSection.id;
                }
              }
            }
          }

          parsed.push({
            admission_number,
            full_name,
            ...parts,
            father_name,
            mother_name,
            parent_email,
            phone_number,
            date_of_birth: date_of_birth ?? '',
            gender: gender ?? 'male',
            class_id,
            section_id,
            address,
            admission_date: admission_date ?? '',
            class_name,
            section_name,
            errors,
          });
        }

        if (!parsed.length) {
          setFileError('The file has no student rows.');
          return;
        }
        setParsedRows(parsed);
        setPhase('preview');
      };
      reader.readAsText(file);
    },
    [classes, schoolId]
  );

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    // reset so the same file can be re-selected
    e.target.value = '';
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave() {
    setDragOver(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }

  // ----- Import -----

  async function handleImport() {
    if (!schoolId) return;
    setPhase('importing');
    const valid = parsedRows.filter((r) => r.errors.length === 0);
    let success = 0;
    let failed = 0;
    const failedDetails: Array<{ rowIndex: number; admission_number: string; error: string }> = [];

    // Collect skipped (invalid) rows before the loop
    const skipped = parsedRows
      .map((row, idx) => ({ row, idx }))
      .filter(({ row }) => row.errors.length > 0)
      .map(({ row, idx }) => ({
        rowIndex: idx + 1,
        admission_number: row.admission_number,
        errors: row.errors,
      }));

    const creds: typeof createdCreds = [];
    for (let i = 0; i < valid.length; i++) {
      const row = valid[i];
      // find original 1-based row index in parsedRows
      const rowIndex = parsedRows.indexOf(row) + 1;
      try {
        const res = await createStudent({
          school_id: schoolId,
          admission_number: row.admission_number,
          full_name: row.full_name,
          first_name: row.first_name || null,
          middle_name: row.middle_name || null,
          last_name: row.last_name || null,
          father_name: row.father_name || null,
          mother_name: row.mother_name || null,
          parent_email: row.parent_email || null,
          emergency_contact: row.phone_number || null,
          date_of_birth: row.date_of_birth || null,
          gender: row.gender || null,
          class_id: row.class_id,
          section_id: row.section_id,
          address: row.address || null,
          admission_date: row.admission_date || null,
          status: 'active',
        });
        creds.push({
          admission_number: row.admission_number,
          full_name: row.full_name,
          parent: res?._parentResult?.parent?.full_name || row.father_name || row.mother_name || `${row.full_name}'s Parent`,
          login: res?._parentResult?.credentials.username ?? '',
          password: res?._parentResult?.credentials.password ?? '',
          note: res?._parentError ?? '',
        });
        success++;
      } catch (err) {
        failed++;
        failedDetails.push({
          rowIndex,
          admission_number: row.admission_number,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    setCreatedCreds(creds);
    setImportResult({ success, failed, failedDetails, skipped });
    setPhase('done');
  }

  // ----- Derived -----

  const validCount = parsedRows.filter((r) => r.errors.length === 0).length;
  const invalidCount = parsedRows.length - validCount;

  // ----- Render helpers -----

  function renderUploadPhase() {
    return (
      <>
        {/* Drop zone */}
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 text-center cursor-pointer transition-colors ${
            dragOver
              ? 'border-brand-400 bg-brand-50'
              : 'border-slate-300 hover:border-brand-400 hover:bg-brand-50'
          }`}
        >
          <Upload className="h-10 w-10 text-slate-400 mb-3" />
          <p className="font-medium text-slate-600 text-sm">Drag &amp; drop a CSV file here, or click to browse</p>
          <p className="mt-1 text-xs text-slate-400">Only .csv files (Excel: Save As → CSV UTF-8)</p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={handleFileChange}
        />

        {fileError && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{fileError}</span>
          </div>
        )}

        {/* Sample download */}
        <div className="mt-4 flex justify-center">
          <Button variant="ghost" size="sm" icon={<Download className="h-4 w-4" />} onClick={downloadSampleCsv}>
            Download Sample CSV
          </Button>
        </div>

        {/* Column reference */}
        <div className="mt-4 rounded-lg bg-slate-50 px-4 py-3">
          <p className="text-xs font-medium text-slate-500 mb-1">Expected CSV columns</p>
          <p className="text-xs text-slate-400 font-mono break-all">
            admission_number, first_name, middle_name, last_name, father_name, mother_name, parent_email, phone_number, date_of_birth, gender, class_name, section_name, address, admission_date
          </p>
          <p className="mt-1 text-xs text-slate-400">Required: admission_number, first_name, phone_number (parent mobile — used for parent login), class_name, section_name. middle_name and last_name are optional. An old file with a single full_name column also works (it is split automatically). Dates as DD/MM/YYYY or YYYY-MM-DD; gender Male / Female / Other.</p>
          <p className="mt-1 text-xs text-slate-400">Parent login: mobile number. Password from the student's name + @school code — Rahul Kumar Sharma → rakush@…, Rahul Sharma → rahush@…, Rahul → rahu@…</p>
        </div>
      </>
    );
  }

  function renderPreviewPhase() {
    return (
      <>
        {/* Summary */}
        <div className="mb-3 flex items-center gap-3 text-sm">
          <span>
            <span className="font-semibold text-green-600">{validCount} valid</span>
          </span>
          {invalidCount > 0 && (
            <span>
              <span className="font-semibold text-red-500">{invalidCount} invalid</span>
            </span>
          )}
          <span className="text-slate-400">rows found</span>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">#</th>
                <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Admission No.</th>
                <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Full Name</th>
                <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Father's Name</th>
                <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Mother's Name</th>
                <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Phone</th>
                <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Class</th>
                <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Section</th>
                <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {parsedRows.map((row, idx) => (
                <tr key={idx} className={row.errors.length > 0 ? 'bg-red-50' : ''}>
                  <td className="px-3 py-2 text-slate-500">{idx + 1}</td>
                  <td className="px-3 py-2 text-slate-700">{row.admission_number || '—'}</td>
                  <td className="px-3 py-2 text-slate-700">{row.full_name || '—'}</td>
                  <td className="px-3 py-2 text-slate-700">{row.father_name || '—'}</td>
                  <td className="px-3 py-2 text-slate-700">{row.mother_name || '—'}</td>
                  <td className="px-3 py-2 text-slate-700">{row.phone_number ? `+91 ${row.phone_number}` : '—'}</td>
                  <td className="px-3 py-2 text-slate-700">{row.class_name || '—'}</td>
                  <td className="px-3 py-2 text-slate-700">{row.section_name || '—'}</td>
                  <td className="px-3 py-2">
                    {row.errors.length === 0 ? (
                      <span className="text-green-600 font-medium">Valid</span>
                    ) : (
                      <span className="text-red-500">{row.errors.join('; ')}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  }

  function renderImportingPhase() {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <Loader2 className="h-10 w-10 animate-spin text-brand-500" />
        <p className="text-sm font-medium text-slate-700">Enrolling students and provisioning parent accounts…</p>
        <p className="text-xs text-slate-400">Please wait while student and parent records are created.</p>
      </div>
    );
  }

  function downloadCreatedParentCredentials() {
    const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const rows = [
      'Admission No,Student Name,Parent Name,Login (Mobile),Password,Note',
      ...createdCreds.map((c) => [c.admission_number, c.full_name, c.parent, c.login, c.password, c.note].map(q).join(',')),
    ].join('\n');

    const blob = new Blob([rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `parent_credentials_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function renderDonePhase() {
    if (!importResult) return null;
    return (
      <div className="flex flex-col py-8 gap-4">
        <div className="flex flex-col items-center gap-2">
          {importResult.success > 0 && (
            <div className="flex flex-col items-center gap-2 text-green-600">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-6 w-6" />
                <span className="font-semibold">{importResult.success} student{importResult.success !== 1 ? 's' : ''} added successfully</span>
              </div>
              <p className="text-xs text-slate-500">
                ⚡ Parent accounts have been automatically created and linked for all {importResult.success} students.
              </p>
              <Button
                variant="outline"
                size="sm"
                icon={<Download className="h-4 w-4" />}
                onClick={downloadCreatedParentCredentials}
                className="mt-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50 shadow-2xs"
              >
                Download Parent Credentials (CSV)
              </Button>
            </div>
          )}
          {importResult.failed > 0 && (
            <div className="flex items-center gap-2 text-red-500">
              <XCircle className="h-6 w-6" />
              <span className="font-semibold">{importResult.failed} student{importResult.failed !== 1 ? 's' : ''} failed to import</span>
            </div>
          )}
          {importResult.success === 0 && importResult.failed === 0 && importResult.skipped.length === 0 && (
            <p className="text-sm text-slate-500">No students were imported.</p>
          )}
        </div>

        {/* Skipped rows (validation errors) */}
        {importResult.skipped.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="mb-2 text-xs font-semibold text-amber-700">
              Skipped Rows (validation errors) — {importResult.skipped.length} row{importResult.skipped.length !== 1 ? 's' : ''}
            </p>
            <ul className="space-y-0.5">
              {importResult.skipped.map((item) => (
                <li key={item.rowIndex} className="text-xs text-amber-800">
                  Row {item.rowIndex} ({item.admission_number || 'no admission no.'}): {item.errors.join('; ')}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Import errors */}
        {importResult.failedDetails.length > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <p className="mb-2 text-xs font-semibold text-red-700">
              Import Errors — {importResult.failedDetails.length} row{importResult.failedDetails.length !== 1 ? 's' : ''}
            </p>
            <ul className="space-y-0.5">
              {importResult.failedDetails.map((item) => (
                <li key={item.rowIndex} className="text-xs text-red-800">
                  Row {item.rowIndex} ({item.admission_number}): {item.error}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  // ----- Footer per phase -----

  function renderFooter() {
    if (phase === 'upload') {
      return <Button variant="outline" onClick={handleClose}>Cancel</Button>;
    }

    if (phase === 'preview') {
      return (
        <>
          <Button variant="outline" onClick={reset}>Back</Button>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button
            onClick={handleImport}
            loading={importing}
            disabled={validCount === 0}
          >
            Import {validCount} student{validCount !== 1 ? 's' : ''}
          </Button>
        </>
      );
    }

    if (phase === 'importing') {
      return null;
    }

    // done
    return <Button onClick={handleClose}>Done</Button>;
  }

  // ----- Title per phase -----

  const titles: Record<Phase, string> = {
    upload: 'Bulk Student Entry',
    preview: 'Preview CSV Data',
    importing: 'Importing Students…',
    done: 'Import Complete',
  };

  return (
    <Modal
      open={open}
      onClose={phase === 'importing' ? () => {} : handleClose}
      title={titles[phase]}
      description={
        phase === 'upload'
          ? 'Upload a CSV file to add multiple students at once'
          : phase === 'preview'
          ? 'Review the data before importing'
          : undefined
      }
      size="xl"
      footer={renderFooter() ?? undefined}
    >
      {phase === 'upload' && renderUploadPhase()}
      {phase === 'preview' && renderPreviewPhase()}
      {phase === 'importing' && renderImportingPhase()}
      {phase === 'done' && renderDonePhase()}
    </Modal>
  );
}
