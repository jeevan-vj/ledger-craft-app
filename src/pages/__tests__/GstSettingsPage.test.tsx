import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ledgerQueryKeys } from '@/features/app-data/useLedgerQueries';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import TaxConfigurationPage from '../TaxConfigurationPage';

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/components/layout/PageHeader', () => ({ PageHeader: ({ title }: { title: string }) => <h1>{title}</h1> }));
const settings = { gstRegistrationStatus: 'registered', taxId: '49091850', gstRegisteredFrom: '2026-04-01', gstAccountingBasis: 'payments', gstFilingFrequency: 'two_monthly', gstPeriodAnchor: 3, configured: true, reviewRequired: false, warnings: [] };
let canManage = true;
vi.mock('@/context/StableAuthContext', () => ({ useAuth: () => ({ me: { permissions: canManage ? ['settings.write'] : ['settings.read'] } }) }));
let requests: Array<{ method: string; body?: Record<string, unknown> }>;
beforeEach(() => {
  requests = []; canManage = true;
  vi.stubGlobal('fetch', vi.fn(async (_path: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
    requests.push({ method: init?.method ?? 'GET', body });
    return new Response(JSON.stringify({ ...settings, ...body }), { status: 200 });
  }));
});
function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(ledgerQueryKeys.businessProfile, { gstRegistrationStatus: 'unknown' });
  render(<QueryClientProvider client={client}><MemoryRouter><TaxConfigurationPage /></MemoryRouter></QueryClientProvider>);
  return client;
}
it('loads the real persisted GST choices and requires explicit confirmation before changing basis', async () => {
  const client = renderPage();
  expect(await screen.findByLabelText('Registered GST basis')).toHaveValue('payments');
  expect(screen.getByLabelText('GST registration date')).toHaveValue('2026-04-01');
  fireEvent.change(screen.getByLabelText('Registered GST basis'), { target: { value: 'hybrid' } });
  expect(requests.filter(request => request.method === 'PUT')).toHaveLength(0);
  expect(screen.getByRole('button', { name: 'Save registered GST settings' })).toBeDisabled();
  fireEvent.click(screen.getByLabelText('I have checked these settings against my IRD registration'));
  fireEvent.click(screen.getByRole('button', { name: 'Save registered GST settings' }));
  await waitFor(() => expect(requests.find(request => request.method === 'PUT')?.body).toMatchObject({ gstAccountingBasis: 'hybrid', gstFilingFrequency: 'two_monthly', gstPeriodAnchor: 3, gstRegisteredFrom: '2026-04-01' }));
  expect(await screen.findByRole('status')).toHaveTextContent('GST settings saved and reloaded');
  expect(client.getQueryState(ledgerQueryKeys.businessProfile)?.isInvalidated).toBe(true);
});
it('shows an API error and retry instead of fabricated tax settings', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { message: 'Settings unavailable', code: 'UNAVAILABLE' } }), { status: 503 })));
  renderPage();
  expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong on our side.');
  expect(screen.getByRole('button', { name: 'Retry GST settings' })).toBeInTheDocument();
  expect(screen.queryByLabelText('Registered GST basis')).not.toBeInTheDocument();
});

it('shows registered settings read-only when the session lacks settings.write', async () => {
  canManage = false; renderPage();
  expect(await screen.findByLabelText('Registered GST basis')).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Save registered GST settings' })).not.toBeInTheDocument();
});
