import * as SecureStore from 'expo-secure-store';
import { purchasesApi } from './purchasesApi';

const response = (body: unknown, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: jest.fn(() => null) },
    json: jest.fn().mockResolvedValue(body),
  }) as unknown as Response;

describe('purchasesApi', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    process.env.EXPO_PUBLIC_API_URL = 'https://api.example.test';
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('session-token=test');
    global.fetch = jest.fn();
  });

  it('lists bills through the authenticated mobile API client', async () => {
    const bill = { id: 'bill-1', billNumber: 'BILL-0001' };
    (global.fetch as jest.Mock).mockResolvedValue(response({ bills: [bill] }));

    await expect(purchasesApi.listBills()).resolves.toEqual([bill]);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.test/api/bills',
      expect.objectContaining({
        method: 'GET',
        credentials: 'omit',
        headers: expect.objectContaining({ Cookie: 'session-token=test' }),
      }),
    );
  });

  it('records a bill payment without converting exact decimal strings', async () => {
    const payment = { id: 'payment-1', amount: '123.45' };
    (global.fetch as jest.Mock).mockResolvedValue(response(payment));

    await expect(
      purchasesApi.recordPayment('bill-1', {
        bankAccountId: 'bank-1',
        amount: '123.45',
        paymentDate: '2026-10-03',
        referenceNumber: null,
      }),
    ).resolves.toEqual(payment);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.test/api/bills/bill-1/payments',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          bankAccountId: 'bank-1',
          amount: '123.45',
          paymentDate: '2026-10-03',
          referenceNumber: null,
        }),
      }),
    );
  });

  it('surfaces the server error message when a payment is rejected', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      response({ error: { message: 'Payment exceeds the remaining balance' } }, 409),
    );

    await expect(
      purchasesApi.recordPayment('bill-1', {
        bankAccountId: 'bank-1',
        amount: '999.00',
        paymentDate: '2026-10-03',
      }),
    ).rejects.toThrow('Payment exceeds the remaining balance');
  });
});
