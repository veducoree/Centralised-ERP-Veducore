import React, { useState, useEffect } from 'react';
import {
  FileText, CheckCircle, ScrollText, Award, Printer, Search,
  User, BookOpen, Hash, Calendar, Building2, Phone,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
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

const docTypes = [
  { id: 'bonafide' as DocType, icon: <ScrollText className="h-5 w-5 text-blue-600" />, title: 'Bonafide Certificate', desc: 'Confirms the student is currently enrolled.' },
  { id: 'transfer' as DocType, icon: <FileText className="h-5 w-5 text-blue-600" />, title: 'Transfer Certificate (TC)', desc: 'Issued when a student transfers to another school.' },
  { id: 'character' as DocType, icon: <Award className="h-5 w-5 text-blue-600" />, title: 'Character Certificate', desc: 'Attests the good conduct and character of the student.' },
  { id: 'fee_receipt' as DocType, icon: <Printer className="h-5 w-5 text-blue-600" />, title: 'Fee Receipt / No-Dues', desc: 'Certifies all fee dues have been cleared.' },
];

const includedItems = [
  { icon: <User className="h-5 w-5 text-blue-600" />, label: 'Student Full Name' },
  { icon: <Hash className="h-5 w-5 text-blue-600" />, label: 'Admission Number' },
  { icon: <BookOpen className="h-5 w-5 text-blue-600" />, label: 'Class & Section' },
  { icon: <Calendar className="h-5 w-5 text-blue-600" />, label: 'Date of Birth' },
  { icon: <User className="h-5 w-5 text-blue-600" />, label: "Father's Name" },
  { icon: <Building2 className="h-5 w-5 text-blue-600" />, label: 'School Name & Logo' },
  { icon: <Phone className="h-5 w-5 text-blue-600" />, label: 'School Address & Contact' },
  { icon: <Calendar className="h-5 w-5 text-blue-600" />, label: 'Academic Year' },
];

function sonOrDaughter(gender: string | null): string {
  return gender?.toLowerCase() === 'female' ? 'daughter' : 'son';
}

function todayDDMMYYYY(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

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
      return `This is to certify that ${name}, ${sd} of ${father}, bearing Admission No. ${adm}, is a bonafide student of this institution studying in Class ${cls}, Section ${sec}, during the academic year ${ay}. This certificate is issued on his/her request for the purpose of _______________.`;
    case 'transfer':
      return `This is to certify that ${name}, ${sd} of ${father}, bearing Admission No. ${adm}, was a student of this institution in Class ${cls}, Section ${sec}. He/She has been struck off from the rolls of this school w.e.f. _____________. His/Her conduct and character during his/her stay in this school was Good. He/She is hereby issued this Transfer Certificate.`;
    case 'character':
      return `This is to certify that ${name}, ${sd} of ${father}, bearing Admission No. ${adm}, studied in Class ${cls}, Section ${sec} at this institution. His/Her conduct and character during the entire period of study has been Good. We wish him/her all the best.`;
    case 'fee_receipt':
      return `This is to certify that ${name}, bearing Admission No. ${adm}, of Class ${cls}, Section ${sec}, has cleared all dues payable to this institution up to the academic year ${ay}. No amount is outstanding against the said student as on date.`;
  }
}

const PRINT_STYLES = `
@media print {
  body * { visibility: hidden !important; }
  #doc-print-area, #doc-print-area * { visibility: visible !important; }
  #doc-print-area {
    position: fixed; top: 0; left: 0; width: 100%;
    padding: 15mm; box-sizing: border-box;
  }
  @page { size: A4; margin: 15mm; }
}
`;

function DocumentPreview({ student, school, docType }: { student: Student; school: School | null; docType: DocType }) {
  const body = buildDocBody(docType, student, school);
  const title = DOC_LABELS[docType].toUpperCase();
  return (
    <div
      id="doc-print-area"
      className="mx-auto bg-white border border-gray-300 shadow-lg"
      style={{ maxWidth: '21cm', minHeight: '29.7cm', fontFamily: 'Georgia, "Times New Roman", serif', fontSize: '13px', lineHeight: '1.7', padding: '2cm 2.5cm', boxSizing: 'border-box' }}
    >
      <div className="flex items-start gap-4 mb-2">
        {school?.logo_url ? (
          <img src={school.logo_url} alt={school?.name ?? 'Logo'} style={{ height: '64px', width: 'auto', objectFit: 'contain', flexShrink: 0 }} />
        ) : (
          <div style={{ height: '64px', width: '64px', border: '1px dashed #aaa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#999', flexShrink: 0 }}>Logo</div>
        )}
        <div style={{ flex: 1, textAlign: 'center' }}>
          <p style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>{school?.name ?? 'School Name'}</p>
          {school?.address && <p style={{ fontSize: '12px', color: '#555', margin: '2px 0 0' }}>{school.address}</p>}
          <p style={{ fontSize: '12px', color: '#555', margin: '1px 0 0' }}>{[school?.contact_number, school?.email].filter(Boolean).join(' | ')}</p>
        </div>
      </div>
      <div style={{ borderBottom: '2px solid #1d4ed8', marginBottom: '12px' }} />
      <p style={{ textAlign: 'center', fontWeight: 700, fontSize: '15px', letterSpacing: '2px', textDecoration: 'underline', textTransform: 'uppercase', margin: '0 0 20px' }}>{title}</p>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
        <span style={{ color: '#555' }}>Cert. No.: ___________</span>
        <span style={{ color: '#555' }}>Date: {todayDDMMYYYY()}</span>
      </div>
      <p style={{ marginBottom: '12px' }}>To Whom It May Concern,</p>
      <p style={{ marginBottom: '40px', textAlign: 'justify' }}>{body}</p>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '60px' }}>
        <div style={{ border: '1px dashed #aaa', borderRadius: '4px', width: '100px', height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#bbb' }}>[School Stamp]</div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ marginBottom: '4px', color: '#555' }}>________________________</p>
          <p style={{ fontWeight: 600, margin: 0 }}>Principal / Authorised Signatory</p>
          <p style={{ fontSize: '11px', color: '#888', margin: '2px 0 0' }}>{school?.name ?? ''}</p>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function AdminDocuments() {
  const { profile } = useAuth();
  const [showGenerator, setShowGenerator] = useState(false);

  // Generator state
  const [students, setStudents] = useState<Student[]>([]);
  const [school, setSchool] = useState<School | null>(null);
  const [loading, setLoading] = useState(false);
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

  // Load students + school when generator opens
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

  if (showGenerator) {
    return (
      <DashboardLayout title="Documents">
        <style>{PRINT_STYLES}</style>
        {/* Sub-header */}
        <div className="mb-4 flex flex-wrap items-center gap-3 print:hidden">
          <button
            onClick={() => { setShowGenerator(false); setSelectedStudent(null); }}
            className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            ← Back to Documents
          </button>
          <span className="text-gray-300">|</span>
          <span className="text-sm font-semibold text-gray-800">Document Generator</span>
          <div className="ml-auto flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-sm">
              <label className="text-gray-500">Type:</label>
              <select value={docType} onChange={e => setDocType(e.target.value as DocType)} className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {(Object.keys(DOC_LABELS) as DocType[]).map(k => <option key={k} value={k}>{DOC_LABELS[k]}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <label className="text-gray-500">Class:</label>
              <select value={classFilter} onChange={e => setClassFilter(e.target.value)} className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {classes.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search student…" className="pl-8 pr-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <button onClick={() => window.print()} disabled={!selectedStudent} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              <Printer className="h-4 w-4" /> Export PDF
            </button>
          </div>
        </div>

        {/* Two-column layout */}
        <div className="flex gap-5 print:hidden" style={{ minHeight: '70vh' }}>
          {/* Student list */}
          <div className="w-64 flex-shrink-0 rounded-xl border border-gray-200 bg-white overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-10"><LoadingSpinner /></div>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-10">No students found</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {filtered.map(s => (
                  <li key={s.id}>
                    <button
                      onClick={() => setSelectedStudent(s)}
                      className={`w-full text-left px-4 py-3 transition-colors ${selectedStudent?.id === s.id ? 'bg-blue-50 border-l-2 border-blue-500' : 'hover:bg-gray-50'}`}
                    >
                      <p className="text-sm font-semibold text-gray-900">{s.full_name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">Adm: {s.admission_number}{s.class?.name ? ` · ${s.class.name}${s.section?.name ? '-' + s.section.name : ''}` : ''}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Preview */}
          <div className="flex-1 rounded-xl bg-gray-100 p-4 overflow-y-auto">
            {!selectedStudent ? (
              <div className="flex items-center justify-center h-full text-gray-400">
                <p className="text-sm">Select a student to preview the document.</p>
              </div>
            ) : (
              <DocumentPreview student={selectedStudent} school={school} docType={docType} />
            )}
          </div>
        </div>

        {/* Print-only */}
        {selectedStudent && (
          <div className="hidden print:block">
            <DocumentPreview student={selectedStudent} school={school} docType={docType} />
          </div>
        )}
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Documents">
      <div className="space-y-8">
        {/* Hero */}
        <Card className="p-6 sm:p-8">
          <h2 className="text-2xl font-bold text-gray-900">School Documents</h2>
          <p className="mt-2 text-sm text-gray-600 max-w-2xl">
            Issue official school documents on your letterhead — bonafide certificates, transfer certificates,
            character certificates, fee receipts, and more — with student data pulled directly from your ERP.
          </p>
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-3 py-1">
            <CheckCircle className="h-3.5 w-3.5 text-green-600" />
            <span className="text-xs font-medium text-green-700">School letterhead auto-applied from your school settings</span>
          </div>
          <div className="mt-5">
            <button
              onClick={() => setShowGenerator(true)}
              className="inline-flex items-center justify-center gap-2 rounded-lg h-10 px-5 text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            >
              <FileText className="h-4 w-4" />
              Generate Document
            </button>
          </div>
        </Card>

        {/* Document Types */}
        <div>
          <h3 className="text-xl font-bold text-gray-900 mb-4">Document Types Available</h3>
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

        {/* What's Included */}
        <div>
          <h3 className="text-xl font-bold text-gray-900 mb-4">What's Included on Every Document</h3>
          <Card className="p-6">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {includedItems.map((item) => (
                <div key={item.label} className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50">
                    {item.icon}
                  </div>
                  <span className="text-sm font-medium text-gray-700">{item.label}</span>
                </div>
              ))}
            </div>
            <p className="mt-5 text-xs text-gray-500 border-t border-gray-100 pt-4">
              ✅ All data pulled from your Veducore ERP automatically
            </p>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
