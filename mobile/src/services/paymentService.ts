import { onlineManager } from '@tanstack/react-query';
import { AuthApiError } from '@/features/auth/api/http';
import { paymentsApi } from '@/features/payments/api/paymentsApi';
import type { CreatePaymentRequest, Payment } from '@/types/payment';

export class PaymentService {
  async createPayment(paymentData: CreatePaymentRequest, idempotencyKey: string): Promise<Payment> {
    if (!onlineManager.isOnline()) {
      throw new AuthApiError(
        'You are offline. This payment was not recorded and will not be sent later.',
        0,
        'OFFLINE',
      );
    }
    return paymentsApi.create({
      invoiceId: paymentData.invoiceId,
      paymentMethod: paymentData.paymentMethod,
      amount: paymentData.amount,
      paymentDate: paymentData.paymentDate,
      referenceNumber: paymentData.referenceNumber ?? null,
      notes: paymentData.notes ?? null,
    }, idempotencyKey);
  }

  async getPayments(): Promise<Payment[]> {
    return paymentsApi.list();
  }

  async getPaymentsByInvoice(invoiceId: string): Promise<Payment[]> {
    return paymentsApi.list(invoiceId);
  }

  async getPayment(paymentId: string): Promise<Payment | null> {
    try {
      return await paymentsApi.get(paymentId);
    } catch (error) {
      if (error instanceof AuthApiError && error.status === 404) return null;
      throw error;
    }
  }
}

export const paymentService = new PaymentService();
