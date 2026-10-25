import { onlineManager, type QueryClient } from '@tanstack/react-query';
import { AuthApiError } from '@/features/auth/api/http';
import { paymentService } from '@/services/paymentService';
import type { CreatePaymentRequest } from '@/types/payment';

export const invoiceDetailQueryKey = (invoiceId: string) => ['invoices', 'detail', invoiceId] as const;
export const invoicePaymentsQueryKey = (invoiceId: string) => ['payments', 'invoice', invoiceId] as const;
export const dashboardQueryKey = ['dashboard'] as const;

export async function invalidateAfterInvoicePayment(queryClient: QueryClient, invoiceId: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: invoiceDetailQueryKey(invoiceId) }),
    queryClient.invalidateQueries({ queryKey: invoicePaymentsQueryKey(invoiceId) }),
    queryClient.invalidateQueries({ queryKey: dashboardQueryKey }),
  ]);
}

export async function recordInvoicePayment(
  queryClient: QueryClient,
  input: CreatePaymentRequest,
  idempotencyKey: string,
) {
  if (!onlineManager.isOnline()) {
    throw new AuthApiError(
      'You are offline. This payment was not recorded and will not be sent later.',
      0,
      'OFFLINE',
    );
  }
  try {
    const payment = await paymentService.createPayment(input, idempotencyKey);
    await invalidateAfterInvoicePayment(queryClient, input.invoiceId);
    return payment;
  } catch (error) {
    if (error instanceof AuthApiError && error.code === 'PAYMENT_EXCEEDS_BALANCE') {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: invoiceDetailQueryKey(input.invoiceId) }),
        queryClient.invalidateQueries({ queryKey: invoicePaymentsQueryKey(input.invoiceId) }),
      ]);
    }
    throw error;
  }
}
