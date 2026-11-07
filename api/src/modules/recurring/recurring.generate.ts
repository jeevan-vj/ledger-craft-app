import { invoiceSchema, type RecurringKind, type RecurringPayload, type RecurringRunDto, type RecurringSchedule, type RecurringTemplateDto } from '@ledgercraft/contracts';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client';
import type { OrganisationContext } from '../auth/bind-organisation';
import { hasPermission } from '../auth/permissions';
import { createInvoiceInTx, updateInvoiceInTx, prepareInvoiceDeliveryInTx, completeInvoiceDeliveryInTx } from '../invoices/invoices.service';
import { createInvoiceShareInTx } from '../invoices/share';
import { createBillInTx } from '../purchases/purchases.service';
import { createExpenseInTx } from '../expenses/expenses.service';
import { createBankTransactionInTx } from '../bank/bank.service';
import { assertReplayMatches, getIdempotencyRecord, hashIdempotencyPayload, insertIdempotencyRecord } from '../invoices/idempotency';
import type { InvoiceMailer } from '../invoices/mailer';
import { occurrenceKey } from './schedule';
import { executionMembership } from './recurring.repository';

export type ScheduledTemplate = RecurringTemplateDto & { userId: string; organisationId: string };
/** Cloud alarm uses the authoritative Identity DO; local API verifies current SQLite membership. */
export type RecurringExecutionAuthorizer = (organisationId: string, userId: string, kind: RecurringKind) => Promise<boolean>;
export class ScheduledActorUnavailable extends Error { generatedId?: string; constructor() { super('The schedule creator no longer has permission in this company. An administrator must review and resume the schedule.'); } }
export class DeliveryFailure extends Error { constructor(readonly generatedId: string, message: string) { super(message); } }
const dateOnly = (date: Date, timeZone: string) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
const plusDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0,10);
function occurrencePayload(payload: RecurringPayload, schedule: RecurringSchedule, when: Date): RecurringPayload {
  const date = dateOnly(when, schedule.timezone);
  if (payload.kind === 'invoice') return { ...payload, input: { ...payload.input, date, dueDate: plusDays(date, Math.round((Date.parse(`${payload.input.dueDate}T00:00:00Z`) - Date.parse(`${payload.input.date}T00:00:00Z`)) / 86_400_000)) } };
  if (payload.kind === 'bill') return { ...payload, input: { ...payload.input, issueDate: date, dueDate: plusDays(date, Math.round((Date.parse(`${payload.input.dueDate}T00:00:00Z`) - Date.parse(`${payload.input.issueDate}T00:00:00Z`)) / 86_400_000)) } };
  return payload.kind === 'expense' ? { ...payload, input: { ...payload.input, expenseDate: date } } : { ...payload, input: { ...payload.input, transactionDate: date } };
}
export async function isRecurringActorAuthorised(db: Database, organisationId: string, userId: string, kind: RecurringKind): Promise<boolean> {
  if (!['invoice', 'bill', 'expense', 'income'].includes(kind)) return false;
  const membership = await executionMembership(db, organisationId, userId);
  const permission = kind === 'invoice' ? 'invoices.write' : kind === 'income' ? 'banking.write' : 'bills.write';
  return !!membership && hasPermission(membership.role, 'settings.write') && hasPermission(membership.role, permission);
}
export async function generateOccurrence(db: Database, template: ScheduledTemplate, when: Date, mailer?: InvoiceMailer, authorizer?: RecurringExecutionAuthorizer): Promise<{ document: { id: string }; delivery: RecurringRunDto['deliveryStatus']; deliveryMessage: string | null }> {
  const inTemplate = async <T>(run: (tx: Database, ctx: OrganisationContext) => Promise<T>): Promise<T> => {
    // Provider/RPC work remains outside the Ledger transaction.
    if (authorizer && !await authorizer(template.organisationId, template.userId, template.kind)) throw new ScheduledActorUnavailable();
    return db.transaction(async tx => {
      const membership = await executionMembership(tx, template.organisationId, template.userId);
      const permission = template.kind === 'invoice' ? 'invoices.write' : template.kind === 'income' ? 'banking.write' : 'bills.write';
      if (!membership || !hasPermission(membership.role, 'settings.write') || !hasPermission(membership.role, permission)) throw new ScheduledActorUnavailable();
      return run(tx, { organisationId: template.organisationId, userId: template.userId, role: membership.role });
    });
  };
  const payload = occurrencePayload(template.payload, template.schedule, when);
  const key = occurrenceKey(template.id, when);
  const document = await inTemplate(async (tx, ctx) => {
    const scope = { key, method: 'POST', path: payload.kind === 'invoice' ? '/api/invoices' : payload.kind === 'bill' ? '/api/bills' : payload.kind === 'expense' ? '/api/expenses' : '/api/bank-transactions', requestHash: hashIdempotencyPayload(payload.input) };
    const prior = await getIdempotencyRecord(tx, ctx, scope);
    if (prior) { assertReplayMatches(prior.requestHash, scope.requestHash); return prior.responseBody as { id: string }; }
    const result = payload.kind === 'invoice' ? await createInvoiceInTx(tx, ctx, { ...payload.input, status: 'draft' })
      : payload.kind === 'bill' ? await createBillInTx(tx, ctx, payload.input)
      : payload.kind === 'expense' ? await createExpenseInTx(tx, ctx, payload.input)
      : await createBankTransactionInTx(tx, ctx, payload.input);
    await insertIdempotencyRecord(tx, ctx, scope, { status: 201, body: result });
    return result;
  });
  if (payload.kind !== 'invoice' || !(payload.send?.mode === 'auto' || (!payload.send && payload.input.status === 'sent'))) return { document, delivery: 'not_requested', deliveryMessage: null };
  if (!mailer || mailer.availability === 'unavailable') {
    if (payload.send?.whenEmailUnavailable === 'mark_sent') await inTemplate((tx, ctx) => updateInvoiceInTx(tx, ctx, document.id, { status: 'sent' }));
    return { document, delivery: 'email_not_configured', deliveryMessage: 'Not emailed: email not configured' };
  }
  try {
    const prepared = await inTemplate(async (tx, ctx) => {
      const delivery = await prepareInvoiceDeliveryInTx(tx, ctx, document.id, {});
      const shared = await createInvoiceShareInTx(tx, ctx, document.id, { templateName: 'classic' });
      return { ...delivery, shared };
    });
    try { await mailer.sendInvoice({ invoiceId: document.id, invoiceNumber: prepared.invoice.invoiceNumber, to: prepared.recipients, amountDue: prepared.invoice.balanceDue, currency: prepared.invoice.currency, dueDate: prepared.invoice.dueDate, businessName: prepared.businessName, publicUrl: `https://easybiz.iamjeevan.com/shared/invoice/${encodeURIComponent(prepared.shared.share.shareToken)}`, deliveryKey: `recurring-${key}` }); } catch (error) { if (error instanceof HTTPException && error.status === 503) throw error; throw new DeliveryFailure(document.id, 'Failed to send invoice email'); }
    const sent = await inTemplate((tx, ctx) => completeInvoiceDeliveryInTx(tx, ctx, invoiceSchema.parse(prepared.invoice)));
    return { document: sent, delivery: 'sent', deliveryMessage: null };
  } catch (error) {
    if (error instanceof ScheduledActorUnavailable) { error.generatedId = document.id; throw error; }
    throw new DeliveryFailure(document.id, error instanceof Error ? error.message : 'Failed to send invoice email');
  }
}
