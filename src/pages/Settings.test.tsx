import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Settings from './Settings';

const getServerCapabilities = vi.hoisted(() => vi.fn());
const appData = vi.hoisted(() => ({
  businessProfile: { name: 'Kauri Studio', email: 'owner@example.com', country: 'New Zealand' },
  isLoadingBusinessProfile: false,
  updateBusinessProfile: vi.fn(),
  refreshBusinessProfile: vi.fn(),
}));
vi.mock('@/services/capabilitiesService', () => ({ getServerCapabilities }));
vi.mock('@/hooks/useAppData', () => ({ useAppData: () => appData }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/components/layout/PageHeader', () => ({ PageHeader: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock('@/components/organisations/CompanyTeamPanel', () => ({ CompanyTeamPanel: () => <div>Company team</div> }));
vi.mock('@/components/settings/CurrencyLocalizationSettings', () => ({ CurrencyLocalizationSettings: () => <div>Currency settings</div> }));
vi.mock('@/components/settings/StripePaymentsPanel', () => ({ StripePaymentsPanel: () => <div>Stripe setup panel</div> }));
vi.mock('@/components/settings/AccountDeletionPanel', () => ({ AccountDeletionPanel: () => <div>Account deletion</div> }));
vi.mock('@/components/business/ThemePicker', () => ({ default: () => <div>Theme picker</div> }));

describe('Settings Stripe capability', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/settings');
    getServerCapabilities.mockReset();
  });

  it('hides the Card payments tab when Stripe is unavailable', async () => {
    getServerCapabilities.mockResolvedValue({ email: 'available', ai: 'unavailable', stripe: 'unavailable' });
    render(<Settings />);
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Card payments' })).not.toBeInTheDocument();
    expect(screen.queryByText('Stripe setup panel')).not.toBeInTheDocument();
  });

  it('shows the Card payments tab when Stripe is available', async () => {
    getServerCapabilities.mockResolvedValue({ email: 'available', ai: 'unavailable', stripe: 'available' });
    render(<Settings />);
    expect(await screen.findByRole('tab', { name: 'Card payments' })).toBeInTheDocument();
  });
});
