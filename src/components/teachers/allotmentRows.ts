export interface AllotmentRow {
  key: string;
  class_id: string;
  section_id: string;
  subject_ids: string[];
}

export interface ExistingAllotment {
  teacher_id: string;
  section_id: string;
  subject_id: string;
  teacher: { full_name: string } | null;
}

let keySeq = 0;
export const newAllotmentRow = (init?: Partial<AllotmentRow>): AllotmentRow => ({
  key: `row-${++keySeq}`,
  class_id: '',
  section_id: '',
  subject_ids: [],
  ...init,
});

/** Group flat (class, section, subject) allotments into one row per section. */
export function allotmentsToRows(
  list: { class_id: string; section_id: string; subject_id: string | null }[],
): AllotmentRow[] {
  const bySection = new Map<string, AllotmentRow>();
  for (const a of list) {
    if (!a.subject_id) continue;
    const row = bySection.get(a.section_id)
      ?? newAllotmentRow({ class_id: a.class_id, section_id: a.section_id });
    if (!row.subject_ids.includes(a.subject_id)) row.subject_ids.push(a.subject_id);
    bySection.set(a.section_id, row);
  }
  return [...bySection.values()];
}

/** Flatten rows into (class, section, subject) triples, dropping incomplete rows. */
export function rowsToAllotments(rows: AllotmentRow[]) {
  return rows.flatMap((r) =>
    r.class_id && r.section_id
      ? r.subject_ids.map((subject_id) => ({ class_id: r.class_id, section_id: r.section_id, subject_id }))
      : [],
  );
}

/** Message for the first incomplete row, or null when every row is usable. */
export function validateAllotmentRows(rows: AllotmentRow[]): string | null {
  for (const r of rows) {
    if (!r.class_id && !r.section_id && r.subject_ids.length === 0) continue;
    if (!r.class_id) return 'Select a class for each allotment row';
    if (!r.section_id) return 'Select a section for each allotment row';
    if (r.subject_ids.length === 0) return 'Select at least one subject for each allotment row';
  }
  return null;
}
