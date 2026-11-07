import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RecurringSchedulesScreen from './RecurringSchedulesScreen';
import { recurringService } from '@/services/recurringService';
jest.mock('@/store', () => ({ useStore: (selector: (state: unknown) => unknown) => selector({ permissions: ['settings.write'] }) }));
jest.mock('@/services/recurringService', () => ({ recurringService: { list: jest.fn(), runs: jest.fn(), create: jest.fn(), update: jest.fn(), preview: jest.fn(), action: jest.fn() } }));
jest.mock('@/services/capabilitiesService', () => ({ getServerCapabilities: jest.fn().mockResolvedValue({ email: 'unavailable' }) }));
jest.mock('@/features/auth/api/http', () => ({ apiRequest: jest.fn().mockResolvedValue({ customers: [], vendors: [], accounts: [], bankAccounts: [] }) }));
jest.mock('@/hooks/useTabScreenInsets', () => ({ useTabScreenInsets: () => ({ bottomPadding: 88 }) }));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: jest.fn(), getParent: () => ({ navigate: jest.fn() }) }) }));
const clients: QueryClient[] = [];
const wrap = () => { const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); clients.push(client); return render(<QueryClientProvider client={client}><RecurringSchedulesScreen /></QueryClientProvider>); };
afterEach(() => { clients.forEach(c => c.clear()); clients.length = 0; });
describe('recurring schedules workspace', () => {
  beforeEach(() => { jest.clearAllMocks(); (recurringService.list as jest.Mock).mockResolvedValue({ templates: [] }); (recurringService.runs as jest.Mock).mockResolvedValue({ runs: [] }); });
  it('shows an empty workspace and offers invoice/bill forms with honest unavailable delivery', async () => {
    wrap(); await waitFor(() => expect(screen.getByText('No recurring schedules')).toBeTruthy());
    fireEvent.press(screen.getByText('New schedule'));
    expect(screen.getByText('Invoice')).toBeTruthy(); expect(screen.getByText('Supplier bill')).toBeTruthy();
    expect(screen.getByText(/Email delivery is unavailable/)).toBeTruthy();
  });
  it('shows server errors and retry controls without claiming an empty result', async () => {
    (recurringService.list as jest.Mock).mockRejectedValue(new Error('Offline; retry safely.'));
    wrap(); await waitFor(() => expect(screen.getByText('Schedules could not be loaded')).toBeTruthy());
    expect(screen.getByText('Try again')).toBeTruthy();
  });
});
