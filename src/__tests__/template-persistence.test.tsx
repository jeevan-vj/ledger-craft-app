import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import InvoiceForm from '@/components/invoice/InvoiceForm';
import InvoiceViewPage from '@/pages/InvoiceViewPage';
import PublicInvoice from '@/pages/PublicInvoice';
import { Invoice, Customer, BusinessProfile } from '@/types/index';
import { publicInvoiceService } from '@/services/supabaseService';

// Mock all the dependencies
const mockAppContext = {
  createItem: vi.fn(),
  items: [],
  isLoadingItems: false,
  units: ['each', 'kg', 'g'],
  invoices: [],
  isLoadingInvoices: false,
  businessProfile: null,
};

const mockAuthContext = {
  user: { id: 'test-user', email: 'test@example.com' },
  loading: false,
  signOut: vi.fn(),
};

vi.mock('@/context/AppContext', () => ({
  useAppContext: () => mockAppContext,
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => mockAuthContext,
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ id: 'test-invoice-id', invoiceId: 'test-invoice-id' }),
    useNavigate: () => vi.fn(),
    useBlocker: () => ({ state: 'unblocked' }),
  };
});

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/utils/pdfUtils', () => ({
  generateInvoicePdf: vi.fn(),
}));

vi.mock('@/services/supabaseService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/supabaseService')>();
  return {
    ...actual,
    invoiceService: {
      ...actual.invoiceService,
      getInvoice: vi.fn(),
    },
  };
});

vi.mock('@/hooks/useAppData', () => ({
  useAppData: () => ({
    units: ['each', 'kg', 'g'],
    itemCategories: [],
    invoices: mockAppContext.invoices,
    isLoadingInvoices: mockAppContext.isLoadingInvoices,
  }),
}));

// Mock UI components
vi.mock('@/components/ui/form', () => ({
  Form: ({ children }: { children: React.ReactNode }) => <div data-testid="form">{children}</div>,
  FormControl: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FormField: ({ children, render }: { children?: React.ReactNode; render?: any }) => 
    render ? render({ field: { value: '', onChange: vi.fn() } }) : <div>{children}</div>,
  FormItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FormLabel: ({ children }: { children: React.ReactNode }) => <label>{children}</label>,
  FormMessage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children, value }: { children: React.ReactNode; value?: string }) => 
    <div data-testid="tabs" data-value={value}>{children}</div>,
  TabsContent: ({ children, value }: { children: React.ReactNode; value: string }) => 
    <div data-testid={`tab-content-${value}`}>{children}</div>,
  TabsList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children, value, ...props }: { children: React.ReactNode; value: string }) => 
    <button data-testid={`tab-trigger-${value}`} {...props}>{children}</button>,
}));

vi.mock('@/components/invoice/preview/InvoicePreview', () => ({
  default: ({ selectedTemplate, invoice }: { selectedTemplate: string; invoice: any }) => (
    <div data-testid="invoice-preview" data-template={selectedTemplate} data-invoice-id={invoice?.id}>
      Preview using template: {selectedTemplate}
      {invoice && <div data-testid="invoice-data">Invoice: {invoice.invoiceNumber}</div>}
    </div>
  ),
}));

vi.mock('@/components/invoice/templates/TemplateSelector', () => ({
  default: ({ selectedTemplate, onSelectTemplate }: { 
    selectedTemplate: string; 
    onSelectTemplate: (template: string) => void;
  }) => (
    <div data-testid="template-selector" data-selected={selectedTemplate}>
      <button onClick={() => onSelectTemplate('classic')} data-testid="template-classic">Classic</button>
      <button onClick={() => onSelectTemplate('modern')} data-testid="template-modern">Modern</button>
      <button onClick={() => onSelectTemplate('corporate')} data-testid="template-corporate">Corporate</button>
      Current: {selectedTemplate}
    </div>
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

const createMockInvoice = (templateName?: string): Invoice => ({
  id: 'test-invoice-id',
  invoiceNumber: 'INV-001',
  customerId: '1',
  customer: mockCustomers[0],
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
  templateName: templateName,
  userId: 'user1',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

function openInvoicePreview() {
  fireEvent.click(screen.getByTestId('tab-trigger-preview'));
}

async function renderPublicInvoice(invoice: Invoice) {
  vi.spyOn(publicInvoiceService, 'getPublicInvoice').mockResolvedValue({
    invoice,
    businessProfile: mockBusinessProfile,
  });
  render(
    <Wrapper>
      <PublicInvoice />
    </Wrapper>
  );
  return screen.findByTestId('invoice-preview');
}

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>
    <TooltipProvider>{children}</TooltipProvider>
  </BrowserRouter>
);

describe('Template Persistence Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('InvoiceForm Template Initialization', () => {
    it('should default to classic template in create mode', async () => {
      const props = {
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

      render(
        <Wrapper>
          <InvoiceForm {...props} />
        </Wrapper>
      );

      openInvoicePreview();
      const templateSelector = await screen.findByTestId('template-selector');
      expect(templateSelector).toHaveAttribute('data-selected', 'classic');
    });

    it('should use saved template in edit mode - modern template', async () => {
      const invoiceWithModernTemplate = createMockInvoice('modern');
      
      const props = {
        mode: 'edit' as const,
        initialValues: invoiceWithModernTemplate,
        customers: mockCustomers,
        businessProfile: mockBusinessProfile,
        isLoadingCustomers: false,
        onSubmit: vi.fn(),
        onCancel: vi.fn(),
        availableItems: [],
        isLoadingItems: false,
      };

      render(
        <Wrapper>
          <InvoiceForm {...props} />
        </Wrapper>
      );

      openInvoicePreview();
      const templateSelector = await screen.findByTestId('template-selector');
      expect(templateSelector).toHaveAttribute('data-selected', 'modern');
      expect(templateSelector).toHaveTextContent('Current: modern');
    });

    it('should use saved template in edit mode - corporate template', async () => {
      const invoiceWithCorporateTemplate = createMockInvoice('corporate');
      
      const props = {
        mode: 'edit' as const,
        initialValues: invoiceWithCorporateTemplate,
        customers: mockCustomers,
        businessProfile: mockBusinessProfile,
        isLoadingCustomers: false,
        onSubmit: vi.fn(),
        onCancel: vi.fn(),
        availableItems: [],
        isLoadingItems: false,
      };

      render(
        <Wrapper>
          <InvoiceForm {...props} />
        </Wrapper>
      );

      openInvoicePreview();
      const templateSelector = await screen.findByTestId('template-selector');
      expect(templateSelector).toHaveAttribute('data-selected', 'corporate');
      expect(templateSelector).toHaveTextContent('Current: corporate');
    });

    it('should default to classic when templateName is undefined in edit mode', async () => {
      const invoiceWithoutTemplate = createMockInvoice(undefined);
      
      const props = {
        mode: 'edit' as const,
        initialValues: invoiceWithoutTemplate,
        customers: mockCustomers,
        businessProfile: mockBusinessProfile,
        isLoadingCustomers: false,
        onSubmit: vi.fn(),
        onCancel: vi.fn(),
        availableItems: [],
        isLoadingItems: false,
      };

      render(
        <Wrapper>
          <InvoiceForm {...props} />
        </Wrapper>
      );

      openInvoicePreview();
      const templateSelector = await screen.findByTestId('template-selector');
      expect(templateSelector).toHaveAttribute('data-selected', 'classic');
    });
  });

  describe('InvoiceViewPage Template Usage', () => {
    beforeEach(() => {
      mockAppContext.invoices = [];
      mockAppContext.isLoadingInvoices = false;
    });

    it('should use saved template when viewing invoice - modern template', () => {
      const invoiceWithModernTemplate = createMockInvoice('modern');
      mockAppContext.invoices = [invoiceWithModernTemplate];

      render(
        <Wrapper>
          <InvoiceViewPage />
        </Wrapper>
      );

      const invoicePreview = screen.getByTestId('invoice-preview');
      expect(invoicePreview).toHaveAttribute('data-template', 'modern');
      expect(invoicePreview).toHaveTextContent('Preview using template: modern');
    });

    it('should use saved template when viewing invoice - corporate template', () => {
      const invoiceWithCorporateTemplate = createMockInvoice('corporate');
      mockAppContext.invoices = [invoiceWithCorporateTemplate];

      render(
        <Wrapper>
          <InvoiceViewPage />
        </Wrapper>
      );

      const invoicePreview = screen.getByTestId('invoice-preview');
      expect(invoicePreview).toHaveAttribute('data-template', 'corporate');
      expect(invoicePreview).toHaveTextContent('Preview using template: corporate');
    });

    it('should default to classic when templateName is undefined', () => {
      const invoiceWithoutTemplate = createMockInvoice(undefined);
      mockAppContext.invoices = [invoiceWithoutTemplate];

      render(
        <Wrapper>
          <InvoiceViewPage />
        </Wrapper>
      );

      const invoicePreview = screen.getByTestId('invoice-preview');
      expect(invoicePreview).toHaveAttribute('data-template', 'classic');
      expect(invoicePreview).toHaveTextContent('Preview using template: classic');
    });

    it('should show loading state', () => {
      mockAppContext.isLoadingInvoices = true;
      mockAppContext.invoices = [];

      render(
        <Wrapper>
          <InvoiceViewPage />
        </Wrapper>
      );

      expect(screen.getByText('Loading invoice...')).toBeInTheDocument();
    });

    it('should show not found when invoice does not exist', () => {
      mockAppContext.invoices = [];
      mockAppContext.isLoadingInvoices = false;

      render(
        <Wrapper>
          <InvoiceViewPage />
        </Wrapper>
      );

      expect(screen.getByText('Invoice not found.')).toBeInTheDocument();
    });
  });

  describe('PublicInvoice Template Usage', () => {
    it('should use saved template for public invoice - modern template', async () => {
      const invoiceWithModernTemplate = createMockInvoice('modern');
      const invoicePreview = await renderPublicInvoice(invoiceWithModernTemplate);
      expect(invoicePreview).toHaveAttribute('data-template', 'modern');
      expect(invoicePreview).toHaveTextContent('Preview using template: modern');
    });

    it('should use saved template for public invoice - corporate template', async () => {
      const invoiceWithCorporateTemplate = createMockInvoice('corporate');
      const invoicePreview = await renderPublicInvoice(invoiceWithCorporateTemplate);
      expect(invoicePreview).toHaveAttribute('data-template', 'corporate');
      expect(invoicePreview).toHaveTextContent('Preview using template: corporate');
    });

    it('should default to classic when templateName is undefined', async () => {
      const invoiceWithoutTemplate = createMockInvoice(undefined);
      const invoicePreview = await renderPublicInvoice(invoiceWithoutTemplate);
      expect(invoicePreview).toHaveAttribute('data-template', 'classic');
      expect(invoicePreview).toHaveTextContent('Preview using template: classic');
    });
  });

  describe('Edge Cases', () => {
    it('should handle null templateName gracefully', () => {
      const invoiceWithNullTemplate = {
        ...createMockInvoice(),
        templateName: null as any,
      };

      mockAppContext.invoices = [invoiceWithNullTemplate];

      render(
        <Wrapper>
          <InvoiceViewPage />
        </Wrapper>
      );

      const invoicePreview = screen.getByTestId('invoice-preview');
      expect(invoicePreview).toHaveAttribute('data-template', 'classic');
    });

    it('should handle invalid templateName gracefully', async () => {
      const invoiceWithInvalidTemplate = {
        ...createMockInvoice(),
        templateName: 'invalid-template' as any,
      };

      const invoicePreview = await renderPublicInvoice(invoiceWithInvalidTemplate);
      expect(invoicePreview).toHaveAttribute('data-template', 'invalid-template');
    });
  });
});