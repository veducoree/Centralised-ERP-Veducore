// Report card designer: upload a school's blank card, then place fields,
// the photo box and the marks grid on it. Positions are stored in mm.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, AlignCenter, AlignLeft, AlignRight, ArrowLeft, Bold, CheckCircle2, Copy, Eye, EyeOff,
  FileUp, Image as ImageIcon, Minus, Plus, Save, Table2, Trash2, Type, Undo2,
} from 'lucide-react';
import { errMsg, mgmtSupabase, type SchoolRecord } from '../api';
import { Badge, Button, Card, ErrorBanner, Field, LoadingBlock, cx, inputCls, toast } from '../ui';
import { ReportCardSheet } from '@/lib/reportCard/ReportCardSheet';
import { buildCards, sampleInput, SAMPLE_SCALE } from '@/lib/reportCard/engine';
import { prepareBackground } from '@/lib/reportCard/background';
import {
  defaultFill, emptyTemplate, evenEdges, newId, newPhoto, newTable, newText, NO_FILL, parseTemplate, resizeGrid,
} from '@/lib/reportCard/template';
import {
  FIELD_OPTIONS, pageSize,
  type ColDef, type ColRole, type Element, type FieldKey, type ReportCardTemplate, type RowRole, type Slot,
  type SummaryKind, type TableElement, type TextElement,
} from '@/lib/reportCard/types';

const BUCKET = 'report-cards';

function db() {
  if (!mgmtSupabase) throw new Error('Supabase is not configured');
  return mgmtSupabase;
}

const removeFiles = (paths: string[]) => {
  if (paths.length) void db().storage.from(BUCKET).remove(paths).then(() => {}, () => {});
};

const fieldLabel = (k: FieldKey) => FIELD_OPTIONS.find((f) => f.key === k)?.label ?? k;
const round1 = (v: number) => Math.round(v * 10) / 10;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** What the template stores — used to tell whether there are unsaved changes. */
const persistKey = (t: ReportCardTemplate) =>
  JSON.stringify([t.name, t.background_url, t.orientation, t.slots, t.elements]);

const SUMMARY_LABELS: Record<SummaryKind, string> = {
  total: 'Total', percentage: 'Percentage', grade: 'Grade', rank: 'Rank', attendance: 'Attendance',
};
const ROW_TYPES: { v: RowRole['type']; label: string }[] = [
  { v: 'none', label: 'Not filled (heading / blank)' },
  { v: 'subject', label: 'Subject' },
  { v: 'total', label: 'TOTAL row' },
  { v: 'percentage', label: 'PERCENTAGE row' },
  { v: 'grade', label: 'GRADE row' },
  { v: 'rank', label: 'RANK row' },
  { v: 'attendance', label: 'ATTENDANCE row' },
];
const COL_TYPES: { v: ColRole['type']; label: string }[] = [
  { v: 'none', label: 'Not filled (subject names / heading)' },
  { v: 'slot', label: 'Marks of one exam' },
  { v: 'sum', label: 'Total of exams' },
  { v: 'grade', label: 'Grade of exams' },
];

function colShortLabel(role: ColRole, slots: Slot[]) {
  const name = (k: string) => slots.find((s) => s.key === k)?.label ?? '?';
  if (role.type === 'slot') return name(role.slot);
  if (role.type === 'sum') return role.slots.length ? `Σ ${role.slots.map(name).join(' + ')}` : 'Σ (pick exams)';
  if (role.type === 'grade') return role.slots.length ? `Grade ${role.slots.map(name).join(' + ')}` : 'Grade (pick exams)';
  return '';
}

function rowShortLabel(row: RowRole) {
  if (row.type === 'subject') return row.name || 'Subject';
  if (row.type === 'none') return '';
  return row.type.toUpperCase();
}

/** Lines pasted into "Fill rows": subject names, or TOTAL / PERCENTAGE / … and "-" for skip. */
function rowFromLine(line: string): RowRole {
  const t = line.trim();
  const k = t.toLowerCase();
  if (!t || t === '-') return { type: 'none' };
  if (k === 'total' || k === 'grand total') return { type: 'total' };
  if (k === 'percentage' || k === '%') return { type: 'percentage' };
  if (k === 'grade') return { type: 'grade' };
  if (k === 'rank' || k === 'position') return { type: 'rank' };
  if (k === 'attendance') return { type: 'attendance' };
  return { type: 'subject', name: t, aliases: '' };
}

// ── Small inputs ─────────────────────────────────────────────────────────────

function NumInput({ value, onChange, step = 0.5, min, max, className }: {
  value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; className?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  const commit = () => {
    const v = parseFloat(draft);
    if (Number.isFinite(v)) onChange(clamp(v, min ?? -Infinity, max ?? Infinity));
    else setDraft(String(value));
  };
  return (
    <input
      type="number" step={step} value={draft} min={min} max={max}
      onChange={(e) => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
      className={cx(inputCls, 'px-2.5 py-1.5', className)}
    />
  );
}

type BoxPatch = { x?: number; y?: number; w?: number; h?: number };

function BoxInputs({ el, onChange }: { el: Element; onChange: (p: BoxPatch) => void }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {(['x', 'y', 'w', 'h'] as const).map((k) => (
        <label key={k} className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase text-slate-400">{k === 'w' ? 'Width' : k === 'h' ? 'Height' : k.toUpperCase()} mm</span>
          <NumInput value={round1(el[k])} min={k === 'w' || k === 'h' ? 2 : -50} onChange={(v) => onChange({ [k]: v })} />
        </label>
      ))}
    </div>
  );
}

// ── Designer ─────────────────────────────────────────────────────────────────

type DragMode = 'move' | 'resize' | 'row' | 'col';
interface DragState {
  id: string; mode: DragMode; idx: number; startX: number; startY: number; orig: Element;
  moved: boolean; rect: DOMRect;
}

export default function ReportCardDesigner({ school, onBack, onSaved, embedded = false, onDirtyChange }: {
  school: SchoolRecord; onBack: () => void; onSaved: () => void;
  /** Shown inside the school panel: no back button. */
  embedded?: boolean;
  /** Told whenever unsaved changes appear / are saved, so the panel can warn before closing. */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [tpl, setTpl] = useState<ReportCardTemplate | null>(null);
  const [savedKey, setSavedKey] = useState('');
  const [savedBgPath, setSavedBgPath] = useState<string | null>(null);
  const [exists, setExists] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cell, setCell] = useState<{ r: number; c: number } | null>(null);
  const [preview, setPreview] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [bgRatio, setBgRatio] = useState<number | null>(null);
  const [canvasW, setCanvasW] = useState(700);
  const history = useRef<ReportCardTemplate[]>([]);
  const uploadedPaths = useRef<string[]>([]);
  const drag = useRef<DragState | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Load ──
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data, error: e } = await db().from('report_card_templates').select('*').eq('school_id', school.id).maybeSingle();
      if (e) throw e;
      const t = data ? parseTemplate(data as Record<string, unknown>) : emptyTemplate(school.id);
      setTpl(t); setSavedKey(persistKey(t)); setSavedBgPath(t.background_path); setExists(!!data);
      history.current = [];
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, [school.id]);
  useEffect(() => { void load(); }, [load]);

  // ── Canvas size ──
  useEffect(() => {
    const node = canvasRef.current;
    if (!node) return;
    const ro = new ResizeObserver(([entry]) => setCanvasW(entry.contentRect.width));
    ro.observe(node);
    return () => ro.disconnect();
  }, [loading]);

  useEffect(() => {
    if (!tpl?.background_url) { setBgRatio(null); return; }
    const img = new Image();
    img.onload = () => setBgRatio(img.naturalWidth / img.naturalHeight);
    img.src = tpl.background_url;
  }, [tpl?.background_url]);

  const page = pageSize(tpl?.orientation ?? 'portrait');
  const ppm = (Math.min(canvasW, 860) / page.w) * zoom;
  const dirty = !!tpl && persistKey(tpl) !== savedKey;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  // ── Editing helpers ──
  const change = useCallback((fn: (t: ReportCardTemplate) => ReportCardTemplate, record = true) => {
    setTpl((t) => {
      if (!t) return t;
      if (record) {
        history.current.push(t);
        if (history.current.length > 120) history.current.shift();
      }
      return fn(t);
    });
  }, []);

  const updateEl = useCallback((id: string, patch: Partial<Element> | ((e: Element) => Element), record = true) => {
    change((t) => ({
      ...t,
      elements: t.elements.map((e) => (e.id !== id ? e : typeof patch === 'function' ? patch(e) : ({ ...e, ...patch } as Element))),
    }), record);
  }, [change]);

  const undo = useCallback(() => {
    const prev = history.current.pop();
    if (prev) setTpl(prev);
  }, []);

  const selected = tpl?.elements.find((e) => e.id === selectedId) ?? null;

  const addElement = (el: Element) => {
    change((t) => ({ ...t, elements: [...t.elements, el] }));
    setSelectedId(el.id); setCell(null);
  };

  const removeSelected = useCallback(() => {
    if (!selectedId) return;
    change((t) => ({ ...t, elements: t.elements.filter((e) => e.id !== selectedId) }));
    setSelectedId(null); setCell(null);
  }, [selectedId, change]);

  const duplicateSelected = () => {
    if (!selected) return;
    const copy = { ...structuredClone(selected), id: newId(), x: selected.x + 4, y: selected.y + 4 } as Element;
    addElement(copy);
  };

  // ── Keyboard ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
      if (!selectedId) return;
      if (e.key === 'Escape') { setSelectedId(null); setCell(null); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSelected(); return; }
      const step = e.shiftKey ? 2 : 0.5;
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (d) {
        e.preventDefault();
        updateEl(selectedId, (el) => ({ ...el, x: round1(el.x + d[0]), y: round1(el.y + d[1]) }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, undo, removeSelected, updateEl]);

  // ── Pointer: move, resize and grid lines ──
  const startDrag = (e: React.PointerEvent, el: Element, mode: DragMode, idx = 0) => {
    if (e.button !== 0) return;
    e.stopPropagation(); e.preventDefault();
    const box = (mode === 'move' ? e.currentTarget : e.currentTarget.closest('[data-el]')) as HTMLElement;
    drag.current = {
      id: el.id, mode, idx, startX: e.clientX, startY: e.clientY, orig: structuredClone(el), moved: false,
      rect: box.getBoundingClientRect(),
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    if (selectedId !== el.id) setCell(null);
    setSelectedId(el.id);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dxPx = e.clientX - d.startX;
    const dyPx = e.clientY - d.startY;
    if (!d.moved && Math.abs(dxPx) + Math.abs(dyPx) < 3) return;
    if (!d.moved) { d.moved = true; history.current.push(tpl!); }
    const fine = e.altKey;
    const snap = (v: number) => (fine ? round1(v) : Math.round(v * 2) / 2);
    const dx = dxPx / ppm;
    const dy = dyPx / ppm;
    const o = d.orig;
    if (d.mode === 'move') {
      updateEl(d.id, { x: snap(clamp(o.x + dx, -o.w + 2, page.w - 2)), y: snap(clamp(o.y + dy, -o.h + 2, page.h - 2)) }, false);
    } else if (d.mode === 'resize') {
      updateEl(d.id, { w: snap(Math.max(3, o.w + dx)), h: snap(Math.max(3, o.h + dy)) }, false);
    } else if (o.kind === 'table') {
      const key = d.mode === 'row' ? 'row_edges' : 'col_edges';
      const edges = [...o[key]];
      const delta = d.mode === 'row' ? dy / o.h : dx / o.w;
      edges[d.idx] = clamp(o[key][d.idx] + delta, edges[d.idx - 1] + 0.004, edges[d.idx + 1] - 0.004);
      updateEl(d.id, (el) => ({ ...el, [key]: edges } as Element), false);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved || d.mode !== 'move' || d.orig.kind !== 'table') return;
    // A click (no drag) on a table picks the cell under the pointer.
    const t = d.orig;
    const fx = (e.clientX - d.rect.left) / d.rect.width;
    const fy = (e.clientY - d.rect.top) / d.rect.height;
    const r = t.row_edges.findIndex((v, i) => i < t.rows.length && fy >= v && fy < t.row_edges[i + 1]);
    const c = t.col_edges.findIndex((v, i) => i < t.cols.length && fx >= v && fx < t.col_edges[i + 1]);
    if (r >= 0 && c >= 0) setCell({ r, c });
  };

  // ── Background upload ──
  const onFile = async (file: File | undefined) => {
    if (!file || !tpl) return;
    setUploading(true);
    try {
      const bg = await prepareBackground(file);
      const path = `${school.id}/${crypto.randomUUID()}.jpg`;
      const { error: e } = await db().storage.from(BUCKET).upload(path, bg.blob, {
        contentType: 'image/jpeg', cacheControl: '31536000', upsert: false,
      });
      if (e) throw e;
      uploadedPaths.current.push(path);
      const url = db().storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      change((t) => ({ ...t, background_url: url, background_path: path, orientation: bg.width > bg.height ? 'landscape' : 'portrait' }));
      toast('Card uploaded — now place the fields on it');
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // ── Save / leave / delete ──
  const save = async () => {
    if (!tpl) return;
    setSaving(true);
    try {
      const payload = {
        school_id: school.id, name: tpl.name.trim() || 'Annual report card',
        background_url: tpl.background_url, background_path: tpl.background_path,
        orientation: tpl.orientation, slots: tpl.slots, elements: tpl.elements, is_active: true,
      };
      const { data, error: e } = await db().from('report_card_templates').upsert(payload, { onConflict: 'school_id' }).select().single();
      if (e) throw e;
      // Images that are no longer used: replaced backgrounds and unsaved uploads.
      const unused = [...uploadedPaths.current, savedBgPath].filter((p): p is string => !!p && p !== tpl.background_path);
      removeFiles(unused);
      uploadedPaths.current = [];
      const t = parseTemplate(data as Record<string, unknown>);
      setTpl(t); setSavedKey(persistKey(t)); setSavedBgPath(t.background_path); setExists(true);
      toast('Report card template saved');
      onSaved();
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const leave = () => {
    if (dirty && !window.confirm('You have unsaved changes. Leave without saving?')) return;
    removeFiles(uploadedPaths.current.filter((p) => p !== savedBgPath));
    uploadedPaths.current = [];
    onBack();
  };

  const removeTemplate = async () => {
    if (!window.confirm(`Delete the report card template for ${school.name}? The school will no longer be able to print annual report cards until a new one is made.`)) return;
    try {
      const { error: e } = await db().from('report_card_templates').delete().eq('school_id', school.id);
      if (e) throw e;
      removeFiles([...uploadedPaths.current, savedBgPath].filter((p): p is string => !!p));
      uploadedPaths.current = [];
      toast('Template deleted');
      onSaved();
      onBack();
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  // ── Preview values ──
  const sample = useMemo(() => (tpl ? buildCards(sampleInput(tpl, SAMPLE_SCALE))[0] ?? null : null), [tpl]);

  // ── Checks ──
  const warnings = useMemo(() => {
    if (!tpl) return [];
    const w: string[] = [];
    if (!tpl.background_url) w.push('Upload the blank report card.');
    if (!tpl.slots.length) w.push('Add the exam columns this card has (e.g. Unit Test I, Half Yearly).');
    if (!tpl.elements.some((e) => e.kind === 'table')) w.push('Add the marks table.');
    if (bgRatio) {
      const want = page.w / page.h;
      if (Math.abs(bgRatio - want) / want > 0.03) w.push('The uploaded image is not A4-shaped, so it is stretched to fit the page. A flat scan cropped to the card edges prints best.');
    }
    const keys = new Set(tpl.slots.map((s) => s.key));
    tpl.elements.forEach((el) => {
      if (el.kind !== 'table') return;
      el.cols.forEach((c, i) => {
        const refs = c.role.type === 'slot' ? [c.role.slot] : c.role.type === 'sum' || c.role.type === 'grade' ? c.role.slots : [];
        if (c.role.type !== 'none' && (!refs.length || refs.some((k) => !keys.has(k)))) w.push(`Marks table, column ${i + 1}: choose the exam(s) it shows.`);
      });
      el.rows.forEach((r, i) => { if (r.type === 'subject' && !r.name.trim()) w.push(`Marks table, row ${i + 1}: enter the subject name.`); });
      if (!el.rows.some((r) => r.type === 'subject')) w.push('Marks table: mark which rows are subjects.');
      if (!el.cols.some((c) => c.role.type !== 'none')) w.push('Marks table: choose what each column shows.');
    });
    return w;
  }, [tpl, bgRatio, page.w, page.h]);

  if (loading) return <Card><LoadingBlock rows={6} /></Card>;
  if (error || !tpl) return <ErrorBanner message={error ?? 'Could not load the template'} onRetry={load} />;

  // ── Overlay (editor handles) ──
  const px = (v: number) => v * ppm;
  const overlay = (
    <div
      className="absolute inset-0"
      onPointerDown={(e) => { if (e.target === e.currentTarget) { setSelectedId(null); setCell(null); } }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { drag.current = null; }}
    >
      {tpl.elements.map((el) => {
        const isSel = el.id === selectedId;
        return (
          <div
            key={el.id}
            data-el
            onPointerDown={(e) => startDrag(e, el, 'move')}
            className={cx(
              'absolute cursor-move touch-none select-none',
              isSel ? 'outline outline-2 outline-indigo-500' : 'outline-dashed outline-1 outline-indigo-400/70 hover:outline-indigo-500',
              el.kind !== 'table' && !preview && 'bg-indigo-500/10',
            )}
            style={{ left: px(el.x), top: px(el.y), width: px(el.w), height: px(el.h) }}
          >
            {el.kind === 'text' && !preview && (
              <span className="pointer-events-none absolute inset-0 flex items-center overflow-hidden whitespace-nowrap px-1 text-[10px] font-semibold text-indigo-700">
                {el.field === 'custom' ? el.text || 'Text' : fieldLabel(el.field)}
              </span>
            )}
            {el.kind === 'photo' && !preview && (
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-indigo-700">Photo</span>
            )}
            {el.kind === 'table' && <TableGuides t={el} slots={tpl.slots} selected={isSel} cell={isSel ? cell : null} ppm={ppm} onLine={(e, mode, idx) => startDrag(e, el, mode, idx)} />}
            {isSel && (
              <div
                onPointerDown={(e) => startDrag(e, el, 'resize')}
                className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-nwse-resize rounded-sm border-2 border-white bg-indigo-600 shadow"
              />
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {!embedded && (
            <button onClick={leave} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50" title="Back to schools">
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-slate-900">{school.name}</p>
            <p className="text-xs text-slate-500">
              Annual report card · {exists ? 'template saved' : 'new template'}
              {dirty && <span className="ml-2 font-semibold text-amber-600">• unsaved changes</span>}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {exists && <Button variant="ghost" size="sm" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={removeTemplate}>Delete template</Button>}
          <Button icon={<Save className="h-4 w-4" />} onClick={save} loading={saving} disabled={!dirty}>Save template</Button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-100 bg-white p-2 shadow-sm">
        <input ref={fileRef} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        <Button variant="secondary" size="sm" icon={<FileUp className="h-3.5 w-3.5" />} loading={uploading} onClick={() => fileRef.current?.click()}>
          {tpl.background_url ? 'Replace card' : 'Upload blank card'}
        </Button>
        <span className="mx-1 h-5 w-px bg-slate-200" />
        <select
          className={cx(inputCls, 'w-auto py-1.5 text-xs')}
          value=""
          onChange={(e) => { if (e.target.value) addElement(newText(e.target.value as FieldKey, tpl.orientation)); }}
          disabled={!tpl.background_url}
        >
          <option value="">+ Add field…</option>
          {['Student', 'Class', 'Session', 'Result', 'Other'].map((g) => (
            <optgroup key={g} label={g}>
              {FIELD_OPTIONS.filter((f) => f.group === g).map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </optgroup>
          ))}
        </select>
        <Button variant="secondary" size="sm" icon={<ImageIcon className="h-3.5 w-3.5" />} disabled={!tpl.background_url} onClick={() => addElement(newPhoto(tpl.orientation))}>Photo box</Button>
        <Button variant="secondary" size="sm" icon={<Table2 className="h-3.5 w-3.5" />} disabled={!tpl.background_url} onClick={() => addElement(newTable(tpl.orientation))}>Marks table</Button>
        <span className="mx-1 h-5 w-px bg-slate-200" />
        <Button variant="ghost" size="sm" icon={<Undo2 className="h-3.5 w-3.5" />} onClick={undo} disabled={!history.current.length}>Undo</Button>
        <Button variant="ghost" size="sm" icon={preview ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />} onClick={() => setPreview((p) => !p)}>
          {preview ? 'Sample data on' : 'Sample data off'}
        </Button>
        <div className="ml-auto flex items-center gap-1">
          <button className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" onClick={() => setZoom((z) => Math.max(0.5, round1(z - 0.25)))} title="Zoom out"><Minus className="h-3.5 w-3.5" /></button>
          <span className="w-12 text-center text-xs font-semibold text-slate-600">{Math.round(zoom * 100)}%</span>
          <button className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" onClick={() => setZoom((z) => Math.min(3, round1(z + 0.25)))} title="Zoom in"><Plus className="h-3.5 w-3.5" /></button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* Canvas */}
        <div className="min-w-0 rounded-3xl border border-slate-100 bg-slate-100/70 p-4">
          <div ref={canvasRef} className="w-full">
            {tpl.background_url ? (
              <div className="max-h-[78vh] overflow-auto">
                <div className="mx-auto w-fit shadow-lg shadow-slate-300/60">
                  <ReportCardSheet
                    template={tpl}
                    values={preview ? sample : null}
                    scale={`${ppm}px`}
                    applyOffset={false}
                    photoPlaceholder
                    overlay={overlay}
                  />
                </div>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                className="flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-white px-6 py-24 text-center hover:border-indigo-400"
              >
                <FileUp className="mb-3 h-10 w-10 text-slate-300" />
                <p className="font-semibold text-slate-700">Upload the school's blank report card</p>
                <p className="mt-1 max-w-sm text-sm text-slate-500">PDF or a flat, straight scan/photo (PNG / JPG). Only the first page is used. It becomes the background every card is printed on.</p>
              </button>
            )}
          </div>
          {tpl.background_url && (
            <p className="mt-3 text-center text-[11px] text-slate-500">
              Drag to move · corner handle to resize · arrow keys nudge 0.5 mm (Shift = 2 mm) · hold Alt for fine drag · click a table cell to set its row/column
            </p>
          )}
        </div>

        {/* Inspector */}
        <div className="space-y-4">
          {warnings.length > 0 ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-amber-800"><AlertTriangle className="h-3.5 w-3.5" /> To finish</p>
              <ul className="list-disc space-y-0.5 pl-5 text-xs text-amber-800">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">
              <CheckCircle2 className="h-4 w-4" /> Template is complete{dirty ? ' — save it to publish to the school' : ''}.
            </div>
          )}

          {selected?.kind === 'text' && (
            <TextInspector el={selected} onChange={(p) => updateEl(selected.id, p)} onDelete={removeSelected} onDuplicate={duplicateSelected} />
          )}
          {selected?.kind === 'photo' && (
            <Card title="Photo box" subtitle="The student's photo fills this box. Blank if the student has no photo." bodyClassName="space-y-3">
              <BoxInputs el={selected} onChange={(p) => updateEl(selected.id, p)} />
              <ElementActions onDelete={removeSelected} onDuplicate={duplicateSelected} />
            </Card>
          )}
          {selected?.kind === 'table' && (
            <TableInspector
              t={selected} slots={tpl.slots} cell={cell} setCell={setCell}
              onChange={(fn) => updateEl(selected.id, (e) => fn(e as TableElement))}
              onDelete={removeSelected} onDuplicate={duplicateSelected}
            />
          )}
          {!selected && <CardSetup tpl={tpl} change={change} />}
        </div>
      </div>
    </div>
  );
}

// ── Table guides on the canvas ───────────────────────────────────────────────

function TableGuides({ t, slots, selected, cell, ppm, onLine }: {
  t: TableElement; slots: Slot[]; selected: boolean; cell: { r: number; c: number } | null; ppm: number;
  onLine: (e: React.PointerEvent, mode: 'row' | 'col', idx: number) => void;
}) {
  const H = t.h * ppm;
  const W = t.w * ppm;
  const line = selected ? 'bg-indigo-500/70' : 'bg-indigo-400/35';
  return (
    <>
      {cell && (
        <>
          <div className="pointer-events-none absolute left-0 right-0 bg-indigo-500/10" style={{ top: t.row_edges[cell.r] * H, height: (t.row_edges[cell.r + 1] - t.row_edges[cell.r]) * H }} />
          <div className="pointer-events-none absolute bottom-0 top-0 bg-indigo-500/10" style={{ left: t.col_edges[cell.c] * W, width: (t.col_edges[cell.c + 1] - t.col_edges[cell.c]) * W }} />
          <div className="pointer-events-none absolute bg-indigo-500/25 outline outline-1 outline-indigo-600" style={{
            top: t.row_edges[cell.r] * H, height: (t.row_edges[cell.r + 1] - t.row_edges[cell.r]) * H,
            left: t.col_edges[cell.c] * W, width: (t.col_edges[cell.c + 1] - t.col_edges[cell.c]) * W,
          }} />
        </>
      )}
      {t.row_edges.slice(1, -1).map((v, i) => (
        <div key={`r${i}`} className="absolute left-0 right-0" style={{ top: v * H - 3, height: 7 }}
          onPointerDown={selected ? (e) => onLine(e, 'row', i + 1) : undefined}>
          <div className={cx('pointer-events-none absolute left-0 right-0 top-[3px] h-px', line)} />
          {selected && <div className="absolute inset-0 cursor-row-resize" />}
        </div>
      ))}
      {t.col_edges.slice(1, -1).map((v, i) => (
        <div key={`c${i}`} className="absolute bottom-0 top-0" style={{ left: v * W - 3, width: 7 }}
          onPointerDown={selected ? (e) => onLine(e, 'col', i + 1) : undefined}>
          <div className={cx('pointer-events-none absolute bottom-0 top-0 left-[3px] w-px', line)} />
          {selected && <div className="absolute inset-0 cursor-col-resize" />}
        </div>
      ))}
      {selected && (
        <>
          {/* Column roles above the table, row roles to its right */}
          {t.cols.map((c, i) => {
            const label = colShortLabel(c.role, slots);
            if (!label) return null;
            return (
              <div key={`cl${i}`} className="pointer-events-none absolute -top-5 overflow-hidden whitespace-nowrap rounded bg-indigo-600 px-1 text-[9px] font-semibold leading-4 text-white"
                style={{ left: t.col_edges[i] * W, maxWidth: (t.col_edges[i + 1] - t.col_edges[i]) * W }}>
                {label}
              </div>
            );
          })}
          {t.rows.map((r, i) => {
            const label = rowShortLabel(r);
            if (!label) return null;
            return (
              <div key={`rl${i}`} className="pointer-events-none absolute left-full ml-1 overflow-hidden whitespace-nowrap rounded bg-slate-800/80 px-1 text-[9px] font-semibold text-white"
                style={{ top: t.row_edges[i] * H, height: Math.max(10, (t.row_edges[i + 1] - t.row_edges[i]) * H), lineHeight: `${Math.max(10, (t.row_edges[i + 1] - t.row_edges[i]) * H)}px` }}>
                {label}
              </div>
            );
          })}
        </>
      )}
    </>
  );
}

// ── Inspectors ───────────────────────────────────────────────────────────────

function ElementActions({ onDelete, onDuplicate }: { onDelete: () => void; onDuplicate: () => void }) {
  return (
    <div className="flex gap-2 pt-1">
      <Button variant="secondary" size="sm" icon={<Copy className="h-3.5 w-3.5" />} onClick={onDuplicate}>Duplicate</Button>
      <Button variant="ghost" size="sm" icon={<Trash2 className="h-3.5 w-3.5" />} className="text-rose-600 hover:bg-rose-50" onClick={onDelete}>Remove</Button>
    </div>
  );
}

function TextInspector({ el, onChange, onDelete, onDuplicate }: {
  el: TextElement; onChange: (p: Partial<TextElement>) => void; onDelete: () => void; onDuplicate: () => void;
}) {
  return (
    <Card title="Field" icon={<Type className="h-4 w-4" />} bodyClassName="space-y-3">
      <Field label="Shows">
        <select className={inputCls} value={el.field} onChange={(e) => onChange({ field: e.target.value as FieldKey })}>
          {['Student', 'Class', 'Session', 'Result', 'Other'].map((g) => (
            <optgroup key={g} label={g}>
              {FIELD_OPTIONS.filter((f) => f.group === g).map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </optgroup>
          ))}
        </select>
      </Field>
      {el.field === 'custom' && (
        <Field label="Text">
          <input className={inputCls} value={el.text ?? ''} onChange={(e) => onChange({ text: e.target.value })} />
        </Field>
      )}
      <div className="flex items-end gap-2">
        <label className="block w-24">
          <span className="mb-1 block text-[10px] font-semibold uppercase text-slate-400">Size pt</span>
          <NumInput value={el.font_size} step={0.5} min={5} max={40} onChange={(v) => onChange({ font_size: v })} />
        </label>
        <div className="flex rounded-xl border border-slate-200 p-0.5">
          {([['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]] as const).map(([a, Icon]) => (
            <button key={a} onClick={() => onChange({ align: a })} className={cx('rounded-lg p-1.5', el.align === a ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100')}>
              <Icon className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
        <button onClick={() => onChange({ bold: !el.bold })} className={cx('rounded-xl border p-2', el.bold ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 text-slate-500 hover:bg-slate-100')} title="Bold">
          <Bold className="h-3.5 w-3.5" />
        </button>
      </div>
      <BoxInputs el={el} onChange={onChange} />
      <p className="text-[11px] text-slate-400">Long values shrink to fit the box width. Empty values print nothing, so the line stays blank for handwriting.</p>
      <ElementActions onDelete={onDelete} onDuplicate={onDuplicate} />
    </Card>
  );
}

function TableInspector({ t, slots, cell, setCell, onChange, onDelete, onDuplicate }: {
  t: TableElement; slots: Slot[]; cell: { r: number; c: number } | null; setCell: (c: { r: number; c: number } | null) => void;
  onChange: (fn: (t: TableElement) => TableElement) => void; onDelete: () => void; onDuplicate: () => void;
}) {
  const [tab, setTab] = useState<'rows' | 'cols'>('rows');
  const [paste, setPaste] = useState('');
  const hasSummary = t.rows.some((r) => r.type !== 'none' && r.type !== 'subject');

  const setRow = (i: number, row: RowRole) => onChange((x) => ({ ...x, rows: x.rows.map((r, j) => (j === i ? row : r)) }));
  const setCol = (i: number, col: ColDef) => onChange((x) => ({ ...x, cols: x.cols.map((c, j) => (j === i ? col : c)) }));

  const applyPaste = () => {
    const lines = paste.split('\n').map((l) => l.trim()).filter((l) => l.length);
    if (!lines.length) return;
    const start = cell?.r ?? 0;
    onChange((x) => ({ ...x, rows: x.rows.map((r, i) => (i >= start && i - start < lines.length ? rowFromLine(lines[i - start]) : r)) }));
    setPaste('');
    toast(`${Math.min(lines.length, t.rows.length - start)} rows filled`);
  };

  const setRoleType = (i: number, type: ColRole['type']) => {
    const first = slots[0]?.key ?? '';
    const role: ColRole = type === 'slot' ? { type, slot: first } : type === 'sum' || type === 'grade' ? { type, slots: [] } : { type: 'none' };
    setCol(i, { role, fill: defaultFill(role) });
  };

  return (
    <Card title="Marks table" icon={<Table2 className="h-4 w-4" />} bodyClassName="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase text-slate-400">Rows</span>
          <NumInput value={t.rows.length} step={1} min={1} max={60} onChange={(v) => onChange((x) => resizeGrid(x, Math.round(v), x.cols.length))} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase text-slate-400">Columns</span>
          <NumInput value={t.cols.length} step={1} min={1} max={30} onChange={(v) => onChange((x) => resizeGrid(x, x.rows.length, Math.round(v)))} />
        </label>
      </div>
      <p className="text-[11px] leading-relaxed text-slate-500">
        Drag the table over the card's marks grid, set rows/columns to match, then drag the blue lines onto the printed lines.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => onChange((x) => ({ ...x, row_edges: evenEdges(x.rows.length) }))}>Even rows</Button>
        <Button variant="secondary" size="sm" onClick={() => onChange((x) => ({ ...x, col_edges: evenEdges(x.cols.length) }))}>Even columns</Button>
      </div>
      <div className="flex items-end gap-2">
        <label className="block w-24">
          <span className="mb-1 block text-[10px] font-semibold uppercase text-slate-400">Size pt</span>
          <NumInput value={t.font_size} step={0.5} min={5} max={24} onChange={(v) => onChange((x) => ({ ...x, font_size: v }))} />
        </label>
        <button onClick={() => onChange((x) => ({ ...x, bold: !x.bold }))} className={cx('rounded-xl border p-2', t.bold ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 text-slate-500 hover:bg-slate-100')} title="Bold">
          <Bold className="h-3.5 w-3.5" />
        </button>
      </div>
      <BoxInputs el={t} onChange={(p) => onChange((x) => ({ ...x, ...p } as TableElement))} />

      <div className="flex rounded-xl bg-slate-100 p-1">
        {(['rows', 'cols'] as const).map((k) => (
          <button key={k} onClick={() => setTab(k)} className={cx('flex-1 rounded-lg py-1.5 text-xs font-semibold', tab === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500')}>
            {k === 'rows' ? `Rows (${t.rows.length})` : `Columns (${t.cols.length})`}
          </button>
        ))}
      </div>

      {tab === 'rows' && (
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
            <p className="mb-1.5 text-[11px] font-semibold text-slate-600">
              Quick fill from row {(cell?.r ?? 0) + 1}: one per line — subject names, TOTAL, PERCENTAGE, GRADE, RANK, ATTENDANCE, or "-" to skip.
            </p>
            <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={4} className={cx(inputCls, 'font-mono text-xs')} placeholder={'-\nENGLISH\nHINDI\nMATHEMATICS\nTOTAL\nPERCENTAGE'} />
            <Button size="sm" className="mt-2" onClick={applyPaste} disabled={!paste.trim()}>Fill rows</Button>
          </div>
          <div className="max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
            {t.rows.map((row, i) => (
              <div key={i} className={cx('rounded-xl border p-2', cell?.r === i ? 'border-indigo-300 bg-indigo-50/60' : 'border-slate-100')}
                onClick={() => setCell({ r: i, c: cell?.c ?? 0 })}>
                <div className="flex items-center gap-2">
                  <span className="w-6 flex-shrink-0 text-center text-[11px] font-bold text-slate-400">{i + 1}</span>
                  <select className={cx(inputCls, 'py-1.5 text-xs')} value={row.type}
                    onChange={(e) => {
                      const v = e.target.value as RowRole['type'];
                      setRow(i, v === 'subject' ? { type: 'subject', name: row.type === 'subject' ? row.name : '', aliases: row.type === 'subject' ? row.aliases : '' } : ({ type: v } as RowRole));
                    }}>
                    {ROW_TYPES.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                  </select>
                </div>
                {row.type === 'subject' && (
                  <div className="mt-1.5 grid grid-cols-2 gap-1.5 pl-8">
                    <input className={cx(inputCls, 'py-1.5 text-xs')} placeholder="Subject on card" value={row.name}
                      onChange={(e) => setRow(i, { ...row, name: e.target.value })} />
                    <input className={cx(inputCls, 'py-1.5 text-xs')} placeholder="Other names, comma separated" value={row.aliases}
                      onChange={(e) => setRow(i, { ...row, aliases: e.target.value })} />
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="text-[11px] text-slate-400">Subjects are matched to each class's subjects by name; common names (Maths / Mathematics, EVS, SST, Computer…) match automatically. Add other names for anything unusual.</p>
        </div>
      )}

      {tab === 'cols' && (
        <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
          {!slots.length && <p className="rounded-xl bg-amber-50 p-2.5 text-xs text-amber-800">Add the card's exam columns first (click empty space on the card to open Card setup).</p>}
          {t.cols.map((col, i) => (
            <div key={i} className={cx('rounded-xl border p-2.5', cell?.c === i ? 'border-indigo-300 bg-indigo-50/60' : 'border-slate-100')}
              onClick={() => setCell({ r: cell?.r ?? 0, c: i })}>
              <div className="flex items-center gap-2">
                <span className="w-6 flex-shrink-0 text-center text-[11px] font-bold text-slate-400">{i + 1}</span>
                <select className={cx(inputCls, 'py-1.5 text-xs')} value={col.role.type} onChange={(e) => setRoleType(i, e.target.value as ColRole['type'])}>
                  {COL_TYPES.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                </select>
              </div>
              {col.role.type === 'slot' && (
                <div className="mt-1.5 pl-8">
                  <select className={cx(inputCls, 'py-1.5 text-xs')} value={col.role.slot}
                    onChange={(e) => setCol(i, { ...col, role: { type: 'slot', slot: e.target.value } })}>
                    <option value="">Choose exam…</option>
                    {slots.map((s) => <option key={s.key} value={s.key}>{s.label}{s.max_marks ? ` (${s.max_marks})` : ''}</option>)}
                  </select>
                </div>
              )}
              {(col.role.type === 'sum' || col.role.type === 'grade') && (
                <div className="mt-1.5 flex flex-wrap gap-1.5 pl-8">
                  {slots.map((s) => {
                    const role = col.role as Extract<ColRole, { slots: string[] }>;
                    const on = role.slots.includes(s.key);
                    return (
                      <button key={s.key}
                        onClick={(e) => {
                          e.stopPropagation();
                          const next = on ? role.slots.filter((k) => k !== s.key) : slots.map((x) => x.key).filter((k) => k === s.key || role.slots.includes(k));
                          setCol(i, { ...col, role: { ...role, slots: next } });
                        }}
                        className={cx('rounded-lg border px-2 py-1 text-[11px] font-semibold', on ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}>
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              )}
              {col.role.type !== 'none' && hasSummary && (
                <div className="mt-2 pl-8">
                  <p className="mb-1 text-[10px] font-semibold uppercase text-slate-400">Fills summary rows</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {(Object.keys(SUMMARY_LABELS) as SummaryKind[]).filter((k) => t.rows.some((r) => r.type === k)).map((k) => (
                      <label key={k} className="flex items-center gap-1 text-[11px] text-slate-600">
                        <input type="checkbox" className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600"
                          checked={col.fill[k]} onChange={(e) => setCol(i, { ...col, fill: { ...NO_FILL, ...col.fill, [k]: e.target.checked } })} />
                        {SUMMARY_LABELS[k]}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
          <p className="text-[11px] text-slate-400">Attendance in a column counts from the session start to that column's last exam.</p>
        </div>
      )}

      <ElementActions onDelete={onDelete} onDuplicate={onDuplicate} />
    </Card>
  );
}

function CardSetup({ tpl, change }: { tpl: ReportCardTemplate; change: (fn: (t: ReportCardTemplate) => ReportCardTemplate, record?: boolean) => void }) {
  const setSlots = (slots: Slot[]) => change((t) => ({
    ...t,
    slots,
    // Columns pointing at a removed exam go back to "not filled".
    elements: t.elements.map((el) => {
      if (el.kind !== 'table') return el;
      const keys = new Set(slots.map((s) => s.key));
      return {
        ...el,
        cols: el.cols.map((c): ColDef => {
          if (c.role.type === 'slot' && !keys.has(c.role.slot)) return { ...c, role: { ...c.role, slot: '' } };
          if (c.role.type === 'sum' || c.role.type === 'grade') return { ...c, role: { ...c.role, slots: c.role.slots.filter((k) => keys.has(k)) } };
          return c;
        }),
      };
    }),
  }));

  return (
    <Card title="Card setup" subtitle="Select a field on the card to edit it." bodyClassName="space-y-4">
      <Field label="Template name">
        <input className={inputCls} value={tpl.name} onChange={(e) => change((t) => ({ ...t, name: e.target.value }))} />
      </Field>
      <Field label="Page">
        <select className={inputCls} value={tpl.orientation} onChange={(e) => change((t) => ({ ...t, orientation: e.target.value as ReportCardTemplate['orientation'] }))}>
          <option value="portrait">A4 portrait</option>
          <option value="landscape">A4 landscape</option>
        </select>
      </Field>

      <div>
        <p className="mb-1 text-xs font-semibold text-slate-600">Exam columns on this card</p>
        <p className="mb-2 text-[11px] text-slate-400">Each exam the card shows, in order. The school links each one to its own exam.</p>
        <div className="space-y-1.5">
          {tpl.slots.map((s, i) => (
            <div key={s.key} className="flex items-center gap-1.5">
              <input className={cx(inputCls, 'py-1.5 text-xs')} value={s.label} placeholder="e.g. Unit Test I"
                onChange={(e) => setSlots(tpl.slots.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
              <input type="number" min={1} className={cx(inputCls, 'w-20 flex-shrink-0 py-1.5 text-xs')} placeholder="Max" value={s.max_marks ?? ''}
                onChange={(e) => setSlots(tpl.slots.map((x, j) => (j === i ? { ...x, max_marks: e.target.value ? Number(e.target.value) : null } : x)))} />
              <button className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Remove"
                onClick={() => setSlots(tpl.slots.filter((_, j) => j !== i))}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        <Button variant="secondary" size="sm" className="mt-2" icon={<Plus className="h-3.5 w-3.5" />}
          onClick={() => setSlots([...tpl.slots, { key: newId(), label: '', max_marks: null }])}>
          Add exam column
        </Button>
      </div>

      <div className="rounded-xl bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-600">
        <p className="mb-1 font-bold text-slate-700">How to set up</p>
        <ol className="list-decimal space-y-0.5 pl-4">
          <li>Upload the school's blank card.</li>
          <li>Add the exam columns (e.g. Unit Test I 20, Half Yearly 80…).</li>
          <li>Add fields (name, class, DOB…) and drag each onto its blank line.</li>
          <li>Add the photo box and the marks table; line the table up with the printed grid.</li>
          <li>Set what each table row and column shows, check with sample data, then save.</li>
        </ol>
        <p className="mt-1.5">Anything not placed stays blank on the card for handwriting.</p>
      </div>
      <Badge tone="gray">{tpl.elements.length} item{tpl.elements.length === 1 ? '' : 's'} on the card</Badge>
    </Card>
  );
}
