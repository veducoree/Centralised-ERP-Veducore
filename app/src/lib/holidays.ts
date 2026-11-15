import type { School } from '@/types';

export interface HolidayRow { date: string; type: 'holiday' | 'festival' | 'working'; label: string | null }

const DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** JS weekdays that are off every week, from Settings → Weekly Working Days.
 *  '5' = Monday–Friday (Saturday + Sunday off), otherwise Sunday only. */
export function weeklyOffDays(school: Pick<School, 'settings'> | null | undefined): number[] {
  const wd = (school?.settings as Record<string, unknown> | null | undefined)?.workingDays;
  return String(wd ?? '6') === '5' ? [0, 6] : [0];
}

/**
 * Returns a function telling whether a date (yyyy-mm-dd) is off, and why:
 * a declared holiday/festival label, null for a declared working day,
 * otherwise "Sunday"/"Saturday" for the weekly off. Null = school day.
 */
export function makeOffDay(holidays: HolidayRow[], offDays: number[]) {
  const off = new Map<string, string>();
  const working = new Set<string>();
  for (const h of holidays) {
    if (h.type === 'working') working.add(h.date);
    else off.set(h.date, h.label || (h.type === 'festival' ? 'Festival' : 'Holiday'));
  }
  return (iso: string): string | null => {
    if (off.has(iso)) return off.get(iso)!;
    if (working.has(iso)) return null;
    const dow = new Date(`${iso}T00:00:00`).getDay();
    return offDays.includes(dow) ? DAY[dow] : null;
  };
}
