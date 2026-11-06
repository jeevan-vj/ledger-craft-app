import { describe, expect, it } from 'vitest';
import { allocateGstSettlements } from './gst-payments';

const receipt = (id: string, date = '2026-04-10') => ({ id, documentId: 'invoice-1', amount: '1.00', date, reversalDate: null as string | null, status: 'completed', total: '3.00', baseTotal: '3.00', currency: 'NZD' });
const period = { from: '2026-04-01', to: '2026-04-30' };

describe('payments-basis GST allocation', () => {
  it('allocates three partial receipts to the exact original GST instead of losing a cent per line', () => {
    const rows = [receipt('a'), receipt('b'), receipt('c')];
    expect(allocateGstSettlements(rows, new Map([['invoice-1', '1.00']]), period)).toEqual({ gross: '3.00', tax: '1.00' });
  });
  it('uses earlier receipts for cumulative rounding but reports only selected-period receipts', () => {
    const rows = [receipt('a', '2026-03-31'), receipt('b', '2026-04-01'), receipt('c', '2026-05-01')];
    expect(allocateGstSettlements(rows, new Map([['invoice-1', '1.00']]), period)).toEqual({ gross: '1.00', tax: '0.34' });
  });
  it('reverses receipts in their actual period and conserves cumulative GST rounding on later receipts', () => {
    const rows = [{ ...receipt('a', '2026-03-30'), reversalDate: '2026-04-02', status: 'refunded' }, receipt('b', '2026-03-31'), receipt('c', '2026-04-03')];
    expect(allocateGstSettlements(rows, new Map([['invoice-1', '1.00']]), period)).toEqual({ gross: '0.00', tax: '0.00' });
    expect(allocateGstSettlements(rows, new Map([['invoice-1', '1.00']]), { from: '2026-03-01', to: '2026-04-30' })).toEqual({ gross: '2.00', tax: '0.67' });
  });
  it('dates credit-note rounding adjustments and reversals without rewriting an earlier payments period', () => {
    const rows = [{ ...receipt('a', '2026-04-05'), amount: '0.05', total: '0.10', baseTotal: '0.10' }];
    const credits = [{ id: 'cn', documentId: 'invoice-1', amount: '0.05', tax: '0.01', date: '2026-05-10', reversalDate: '2026-06-10' }];
    const tax = new Map([['invoice-1', '0.01']]);
    expect(allocateGstSettlements(rows, tax, period, credits)).toEqual({ gross: '0.05', tax: '0.01' });
    expect(allocateGstSettlements(rows, tax, { from: '2026-05-01', to: '2026-05-31' }, credits)).toEqual({ gross: '0.00', tax: '-0.01' });
    expect(allocateGstSettlements(rows, tax, { from: '2026-06-01', to: '2026-06-30' }, credits)).toEqual({ gross: '0.00', tax: '0.01' });
  });
  it('does not claim an unposted or excluded source document and converts no raw foreign amounts', () => {
    expect(allocateGstSettlements([receipt('a')], new Map(), period)).toEqual({ gross: '0.00', tax: '0.00' });
    expect(allocateGstSettlements([{ ...receipt('a'), currency: 'USD', baseTotal: '4.80' }], new Map([['invoice-1', '0.60']]), period)).toEqual({ gross: '1.60', tax: '0.20' });
  });
});
