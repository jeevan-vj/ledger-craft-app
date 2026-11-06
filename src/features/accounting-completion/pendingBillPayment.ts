import { recordBillPaymentRequestSchema, type RecordBillPaymentRequest } from '@ledgercraft/contracts';

export interface PendingBillPayment { key: string; input: RecordBillPaymentRequest }
const storageKey = (companyId: string, billId: string, actorId: string) => `ledgercraft:pending-bill-payment:${companyId}:${actorId}:${billId}`;
export function hasPendingBillPayment(companyId: string, billId: string, actorId: string) {
  try { return localStorage.getItem(storageKey(companyId, billId, actorId)) !== null; } catch { return false; }
}
export function readPendingBillPayment(companyId: string, billId: string, actorId: string): PendingBillPayment | undefined {
  const companyPrefix = `ledgercraft:pending-bill-payment:${companyId}:`;
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    if (key?.startsWith(companyPrefix) && key.endsWith(`:${billId}`) && key !== storageKey(companyId, billId, actorId)) throw new Error('Another user has an unresolved payment request for this bill. Resolve it from that user session before recording another payment.');
  }
  const stored = localStorage.getItem(storageKey(companyId, billId, actorId));
  if (!stored) return undefined;
  const parsed: unknown = JSON.parse(stored);
  if (!parsed || typeof parsed !== 'object' || !('key' in parsed) || typeof parsed.key !== 'string' || !('input' in parsed)) throw new Error('Saved payment recovery data is invalid. Check the bill and bank history before clearing it.');
  return { key: parsed.key, input: recordBillPaymentRequestSchema.parse(parsed.input) };
}
export function savePendingBillPayment(companyId: string, billId: string, input: RecordBillPaymentRequest, actorId: string): PendingBillPayment {
  const pending = { key: crypto.randomUUID(), input: recordBillPaymentRequestSchema.parse(input) };
  localStorage.setItem(storageKey(companyId, billId, actorId), JSON.stringify(pending));
  return pending;
}
export function clearPendingBillPayment(companyId: string, billId: string, actorId: string) { localStorage.removeItem(storageKey(companyId, billId, actorId)); }
