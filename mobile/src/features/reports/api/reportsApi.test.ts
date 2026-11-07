import { reportsApi } from './reportsApi';

const mockApiRequest = jest.fn();
jest.mock('@/features/auth/api/http', () => ({ apiRequest: (...args: unknown[]) => mockApiRequest(...args) }));

describe('mobile reports API', () => {
  beforeEach(() => mockApiRequest.mockReset());
  it('requests the authoritative report using canonical period and basis', async () => {
    const aging={total:'0.00',current:'0.00',days1To30:'0.00',days31To60:'0.00',days61To90:'0.00',over90:'0.00',items:[]};
    const summary={subtotal:'0.00',tax:'0.00',total:'0.00',paid:'0.00',outstanding:'0.00'};
    mockApiRequest.mockResolvedValue({
      meta:{from:'2026-01-01',to:'2026-12-31',basis:'accrual',baseCurrency:'NZD',generatedAt:'2026-11-07T00:00:00Z'},
      trialBalance:{rows:[],totalDebits:'0.00',totalCredits:'0.00',balanced:true},
      profitLoss:{rows:[],revenue:'0.00',expenses:'0.00',netIncome:'0.00'},
      balanceSheet:{rows:[],assets:'0.00',liabilities:'0.00',equity:'0.00',balanced:true},
      cashFlow:{rows:[],openingCash:'0.00',inflows:'0.00',outflows:'0.00',netCashFlow:'0.00',closingCash:'0.00'},
      receivablesAging:aging,payablesAging:aging,salesSummary:summary,purchaseSummary:summary,
      taxSummary:{collected:'0.00',paid:'0.00',netPayable:'0.00',outputGst:'0.00',inputGst:'0.00',netGst:'0.00',position:'nil',gstAccounts:[],keyAccounts:[],basis:'invoice',foreignCurrencyDocumentsExcluded:0,warnings:[]},comparison:null,
    });
    await reportsApi.financial({ from: '2026-01-01', to: '2026-12-31', basis: 'accrual', baseCurrency: 'NZD' });
    expect(mockApiRequest).toHaveBeenCalledWith('/api/reports/financial?from=2026-01-01&to=2026-12-31&basis=accrual&baseCurrency=NZD', { method: 'GET' });
  });
});
