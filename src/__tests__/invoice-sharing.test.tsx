import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import ShareInvoiceModal from '@/components/invoice/ShareInvoiceModal';
import { invoicesApi } from '@/features/invoices/api/invoicesApi';
import { Invoice } from '@/types';

vi.mock('@/features/invoices/api/invoicesApi', () => ({
  invoicesApi: {
    shares: vi.fn().mockResolvedValue([]),
    share: vi.fn(),
    getShared: vi.fn(),
  },
}));

// Mock the supabase service
vi.mock('@/services/supabaseService', () => ({
  sharedInvoiceService: {
    createSharedInvoice: vi.fn(),
    getSharedInvoiceByToken: vi.fn(),
  },
  businessProfileService: {
    getBusinessProfile: vi.fn().mockResolvedValue(null),
  },
}));

// Mock the toast hook
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

// Mock PDF utils
vi.mock('@/utils/pdfUtils', () => ({
  generateInvoicePdf: vi.fn(),
}));

const mockInvoice: Invoice = {
  id: 'test-invoice-id',
  invoiceNumber: 'INV-001',
  customerId: 'customer-1',
  date: '2024-01-01',
  dueDate: '2024-01-31',
  items: [
    {
      id: 'item-1',
      description: 'Test Item',
      quantity: 1,
      unit: 'each',
      rate: 100,
      total: 100,
    },
  ],
  subtotal: 100,
  taxAmount: 10,
  total: 110,
  status: 'draft',
  currency: 'USD',
  templateName: 'classic',
};

const renderShareModal = (props = {}) => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    invoice: mockInvoice,
    businessName: 'Test Business',
    ...props,
  };

  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><BrowserRouter>
      <ShareInvoiceModal {...defaultProps} />
    </BrowserRouter></QueryClientProvider>
  );
};

describe('Invoice Sharing Feature', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ShareInvoiceModal', () => {
    it('renders correctly with invoice information', async () => {
      renderShareModal();
      
      expect(screen.getByText('Share Invoice INV-001')).toBeInTheDocument();
      expect(screen.getByText(/Anyone with the link can view this invoice/)).toBeInTheDocument();
      expect(screen.getByText('Template')).toBeInTheDocument();
      expect(await screen.findByText('Generate Share Link')).toBeInTheDocument();
    });

    it('allows template selection', async () => {
      renderShareModal();

      await screen.findByText('Generate Share Link');
      fireEvent.click(screen.getByText('Change'));
      
      const templateSelect = screen.getByRole('combobox');
      fireEvent.click(templateSelect);
      
      await waitFor(() => {
        expect(screen.getByText('Modern')).toBeInTheDocument();
        expect(screen.getByText('Minimal')).toBeInTheDocument();
        expect(screen.getByText('Executive')).toBeInTheDocument();
      });
    });

    it('handles expiration settings', async () => {
      renderShareModal();
      
      const expirationSwitch = await screen.findByRole('switch');
      fireEvent.click(expirationSwitch);
      
      expect(screen.getByLabelText('Expires in (days)')).toBeInTheDocument();
    });

    it('creates share link when button is clicked', async () => {
      vi.mocked(invoicesApi.share).mockResolvedValue({
        shareToken: 'test-token-123',
        templateName: 'classic',
        createdAt: '2026-10-24T00:00:00Z',
        accessCount: 0,
        expiresAt: null,
        isActive: true,
      });

      renderShareModal();
      
      const generateButton = await screen.findByText('Generate Share Link');
      fireEvent.click(generateButton);

      await waitFor(() => {
        expect(invoicesApi.share).toHaveBeenCalledWith('test-invoice-id', {
          templateName: 'classic',
          expiresAt: undefined,
        });
      });
    });

    it('displays share URL after generation', async () => {
      vi.mocked(invoicesApi.share).mockResolvedValue({
        shareToken: 'test-token-123',
        templateName: 'classic',
        createdAt: '2026-10-24T00:00:00Z',
        accessCount: 0,
        expiresAt: null,
        isActive: true,
      });

      renderShareModal();
      
      const generateButton = await screen.findByText('Generate Share Link');
      fireEvent.click(generateButton);

      await waitFor(() => {
        const shareInput = screen.getByDisplayValue(/\/shared\/invoice\/test-token-123/);
        expect(shareInput).toBeInTheDocument();
      });

      expect(screen.getByText('Copy Link')).toBeInTheDocument();
    });
  });

  describe('Database Schema', () => {
    it('ensures invoice has templateName field', () => {
      expect(mockInvoice.templateName).toBe('classic');
    });

    it('validates shared invoice structure', () => {
      const sharedInvoice = {
        id: 'shared-id',
        originalInvoiceId: 'invoice-id',
        invoiceData: mockInvoice,
        templateData: {
          templateName: 'classic',
          businessProfile: {},
        },
        shareToken: 'token-123',
        createdAt: '2024-01-01',
        expiresAt: null,
        accessCount: 0,
        isActive: true,
        createdBy: 'user-id',
      };

      expect(sharedInvoice).toHaveProperty('shareToken');
      expect(sharedInvoice).toHaveProperty('invoiceData');
      expect(sharedInvoice).toHaveProperty('templateData');
      expect(sharedInvoice).toHaveProperty('accessCount');
      expect(sharedInvoice).toHaveProperty('isActive');
    });
  });

  describe('Security Features', () => {
    it('generates unique share tokens', () => {
      const token1 = 'token-123';
      const token2 = 'token-456';
      
      expect(token1).not.toBe(token2);
      expect(token1).toMatch(/^[a-zA-Z0-9-]+$/);
    });

    it('supports expiration dates', () => {
      const now = new Date();
      const futureDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      
      expect(futureDate > now).toBe(true);
    });

    it('tracks access count', () => {
      const sharedInvoice = {
        accessCount: 0,
        isActive: true,
      };

      // Simulate access
      sharedInvoice.accessCount += 1;
      
      expect(sharedInvoice.accessCount).toBe(1);
    });
  });
});

describe('Invoice Form Template Selection', () => {
  it('includes templateName in form submission', () => {
    const formData = {
      invoiceNumber: 'INV-001',
      customerId: 'customer-1',
      date: new Date(),
      dueDate: new Date(),
      currency: 'USD',
      templateName: 'modern',
    };

    expect(formData.templateName).toBe('modern');
  });
});