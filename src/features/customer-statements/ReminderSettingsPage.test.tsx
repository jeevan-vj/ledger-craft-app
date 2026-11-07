import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import ReminderSettingsPage from './ReminderSettingsPage';
import { statementApi } from './statementApi';
vi.mock('./statementApi', () => ({ statementApi: { settings: vi.fn(), saveSettings: vi.fn() } }));
vi.mock('@/context/StableAuthContext', () => ({ useAuth: () => ({ me: { permissions: ['settings.write'] } }) }));
const settings = { enabled: false, timeZone: 'Pacific/Auckland', localTime: '09:00', steps: [{ id: 'seven', offsetDays: 7, reminderType: 'gentle' as const }], emailAvailable: false, warnings: ['Email is unavailable; reminders are skipped.'] };
function mount() { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><ReminderSettingsPage /></MemoryRouter></QueryClientProvider>); }
describe('reminder settings', () => {
 beforeEach(() => { vi.clearAllMocks(); vi.mocked(statementApi.settings).mockResolvedValue(settings); vi.mocked(statementApi.saveSettings).mockResolvedValue(settings); });
 it('loads saved schedule and warns when delivery is unavailable', async () => { mount(); expect(await screen.findByDisplayValue('09:00')).toBeInTheDocument(); expect(screen.getByText(settings.warnings[0])).toBeInTheDocument(); });
 it('requires explicit save and submits configured schedule', async () => { mount(); await screen.findByDisplayValue('09:00'); fireEvent.click(screen.getByLabelText('Enable automatic reminders')); expect(statementApi.saveSettings).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole('button', { name: 'Save reminder schedule' })); await waitFor(() => expect(statementApi.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ enabled: true, localTime: '09:00' }))); });
 it('shows load failure and retry', async () => { vi.mocked(statementApi.settings).mockRejectedValue(new Error('Connection failed')); mount(); expect(await screen.findByRole('alert')).toHaveTextContent('Connection failed'); expect(screen.getByRole('button', { name: 'Retry reminder settings' })).toBeInTheDocument(); });
});
