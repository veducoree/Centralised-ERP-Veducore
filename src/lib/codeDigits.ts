/**
 * Digit limits for admission numbers and employee IDs, set by Veducore per
 * school (schools.admission_digits_min/max, employee_digits_min/max). The
 * range is always n to n+1 digits — e.g. 4–5. The database checks it too
 * (migration 062); these helpers give the same answer in the forms.
 */

export interface DigitLimit {
  min: number;
  max: number;
}

/** Choices shown to Veducore: 2–3 … 14–15 digits. */
export const DIGIT_LIMIT_CHOICES = Array.from({ length: 13 }, (_, i) => i + 2);

export function digitLimitLabel(min: number | null | undefined, max?: number | null) {
  if (!min) return 'No limit';
  return `${min}–${max ?? min + 1} digits`;
}

/** The school's limit for one kind of code, or null when it has none. */
export function schoolDigitLimit(
  school: { admission_digits_min?: number | null; admission_digits_max?: number | null; employee_digits_min?: number | null; employee_digits_max?: number | null } | null | undefined,
  kind: 'admission' | 'employee',
): DigitLimit | null {
  const min = kind === 'admission' ? school?.admission_digits_min : school?.employee_digits_min;
  const max = kind === 'admission' ? school?.admission_digits_max : school?.employee_digits_max;
  return min ? { min, max: max ?? min } : null;
}

/** Digits in the number part (the prefix is skipped when the code starts with it). */
export function codeDigitCount(code: string, prefix?: string | null) {
  const p = (prefix ?? '').trim();
  const rest = p && code.toUpperCase().startsWith(p.toUpperCase()) ? code.slice(p.length) : code;
  return rest.replace(/\D/g, '').length;
}

/** Error text when the code doesn't fit the limit, else null. */
export function digitLimitError(code: string, limit: DigitLimit | null, label: string, prefix?: string | null) {
  if (!limit || !code.trim()) return null;
  const n = codeDigitCount(code, prefix);
  if (n < limit.min || n > limit.max) {
    return `${label} must have ${limit.min === limit.max ? limit.min : `${limit.min}–${limit.max}`} digits (has ${n})`;
  }
  return null;
}

/** For onChange: true when the new value would go over the maximum digits. */
export function exceedsDigitLimit(code: string, limit: DigitLimit | null, prefix?: string | null) {
  return !!limit && codeDigitCount(code, prefix) > limit.max;
}
