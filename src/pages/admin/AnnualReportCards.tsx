// Annual report cards: link the card's exam columns to this session's exams,
// check a section, then print on the school's own card design.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, CheckCircle2, Clock3, Eye, FileSpreadsheet, Link2, Lock, Printer, SlidersHorizontal,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Form';
import { PageHeader, LoadingSpinner } from '@/components/ui/Primitives';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthContext';
import { usePermissions } from '@/auth/PermissionsContext';
import {
  fetchAcademicSessions, fetchClasses, fetchExams, fetchReportCardExamMap, fetchReportCardTemplate,
  setReportCardExamSlot, setReportCardPrintOffset,
} from '@/services/api';
import type { AcademicSession, Class, Exam, Section } from '@/types';
import { errorMessage } from '@/lib/timetable';
import { sortByClassOrder } from '@/lib/classOrder';
import { ReportCardSheet } from '@/lib/reportCard/ReportCardSheet';
import { loadAnnualCards, slotStatuses, type AnnualCards } from '@/lib/reportCard/loadAnnual';
import type { ReportCardTemplate } from '@/lib/reportCard/types';

const EXAM_STATUS: Record<string, string> = { draft: 'Draft', scheduled: 'Scheduled', published: 'Published', closed: 'Closed' };

export default function AnnualReportCards() {
  const { profile } = useAuth();
  const schoolId = profile?.school_id ?? '';
  const toast = useToast();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const canEdit = can('exams', 'edit');

  const [template, setTemplate] = useState<ReportCardTemplate | null | undefined>(undefined);
  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [classes, setClasses] = useState<(Class & { sections: Section[] })[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [map, setMap] = useState<Record<string, string>>({});
  const [sectionId, setSectionId] = useState('');
  const [check, setCheck] = useState<AnnualCards | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [savingSlot, setSavingSlot] = useState<string | null>(null);
  const [offset, setOffset] = useState({ x: '0', y: '0' });
  const [savingOffset, setSavingOffset] = useState(false);
  const [printBg, setPrintBg] = useState(true);

  // Template, sessions and classes.
  useEffect(() => {
    if (!schoolId) return;
    (async () => {
      try {
        const [t, ss, cls] = await Promise.all([fetchReportCardTemplate(schoolId), fetchAcademicSessions(schoolId), fetchClasses(schoolId)]);
        setTemplate(t);
        if (t) setOffset({ x: String(t.print_offset_x_mm), y: String(t.print_offset_y_mm) });
        setSessions(ss);
        setSessionId((ss.find((s) => s.is_current) ?? ss[0])?.id ?? '');
        setClasses(sortByClassOrder(cls));
      } catch (err) {
        toast(errorMessage(err, 'Failed to load report card setup'), 'error');
        setTemplate(null);
      }
    })();
  }, [schoolId, toast]);

  // Exams and links for the session.
  useEffect(() => {
    if (!schoolId || !sessionId) return;
    (async () => {
      try {
        const [ex, m] = await Promise.all([fetchExams(schoolId, sessionId), fetchReportCardExamMap(schoolId, sessionId)]);
        setExams(ex); setMap(m);
      } catch (err) {
        toast(errorMessage(err, 'Failed to load exams'), 'error');
      }
    })();
  }, [schoolId, sessionId, toast]);

  // Check the chosen section whenever something it depends on changes.
  const runCheck = useCallback(async () => {
    if (!schoolId || !sessionId || !sectionId || !template) { setCheck(null); return; }
    setChecking(true); setCheckError(null);
    try {
      setCheck(await loadAnnualCards({ schoolId, sessionId, sectionId }));
    } catch (err) {
      setCheck(null); setCheckError(errorMessage(err, 'Could not prepare the report cards'));
    } finally {
      setChecking(false);
    }
  }, [schoolId, sessionId, sectionId, template]);
  useEffect(() => { void runCheck(); }, [runCheck, map]);

  const statuses = useMemo(() => (template ? slotStatuses(template, exams, map) : []), [template, exams, map]);
  const linkedAll = statuses.length > 0 && statuses.every((s) => !s.problem);

  async function linkSlot(slotKey: string, examId: string) {
    setSavingSlot(slotKey);
    try {
      await setReportCardExamSlot(schoolId, sessionId, slotKey, examId || null);
      setMap((m) => {
        const next = { ...m };
        if (examId) next[slotKey] = examId; else delete next[slotKey];
        return next;
      });
    } catch (err) {
      toast(errorMessage(err, 'Failed to link exam'), 'error');
    } finally {
      setSavingSlot(null);
    }
  }

  async function saveOffset() {
    const x = Number(offset.x); const y = Number(offset.y);
    if (![x, y].every((v) => Number.isFinite(v) && Math.abs(v) <= 20)) { toast('Use a value between -20 and 20 mm', 'error'); return; }
    setSavingOffset(true);
    try {
      await setReportCardPrintOffset(x, y);
      setTemplate((t) => (t ? { ...t, print_offset_x_mm: x, print_offset_y_mm: y } : t));
      toast('Printer adjustment saved', 'success');
    } catch (err) {
      toast(errorMessage(err, 'Failed to save'), 'error');
    } finally {
      setSavingOffset(false);
    }
  }

  const openCards = () => {
    const q = new URLSearchParams({ session: sessionId, section: sectionId, bg: printBg ? '1' : '0' });
    window.open(`/admin/exams/annual-report-cards/print?${q}`, '_blank', 'noopener');
  };

  const header = (
    <PageHeader
      title="Annual Report Cards"
      description="Year-end report cards on your school's own design, filled from published exam results."
      action={<Button variant="outline" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate('/admin/exams')}>Exams</Button>}
    />
  );

  if (template === undefined) {
    return <DashboardLayout title="Annual Report Cards"><div className="space-y-6">{header}<LoadingSpinner variant="cards" /></div></DashboardLayout>;
  }

  if (!template) {
    return (
      <DashboardLayout title="Annual Report Cards">
        <div className="space-y-6">
          {header}
          <Card className="flex flex-col items-center py-16 text-center">
            <FileSpreadsheet className="mb-3 h-12 w-12 text-slate-300" />
            <p className="font-medium text-slate-700">Your report card design isn't set up yet</p>
            <p className="mb-4 max-w-md text-sm text-slate-500">
              Send your school's blank report card (PDF or a clear scan) to the Veducore team. Once they set it up,
              you can print every student's card here.
            </p>
            <Button variant="outline" onClick={() => navigate('/admin/support')}>Contact Veducore support</Button>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Annual Report Cards">
      <div className="space-y-6">
        {header}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-6">
            {/* 1. Exam columns */}
            <Card className="p-5">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 font-semibold text-slate-900"><Link2 className="h-4 w-4 text-brand-500" /> 1. Link exams to the card</p>
                  <p className="text-sm text-slate-500">Choose which of this session's exams fills each column on the card.</p>
                </div>
                <div className="w-44">
                  <Select fieldSize="sm" value={sessionId} onChange={(e) => setSessionId(e.target.value)} aria-label="Session">
                    {sessions.map((s) => <option key={s.id} value={s.id}>{s.name}{s.is_current ? ' (current)' : ''}</option>)}
                  </Select>
                </div>
              </div>
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-100">
                {statuses.map((s) => {
                  const slot = template.slots.find((x) => x.key === s.key);
                  return (
                    <div key={s.key} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <div className="min-w-[140px] flex-1">
                        <p className="text-sm font-semibold text-slate-800">{s.label}</p>
                        {slot?.max_marks ? <p className="text-xs text-slate-400">Card prints out of {slot.max_marks}</p> : null}
                      </div>
                      <div className="w-56">
                        <Select fieldSize="sm" value={map[s.key] ?? ''} disabled={!canEdit || savingSlot === s.key}
                          onChange={(e) => linkSlot(s.key, e.target.value)} aria-label={`Exam for ${s.label}`}>
                          <option value="">— Choose exam —</option>
                          {exams.map((e) => <option key={e.id} value={e.id}>{e.name} · {EXAM_STATUS[e.status] ?? e.status}</option>)}
                        </Select>
                      </div>
                      <span className={`inline-flex w-44 items-center gap-1.5 text-xs font-medium ${s.problem ? 'text-amber-700' : 'text-emerald-700'}`}>
                        {s.problem ? <Clock3 className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        {s.problem ?? 'Published'}
                      </span>
                    </div>
                  );
                })}
              </div>
              {exams.length === 0 && <p className="mt-3 text-sm text-slate-500">No exams in this session yet. Create them under Exams & Results.</p>}
            </Card>

            {/* 2. Section + checks */}
            <Card className="p-5">
              <p className="mb-1 flex items-center gap-2 font-semibold text-slate-900"><Eye className="h-4 w-4 text-brand-500" /> 2. Choose a section</p>
              <p className="mb-4 text-sm text-slate-500">Cards are printed one section at a time, one A4 page per student.</p>
              <div className="max-w-xs">
                <Select fieldSize="sm" value={sectionId} onChange={(e) => setSectionId(e.target.value)} aria-label="Section">
                  <option value="">— Choose section —</option>
                  {classes.map((c) => (
                    <optgroup key={c.id} label={c.name}>
                      {c.sections.map((s) => <option key={s.id} value={s.id}>{c.name} - {s.name}</option>)}
                    </optgroup>
                  ))}
                </Select>
              </div>

              {sectionId && (
                <div className="mt-4 space-y-3">
                  {checking && <p className="text-sm text-slate-500">Checking marks and attendance…</p>}
                  {checkError && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{checkError}</p>}
                  {check && !checking && (
                    <>
                      {check.ready ? (
                        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-800">
                          <CheckCircle2 className="h-4 w-4" /> All exams are published — {check.cards.length} final report card{check.cards.length === 1 ? '' : 's'} ready to print.
                        </div>
                      ) : (
                        <div className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                          <p className="flex items-center gap-2 font-medium"><Lock className="h-4 w-4" /> Final printing unlocks when every exam on the card is published.</p>
                          <ul className="mt-1 list-disc pl-10 text-xs">
                            {check.slots.filter((s) => s.problem).map((s) => <li key={s.key}>{s.label}: {s.problem}</li>)}
                          </ul>
                          <p className="mt-1 pl-6 text-xs">You can still open a preview (marked PREVIEW) to check the layout.</p>
                        </div>
                      )}
                      {check.warnings.length > 0 && (
                        <div className="rounded-xl border border-amber-200 px-3 py-2.5 text-xs text-amber-800">
                          <p className="mb-1 flex items-center gap-1.5 font-semibold"><AlertTriangle className="h-3.5 w-3.5" /> Please check</p>
                          <ul className="list-disc space-y-0.5 pl-5">{check.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-3 pt-1">
                        <label className="flex items-center gap-2 text-sm text-slate-600">
                          <input type="checkbox" checked={printBg} onChange={(e) => setPrintBg(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-600" />
                          Print the card design too (turn off for pre-printed cards)
                        </label>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" icon={<Eye className="h-4 w-4" />} onClick={openCards} disabled={!check.cards.length}>
                          {check.ready ? 'Open cards' : 'Open preview'}
                        </Button>
                        <Button icon={<Printer className="h-4 w-4" />} onClick={openCards} disabled={!check.ready || !check.cards.length}>
                          Print final report cards
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </Card>
          </div>

          {/* Side: preview + printer */}
          <div className="space-y-6">
            <Card className="p-5">
              <p className="mb-3 text-sm font-semibold text-slate-900">{check?.cards[0] ? 'First card in this section' : 'Your card design'}</p>
              <div className="flex justify-center overflow-hidden rounded-xl border border-slate-100 bg-slate-50 p-3">
                <div className="shadow-md">
                  <ReportCardSheet
                    template={template}
                    values={check?.cards[0] ?? null}
                    scale={template.orientation === 'portrait' ? '1.55px' : '1.1px'}
                    applyOffset={false}
                    photoPlaceholder
                    watermark={check && !check.ready ? 'PREVIEW' : undefined}
                  />
                </div>
              </div>
              {!linkedAll && <p className="mt-3 text-xs text-slate-500">Link every exam column to see marks on the card.</p>}
            </Card>

            <Card className="p-5">
              <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900"><SlidersHorizontal className="h-4 w-4 text-brand-500" /> Printer adjustment</p>
              <p className="mb-3 text-xs text-slate-500">
                If printed text sits slightly off the lines, shift everything here (mm). Positive moves right / down.
                In the print dialog choose A4, Margins: None, Scale: 100%.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Right (mm)" type="number" step="0.5" value={offset.x} onChange={(e) => setOffset((o) => ({ ...o, x: e.target.value }))} disabled={!canEdit} />
                <Input label="Down (mm)" type="number" step="0.5" value={offset.y} onChange={(e) => setOffset((o) => ({ ...o, y: e.target.value }))} disabled={!canEdit} />
              </div>
              {canEdit && <Button className="mt-3" variant="outline" size="sm" onClick={saveOffset} loading={savingOffset}>Save adjustment</Button>}
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
