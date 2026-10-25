import { describe, expect, it } from 'vitest';
import { localDateIn } from './organisation-date';

describe('organisation-local journal dates', () => {
  it.each([
    // 00:30 NZDT on 1 Jan is still 31 Dec in UTC: the 00:00–13:00 NZDT window.
    ['2026-12-31T11:30:00.000Z', 'Pacific/Auckland', '2027-01-01'],
    ['2026-10-24T23:59:00.000Z', 'Pacific/Auckland', '2026-10-25'],
    // 00:30 NZST on 1 Jul crosses the June-quarter GST boundary.
    ['2026-06-30T12:30:00.000Z', 'Pacific/Auckland', '2026-07-01'],
    ['2026-06-30T11:59:00.000Z', 'Pacific/Auckland', '2026-06-30'],
    ['2026-06-30T12:30:00.000Z', 'Australia/Sydney', '2026-06-30'],
    ['2026-06-30T12:30:00.000Z', 'Not/AZone', '2026-07-01'],
  ])('dates %s in %s as %s', (instant, timeZone, expected) => {
    expect(localDateIn(new Date(instant), timeZone)).toBe(expected);
  });
});
