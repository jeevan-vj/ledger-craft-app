import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConversationActionHandler } from '../conversationActionHandler';
import {
  mockConversationContext,
  mockCreateInvoiceAction,
  mockSearchCustomersAction,
  mockCreateExpenseAction,
  mockCustomer,
  mockVipCustomer,
  mockInvoice
} from '../../test/fixtures/conversationFixtures';
import {
  setupTest,
  cleanupTest,
} from '../../test/utils/testUtils';

vi.mock('../supabaseService', () => ({
  customerService: {
    getCustomers: vi.fn().mockResolvedValue([]),
    createCustomer: vi.fn(),
  },
  invoiceService: {
    createInvoice: vi.fn(),
    getInvoices: vi.fn().mockResolvedValue([]),
  },
  expenseService: {
    createExpense: vi.fn(),
    getExpenses: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../conversationService', () => ({
  conversationService: {
    addEntityToContext: vi.fn().mockResolvedValue(undefined)
  }
}));

import { conversationService } from '../conversationService';
import { customerService, expenseService, invoiceService } from '../supabaseService';
const mockConversationService = conversationService as any;

describe('ConversationActionHandler', () => {
  let actionHandler: ConversationActionHandler;
  let testMocks: ReturnType<typeof setupTest>;

  beforeEach(() => {
    testMocks = setupTest();
    actionHandler = new ConversationActionHandler();
    vi.clearAllMocks();
    vi.mocked(customerService.getCustomers).mockResolvedValue([]);
    vi.mocked(invoiceService.getInvoices).mockResolvedValue([]);
    vi.mocked(expenseService.getExpenses).mockResolvedValue([]);
    vi.mocked(invoiceService.createInvoice).mockImplementation(async (invoice) => ({
      id: 'invoice-1',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      ...invoice,
    }));
    vi.mocked(customerService.createCustomer).mockImplementation(async (customer) => ({
      id: 'customer-new',
      userId: 'test-user-id',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      isVip: false,
      tags: [],
      address: null,
      city: null,
      state: null,
      zip: null,
      country: 'NZ',
      ...customer,
    }));
    vi.mocked(expenseService.createExpense).mockImplementation(async (expense) => ({
      id: 'expense-new',
      userId: 'test-user-id',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      ...expense,
    }));
    vi.mocked(conversationService.addEntityToContext).mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanupTest(testMocks);
  });

  describe('executeAction', () => {
    it('should handle unknown action type', async () => {
      const unknownAction = {
        type: 'unknown_action',
        parameters: {},
        status: 'pending' as const
      };

      const result = await actionHandler.executeAction(
        unknownAction,
        mockConversationContext,
        'conversation-1'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown action type');
      expect(result.suggestions).toContain('Try a different action');
    });

    it('should handle action execution errors', async () => {
      const action = mockCreateInvoiceAction;
      vi.mocked(invoiceService.createInvoice).mockRejectedValue(new Error('Database error'));

      const result = await actionHandler.executeAction(
        action,
        mockConversationContext,
        'conversation-1'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to create invoice: Database error');
      expect(result.suggestions).toContain('Try again');
    });
  });

  describe('handleCreateInvoice', () => {
    it('should create invoice for existing customer', async () => {
      const action = {
        type: 'create_invoice',
        parameters: {
          customer: 'John Smith',
          items: ['web design services'],
          amount: '500'
        },
        status: 'pending' as const
      };

      // Mock invoice creation
      const mockInvoiceResponse = {
        id: 'invoice-1',
        invoice_number: 'INV-2024-001',
        customer_id: 'customer-1',
        date: '2024-01-01',
        due_date: '2024-01-31',
        subtotal: 500,
        tax_amount: 0,
        total: 500,
        status: 'draft',
        currency: 'USD',
        template_name: 'modern'
      };

      const result = await actionHandler.executeAction(
        action,
        mockConversationContext,
        'conversation-1'
      );

      expect(result.success).toBe(true);
      expect(result.data.type).toBe('invoice');
      expect(result.data.invoiceNumber).toMatch(/^INV-\d{4}-002$/);
      expect(result.data.customerName).toBe('John Smith');
      expect(result.data.total).toBe(500);
      expect(result.suggestions).toContain('Send this invoice via email');
    });

    it('should fail when customer not found', async () => {
      const action = {
        type: 'create_invoice',
        parameters: {
          customer: 'Unknown Customer',
          items: ['web design services'],
          amount: '500'
        },
        status: 'pending' as const
      };

      const contextWithoutCustomer = {
        ...mockConversationContext,
        recentEntities: {
          ...mockConversationContext.recentEntities,
          customers: []
        }
      };

      vi.mocked(customerService.getCustomers).mockResolvedValue([]);

      const result = await actionHandler.executeAction(
        action,
        contextWithoutCustomer,
        'conversation-1'
      );

      expect(result.success).toBe(false);
      expect(result.needsInfo).toBe('customer_not_found');
      expect(result.suggestions).toContain('Create customer "Unknown Customer"');
    });

    it('should fail when customer parameter is missing', async () => {
      const action = {
        type: 'create_invoice',
        parameters: {
          items: ['web design services'],
          amount: '500'
        },
        status: 'pending' as const
      };

      const result = await actionHandler.executeAction(
        action,
        mockConversationContext,
        'conversation-1'
      );

      expect(result.success).toBe(false);
      expect(result.needsInfo).toBe('customer');
      expect(result.suggestions).toContain('Specify customer name');
    });

    it('should create invoice with items from catalog', async () => {
      const action = {
        type: 'create_invoice',
        parameters: {
          customer: 'John Smith',
          items: ['Web Design Service'], // matches mockItem
          amount: undefined
        },
        status: 'pending' as const
      };

      const mockInvoiceResponse = {
        id: 'invoice-1',
        invoice_number: 'INV-2024-001',
        customer_id: 'customer-1',
        date: '2024-01-01',
        due_date: '2024-01-31',
        subtotal: 500,
        tax_amount: 0,
        total: 500,
        status: 'draft',
        currency: 'USD',
        template_name: 'modern'
      };

      const result = await actionHandler.executeAction(
        action,
        mockConversationContext,
        'conversation-1'
      );

      expect(result.success).toBe(true);
      expect(result.data.total).toBe(500); // From item catalog
    });

    it('should handle line items creation failure', async () => {
      const action = {
        type: 'create_invoice',
        parameters: {
          customer: 'John Smith',
          items: ['web design services'],
          amount: '500'
        },
        status: 'pending' as const
      };

      const mockInvoiceResponse = {
        id: 'invoice-1',
        invoice_number: 'INV-2024-001',
        customer_id: 'customer-1',
        total: 500
      };

      vi.mocked(invoiceService.createInvoice).mockRejectedValue(new Error('Failed to create invoice items'));

      const result = await actionHandler.executeAction(
        action,
        mockConversationContext,
        'conversation-1'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to create invoice items');
    });
  });

  describe('handleSearchCustomers', () => {
    it('should search customers successfully', async () => {
      const action = {
        type: 'search_customers',
        parameters: {
          query: 'Sarah'
        },
        status: 'pending' as const
      };

      // Mock database search result
      vi.mocked(customerService.getCustomers).mockResolvedValue([mockVipCustomer]);

      const result = await actionHandler.executeAction(
        action,
        mockConversationContext,
        'conversation-1'
      );

      expect(result.success).toBe(true);
      expect(result.data.type).toBe('customers');
      expect(result.data.customers).toHaveLength(1);
      expect(result.data.customers[0].name).toBe('Sarah Johnson');
      expect(result.suggestions).toContain('Create invoice for customer');
    });

    it('should handle no search results', async () => {
      const action = {
        type: 'search_customers',
        parameters: {
          query: 'NonexistentCustomer'
        },
        status: 'pending' as const
      };

      const contextWithoutMatches = {
        ...mockConversationContext,
        recentEntities: {
          ...mockConversationContext.recentEntities,
          customers: []
        }
      };

      vi.mocked(customerService.getCustomers).mockResolvedValue([]);

      const result = await actionHandler.executeAction(
        action,
        contextWithoutMatches,
        'conversation-1'
      );

      expect(result.success).toBe(false);
      expect(result.needsInfo).toBe('customer_not_found');
      expect(result.suggestions).toContain('Create customer "NonexistentCustomer"');
    });

    it('should fail when query parameter is missing', async () => {
      const action = {
        type: 'search_customers',
        parameters: {},
        status: 'pending' as const
      };

      const result = await actionHandler.executeAction(
        action,
        mockConversationContext,
        'conversation-1'
      );

      expect(result.success).toBe(false);
      expect(result.needsInfo).toBe('search_query');
      expect(result.suggestions).toContain('Provide customer name or email');
    });

    it('should combine recent and database search results', async () => {
      const action = {
        type: 'search_customers',
        parameters: {
          query: 'Smith'
        },
        status: 'pending' as const
      };

      // Database returns different customer than recent entities
      const dbCustomer = { ...mockVipCustomer, id: 'customer-3', name: 'Ada Smith', email: 'ada@example.com' };
      vi.mocked(customerService.getCustomers).mockResolvedValue([dbCustomer]);

      const result = await actionHandler.executeAction(
        action,
        mockConversationContext,
        'conversation-1'
      );

      expect(result.success).toBe(true);
      expect(result.data.customers).toHaveLength(2); // One from recent, one from DB
      expect(result.data.customers.map((c: any) => c.name)).toContain('John Smith');
      expect(result.data.customers.map((c: any) => c.name)).toContain('Ada Smith');
    });
  });

  describe('handleCreateCustomer', () => {
    it('should create customer successfully', async () => {
      const action = {
        type: 'create_customer',
        parameters: {
          name: 'New Customer',
          email: 'new@example.com',
          phone: '+1-555-0199'
        },
        status: 'pending' as const
      };

      const mockCustomerResponse = {
        id: 'customer-new',
        name: 'New Customer',
        email: 'new@example.com',
        phone: '+1-555-0199',
        country: 'US',
        is_vip: false,
        user_id: 'test-user-id',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      };

      const result = await actionHandler.executeAction(
        action,
        mockConversationContext,
        'conversation-1'
      );

      expect(result.success).toBe(true);
      expect(result.data.type).toBe('customer');
      expect(result.data.name).toBe('New Customer');
      expect(result.data.email).toBe('new@example.com');
      expect(result.suggestions).toContain('Create invoice for this customer');
      expect(mockConversationService.addEntityToContext).toHaveBeenCalledWith(
        'conversation-1',
        'customers',
        expect.objectContaining({ name: 'New Customer' })
      );
    });

    it('should fail when name parameter is missing', async () => {
      const action = {
        type: 'create_customer',
        parameters: {
          email: 'new@example.com'
        },
        status: 'pending' as const
      };

      const result = await actionHandler.executeAction(
        action,
        mockConversationContext,
        'conversation-1'
      );

      expect(result.success).toBe(false);
      expect(result.needsInfo).toBe('customer_name');
      expect(result.suggestions).toContain('Provide customer name');
    });
  });

  describe('handleCreateExpense', () => {
    it('should create expense successfully', async () => {
      const action = {
        type: 'create_expense',
        parameters: {
          amount: '$150',
          description: 'Office supplies'
        },
        status: 'pending' as const
      };

      const mockExpenseResponse = {
        id: 'expense-new',
        description: 'Office supplies',
        amount: 150,
        expense_date: '2024-01-01',
        status: 'pending',
        is_billable: false,
        tax_amount: 0,
        currency: 'USD',
        user_id: 'test-user-id'
      };

      const result = await actionHandler.executeAction(
        action,
        mockConversationContext,
        'conversation-1'
      );

      expect(result.success).toBe(true);
      expect(result.data.type).toBe('expense');
      expect(result.data.amount).toBe(150);
      expect(result.data.description).toBe('Office supplies');
      expect(result.suggestions).toContain('Upload receipt for this expense');
    });

    it('should fail when amount is missing', async () => {
      const action = {
        type: 'create_expense',
        parameters: {
          description: 'Office supplies'
        },
        status: 'pending' as const
      };

      const result = await actionHandler.executeAction(
        action,
        mockConversationContext,
        'conversation-1'
      );

      expect(result.success).toBe(false);
      expect(result.needsInfo).toBe('amount');
      expect(result.suggestions).toContain('Provide expense amount');
    });

    it('should fail when description is missing', async () => {
      const action = {
        type: 'create_expense',
        parameters: {
          amount: '$150'
        },
        status: 'pending' as const
      };

      const result = await actionHandler.executeAction(
        action,
        mockConversationContext,
        'conversation-1'
      );

      expect(result.success).toBe(false);
      expect(result.needsInfo).toBe('description');
      expect(result.suggestions).toContain('Add expense description');
    });

    it('should handle invalid amount format', async () => {
      const action = {
        type: 'create_expense',
        parameters: {
          amount: 'invalid amount',
          description: 'Office supplies'
        },
        status: 'pending' as const
      };

      const result = await actionHandler.executeAction(
        action,
        mockConversationContext,
        'conversation-1'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid amount format');
      expect(result.suggestions).toContain('Use format like $100 or 100.50');
    });
  });

  describe('handleGenerateReport', () => {
    it('should generate financial report for this month', async () => {
      const action = {
        type: 'generate_financial_report',
        parameters: {
          period: 'this month',
          type: 'summary'
        },
        status: 'pending' as const
      };

      // Mock invoice and expense data
      const mockInvoicesData = [
        { ...mockInvoice, status: 'paid', total: 500 },
        { status: 'sent', total: 300 }
      ];
      const mockExpensesData = [
        { amount: 150 },
        { amount: 100 }
      ];

      const today = new Date().toISOString().split('T')[0];
      vi.mocked(invoiceService.getInvoices).mockResolvedValue(
        mockInvoicesData.map((invoice) => ({ ...mockInvoice, ...invoice, date: today })),
      );
      vi.mocked(expenseService.getExpenses).mockResolvedValue(mockExpensesData as any);

      const result = await actionHandler.executeAction(
        action,
        mockConversationContext,
        'conversation-1'
      );

      expect(result.success).toBe(true);
      expect(result.data.type).toBe('financial_report');
      expect(result.data.metrics.totalRevenue).toBe(500); // Only paid invoices
      expect(result.data.metrics.totalExpenses).toBe(250);
      expect(result.data.metrics.profit).toBe(250);
      expect(result.data.metrics.outstandingInvoices).toBe(300); // Sent invoices
      expect(result.suggestions).toContain('Export report to PDF');
    });

    it('should handle different time periods', async () => {
      const action = {
        type: 'generate_financial_report',
        parameters: {
          period: 'last month',
          type: 'summary'
        },
        status: 'pending' as const
      };

      vi.mocked(invoiceService.getInvoices).mockResolvedValue([]);
      vi.mocked(expenseService.getExpenses).mockResolvedValue([]);

      const result = await actionHandler.executeAction(
        action,
        mockConversationContext,
        'conversation-1'
      );

      const previousMonth = new Date();
      previousMonth.setMonth(previousMonth.getMonth() - 1);
      expect(result.success).toBe(true);
      expect(result.data.period).toContain(String(previousMonth.getFullYear()));
    });
  });

  describe('generateInvoiceNumber', () => {
    it('should generate invoice number with format', () => {
      const format = 'INV-{YYYY}-{###}';
      const sequence = 5;

      const invoiceNumber = (actionHandler as any).generateInvoiceNumber(format, sequence);

      expect(invoiceNumber).toMatch(/^INV-\d{4}-005$/);
    });

    it('should handle different format patterns', () => {
      const tests = [
        { format: 'INV-{YY}-{##}', sequence: 5, expected: /^INV-\d{2}-05$/ },
        { format: '{MM}-{DD}-{#}', sequence: 5, expected: /^\d{2}-\d{2}-5$/ }
      ];

      tests.forEach(test => {
        const result = (actionHandler as any).generateInvoiceNumber(test.format, test.sequence);
        expect(result).toMatch(test.expected);
      });
    });
  });
});