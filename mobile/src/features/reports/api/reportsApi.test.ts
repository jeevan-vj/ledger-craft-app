import { reportsApi } from './reportsApi';

const mockApiRequest = jest.fn();
jest.mock('@/features/auth/api/http', () => ({ apiRequest: (...args: unknown[]) => mockApiRequest(...args) }));

describe('mobile reports API', () => {
  beforeEach(() => mockApiRequest.mockReset());
  it('requests the authoritative report using canonical period and basis', async () => {
    mockApiRequest.mockResolvedValue({ meta: {} });
    await reportsApi.financial({ from: '2026-01-01', to: '2026-12-31', basis: 'accrual', baseCurrency: 'NZD' });
    expect(mockApiRequest).toHaveBeenCalledWith('/api/reports/financial?from=2026-01-01&to=2026-12-31&basis=accrual&baseCurrency=NZD', { method: 'GET' });
  });
});
