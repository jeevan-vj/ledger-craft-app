import * as SecureStore from 'expo-secure-store';
import { paymentsApi } from './paymentsApi';

const response = (body: unknown, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: jest.fn(() => null) },
    json: jest.fn().mockResolvedValue(body),
  }) as unknown as Response;

const paymentDto = {
  id: '11111111-1111-4111-8111-111111111111',
  invoiceId: '22222222-2222-4222-8222-222222222222',
  invoiceNumber: 'INV-1',
  paymentMethod: 'bank_transfer',
  amount: '9007199254740993.25',
  paymentDate: '2026-10-25',
  referenceNumber: 'REF-9',
  notes: null,
  status: 'completed',
  createdAt: '2026-10-25T00:00:00.000Z',
  updatedAt: '2026-10-25T00:00:00.000Z',
};

describe('paymentsApi', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    process.env.EXPO_PUBLIC_API_URL = 'https://api.example.test';
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('session-token=test');
    global.fetch = jest.fn();
  });

  it('keeps payment amounts as exact decimal strings', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(response({ payments: [paymentDto] }));

    const payments = await paymentsApi.list(paymentDto.invoiceId);

    expect(payments[0]?.amount).toBe('9007199254740993.25');
    expect(typeof payments[0]?.amount).toBe('string');
    expect(global.fetch).toHaveBeenCalledWith(
      `https://api.example.test/api/payments?invoiceId=${encodeURIComponent(paymentDto.invoiceId)}`,
      expect.objectContaining({
        credentials: 'omit',
        headers: expect.objectContaining({ Cookie: 'session-token=test' }),
      }),
    );
  });

  it('sends one Idempotency-Key with the exact amount on create', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(response(paymentDto, 201));

    await paymentsApi.create({
      invoiceId: paymentDto.invoiceId,
      paymentMethod: 'cash',
      amount: '9007199254740993.25',
      paymentDate: '2026-10-25',
      referenceNumber: null,
      notes: null,
    }, 'attempt-1');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.test/api/payments',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Idempotency-Key': 'attempt-1' }),
        body: JSON.stringify({
          invoiceId: paymentDto.invoiceId,
          paymentMethod: 'cash',
          amount: '9007199254740993.25',
          paymentDate: '2026-10-25',
          referenceNumber: null,
          notes: null,
        }),
      }),
    );
  });
});
