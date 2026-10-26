import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Recurring from './Recurring';
import { recurringApi } from '@/features/recurring/api';

vi.mock('@/features/recurring/api', () => ({
  recurringApi: {
    list: vi.fn(),
    runs: vi.fn(),
    action: vi.fn(),
    create: vi.fn(),
    preview: vi.fn(),
  },
}));
vi.mock('@/features/customers/hooks/useCustomers', () => ({
  useCustomersQuery: () => ({ data: [{ id: '11111111-1111-4111-8111-111111111111', name: 'Aroha Studio' }], isLoading: false }),
}));
vi.mock('@/features/app-data/useLedgerQueries', () => ({
  useItemsQuery: () => ({ data: { items: [{ id: 'item-1', name: 'Design service', salePrice: 120, taxRate: 15, unit: 'hour', enableSaleInfo: true }] }, isLoading: false }),
}));
vi.mock('@/components/invoice/ItemSelector', () => ({
  default: ({ onItemSelect }: { onItemSelect: (item: object) => void }) => <button type="button" onClick={() => onItemSelect({ id: 'item-1', name: 'Design service', salePrice: 120, taxRate: 15, unit: 'hour', enableSaleInfo: true })}>Select item</button>,
}));
vi.mock('@/features/purchases/api/purchasesApi', () => ({ purchasesApi: { listVendors: vi.fn().mockResolvedValue([]) } }));
vi.mock('@/features/bank/api/bankApi', () => ({ bankApi: { listAccounts: vi.fn().mockResolvedValue([]) } }));
vi.mock('@/features/recurring/components/RepeatSchedulePanel', async () => {
  const actual = await vi.importActual<typeof import('@/features/recurring/components/RepeatSchedulePanel')>('@/features/recurring/components/RepeatSchedulePanel');
  return { ...actual, RepeatSchedulePanel: () => <div>Custom frequency: every N days, weeks, months or years</div> };
});

const activeTemplate = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Monthly design', kind: 'invoice', status: 'active',
  payload: { kind: 'invoice', input: {} }, schedule: { frequency: 'monthly', interval: 1, startDate: '2026-10-27', timezone: 'Pacific/Auckland', localTime: '09:00' },
  nextRunAt: '2026-11-27T20:00:00.000Z', lastRunAt: null, occurrencesCreated: 1, createdAt: '2026-10-27T00:00:00.000Z', updatedAt: '2026-10-27T00:00:00.000Z',
};
const pausedTemplate = { ...activeTemplate, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Paused design', status: 'paused' };

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter><Recurring /></MemoryRouter></QueryClientProvider>);
}

describe('Recurring page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(recurringApi.list).mockResolvedValue({ templates: [activeTemplate, pausedTemplate] } as never);
    vi.mocked(recurringApi.runs).mockResolvedValue({ runs: [{
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', templateId: activeTemplate.id, occurrenceKey: '2026-10', scheduledFor: '2026-10-27T20:00:00.000Z', status: 'succeeded', attemptCount: 1,
      generatedType: 'invoice', generatedId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', deliveryStatus: 'email_not_configured', deliveryMessage: 'Not emailed: email not configured', failureReason: null, nextAttemptAt: null, createdAt: '2026-10-27T20:00:00.000Z', updatedAt: '2026-10-27T20:00:00.000Z',
    }] } as never);
    vi.mocked(recurringApi.action).mockResolvedValue({} as never);
  });

  it('uses customer and item pickers, supports multiple lines, and shows delivery history', async () => {
    renderPage();

    expect(await screen.findByLabelText('Customer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Select item' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add line' }));
    expect(screen.getAllByLabelText(/Line [12] description/)).toHaveLength(2);
    expect(screen.getByText(/Custom frequency: every N/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/ID/i)).not.toBeInTheDocument();
    expect(await screen.findByText('Not emailed: email not configured')).toBeInTheDocument();
    expect(screen.getByText('Needs sending')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open invoice' })).toHaveAttribute('href', '/invoices/dddddddd-dddd-4ddd-8ddd-dddddddddddd');
  });

  it('pauses, resumes and ends templates through the API', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Pause Monthly design' }));
    fireEvent.click(screen.getByRole('button', { name: 'Resume Paused design' }));
    fireEvent.click(screen.getByRole('button', { name: 'End Monthly design' }));

    await waitFor(() => {
      expect(recurringApi.action).toHaveBeenCalledWith(activeTemplate.id, 'pause');
      expect(recurringApi.action).toHaveBeenCalledWith(pausedTemplate.id, 'resume');
      expect(recurringApi.action).toHaveBeenCalledWith(activeTemplate.id, 'end');
    });
  });
});
