import { apiRequest } from '@/features/auth/api/http';
import { salesSummaryApi, businessSalesDate } from './salesSummaryApi';

jest.mock('@/features/auth/api/http', () => ({ apiRequest: jest.fn() }));
const summary = { date: '2026-11-06', count: 0, grossTotal: '0.00', gstTotal: '0.00', paymentMethods: [], topItemsByQuantity: [], topItemsByAmount: [], sales: [] };

describe('sales summary API', () => {
  beforeEach(() => jest.clearAllMocks());
  it('requests the selected calendar day and preserves server decimal strings', async () => {
    (apiRequest as jest.Mock).mockResolvedValue(summary);
    await expect(salesSummaryApi.get('2026-11-06')).resolves.toEqual(summary);
    expect(apiRequest).toHaveBeenCalledWith('/api/sales/summary?date=2026-11-06', { method: 'GET' });
  });
  it('rejects impossible dates before requesting the API', async () => {
    await expect(salesSummaryApi.get('2026-02-30')).rejects.toThrow();
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it('rejects numeric money from an invalid response', async () => {
    (apiRequest as jest.Mock).mockResolvedValue({ ...summary, grossTotal: 0 });
    await expect(salesSummaryApi.get('2026-11-06')).rejects.toThrow();
  });
  it('uses the business calendar date across UTC midnight and Auckland DST', () => {
    expect(businessSalesDate('Pacific/Auckland', new Date('2026-11-05T12:30:00Z'))).toBe('2026-11-06');
    expect(businessSalesDate('America/Los_Angeles', new Date('2026-11-06T01:00:00Z'))).toBe('2026-11-05');
  });
});
