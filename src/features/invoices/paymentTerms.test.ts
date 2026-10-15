import { describe, expect, it } from 'vitest';
import { addDaysToDate, dueDateMatchesTerm, paymentTermCodeFromDays } from './paymentTerms';

describe('payment terms helpers', () => {
  it('adds 30 days from 8 Sep 2026 to 8 Oct 2026', () => {
    const due = addDaysToDate(new Date(2026, 8, 8), 30);
    expect(due.getFullYear()).toBe(2026);
    expect(due.getMonth()).toBe(9);
    expect(due.getDate()).toBe(8);
  });

  it('treats non-preset offsets as custom', () => {
    expect(paymentTermCodeFromDays(30)).toBe('net_30');
    expect(paymentTermCodeFromDays(21)).toBe('custom');
  });

  it('detects a due-date override', () => {
    const date = new Date(2026, 8, 8);
    expect(dueDateMatchesTerm(date, addDaysToDate(date, 30), 30)).toBe(true);
    expect(dueDateMatchesTerm(date, new Date(2026, 10, 1), 30)).toBe(false);
  });
});
