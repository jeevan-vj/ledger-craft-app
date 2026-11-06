import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreatePaymentRequest as ApiInput, MeResponse } from '@ledgercraft/contracts';
import type { CreatePaymentRequest, Payment, Receipt } from '@/types/payment';
import { PaymentsApiError } from '@/features/payments/api/paymentsApi';
import { createRecoverableInvoicePayment, readPendingInvoicePayment, resumePendingInvoicePayment, discardPendingInvoicePayment } from './invoicePaymentRecovery';

const mocks = vi.hoisted(() => ({
  create: vi.fn<(input: ApiInput, key?: string) => Promise<Payment>>(),
  receipt: vi.fn<(input: { paymentId: string }) => Promise<Receipt>>(),
  me: vi.fn<() => Promise<MeResponse | null>>(),
}));
vi.mock('@/features/payments/api/paymentsApi', async importOriginal => ({ ...(await importOriginal<typeof import('@/features/payments/api/paymentsApi')>()), paymentsApi: { create: mocks.create } }));
vi.mock('@/features/receipts/api/receiptsApi', async importOriginal => ({ ...(await importOriginal<typeof import('@/features/receipts/api/receiptsApi')>()), receiptsApiEnabled: () => true, receiptsApi: { create: mocks.receipt } }));
vi.mock('@/features/auth/api/authApi', async importOriginal => ({ ...(await importOriginal<typeof import('@/features/auth/api/authApi')>()), getMe: mocks.me }));

const companyId = '11111111-1111-4111-8111-111111111111';
const invoiceId = '22222222-2222-4222-8222-222222222222';
const input: CreatePaymentRequest = { invoiceId, amount: 50, paymentMethod: 'bank_transfer', paymentDate: '2026-11-06', referenceNumber: 'BANK-50', notes: 'First instalment', generateReceipt: true };
const actor = (userId = 'owner', organisationId = companyId): MeResponse => ({ user: { id: userId, email: `${userId}@example.test`, name: userId }, organisation: { id: organisationId, name: 'Reference company' }, membership: { role: 'owner' }, permissions: ['invoices.write'] });
function payment(body: ApiInput): Payment { return { id: crypto.randomUUID(), invoiceId: body.invoiceId, amount: Number(body.amount), paymentMethod: body.paymentMethod, paymentDate: body.paymentDate, referenceNumber: body.referenceNumber ?? undefined, notes: body.notes ?? undefined, userId: 'owner', status: 'completed', createdAt: '2026-11-06T00:00:00Z', updatedAt: '2026-11-06T00:00:00Z' }; }

beforeEach(() => {
  vi.restoreAllMocks(); mocks.create.mockReset(); mocks.receipt.mockReset(); mocks.me.mockReset(); localStorage.clear();
  mocks.me.mockResolvedValue(actor()); mocks.create.mockImplementation(async body => payment(body));
  mocks.receipt.mockImplementation(async ({ paymentId }) => ({ id: crypto.randomUUID(), paymentId, receiptNumber: 'REC-1', userId: 'owner', generatedAt: '2026-11-06T00:00:00Z', isEmailed: false, createdAt: '2026-11-06T00:00:00Z' }));
});
afterEach(() => { vi.restoreAllMocks(); });

async function uncertainPayment() {
  mocks.create.mockRejectedValueOnce(new TypeError('Network response lost'));
  await expect(createRecoverableInvoicePayment(input)).rejects.toThrow('Network response');
  const pending = await readPendingInvoicePayment(invoiceId); expect(pending).toBeDefined(); return pending!;
}

describe('durable actor-bound invoice payment recovery', () => {
  it('retains the canonical request and key across module remount, then resumes one accepted payment', async () => {
    const posted = new Map<string, Payment>(); let lose = true;
    mocks.create.mockImplementation(async (body, key) => { const actualKey = key ?? crypto.randomUUID(); const accepted = posted.get(actualKey) ?? payment(body); posted.set(actualKey, accepted); if (lose) { lose = false; throw new TypeError('Response lost after acceptance'); } return accepted; });
    await expect(createRecoverableInvoicePayment(input)).rejects.toThrow('Response lost');
    const before = await readPendingInvoicePayment(invoiceId);
    expect(before).toMatchObject({ companyId, userId: 'owner', input, body: { invoiceId, amount: '50', referenceNumber: 'BANK-50', notes: 'First instalment' }, uncertain: true });
    vi.resetModules(); const remounted = await import('./invoicePaymentRecovery');
    await expect(remounted.resumePendingInvoicePayment(invoiceId)).resolves.toMatchObject({ amount: 50 });
    expect(posted.size).toBe(1); expect(mocks.create.mock.calls[1]).toEqual(mocks.create.mock.calls[0]);
    expect(await remounted.readPendingInvoicePayment(invoiceId)).toBeUndefined();
  });
  it('never replaces an uncertain intent with edited amount, date, method, rate or receipt preference', async () => {
    const saved = await uncertainPayment();
    for (const changed of [{ amount: 25 }, { paymentDate: '2026-11-07' }, { paymentMethod: 'cash' as const }, { exchangeRateId: crypto.randomUUID() }, { generateReceipt: false }]) await expect(createRecoverableInvoicePayment({ ...input, ...changed })).rejects.toThrow(/saved|pending|original/i);
    expect(mocks.create).toHaveBeenCalledTimes(1); expect((await readPendingInvoicePayment(invoiceId))?.key).toBe(saved.key);
  });
  it('keeps a previously uncertain body/key after a later definite 401 or 422', async () => {
    const saved = await uncertainPayment();
    for (const status of [401, 422]) { mocks.create.mockRejectedValueOnce(new PaymentsApiError('Retry rejected', status)); await expect(resumePendingInvoicePayment(invoiceId)).rejects.toThrow('Retry rejected'); expect((await readPendingInvoicePayment(invoiceId))?.key).toBe(saved.key); }
    expect(mocks.create.mock.calls.map(call => call[1])).toEqual([saved.key, saved.key, saved.key]);
  });
  it('may clear a first definite validation failure, but does not clear an idempotency conflict', async () => {
    mocks.create.mockRejectedValueOnce(new PaymentsApiError('Invalid payment', 400)); await expect(createRecoverableInvoicePayment(input)).rejects.toThrow('Invalid payment'); expect(await readPendingInvoicePayment(invoiceId)).toBeUndefined();
    mocks.create.mockRejectedValueOnce(new PaymentsApiError('Existing idempotency conflict', 409)); await expect(createRecoverableInvoicePayment(input)).rejects.toThrow('conflict'); expect(await readPendingInvoicePayment(invoiceId)).toMatchObject({ uncertain: true });
  });
  it('isolates companies and blocks another actor in the same company from replaying or discarding', async () => {
    const saved = await uncertainPayment(); mocks.me.mockResolvedValue(actor('other-user'));
    await expect(readPendingInvoicePayment(invoiceId)).rejects.toThrow(/another user|different user|original user/i);
    await expect(createRecoverableInvoicePayment(input)).rejects.toThrow(/user/i);
    await expect(discardPendingInvoicePayment(invoiceId, { reviewed: true })).rejects.toThrow(/user/i);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    mocks.me.mockResolvedValue(actor('owner', '33333333-3333-4333-8333-333333333333')); expect(await readPendingInvoicePayment(invoiceId)).toBeUndefined();
    mocks.me.mockResolvedValue(actor()); expect((await readPendingInvoicePayment(invoiceId))?.key).toBe(saved.key);
  });
  it('does not clear a saved payment on authentication or storage-read failure', async () => {
    const saved = await uncertainPayment(); const snapshot = localStorage.getItem(localStorage.key(0)!);
    mocks.me.mockResolvedValue(null); await expect(readPendingInvoicePayment(invoiceId)).rejects.toThrow(/sign in|authenticated/i);
    expect(localStorage.getItem(localStorage.key(0)!)).toBe(snapshot);
    mocks.me.mockResolvedValue(actor()); const getter = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Storage blocked'); });
    await expect(resumePendingInvoicePayment(invoiceId)).rejects.toThrow(/storage|read/i); expect(mocks.create).toHaveBeenCalledTimes(1); getter.mockRestore(); expect((await readPendingInvoicePayment(invoiceId))?.key).toBe(saved.key);
  });
  it('keeps the accepted payment when receipt creation fails and resumes without a second cash POST', async () => {
    mocks.receipt.mockRejectedValueOnce(new Error('Receipt unavailable')); await expect(createRecoverableInvoicePayment(input)).rejects.toThrow('Receipt unavailable');
    expect(await readPendingInvoicePayment(invoiceId)).toMatchObject({ acceptedPayment: { invoiceId, amount: 50 }, generateReceipt: true });
    mocks.create.mockRejectedValue(new PaymentsApiError('Invoice now fully paid', 400));
    await expect(resumePendingInvoicePayment(invoiceId)).resolves.toMatchObject({ amount: 50 });
    expect(mocks.create).toHaveBeenCalledTimes(1); expect(mocks.receipt).toHaveBeenCalledTimes(2); expect(await readPendingInvoicePayment(invoiceId)).toBeUndefined();
  });
  it('retains recovery when an acknowledgement belongs to another invoice or receipt payment', async () => {
    mocks.create.mockImplementationOnce(async body => ({ ...payment(body), invoiceId: '44444444-4444-4444-8444-444444444444' }));
    await expect(createRecoverableInvoicePayment(input)).rejects.toThrow(/match|invoice/i);
    expect(mocks.receipt).not.toHaveBeenCalled(); expect(await readPendingInvoicePayment(invoiceId)).toMatchObject({ uncertain: true });
    mocks.receipt.mockResolvedValueOnce({ id: crypto.randomUUID(), paymentId: crypto.randomUUID(), receiptNumber: 'OTHER', userId: 'owner', generatedAt: '2026-11-06T00:00:00Z', isEmailed: false, createdAt: '2026-11-06T00:00:00Z' });
    await expect(resumePendingInvoicePayment(invoiceId)).rejects.toThrow(/receipt|match/i);
    expect(await readPendingInvoicePayment(invoiceId)).toMatchObject({ acceptedPayment: { invoiceId } });
    const calls = mocks.create.mock.calls.length; await resumePendingInvoicePayment(invoiceId); expect(mocks.create).toHaveBeenCalledTimes(calls);
  });
  it('persists before sending and can recover when storing the accepted response fails', async () => {
    const nativeSet = Storage.prototype.setItem; let writes = 0; const posted = new Map<string, Payment>();
    const setter = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function(this: Storage, key, value) { writes++; if (writes === 3) throw new Error('Storage full after acceptance'); nativeSet.call(this, key, value); });
    mocks.create.mockImplementation(async (body, key) => { expect(await readPendingInvoicePayment(invoiceId)).toMatchObject({ key, uncertain: true }); const saved = posted.get(key!) ?? payment(body); posted.set(key!, saved); return saved; });
    await expect(createRecoverableInvoicePayment(input)).rejects.toThrow(/storage|save|persist/i); setter.mockRestore();
    await expect(resumePendingInvoicePayment(invoiceId)).resolves.toMatchObject({ amount: 50 }); expect(posted.size).toBe(1);
  });
  it('requires explicit reviewed discard and freezes the stored no-receipt preference', async () => {
    const noReceipt = { ...input, generateReceipt: false }; mocks.create.mockRejectedValueOnce(new Error('Lost response'));
    await expect(createRecoverableInvoicePayment(noReceipt)).rejects.toThrow('Lost response');
    await expect(discardPendingInvoicePayment(invoiceId, { reviewed: false })).rejects.toThrow(/review/i);
    await expect(resumePendingInvoicePayment(invoiceId)).resolves.toMatchObject({ amount: 50 }); expect(mocks.receipt).not.toHaveBeenCalled();
    await uncertainPayment(); await discardPendingInvoicePayment(invoiceId, { reviewed: true }); expect(await readPendingInvoicePayment(invoiceId)).toBeUndefined();
  });
});
