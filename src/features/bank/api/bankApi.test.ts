import { afterEach, describe, expect, it, vi } from 'vitest';
import { bankApi } from './bankApi';

describe('bankApi banking writes', () => {
  afterEach(() => vi.restoreAllMocks());

  it('sends exact manual transaction decimals without conversion', async () => {
    const payload = { bankAccountId: crypto.randomUUID(), transactionDate: '2026-10-19', description: 'Capital', amount: '9007199254740993.01', type: 'credit' as const };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: crypto.randomUUID() }), { status: 201, headers: { 'Content-Type': 'application/json' } }));
    await bankApi.createTransaction(payload);
    expect(fetch).toHaveBeenCalledWith('/api/bank-transactions', expect.objectContaining({ method: 'POST', body: JSON.stringify(payload) }));
  });

  it('adds an idempotency key to transfers', async () => {
    const payload = { sourceAccountId: crypto.randomUUID(), destinationAccountId: crypto.randomUUID(), transactionDate: '2026-10-19', amount: '10.01' };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: crypto.randomUUID() }), { status: 201, headers: { 'Content-Type': 'application/json' } }));
    await bankApi.createTransfer(payload, 'transfer-test-1');
    expect(fetch).toHaveBeenCalledWith('/api/bank-transfers', expect.objectContaining({ headers: expect.objectContaining({ 'Idempotency-Key': 'transfer-test-1' }), body: JSON.stringify(payload) }));
  });
});
