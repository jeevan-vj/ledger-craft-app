import { describe, expect, it } from 'vitest';
import { firstRunAt, nextRunAfter, occurrenceKey } from './schedule';

describe('recurring schedule calendar', () => {
  const localDate = (date: Date, timeZone: string) => new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);

  const occurrences = (schedule: Parameters<typeof firstRunAt>[0], count: number) => {
    const values = [firstRunAt(schedule)];
    while (values.length < count) values.push(nextRunAfter(schedule, values.at(-1)!)!);
    return values;
  };

  it('preserves month-end and leap-year anchors', () => {
    const schedule = { frequency: 'monthly' as const, interval: 1, startDate: '2024-01-31', timezone: 'Pacific/Auckland', localTime: '09:00' };
    const feb = nextRunAfter(schedule, firstRunAt(schedule))!;
    expect(new Intl.DateTimeFormat('en-CA', { timeZone: schedule.timezone }).format(feb)).toBe('2024-02-29');
    expect(new Intl.DateTimeFormat('en-CA', { timeZone: schedule.timezone }).format(nextRunAfter(schedule, feb)!)).toBe('2024-03-31');
  });

  it('clamps an explicit 31st anchor without drifting after February', () => {
    const schedule = { frequency: 'monthly' as const, interval: 1, dayOfMonth: 31 as const, startDate: '2027-01-05', timezone: 'Pacific/Auckland', localTime: '09:00' };
    expect(occurrences(schedule, 5).map((date) => localDate(date, schedule.timezone))).toEqual([
      '2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30', '2027-05-31',
    ]);
    const leap = { ...schedule, startDate: '2028-01-05' };
    expect(occurrences(leap, 2).map((date) => localDate(date, leap.timezone))).toEqual(['2028-01-31', '2028-02-29']);
  });

  it('supports the last day of each month', () => {
    const schedule = { frequency: 'monthly' as const, interval: 1, dayOfMonth: 'last' as const, startDate: '2027-01-05', timezone: 'UTC', localTime: '09:00' };
    expect(occurrences(schedule, 4).map((date) => localDate(date, schedule.timezone))).toEqual([
      '2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30',
    ]);
  });

  it('keeps monthly 09:00 local time across both Auckland DST boundaries', () => {
    const schedule = { frequency: 'monthly' as const, interval: 1, dayOfMonth: 28 as const, startDate: '2026-03-28', timezone: 'Pacific/Auckland', localTime: '09:00' };
    const values = occurrences(schedule, 8);
    const localTimes = values.map((date) => new Intl.DateTimeFormat('en-NZ', {
      timeZone: schedule.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).format(date));
    expect(localTimes).toEqual(Array(8).fill('09:00'));
    expect(values[0].toISOString()).toBe('2026-03-27T20:00:00.000Z');
    expect(values[1].toISOString()).toBe('2026-04-27T21:00:00.000Z');
    expect(values[6].toISOString()).toBe('2026-09-27T20:00:00.000Z');
  });
  it('keeps the same local time across DST and produces deterministic keys', () => {
    const schedule = { frequency: 'weekly' as const, interval: 1, startDate: '2026-09-20', timezone: 'Pacific/Auckland', localTime: '09:30' };
    const first = firstRunAt(schedule); const next = nextRunAfter(schedule, first)!;
    expect(new Intl.DateTimeFormat('en-NZ', { timeZone: schedule.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(next)).toBe('09:30');
    expect(occurrenceKey('abc', next)).toBe(occurrenceKey('abc', next));
    expect(next.getTime() - first.getTime()).toBe(167 * 60 * 60 * 1000);
  });
  it('ends at the configured date', () => {
    const schedule = { frequency: 'daily' as const, interval: 1, startDate: '2026-01-01', endDate: '2026-01-01', timezone: 'UTC', localTime: '00:00' };
    expect(nextRunAfter(schedule, firstRunAt(schedule))).toBeNull();
  });
});
