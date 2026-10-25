import { readFileSync } from 'node:fs';
import path from 'node:path';
import { onlineManager } from '@tanstack/react-query';
import { paymentsApi } from '@/features/payments/api/paymentsApi';
import { paymentService } from '@/services/paymentService';

jest.mock('@/features/payments/api/paymentsApi', () => ({
  paymentsApi: {
    create: jest.fn(),
    list: jest.fn(),
    get: jest.fn(),
  },
}));

const source = readFileSync(path.join(__dirname, '../paymentService.ts'), 'utf8');

const request = {
  invoiceId: '22222222-2222-4222-8222-222222222222',
  paymentMethod: 'bank_transfer' as const,
  amount: '9007199254740993.25',
  paymentDate: '2026-10-25',
  referenceNumber: 'REF-9',
  notes: null,
};

describe('paymentService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    onlineManager.setOnline(true);
  });

  it('has no Supabase fallback and does not queue or create receipts', () => {
    expect(source).not.toMatch(/supabase/i);
    expect(source).not.toMatch(/\.from\(/);
    expect(source).not.toMatch(/receiptsApi/);
    expect(source).not.toMatch(/parseFloat|Number\(/);
    expect(source).not.toMatch(/AsyncStorage|offlineQueue|queuePayment/i);
  });

  it('sends the exact amount and the caller idempotency key to the API', async () => {
    jest.mocked(paymentsApi.create).mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      ...request,
      userId: '',
      status: 'completed',
      createdAt: '2026-10-25T00:00:00.000Z',
      updatedAt: '2026-10-25T00:00:00.000Z',
    });

    await paymentService.createPayment(request, 'attempt-1');

    expect(paymentsApi.create).toHaveBeenCalledWith({
      invoiceId: request.invoiceId,
      paymentMethod: 'bank_transfer',
      amount: '9007199254740993.25',
      paymentDate: '2026-10-25',
      referenceNumber: 'REF-9',
      notes: null,
    }, 'attempt-1');
  });

  it('does not call the API when the device is offline', async () => {
    onlineManager.setOnline(false);
    await expect(paymentService.createPayment(request, 'attempt-1')).rejects.toMatchObject({ status: 0 });
    expect(paymentsApi.create).not.toHaveBeenCalled();
  });
});
