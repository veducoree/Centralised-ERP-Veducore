// Print view: one A4 page per student on the school's own card design.
// Final printing is locked until every exam on the card is published.
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Lock, Printer } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { errorMessage } from '@/lib/timetable';
import { ReportCardSheet } from '@/lib/reportCard/ReportCardSheet';
import { loadAnnualCards, type AnnualCards } from '@/lib/reportCard/loadAnnual';

export default function AnnualReportCardsPrint() {
  const [params, setParams] = useSearchParams();
  const sessionId = params.get('session') ?? '';
  const sectionId = params.get('section') ?? '';
  const showBg = params.get('bg') !== '0';
  const { profile } = useAuth();
  const [data, setData] = useState<AnnualCards | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.school_id || !sessionId || !sectionId) return;
    loadAnnualCards({ schoolId: profile.school_id, sessionId, sectionId })
      .then((d) => {
        setData(d);
        document.title = `Report cards · ${d.className} - ${d.sectionName} · ${d.session.name}`;
      })
      .catch((err) => setError(errorMessage(err, 'Failed to prepare report cards')));
  }, [profile?.school_id, sessionId, sectionId]);

  if (!sessionId || !sectionId) return <p className="p-10 text-center text-slate-600">Choose a session and section from Annual Report Cards.</p>;
  if (error) return <p className="p-10 text-center text-red-600">{error}</p>;
  if (!data) return <p className="p-10 text-center text-slate-500">Preparing report cards…</p>;

  const pending = data.slots.filter((s) => s.problem);
  const orientation = data.template.orientation;

  return (
    <div className="min-h-screen bg-slate-200 print:bg-white">
      <style>{`
        @page { size: A4 ${orientation}; margin: 0; }
        @media print {
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
          .no-print { display: none !important; }
          .rc-page { margin: 0 !important; box-shadow: none !important; break-after: page; page-break-after: always; }
          .rc-page:last-child { break-after: auto; page-break-after: auto; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <div className="no-print sticky top-0 z-10 border-b border-slate-200 bg-white px-6 py-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">
            <b>{data.cards.length}</b> report card{data.cards.length === 1 ? '' : 's'} · {data.className} - {data.sectionName} · Session {data.session.name}
          </p>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox" checked={showBg} className="h-4 w-4 rounded border-slate-300"
                onChange={(e) => { const p = new URLSearchParams(params); p.set('bg', e.target.checked ? '1' : '0'); setParams(p, { replace: true }); }}
              />
              Print card design
            </label>
            <button
              onClick={() => window.print()}
              disabled={!data.ready || !data.cards.length}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {data.ready ? <Printer className="h-4 w-4" /> : <Lock className="h-4 w-4" />} Print / Save PDF
            </button>
          </div>
        </div>
        {!data.ready && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Preview only — final printing unlocks once every exam on the card is published
            ({pending.map((s) => `${s.label}: ${s.problem}`).join(' · ')}).
          </p>
        )}
        {data.warnings.length > 0 && (
          <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{data.warnings.join(' ')}</p>
        )}
        <p className="mt-2 text-[11px] text-slate-400">In the print dialog choose A4, Margins: None and Scale: 100% so fields land on the card's lines.</p>
      </div>

      <div className="flex flex-col items-center gap-6 py-6 print:block print:py-0">
        {data.cards.length === 0 && <p className="no-print text-sm text-slate-500">No active students in this section.</p>}
        {data.cards.map((c) => (
          <div key={c.studentId} className="rc-page bg-white shadow-lg">
            <ReportCardSheet
              template={data.template}
              values={c}
              showBackground={showBg}
              watermark={data.ready ? undefined : 'PREVIEW'}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
