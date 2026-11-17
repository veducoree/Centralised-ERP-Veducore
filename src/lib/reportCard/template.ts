// Template defaults, element factories and safe parsing of stored jsonb.
import {
  FIELD_OPTIONS, pageSize,
  type ColDef, type ColRole, type Element, type FieldKey, type Orientation, type ReportCardTemplate,
  type RowRole, type Slot, type SummaryKind, type TableElement,
} from './types';

export const newId = () => Math.random().toString(36).slice(2, 10);

export function emptyTemplate(schoolId: string): ReportCardTemplate {
  return {
    school_id: schoolId, name: 'Annual report card', background_url: null, background_path: null,
    orientation: 'portrait', slots: [], elements: [], print_offset_x_mm: 0, print_offset_y_mm: 0, is_active: true,
  };
}

export const NO_FILL: Record<SummaryKind, boolean> = { total: false, percentage: false, grade: false, rank: false, attendance: false };

/** Sensible summary rows for a new column role. */
export function defaultFill(role: ColRole): Record<SummaryKind, boolean> {
  if (role.type === 'sum') return { total: true, percentage: true, grade: true, rank: true, attendance: true };
  if (role.type === 'slot') return { ...NO_FILL, total: true };
  return { ...NO_FILL };
}

export function newText(field: FieldKey, o: Orientation): Element {
  const p = pageSize(o);
  return { id: newId(), kind: 'text', field, x: p.w / 2 - 30, y: 40, w: 60, h: 7, font_size: 11, align: 'left', bold: false, ...(field === 'custom' ? { text: 'Text' } : {}) };
}

export function newPhoto(o: Orientation): Element {
  const p = pageSize(o);
  return { id: newId(), kind: 'photo', x: p.w - 45, y: 15, w: 30, h: 36 };
}

const evenEdges = (n: number) => Array.from({ length: n + 1 }, (_, i) => i / n);

export function newTable(o: Orientation, rows = 10, cols = 6): TableElement {
  const p = pageSize(o);
  return {
    id: newId(), kind: 'table', x: 15, y: 80, w: p.w - 30, h: rows * 6,
    row_edges: evenEdges(rows), col_edges: evenEdges(cols),
    rows: Array.from({ length: rows }, (): RowRole => ({ type: 'none' })),
    cols: Array.from({ length: cols }, (): ColDef => ({ role: { type: 'none' }, fill: { ...NO_FILL } })),
    font_size: 9, bold: true,
  };
}

/** Change the number of rows/columns, keeping existing settings where possible. */
export function resizeGrid(t: TableElement, rows: number, cols: number): TableElement {
  const next = { ...t };
  if (rows !== t.rows.length) {
    next.row_edges = evenEdges(rows);
    next.rows = Array.from({ length: rows }, (_, i): RowRole => t.rows[i] ?? { type: 'none' });
  }
  if (cols !== t.cols.length) {
    next.col_edges = evenEdges(cols);
    next.cols = Array.from({ length: cols }, (_, i): ColDef => t.cols[i] ?? { role: { type: 'none' }, fill: { ...NO_FILL } });
  }
  return next;
}

export { evenEdges };

// ── Parsing stored rows ──────────────────────────────────────────────────────

const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);
const FIELDS = new Set(FIELD_OPTIONS.map((f) => f.key));

function parseEdges(v: unknown, n: number): number[] {
  if (Array.isArray(v) && v.length === n + 1 && v.every((x) => typeof x === 'number')) return v as number[];
  return evenEdges(Math.max(1, n));
}

function parseElement(raw: unknown): Element | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Record<string, unknown>;
  const box = { id: str(e.id) || newId(), x: num(e.x, 10), y: num(e.y, 10), w: Math.max(2, num(e.w, 40)), h: Math.max(2, num(e.h, 7)) };
  if (e.kind === 'text') {
    const field = (FIELDS.has(e.field as FieldKey) ? e.field : 'custom') as FieldKey;
    return {
      ...box, kind: 'text', field, text: str(e.text), font_size: num(e.font_size, 11),
      align: e.align === 'center' || e.align === 'right' ? e.align : 'left', bold: !!e.bold,
    };
  }
  if (e.kind === 'photo') return { ...box, kind: 'photo' };
  if (e.kind === 'table') {
    const rows = Array.isArray(e.rows) ? (e.rows as RowRole[]) : [];
    const cols = Array.isArray(e.cols) ? (e.cols as ColDef[]) : [];
    if (!rows.length || !cols.length) return null;
    return {
      ...box, kind: 'table', rows,
      cols: cols.map((c) => ({ role: c?.role ?? { type: 'none' }, fill: { ...NO_FILL, ...(c?.fill ?? {}) } })),
      row_edges: parseEdges(e.row_edges, rows.length), col_edges: parseEdges(e.col_edges, cols.length),
      font_size: num(e.font_size, 9), bold: e.bold !== false,
    };
  }
  return null;
}

export function parseTemplate(row: Record<string, unknown>): ReportCardTemplate {
  const slots = Array.isArray(row.slots) ? (row.slots as Slot[]).filter((s) => s && typeof s.key === 'string') : [];
  const elements = Array.isArray(row.elements) ? row.elements.map(parseElement).filter((e): e is Element => !!e) : [];
  return {
    id: str(row.id) || undefined,
    school_id: str(row.school_id),
    name: str(row.name, 'Annual report card'),
    background_url: (row.background_url as string | null) ?? null,
    background_path: (row.background_path as string | null) ?? null,
    orientation: row.orientation === 'landscape' ? 'landscape' : 'portrait',
    slots: slots.map((s) => ({ key: s.key, label: str(s.label, s.key), max_marks: typeof s.max_marks === 'number' ? s.max_marks : null })),
    elements,
    print_offset_x_mm: Number(row.print_offset_x_mm ?? 0) || 0,
    print_offset_y_mm: Number(row.print_offset_y_mm ?? 0) || 0,
    is_active: row.is_active !== false,
    updated_at: str(row.updated_at) || undefined,
  };
}

/** Columns read by the template, in card order. */
export function slotsUsed(t: ReportCardTemplate): Set<string> {
  const used = new Set<string>();
  for (const el of t.elements) {
    if (el.kind !== 'table') continue;
    for (const c of el.cols) {
      if (c.role.type === 'slot') used.add(c.role.slot);
      if (c.role.type === 'sum' || c.role.type === 'grade') c.role.slots.forEach((s) => used.add(s));
    }
  }
  return used;
}
