import React from 'react';
import { render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ReportsScreen from './ReportsScreen';
import { reportsApi, type FinancialReport } from '@/features/reports/api/reportsApi';

jest.mock('@/features/reports/api/reportsApi', () => ({
  reportsApi: { financial: jest.fn() },
}));

jest.mock('@/hooks/useTabScreenInsets', () => ({
  useTabScreenInsets: () => ({ bottomPadding: 100 }),
}));

const accountRow = {
  accountId: '11111111-1111-4111-8111-111111111111',
  accountNumber: '1200',
  accountName: 'Accounts Receivable',
  accountClass: 'asset' as const,
  debit: '230.00',
  credit: '230.00',
  balance: '0.00',
};

const report: FinancialReport = {
  meta: { from: '2026-01-01', to: '2026-12-31', basis: 'accrual', baseCurrency: 'NZD', generatedAt: '2026-10-25T00:00:00.000Z' },
  trialBalance: { rows: [{ ...accountRow, openingDebit: '0.00', openingCredit: '0.00', closingDebit: '0.00', closingCredit: '0.00' }], totalDebits: '230.00', totalCredits: '230.00', balanced: true },
  profitLoss: { rows: [], revenue: '200.00', expenses: '100.00', netIncome: '100.00' },
  balanceSheet: { rows: [], assets: '0.00', liabilities: '0.00', equity: '0.00', balanced: true },
  cashFlow: { rows: [], openingCash: '0.00', inflows: '230.00', outflows: '115.00', netCashFlow: '115.00', closingCash: '115.00' },
  receivablesAging: { total: '0.00', current: '0.00', days1To30: '0.00', days31To60: '0.00', days61To90: '0.00', over90: '0.00', items: [] },
  payablesAging: { total: '0.00', current: '0.00', days1To30: '0.00', days31To60: '0.00', days61To90: '0.00', over90: '0.00', items: [] },
  taxSummary: {
    collected: '30.00', paid: '45.00', netPayable: '-15.00',
    outputGst: '30.00', inputGst: '45.00', netGst: '-15.00', position: 'refundable',
    gstAccounts: [], keyAccounts: [],
  },
};

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><ReportsScreen /></QueryClientProvider>);
}

describe('mobile GST report', () => {
  beforeEach(() => {
    (reportsApi.financial as jest.Mock).mockResolvedValue(report);
  });

  it('shows output, input, and a positive refundable amount using the server position', async () => {
    const screen = renderScreen();
    expect(await screen.findByText('GST return (IRD)')).toBeTruthy();
    expect(screen.getByText('Output GST (sales)')).toBeTruthy();
    expect(screen.getByText('Input GST (purchases & expenses)')).toBeTruthy();
    expect(screen.getByText('Net GST refundable from IRD')).toBeTruthy();
    expect(screen.getByText('$30.00')).toBeTruthy();
    expect(screen.getByText('$45.00')).toBeTruthy();
    expect(screen.getByText('$15.00')).toBeTruthy();
    expect(screen.queryByText('-$15.00')).toBeNull();
  });

  it.each([
    ['payable', '15.00', 'Net GST payable to IRD'],
    ['nil', '0.00', 'Net GST — nil return'],
  ] as const)('shows the %s GST position label', async (position, netGst, expectedLabel) => {
    (reportsApi.financial as jest.Mock).mockResolvedValue({
      ...report,
      taxSummary: {
        ...report.taxSummary,
        netGst,
        position,
      },
    });

    const screen = renderScreen();
    expect(await screen.findByText(expectedLabel)).toBeTruthy();
  });
});
