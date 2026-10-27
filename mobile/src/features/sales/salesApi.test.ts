import * as SecureStore from 'expo-secure-store';
import { onlineManager } from '@tanstack/react-query';
import { OFFLINE_SALE_MESSAGE } from './saleAttempt';
import { createSale } from './salesApi';

const response = (body: unknown, status = 201) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: jest.fn(() => null) },
  json: jest.fn().mockResolvedValue(body),
}) as unknown as Response;

const sale = {
  invoice: {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    invoiceNumber: 'INV-2041',
    total: '13.50',
    status: 'paid',
  },
  payment: {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    amount: '13.50',
    paymentMethod: 'cash',
    status: 'completed',
  },
  receipt: { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' },
};

const body = {
  lines: [{ itemId: '11111111-1111-4111-8111-111111111111', quantity: '3.00', price: '4.50' }],
  paymentMethod: 'cash' as const,
};

describe('createSale', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    onlineManager.setOnline(true);
    process.env.EXPO_PUBLIC_API_URL = 'https://api.example.test';
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('session-token=test');
    global.fetch = jest.fn().mockResolvedValue(response(sale));
  });

  it('posts the exact body with one Idempotency-Key and leaves money as strings', async () => {
    const result = await createSale(body, 'attempt-1');
    expect(result.invoice.invoiceNumber).toBe('INV-2041');
    expect(result.invoice.total).toBe('13.50');
    expect(typeof result.invoice.total).toBe('string');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.test/api/sales',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Idempotency-Key': 'attempt-1' }),
        body: JSON.stringify(body),
      }),
    );
  });

  it('does not send a sale while offline', async () => {
    onlineManager.setOnline(false);
    await expect(createSale(body, 'attempt-1')).rejects.toMatchObject({
      message: OFFLINE_SALE_MESSAGE,
      code: 'OFFLINE',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
