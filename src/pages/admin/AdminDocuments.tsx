import React, { useState, useEffect, useRef } from 'react';
import {
  FileText, CheckCircle, ScrollText, Award, Printer, Search,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/auth/AuthContext';
import { fetchStudents, fetchSchool } from '@/services/api';
import { LoadingSpinner } from '@/components/ui/Primitives';
import type { Student, School } from '@/types';

// ── Types ─────────────────────────────────────────────────────────────────────

type DocType = 'bonafide' | 'transfer' | 'character' | 'fee_receipt';
type PageMode = 'letterhead' | 'normal';

const DOC_LABELS: Record<DocType, string> = {
  bonafide: 'Bonafide Certificate',
  transfer: 'Transfer Certificate',
  character: 'Character Certificate',
  fee_receipt: 'Fee Receipt / No-Dues',
};

const docTypes = [
  { id: 'bonafide' as DocType, icon: <ScrollText className="h-5 w-5 text-blue-600" />, title: 'Bonafide Certificate', desc: 'Confirms the student is currently enrolled.' },
  { id: 'transfer' as DocType, icon: <FileText className="h-5 w-5 text-blue-600" />, title: 'Transfer Certificate (TC)', desc: 'Issued when a student transfers to another school.' },
  { id: 'character' as DocType, icon: <Award className="h-5 w-5 text-blue-600" />, title: 'Character Certificate', desc: 'Attests the good conduct and character of the student.' },
  { id: 'fee_receipt' as DocType, icon: <Printer className="h-5 w-5 text-blue-600" />, title: 'Fee Receipt / No-Dues', desc: 'Certifies all fee dues have been cleared.' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function sonOrDaughter(gender: string | null): string {
  return gender?.toLowerCase() === 'female' ? 'daughter' : 'son';
}

function todayDDMMYYYY(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// Returns body parts so we can insert inline editable spans
function buildDocParts(docType: DocType, student: Student, school: School | null) {
  const name = student.full_name;
  const sd = sonOrDaughter(student.gender);
  const father = student.father_name ?? '___';
  const adm = student.admission_number;
  // Strip leading "Class " / "Grade " prefix so we don't double-print it
  const rawCls = student.class?.name ?? '___';
  const cls = rawCls.replace(/^(class|grade)\s+/i, '');
  const sec = student.section?.name ?? '___';
  const ay = school?.academic_year ?? '____-__';

  switch (docType) {
    case 'bonafide':
      return {
        pre: `This is to certify that ${name}, ${sd} of ${father}, bearing Admission No. ${adm}, is a bonafide student of this institution studying in Class ${cls}, Section ${sec}, during the academic year ${ay}. This certificate is issued on his/her request for the purpose of `,
        purposeField: true,
        post: '.',
      };
    case 'transfer':
      return {
        pre: `This is to certify that ${name}, ${sd} of ${father}, bearing Admission No. ${adm}, was a student of this institution in Class ${cls}, Section ${sec}. He/She has been struck off from the rolls of this school w.e.f. `,
        purposeField: false,
        datefield: true,
        post: `. His/Her conduct and character during his/her stay in this school was Good. He/She is hereby issued this Transfer Certificate.`,
      };
    case 'character':
      return {
        pre: `This is to certify that ${name}, ${sd} of ${father}, bearing Admission No. ${adm}, studied in Class ${cls}, Section ${sec} at this institution. His/Her conduct and character during the entire period of study has been Good. We wish him/her all the best.`,
        purposeField: false,
        post: '',
      };
    case 'fee_receipt':
      return {
        pre: `This is to certify that ${name}, bearing Admission No. ${adm}, of Class ${cls}, Section ${sec}, has cleared all dues payable to this institution up to the academic year ${ay}. No amount is outstanding against the said student as on date.`,
        purposeField: false,
        post: '',
      };
  }
}

// ── Inline editable span ──────────────────────────────────────────────────────

function EditableInline({
  value, onChange, placeholder, minWidth = '120px',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  minWidth?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  // Sync external value changes (e.g. student switch) without cursor jump
  useEffect(() => {
    if (ref.current && ref.current.textContent !== value) {
      ref.current.textContent = value;
    }
  }, [value]);

  return (
    <span
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      onInput={e => onChange((e.currentTarget.textContent ?? '').replace(/\n/g, ' '))}
      data-placeholder={placeholder}
      style={{
        display: 'inline-block',
        minWidth,
        borderBottom: '1.5px solid #1d4ed8',
        color: value ? '#111' : '#93c5fd',
        outline: 'none',
        cursor: 'text',
        padding: '0 2px',
      }}
    />
  );
}

// ── Print styles ──────────────────────────────────────────────────────────────

const PRINT_STYLES = `
@media print {
  body * { visibility: hidden !important; }
  #doc-print-area, #doc-print-area * { visibility: visible !important; }
  #doc-print-area {
    position: fixed;
    top: 0; left: 0;
    width: 100%;
    box-sizing: border-box;
  }
  #doc-print-area [contenteditable] {
    border-bottom-color: transparent !important;
  }
  @page { size: A4; margin: 0; }
}
`;

// ── EditableInline placeholder CSS ────────────────────────────────────────────

const EDITABLE_PLACEHOLDER_STYLES = `
[contenteditable]:empty::before {
  content: attr(data-placeholder);
  color: #93c5fd;
  pointer-events: none;
}
`;

// ── Document preview ──────────────────────────────────────────────────────────

interface PreviewFields {
  certNo: string;
  purpose: string;
  dateField: string;       // for TC date
  signatoryName: string;
}

function DocumentPreview({
  student, school, docType, pageMode, fields, onField,
}: {
  student: Student;
  school: School | null;
  docType: DocType;
  pageMode: PageMode;
  fields: PreviewFields;
  onField: (k: keyof PreviewFields, v: string) => void;
}) {
  const parts = buildDocParts(docType, student, school);
  const title = DOC_LABELS[docType].toUpperCase();
  const isLetterhead = pageMode === 'letterhead';
  const topPadding = isLetterhead ? '6cm' : '1.8cm';

  return (
    <div
      id="doc-print-area"
      className="mx-auto bg-white shadow-xl"
      style={{
        width: '21cm',
        minHeight: '29.7cm',
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontSize: '13px',
        lineHeight: '1.8',
        boxSizing: 'border-box',
        paddingTop: topPadding,
        paddingBottom: '2cm',
        paddingLeft: '2.5cm',
        paddingRight: '2.5cm',
        position: 'relative',
      }}
    >
      {/* ── Normal mode letterhead ── */}
      {!isLetterhead && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '10px' }}>
            {school?.logo_url ? (
              <img
                src={school.logo_url}
                alt={school?.name ?? 'Logo'}
                style={{ height: '72px', width: 'auto', objectFit: 'contain', flexShrink: 0 }}
              />
            ) : (
              <div style={{
                height: '72px', width: '72px', border: '1.5px dashed #ccc',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '10px', color: '#bbb', flexShrink: 0, borderRadius: '4px',
              }}>Logo</div>
            )}
            <div style={{ flex: 1, textAlign: 'center' }}>
              <p style={{ fontSize: '22px', fontWeight: 700, margin: 0, letterSpacing: '0.5px', color: '#1a1a1a' }}>
                {school?.name ?? 'School Name'}
              </p>
              {school?.address && (
                <p style={{ fontSize: '12px', color: '#666', margin: '3px 0 0' }}>{school.address}</p>
              )}
              {(school?.contact_number || school?.email) && (
                <p style={{ fontSize: '12px', color: '#666', margin: '2px 0 0' }}>
                  {[school?.contact_number, school?.email].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
          </div>
          <div style={{ borderTop: '2.5px solid #1d4ed8', borderBottom: '1px solid #93c5fd', paddingBottom: '2px', marginBottom: '20px' }} />
        </>
      )}

      {/* ── Letterhead mode: thin divider ── */}
      {isLetterhead && (
        <div style={{ borderTop: '1.5px solid #1d4ed8', marginBottom: '20px' }} />
      )}

      {/* Document title */}
      <p style={{
        textAlign: 'center', fontWeight: 700, fontSize: '14px',
        letterSpacing: '2.5px', textDecoration: 'underline',
        textDecorationColor: '#1d4ed8', textUnderlineOffset: '4px',
        textTransform: 'uppercase', margin: '0 0 22px', color: '#111',
      }}>
        {title}
      </p>

      {/* Cert no + date */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '18px', fontSize: '12px', color: '#555' }}>
        <span>
          Cert. No.:{' '}
          <EditableInline
            value={fields.certNo}
            onChange={v => onField('certNo', v)}
            placeholder="Enter cert. no."
            minWidth="100px"
          />
        </span>
        <span>Date: {todayDDMMYYYY()}</span>
      </div>

      {/* Salutation */}
      <p style={{ marginBottom: '14px', color: '#222' }}>To Whom It May Concern,</p>

      {/* Body — inline editable blanks */}
      <p style={{ marginBottom: '0', textAlign: 'justify', color: '#222', lineHeight: '2' }}>
        {parts.pre}
        {parts.purposeField && (
          <EditableInline
            value={fields.purpose}
            onChange={v => onField('purpose', v)}
            placeholder="type purpose here"
            minWidth="160px"
          />
        )}
        {(parts as { datefield?: boolean }).datefield && (
          <EditableInline
            value={fields.dateField}
            onChange={v => onField('dateField', v)}
            placeholder="DD/MM/YYYY"
            minWidth="100px"
          />
        )}
        {parts.post}
      </p>

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '72px' }}>

        {/* School stamp — clean empty box */}
        <div style={{
          border: '1.5px dashed #9ca3af',
          borderRadius: '6px',
          width: '110px',
          height: '90px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#d1d5db',
          fontSize: '11px',
          letterSpacing: '0.5px',
          userSelect: 'none',
        }}>
          Stamp Here
        </div>

        {/* Signature */}
        <div style={{ textAlign: 'right' }}>
          <div style={{ borderTop: '1px solid #555', width: '210px', marginBottom: '6px' }} />
          <EditableInline
            value={fields.signatoryName}
            onChange={v => onField('signatoryName', v)}
            placeholder="Signatory designation"
            minWidth="160px"
          />
          <p style={{ fontSize: '11px', color: '#777', margin: '3px 0 0' }}>{school?.name ?? ''}</p>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function AdminDocuments() {
  const { profile } = useAuth();
  const [showGenerator, setShowGenerator] = useState(false);

  const [students, setStudents] = useState<Student[]>([]);
  const [school, setSchool] = useState<School | null>(null);
  const [loading, setLoading] = useState(false);
  const [docType, setDocType] = useState<DocType>('bonafide');
  const [pageMode, setPageMode] = useState<PageMode>('normal');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [classFilter, setClassFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Editable document fields
  const [fields, setFields] = useState<PreviewFields>({
    certNo: '',
    purpose: '',
    dateField: '',
    signatoryName: 'Principal / Authorised Signatory',
  });

  function onField(k: keyof PreviewFields, v: string) {
    setFields(f => ({ ...f, [k]: v }));
  }

  // Reset per-doc fields when student or docType changes
  useEffect(() => {
    setFields(f => ({ ...f, certNo: '', purpose: '', dateField: '' }));
  }, [selectedStudent, docType]);

  useEffect(() => {
    const style = document.createElement('style');
    style.id = 'doc-print-style';
    style.textContent = PRINT_STYLES + EDITABLE_PLACEHOLDER_STYLES;
    document.head.appendChild(style);
    return () => { document.getElementById('doc-print-style')?.remove(); };
  }, []);

  useEffect(() => {
    if (!showGenerator || !profile?.school_id) return;
    setLoading(true);
    Promise.all([fetchStudents(profile.school_id), fetchSchool(profile.school_id)])
      .then(([studs, sch]) => { setStudents(studs); setSchool(sch); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [showGenerator, profile?.school_id]);

  const classes = ['All', ...Array.from(new Set(students.map(s => s.class?.name ?? 'Unknown')))];
  const filtered = students.filter(s => {
    const matchesClass = classFilter === 'All' || s.class?.name === classFilter;
    const q = searchQuery.toLowerCase();
    return matchesClass && (!q || s.full_name.toLowerCase().includes(q) || s.admission_number.toLowerCase().includes(q));
  });

  // ── Generator view ────────────────────────────────────────────────────────
  if (showGenerator) {
    return (
      <DashboardLayout title="Documents">
        <style>{PRINT_STYLES + EDITABLE_PLACEHOLDER_STYLES}</style>

        {/* Toolbar */}
        <div className="mb-4 flex flex-wrap items-center gap-3 print:hidden">
          <button
            onClick={() => { setShowGenerator(false); setSelectedStudent(null); }}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            ← Back
          </button>
          <span className="text-gray-300">|</span>
          <span className="text-sm font-semibold text-gray-800">Document Generator</span>

          <div className="ml-auto flex items-center gap-3 flex-wrap">
            {/* Doc type */}
            <div className="flex items-center gap-2">
              <label className="text-gray-500 text-xs font-medium">Type</label>
              <select
                value={docType}
                onChange={e => setDocType(e.target.value as DocType)}
                className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {(Object.keys(DOC_LABELS) as DocType[]).map(k => (
                  <option key={k} value={k}>{DOC_LABELS[k]}</option>
                ))}
              </select>
            </div>

            {/* Page mode toggle */}
            <div className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white p-0.5">
              <button
                onClick={() => setPageMode('normal')}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${pageMode === 'normal' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
              >
                Normal Page
              </button>
              <button
                onClick={() => setPageMode('letterhead')}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${pageMode === 'letterhead' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
              >
                Letterhead
              </button>
            </div>

            {/* Class */}
            <div className="flex items-center gap-2">
              <label className="text-gray-500 text-xs font-medium">Class</label>
              <select
                value={classFilter}
                onChange={e => setClassFilter(e.target.value)}
                className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {classes.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search student…"
                className="pl-8 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>

            {/* Print */}
            <button
              onClick={() => window.print()}
              disabled={!selectedStudent}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
            >
              <Printer className="h-4 w-4" /> Export PDF
            </button>
          </div>
        </div>

        {/* Two-column */}
        <div className="flex gap-4 print:hidden" style={{ minHeight: '72vh' }}>

          {/* Student list */}
          <div className="w-60 flex-shrink-0 rounded-xl border border-gray-200 bg-white overflow-y-auto">
            {loading ? (
              <div className="flex h-full min-h-[60vh] items-center justify-center p-4">
                <LoadingSpinner size="sm" variant="spinner" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-10">No students found</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {filtered.map(s => {
                  const active = selectedStudent?.id === s.id;
                  return (
                    <li key={s.id}>
                      <button
                        onClick={() => setSelectedStudent(s)}
                        className={`w-full text-left px-4 py-3 transition-colors ${active ? 'bg-blue-50 border-l-2 border-blue-500' : 'hover:bg-gray-50'}`}
                      >
                        <p className="text-sm font-semibold text-gray-900 truncate">{s.full_name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {s.admission_number}
                          {s.class?.name ? ` · ${s.class.name}${s.section?.name ? '-' + s.section.name : ''}` : ''}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Preview */}
          <div className="flex-1 rounded-xl bg-gray-300 p-6 overflow-y-auto flex items-start justify-center">
            {!selectedStudent ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2 mt-24">
                <FileText className="h-8 w-8 opacity-30" />
                <p className="text-sm">Select a student to preview the document</p>
                {pageMode === 'letterhead' && (
                  <p className="text-xs opacity-60 mt-1">Letterhead mode — top space left blank for pre-printed paper</p>
                )}
              </div>
            ) : (
              <DocumentPreview
                student={selectedStudent}
                school={school}
                docType={docType}
                pageMode={pageMode}
                fields={fields}
                onField={onField}
              />
            )}
          </div>
        </div>

        {/* Print-only */}
        {selectedStudent && (
          <div className="hidden print:block">
            <DocumentPreview
              student={selectedStudent}
              school={school}
              docType={docType}
              pageMode={pageMode}
              fields={fields}
              onField={onField}
            />
          </div>
        )}
      </DashboardLayout>
    );
  }

  // ── Landing view ──────────────────────────────────────────────────────────
  return (
    <DashboardLayout title="Documents">
      <div className="space-y-8">

        {/* Hero */}
        <Card className="p-6 sm:p-8">
          <h2 className="text-2xl font-bold text-gray-900">School Documents</h2>
          <p className="mt-2 text-sm text-gray-600 max-w-2xl">
            Issue official school documents — bonafide certificates, transfer certificates,
            character certificates, fee receipts, and more — with student data pulled directly from your ERP.
          </p>
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-3 py-1">
            <CheckCircle className="h-3.5 w-3.5 text-green-600" />
            <span className="text-xs font-medium text-green-700">School letterhead applied from your school settings</span>
          </div>
          <div className="mt-5">
            <button
              onClick={() => setShowGenerator(true)}
              className="inline-flex items-center justify-center gap-2 rounded-lg h-10 px-5 text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            >
              <FileText className="h-4 w-4" />
              Generate Document
            </button>
          </div>
        </Card>

        {/* Document Types */}
        <div>
          <h3 className="text-lg font-bold text-gray-900 mb-4">Document Types</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {docTypes.map((dt) => (
              <Card
                key={dt.id}
                className="p-5 flex flex-col gap-3 cursor-pointer hover:border-blue-300 hover:shadow-md transition-all"
                onClick={() => { setDocType(dt.id); setShowGenerator(true); }}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
                  {dt.icon}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{dt.title}</p>
                  <p className="mt-1 text-xs text-gray-500">{dt.desc}</p>
                </div>
                <span className="mt-auto text-xs text-blue-600 font-medium">Generate →</span>
              </Card>
            ))}
          </div>
        </div>

      </div>
    </DashboardLayout>
  );
}
