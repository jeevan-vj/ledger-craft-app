import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import ShareInvoiceModal from '../ShareInvoiceModal';
import { Invoice } from '@/types/index';
import { invoicesApi } from '@/features/invoices/api/invoicesApi';

// Mock the dependencies
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/features/invoices/api/invoicesApi', () => ({
  invoicesApi: {
    share: vi.fn().mockResolvedValue({
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
  return render(<BrowserRouter>{ui}</BrowserRouter>);
}

describe('ShareInvoiceModal', () => {
  beforeEach(() => vi.clearAllMocks());
  it('creates a public link using the saved template and offers copy/open actions', async () => {
    renderModal(<ShareInvoiceModal {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Generate Share Link' }));
    await waitFor(() => expect(invoicesApi.share).toHaveBeenCalledWith('1', { templateName: 'modern', expiresAt: undefined }));
    const url = `${window.location.origin}/shared/invoice/test-token-123`;
    expect(await screen.findByLabelText('Share Link')).toHaveValue(url);
    expect(screen.getByRole('link', { name: 'Open invoice' })).toHaveAttribute('href', url);
    expect(screen.getByRole('button', { name: 'Copy Link' })).toBeInTheDocument();
  });
  it('allows changing the saved template before creating a link', async () => {
    renderModal(<ShareInvoiceModal {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'minimal' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate Share Link' }));
    await waitFor(() => expect(invoicesApi.share).toHaveBeenCalledWith('1', { templateName: 'minimal', expiresAt: undefined }));
  });
  it('defaults to classic for an invoice without a template', () => {
    renderModal(<ShareInvoiceModal {...defaultProps} invoice={{ ...mockInvoice, templateName: undefined }} />);
    expect(screen.getByRole('combobox')).toHaveValue('classic');
  });
  it('uses the next invoice template when the modal is reopened', () => {
    const view = renderModal(<ShareInvoiceModal {...defaultProps} />);
    view.rerender(<BrowserRouter><ShareInvoiceModal {...defaultProps} invoice={{ ...mockInvoice, id: '2', templateName: 'minimal' }} /></BrowserRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(screen.getByRole('combobox')).toHaveValue('minimal');
  });

});
