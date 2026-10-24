import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import ShareInvoiceModal from '../ShareInvoiceModal';
import { Invoice } from '@/types/index';
import { invoicesApi } from '@/features/invoices/api/invoicesApi';

const toast = vi.hoisted(() => vi.fn());
const permanent = { shareToken: 'test-token-123', templateName: 'modern', expiresAt: null, isActive: true, accessCount: 0, createdAt: '2026-10-24T00:00:00.000Z' };

// Mock the dependencies
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast }),
}));

vi.mock('@/features/invoices/api/invoicesApi', () => ({
  invoicesApi: {
    shares: vi.fn().mockResolvedValue([]),
    share: vi.fn().mockResolvedValue({
      templateName: 'modern',
      shareToken: 'test-token-123',
      expiresAt: null,
      isActive: true,
    }),
  },
}));

vi.mock('@/services/supabaseService', () => ({
  sharedInvoiceService: {
    createSharedInvoice: vi.fn().mockResolvedValue({
      shareToken: 'test-token-123',
      id: '1',
      invoiceId: '1',
      templateName: 'modern',
      expiresAt: null,
      createdAt: new Date().toISOString(),
    }),
  },
  businessProfileService: {
    getBusinessProfile: vi.fn().mockResolvedValue(null),
  },
}));

// Mock UI components
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div role="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({ children, onValueChange, value }: {
    children: React.ReactNode;
    onValueChange: (value: string) => void;
    value?: string;
  }) => (
    <div data-testid="template-select" data-default-value={value}>
      <select onChange={(e) => onValueChange(e.target.value)} value={value}>
        <option value="classic">Classic</option>
        <option value="modern">Modern</option>
        <option value="minimal">Minimal</option>
        <option value="executive">Executive</option>
        <option value="corporate">Corporate</option>
        <option value="modernPro">Modern Pro</option>
      </select>
      {children}
    </div>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) =>
    <option value={value}>{children}</option>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
}));

const mockInvoice: Invoice = {
  id: '1',
  invoiceNumber: 'INV-001',
  customerId: '1',
  customer: {
    id: '1',
    name: 'Test Customer',
    email: 'test@example.com',
    phone: '123-456-7890',
    address: '123 Test St',
    city: 'Test City',
    state: 'Test State',
    zip: '12345',
    country: 'Test Country',
    isVip: false,
    userId: 'user1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  date: new Date().toISOString(),
  dueDate: new Date().toISOString(),
  items: [],
  subtotal: 100,
  taxAmount: 10,
  total: 110,
  status: 'draft',
  currency: 'USD',
  notes: 'Test notes',
  terms: 'Test terms',
  userId: 'user1',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  templateName: 'modern', // This is the key field we're testing
};

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  invoice: mockInvoice,
  businessName: 'Test Business',
};

function renderModal(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return { client, ...render(ui, { wrapper: ({ children }) => <QueryClientProvider client={client}><BrowserRouter>{children}</BrowserRouter></QueryClientProvider> }) };
}

describe('ShareInvoiceModal', () => {
  it('displays the actual permanent expiry when the API reuses a link despite a one-day request', async () => {
    renderModal(<ShareInvoiceModal {...defaultProps} />);
    fireEvent.click(await screen.findByRole('switch', { name: 'Link Expiration' }));
    fireEvent.change(screen.getByLabelText('Expires in (days)'), { target: { value: '1' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Generate Share Link' }));
    await screen.findByLabelText('Share Link');
    expect(screen.queryByText('Expires in 1 day')).not.toBeInTheDocument();
    expect(screen.getByText(/Active link · No expiry/)).toBeInTheDocument();
  });
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(invoicesApi.shares).mockResolvedValue([]); vi.mocked(invoicesApi.share).mockResolvedValue(permanent); });
  it('creates a public link using the saved template and offers copy/open actions', async () => {
    renderModal(<ShareInvoiceModal {...defaultProps} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Generate Share Link' }));
    await waitFor(() => expect(invoicesApi.share).toHaveBeenCalledWith('1', { templateName: 'modern', expiresAt: undefined }));
    const url = `${window.location.origin}/shared/invoice/test-token-123`;
    expect(await screen.findByLabelText('Share Link')).toHaveValue(url);
    expect(screen.getByRole('link', { name: 'Open invoice' })).toHaveAttribute('href', url);
    expect(screen.getByRole('button', { name: 'Copy Link' })).toBeInTheDocument();
  });
  it('allows changing the saved template before creating a link', async () => {
    renderModal(<ShareInvoiceModal {...defaultProps} />);
    await screen.findByRole('button', { name: 'Generate Share Link' });
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'minimal' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Generate Share Link' }));
    await waitFor(() => expect(invoicesApi.share).toHaveBeenCalledWith('1', { templateName: 'minimal', expiresAt: undefined }));
  });
  it('loads an existing snapshot without creating or replacing it and confirms expiry replacement', async () => {
    vi.mocked(invoicesApi.shares).mockResolvedValue([permanent]);
    vi.mocked(invoicesApi.share).mockResolvedValue({ ...permanent, shareToken: 'new-token', expiresAt: '2099-11-01T10:00:00.000Z' });
    renderModal(<ShareInvoiceModal {...defaultProps} />);
    expect(await screen.findByLabelText('Share Link')).toHaveValue(`${window.location.origin}/shared/invoice/test-token-123`);
    expect(invoicesApi.share).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('switch', { name: 'Link Expiration' }));
    fireEvent.change(screen.getByLabelText('Expires in (days)'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Replace link' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('All active links');
    fireEvent.click(screen.getByRole('button', { name: 'Keep existing links' }));
    expect(invoicesApi.share).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Replace link' }));
    fireEvent.click(screen.getByRole('button', { name: 'Replace and invalidate old links' }));
    await waitFor(() => expect(invoicesApi.share).toHaveBeenCalledWith('1', { templateName: 'modern', replace: true, expiresAt: expect.any(String) }));
    await waitFor(() => expect(screen.getByLabelText('Share Link')).toHaveValue(`${window.location.origin}/shared/invoice/new-token`));
    expect(screen.getByText(/Active link · Expires/)).toHaveTextContent(new Date('2099-11-01T10:00:00.000Z').toLocaleString());
  });
  it('offers retry after load failure without creating a link', async () => {
    vi.mocked(invoicesApi.shares).mockRejectedValueOnce(new Error('private-token'));
    renderModal(<ShareInvoiceModal {...defaultProps} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Retry loading links' }));
    await screen.findByRole('button', { name: 'Generate Share Link' });
    expect(invoicesApi.share).not.toHaveBeenCalled();
    expect(document.body).not.toHaveTextContent('private-token');
  });
  it('preserves an existing link after replacement fails and allows retry without exposing errors', async () => {
    vi.mocked(invoicesApi.shares).mockResolvedValue([permanent]);
    vi.mocked(invoicesApi.share).mockRejectedValueOnce(new Error('/shared/invoice/private-token'));
    renderModal(<ShareInvoiceModal {...defaultProps} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Replace link' }));
    fireEvent.click(screen.getByRole('button', { name: 'Replace and invalidate old links' }));
    await screen.findByText('Could not update the share link. Check the current links and try again.');
    expect(screen.getByLabelText('Share Link')).toHaveValue(`${window.location.origin}/shared/invoice/test-token-123`);
    expect(document.body).not.toHaveTextContent('private-token');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Replace link' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Replace link' }));
    fireEvent.click(screen.getByRole('button', { name: 'Replace and invalidate old links' }));
    await waitFor(() => expect(invoicesApi.share).toHaveBeenCalledTimes(2));
  });
  it('does not let a delayed background list restore a revoked link after replacement', async () => {
    let resolveList!: (value: typeof permanent[]) => void;
    let resolveReplacement!: (value: typeof permanent) => void;
    const delayedList = new Promise<typeof permanent[]>(resolve => { resolveList = resolve; });
    const delayedReplacement = new Promise<typeof permanent>(resolve => { resolveReplacement = resolve; });
    vi.mocked(invoicesApi.shares).mockResolvedValueOnce([permanent]).mockReturnValueOnce(delayedList);
    vi.mocked(invoicesApi.share).mockReturnValueOnce(delayedReplacement);
    const { client } = renderModal(<ShareInvoiceModal {...defaultProps} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Replace link' }));
    // A focus/poll refresh starts while the confirmation is open.
    act(() => { void client.refetchQueries({ queryKey: ['invoice-shares', '1'] }); });
    await waitFor(() => expect(invoicesApi.shares).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: 'Replace and invalidate old links' }));
    await waitFor(() => expect(invoicesApi.share).toHaveBeenCalled());
    await act(async () => { resolveReplacement({ ...permanent, shareToken: 'replacement-token' }); });
    await waitFor(() => expect(screen.getByLabelText('Share Link')).toHaveValue(`${window.location.origin}/shared/invoice/replacement-token`));
    await act(async () => { resolveList([permanent]); });
    await waitFor(() => expect(client.getQueryData(['invoice-shares', '1'])).toEqual([{ ...permanent, shareToken: 'replacement-token' }]));
    expect(screen.getByLabelText('Share Link')).toHaveValue(`${window.location.origin}/shared/invoice/replacement-token`);
  });
  it('treats share-sheet dismissal as cancellation and copies the existing link', async () => {
    vi.mocked(invoicesApi.shares).mockResolvedValue([permanent]);
    const share = vi.fn().mockRejectedValue(new DOMException('private-token', 'AbortError'));
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    renderModal(<ShareInvoiceModal {...defaultProps} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Share' }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(toast).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copy Link' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/shared/invoice/test-token-123`));
    expect(invoicesApi.share).not.toHaveBeenCalled();
  });
  it('defaults to classic for an invoice without a template', () => {
    renderModal(<ShareInvoiceModal {...defaultProps} invoice={{ ...mockInvoice, templateName: undefined }} />);
    expect(screen.getByRole('combobox')).toHaveValue('classic');
  });
  it('uses the next invoice template when the modal is reopened', async () => {
    const view = renderModal(<ShareInvoiceModal {...defaultProps} />);
    view.rerender(<ShareInvoiceModal {...defaultProps} invoice={{ ...mockInvoice, id: '2', templateName: 'minimal' }} />);
    await screen.findByRole('button', { name: 'Generate Share Link' });
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(screen.getByRole('combobox')).toHaveValue('minimal');
  });

});
