import { createCreditNoteRequestSchema, refundCreditNoteRequestSchema, type CreateCreditNoteRequest, type RefundCreditNoteRequest } from '@ledgercraft/contracts';
export interface PendingCreditIssue { key: string; input: CreateCreditNoteRequest }
export interface PendingCreditRefund { key: string; input: RefundCreditNoteRequest }
const prefix = (company: string, actor: string, invoice: string) => `ledgercraft:pending-credit:${company}:${actor}:${invoice}:`;
function read<T>(key: string, parse: (input: unknown) => T): { key: string; input: T } | undefined {
  const raw = localStorage.getItem(key); if (!raw) return undefined;
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || !('key' in value) || typeof value.key !== 'string' || !('input' in value)) throw new Error('Saved credit recovery data could not be verified. Review the invoice, credit notes and bank history.');
  return { key: value.key, input: parse(value.input) };
}
export function readPendingCredits(company: string, actor: string, invoice: string) {
  const namespace = prefix(company, actor, invoice);
  const companyPrefix = `ledgercraft:pending-credit:${company}:`;
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    if (key?.startsWith(companyPrefix) && key.includes(`:${invoice}:`) && !key.startsWith(namespace)) throw new Error('Another user has an unresolved credit request for this invoice. Resolve that request from the original user session before creating another.');
  }
  const issue = read(`${namespace}issue`, (input) => createCreditNoteRequestSchema.parse(input));
  if (issue && issue.input.invoiceId !== invoice) throw new Error('The saved credit belongs to a different invoice.');
  const refunds: Record<string, PendingCreditRefund> = {};
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    if (key?.startsWith(`${namespace}refund:`)) {
      const pending = read(key, (input) => refundCreditNoteRequestSchema.parse(input));
      if (pending) refunds[key.slice(`${namespace}refund:`.length)] = pending;
    }
  }
  return { issue, refunds };
}
export function savePendingCreditIssue(company: string, actor: string, invoice: string, input: CreateCreditNoteRequest) {
  const pending = { key: crypto.randomUUID(), input: createCreditNoteRequestSchema.parse(input) };
  localStorage.setItem(`${prefix(company, actor, invoice)}issue`, JSON.stringify(pending)); return pending;
}
export function savePendingCreditRefund(company: string, actor: string, invoice: string, note: string, input: RefundCreditNoteRequest) {
  const pending = { key: crypto.randomUUID(), input: refundCreditNoteRequestSchema.parse(input) };
  localStorage.setItem(`${prefix(company, actor, invoice)}refund:${note}`, JSON.stringify(pending)); return pending;
}
export function clearPendingCredit(company: string, actor: string, invoice: string, operation: 'issue' | `refund:${string}`) { localStorage.removeItem(`${prefix(company, actor, invoice)}${operation}`); }
