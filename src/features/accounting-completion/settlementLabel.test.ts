import { expect, it } from 'vitest';
import { settlementLabel } from './settlementLabel';
it('keeps cash-only paid snapshots Paid', () => expect(settlementLabel({ status: 'paid', totalPaid: '1150.00', totalCredited: '0.00' })).toBe('Paid'));
it('distinguishes fully credited and cash-plus-credit settlements', () => {
  expect(settlementLabel({ status: 'paid', totalPaid: '0.00', totalCredited: '1150.00' })).toBe('Credited');
  expect(settlementLabel({ status: 'paid', totalPaid: '920.00', totalCredited: '230.00' })).toBe('Settled with credits');
});
it('never labels an unsettled invoice paid because it has a credit', () => expect(settlementLabel({ status: 'sent', totalPaid: '0.00', totalCredited: '230.00' })).toBeUndefined());
