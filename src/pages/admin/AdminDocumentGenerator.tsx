import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer, Search } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { fetchStudents, fetchSchool } from '@/services/api';
import { LoadingSpinner } from '@/components/ui/Primitives';
import type { Student, School } from '@/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

type DocType = 'bonafide' | 'transfer' | 'character' | 'fee_receipt';

const DOC_LABELS: Record<DocType, string> = {
  bonafide: 'Bonafide Certificate',
  transfer: 'Transfer Certificate',
  character: 'Character Certificate',
  fee_receipt: 'Fee Receipt / No-Dues',
};

function sonOrDaughter(gender: string | null): string {
  return gender?.toLowerCase() === 'female' ? 'daughter' : 'son';
}

function todayDDMMYYYY(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// ── Print styles ──────────────────────────────────────────────────────────────

const PRINT_STYLES = `
@media print {
  body * { visibility: hidden !important; }
  #doc-print-area, #doc-print-area * { visibility: visible !important; }
  #doc-print-area {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    padding: 15mm;
    box-sizing: border-box;
  }
  @page { size: A4; margin: 15mm; }
}
`;

// ── Document body builder ─────────────────────────────────────────────────────

function buildDocBody(docType: DocType, student: Student, school: School | null): string {
  const name = student.full_name;
  const sd = sonOrDaughter(student.gender);
  const father = student.father_name ?? '___';
  const adm = student.admission_number;
  const cls = student.class?.name ?? '___';
  const sec = student.section?.name ?? '___';
  const ay = school?.academic_year ?? '____-__';

  switch (docType) {
    case 'bonafide':
      return (
        `This is to certify that ${name}, ${sd}/daughter of ${father}, bearing Admission No. ${adm}, ` +
        `is a bonafide student of this institution studying in Class ${cls}, Section ${sec}, ` +
        `during the academic year ${ay}. ` +
        `This certificate is issued on his/her request for the purpose of _______________.`
      );
    case 'transfer':
      return (
        `This is to certify that ${name}, ${sd}/daughter of ${father}, bearing Admission No. ${adm}, ` +
        `was a student of this institution in Class ${cls}, Section ${sec}. ` +
        `He/She has been struck off from the rolls of this school w.e.f. _____________. ` +
        `His/Her conduct and character during his/her stay in this school was Good. ` +
        `He/She is hereby issued this Transfer Certificate.`
      );
    case 'character':
      return (
        `This is to certify that ${name}, ${sd}/daughter of ${father}, bearing Admission No. ${adm}, ` +
        `studied in Class ${cls}, Section ${sec} at this institution. ` +
        `His/Her conduct and character during the entire period of study has been Good. ` +
        `We wish him/her all the best.`
      );
    case 'fee_receipt':
      return (
        `This is to certify that ${name}, bearing Admission No. ${adm}, ` +
        `of Class ${cls}, Section ${sec}, has cleared all dues payable to this institution ` +
        `up to the academic year ${ay}. ` +
        `No amount is outstanding against the said student as on date.`
      );
  }
}

// ── DocumentPreview component ─────────────────────────────────────────────────

function DocumentPreview({
  student,
  school,
  docType,
}: {
  student: Student;
  school: School | null;
  docType: DocType;
}) {
  const body = buildDocBody(docType, student, school);
  const title = DOC_LABELS[docType].toUpperCase();

  return (
    <div
      id="doc-print-area"
      className="mx-auto bg-white border border-gray-300 shadow-lg"
      style={{
        maxWidth: '21cm',
        minHeight: '29.7cm',
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontSize: '13px',
        lineHeight: '1.7',
        padding: '2cm 2.5cm',
        boxSizing: 'border-box',
      }}
    >
      {/* Letterhead */}
      <div className="flex items-start gap-4 mb-2">
        {school?.logo_url ? (
          <img
            src={school.logo_url}
            alt={school?.name ?? 'School Logo'}
            style={{ height: '64px', width: 'auto', objectFit: 'contain', flexShrink: 0 }}
          />
        ) : (
          <div
            style={{
              height: '64px',
              width: '64px',
              border: '1px dashed #aaa',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '10px',
              color: '#999',
              flexShrink: 0,
            }}
          >
            Logo
          </div>
        )}
        <div style={{ flex: 1, textAlign: 'center' }}>
          <p style={{ fontSize: '20px', fontWeight: 700, margin: 0, letterSpacing: '0.5px' }}>
            {school?.name ?? 'School Name'}
          </p>
          {school?.address && (
            <p style={{ fontSize: '12px', color: '#555', margin: '2px 0 0' }}>{school.address}</p>
          )}
          <p style={{ fontSize: '12px', color: '#555', margin: '1px 0 0' }}>
            {[school?.contact_number, school?.email].filter(Boolean).join(' | ')}
          </p>
        </div>
      </div>

      {/* Divider */}
      <div style={{ borderBottom: '2px solid #1d4ed8', marginBottom: '12px' }} />

      {/* Document title */}
      <p
        style={{
          textAlign: 'center',
          fontWeight: 700,
          fontSize: '15px',
          letterSpacing: '2px',
          textDecoration: 'underline',
          textTransform: 'uppercase',
          margin: '0 0 20px',
        }}
      >
        {title}
      </p>

      {/* Date + cert no */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
        <span style={{ color: '#555' }}>Cert. No.: ___________</span>
        <span style={{ color: '#555' }}>Date: {todayDDMMYYYY()}</span>
      </div>

      {/* Salutation */}
      <p style={{ marginBottom: '12px' }}>To Whom It May Concern,</p>

      {/* Body */}
      <p style={{ marginBottom: '40px', textAlign: 'justify' }}>{body}</p>

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '60px' }}>
        {/* Stamp placeholder */}
        <div
          style={{
            border: '1px dashed #aaa',
            borderRadius: '4px',
            width: '100px',
            height: '80px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '10px',
            color: '#bbb',
          }}
        >
          [School Stamp]
        </div>

        {/* Signature */}
        <div style={{ textAlign: 'right' }}>
          <p style={{ marginBottom: '4px', color: '#555' }}>________________________</p>
          <p style={{ fontWeight: 600, margin: 0 }}>Principal / Authorised Signatory</p>
          <p style={{ fontSize: '11px', color: '#888', margin: '2px 0 0' }}>{school?.name ?? ''}</p>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AdminDocumentGenerator() {
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [students, setStudents] = useState<Student[]>([]);
  const [school, setSchool] = useState<School | null>(null);
  const [loading, setLoading] = useState(true);
  const [docType, setDocType] = useState<DocType>('bonafide');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [classFilter, setClassFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Inject print styles
  useEffect(() => {
    const style = document.createElement('style');
    style.id = 'doc-print-style';
    style.textContent = PRINT_STYLES;
    document.head.appendChild(style);
    return () => { document.getElementById('doc-print-style')?.remove(); };
  }, []);

  // Fetch students + school
  useEffect(() => {
    if (!profile?.school_id) { setLoading(false); return; }
    setLoading(true);
    Promise.all([
      fetchStudents(profile.school_id),
      fetchSchool(profile.school_id),
    ])
      .then(([studs, sch]) => {
        setStudents(studs);
        setSchool(sch);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [profile?.school_id]);

  const classes = ['All', ...Array.from(new Set(students.map(s => s.class?.name ?? 'Unknown')))];

  const filtered = students.filter(s => {
    const matchesClass = classFilter === 'All' || s.class?.name === classFilter;
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      s.full_name.toLowerCase().includes(q) ||
      s.admission_number.toLowerCase().includes(q);
    return matchesClass && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-4 flex-wrap print:hidden">
        <button
          onClick={() => navigate('/admin/documents')}
          className="flex items-center gap-1.5 text-gray-600 hover:text-gray-900 text-sm transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <span className="font-semibold text-gray-800 text-sm">Document Generator — Veducore Staff</span>
        <div className="flex-1" />

        {/* Doc type */}
        <div className="flex items-center gap-2 text-sm">
          <label className="text-gray-500">Type:</label>
          <select
            value={docType}
            onChange={e => setDocType(e.target.value as DocType)}
            className="border border-gray-300 rounded-md px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {(Object.keys(DOC_LABELS) as DocType[]).map(k => (
              <option key={k} value={k}>{DOC_LABELS[k]}</option>
            ))}
          </select>
        </div>

        {/* Class filter */}
        <div className="flex items-center gap-2 text-sm">
          <label className="text-gray-500">Class:</label>
          <select
            value={classFilter}
            onChange={e => setClassFilter(e.target.value)}
            className="border border-gray-300 rounded-md px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            className="pl-8 pr-3 py-1.5 border border-gray-300 rounded-md text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Print */}
        <button
          onClick={() => window.print()}
          disabled={!selectedStudent}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Printer className="h-4 w-4" /> Export PDF
        </button>
      </div>

      {/* Two-column body */}
      <div className="flex gap-0 print:hidden" style={{ minHeight: 'calc(100vh - 57px)' }}>
        {/* Left — student list */}
        <div className="w-72 flex-shrink-0 border-r border-gray-200 bg-white overflow-y-auto">
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
                      className={`w-full text-left px-4 py-3 transition-colors ${
                        active
                          ? 'bg-blue-50 border-l-2 border-blue-500'
                          : 'hover:bg-gray-50'
                      }`}
                    >
                      <p className="text-sm font-semibold text-gray-900">{s.full_name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Adm: {s.admission_number}
                        {s.class?.name ? ` · ${s.class.name}${s.section?.name ? '-' + s.section.name : ''}` : ''}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Right — preview */}
        <div className="flex-1 p-6 overflow-y-auto bg-gray-100">
          {!selectedStudent ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
              <p className="text-base">Select a student on the left to preview the document.</p>
            </div>
          ) : (
            <DocumentPreview student={selectedStudent} school={school} docType={docType} />
          )}
        </div>
      </div>

      {/* Print-only full preview (when printing with a student selected) */}
      {selectedStudent && (
        <div className="hidden print:block">
          <DocumentPreview student={selectedStudent} school={school} docType={docType} />
        </div>
      )}
    </div>
  );
}
