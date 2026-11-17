// Annual report card templates: a school's own blank card (background image)
// with fields placed on it. All positions are millimetres from the page's
// top-left corner, so the same layout prints identically on any printer.

export type Orientation = 'portrait' | 'landscape';

/** An exam column the card expects, e.g. "Unit Test I" out of 20. */
export interface Slot {
  key: string;
  label: string;
  /** Max marks printed on the card; used to warn when the school's exam differs. */
  max_marks: number | null;
}

export type FieldKey =
  | 'student_name' | 'father_name' | 'mother_name' | 'guardian_name' | 'address'
  | 'admission_number' | 'roll_number' | 'dob' | 'gender' | 'phone'
  | 'class_section' | 'class_name' | 'section_name'
  | 'session_name' | 'session_start_year' | 'session_end_year' | 'session_start_yy' | 'session_end_yy'
  | 'attendance' | 'overall_total' | 'overall_percentage' | 'overall_grade' | 'result' | 'rank'
  | 'custom';

export const FIELD_OPTIONS: { key: FieldKey; label: string; group: string; sample: string }[] = [
  { key: 'student_name', label: 'Student name', group: 'Student', sample: 'Aarav Sharma' },
  { key: 'father_name', label: "Father's name", group: 'Student', sample: 'Rajesh Sharma' },
  { key: 'mother_name', label: "Mother's name", group: 'Student', sample: 'Sunita Sharma' },
  { key: 'guardian_name', label: 'Father / guardian', group: 'Student', sample: 'Rajesh Sharma' },
  { key: 'address', label: 'Address', group: 'Student', sample: '12, Park Road, Lucknow' },
  { key: 'admission_number', label: 'Admission / S.R. No.', group: 'Student', sample: '2024001' },
  { key: 'roll_number', label: 'Roll No.', group: 'Student', sample: '7' },
  { key: 'dob', label: 'Date of birth', group: 'Student', sample: '12/04/2014' },
  { key: 'gender', label: 'Gender', group: 'Student', sample: 'Male' },
  { key: 'phone', label: 'Parent phone', group: 'Student', sample: '98765 43210' },
  { key: 'class_section', label: 'Class - Section', group: 'Class', sample: 'Class 5 - A' },
  { key: 'class_name', label: 'Class', group: 'Class', sample: 'Class 5' },
  { key: 'section_name', label: 'Section', group: 'Class', sample: 'A' },
  { key: 'session_name', label: 'Session (2026-27)', group: 'Session', sample: '2026-27' },
  { key: 'session_start_year', label: 'Session start year (2026)', group: 'Session', sample: '2026' },
  { key: 'session_end_year', label: 'Session end year (2027)', group: 'Session', sample: '2027' },
  { key: 'session_start_yy', label: 'Session start, 2 digits (26)', group: 'Session', sample: '26' },
  { key: 'session_end_yy', label: 'Session end, 2 digits (27)', group: 'Session', sample: '27' },
  { key: 'attendance', label: 'Attendance (whole year)', group: 'Result', sample: '182/196' },
  { key: 'overall_total', label: 'Grand total (all exams)', group: 'Result', sample: '1342/1600' },
  { key: 'overall_percentage', label: 'Overall percentage', group: 'Result', sample: '83.88%' },
  { key: 'overall_grade', label: 'Overall grade', group: 'Result', sample: 'A2' },
  { key: 'rank', label: 'Rank in section (overall)', group: 'Result', sample: '3' },
  { key: 'result', label: 'Result (Pass / Needs improvement)', group: 'Result', sample: 'PASS' },
  { key: 'custom', label: 'Fixed text', group: 'Other', sample: '' },
];

interface Box {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TextElement extends Box {
  kind: 'text';
  field: FieldKey;
  /** Only for field === 'custom'. */
  text?: string;
  /** Points. */
  font_size: number;
  align: 'left' | 'center' | 'right';
  bold: boolean;
}

export interface PhotoElement extends Box {
  kind: 'photo';
}

export type RowRole =
  | { type: 'none' }
  | { type: 'subject'; name: string; aliases: string }
  | { type: 'total' | 'percentage' | 'grade' | 'rank' | 'attendance' };

export type ColRole =
  | { type: 'none' }
  /** Marks of one exam. */
  | { type: 'slot'; slot: string }
  /** Sum of several exams (term total, grand total). */
  | { type: 'sum'; slots: string[] }
  /** Grade from the percentage of several exams. */
  | { type: 'grade'; slots: string[] };

export type SummaryKind = 'total' | 'percentage' | 'grade' | 'rank' | 'attendance';

export interface ColDef {
  role: ColRole;
  /** Which summary rows (TOTAL, PERCENTAGE…) this column fills. */
  fill: Record<SummaryKind, boolean>;
}

export interface TableElement extends Box {
  kind: 'table';
  /** Row / column boundaries as fractions of the table (0 … 1, ascending). */
  row_edges: number[];
  col_edges: number[];
  rows: RowRole[];
  cols: ColDef[];
  font_size: number;
  bold: boolean;
}

export type Element = TextElement | PhotoElement | TableElement;

export interface ReportCardTemplate {
  id?: string;
  school_id: string;
  name: string;
  background_url: string | null;
  background_path: string | null;
  orientation: Orientation;
  slots: Slot[];
  elements: Element[];
  print_offset_x_mm: number;
  print_offset_y_mm: number;
  is_active: boolean;
  updated_at?: string;
}

export function pageSize(o: Orientation) {
  return o === 'portrait' ? { w: 210, h: 297 } : { w: 297, h: 210 };
}

/** Values to print on one card. */
export interface CardValues {
  studentId: string;
  text: Record<string, string>;
  photo: string | null;
  initials: string;
  cells: Record<string, string[][]>;
}
