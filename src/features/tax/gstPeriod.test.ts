import { describe, expect, it } from 'vitest';
import { getQuarterPeriod } from './gstPeriod';

describe('GST quarter periods', () => {
  it('keeps New Zealand calendar dates stable without UTC date shifts', () => {
    expect(getQuarterPeriod(2026, 'Q1')).toEqual({
      startDate: '2026-01-01',
      endDate: '2026-03-31',
      dueDate: '2026-04-28',
    });
    expect(getQuarterPeriod(2026, 'Q4')).toEqual({
      startDate: '2026-10-01',
      endDate: '2026-12-31',
      dueDate: '2027-01-28',
    });
  });
});
