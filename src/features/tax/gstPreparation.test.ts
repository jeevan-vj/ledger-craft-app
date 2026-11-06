import { afterEach, describe, expect, it, vi } from 'vitest';
import { taxApiEnabled } from './api/taxApi';
import { taxCalculationService } from '@/services/taxCalculationService';
import { bankApiEnabled } from '@/features/bank/api/bankApi';
import { reconciliationApiEnabled } from '@/features/reconciliation/api/reconciliationApi';
import { supabaseDataService } from '@/services/supabaseDataService';

vi.mock('@/services/supabaseService', () => ({
  invoiceService: { getInvoices: vi.fn(async () => [{ date: '2026-04-10', total: 1610, taxAmount: 210 }]) },
  expenseService: { getExpenses: vi.fn(async () => [{ expenseDate: '2026-04-12', amount: 230, taxAmount: 30 }]) },
}));

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('live invoice-basis GST preparation', () => {
  it('uses Hono tax APIs by default and permits only an explicit legacy opt-out', () => {
    vi.stubEnv('VITE_TAX_API', undefined);
    expect(taxApiEnabled()).toBe(true);
    vi.stubEnv('VITE_TAX_API', 'false');
    expect(taxApiEnabled()).toBe(false);
  });

  it('uses the Hono bank and reconciliation services when checking a GST return without environment flags', () => {
    vi.stubEnv('VITE_BANK_API', undefined);
    vi.stubEnv('VITE_RECONCILIATION_API', undefined);
    expect(bankApiEnabled()).toBe(true);
    expect(reconciliationApiEnabled()).toBe(true);
    vi.stubEnv('VITE_BANK_API', 'false');
    vi.stubEnv('VITE_RECONCILIATION_API', 'false');
    expect(bankApiEnabled()).toBe(false);
    expect(reconciliationApiEnabled()).toBe(false);
  });

  it('includes received supplier bills and approved expenses, using posted GST rather than recomputing it', async () => {
    vi.stubEnv('VITE_TAX_API', 'true');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({
      basis: 'invoice', from: '2026-04-01', to: '2026-04-30', baseCurrency: 'NZD',
      totalSales: '1610.00', totalPurchases: '625.00', gstOnSales: '210.00', gstOnPurchases: '75.00', netGstPosition: '135.00', warnings: [],
    }) })));
    const summary = await taxCalculationService.calculateGSTSummary('ignored-user-id', '2026-04-01', '2026-04-30');
    expect(summary).toMatchObject({ totalSales: 1610, totalPurchases: 625, gstOnSales: 210, gstOnPurchases: 75, netGstPosition: 135 });
    expect(fetch).toHaveBeenCalledWith('/api/tax/gst-preparation?from=2026-04-01&to=2026-04-30', { credentials: 'include' });
    const draft = await taxCalculationService.generateIRDGSTReturn('ignored-user-id', '2026-04-01', '2026-04-30');
    expect(draft.gstReturn?.salesDetails).toMatchObject({ totalSales: 1610, gstOnSales: 210 });
    expect(draft.gstReturn?.purchaseDetails).toMatchObject({ totalPurchases: 625, gstOnPurchases: 75 });
  });

  it('does not present a failed report read as a zero GST return', async () => {
    vi.stubEnv('VITE_TAX_API', 'true');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({ error: { message: 'Report unavailable' } }) })));
    await expect(taxCalculationService.calculateGSTSummary('user', '2026-04-01', '2026-04-30')).rejects.toThrow('Something went wrong on our side.');
  });

  it('keeps the quarterly trend on the same authoritative GST result as filing preparation', async () => {
    vi.stubEnv('VITE_TAX_API', 'true');
    vi.spyOn(supabaseDataService, 'getInvoicesByPeriod').mockResolvedValue([{ total: 1610, taxAmount: 210 }] as never);
    vi.spyOn(supabaseDataService, 'getExpensesByPeriod').mockResolvedValue([{ amount: 230, taxAmount: 30 }] as never);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({
      basis: 'invoice', from: '2026-04-01', to: '2026-04-30', baseCurrency: 'NZD',
      totalSales: '1610.00', totalPurchases: '625.00', gstOnSales: '210.00', gstOnPurchases: '75.00', netGstPosition: '135.00', warnings: [],
    }) })));
    expect(await supabaseDataService.getGSTReturnSummary('owner', '2026-04-01', '2026-04-30')).toMatchObject({
      totalPurchases: 625, gstOnPurchases: 75, netGstPosition: 135,
    });
  });
});
