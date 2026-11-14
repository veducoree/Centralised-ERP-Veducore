import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import {
  fetchExam, fetchSchool, fetchExamResults, fetchStudentsBySection, fetchAttendanceSummary,
  fetchGradingScales, fetchAcademicSessions,
} from '@/services/api';
import type { Exam, School, ExamResultRow, Student, GradingScale, AcademicSession } from '@/types';

type Att = Record<string, { present: number; absent: number; late: number; on_leave: number; total: number }>;

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

/** Printable report cards: one A4 page per student in the section. */
export default function ExamReportCards() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const sectionId = params.get('section') ?? '';
  const { profile } = useAuth();

  const [exam, setExam] = useState<Exam | null>(null);
  const [school, setSchool] = useState<School | null>(null);
  const [results, setResults] = useState<ExamResultRow[]>([]);
  const [students, setStudents] = useState<Record<string, Student>>({});
  const [attendance, setAttendance] = useState<Att>({});
  const [scale, setScale] = useState<GradingScale | null>(null);
  const [session, setSession] = useState<AcademicSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.school_id || !sectionId) return;
    (async () => {
      try {
        const [e, sc, res, st, scales, sessions] = await Promise.all([
          fetchExam(id), fetchSchool(profile.school_id!), fetchExamResults(id, sectionId),
          fetchStudentsBySection(sectionId), fetchGradingScales(profile.school_id!), fetchAcademicSessions(profile.school_id!),
        ]);
        if (!e) throw new Error('Exam not found');
        setExam(e);
        setSchool(sc);
        setResults([...res].sort((a, b) => (a.roll_number ?? 9999) - (b.roll_number ?? 9999) || a.full_name.localeCompare(b.full_name)));
        setStudents(Object.fromEntries(st.map((s) => [s.id, s])));
        setScale(scales.find((g) => g.id === e.grading_scale_id) ?? scales.find((g) => g.is_default) ?? null);
        const sess = sessions.find((s) => s.id === e.session_id) ?? sessions.find((s) => s.is_current) ?? null;
        setSession(sess);
        if (sess) {
          const to = e.end_date && e.end_date < sess.end_date ? e.end_date : new Date().toISOString().slice(0, 10);
          setAttendance(await fetchAttendanceSummary(sectionId, sess.start_date, to < sess.end_date ? to : sess.end_date).catch(() => ({})));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load report cards');
      } finally { setLoading(false); }
    })();
  }, [id, sectionId, profile?.school_id]);

  if (!sectionId) return <p className="p-10 text-center text-slate-600">Choose a section from the exam's Report cards tab.</p>;
  if (loading) return <p className="p-10 text-center text-slate-500">Preparing report cards…</p>;
  if (error || !exam) return <p className="p-10 text-center text-red-600">{error ?? 'Exam not found'}</p>;

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      <style>{`
        @page { size: A4; margin: 12mm; }
        @media print { .no-print { display: none !important; } .card { box-shadow: none !important; margin: 0 !important; break-after: page; } .card:last-child { break-after: auto; } }
      `}</style>

      <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-3">
        <p className="text-sm text-slate-600"><b>{results.length}</b> report cards · {exam.name}{exam.status !== 'published' && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">Results not published yet</span>}</p>
        <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600">
          <Printer className="h-4 w-4" /> Print / Save PDF
        </button>
      </div>

      <div className="mx-auto max-w-[210mm] space-y-6 py-6 print:space-y-0 print:py-0">
        {results.map((r) => {
          const st = students[r.student_id];
          const att = attendance[r.student_id];
          const attPct = att?.total ? Math.round(((att.present + att.late) / att.total) * 100) : null;
          return (
            <div key={r.student_id} className="card mx-4 bg-white p-8 text-[13px] text-slate-800 shadow-sm print:mx-0 print:p-0">
              {/* School header */}
              <div className="flex items-center gap-4 border-b-2 border-slate-800 pb-4">
                {school?.logo_url && <img src={school.logo_url} alt="" className="h-16 w-16 object-contain" />}
                <div className="flex-1 text-center">
                  <h1 className="text-xl font-bold uppercase tracking-wide">{school?.name}</h1>
                  {school?.address && <p className="text-xs text-slate-600">{school.address}</p>}
                  <p className="text-xs text-slate-600">
                    {[school?.contact_number, school?.email].filter(Boolean).join(' · ')}
                    {school?.affiliation_board ? ` · ${school.affiliation_board}${school.affiliation_code ? ` (${school.affiliation_code})` : ''}` : ''}
                  </p>
                </div>
                {school?.logo_url && <div className="w-16" />}
              </div>
              <div className="my-4 text-center">
                <p className="text-base font-bold uppercase">Report Card</p>
                <p className="text-sm text-slate-600">{exam.name}{session ? ` · Session ${session.name}` : ''}</p>
              </div>

              {/* Student */}
              <table className="mb-4 w-full border border-slate-300">
                <tbody>
                  <tr className="border-b border-slate-300">
                    <td className="w-1/4 bg-slate-50 px-3 py-1.5 font-medium">Student</td><td className="px-3 py-1.5 font-semibold">{r.full_name}</td>
                    <td className="w-1/5 bg-slate-50 px-3 py-1.5 font-medium">Admission No.</td><td className="px-3 py-1.5">{r.admission_number}</td>
                  </tr>
                  <tr className="border-b border-slate-300">
                    <td className="bg-slate-50 px-3 py-1.5 font-medium">Class</td><td className="px-3 py-1.5">{r.class_name} - {r.section_name}</td>
                    <td className="bg-slate-50 px-3 py-1.5 font-medium">Roll No.</td><td className="px-3 py-1.5">{r.roll_number ?? '—'}</td>
                  </tr>
                  <tr>
                    <td className="bg-slate-50 px-3 py-1.5 font-medium">Father / Guardian</td><td className="px-3 py-1.5">{st?.father_name || st?.mother_name || '—'}</td>
                    <td className="bg-slate-50 px-3 py-1.5 font-medium">Date of Birth</td><td className="px-3 py-1.5">{fmtDate(st?.date_of_birth)}</td>
                  </tr>
                </tbody>
              </table>

              {/* Marks */}
              <table className="mb-4 w-full border border-slate-300 text-center">
                <thead className="bg-slate-800 text-white">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Subject</th>
                    <th className="px-3 py-2 font-semibold">Max Marks</th>
                    <th className="px-3 py-2 font-semibold">Pass Marks</th>
                    <th className="px-3 py-2 font-semibold">Marks Obtained</th>
                    <th className="px-3 py-2 font-semibold">Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {r.subjects.length === 0 ? (
                    <tr><td colSpan={5} className="px-3 py-4 text-slate-500">No marks recorded</td></tr>
                  ) : r.subjects.map((s) => (
                    <tr key={s.subject} className="border-t border-slate-300">
                      <td className="px-3 py-1.5 text-left">{s.subject}</td>
                      <td className="px-3 py-1.5">{Number(s.max_marks)}</td>
                      <td className="px-3 py-1.5">{Number(s.pass_marks)}</td>
                      <td className={`px-3 py-1.5 font-semibold ${Number(s.marks) < Number(s.pass_marks) ? 'text-red-600' : ''}`}>{Number(s.marks)}</td>
                      <td className="px-3 py-1.5">{s.grade ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
                {r.total !== null && (
                  <tfoot className="bg-slate-50 font-bold">
                    <tr className="border-t-2 border-slate-800">
                      <td className="px-3 py-2 text-left">Total</td>
                      <td className="px-3 py-2">{r.max_total}</td>
                      <td />
                      <td className="px-3 py-2">{r.total}</td>
                      <td className="px-3 py-2">{r.grade}</td>
                    </tr>
                  </tfoot>
                )}
              </table>

              {/* Summary */}
              <div className="mb-6 grid grid-cols-4 border border-slate-300 text-center">
                {[
                  ['Percentage', r.percent !== null ? `${r.percent.toFixed(2)}%` : '—'],
                  ['Rank in section', r.rank ?? '—'],
                  ['Result', r.percent === null ? 'Absent' : r.passed ? 'PASS' : 'NEEDS IMPROVEMENT'],
                  ['Attendance', att ? `${att.present + att.late}/${att.total}${attPct !== null ? ` (${attPct}%)` : ''}` : '—'],
                ].map(([label, value], i) => (
                  <div key={label as string} className={`px-2 py-2 ${i < 3 ? 'border-r border-slate-300' : ''}`}>
                    <p className="text-[11px] uppercase text-slate-500">{label}</p>
                    <p className="font-bold">{value}</p>
                  </div>
                ))}
              </div>

              <div className="mb-10">
                <p className="mb-1 font-medium">Class teacher's remarks</p>
                <div className="h-12 border-b border-dashed border-slate-400" />
              </div>

              <div className="grid grid-cols-3 gap-8 text-center text-xs">
                {['Class Teacher', 'Parent / Guardian', 'Principal'].map((s) => (
                  <div key={s}><div className="mb-1 h-10 border-b border-slate-500" />{s}</div>
                ))}
              </div>

              {scale && (
                <div className="mt-6 border-t border-slate-200 pt-2 text-[10px] text-slate-500">
                  Grading: {scale.bands.map((b, i) => {
                    const upper = i === 0 ? 100 : scale.bands[i - 1].min_percent - 1;
                    return `${b.grade} (${b.min_percent}–${upper}%)`;
                  }).join(' · ')} · Pass mark {scale.pass_percent}%
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
