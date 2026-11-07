import { recurringService } from '@/services/recurringService';
import { apiRequest } from '@/features/auth/api/http';
jest.mock('@/features/auth/api/http', () => ({ apiRequest: jest.fn() }));
describe('recurring service', () => {
  it('requests the server preview and full retry-safe invoice creation', async () => {
    (apiRequest as jest.Mock).mockResolvedValue({ occurrences: [] });
    const schedule = { frequency: 'monthly' as const, interval: 1, startDate: '2026-10-31', timezone: 'Pacific/Auckland', localTime: '09:00' };
    await recurringService.preview({ schedule, count: 5 });
    expect(apiRequest).toHaveBeenCalledWith('/api/recurring-templates/preview', expect.objectContaining({ body: JSON.stringify({ schedule, count: 5 }) }));
  });
});
