import type { School, TeacherSchedule, TimetablePeriod } from '@/types';

/** JS weekdays (0 = Sunday). Default: Monday to Saturday. Same rule as the web app. */
export const DEFAULT_TIMETABLE_DAYS = [1, 2, 3, 4, 5, 6];
const ALL_WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];

export function getTimetableDays(school: Pick<School, 'settings'> | null | undefined): number[] {
  const raw = school?.settings?.timetable_days;
  if (Array.isArray(raw)) {
    const days = raw.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
    if (days.length > 0) return ALL_WEEKDAYS.filter((d) => days.includes(d));
  }
  return DEFAULT_TIMETABLE_DAYS;
}

/** yyyy-mm-dd in local time. */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(isoDate: string, n: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return toISODate(new Date(y, m - 1, d + n));
}

export function weekdayOf(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

export function sortPeriods(periods: TimetablePeriod[]): TimetablePeriod[] {
  return [...periods].sort((a, b) => a.start_time.localeCompare(b.start_time));
}

/** Period a slot sits in: by period_id, or an old entry starting at the same time. */
export function periodOfSlot(slot: TeacherSchedule, periods: TimetablePeriod[]): TimetablePeriod | undefined {
  return (
    periods.find((p) => p.id === slot.period_id) ||
    periods.find((p) => !slot.period_id && p.start_time.slice(0, 5) === slot.start_time.slice(0, 5))
  );
}
