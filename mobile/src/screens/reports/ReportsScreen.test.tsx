import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ReportsScreen from './ReportsScreen';
import { useStore } from '@/store';
import { shareClosePack } from '@/features/reports/model/closePackShare';
import { reportsApi, type FinancialReport } from '@/features/reports/api/reportsApi';

jest.mock('@/features/reports/model/closePackShare',()=>({shareClosePack:jest.fn().mockResolvedValue(undefined)}));
jest.mock('@/components/reports/GstWorkspacePanel', () => ({ GstWorkspacePanel: () => null }));

jest.mock('@/features/reports/api/reportsApi', () => ({
  reportsApi: { financial: jest.fn(),generalLedger:jest.fn().mockResolvedValue({lines:[]}),options:jest.fn().mockResolvedValue({organisationName:'Golden business',today:'2026-10-27',timezone:'Pacific/Auckland',financialYearStartMonth:4,financialYearStartDay:1,gstPeriod:null,accounts:[],customers:[],vendors:[]}) },
}));

jest.mock('@/hooks/useTabScreenInsets', () => ({
  useTabScreenInsets: () => ({ bottomPadding: 100 }),
}));

jest.mock('@/features/reports/model/financialReportShare',()=>({shareFinancialReport:jest.fn().mockResolvedValue(undefined)}));

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
  salesSummary:{subtotal:'0.00',tax:'0.00',total:'0.00',paid:'0.00',outstanding:'0.00'},purchaseSummary:{subtotal:'0.00',tax:'0.00',total:'0.00',paid:'0.00',outstanding:'0.00'},comparison:null,
  taxSummary: {
    basis:'invoice',foreignCurrencyDocumentsExcluded:0,warnings:[],
    collected: '30.00', paid: '45.00', netPayable: '-15.00',
    outputGst: '30.00', inputGst: '45.00', netGst: '-15.00', position: 'refundable',
    gstAccounts: [], keyAccounts: [],
  },
};

const clients: QueryClient[] = [];
afterEach(() => { for (const client of clients.splice(0)) client.clear(); });
function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
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
    ['nil', '0.00', 'No GST payable or refundable'],
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

  it('labels GST as invoice basis and shows foreign-currency warnings', async () => {
    (reportsApi.financial as jest.Mock).mockResolvedValue({
      ...report,
      taxSummary: { ...report.taxSummary, basis: 'invoice', foreignCurrencyDocumentsExcluded: 1, warnings: ['1 foreign-currency document(s) excluded from GST'] },
    });
    const screen = renderScreen();
    expect(await screen.findByText('GST calculated on the invoice basis')).toBeTruthy();
    expect(screen.getByText('1 foreign-currency document(s) excluded from GST')).toBeTruthy();
  });
});
it('shows unallocated posted receivables without inventing a customer aging balance',async()=>{
 jest.mocked(reportsApi.financial).mockResolvedValue({...report,receivablesAging:{...report.receivablesAging,total:'5000.00',unallocatedControl:'5000.00'}} as never);
 const screen=renderScreen();expect(await screen.findByText('Unallocated posted receivables: $5,000.00. Link customer details before aging.')).toBeTruthy();
});
it('offers full report controls, exact account drill-down and native exports',async()=>{
 const screen=renderScreen();
 expect(await screen.findByText('Run financial report')).toBeTruthy();
 expect(screen.getByLabelText('Report start')).toBeTruthy();
 expect(screen.getByLabelText('Comparison start')).toBeTruthy();
 expect(screen.getByText('Monthly columns')).toBeTruthy();
 expect(await screen.findByText('Share PDF')).toBeTruthy();
 expect(screen.getByText('Share CSV')).toBeTruthy();
});

it('passes explicit month columns and comparison dates through to the server',async()=>{
 const screen=renderScreen();await screen.findByText('Share PDF');
 fireEvent.changeText(screen.getByLabelText('Report start'),'2026-04-01');fireEvent.changeText(screen.getByLabelText('Report end'),'2026-04-30');
 fireEvent.changeText(screen.getByLabelText('Comparison start'),'2025-04-01');fireEvent.changeText(screen.getByLabelText('Comparison end'),'2025-04-30');
 fireEvent.press(screen.getByText('Monthly columns'));fireEvent.press(screen.getByText('Run financial report'));
 await waitFor(()=>expect(reportsApi.financial).toHaveBeenLastCalledWith(expect.objectContaining({from:'2026-04-01',to:'2026-04-30',columns:'month',comparisonFrom:'2025-04-01',comparisonTo:'2025-04-30'})));
});

it('drills closing account balances through carried posted history, with no amount recomputation',async()=>{
 const screen=renderScreen();await screen.findByText('Share PDF');fireEvent.press(screen.getByText('Trial balance'));
 fireEvent.press(screen.getByLabelText('View Accounts Receivable journal lines'));
 await waitFor(()=>expect(reportsApi.generalLedger).toHaveBeenCalledWith(expect.objectContaining({from:'0001-01-01',accountIds:[accountRow.accountId],columns:undefined})));
 expect(await screen.findByText('No posted journal lines in this period.')).toBeTruthy();
});
it('shows permission failure distinctly and never presents a stale successful report as current',async()=>{
 (reportsApi.financial as jest.Mock).mockRejectedValue(Object.assign(new Error('Report permission denied'),{status:403}));const screen=renderScreen();expect(await screen.findByText('Report access required')).toBeTruthy();expect(screen.queryByText('Share PDF')).toBeNull();
});

it('separates closing trial balances from period turnover', async () => {
  (reportsApi.financial as jest.Mock).mockResolvedValue({ ...report, trialBalance: { ...report.trialBalance, totalDebits: '14605.00', totalCredits: '14605.00', closingDebits: '13680.00', closingCredits: '13680.00' } });
  const screen = renderScreen(); await screen.findByText('GST return (IRD)'); fireEvent.press(screen.getByText('Trial balance'));
  expect(screen.getByText('Period debits')).toBeTruthy(); expect(screen.getByText('Period credits')).toBeTruthy();
  expect(screen.getByText('Closing debits')).toBeTruthy(); expect(screen.getByText('Closing credits')).toBeTruthy();
  expect(screen.getAllByText('$13,680.00')).toHaveLength(2); expect(screen.getAllByText('$14,605.00')).toHaveLength(2);
});

it('requires report and bank access for the close pack and exports the selected run period',async()=>{
 const previous=useStore.getState().permissions;useStore.setState({permissions:['reports.read']});const screen=renderScreen();await screen.findByText('Share PDF');expect(screen.queryByText('Export accountant close pack')).toBeNull();expect(screen.getByText('The close pack includes bank evidence and requires banking read access.')).toBeTruthy();
 await act(async()=>useStore.setState({permissions:['reports.read','banking.read']}));fireEvent.changeText(screen.getByLabelText('Report start'),'2026-10-01');fireEvent.changeText(screen.getByLabelText('Report end'),'2026-10-31');fireEvent.press(screen.getByText('Run financial report'));await waitFor(()=>expect(reportsApi.financial).toHaveBeenLastCalledWith(expect.objectContaining({from:'2026-10-01',to:'2026-10-31'})));fireEvent.press(await screen.findByText('Export accountant close pack'));await screen.findByText('Accountant close pack ready.');expect(shareClosePack).toHaveBeenCalledWith('2026-10-01','2026-10-31');await act(async()=>useStore.setState({permissions:previous}));
});

it.each([
  ['2000.00', '$2,000.00', '12000.00'],
  ['-500.00', '-$500.00', '9500.00'],
])('shows server accumulated earnings %s as already included in equity', async (accumulatedEarnings, display, equity) => {
  (reportsApi.financial as jest.Mock).mockResolvedValue({ ...report, balanceSheet: {
    ...report.balanceSheet, assets: '12915.00', liabilities: '915.00', equity, accumulatedEarnings,
    rows: [{ ...accountRow, accountNumber: '3000', accountName: 'Owner capital', accountClass: 'equity', balance: '10000.00' }],
  } });
  const screen = renderScreen(); await screen.findByText('Share PDF'); fireEvent.press(screen.getByText('Balance sheet'));
  expect(screen.getByText('Accumulated earnings (included in equity)')).toBeTruthy();
  expect(screen.getByText(display)).toBeTruthy();
  expect(screen.getByText('$10,000.00')).toBeTruthy();
  expect(screen.getByText(equity === '12000.00' ? '$12,000.00' : '$9,500.00')).toBeTruthy();
});

it('does not invent an earnings bridge when an older server omits accumulated earnings', async () => {
  (reportsApi.financial as jest.Mock).mockResolvedValue(report);
  const screen = renderScreen(); await screen.findByText('Share PDF'); fireEvent.press(screen.getByText('Balance sheet'));
  expect(screen.queryByText('Accumulated earnings (included in equity)')).toBeNull();
});
