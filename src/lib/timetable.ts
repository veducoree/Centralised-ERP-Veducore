import type { School, TeacherSchedule, TimetablePeriod } from '@/types';

/** JS weekdays (0 = Sunday). Default: Monday to Saturday. */
export const DEFAULT_TIMETABLE_DAYS = [1, 2, 3, 4, 5, 6];
export const ALL_WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];
export const SHORT_DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function getTimetableDays(school: Pick<School, 'settings'> | null | undefined): number[] {
  const raw = school?.settings?.timetable_days;
  if (Array.isArray(raw)) {
    const days = raw.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
    if (days.length > 0) return ALL_WEEKDAYS.filter((d) => days.includes(d));
  }
  return DEFAULT_TIMETABLE_DAYS;
}

/** yyyy-mm-dd in local time (toISOString would shift to UTC). */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Weekday (0 = Sunday) of a yyyy-mm-dd string, in local time. */
export function weekdayOf(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

export function addDays(isoDate: string, n: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return toISODate(new Date(y, m - 1, d + n));
}

/** "HH:MM:SS" or "HH:MM" -> "HH:MM" for <input type="time">. */
export function toInputTime(t: string): string {
  return t.slice(0, 5);
}

export function sortPeriods(periods: TimetablePeriod[]): TimetablePeriod[] {
  return [...periods].sort((a, b) => a.start_time.localeCompare(b.start_time));
}

/** Slot that sits in a given period: linked by period_id, or an old entry starting at the same time. */
export function slotsInPeriod<T extends TeacherSchedule>(slots: T[], day: number, period: TimetablePeriod): T[] {
  return slots.filter(
    (s) =>
      s.day_of_week === day &&
      (s.period_id === period.id || (!s.period_id && toInputTime(s.start_time) === toInputTime(period.start_time))),
  );
}

/** Old entries that do not line up with any period (shown separately so they are not lost). */
export function unplacedSlots<T extends TeacherSchedule>(slots: T[], periods: TimetablePeriod[], days: number[]): T[] {
  return slots.filter(
    (s) =>
      !days.includes(s.day_of_week) ||
      (!s.period_id && !periods.some((p) => toInputTime(p.start_time) === toInputTime(s.start_time))) ||
      (!!s.period_id && !periods.some((p) => p.id === s.period_id)),
  );
}

/** Supabase errors are plain objects, not Error instances. */
export function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') return err.message;
  return fallback;
}
