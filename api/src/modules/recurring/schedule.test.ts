import { describe, expect, it } from 'vitest';
import { firstRunAt, nextRunAfter, occurrenceKey } from './schedule';

describe('recurring schedule calendar', () => {
  it('preserves month-end and leap-year anchors', () => {
    const schedule = { frequency: 'monthly' as const, interval: 1, startDate: '2024-01-31', timezone: 'Pacific/Auckland', localTime: '09:00' };
    const feb = nextRunAfter(schedule, firstRunAt(schedule))!;
    expect(new Intl.DateTimeFormat('en-CA', { timeZone: schedule.timezone }).format(feb)).toBe('2024-02-29');
    expect(new Intl.DateTimeFormat('en-CA', { timeZone: schedule.timezone }).format(nextRunAfter(schedule, feb)!)).toBe('2024-03-31');
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
