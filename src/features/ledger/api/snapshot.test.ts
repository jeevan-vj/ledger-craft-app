import { describe, expect, it } from 'vitest';
import { inInclusiveDateRange, isoDate } from './ledgerSnapshot';

describe('ledger snapshot date helpers', () => {
  it('compares inclusive calendar dates', () => {
    expect(isoDate(new Date('2026-03-15T12:00:00.000Z'))).toBe('2026-03-15');
    expect(inInclusiveDateRange('2026-03-15', '2026-03-01', '2026-03-31')).toBe(true);
    expect(inInclusiveDateRange('2026-03-01', '2026-03-01', '2026-03-31')).toBe(true);
    expect(inInclusiveDateRange('2026-02-28', '2026-03-01', '2026-03-31')).toBe(false);
  });
});
