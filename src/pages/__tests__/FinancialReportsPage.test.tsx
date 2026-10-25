import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { FinancialReportResponse } from '@ledgercraft/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FinancialReportsPage from '../FinancialReportsPage';
import { reportsApi } from '@/features/reports/api/reportsApi';

vi.mock('@/features/reports/api/reportsApi', () => ({
  reportsApi: { financial: vi.fn(), generalLedger: vi.fn() },
}));

const meta = {
  from: '2026-04-01',
  to: '2026-06-30',
  basis: 'accrual' as const,
  baseCurrency: 'NZD' as const,
  generatedAt: '2026-07-01T00:00:00.000Z',
};

const account = (accountNumber: string, accountName: string, accountClass: 'asset' | 'liability' | 'revenue' | 'expense', balance: string) => ({
  accountId: `00000000-0000-4000-8000-00000000${accountNumber}`,
  accountNumber,
  accountName,
  accountClass,
  debit: '0.00',
  credit: '0.00',
  balance,
});

function financialReport(taxSummary: FinancialReportResponse['taxSummary']): FinancialReportResponse {
  const emptyAging = { total: '0.00', current: '0.00', days1To30: '0.00', days31To60: '0.00', days61To90: '0.00', over90: '0.00', items: [] };
  const emptySummary = { subtotal: '0.00', tax: '0.00', total: '0.00', paid: '0.00', outstanding: '0.00' };
  return {
    meta,
    trialBalance: { rows: [], totalDebits: '0.00', totalCredits: '0.00', balanced: true },
    profitLoss: { rows: [], revenue: '0.00', expenses: '0.00', netIncome: '0.00' },
    balanceSheet: { rows: [], assets: '0.00', liabilities: '0.00', equity: '0.00', balanced: true },
    cashFlow: { rows: [], openingCash: '0.00', inflows: '0.00', outflows: '0.00', netCashFlow: '0.00', closingCash: '0.00' },
    receivablesAging: emptyAging,
    payablesAging: emptyAging,
    salesSummary: emptySummary,
    purchaseSummary: emptySummary,
    taxSummary,
    comparison: null,
  };
}

function renderPage(report: FinancialReportResponse) {
  vi.mocked(reportsApi.financial).mockResolvedValue(report);
  vi.mocked(reportsApi.generalLedger).mockResolvedValue({ meta, lines: [] });
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter><FinancialReportsPage /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Financial reports GST return', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the ledger-derived GST payable and its underlying account balances', async () => {
    const user = userEvent.setup();
    const keyAccounts = [
      account('1200', 'Accounts Receivable', 'asset', '0.00'),
      account('2100', 'Accounts Payable', 'liability', '0.00'),
      account('2200', 'GST Collected', 'liability', '30.00'),
      account('2150', 'GST Paid', 'asset', '15.00'),
      account('4000', 'Sales', 'revenue', '200.00'),
      account('5000', 'Expenses', 'expense', '100.00'),
      account('1000', 'Business Bank', 'asset', '115.00'),
    ];
    renderPage(financialReport({
      collected: '30.00', paid: '15.00', netPayable: '15.00',
      outputGst: '30.00', inputGst: '15.00', netGst: '15.00', position: 'payable',
      gstAccounts: keyAccounts.filter((row) => row.accountNumber === '2200' || row.accountNumber === '2150'),
      keyAccounts,
    }));

    await user.click(await screen.findByRole('tab', { name: 'Tax' }));

    const panel = screen.getByRole('region', { name: 'GST return (IRD)' });
    expect(within(panel).getByText('1 Apr 2026 – 30 Jun 2026')).toBeInTheDocument();
    expect(within(panel).getByText('Output GST (sales)')).toBeInTheDocument();
    expect(within(panel).getByText('Input GST (purchases & expenses)')).toBeInTheDocument();
    expect(within(panel).getByText('Net GST payable to IRD')).toBeInTheDocument();

    const table = within(panel).getByRole('table', { name: 'Underlying ledger account balances for this GST period' });
    for (const name of ['Accounts Receivable', 'Accounts Payable', 'GST Collected', 'GST Paid', 'Sales', 'Expenses', 'Business Bank']) {
      expect(within(table).getByText(new RegExp(name))).toBeInTheDocument();
    }
  });

  it('labels a refund from IRD and displays its magnitude without a negative sign', async () => {
    const user = userEvent.setup();
    renderPage(financialReport({
      collected: '15.00', paid: '30.00', netPayable: '-15.00',
      outputGst: '15.00', inputGst: '30.00', netGst: '-15.00', position: 'refundable',
      gstAccounts: [], keyAccounts: [],
    }));

    await user.click(await screen.findByRole('tab', { name: 'Tax' }));

    const position = screen.getByTestId('net-gst-position');
    expect(within(position).getByText('Net GST refundable from IRD')).toBeInTheDocument();
    expect(within(position).getByText('$15.00')).toBeInTheDocument();
    expect(within(position).queryByText('-$15.00')).not.toBeInTheDocument();
  });

  it('shows a nil GST position without implying a payment or refund', async () => {
    const user = userEvent.setup();
    renderPage(financialReport({
      collected: '30.00', paid: '30.00', netPayable: '0.00',
      outputGst: '30.00', inputGst: '30.00', netGst: '0.00', position: 'nil',
      gstAccounts: [], keyAccounts: [],
    }));

    await user.click(await screen.findByRole('tab', { name: 'Tax' }));

    const position = screen.getByTestId('net-gst-position');
    expect(within(position).getByText('No GST payable or refundable')).toBeInTheDocument();
    expect(within(position).getByText('$0.00')).toBeInTheDocument();
    expect(screen.getByText('Nil return')).toBeInTheDocument();
  });
});
