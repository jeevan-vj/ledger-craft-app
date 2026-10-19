import * as SecureStore from 'expo-secure-store';
import { bankingApi } from './bankingApi';

const response = (body: unknown, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: jest.fn(() => null) },
    json: jest.fn().mockResolvedValue(body),
  }) as unknown as Response;

describe('bankingApi', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    process.env.EXPO_PUBLIC_API_URL = 'https://api.example.test';
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('session-token=test');
    global.fetch = jest.fn();
  });

  it('creates an account without converting exact decimal strings', async () => {
    const account = { id: 'bank-1', accountName: 'Operating', openingBalance: '1000.05' };
    (global.fetch as jest.Mock).mockResolvedValue(response(account, 201));

    await expect(bankingApi.createAccount({
      accountName: 'Operating', accountNumber: '12-3456-7890123-00', bankName: 'Example Bank',
      accountType: 'business', currency: 'NZD', openingBalance: '1000.05',
      currentBalance: '1000.05', isActive: true,
    })).resolves.toEqual(account);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.test/api/bank-accounts',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          accountName: 'Operating', accountNumber: '12-3456-7890123-00', bankName: 'Example Bank',
          accountType: 'business', currency: 'NZD', openingBalance: '1000.05',
          currentBalance: '1000.05', isActive: true,
        }),
      }),
    );
  });

  it('lists transactions for one account with an encoded query', async () => {
    const transaction = { id: 'tx-1', amount: '42.10' };
    (global.fetch as jest.Mock).mockResolvedValue(response({ transactions: [transaction] }));

    await expect(bankingApi.listTransactions('bank id')).resolves.toEqual([transaction]);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.test/api/bank-transactions?bankAccountId=bank%20id',
      expect.objectContaining({ credentials: 'omit' }),
    );
  });

  it('deletes an account through the authenticated API client', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(response(undefined, 204));
    await expect(bankingApi.removeAccount('bank-1')).resolves.toBeUndefined();
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.test/api/bank-accounts/bank-1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('posts exact transfers with an idempotency key', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(response({ id: 'transfer-1' }, 201));
    const payload = { sourceAccountId: 'bank-1', destinationAccountId: 'bank-2', transactionDate: '2026-10-19', amount: '9007199254740993.01' };
    await bankingApi.createTransfer(payload, 'mobile-transfer-1');
    expect(global.fetch).toHaveBeenCalledWith('https://api.example.test/api/bank-transfers', expect.objectContaining({
      method: 'POST', body: JSON.stringify(payload), headers: expect.objectContaining({ 'Idempotency-Key': 'mobile-transfer-1' }),
    }));
  });
});
