import { z } from 'zod';
import { createPaymentRequestSchema, paymentSchema, type CreatePaymentRequest as ApiCreatePaymentRequest } from '@ledgercraft/contracts';
import { getMe } from '@/features/auth/api/authApi';
import { paymentsApi, PaymentsApiError, toCreatePaymentRequest } from '@/features/payments/api/paymentsApi';
import { receiptsApi, receiptsApiEnabled } from '@/features/receipts/api/receiptsApi';
import type { CreatePaymentRequest as ClientCreatePaymentRequest, Payment } from '@/types/payment';

const clientInputSchema = z.object({
  invoiceId: createPaymentRequestSchema.shape.invoiceId,
  paymentMethod: createPaymentRequestSchema.shape.paymentMethod,
  amount: z.number().finite().positive(), paymentDate: z.string().min(1),
  referenceNumber: z.string().optional(), notes: z.string().optional(),
  exchangeRateId: z.string().uuid().nullable().optional(), generateReceipt: z.boolean().optional(),
}).strict();
const acceptedPaymentSchema = z.object({
  id: paymentSchema.shape.id, invoiceId: paymentSchema.shape.invoiceId,
  invoiceNumber: z.string().optional(), userId: z.string(),
  paymentMethod: paymentSchema.shape.paymentMethod, amount: z.number().finite().positive(),
  paymentDate: z.string(), referenceNumber: z.string().optional(), notes: z.string().optional(),
  status: paymentSchema.shape.status,
  reversalReason: z.string().nullable().optional(), reversalDate: z.string().nullable().optional(), reversedAt: z.string().nullable().optional(),
  createdAt: z.string(), updatedAt: z.string(),
}).strict();
const pendingSchema = z.object({
  version: z.literal(1), companyId: z.string().min(1), userId: z.string().min(1), invoiceId: z.string().uuid(),
  key: z.string().uuid(), input: clientInputSchema, body: createPaymentRequestSchema,
  generateReceipt: z.boolean(), uncertain: z.boolean(), acceptedPayment: acceptedPaymentSchema.optional(), createdAt: z.string().datetime(),
}).strict();
export interface PendingInvoicePayment {
  version: 1; companyId: string; userId: string; invoiceId: string; key: string;
  input: ClientCreatePaymentRequest; body: ApiCreatePaymentRequest;
  generateReceipt: boolean; uncertain: boolean; acceptedPayment?: Payment; createdAt: string;
}
// The web project has strictNullChecks disabled, so Zod object inference makes
// required properties optional. Construct the validated client interfaces
// explicitly rather than weakening those interfaces or casting unknown data.
function parseClientInput(value: unknown): ClientCreatePaymentRequest {
  const parsed = clientInputSchema.parse(value);
  return { ...parsed, invoiceId: parsed.invoiceId, paymentMethod: parsed.paymentMethod, amount: parsed.amount, paymentDate: parsed.paymentDate };
}
function parseAcceptedPayment(value: unknown): Payment {
  const parsed = acceptedPaymentSchema.parse(value);
  return { ...parsed, id: parsed.id, invoiceId: parsed.invoiceId, paymentMethod: parsed.paymentMethod, amount: parsed.amount, paymentDate: parsed.paymentDate, userId: parsed.userId, status: parsed.status, createdAt: parsed.createdAt, updatedAt: parsed.updatedAt };
}
function parsePending(value: unknown): PendingInvoicePayment {
  const parsed = pendingSchema.parse(value);
  return { version: 1, companyId: parsed.companyId, userId: parsed.userId, invoiceId: parsed.invoiceId, key: parsed.key,
    input: parseClientInput(parsed.input), body: createPaymentRequestSchema.parse(parsed.body), generateReceipt: parsed.generateReceipt, uncertain: parsed.uncertain,
    ...(parsed.acceptedPayment ? { acceptedPayment: parseAcceptedPayment(parsed.acceptedPayment) } : {}), createdAt: parsed.createdAt };
}
type Actor = { companyId: string; userId: string };
const storageKey = (actor: Actor, invoiceId: string) => `ledgercraft:pending-invoice-payment:v1:${actor.companyId}:${invoiceId}`;
const inFlight = new Map<string, Promise<Payment>>();

async function currentActor(): Promise<Actor> {
  const me = await getMe();
  if (!me) throw new Error('Sign in as the original user to recover the saved invoice payment.');
  return { companyId: me.organisation.id, userId: me.user.id };
}
function read(actor: Actor, invoiceId: string): PendingInvoicePayment | undefined {
  let raw: string | null;
  try { raw = localStorage.getItem(storageKey(actor, invoiceId)); }
  catch { throw new Error('Payment recovery storage could not be read. No new payment was sent.'); }
  if (raw === null) return undefined;
  let pending: PendingInvoicePayment;
  try { pending = parsePending(JSON.parse(raw)); }
  catch { throw new Error('Saved payment recovery data is invalid. Review the invoice, bank and receipt history before clearing browser data.'); }
  if (pending.companyId !== actor.companyId || pending.invoiceId !== invoiceId || pending.body.invoiceId !== invoiceId || pending.input.invoiceId !== invoiceId) throw new Error('Saved payment recovery data belongs to a different invoice or company.');
  if (pending.userId !== actor.userId) throw new Error('A saved invoice payment belongs to another user. Sign in as the original user; do not record it again.');
  const canonical = createPaymentRequestSchema.parse(toCreatePaymentRequest(pending.input));
  if (JSON.stringify(canonical) !== JSON.stringify(pending.body) || (pending.acceptedPayment && pending.acceptedPayment.invoiceId !== invoiceId)) throw new Error('The saved payment body does not match its original input. Review the invoice and bank history before continuing.');
  return pending;
}
function persist(pending: PendingInvoicePayment): void {
  const key = storageKey(pending, pending.invoiceId);
  try {
    const text = JSON.stringify(pendingSchema.parse(pending));
    localStorage.setItem(key, text);
    if (localStorage.getItem(key) !== text) throw new Error('Storage did not retain payment');
  } catch { throw new Error('Could not persist invoice payment recovery data. No new request will be sent until storage works; keep the original payment for recovery.'); }
}
function clear(pending: PendingInvoicePayment): void {
  const latest = read(pending, pending.invoiceId);
  if (latest && latest.key !== pending.key) throw new Error('Another saved payment replaced this recovery record. Review it before continuing.');
  try { localStorage.removeItem(storageKey(pending, pending.invoiceId)); }
  catch { throw new Error('Payment was acknowledged but recovery storage could not be cleared. Resume the saved operation; do not record another payment.'); }
}
export async function readPendingInvoicePayment(invoiceId: string): Promise<PendingInvoicePayment | undefined> {
  return read(await currentActor(), invoiceId);
}
function sameIntent(pending: PendingInvoicePayment, input: ClientCreatePaymentRequest): boolean {
  return JSON.stringify(pending.body) === JSON.stringify(createPaymentRequestSchema.parse(toCreatePaymentRequest(input)))
    && (pending.input.generateReceipt !== false) === (input.generateReceipt !== false);
}
function definiteFirstRejection(error: unknown): boolean {
  return error instanceof PaymentsApiError && error.status >= 400 && error.status < 500 && ![408, 409, 425, 429].includes(error.status);
}
async function complete(pending: PendingInvoicePayment): Promise<Payment> {
  let saved = pending;
  if (!saved.acceptedPayment) {
    const wasUncertain = saved.uncertain;
    // Persist exposure before POST, so a crash during the request preserves the
    // original body/key even when its server acknowledgement never arrives.
    saved = { ...saved, uncertain: true }; persist(saved);
    let accepted: Payment;
    try {
      accepted = await paymentsApi.create(saved.body, saved.key);
      if (accepted.invoiceId !== saved.invoiceId) throw new Error('Payment acknowledgement did not match the saved invoice. Keep the saved request and review the payment history.');
    }
    catch (error) {
      if (!wasUncertain && definiteFirstRejection(error)) clear(saved);
      throw error;
    }
    saved = { ...saved, acceptedPayment: parseAcceptedPayment(accepted) }; persist(saved);
  }
  const payment = saved.acceptedPayment;
  if (!payment) throw new Error('Saved payment acknowledgement is missing.');
  // Receipt failure must retain the accepted payment. Retrying this branch
  // cannot POST new cash; the receipt endpoint is unique per payment.
  if (saved.generateReceipt) {
    const receipt = await receiptsApi.create({ paymentId: payment.id });
    if (receipt.paymentId !== payment.id) throw new Error('Receipt acknowledgement did not match the saved payment. Resume the saved operation after reviewing receipt history.');
  }
  clear(saved); return payment;
}
function run(pending: PendingInvoicePayment): Promise<Payment> {
  const key = storageKey(pending, pending.invoiceId);
  const existing = inFlight.get(key); if (existing) return existing;
  const operation = complete(pending);
  inFlight.set(key, operation);
  void operation.finally(() => { if (inFlight.get(key) === operation) inFlight.delete(key); }).catch(() => undefined);
  return operation;
}
export async function createRecoverableInvoicePayment(raw: ClientCreatePaymentRequest): Promise<Payment> {
  const input = parseClientInput(raw);
  const body = createPaymentRequestSchema.parse(toCreatePaymentRequest(input));
  const actor = await currentActor(); const previous = read(actor, input.invoiceId);
  if (previous) {
    if (!sameIntent(previous, input)) throw new Error('A saved invoice payment is still pending. Resume its original amount, date, method and receipt preference before recording a different payment.');
    return run(previous);
  }
  const pending: PendingInvoicePayment = { version: 1, ...actor, invoiceId: input.invoiceId, key: crypto.randomUUID(), input, body, generateReceipt: receiptsApiEnabled() && input.generateReceipt !== false, uncertain: false, createdAt: new Date().toISOString() };
  persist(pending); return run(pending);
}
export async function resumePendingInvoicePayment(invoiceId: string): Promise<Payment> {
  const actor = await currentActor(); const pending = read(actor, invoiceId);
  if (!pending) throw new Error('No saved invoice payment is available to resume.');
  return run(pending);
}
export async function discardPendingInvoicePayment(invoiceId: string, confirmation: { reviewed: boolean }): Promise<void> {
  if (confirmation.reviewed !== true) throw new Error('Review the invoice, bank and receipt history before discarding a saved payment.');
  const actor = await currentActor(); const pending = read(actor, invoiceId);
  if (!pending) return;
  if (inFlight.has(storageKey(actor, invoiceId))) throw new Error('Wait for the saved payment request to finish before discarding it.');
  clear(pending);
}
