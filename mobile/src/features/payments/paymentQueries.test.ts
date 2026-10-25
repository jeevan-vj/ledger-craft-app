import { onlineManager, QueryClient } from '@tanstack/react-query';
import { AuthApiError } from '@/features/auth/api/http';
import { paymentService } from '@/services/paymentService';
import { invoiceService } from '@/services/invoiceService';
import {
  dashboardQueryKey,
  invoiceDetailQueryKey,
  invoicePaymentsQueryKey,
  recordInvoicePayment,
  submitInvoicePayment,
} from './paymentQueries';

jest.mock('@/services/paymentService', () => ({
  paymentService: { createPayment: jest.fn() },
}));

jest.mock('@/services/invoiceService', () => ({
  invoiceService: { fetchInvoiceById: jest.fn() },
}));

const input = {
  invoiceId: '22222222-2222-4222-8222-222222222222',
  paymentMethod: 'cash' as const,
  amount: '10.00',
  paymentDate: '2026-10-25',
  referenceNumber: null,
  notes: null,
};

function clientWithSettlement() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(invoiceDetailQueryKey(input.invoiceId), { id: input.invoiceId, balanceDueText: '10.00' });
  client.setQueryData(invoicePaymentsQueryKey(input.invoiceId), []);
  client.setQueryData([...dashboardQueryKey, null], { invoices: [] });
  return client;
}

describe('recordInvoicePayment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    onlineManager.setOnline(true);
  });

  it('invalidates the invoice, its payments, and the dashboard after a recorded payment', async () => {
    jest.mocked(paymentService.createPayment).mockResolvedValue({ id: 'payment-1' } as never);
    const client = clientWithSettlement();

    await recordInvoicePayment(client, input, 'attempt-1');

    expect(paymentService.createPayment).toHaveBeenCalledWith(input, 'attempt-1');
    expect(client.getQueryState(invoiceDetailQueryKey(input.invoiceId))?.isInvalidated).toBe(true);
    expect(client.getQueryState(invoicePaymentsQueryKey(input.invoiceId))?.isInvalidated).toBe(true);
    expect(client.getQueryState([...dashboardQueryKey, null])?.isInvalidated).toBe(true);
  });

  it('refetches the invoice when the payment exceeds the balance', async () => {
    jest.mocked(paymentService.createPayment).mockRejectedValue(
      new AuthApiError('Payment exceeds invoice balance', 400, 'PAYMENT_EXCEEDS_BALANCE'),
    );
    jest.mocked(invoiceService.fetchInvoiceById).mockResolvedValue({
      id: input.invoiceId,
      balanceDueText: '8.00',
    } as never);
    const client = clientWithSettlement();

    await expect(recordInvoicePayment(client, input, 'attempt-1')).rejects.toMatchObject({
      code: 'PAYMENT_EXCEEDS_BALANCE',
      invoice: { balanceDueText: '8.00' },
    });
    expect(client.getQueryData(invoiceDetailQueryKey(input.invoiceId))).toMatchObject({ balanceDueText: '8.00' });
    expect(client.getQueryState(invoicePaymentsQueryKey(input.invoiceId))?.isInvalidated).toBe(true);
  });

  it('awaits the refetched invoice and applies it before the exceeds error is shown', async () => {
    jest.mocked(paymentService.createPayment).mockRejectedValue(
      new AuthApiError('Payment exceeds invoice balance', 400, 'PAYMENT_EXCEEDS_BALANCE'),
    );
    jest.mocked(invoiceService.fetchInvoiceById).mockImplementation(async () => {
      await Promise.resolve();
      return { id: input.invoiceId, balanceDueText: '4.00' } as never;
    });
    const client = clientWithSettlement();
    const applied: string[] = [];

    const pending = submitInvoicePayment(client, input, 'attempt-1', (invoice) => {
      applied.push(invoice.balanceDueText ?? '');
    });

    await expect(pending).rejects.toMatchObject({
      code: 'PAYMENT_EXCEEDS_BALANCE',
      invoice: { balanceDueText: '4.00' },
    });
    expect(invoiceService.fetchInvoiceById).toHaveBeenCalledWith(input.invoiceId);
    expect(applied).toEqual(['4.00']);
    expect(client.getQueryData(invoiceDetailQueryKey(input.invoiceId))).toMatchObject({ balanceDueText: '4.00' });
  });

  it('does not call the API or store the payment while offline', async () => {
    onlineManager.setOnline(false);
    const client = clientWithSettlement();

    await expect(recordInvoicePayment(client, input, 'attempt-1')).rejects.toMatchObject({ status: 0 });
    expect(paymentService.createPayment).not.toHaveBeenCalled();
    expect(client.getQueryState(invoiceDetailQueryKey(input.invoiceId))?.isInvalidated).toBe(false);
  });
});
