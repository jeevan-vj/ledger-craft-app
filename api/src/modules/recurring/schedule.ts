import type { RecurringSchedule } from '@ledgercraft/contracts';

type LocalDate = { year: number; month: number; day: number };
const parseDate = (value: string): LocalDate => { const [year, month, day] = value.split('-').map(Number); return { year, month, day }; };
const dateText = ({ year, month, day }: LocalDate) => `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

function addLocal(date: LocalDate, unit: 'day' | 'week' | 'month' | 'year', count: number, anchorDay: number): LocalDate {
  if (unit === 'day' || unit === 'week') {
    const d = new Date(Date.UTC(date.year, date.month - 1, date.day + count * (unit === 'week' ? 7 : 1)));
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
  }
  const monthIndex = date.year * 12 + date.month - 1 + (unit === 'year' ? count * 12 : count);
  const year = Math.floor(monthIndex / 12); const month = monthIndex % 12 + 1;
  return { year, month, day: Math.min(anchorDay, daysInMonth(year, month)) };
}

function localParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  return Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, Number(p.value)])) as Record<string, number>;
}

export function localScheduleToUtc(date: LocalDate, localTime: string, timeZone: string): Date {
  const [hour, minute] = localTime.split(':').map(Number);
  const target = Date.UTC(date.year, date.month - 1, date.day, hour, minute);
  let guess = target;
  for (let i = 0; i < 3; i += 1) {
    const p = localParts(new Date(guess), timeZone);
    const shown = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    guess += target - shown;
  }
  return new Date(guess);
}

export function firstRunAt(schedule: RecurringSchedule): Date {
  return localScheduleToUtc(parseDate(schedule.startDate), schedule.localTime, schedule.timezone);
}

export function nextRunAfter(schedule: RecurringSchedule, current: Date): Date | null {
  const shown = localParts(current, schedule.timezone);
  const currentLocal = { year: shown.year, month: shown.month, day: shown.day };
  const unit = schedule.frequency === 'daily' ? 'day' : schedule.frequency === 'weekly' ? 'week' : schedule.frequency === 'monthly' ? 'month' : schedule.frequency === 'annual' ? 'year' : schedule.customUnit!;
  const nextLocal = addLocal(currentLocal, unit, schedule.interval, parseDate(schedule.startDate).day);
  if (schedule.endDate && dateText(nextLocal) > schedule.endDate) return null;
  return localScheduleToUtc(nextLocal, schedule.localTime, schedule.timezone);
}

export function occurrenceKey(templateId: string, scheduledFor: Date): string {
  return `recurring:${templateId}:${scheduledFor.toISOString()}`;
}
