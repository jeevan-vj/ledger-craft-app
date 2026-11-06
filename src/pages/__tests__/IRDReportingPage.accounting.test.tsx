import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import IRDReportingPage from '../IRDReportingPage';
import { supabaseDataService } from '@/services/supabaseDataService';

const toast = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));
vi.mock('@/context/StableAuthContext', () => ({ useAuth: () => ({ user: { id: 'owner' } }) }));
vi.mock('@/services/supabaseDataService', () => ({ supabaseDataService: {
  getTaxReturnsByUser: vi.fn(async () => []), createTaxReturn: vi.fn(),
  getInvoicesByPeriod: vi.fn(async () => []), getExpensesByPeriod: vi.fn(async () => []),
} }));
vi.mock('@/components/reporting/IRDReportingDashboard', () => ({ IRDReportingDashboard: ({ onCreateIncomeReturn, onCreateGSTReturn }: { onCreateIncomeReturn: (period: { start: string; end: string }) => void; onCreateGSTReturn: () => void }) =>
  <><button onClick={() => onCreateIncomeReturn({ start: '2026-04-01', end: '2027-03-31' })}>Prepare income tax</button><button onClick={onCreateGSTReturn}>Prepare GST</button></>,
}));
vi.mock('@/services/taxCalculationService', () => ({ taxCalculationService: { generateIRDGSTReturn: vi.fn(async () => ({ gstReturn: {
  salesDetails: { standardRated: 1610, zeroRated: 0, exempt: 0, totalSales: 1610, gstOnSales: 210 },
  purchaseDetails: { standardRated: 625, capitalGoods: 0, totalPurchases: 625, gstOnPurchases: 75 },
} })) } }));
vi.mock('@/components/tax/GSTReturnWizard', () => ({ GSTReturnWizard: ({ onComplete }: { onComplete: (data: unknown) => void }) => <button onClick={() => onComplete({
  returnPeriod: { startDate: '2026-11-01', endDate: '2026-11-30', quarter: 'CUSTOM', year: 2026 }, dueDate: '2027-01-15',
  salesData: { totalSales: 1610, gstOnSales: 210, zeroRatedSales: 0, exemptSales: 0 },
  purchaseData: { totalPurchases: 625, gstOnPurchases: 75, capitalGoods: 0, gstOnCapitalGoods: 0 },
  adjustments: { badDebtAdjustments: 0, creditNoteAdjustments: 0, otherAdjustments: 0 },
})}>Save reference GST draft</button> }));

beforeEach(() => vi.clearAllMocks());

it('does not manufacture a company income-tax liability using personal tax bands and GST-inclusive documents', async () => {
  render(<MemoryRouter><IRDReportingPage /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Prepare income tax' }));
  await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Income tax calculation is not supported' })));
  expect(supabaseDataService.createTaxReturn).not.toHaveBeenCalled();
  expect(supabaseDataService.getInvoicesByPeriod).not.toHaveBeenCalled();
});

it('retains the confirmed custom due date in the saved preparation record', async () => {
  vi.mocked(supabaseDataService.createTaxReturn).mockImplementation(async (record) => ({ ...record, id: 'draft-1', createdAt: '', updatedAt: '' }));
  render(<MemoryRouter><IRDReportingPage /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Prepare GST' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save reference GST draft' }));
  await waitFor(() => expect(supabaseDataService.createTaxReturn).toHaveBeenCalled());
  expect(vi.mocked(supabaseDataService.createTaxReturn).mock.calls[0][0]).toMatchObject({
    periodStart: '2026-11-01', periodEnd: '2026-11-30', netGst: 135,
    returnData: { preparation: { basis: 'invoice', baseCurrency: 'NZD', dueDate: '2027-01-15' } },
  });
});
