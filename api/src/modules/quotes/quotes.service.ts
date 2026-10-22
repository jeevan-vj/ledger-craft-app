import type {
  CreateQuoteRequest,
  QuoteCounts,
  QuoteDto,
  QuoteListQuery,
  QuoteListResponse,
  QuoteStatusChange,
  SendQuoteRequest,
  UpdateQuoteRequest,
} from '@ledgercraft/contracts';
import { quoteListResponseSchema, quoteSchema } from '@ledgercraft/contracts';
import { HTTPException } from 'hono/http-exception';
import { apiError } from '../../http-error';
import type { Database } from '../../db/client';
import { withOrganisationTx } from '../auth/bind-organisation';
import * as profileRepo from '../business-profile/business-profile.repository';
import * as customersRepo from '../customers/customers.repository';
import {
  assertReplayMatches,
  getIdempotencyRecord,
  insertIdempotencyRecord,
  type IdempotencyScope,
} from '../invoices/idempotency';
import type { InvoiceMailer } from '../invoices/mailer';
import { roundMoney } from '../invoices/money';
import { formatInvoiceNumber } from '../invoices/numbering';
import { addCalendarDays } from '../invoices/payment-terms';
import { computeInvoiceTotals, type ComputedInvoiceTotals } from '../invoices/totals';
import * as quotesRepo from './quotes.repository';
import { assertQuoteTransition, aucklandToday } from './quotes.transitions';

const EMPTY_COUNTS: QuoteCounts = {
  draft: 0, sent: 0, viewed: 0, accepted: 0, declined: 0, expired: 0, converted: 0,
};

function countsFor(quotes: QuoteDto[]): QuoteCounts {
  const counts = { ...EMPTY_COUNTS };
  for (const quote of quotes) counts[quote.status] += 1;
  return counts;
}

async function requireQuote(
  tx: Database,
  organisationId: string,
  id: string,
): Promise<QuoteDto> {
  const quote = await quotesRepo.getQuote(tx, organisationId, id, aucklandToday());
  if (!quote) throw new HTTPException(404, { message: 'Quote not found' });
  return quote;
}

async function allocateQuoteNumber(
  tx: Database,
  ctx: { organisationId: string; userId: string },
  date: string,
) {
  const profile = await profileRepo.ensureBusinessProfile(tx, ctx);
  if (!profile) throw new HTTPException(400, { message: 'Set up your business profile first' });
  const sequence = profile.quoteNumberSequence ?? 1;
  const quoteNumber = formatInvoiceNumber(
    profile.quoteNumberFormat || 'QUO-{YYYY}-{SEQ}',
    sequence,
    new Date(date),
  );
  await profileRepo.bumpQuoteSequence(tx, profile.id, sequence + 1);
  return { profile, quoteNumber };
}

function roundRate(value: string | null | undefined, fallback: string): string {
  const source = value == null || value === '' ? fallback : value;
  return roundMoney(source);
}

function priced(
  input: {
    items: CreateQuoteRequest['items'];
    taxInclusive?: boolean;
    taxRate?: string | null;
    discountType?: 'fixed' | 'percent';
    discountPercent?: string | null;
    discount?: string | null;
    additionalCharges?: string | null;
    additionalChargesList?: CreateQuoteRequest['additionalChargesList'];
  },
  defaultTaxRate: string,
): { totals: ComputedInvoiceTotals; taxRate: string } {
  const taxRate = roundRate(input.taxRate, defaultTaxRate);
  const discountPercent = input.discountType === 'percent'
    ? roundMoney(input.discountPercent ?? 0)
    : input.discountPercent;
  const totals = computeInvoiceTotals({ ...input, taxRate, discountPercent }, defaultTaxRate);
  return { totals, taxRate };
}

function assertExpiry(date: string, expiryDate: string): void {
  if (expiryDate < date) {
    throw apiError(400, 'VALIDATION_ERROR', "Valid until date can't be before the quote date");
  }
}

export async function listQuotesForUser(
  db: Database,
  userId: string,
  query: QuoteListQuery,
): Promise<QuoteListResponse> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    let quotes = await quotesRepo.listQuotes(tx, ctx.organisationId, aucklandToday());
    if (query.customerId) quotes = quotes.filter((quote) => quote.customerId === query.customerId);
    if (query.q) {
      const needle = query.q.toLowerCase();
      quotes = quotes.filter((quote) =>
        quote.quoteNumber.toLowerCase().includes(needle)
        || (quote.customerName ?? '').toLowerCase().includes(needle));
    }
    if (query.from) quotes = quotes.filter((quote) => quote.date >= query.from!);
    if (query.to) quotes = quotes.filter((quote) => quote.date <= query.to!);
    const counts = countsFor(quotes);
    if (query.status) quotes = quotes.filter((quote) => quote.status === query.status);
    return quoteListResponseSchema.parse({ quotes, counts });
  });
}

export async function getQuoteForUser(db: Database, userId: string, id: string): Promise<QuoteDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => requireQuote(tx, ctx.organisationId, id));
}

export async function peekNextQuoteNumber(db: Database, userId: string): Promise<{ quoteNumber: string }> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const profile = await profileRepo.getBusinessProfile(tx, ctx.organisationId);
    return {
      quoteNumber: formatInvoiceNumber(
        profile?.quoteNumberFormat || 'QUO-{YYYY}-{SEQ}',
        profile?.quoteNumberSequence ?? 1,
        new Date(),
      ),
    };
  });
}

export async function createQuoteForUser(
  db: Database,
  userId: string,
  input: CreateQuoteRequest,
  idempotency?: IdempotencyScope,
): Promise<QuoteDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    if (idempotency) {
      const existing = await getIdempotencyRecord(tx, ctx, idempotency);
      if (existing) {
        assertReplayMatches(existing.requestHash, idempotency.requestHash);
        return quoteSchema.parse(existing.responseBody);
      }
    }
    const customer = await customersRepo.getCustomer(tx, ctx.organisationId, input.customerId);
    if (!customer) throw new HTTPException(400, { message: 'Customer not found' });
    const { profile, quoteNumber } = await allocateQuoteNumber(tx, ctx, input.date);
    const expiryDate = input.expiryDate ?? addCalendarDays(input.date, profile.quoteValidityDays ?? 30);
    assertExpiry(input.date, expiryDate);
    const { totals, taxRate } = priced(input, profile.defaultTaxRate ?? '0');
    const quote = await quotesRepo.insertQuote(tx, ctx, {
      customerId: input.customerId,
      quoteNumber,
      kind: input.kind ?? profile.defaultQuoteKind ?? 'quote',
      revision: 1,
      date: input.date,
      expiryDate,
      notes: input.notes ?? null,
      terms: input.terms ?? null,
      currency: input.currency ?? 'NZD',
      templateName: input.templateName ?? null,
      status: 'draft',
      taxRate,
      totals,
    });
    if (idempotency) await insertIdempotencyRecord(tx, ctx, idempotency, { status: 201, body: quote });
    return quote;
  });
}

export async function updateQuoteForUser(
  db: Database,
  userId: string,
  id: string,
  input: UpdateQuoteRequest,
): Promise<QuoteDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const existing = await requireQuote(tx, ctx.organisationId, id);
    if (existing.status !== 'draft') {
      throw apiError(409, 'QUOTE_NOT_EDITABLE', `A ${existing.status} quote cannot be edited`);
    }
    if (input.customerId && input.customerId !== existing.customerId) {
      const customer = await customersRepo.getCustomer(tx, ctx.organisationId, input.customerId);
      if (!customer) throw new HTTPException(400, { message: 'Customer not found' });
    }
    const date = input.date ?? existing.date;
    const expiryDate = input.expiryDate ?? existing.expiryDate;
    assertExpiry(date, expiryDate);

    const shouldRecalc = input.items !== undefined
      || input.discountType !== undefined
      || input.discountPercent !== undefined
      || input.discount !== undefined
      || input.taxInclusive !== undefined
      || input.taxRate !== undefined
      || input.additionalCharges !== undefined
      || input.additionalChargesList !== undefined;
    let totals: ComputedInvoiceTotals | undefined;
    let taxRate: string | undefined;
    if (shouldRecalc) {
      const profile = await profileRepo.getBusinessProfile(tx, ctx.organisationId);
      const defaultTaxRate = profile?.defaultTaxRate ?? '0';
      const items = input.items ?? existing.items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        rate: item.rate,
        rateUnit: item.rateUnit,
      }));
      const pricedInput = {
        items,
        taxInclusive: input.taxInclusive ?? existing.taxInclusive,
        taxRate: input.taxRate !== undefined ? input.taxRate : existing.taxRate,
        discountType: input.discountType ?? existing.discountType,
        discountPercent: input.discountPercent !== undefined ? input.discountPercent : existing.discountPercent,
        discount: input.discount !== undefined ? input.discount : existing.discount,
        additionalCharges: input.additionalCharges !== undefined ? input.additionalCharges : existing.additionalCharges,
        additionalChargesList: input.additionalChargesList !== undefined
          ? input.additionalChargesList
          : input.additionalCharges !== undefined ? undefined : existing.additionalChargesList,
      };
      ({ totals, taxRate } = priced(pricedInput, defaultTaxRate));
    }

    const updated = await quotesRepo.replaceQuote(tx, ctx.organisationId, id, {
      customerId: input.customerId,
      kind: input.kind,
      date: input.date,
      expiryDate: input.expiryDate,
      notes: input.notes,
      terms: input.terms,
      currency: input.currency,
      templateName: input.templateName,
      taxRate,
      totals,
    });
    if (!updated) throw new HTTPException(404, { message: 'Quote not found' });
    return updated;
  });
}

export async function deleteQuoteForUser(db: Database, userId: string, id: string): Promise<void> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const existing = await requireQuote(tx, ctx.organisationId, id);
    if (existing.status !== 'draft') {
      throw apiError(409, 'QUOTE_NOT_EDITABLE', `A ${existing.status} quote cannot be deleted`);
    }
    const deleted = await quotesRepo.deleteDraftQuote(tx, ctx.organisationId, id);
    if (!deleted) throw new HTTPException(404, { message: 'Quote not found' });
  });
}

export async function duplicateQuoteForUser(db: Database, userId: string, id: string): Promise<QuoteDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const existing = await requireQuote(tx, ctx.organisationId, id);
    const today = aucklandToday();
    const { profile, quoteNumber } = await allocateQuoteNumber(tx, ctx, today);
    const { totals, taxRate } = priced({
      items: existing.items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        rate: item.rate,
        rateUnit: item.rateUnit,
      })),
      taxInclusive: existing.taxInclusive,
      taxRate: existing.taxRate,
      discountType: existing.discountType,
      discountPercent: existing.discountPercent,
      discount: existing.discount,
      additionalCharges: existing.additionalCharges,
      additionalChargesList: existing.additionalChargesList,
    }, existing.taxRate);
    return quotesRepo.insertQuote(tx, ctx, {
      customerId: existing.customerId,
      quoteNumber,
      kind: existing.kind,
      revision: 1,
      date: today,
      expiryDate: addCalendarDays(today, profile.quoteValidityDays ?? 30),
      notes: existing.notes,
      terms: existing.terms,
      currency: existing.currency,
      templateName: existing.templateName,
      status: 'draft',
      taxRate,
      totals,
    });
  });
}

export async function reviseQuoteForUser(db: Database, userId: string, id: string): Promise<QuoteDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const existing = await requireQuote(tx, ctx.organisationId, id);
    assertQuoteTransition(existing.status, 'draft');
    const revised = await quotesRepo.reviseQuote(tx, ctx.organisationId, id);
    if (!revised) throw new HTTPException(404, { message: 'Quote not found' });
    return revised;
  });
}

export async function markQuoteSentForUser(db: Database, userId: string, id: string): Promise<QuoteDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const existing = await requireQuote(tx, ctx.organisationId, id);
    assertQuoteTransition(existing.status, 'sent');
    await quotesRepo.setQuoteStatus(tx, ctx.organisationId, id, { status: 'sent', sentAt: new Date() });
    return requireQuote(tx, ctx.organisationId, id);
  });
}

export async function setQuoteStatusForUser(
  db: Database,
  userId: string,
  id: string,
  input: QuoteStatusChange,
): Promise<QuoteDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const existing = await requireQuote(tx, ctx.organisationId, id);
    if (existing.status === 'expired') {
      throw apiError(409, 'QUOTE_EXPIRED', `This quote expired on ${existing.expiryDate}`);
    }
    assertQuoteTransition(existing.status, input.status);
    const updated = await quotesRepo.setQuoteStatus(tx, ctx.organisationId, id, {
      status: input.status,
      respondedAt: new Date(),
      respondedByName: input.name?.trim() || null,
      responseNote: input.note?.trim() || null,
      acceptedRevision: input.status === 'accepted' ? existing.revision : null,
    });
    if (!updated) throw new HTTPException(404, { message: 'Quote not found' });
    return updated;
  });
}

export async function sendQuoteForUser(
  db: Database,
  userId: string,
  id: string,
  input: SendQuoteRequest,
  mailer: InvoiceMailer,
): Promise<QuoteDto> {
  const prepared = await withOrganisationTx(db, userId, async (tx, ctx) => {
    const quote = await requireQuote(tx, ctx.organisationId, id);
    if (quote.status === 'expired') {
      throw apiError(409, 'QUOTE_EXPIRED', `This quote expired on ${quote.expiryDate}`);
    }
    if (quote.status !== 'sent' && quote.status !== 'viewed') {
      assertQuoteTransition(quote.status, 'sent');
    }
    const customer = await customersRepo.getCustomer(tx, ctx.organisationId, quote.customerId);
    if (!customer) throw new HTTPException(400, { message: 'Customer not found' });
    const recipients = (input.to && input.to.length > 0 ? input.to : [customer.email])
      .map((address) => address.trim())
      .filter((address) => address.length > 0);
    if (recipients.length === 0) throw apiError(400, 'customer_email_required', 'Add an email to this customer');
    return { quote, recipients };
  });

  if (!mailer.sendQuote) {
    throw apiError(503, 'EMAIL_UNAVAILABLE', 'Email delivery is unavailable. Share the quote link instead.');
  }
  try {
    await mailer.sendQuote({
      invoiceId: prepared.quote.id,
      invoiceNumber: prepared.quote.quoteNumber,
      to: prepared.recipients,
    });
  } catch (error) {
    if (error instanceof HTTPException && error.status === 503) throw error;
    throw apiError(502, 'email_failed', 'Failed to send quote email');
  }

  if (prepared.quote.status !== 'draft') return prepared.quote;
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    await quotesRepo.setQuoteStatus(tx, ctx.organisationId, id, { status: 'sent', sentAt: new Date() });
    return requireQuote(tx, ctx.organisationId, id);
  });
}
