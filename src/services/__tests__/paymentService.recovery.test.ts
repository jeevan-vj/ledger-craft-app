import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreatePaymentRequest as ApiInput, MeResponse } from '@ledgercraft/contracts';
import type { CreatePaymentRequest, Payment, Receipt } from '@/types/payment';
import { PaymentService } from '../paymentService';

const mocks = vi.hoisted(() => ({
  create: vi.fn<(input: ApiInput, key?: string) => Promise<Payment>>(),
  receipt: vi.fn<(input: { paymentId: string }) => Promise<Receipt>>(),
  me: vi.fn<() => Promise<MeResponse | null>>(),
}));
vi.mock('@/features/payments/api/paymentsApi', async importOriginal => {
  const actual = await importOriginal<typeof import('@/features/payments/api/paymentsApi')>();
  return { ...actual, paymentsApiEnabled: () => true, paymentsApi: { ...actual.paymentsApi, create: mocks.create } };
});
vi.mock('@/features/receipts/api/receiptsApi', async importOriginal => {
  const actual = await importOriginal<typeof import('@/features/receipts/api/receiptsApi')>();
  return { ...actual, receiptsApiEnabled: () => true, receiptsApi: { ...actual.receiptsApi, create: mocks.receipt } };
});
vi.mock('@/features/auth/api/authApi', async importOriginal => ({ ...(await importOriginal<typeof import('@/features/auth/api/authApi')>()), getMe: mocks.me }));

const companyId = '11111111-1111-4111-8111-111111111111';
const input: CreatePaymentRequest = { invoiceId: '22222222-2222-4222-8222-222222222222', amount: 50, paymentMethod: 'bank_transfer', paymentDate: '2026-11-06', referenceNumber: 'BANK-50', generateReceipt: true };
const actor = (userId = 'owner', organisationId = companyId): MeResponse => ({ user: { id: userId, email: `${userId}@example.test`, name: userId }, organisation: { id: organisationId, name: 'Reference company' }, membership: { role: 'owner' }, permissions: ['invoices.write'] });
function payment(body: ApiInput): Payment { return { id: crypto.randomUUID(), invoiceId: body.invoiceId, amount: Number(body.amount), paymentMethod: body.paymentMethod, paymentDate: body.paymentDate, referenceNumber: body.referenceNumber ?? undefined, notes: body.notes ?? undefined, userId: 'owner', status: 'completed', createdAt: '2026-11-06T00:00:00Z', updatedAt: '2026-11-06T00:00:00Z' }; }

beforeEach(() => {
  vi.restoreAllMocks(); mocks.create.mockReset(); mocks.receipt.mockReset(); mocks.me.mockReset(); localStorage.clear();
  mocks.me.mockResolvedValue(actor());
  mocks.receipt.mockImplementation(async ({ paymentId }) => ({ id: crypto.randomUUID(), paymentId, receiptNumber: 'REC-1', userId: 'owner', generatedAt: '2026-11-06T00:00:00Z', isEmailed: false, createdAt: '2026-11-06T00:00:00Z' }));
});

describe('PaymentService durable invoice payment recovery', () => {
  it('replays the same stored body/key after the server accepted cash but its response was lost', async () => {
    const posted = new Map<string, Payment>(); let lostResponse = true;
    mocks.create.mockImplementation(async (body, key) => {
      const serverKey = key ?? crypto.randomUUID(); let accepted = posted.get(serverKey);
      if (!accepted) { accepted = payment(body); posted.set(serverKey, accepted); }
      if (lostResponse) { lostResponse = false; throw new TypeError('Connection lost after server commit'); }
      return accepted;
    });
    await expect(new PaymentService().createPayment(input)).rejects.toThrow('Connection lost');
    const { PaymentService: RemountedService } = await import('../paymentService');
    const result = await new RemountedService().createPayment(input);
    expect(posted.size).toBe(1); expect(result.amount).toBe(50);
    expect(mocks.create.mock.calls[0]?.[1]).toBeTruthy();
    expect(mocks.create.mock.calls[1]).toEqual(mocks.create.mock.calls[0]);
  });
  it('retains an acknowledged payment across receipt failure and never records another cash receipt', async () => {
    let posted = 0; mocks.create.mockImplementation(async body => { posted++; return payment(body); });
    mocks.receipt.mockRejectedValueOnce(new Error('Receipt response unavailable'));
    await expect(new PaymentService().createPayment(input)).rejects.toThrow('Receipt response');
    await expect(new PaymentService().createPayment(input)).resolves.toMatchObject({ amount: 50 });
    expect(posted).toBe(1); expect(mocks.receipt).toHaveBeenCalledTimes(2);
  });
  it('fails closed before sending money when durable storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage unavailable'); });
    mocks.create.mockImplementation(async body => payment(body));
    await expect(new PaymentService().createPayment(input)).rejects.toThrow(/storage|save|persist/i);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
