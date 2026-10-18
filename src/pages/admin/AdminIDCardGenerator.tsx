import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { MOCK_SCHOOL } from '@/lib/mockData';
import type { Student } from '@/types';
import { useAuth } from '@/auth/AuthContext';
import { fetchStudents } from '@/services/api';
import { LoadingSpinner } from '@/components/ui/Primitives';

// ── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(p => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Barcode decorative element ────────────────────────────────────────────────

function BarcodeDecor() {
  const bars = [3, 1, 2, 1, 3, 2, 1, 2, 1, 3, 2, 1, 2, 3, 1, 2, 1, 3];
  return (
    <div className="flex items-end gap-px h-5 mt-1">
      {bars.map((w, i) => (
        <div
          key={i}
          style={{
            width: `${w * 2}px`,
            height: `${i % 3 === 0 ? 100 : i % 2 === 0 ? 75 : 55}%`,
          }}
          className="bg-current rounded-sm opacity-60"
        />
      ))}
    </div>
  );
}

// ── Row sub-components ────────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-[10px]">
      <span className="text-gray-400">{label}</span>
      <span className="text-gray-800 font-medium truncate ml-1 max-w-[60%] text-right">{value}</span>
    </div>
  );
}

function DarkRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-[10px]">
      <span className="text-yellow-500 font-medium">{label}</span>
      <span className="text-gray-300 truncate ml-1 max-w-[60%] text-right">{value}</span>
    </div>
  );
}

// ── Template 1 — Classic Blue ─────────────────────────────────────────────────

function Template1({ student }: { student: Student }) {
  return (
    <div
      className="w-full h-full bg-white rounded-lg overflow-hidden flex flex-col shadow border border-gray-200"
      style={{ fontFamily: 'sans-serif' }}
    >
      {/* Header */}
      <div className="bg-blue-800 px-3 py-2 text-center">
        <p className="text-white text-xs font-bold tracking-wide">{MOCK_SCHOOL.name}</p>
        <p className="text-blue-200 text-[10px]">Student Identity Card</p>
      </div>
      {/* Photo + info */}
      <div className="flex-1 flex gap-3 px-3 py-2 items-center">
        <div className="flex-shrink-0 h-14 w-14 rounded-full bg-blue-100 border-2 border-blue-300 flex items-center justify-center text-blue-700 font-bold text-lg overflow-hidden">
          {student.avatar_url ? (
            <img
              src={student.avatar_url}
              alt={student.full_name}
              className="h-full w-full rounded-full object-cover"
            />
          ) : (
            getInitials(student.full_name)
          )}
        </div>
        <div className="flex-1 min-w-0 space-y-0.5">
          <p className="text-gray-900 font-bold text-xs truncate">{student.full_name}</p>
          <div className="space-y-0.5">
            <Row
              label="Class"
              value={`${student.class?.name ?? ''}${student.section?.name ? ' - ' + student.section.name : ''}`}
            />
            <Row label="Adm No" value={student.admission_number} />
            <Row label="DOB" value={fmtDate(student.date_of_birth)} />
          </div>
        </div>
      </div>
      {/* Footer */}
      <div className="bg-blue-800 px-3 py-1 flex items-center justify-between">
        <span className="text-white text-[9px] font-medium tracking-wider">VALID 2024–25</span>
        <div className="text-white">
          <BarcodeDecor />
        </div>
      </div>
    </div>
  );
}

// ── Template 2 — Modern Dark ──────────────────────────────────────────────────

function Template2({ student }: { student: Student }) {
  return (
    <div
      className="w-full h-full rounded-lg overflow-hidden flex shadow"
      style={{ background: '#0f172a', fontFamily: 'sans-serif' }}
    >
      <div className="w-1.5 flex-shrink-0" style={{ background: '#f59e0b' }} />
      <div className="flex-1 p-3 flex flex-col">
        <p className="text-yellow-400 text-[10px] font-bold tracking-widest uppercase mb-2">
          {MOCK_SCHOOL.name}
        </p>
        <div className="flex gap-2 flex-1 items-center">
          <div className="h-14 w-14 rounded-md bg-slate-700 border border-slate-600 flex-shrink-0 flex items-center justify-center text-yellow-400 font-bold text-lg overflow-hidden">
            {student.avatar_url ? (
              <img
                src={student.avatar_url}
                alt={student.full_name}
                className="h-full w-full rounded-md object-cover"
              />
            ) : (
              getInitials(student.full_name)
            )}
          </div>
          <div className="flex-1 min-w-0 space-y-1">
            <p className="text-yellow-400 text-xs font-semibold truncate">{student.full_name}</p>
            <DarkRow
              label="Class"
              value={`${student.class?.name ?? ''}${student.section?.name ? ' - ' + student.section.name : ''}`}
            />
            <DarkRow label="Adm" value={student.admission_number} />
            <DarkRow label="DOB" value={fmtDate(student.date_of_birth)} />
          </div>
        </div>
        <div className="border-t border-slate-700 pt-1.5 mt-1 flex items-center justify-between">
          <p className="text-slate-500 text-[9px]">STUDENT ID CARD • 2024–25</p>
          <div className="text-slate-500">
            <BarcodeDecor />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Template 3 — Minimal Green ────────────────────────────────────────────────

function Template3({ student }: { student: Student }) {
  return (
    <div
      className="w-full h-full bg-white rounded-lg overflow-hidden flex flex-col shadow"
      style={{ borderLeft: '4px solid #16a34a', fontFamily: 'sans-serif' }}
    >
      <div className="px-3 pt-3 pb-1 border-b border-gray-100">
        <p className="text-green-600 text-xs font-bold">{MOCK_SCHOOL.name}</p>
        <p className="text-gray-400 text-[10px]">Student Identity Card</p>
      </div>
      <div className="flex-1 flex gap-3 px-3 py-2 items-center">
        <div className="h-12 w-12 rounded-full bg-green-50 border border-green-200 flex-shrink-0 flex items-center justify-center text-green-700 font-bold text-base overflow-hidden">
          {student.avatar_url ? (
            <img
              src={student.avatar_url}
              alt={student.full_name}
              className="h-full w-full rounded-full object-cover"
            />
          ) : (
            getInitials(student.full_name)
          )}
        </div>
        <div className="flex-1 min-w-0 space-y-0.5">
          <p className="text-green-700 font-bold text-xs truncate">{student.full_name}</p>
          <Row
            label="Class"
            value={`${student.class?.name ?? ''}${student.section?.name ? ' - ' + student.section.name : ''}`}
          />
          <Row label="Adm No" value={student.admission_number} />
          <Row label="DOB" value={fmtDate(student.date_of_birth)} />
        </div>
      </div>
      <div className="px-3 pb-2 flex items-center justify-between">
        <span className="text-green-600 text-[9px] font-medium">Valid 2024–25</span>
        <div className="text-green-600">
          <BarcodeDecor />
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

const PRINT_STYLES = `
@media print {
  body * { visibility: hidden !important; }
  #id-card-print-area, #id-card-print-area * { visibility: visible !important; }
  #id-card-print-area {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    padding: 10mm;
    box-sizing: border-box;
  }
  .id-card-item {
    width: 9cm;
    height: 6cm;
    page-break-inside: avoid;
    overflow: hidden;
    box-sizing: border-box;
  }
  #id-card-print-area {
    display: grid;
    grid-template-columns: repeat(2, 9cm);
    gap: 5mm;
  }
  @page { size: A4; margin: 10mm; }
}
`;

export default function AdminIDCardGenerator() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [template, setTemplate] = useState<1 | 2 | 3>(1);
  const [classFilter, setClassFilter] = useState('All');
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  // Inject print styles
  useEffect(() => {
    const style = document.createElement('style');
    style.id = 'idcard-print-style';
    style.textContent = PRINT_STYLES;
    document.head.appendChild(style);
    return () => {
      document.getElementById('idcard-print-style')?.remove();
    };
  }, []);

  // Fetch students from the API (so newly admitted students with their
  // stored photos appear here too — seed students come from localStorage
  // the same way in mock mode).
  useEffect(() => {
    if (!profile?.school_id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchStudents(profile.school_id)
      .then((data) => setStudents(data))
      .catch(() => setStudents([]))
      .finally(() => setLoading(false));
  }, [profile?.school_id]);

  const classes = [
    'All',
    ...Array.from(new Set(students.map(s => s.class?.name ?? 'Unknown'))),
  ];

  const filtered =
    classFilter === 'All'
      ? students
      : students.filter(s => s.class?.name === classFilter);

  function renderCard(student: Student) {
    if (template === 1) return <Template1 student={student} />;
    if (template === 2) return <Template2 student={student} />;
    return <Template3 student={student} />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-4 flex-wrap print:hidden">
        <button
          onClick={() => navigate('/admin/id-cards')}
          className="flex items-center gap-1.5 text-gray-600 hover:text-gray-900 text-sm transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <span className="font-semibold text-gray-800 text-sm">
          ID Card Generator — Veducore Staff
        </span>
        <div className="flex-1" />
        <div className="flex items-center gap-2 text-sm">
          <label className="text-gray-500">Template:</label>
          <select
            value={template}
            onChange={e => setTemplate(Number(e.target.value) as 1 | 2 | 3)}
            className="border border-gray-300 rounded-md px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value={1}>Classic Blue</option>
            <option value={2}>Modern Dark</option>
            <option value={3}>Minimal Green</option>
          </select>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <label className="text-gray-500">Class:</label>
          <select
            value={classFilter}
            onChange={e => setClassFilter(e.target.value)}
            className="border border-gray-300 rounded-md px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {classes.map(c => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <Printer className="h-4 w-4" /> Export PDF
        </button>
      </div>

      {/* Cards grid */}
      {loading ? (
        <LoadingSpinner />
      ) : (
        <div
          id="id-card-print-area"
          className="p-6 grid grid-cols-2 gap-6 md:grid-cols-3"
        >
          {filtered.map(student => (
            <div
              key={student.id}
              className="id-card-item"
              style={{ aspectRatio: '9/6', minHeight: '160px' }}
            >
              {renderCard(student)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
