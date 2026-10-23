import type { ConvertQuoteResponse, CreateInvoiceRequest } from '@ledgercraft/contracts';
import { convertQuoteResponseSchema } from '@ledgercraft/contracts';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client';
import { withOrganisationTx } from '../auth/bind-organisation';
import * as profileRepo from '../business-profile/business-profile.repository';
import {
  assertReplayMatches,
  getIdempotencyRecord,
  insertIdempotencyRecord,
  type IdempotencyScope,
} from '../invoices/idempotency';
import * as invoicesRepo from '../invoices/invoices.repository';
import { postInvoiceJournal } from '../invoices/invoices.journal';
import { createInvoiceInTx } from '../invoices/invoices.service';
import { addCalendarDays } from '../invoices/payment-terms';
import * as quotesRepo from './quotes.repository';
import { assertConversionTotals, assertQuoteTransition, aucklandToday } from './quotes.transitions';

export async function convertQuoteForUser(
  db: Database,
  userId: string,
  id: string,
  idempotency?: IdempotencyScope,
): Promise<ConvertQuoteResponse> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    if (idempotency) {
      const existing = await getIdempotencyRecord(tx, ctx, idempotency);
      if (existing) {
        assertReplayMatches(existing.requestHash, idempotency.requestHash);
        return convertQuoteResponseSchema.parse(existing.responseBody);
      }
    }

    const quote = await quotesRepo.getQuote(tx, ctx.organisationId, id, aucklandToday());
    if (!quote) throw new HTTPException(404, { message: 'Quote not found' });

    if (quote.convertedInvoiceId) {
      const invoice = await invoicesRepo.getInvoice(tx, ctx.organisationId, quote.convertedInvoiceId);
      if (!invoice) throw new HTTPException(404, { message: 'Invoice not found' });
      const body = convertQuoteResponseSchema.parse({ quote, invoice });
      if (idempotency) await insertIdempotencyRecord(tx, ctx, idempotency, { status: 200, body });
      return body;
    }

    assertQuoteTransition(quote.status, 'converted');
    const profile = await profileRepo.ensureBusinessProfile(tx, ctx);
    if (!profile) throw new HTTPException(400, { message: 'Set up your business profile first' });
    const today = aucklandToday();
    const paymentTermDays = profile.paymentTermDays ?? 30;
    const input: CreateInvoiceRequest = {
      customerId: quote.customerId,
      date: today,
      dueDate: addCalendarDays(today, paymentTermDays),
      paymentTermDays,
      notes: quote.notes,
      terms: quote.terms,
      currency: quote.currency,
      taxInclusive: quote.taxInclusive,
      taxRate: quote.taxRate,
      discountType: quote.discountType,
      discountPercent: quote.discountPercent,
      discount: quote.discount,
      additionalCharges: quote.additionalCharges,
      additionalChargesList: quote.additionalChargesList,
      status: 'draft',
      items: quote.items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        rate: item.rate,
        rateUnit: item.rateUnit,
      })),
    };
    const invoice = await createInvoiceInTx(tx, ctx, input);
    assertConversionTotals(quote, invoice);
    await postInvoiceJournal(tx, ctx, {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      date: invoice.date,
      subtotal: invoice.subtotal,
      taxAmount: invoice.taxAmount,
      total: invoice.total,
    });
    const linked = await quotesRepo.linkConvertedInvoice(tx, ctx.organisationId, quote.id, invoice.id);
    if (!linked || linked.convertedInvoiceId !== invoice.id) {
      throw new HTTPException(409, { message: 'Quote was already converted' });
    }
    const refreshed = await invoicesRepo.getInvoice(tx, ctx.organisationId, invoice.id);
    if (!refreshed) throw new HTTPException(404, { message: 'Invoice not found' });
    const body = convertQuoteResponseSchema.parse({ quote: linked, invoice: refreshed });
    if (idempotency) await insertIdempotencyRecord(tx, ctx, idempotency, { status: 200, body });
    return body;
  });
}
