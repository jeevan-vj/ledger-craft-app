import { customsGstEntrySchema, customsGstListSchema, type CreateCustomsGstRequest, type CustomsGstEntry, type PayCustomsGstRequest, type VoidCustomsGstRequest } from '@ledgercraft/contracts';
import type { Database } from '../../db/client';
import { apiError } from '../../http-error';
import { assertAccountingDateOpen } from '../accounting/period-lock';
import { postBalancedEntry, reversePosting, systemAccount } from '../accounting/posting';
import { withOrganisationTx } from '../auth/bind-organisation';
import { assertReplayMatches, getIdempotencyRecord, insertIdempotencyRecord, type IdempotencyScope } from '../invoices/idempotency';
import { roundMoney } from '../invoices/money';
import { assertGstSourceOpen, type GstLockCheck } from './gst-period-lock';
import { gstSettingsInTx } from './gst-settings';
import { customsClaimDate } from './gst-return-boxes';
import * as repo from './customs-gst.repository';

type Context = { organisationId: string; userId: string };
type Basis = 'invoice' | 'payments' | 'hybrid';

function lockChecks(invoiceDate: string, paymentDate: string | null, extra: string[] = []): GstLockCheck[] {
  const purchaseDates = [invoiceDate, ...extra];
  if (paymentDate && paymentDate < invoiceDate) purchaseDates.push(paymentDate);
  const checks: GstLockCheck[] = [{ kind: 'purchase_document', dates: purchaseDates }, { kind: 'input_gst_journal', dates: [customsClaimDate('invoice', invoiceDate, paymentDate), ...extra].filter((date): date is string => Boolean(date)) }];
  if (paymentDate || extra.length) checks.push({ kind: 'supplier_settlement', dates: [paymentDate, ...extra].filter((date): date is string => Boolean(date)) });
  return checks;
}

async function registeredBasis(tx: Database, organisationId: string): Promise<Basis> {
  const settings = await gstSettingsInTx(tx, organisationId);
  if (settings.gstRegistrationStatus !== 'registered' || !settings.gstAccountingBasis) {
    throw apiError(422, 'GST_NOT_REGISTERED', 'This business is not GST registered. Review registration before recording Customs GST.');
  }
  return settings.gstAccountingBasis;
}

function toEntry(row: repo.CustomsGstRow, basis: Basis): CustomsGstEntry {
  return customsGstEntrySchema.parse({
    id: row.id, invoiceDate: row.invoiceDate, paymentDate: row.paymentDate, amount: roundMoney(row.amount),
    reference: row.reference, description: row.description, status: row.status,
    claimDate: row.status === 'void' ? null : customsClaimDate(basis, row.invoiceDate, row.paymentDate),
  });
}

async function postCustomsJournals(tx: Database, ctx: Context, entry: CustomsGstEntry, basis: Basis) {
  const claim = customsClaimDate(basis, entry.invoiceDate, entry.paymentDate);
  const gst = await systemAccount(tx, ctx, '2150');
  const payable = await systemAccount(tx, ctx, '2100');
  const bank = await systemAccount(tx, ctx, '1110');
  if (claim) {
    await assertAccountingDateOpen(tx, ctx.organisationId, claim);
    await postBalancedEntry(tx, ctx, {
      date: claim, description: `Customs GST ${entry.reference}`, referenceType: 'customs_gst', referenceId: entry.id,
      lines: [
        { accountId: gst, description: `Customs GST ${entry.reference}`, debit: entry.amount, credit: '0.00' },
        { accountId: payable, description: `Customs GST ${entry.reference}`, debit: '0.00', credit: entry.amount },
      ],
    });
  }
  if (entry.paymentDate) {
    await assertAccountingDateOpen(tx, ctx.organisationId, entry.paymentDate);
    await postBalancedEntry(tx, ctx, {
      date: entry.paymentDate, description: `Pay Customs GST ${entry.reference}`, referenceType: 'customs_gst_payment', referenceId: entry.id,
      lines: [
        { accountId: payable, description: `Pay Customs GST ${entry.reference}`, debit: entry.amount, credit: '0.00' },
        { accountId: bank, description: `Pay Customs GST ${entry.reference}`, debit: '0.00', credit: entry.amount },
      ],
    });
  }
}

export async function createCustomsGstForUser(db: Database, userId: string, input: CreateCustomsGstRequest, idempotency?: IdempotencyScope): Promise<CustomsGstEntry> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    if (idempotency) {
      const existing = await getIdempotencyRecord(tx, ctx, idempotency);
      if (existing) { assertReplayMatches(existing.requestHash, idempotency.requestHash); return customsGstEntrySchema.parse(existing.responseBody); }
    }
    const basis = await registeredBasis(tx, ctx.organisationId);
    const paymentDate = input.paymentDate ?? null;
    await assertGstSourceOpen(tx, ctx.organisationId, lockChecks(input.invoiceDate, paymentDate));
    const row = await repo.insertCustomsGst(tx, ctx, { ...input, paymentDate, amount: roundMoney(input.amount) });
    const entry = toEntry(row, basis);
    await postCustomsJournals(tx, ctx, entry, basis);
    if (idempotency) await insertIdempotencyRecord(tx, ctx, idempotency, { status: 201, body: entry });
    return entry;
  });
}

export async function listCustomsGstForUser(db: Database, userId: string) {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const basis = await registeredBasis(tx, ctx.organisationId);
    return customsGstListSchema.parse({ entries: (await repo.listCustomsGst(tx, ctx.organisationId)).map((row) => toEntry(row, basis)) });
  });
}

export async function payCustomsGstForUser(db: Database, userId: string, id: string, input: PayCustomsGstRequest, idempotency?: IdempotencyScope): Promise<CustomsGstEntry> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    if (idempotency) {
      const existing = await getIdempotencyRecord(tx, ctx, idempotency);
      if (existing) { assertReplayMatches(existing.requestHash, idempotency.requestHash); return customsGstEntrySchema.parse(existing.responseBody); }
    }
    const basis = await registeredBasis(tx, ctx.organisationId);
    const current = await repo.getCustomsGst(tx, ctx.organisationId, id);
    if (!current || current.status !== 'open') throw apiError(404, 'CUSTOMS_GST_NOT_FOUND', 'Customs GST entry not found.');
    if (current.paymentDate) throw apiError(409, 'CUSTOMS_GST_ALREADY_PAID', 'This Customs GST entry is already paid.');
    if (basis === 'invoice' && input.paymentDate < current.invoiceDate) {
      throw apiError(422, 'CUSTOMS_GST_CLAIM_DATE', 'A later payment cannot move an invoice-basis claim backwards. Void this entry and record it again with both dates.');
    }
    await assertGstSourceOpen(tx, ctx.organisationId, lockChecks(current.invoiceDate, input.paymentDate));
    const row = await repo.markCustomsGstPaid(tx, ctx.organisationId, id, input.paymentDate);
    if (!row) throw apiError(409, 'CUSTOMS_GST_ALREADY_PAID', 'This Customs GST entry is already paid.');
    const entry = toEntry(row, basis);
    await postCustomsJournals(tx, ctx, entry, basis);
    if (idempotency) await insertIdempotencyRecord(tx, ctx, idempotency, { status: 200, body: entry });
    return entry;
  });
}

export async function voidCustomsGstForUser(db: Database, userId: string, id: string, input: VoidCustomsGstRequest, idempotency?: IdempotencyScope): Promise<CustomsGstEntry> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    if (idempotency) {
      const existing = await getIdempotencyRecord(tx, ctx, idempotency);
      if (existing) { assertReplayMatches(existing.requestHash, idempotency.requestHash); return customsGstEntrySchema.parse(existing.responseBody); }
    }
    const basis = await registeredBasis(tx, ctx.organisationId);
    const current = await repo.getCustomsGst(tx, ctx.organisationId, id);
    if (!current || current.status !== 'open') throw apiError(404, 'CUSTOMS_GST_NOT_FOUND', 'Customs GST entry not found.');
    await assertAccountingDateOpen(tx, ctx.organisationId, current.invoiceDate, ...(current.paymentDate ? [current.paymentDate] : []));
    await assertGstSourceOpen(tx, ctx.organisationId, lockChecks(current.invoiceDate, current.paymentDate));
    const claim = customsClaimDate(basis, current.invoiceDate, current.paymentDate);
    if (claim) await reversePosting(tx, ctx, { referenceType: 'customs_gst', referenceId: id, reversalType: 'customs_gst_reversal', date: claim, description: `Reverse Customs GST ${current.reference}: ${input.reason}` });
    if (current.paymentDate) await reversePosting(tx, ctx, { referenceType: 'customs_gst_payment', referenceId: id, reversalType: 'customs_gst_payment_reversal', date: current.paymentDate, description: `Reverse Customs GST payment ${current.reference}: ${input.reason}` });
    const row = await repo.markCustomsGstVoid(tx, ctx.organisationId, id);
    if (!row) throw apiError(409, 'CUSTOMS_GST_NOT_FOUND', 'Customs GST entry not found.');
    const entry = toEntry(row, basis);
    if (idempotency) await insertIdempotencyRecord(tx, ctx, idempotency, { status: 200, body: entry });
    return entry;
  });
}
