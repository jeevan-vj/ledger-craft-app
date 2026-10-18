import { describe, it, expect, vi, beforeEach } from 'vitest';
import { paymentService } from '../paymentService';
import type { CreatePaymentRequest } from '@/types/payment';
import type { MemorySupabase } from '@/test/memorySupabase';

vi.mock('@/integrations/supabase/client', async () => {
  const { createMemorySupabase } = await import('@/test/memorySupabase');
  const memory = createMemorySupabase('user-123');
  (globalThis as typeof globalThis & { __lcPaymentServiceMemory?: MemorySupabase }).__lcPaymentServiceMemory = memory;
  return { supabase: memory.supabase };
});

function memory() {
  return (globalThis as typeof globalThis & { __lcPaymentServiceMemory: MemorySupabase }).__lcPaymentServiceMemory;
}

const paymentRequest = (overrides: Partial<CreatePaymentRequest> = {}): CreatePaymentRequest => ({
  invoiceId: 'inv-123',
  paymentMethod: 'bank_transfer',
  amount: 1000,
  paymentDate: '2024-01-15',
  referenceNumber: 'REF-001',
  generateReceipt: true,
  ...overrides,
});

describe('PaymentService', () => {
  beforeEach(() => {
    memory().reset();
    memory().tables.invoices = [{
      id: 'inv-123',
      user_id: 'user-123',
      customer_id: 'customer-1',
      invoice_number: 'INV-1',
      total: 1000,
      total_paid: 0,
      payment_status: 'unpaid',
      status: 'sent',
    }];
    memory().tables.customers = [{ id: 'customer-1', name: 'Ada', email: 'ada@example.com' }];
  });

  it('rejects a non-positive amount before writing a payment', async () => {
    await expect(paymentService.createPayment(paymentRequest({ amount: 0 }))).rejects.toThrow(
      'Payment amount must be greater than zero',
    );
    await expect(paymentService.createPayment(paymentRequest({ amount: -100 }))).rejects.toThrow(
      'Payment amount must be greater than zero',
    );
    expect(memory().tables.payments ?? []).toHaveLength(0);
  });

  it('creates a completed payment against the invoice', async () => {
    const payment = await paymentService.createPayment(paymentRequest());

    expect(payment.amount).toBe(1000);
    expect(payment.invoiceId).toBe('inv-123');
    expect(payment.status).toBe('completed');
    expect(payment.paymentMethod).toBe('bank_transfer');
    expect(payment.userId).toBe('user-123');

    const invoice = memory().tables.invoices[0];
    expect(invoice.payment_status).toBe('paid');
    expect(invoice.total_paid).toBe(1000);
    expect(invoice.status).toBe('paid');
  });

  it('rejects a payment for an invoice that does not exist', async () => {
    await expect(
      paymentService.createPayment(paymentRequest({ invoiceId: 'missing-invoice' })),
    ).rejects.toThrow();
  });
});
