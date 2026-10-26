import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import InvoiceForm from '../InvoiceForm';
import { Invoice, Customer, BusinessProfile } from '@/types/index';
import { upsertRecurringInvoiceTemplate } from '@/features/recurring/invoiceTemplate';

// Mock the AppContext
const mockAppContext = {
  createItem: vi.fn(),
  items: [],
  isLoadingItems: false,
  units: ['each', 'kg', 'g'],
};

vi.mock('@/context/AppContext', () => ({
  useAppContext: () => mockAppContext,
}));

// Mock react-router-dom
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useBlocker: () => ({ state: 'unblocked' }),
  };
});

// Mock other dependencies
vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/utils/pdfUtils', () => ({
  generateInvoicePdf: vi.fn(),
}));

vi.mock('@/hooks/useAppData', () => ({
  useAppData: () => ({ units: ['each', 'kg', 'g'], itemCategories: [] }),
}));

vi.mock('@/features/recurring/components/RepeatSchedulePanel', () => ({
  defaultRepeatSettings: () => ({
    schedule: { frequency: 'monthly', interval: 1, startDate: '2026-10-27', timezone: 'Pacific/Auckland', localTime: '09:00', dayOfMonth: 27 },
    delivery: { mode: 'draft', whenEmailUnavailable: 'draft' },
  }),
  RepeatSchedulePanel: () => <div>Repeat schedule panel</div>,
}));

vi.mock('@/features/recurring/invoiceTemplate', () => ({
  buildRecurringInvoicePayload: vi.fn(() => ({ kind: 'invoice', input: {} })),
  upsertRecurringInvoiceTemplate: vi.fn(),
}));

// Mock UI components
vi.mock('@/components/ui/form', () => ({
  Form: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FormControl: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FormField: ({ children, render }: { children?: React.ReactNode; render?: any }) => 
    render ? render({ field: { value: '', onChange: vi.fn() } }) : <div>{children}</div>,
  FormItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FormLabel: ({ children }: { children: React.ReactNode }) => <label>{children}</label>,
  FormMessage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children, ...props }: { children: React.ReactNode }) => (
    <button type="button" {...props}>{children}</button>
  ),
}));

const mockCustomers: Customer[] = [
  {
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
];

const mockBusinessProfile: BusinessProfile = {
  id: '1',
  name: 'Test Business',
  email: 'business@test.com',
  phone: '123-456-7890',
  address: '123 Business St',
  city: 'Business City',
  state: 'Business State',
  zip: '12345',
  country: 'Business Country',
  currency: 'USD',
  logoUrl: null,
  theme: {
    primary: '#3B82F6',
    secondary: '#06B6D4',
    accent: '#10B981',
    text: '#111827',
    textLight: '#6B7280',
    background: '#F9FAFB',
    surface: '#FFFFFF',
  },
  defaultNotes: 'Thank you for your business!',
  defaultTerms: 'Payment due within 30 days',
  userId: 'user1',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const defaultProps = {
  mode: 'create' as const,
  customers: mockCustomers,
  businessProfile: mockBusinessProfile,
  isLoadingCustomers: false,
  onSubmit: vi.fn(),
  onCancel: vi.fn(),
  availableItems: [],
  isLoadingItems: false,
  generatedInvoiceNumber: 'INV-001',
  isLoadingInvoiceNumber: false,
};

const InvoiceFormWrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>
    <TooltipProvider>{children}</TooltipProvider>
  </BrowserRouter>
);

const readyLineItem = {
  id: '1',
  description: 'Consulting',
  quantity: 1,
  unit: 'each',
  rate: 100,
  rateUnit: 'each',
  total: 100,
};

const readyInvoice: Partial<Invoice> = {
  invoiceNumber: 'INV-001',
  customerId: '1',
  date: new Date().toISOString(),
  dueDate: new Date(Date.now() + 86_400_000).toISOString(),
  items: [readyLineItem],
  subtotal: 100,
  taxAmount: 0,
  total: 100,
  status: 'draft',
  currency: 'USD',
  notes: 'Test notes',
  terms: 'Test terms',
};

function clickSaveDraft() {
  const form = document.querySelector('form[data-invoice-form]') as HTMLFormElement | null;
  if (!form) throw new Error('Invoice form was not rendered');
  form.requestSubmit();
}

describe('InvoiceForm Template Saving', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('should include templateName in form submission for create mode', async () => {
    const mockOnSubmit = vi.fn();

    render(
      <InvoiceFormWrapper>
        <InvoiceForm {...defaultProps} initialValues={readyInvoice} onSubmit={mockOnSubmit} />
      </InvoiceFormWrapper>
    );

    await waitFor(() => {
      expect(document.querySelector('form[data-invoice-form]')).toBeTruthy();
    });

    fireEvent.click(screen.getAllByRole('button', { name: /^preview$/i })[0]);
    fireEvent.click(await screen.findByText('Modern'));
    clickSaveDraft();

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalled();
    });

    const formValues = mockOnSubmit.mock.calls[0][0];
    expect(formValues).toHaveProperty('templateName', 'modern');
  });

  it('should include templateName in form submission for edit mode', async () => {
    const mockOnSubmit = vi.fn();

    render(
      <InvoiceFormWrapper>
        <InvoiceForm
          {...defaultProps}
          mode="edit"
          initialValues={{ ...readyInvoice, id: '1', templateName: 'classic' }}
          onSubmit={mockOnSubmit}
        />
      </InvoiceFormWrapper>
    );

    await waitFor(() => {
      expect(document.querySelector('form[data-invoice-form]')).toBeTruthy();
    });

    fireEvent.click(screen.getAllByRole('button', { name: /^preview$/i })[0]);
    fireEvent.click(await screen.findByText('Corporate'));
    clickSaveDraft();

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalled();
    });

    expect(mockOnSubmit.mock.calls[0][0].templateName).toBe('corporate');
  });

  it('should default to classic template when no template is specified', async () => {
    const mockOnSubmit = vi.fn();

    render(
      <InvoiceFormWrapper>
        <InvoiceForm {...defaultProps} initialValues={readyInvoice} onSubmit={mockOnSubmit} />
      </InvoiceFormWrapper>
    );

    await waitFor(() => {
      expect(document.querySelector('form[data-invoice-form]')).toBeTruthy();
    });

    clickSaveDraft();

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalled();
    });

    expect(mockOnSubmit.mock.calls[0][0].templateName).toBe('classic');
  });

  it('shows repeat settings and creates one source-linked template after save', async () => {
    const mockOnSubmit = vi.fn().mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      invoiceNumber: 'INV-001',
    });

    render(
      <InvoiceFormWrapper>
        <InvoiceForm {...defaultProps} initialValues={readyInvoice} onSubmit={mockOnSubmit} />
      </InvoiceFormWrapper>,
    );

    fireEvent.click(await screen.findByRole('switch', { name: 'Repeat this invoice' }));
    expect(screen.getByText('Repeat schedule panel')).toBeInTheDocument();
    clickSaveDraft();

    await waitFor(() => expect(upsertRecurringInvoiceTemplate).toHaveBeenCalledTimes(1));
    expect(upsertRecurringInvoiceTemplate).toHaveBeenCalledWith(expect.objectContaining({
      sourceInvoiceId: '22222222-2222-4222-8222-222222222222',
    }));
  });
});
