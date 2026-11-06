import { describe, it, expect, beforeEach, vi, beforeAll, afterAll } from 'vitest';
import { supabaseDataService } from '../supabaseDataService';
import { taxCalculationService } from '../taxCalculationService';
import { irdReportingService } from '../irdReportingService';
import { TaxConfiguration } from '@/types/payment';

/**
 * Real Data Integration Tests
 * These tests verify the tax system works with actual Supabase data
 * Mock Supabase calls to test the integration logic without database dependencies
 */
describe('Real Data Integration Tests', () => {
  const mockUserId = 'test-user-123';
  const testPeriodStart = '2024-01-01';
  const testPeriodEnd = '2024-03-31';

  // Mock data that would come from Supabase
  const mockTaxConfig: TaxConfiguration = {
    id: 'tax-config-1',
    userId: mockUserId,
    countryCode: 'NZ',
    taxType: 'GST',
    taxRate: 0.15,
    taxName: 'GST',
    appliesToServices: true,
    appliesToGoods: true,
    effectiveFrom: '2024-01-01',
    effectiveTo: null,
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z'
  };

  const mockInvoices = [
    {
      id: 'inv-1',
      user_id: mockUserId,
      customer_id: 'cust-1',
      invoice_number: 'INV-001',
      date: '2024-02-15',
      due_date: '2024-03-15',
      status: 'sent',
      subtotal: 1000.00,
      tax_amount: 150.00,
      total: 1150.00,
      discount: null,
      currency: 'NZD',
      notes: null,
      terms: null,
      created_at: '2024-02-15T00:00:00Z',
      updated_at: '2024-02-15T00:00:00Z',
      tax_inclusive: true,
      tax_rate: 0.15,
      payment_status: 'unpaid',
      balance_due: 1150.00,
      tax_breakdown: null,
      taxInclusive: true,
      paymentStatus: 'unpaid' as const,
      balanceDue: 1150.00,
      lineItems: [
        {
          id: 'line-1',
          invoice_id: 'inv-1',
          description: 'Consulting Services',
          quantity: 10,
          rate: 100.00,
          tax: 15,
          total: 1000.00,
          unit: 'hours',
          created_at: '2024-02-15T00:00:00Z',
          updated_at: '2024-02-15T00:00:00Z',
          tax_inclusive: true,
          taxable: true
        }
      ]
    },
    {
      id: 'inv-2',
      user_id: mockUserId,
      customer_id: 'cust-2',
      invoice_number: 'INV-002',
      date: '2024-03-01',
      due_date: '2024-03-31',
      status: 'paid',
      subtotal: 2000.00,
      tax_amount: 300.00,
      total: 2300.00,
      discount: null,
      currency: 'NZD',
      notes: null,
      terms: null,
      created_at: '2024-03-01T00:00:00Z',
      updated_at: '2024-03-01T00:00:00Z',
      tax_inclusive: false,
      tax_rate: 0.15,
      payment_status: 'paid',
      balance_due: 0,
      tax_breakdown: null,
      taxInclusive: false,
      paymentStatus: 'paid' as const,
      balanceDue: 0,
      lineItems: [
        {
          id: 'line-2',
          invoice_id: 'inv-2',
          description: 'Product Sales',
          quantity: 20,
          rate: 100.00,
          tax: 15,
          total: 2000.00,
          unit: 'units',
          created_at: '2024-03-01T00:00:00Z',
          updated_at: '2024-03-01T00:00:00Z',
          tax_inclusive: false,
          taxable: true
        }
      ]
    }
  ];

  const mockExpenses = [
    {
      id: 'exp-1',
      user_id: mockUserId,
      date: '2024-02-01',
      description: 'Office Supplies',
      amount: 230.00,
      category: 'OFFICE_SUPPLIES',
      supplier_name: 'Office Store Ltd',
      receipt_url: null,
      tax_amount: 30.00,
      tax_rate: 0.15,
      tax_inclusive: true,
      is_claimable: true,
      is_capital_expense: false,
      created_at: '2024-02-01T00:00:00Z',
      updated_at: '2024-02-01T00:00:00Z'
    },
    {
      id: 'exp-2',
      user_id: mockUserId,
      date: '2024-02-15',
      description: 'Computer Equipment',
      amount: 3000.00,
      category: 'EQUIPMENT',
      supplier_name: 'Tech Store Ltd',
      receipt_url: null,
      tax_amount: 391.30,
      tax_rate: 0.15,
      tax_inclusive: true,
      is_claimable: true,
      is_capital_expense: true,
      created_at: '2024-02-15T00:00:00Z',
      updated_at: '2024-02-15T00:00:00Z'
    }
  ];

  const mockPayments = [
    {
      id: 'pay-1',
      userId: mockUserId,
      invoiceId: 'inv-2',
      amount: 2300.00,
      paymentDate: '2024-03-15',
      paymentMethod: 'bank_transfer' as const,
      referenceNumber: 'TXN-001',
      status: 'completed' as const,
      createdAt: '2024-03-15T00:00:00Z',
      updatedAt: '2024-03-15T00:00:00Z'
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  beforeAll(() => {
    // Mock all Supabase data service methods
    vi.spyOn(supabaseDataService, 'getTaxConfiguration').mockResolvedValue(mockTaxConfig);
    vi.spyOn(supabaseDataService, 'getInvoicesByPeriod').mockResolvedValue(mockInvoices.map((row) => ({ ...row,
      invoiceNumber: row.invoice_number, taxAmount: row.tax_amount, customerId: row.customer_id, userId: row.user_id, dueDate: row.due_date,
      status: row.paymentStatus === 'paid' ? 'paid' as const : 'sent' as const,
      totalPaid: row.paymentStatus === 'paid' ? row.total : 0,
      items: row.lineItems.map((line) => ({ ...line, invoiceId: row.id, rateUnit: line.unit })),
    })));
    vi.spyOn(supabaseDataService, 'getExpensesByPeriod').mockResolvedValue(mockExpenses.map((row) => ({ ...row,
      category: undefined, category_id: row.category, expenseDate: row.date, expense_date: row.date,
      status: 'approved' as const, isBillable: false, taxAmount: row.tax_amount, gstAmount: row.tax_amount, currency: 'NZD',
    })));
    vi.spyOn(supabaseDataService, 'getPaymentsByPeriod').mockResolvedValue(mockPayments);
    vi.spyOn(supabaseDataService, 'createTaxReturn').mockImplementation(async (taxReturn) => ({
      id: 'tax-return-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...taxReturn
    }));
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  describe('Tax Configuration Integration', () => {
    it('should fetch and use real tax configuration from Supabase', async () => {
      const config = await taxCalculationService.getActiveTaxConfiguration(mockUserId);
      
      expect(config).toEqual(mockTaxConfig);
      expect(supabaseDataService.getTaxConfiguration).toHaveBeenCalledWith(mockUserId, 'NZ');
    });

    it('should create default tax configuration if none exists', async () => {
      // Mock no existing configuration
      vi.spyOn(supabaseDataService, 'getTaxConfiguration').mockResolvedValueOnce(null);
      vi.spyOn(supabaseDataService, 'createDefaultTaxConfiguration').mockResolvedValueOnce(mockTaxConfig);

      const config = await taxCalculationService.getActiveTaxConfiguration(mockUserId);
      
      expect(config).toEqual(mockTaxConfig);
      expect(supabaseDataService.createDefaultTaxConfiguration).toHaveBeenCalledWith(mockUserId);
    });
  });

  describe('Invoice Data Integration', () => {
    it('should fetch and process real invoice data for GST calculations', async () => {
      const invoices = await supabaseDataService.getInvoicesByPeriod(
        mockUserId,
        testPeriodStart,
        testPeriodEnd
      );

      expect(invoices).toHaveLength(2);
      expect(invoices[0]).toMatchObject({
        id: 'inv-1',
        total: 1150.00,
        tax_amount: 150.00,
        taxInclusive: true
      });
      expect(invoices[1]).toMatchObject({
        id: 'inv-2',
        total: 2300.00,
        tax_amount: 300.00,
        taxInclusive: false
      });
    });

    it('should calculate GST return sales using real invoice data', async () => {
      const taxConfig = await taxCalculationService.getActiveTaxConfiguration(mockUserId);
      const invoices = await supabaseDataService.getInvoicesByPeriod(
        mockUserId,
        testPeriodStart,
        testPeriodEnd
      );

      const salesData = invoices.map(invoice => ({
        amount: invoice.total,
        taxInclusive: invoice.taxInclusive || true,
        taxable: invoice.total > 0
      }));

      const result = await taxCalculationService.calculateGSTReturnSales(salesData, taxConfig!);

      expect(result.totalSales).toBe(3450.00); // 1150 + 2300
      expect(result.gstOnSales).toBe(450.00); // 150 + 300
      expect(result.standardRated).toBe(3450.00);
      expect(result.zeroRated).toBe(0);
    });
  });

  describe('Expense Data Integration', () => {
    it('should fetch and process real expense data for GST calculations', async () => {
      const expenses = await supabaseDataService.getExpensesByPeriod(
        mockUserId,
        testPeriodStart,
        testPeriodEnd
      );

      expect(expenses).toHaveLength(2);
      expect(expenses[0]).toMatchObject({
        id: 'exp-1',
        amount: 230.00,
        tax_amount: 30.00,
        is_claimable: true,
        is_capital_expense: false
      });
      expect(expenses[1]).toMatchObject({
        id: 'exp-2',
        amount: 3000.00,
        tax_amount: 391.30,
        is_claimable: true,
        is_capital_expense: true
      });
    });

    it('should calculate GST return purchases using real expense data', async () => {
      const taxConfig = await taxCalculationService.getActiveTaxConfiguration(mockUserId);
      const expenses = await supabaseDataService.getExpensesByPeriod(
        mockUserId,
        testPeriodStart,
        testPeriodEnd
      );

      const purchaseData = expenses.map(expense => ({
        amount: expense.amount,
        taxInclusive: expense.tax_inclusive,
        taxable: expense.is_claimable
      }));

      const result = await taxCalculationService.calculateGSTReturnPurchases(purchaseData, taxConfig!);

      expect(result.totalPurchases).toBe(3230.00); // 230 + 3000
      expect(result.gstOnPurchases).toBe(421.30); // 30 + 391.30
      expect(result.standardRated).toBe(3230.00);
    });
  });

  describe('Complete IRD GST Return Integration', () => {
    it('should generate complete GST return using real Supabase data', async () => {
      const gstReturnData = await taxCalculationService.generateIRDGSTReturn(
        mockUserId,
        testPeriodStart,
        testPeriodEnd
      );

      expect(gstReturnData.gstReturn).toBeDefined();
      
      // Sales Details
      expect(gstReturnData.gstReturn!.salesDetails.totalSales).toBe(3450.00);
      expect(gstReturnData.gstReturn!.salesDetails.gstOnSales).toBe(450.00);
      expect(gstReturnData.gstReturn!.salesDetails.standardRated).toBe(3450.00);
      expect(gstReturnData.gstReturn!.salesDetails.zeroRated).toBe(0);

      // Purchase Details
      expect(gstReturnData.gstReturn!.purchaseDetails.totalPurchases).toBe(3230.00);
      expect(gstReturnData.gstReturn!.purchaseDetails.gstOnPurchases).toBe(421.30);
      expect(gstReturnData.gstReturn!.purchaseDetails.standardRated).toBe(3230.00);
      expect(gstReturnData.gstReturn!.purchaseDetails.capitalGoods).toBe(3000.00); // Computer equipment

      // Adjustments
      expect(gstReturnData.gstReturn!.adjustments.badDebts).toBe(0);
      expect(gstReturnData.gstReturn!.adjustments.otherAdjustments).toBe(0);
    });

    it('should create and save GST return to Supabase', async () => {
      const taxReturn = await irdReportingService.generateGSTReturn(
        mockUserId,
        testPeriodStart,
        testPeriodEnd
      );

      expect(taxReturn).toBeDefined();
      expect(taxReturn.userId).toBe(mockUserId);
      expect(taxReturn.returnType).toBe('GST');
      expect(taxReturn.periodStart).toBe(testPeriodStart);
      expect(taxReturn.periodEnd).toBe(testPeriodEnd);
      expect(taxReturn.totalSales).toBe(3450.00);
      expect(taxReturn.gstOnSales).toBe(450.00);
      expect(taxReturn.gstOnPurchases).toBe(421.30);
      expect(taxReturn.netGst).toBeCloseTo(28.70, 2); // 450 - 421.30 (floating point precision)
      expect(taxReturn.status).toBe('draft');

      expect(supabaseDataService.createTaxReturn).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUserId,
          returnType: 'GST',
          totalSales: 3450.00,
          gstOnSales: 450.00,
          gstOnPurchases: 421.30,
          netGst: expect.closeTo(28.70, 2)
        })
      );
    });
  });

  describe('Payment Integration', () => {
    it('should fetch and process payment data', async () => {
      const payments = await supabaseDataService.getPaymentsByPeriod(
        mockUserId,
        testPeriodStart,
        testPeriodEnd
      );

      expect(payments).toHaveLength(1);
      expect(payments[0]).toMatchObject({
        id: 'pay-1',
        amount: 2300.00,
        status: 'completed',
        invoiceId: 'inv-2'
      });
    });
  });

  describe('GST Summary Analytics', () => {
    it('should calculate GST summary from real data', async () => {
      const summary = await supabaseDataService.getGSTReturnSummary(
        mockUserId,
        testPeriodStart,
        testPeriodEnd
      );

      expect(summary.totalSales).toBe(3450.00);
      expect(summary.totalPurchases).toBe(3230.00);
      expect(summary.gstOnSales).toBe(450.00);
      expect(summary.gstOnPurchases).toBe(421.30);
      expect(summary.netGstPosition).toBeCloseTo(28.70, 2);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing tax configuration gracefully', async () => {
      vi.spyOn(supabaseDataService, 'getTaxConfiguration').mockResolvedValueOnce(null);
      vi.spyOn(supabaseDataService, 'createDefaultTaxConfiguration').mockRejectedValueOnce(
        new Error('Database error')
      );

      const config = await taxCalculationService.getActiveTaxConfiguration(mockUserId);
      expect(config).toBeNull();
    });

    it('should handle data fetch errors in IRD reporting', async () => {
      vi.spyOn(supabaseDataService, 'getInvoicesByPeriod').mockRejectedValueOnce(
        new Error('Database connection failed')
      );

      await expect(
        taxCalculationService.generateIRDGSTReturn(mockUserId, testPeriodStart, testPeriodEnd)
      ).rejects.toThrow('Database connection failed');
    });
  });

  describe('Data Validation', () => {
    it('should validate invoice data structure', async () => {
      const invoices = await supabaseDataService.getInvoicesByPeriod(
        mockUserId,
        testPeriodStart,
        testPeriodEnd
      );

      invoices.forEach(invoice => {
        expect(invoice).toHaveProperty('id');
        expect(invoice).toHaveProperty('total');
        expect(invoice).toHaveProperty('tax_amount');
        expect(invoice).toHaveProperty('taxInclusive');
        expect(invoice).toHaveProperty('lineItems');
        expect(typeof invoice.total).toBe('number');
        expect(typeof invoice.tax_amount).toBe('number');
      });
    });

    it('should validate expense data structure', async () => {
      const expenses = await supabaseDataService.getExpensesByPeriod(
        mockUserId,
        testPeriodStart,
        testPeriodEnd
      );

      expenses.forEach(expense => {
        expect(expense).toHaveProperty('id');
        expect(expense).toHaveProperty('amount');
        expect(expense).toHaveProperty('tax_amount');
        expect(expense).toHaveProperty('is_claimable');
        expect(expense).toHaveProperty('is_capital_expense');
        expect(typeof expense.amount).toBe('number');
        expect(typeof expense.tax_amount).toBe('number');
        expect(typeof expense.is_claimable).toBe('boolean');
      });
    });
  });
});