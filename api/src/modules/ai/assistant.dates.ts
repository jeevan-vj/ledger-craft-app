import { localDateIn } from '../accounting/organisation-date';

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

/** Add calendar days to a YYYY-MM-DD date. The UTC constructor is a calendar, not a zoned instant. */
export function addCalendarDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function weekdayIndex(now: Date, timeZone: string): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long' }).format(now).toLowerCase();
  const index = WEEKDAYS.indexOf(name as typeof WEEKDAYS[number]);
  if (index < 0) throw new Error('Invalid weekday');
  return index;
}

/** Resolve an ISO date or an English weekday in the business timezone. Today counts. */
export function resolveRelativeDate(input: string, now: Date, timeZone: string): string | null {
  const normalized = input.trim().toLowerCase().replace(/^next\s+/, '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
  const target = WEEKDAYS.indexOf(normalized as typeof WEEKDAYS[number]);
  if (target < 0) return null;
  const today = localDateIn(now, timeZone);
  return addCalendarDays(today, (target - weekdayIndex(now, timeZone) + 7) % 7);
}
