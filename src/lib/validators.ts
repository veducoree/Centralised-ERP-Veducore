/**
 * Composable field validators.
 * Each validator returns an error string when the rule is violated,
 * or undefined when the value is acceptable.
 *
 * Usage:
 *   const err = required(value) ?? minLen(3)(value) ?? maxLen(50)(value);
 *   if (err) errors.field = err;
 */

// ── Primitive helpers ─────────────────────────────────────────────────────────

export function required(value: string | null | undefined, label = 'This field'): string | undefined {
  if (!value || !String(value).trim()) return `${label} is required`;
}

export function minLen(n: number) {
  return (value: string, label = 'This field'): string | undefined => {
    if (value && value.trim().length < n) return `${label} must be at least ${n} characters`;
  };
}

export function maxLen(n: number) {
  return (value: string, label = 'This field'): string | undefined => {
    if (value && value.trim().length > n) return `${label} must be at most ${n} characters`;
  };
}

// ── Number validators ─────────────────────────────────────────────────────────

/** Value must be a valid number and > 0 */
export function positiveNumber(value: string | number, label = 'Amount'): string | undefined {
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  if (isNaN(n)) return `${label} must be a number`;
  if (n <= 0) return `${label} must be greater than 0`;
}

/** Value must be a valid number and >= 0 */
export function nonNegative(value: string | number, label = 'Amount'): string | undefined {
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  if (isNaN(n)) return `${label} must be a number`;
  if (n < 0) return `${label} cannot be negative`;
}

/** Value must be a number within [min, max] inclusive */
export function range(min: number, max: number) {
  return (value: string | number, label = 'Value'): string | undefined => {
    const n = typeof value === 'number' ? value : parseFloat(String(value));
    if (isNaN(n)) return `${label} must be a number`;
    if (n < min || n > max) return `${label} must be between ${min} and ${max}`;
  };
}

/**
 * Payment amount validator:
 * - must be > 0
 * - must not exceed the remaining balance
 */
export function paymentAmount(
  value: string | number,
  remaining: number,
  label = 'Payment amount'
): string | undefined {
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  if (!value && value !== 0) return `${label} is required`;
  if (isNaN(n)) return `${label} must be a number`;
  if (n <= 0) return `${label} must be greater than ₹0`;
  if (n > remaining) {
    return `${label} cannot exceed the remaining balance (₹${remaining.toFixed(2)})`;
  }
}

// ── Contact / identity validators ─────────────────────────────────────────────

/** Exactly 10 digits, Indian mobile */
export function phone10(value: string, label = 'Phone number'): string | undefined {
  if (!value) return; // use required() for the mandatory check
  if (!/^\d{10}$/.test(value.trim())) return `${label} must be exactly 10 digits`;
}

export function email(value: string, label = 'Email'): string | undefined {
  if (!value) return;
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  if (!ok) return `${label} must be a valid email address`;
}

// ── Date validators ───────────────────────────────────────────────────────────

/** Date must not be in the future (e.g. date of birth) */
export function dateNotFuture(value: string, label = 'Date'): string | undefined {
  if (!value) return;
  if (new Date(value) > new Date()) return `${label} cannot be in the future`;
}

/** Date must not be in the past (e.g. due date) */
export function dateNotPast(value: string, label = 'Date'): string | undefined {
  if (!value) return;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (new Date(value) < today) return `${label} cannot be in the past`;
}

// ── Convenience: run a list of validators and return first error ──────────────

type Validator = (v: string) => string | undefined;

export function firstError(value: string, ...validators: Validator[]): string | undefined {
  for (const v of validators) {
    const err = v(value);
    if (err) return err;
  }
}
