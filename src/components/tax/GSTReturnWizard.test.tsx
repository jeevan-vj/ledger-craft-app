import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { GSTReturnWizard } from './GSTReturnWizard';
import { loadGstPreparation } from '@/features/tax/gstPreparation';
import { gstReconciliationService } from '@/services/gstReconciliationService';

vi.mock('@/context/StableAuthContext', () => ({ useAuth: () => ({ user: { id: 'owner' } }) }));
vi.mock('@/features/tax/gstPreparation', () => ({ loadGstPreparation: vi.fn(), netGstAfterAdjustments: (output: number, input: number) => output - input }));
vi.mock('@/services/gstReconciliationService', () => ({ gstReconciliationService: { getPeriodReconciliation: vi.fn() } }));
vi.mock('@/services/supabaseDataService', () => ({ supabaseDataService: {
  getInvoicesByPeriod: vi.fn(async () => [{ total: 1610, taxAmount: 210 }]),
  getExpensesByPeriod: vi.fn(async () => [{ amount: 230, taxAmount: 30 }]),
} }));

beforeEach(() => {
  vi.mocked(loadGstPreparation).mockResolvedValue({ basis: 'invoice', totalSales: 1610, totalPurchases: 625, gstOnSales: 210, gstOnPurchases: 75, netGstPosition: 135, warnings: [] });
  vi.mocked(gstReconciliationService.getPeriodReconciliation).mockResolvedValue({ period: { startDate: '2026-04-01', endDate: '2026-06-30' }, readiness: 'not_applicable', accounts: [], unreconciledTransactionCount: 0, unreconciledSamples: [], figures: [], figuresMatch: true, issues: [] });
});

it('does not let a user bypass a reconciliation that is still loading', async () => {
  vi.mocked(gstReconciliationService.getPeriodReconciliation).mockImplementation(() => new Promise(() => {}));
  render(<GSTReturnWizard onComplete={vi.fn()} onCancel={vi.fn()} />);
  await choosePeriod();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).not.toBeDisabled());
  for (let step = 1; step < 5; step++) fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
});

it('keeps failed reconciliation blocked and offers a retry', async () => {
  vi.mocked(gstReconciliationService.getPeriodReconciliation).mockRejectedValue(new Error('Unavailable'));
  render(<GSTReturnWizard onComplete={vi.fn()} onCancel={vi.fn()} />);
  await choosePeriod();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).not.toBeDisabled());
  for (let step = 1; step < 5; step++) fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(await screen.findByRole('button', { name: 'Retry reconciliation' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
});

async function choosePeriod() {
  fireEvent.click(screen.getAllByRole('combobox')[1]);
  fireEvent.click(await screen.findByRole('option', { name: 'Q2 (Apr-Jun)' }));
}

it('prepares output 210 and input 75 including supplier bills, and identifies invoice basis', async () => {
  render(<GSTReturnWizard onComplete={vi.fn()} onCancel={vi.fn()} />);
  await choosePeriod();
  await waitFor(() => expect(loadGstPreparation).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByLabelText('Total Sales (including GST)')).toHaveValue(1610);
  expect(screen.getByLabelText('GST on Sales')).toHaveValue(210);
  expect(screen.getByText(/invoice basis/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByLabelText('Total Purchases (including GST)')).toHaveValue(625);
  expect(screen.getByLabelText('GST on Purchases')).toHaveValue(75);
});

it('blocks progression when authoritative figures cannot load instead of preparing zero/stale GST', async () => {
  vi.mocked(loadGstPreparation).mockRejectedValue(new Error('Report unavailable'));
  render(<GSTReturnWizard onComplete={vi.fn()} onCancel={vi.fn()} />);
  await choosePeriod();
  expect(await screen.findByText(/Could not load posted GST figures/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
});

it('requires manual adjustment review for a period with net reversals instead of silently clamping its GST', async () => {
  vi.mocked(loadGstPreparation).mockResolvedValue({ basis: 'invoice', totalSales: -1150, totalPurchases: 0, gstOnSales: -150, gstOnPurchases: 0, netGstPosition: -150, warnings: ['Review reversal adjustments'] });
  render(<GSTReturnWizard onComplete={vi.fn()} onCancel={vi.fn()} />);
  await choosePeriod();
  expect(await screen.findByText(/net reversals.*manual GST adjustment review/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
});

it('supports the actual registered GST dates and an explicitly confirmed myIR due date', async () => {
  render(<GSTReturnWizard onComplete={vi.fn()} onCancel={vi.fn()} />);
  fireEvent.click(screen.getAllByRole('combobox')[1]);
  fireEvent.click(await screen.findByRole('option', { name: 'Custom dates (monthly, two-monthly or six-monthly)' }));
  fireEvent.change(screen.getByLabelText('Period start'), { target: { value: '2026-11-01' } });
  fireEvent.change(screen.getByLabelText('Period end'), { target: { value: '2026-11-30' } });
  fireEvent.change(screen.getByLabelText('Due date (confirm in myIR)'), { target: { value: '2027-01-15' } });
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Load registered period' }));
  await waitFor(() => expect(loadGstPreparation).toHaveBeenCalledWith('2026-11-01', '2026-11-30'));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).not.toBeDisabled());
});
