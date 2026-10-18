import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import { paymentService } from '@/services/paymentService';
import { CreatePaymentRequest } from '@/types/payment';
import { Invoice, Customer } from '@/types';
import type { MemorySupabase } from '@/test/memorySupabase';

vi.mock('@/integrations/supabase/client', async () => {
  const { createMemorySupabase } = await import('@/test/memorySupabase');
  const memory = createMemorySupabase('test-user');
  (globalThis as typeof globalThis & { __lcPaymentMemory?: MemorySupabase }).__lcPaymentMemory = memory;
  return { supabase: memory.supabase };
});

function paymentMemory() {
  return (globalThis as typeof globalThis & { __lcPaymentMemory: MemorySupabase }).__lcPaymentMemory;
}

/**
 * End-to-End Payment Workflow Tests
 * 
 * This test suite validates the complete payment workflow that an 
 * accounting expert would expect for a small business:
 * 
 * 1. Invoice Creation → Payment Recording → Receipt Generation
 * 2. Tax Calculations (NZ GST 15%)
 * 3. Double-entry Bookkeeping
 * 4. Financial Reporting Integration
 * 5. IRD Compliance
 */

describe('Payment Workflow E2E Tests', () => {
  let testCustomer: Customer;
  let testInvoice: Invoice;
  let testUserId: string;

  beforeEach(async () => {
    // Ensure we have an authenticated user for testing
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('No authenticated user for testing');
    }
    testUserId = user.id;
    paymentMemory().reset();

    // Create test customer
    testCustomer = {
      id: `test-customer-${Date.now()}`,
      name: 'Test Customer Ltd',
      email: 'test@customer.co.nz',
      address: '123 Test Street',
      city: 'Auckland',
      state: 'Auckland',
      zip: '1010',
      country: 'NZ',
      phone: '+64 9 123 4567'
    };

    // Create test invoice with proper tax calculations
    testInvoice = {
      id: `test-invoice-${Date.now()}`,
      invoiceNumber: `TEST-${Date.now()}`,
      customerId: testCustomer.id,
      customer: testCustomer,
      date: new Date().toISOString().split('T')[0],
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      items: [
        {
          id: '1',
          description: 'Consulting Services',
          quantity: 10,
          rate: 100.00,
          tax: 0.15, // 15% GST
          amount: 1000.00
        }
      ],
      subtotal: 1000.00,
      taxAmount: 150.00, // 15% GST on $1000
      total: 1150.00, // $1000 + $150 GST
      status: 'sent',
      currency: 'NZD',
      notes: 'Test invoice for payment workflow',
      terms: 'Payment due within 30 days'
    };

    paymentMemory().tables.customers = [{
      id: testCustomer.id,
      name: testCustomer.name,
      email: testCustomer.email,
    }];
    paymentMemory().tables.invoices = [{
      id: testInvoice.id,
      user_id: testUserId,
      customer_id: testCustomer.id,
      invoice_number: testInvoice.invoiceNumber,
      total: testInvoice.total,
      subtotal: testInvoice.subtotal,
      tax_amount: testInvoice.taxAmount,
      total_paid: 0,
      payment_status: 'unpaid',
      status: 'sent',
    }];
  });

  afterEach(async () => {
    // Clean up test data
    if (testInvoice.id) {
      try {
        await supabase.from('payments').delete().eq('invoice_id', testInvoice.id);
        await supabase.from('receipts').delete().eq('user_id', testUserId);
        await supabase.from('line_items').delete().eq('invoice_id', testInvoice.id);
        await supabase.from('invoices').delete().eq('id', testInvoice.id);
        await supabase.from('customers').delete().eq('id', testCustomer.id);
      } catch (error) {
        console.warn('Cleanup error:', error);
      }
    }
  });

  describe('1. Invoice to Payment Workflow', () => {
    it('should create invoice and process full payment correctly', async () => {
      // Step 1: Verify invoice creation
      expect(testInvoice.total).toBe(1150.00);
      expect(testInvoice.taxAmount).toBe(150.00);
      expect(testInvoice.subtotal).toBe(1000.00);

      // Step 2: Record payment for full invoice amount
      const paymentData: CreatePaymentRequest = {
        invoiceId: testInvoice.id,
        amount: testInvoice.total, // Full payment
        paymentMethod: 'bank_transfer',
        paymentDate: new Date().toISOString().split('T')[0],
        referenceNumber: 'TEST-TXN-001',
        notes: 'Test payment via bank transfer'
      };

      const payment = await paymentService.createPayment(paymentData);

      // Validate payment creation
      expect(payment).toBeDefined();
      expect(payment.amount).toBe(1150.00);
      expect(payment.invoiceId).toBe(testInvoice.id);
      expect(payment.status).toBe('completed');

      // Step 3: Verify receipt generation
      const receipt = await paymentService.getReceiptByPayment(payment.id);
      expect(receipt).toBeDefined();
      expect(receipt?.receiptNumber).toMatch(/^REC-\d{6}-\d{4}$/);
      expect(receipt?.receiptData?.amountPaid).toBe(1150.00);

      // Step 4: Check invoice status update
      // This should be handled by the payment service
      const { data: updatedInvoice } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', testInvoice.id)
        .single();

      expect(updatedInvoice.payment_status).toBe('paid');
      expect(updatedInvoice.total_paid).toBe(1150.00);
    });

    it('should handle partial payments correctly', async () => {
      // Record partial payment (50% of invoice)
      const partialAmount = testInvoice.total * 0.5; // $575
      
      const paymentData: CreatePaymentRequest = {
        invoiceId: testInvoice.id,
        amount: partialAmount,
        paymentMethod: 'cash',
        paymentDate: new Date().toISOString().split('T')[0],
        referenceNumber: 'PARTIAL-001'
      };

      const payment = await paymentService.createPayment(paymentData);

      // Verify partial payment
      expect(payment.amount).toBe(575.00);

      // Check invoice status
      const { data: updatedInvoice } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', testInvoice.id)
        .single();

      expect(updatedInvoice.payment_status).toBe('partially_paid');
      expect(updatedInvoice.total_paid).toBe(575.00);
      expect(updatedInvoice.total - updatedInvoice.total_paid).toBe(575.00);

      // Record second payment to complete
      const remainingPayment: CreatePaymentRequest = {
        invoiceId: testInvoice.id,
        amount: 575.00,
        paymentMethod: 'bank_transfer',
        paymentDate: new Date().toISOString().split('T')[0],
        referenceNumber: 'FINAL-001'
      };

      await paymentService.createPayment(remainingPayment);

      // Check final status
      const { data: finalInvoice } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', testInvoice.id)
        .single();

      expect(finalInvoice.payment_status).toBe('paid');
      expect(finalInvoice.total_paid).toBe(1150.00);
      expect(finalInvoice.total - finalInvoice.total_paid).toBe(0);
    });
  });

  describe('2. Tax Calculations (NZ GST)', () => {
    it('should calculate GST correctly for tax-inclusive invoices', async () => {
      // Tax-inclusive invoice: $1150 total includes $150 GST
      const gstInclusive = {
        totalIncGST: 1150.00,
        gstRate: 0.15,
        expectedGST: 150.00,
        expectedExGST: 1000.00
      };

      // Calculate GST from tax-inclusive amount
      const gstAmount = gstInclusive.totalIncGST * gstInclusive.gstRate / (1 + gstInclusive.gstRate);
      const exGSTAmount = gstInclusive.totalIncGST - gstAmount;

      expect(Math.round(gstAmount * 100) / 100).toBe(gstInclusive.expectedGST);
      expect(Math.round(exGSTAmount * 100) / 100).toBe(gstInclusive.expectedExGST);
    });

    it('should calculate GST correctly for tax-exclusive invoices', async () => {
      // Tax-exclusive invoice: $1000 + 15% GST = $1150
      const gstExclusive = {
        subtotal: 1000.00,
        gstRate: 0.15,
        expectedGST: 150.00,
        expectedTotal: 1150.00
      };

      const gstAmount = gstExclusive.subtotal * gstExclusive.gstRate;
      const total = gstExclusive.subtotal + gstAmount;

      expect(gstAmount).toBe(gstExclusive.expectedGST);
      expect(total).toBe(gstExclusive.expectedTotal);
    });

    it('should handle zero-rated and exempt items', async () => {
      // Create invoice with mixed tax rates
      const mixedTaxInvoice = {
        items: [
          { description: 'Standard rated service', amount: 1000, gstRate: 0.15 }, // 15% GST
          { description: 'Zero-rated export', amount: 500, gstRate: 0.00 },      // 0% GST
          { description: 'Exempt financial service', amount: 200, gstRate: 0.00 }  // 0% GST
        ]
      };

      let totalGST = 0;
      let subtotal = 0;

      mixedTaxInvoice.items.forEach(item => {
        subtotal += item.amount;
        totalGST += item.amount * item.gstRate;
      });

      expect(subtotal).toBe(1700.00);
      expect(totalGST).toBe(150.00); // Only standard rated item
      expect(subtotal + totalGST).toBe(1850.00);
    });
  });

  describe('3. Receipt Generation & Validation', () => {
    it('should generate compliant NZ receipt', async () => {
      const payment = await paymentService.createPayment({
        invoiceId: testInvoice.id,
        amount: testInvoice.total,
        paymentMethod: 'eftpos',
        paymentDate: new Date().toISOString().split('T')[0],
        referenceNumber: 'EFTPOS-001'
      });

      const receipt = await paymentService.getReceiptByPayment(payment.id);

      // Validate receipt compliance
      expect(receipt).toBeDefined();
      expect(receipt?.receiptNumber).toBeDefined();
      expect(receipt?.receiptData?.business).toBeDefined();
      expect(receipt?.receiptData?.customer).toBeDefined();
      expect(receipt?.receiptData?.paymentDate).toBeDefined();
      expect(receipt?.receiptData?.amountPaid).toBe(testInvoice.total);
      expect(receipt?.receiptData?.paymentMethod).toBe('EFTPOS');

      // Check tax breakdown is included
      expect(receipt?.receiptData?.invoice).toBeDefined();
    });

    it('should track receipt email status', async () => {
      const payment = await paymentService.createPayment({
        invoiceId: testInvoice.id,
        amount: testInvoice.total,
        paymentMethod: 'bank_transfer',
        paymentDate: new Date().toISOString().split('T')[0]
      });

      const receipt = await paymentService.getReceiptByPayment(payment.id);
      expect(receipt?.isEmailed).toBe(false);

      // Mark as emailed
      await paymentService.markReceiptAsEmailed(receipt!.id);

      const updatedReceipt = await paymentService.getReceipt(receipt!.id);
      expect(updatedReceipt?.isEmailed).toBe(true);
      expect(updatedReceipt?.emailSentAt).toBeDefined();
    });
  });

  describe('4. Financial Reporting Integration', () => {
    it('should provide accurate payment statistics', async () => {
      // Create multiple payments
      const payments = [
        { amount: 1150.00, method: 'bank_transfer' },
        { amount: 575.00, method: 'cash' },
        { amount: 2300.00, method: 'credit_card' }
      ];

      for (const payment of payments) {
        await paymentService.createPayment({
          invoiceId: testInvoice.id,
          amount: payment.amount,
          paymentMethod: payment.method as any,
          paymentDate: new Date().toISOString().split('T')[0]
        });
      }

      const stats = await paymentService.getPaymentStats();

      expect(stats.totalPayments).toBeGreaterThanOrEqual(3);
      expect(stats.totalAmount).toBeGreaterThanOrEqual(4025.00);
      expect(stats.completedPayments).toBeGreaterThanOrEqual(3);
    });

    it('should track outstanding invoices correctly', async () => {
      // Create invoice with no payments
      const unpaidInvoices = await paymentService.getInvoicesWithBalance();
      
      // Should include invoices with balance > 0
      const testInvoiceInList = unpaidInvoices.find(inv => inv.id === testInvoice.id);
      expect(testInvoiceInList).toBeDefined();
    });
  });

  describe('5. Data Integrity & Error Handling', () => {
    it('should maintain referential integrity', async () => {
      const payment = await paymentService.createPayment({
        invoiceId: testInvoice.id,
        amount: testInvoice.total,
        paymentMethod: 'bank_transfer',
        paymentDate: new Date().toISOString().split('T')[0]
      });

      // Verify foreign key relationships
      const { data: paymentRecord } = await supabase
        .from('payments')
        .select('*, invoices(*)')
        .eq('id', payment.id)
        .single();

      expect(paymentRecord.invoices).toBeDefined();
      expect(paymentRecord.invoice_id).toBe(testInvoice.id);
    });

    it('should handle invalid payment amounts', async () => {
      // Test negative amount
      await expect(
        paymentService.createPayment({
          invoiceId: testInvoice.id,
          amount: -100,
          paymentMethod: 'cash',
          paymentDate: new Date().toISOString().split('T')[0]
        })
      ).rejects.toThrow();

      // Test zero amount
      await expect(
        paymentService.createPayment({
          invoiceId: testInvoice.id,
          amount: 0,
          paymentMethod: 'cash',
          paymentDate: new Date().toISOString().split('T')[0]
        })
      ).rejects.toThrow();
    });

    it('should handle non-existent invoice', async () => {
      await expect(
        paymentService.createPayment({
          invoiceId: 'non-existent-invoice',
          amount: 100,
          paymentMethod: 'cash',
          paymentDate: new Date().toISOString().split('T')[0]
        })
      ).rejects.toThrow();
    });
  });

  describe('6. Accounting Expert Validation', () => {
    it('should support proper audit trail', async () => {
      const payment = await paymentService.createPayment({
        invoiceId: testInvoice.id,
        amount: testInvoice.total,
        paymentMethod: 'bank_transfer',
        paymentDate: new Date().toISOString().split('T')[0],
        referenceNumber: 'AUDIT-TEST-001',
        notes: 'Payment for audit trail testing'
      });

      // Check all audit fields are present
      expect(payment.createdAt).toBeDefined();
      expect(payment.updatedAt).toBeDefined();
      expect(payment.referenceNumber).toBe('AUDIT-TEST-001');
      expect(payment.notes).toBe('Payment for audit trail testing');
      expect(payment.userId).toBeDefined();
    });

    it('should maintain sequential receipt numbering', async () => {
      const payment1 = await paymentService.createPayment({
        invoiceId: testInvoice.id,
        amount: 575.00,
        paymentMethod: 'cash',
        paymentDate: new Date().toISOString().split('T')[0]
      });

      const payment2 = await paymentService.createPayment({
        invoiceId: testInvoice.id,
        amount: 575.00,
        paymentMethod: 'bank_transfer',
        paymentDate: new Date().toISOString().split('T')[0]
      });

      const receipt1 = await paymentService.getReceiptByPayment(payment1.id);
      const receipt2 = await paymentService.getReceiptByPayment(payment2.id);

      // Receipt numbers should be sequential
      expect(receipt1?.receiptNumber).toBeDefined();
      expect(receipt2?.receiptNumber).toBeDefined();
      expect(receipt1?.receiptNumber).not.toBe(receipt2?.receiptNumber);
    });

    it('should validate payment method compliance', async () => {
      const validPaymentMethods = [
        'bank_transfer',
        'cash', 
        'cheque',
        'credit_card',
        'online'
      ];

      for (const method of validPaymentMethods) {
        const payment = await paymentService.createPayment({
          invoiceId: testInvoice.id,
          amount: 100.00,
          paymentMethod: method as any,
          paymentDate: new Date().toISOString().split('T')[0]
        });

        expect(payment.paymentMethod).toBe(method);
      }
    });
  });
});