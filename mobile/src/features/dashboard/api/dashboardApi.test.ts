import { dashboardApi } from './dashboardApi';
import { apiRequest } from '@/features/auth/api/http';

jest.mock('@/features/auth/api/http', () => ({ apiRequest: jest.fn() }));

describe('mobile dashboard API', () => {
  it('sends the same report filter DTO as web', async () => {
    (apiRequest as jest.Mock).mockResolvedValue({ layout: {}, reports: [] });
    await dashboardApi.getDashboard({ from: '2026-10-01', to: '2026-10-31', comparison: 'previous_year' });
    expect(apiRequest).toHaveBeenCalledWith('/api/dashboard?from=2026-10-01&to=2026-10-31&comparison=previous_year');
  });
});
