import type {
  CreateInvoiceRequest,
  InvoiceDto,
  InvoiceListResponse,
  RemindInvoiceRequest,
  SendInvoiceRequest,
  UpdateInvoiceRequest,
} from '@ledgercraft/contracts';
import { invoiceListResponseSchema, invoiceSchema } from '@ledgercraft/contracts';
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
} from './idempotency';
import { postInvoiceJournal } from './invoices.journal';
import * as invoicesRepo from './invoices.repository';
import type { InvoiceMailer } from './mailer';
import { formatInvoiceNumber } from './numbering';
import { computeInvoiceTotals } from './totals';
import { convertToBase, currencyRepository, resolveDocumentCurrency } from '../currency/currency.service';

export { formatInvoiceNumber };

function assertDueDateNotBeforeInvoiceDate(date: string, dueDate: string): void {
  if (dueDate < date) {
    throw apiError(400, 'VALIDATION_ERROR', "Due date can't be before the invoice date");
  }
}

export async function listInvoicesForUser(db: Database, userId: string): Promise<InvoiceListResponse> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const invoices = await invoicesRepo.listInvoices(tx, ctx.organisationId);
    return invoiceListResponseSchema.parse({ invoices });
  });
}

export async function getInvoiceForUser(db: Database, userId: string, id: string): Promise<InvoiceDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const invoice = await invoicesRepo.getInvoice(tx, ctx.organisationId, id);
    if (!invoice) throw new HTTPException(404, { message: 'Invoice not found' });
    return invoice;
  });
}

export async function peekNextInvoiceNumber(db: Database, userId: string): Promise<{ invoiceNumber: string }> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const profile = await profileRepo.getBusinessProfile(tx, ctx.organisationId);
    const sequence = profile?.invoiceNumberSequence ?? 1;
    return {
      invoiceNumber: formatInvoiceNumber(
        profile?.invoiceNumberFormat ?? 'INV-{YYYY}-{SEQ}',
        sequence,
        new Date(),
      ),
    };
  });
}

export async function createInvoiceInTx(
  tx: Database,
  ctx: { organisationId: string; userId: string },
  input: CreateInvoiceRequest,
): Promise<InvoiceDto> {
  const customer = await customersRepo.getCustomer(tx, ctx.organisationId, input.customerId);
  if (!customer) throw new HTTPException(400, { message: 'Customer not found' });

  const profile = await profileRepo.ensureBusinessProfile(tx, ctx);
  if (!profile) {
    throw new HTTPException(400, { message: 'Set up your business profile first' });
  }

  assertDueDateNotBeforeInvoiceDate(input.date, input.dueDate);

  const nextSequence = profile.invoiceNumberSequence ?? 1;
  const invoiceNumber = formatInvoiceNumber(
    profile.invoiceNumberFormat ?? 'INV-{YYYY}-{SEQ}',
    nextSequence,
    new Date(input.date),
  );
  await profileRepo.bumpInvoiceSequence(tx, profile.id, nextSequence + 1);

  const paymentTermDays = input.paymentTermDays ?? profile.paymentTermDays ?? 30;
  // Client dueDate is authoritative. A mismatch against date + paymentTermDays is an override, not rewritten.

  const defaultTaxRate = profile.defaultTaxRate ?? '0';
  const resolved = await resolveDocumentCurrency(tx, ctx.organisationId, input.currency, input.date);
  const totals = computeInvoiceTotals(input, defaultTaxRate, resolved.currency.precision);
  const status = input.status === 'sent' ? 'draft' : (input.status ?? 'draft');
  const invoice = await invoicesRepo.insertInvoice(tx, ctx, {
    customerId: input.customerId,
    invoiceNumber,
    externalNumber: input.externalNumber ?? null,
    date: input.date,
    dueDate: input.dueDate,
    paymentTermDays,
    notes: input.notes ?? null,
    terms: input.terms ?? null,
    currency: resolved.currency.code,
    exchangeRate: resolved.rate,
    exchangeRateId: resolved.rateId,
    baseCurrency: resolved.base.code,
    baseSubtotal: convertToBase(totals.subtotal, resolved.rate, resolved.base.precision),
    baseTaxAmount: convertToBase(totals.taxAmount, resolved.rate, resolved.base.precision),
    baseTotal: convertToBase(totals.total, resolved.rate, resolved.base.precision),
    status,
    totals,
  });

  if (invoice.status !== 'draft') {
    await postInvoiceJournal(tx, ctx, {
      invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, date: invoice.date,
      subtotal: invoice.subtotal, taxAmount: invoice.taxAmount, total: invoice.total,
    });
  }

  await invoicesRepo.recordHistory(tx, ctx, invoice.id, {
    action: 'created', fromStatus: null, toStatus: invoice.status,
  });
  if (resolved.rateId) await currencyRepository.recordRateUsage(tx, ctx.organisationId, resolved.rateId, 'invoice', invoice.id);

  return invoice;
}

export async function createInvoiceForUser(
  db: Database,
  userId: string,
  input: CreateInvoiceRequest,
  idempotency?: IdempotencyScope,
): Promise<InvoiceDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    if (idempotency) {
      const existing = await getIdempotencyRecord(tx, ctx, idempotency);
      if (existing) {
        assertReplayMatches(existing.requestHash, idempotency.requestHash);
        return invoiceSchema.parse(existing.responseBody);
      }
    }

    const invoice = await createInvoiceInTx(tx, ctx, input);
    if (idempotency) {
      await insertIdempotencyRecord(tx, ctx, idempotency, { status: 201, body: invoice });
    }
    return invoice;
  });
}

export async function updateInvoiceForUser(
  db: Database,
  userId: string,
  id: string,
  input: UpdateInvoiceRequest,
): Promise<InvoiceDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const existing = await invoicesRepo.getInvoice(tx, ctx.organisationId, id);
    if (!existing) throw new HTTPException(404, { message: 'Invoice not found' });

    const date = input.date ?? existing.date;
    const dueDate = input.dueDate ?? existing.dueDate;
    assertDueDateNotBeforeInvoiceDate(date, dueDate);
    if (existing.exchangeRateId && input.date && input.date !== existing.date) {
      throw new HTTPException(409, { message: 'Invoice date is locked after a foreign exchange rate is attached' });
    }
    const resolvedCurrency = await resolveDocumentCurrency(tx, ctx.organisationId, existing.currency, date);

    const shouldRecalc =
      input.items !== undefined ||
      input.discountType !== undefined ||
      input.discountPercent !== undefined ||
      input.discount !== undefined ||
      input.taxInclusive !== undefined ||
      input.taxRate !== undefined ||
      input.additionalCharges !== undefined ||
      input.additionalChargesList !== undefined;
    if (existing.status !== 'draft' && (shouldRecalc || input.date !== undefined)) {
      throw apiError(409, 'INVOICE_POSTED', 'Posted invoices are immutable; create a reversal or adjustment');
    }

    let totals = undefined;
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
      totals = computeInvoiceTotals(
        {
          items,
          taxInclusive: input.taxInclusive ?? existing.taxInclusive,
          taxRate: input.taxRate,
          discountType: input.discountType ?? existing.discountType,
          discountPercent: input.discountPercent ?? existing.discountPercent,
          discount: input.discount ?? existing.discount,
          additionalCharges: input.additionalCharges !== undefined ? input.additionalCharges : existing.additionalCharges,
          additionalChargesList: input.additionalChargesList !== undefined
            ? input.additionalChargesList
            : input.additionalCharges !== undefined ? undefined : existing.additionalChargesList,
        },
        defaultTaxRate,
        resolvedCurrency.currency.precision,
      );
    }

    const currencySnapshot = totals ? {
      exchangeRate: existing.exchangeRate, exchangeRateId: existing.exchangeRateId,
      baseCurrency: existing.baseCurrency,
      baseSubtotal: convertToBase(totals.subtotal, existing.exchangeRate, resolvedCurrency.base.precision),
      baseTaxAmount: convertToBase(totals.taxAmount, existing.exchangeRate, resolvedCurrency.base.precision),
      baseTotal: convertToBase(totals.total, existing.exchangeRate, resolvedCurrency.base.precision),
    } : undefined;
    const updated = await invoicesRepo.replaceInvoiceTotals(tx, ctx.organisationId, id, {
      date: input.date,
      dueDate: input.dueDate,
      paymentTermDays: input.paymentTermDays,
      notes: input.notes,
      terms: input.terms,
      totals,
      currencySnapshot,
    });
    if (!updated) throw new HTTPException(404, { message: 'Invoice not found' });

    if (input.status && input.status !== updated.status) {
      const withStatus = await invoicesRepo.updateInvoiceStatus(tx, ctx.organisationId, id, input.status);
      if (!withStatus) throw new HTTPException(404, { message: 'Invoice not found' });
      if (updated.status === 'draft' && withStatus.status !== 'draft') {
        await postInvoiceJournal(tx, ctx, { invoiceId: withStatus.id, invoiceNumber: withStatus.invoiceNumber, date: withStatus.date, subtotal: withStatus.subtotal, taxAmount: withStatus.taxAmount, total: withStatus.total });
      }
      await invoicesRepo.recordHistory(tx, ctx, id, {
        action: input.status === 'sent' ? 'sent' : 'updated',
        fromStatus: existing.status,
        toStatus: withStatus.status,
      });
      return withStatus;
    }
    await invoicesRepo.recordHistory(tx, ctx, id, { action: 'updated', fromStatus: existing.status, toStatus: updated.status });
    return updated;
  });
}

export async function sendInvoiceForUser(
  db: Database,
  userId: string,
  id: string,
  input: SendInvoiceRequest,
  mailer: InvoiceMailer,
): Promise<InvoiceDto> {
  const prepared = await withOrganisationTx(db, userId, async (tx, ctx) => {
    const invoice = await invoicesRepo.getInvoice(tx, ctx.organisationId, id);
    if (!invoice) throw new HTTPException(404, { message: 'Invoice not found' });
    const customer = await customersRepo.getCustomer(tx, ctx.organisationId, invoice.customerId);
    if (!customer) throw new HTTPException(400, { message: 'Customer not found' });

    const recipients = input.to && input.to.length > 0 ? input.to : [customer.email];
    const validRecipients = recipients.map((address) => address.trim()).filter((address) => address.length > 0);
    if (validRecipients.length === 0) {
      throw apiError(400, 'customer_email_required', 'Add an email to this customer');
    }

    return { invoice, recipients: validRecipients };
  });

  // Mail is after the create/update transaction. Status becomes sent only if the mailer accepts.
  try {
    await mailer.sendInvoice({
      invoiceId: prepared.invoice.id,
      invoiceNumber: prepared.invoice.invoiceNumber,
      to: prepared.recipients,
    });
  } catch (error) {
    if (error instanceof HTTPException && error.status === 503) throw error;
    if (prepared.invoice.status !== 'sent') {
      throw apiError(502, 'email_failed', 'Failed to send invoice email');
    }
    throw apiError(502, 'email_failed', 'Failed to resend invoice email');
  }

  return withOrganisationTx(db, userId, async (tx, ctx) => {
    if (prepared.invoice.status === 'sent') {
      return prepared.invoice;
    }
    const sent = await invoicesRepo.updateInvoiceStatus(tx, ctx.organisationId, id, 'sent');
    if (!sent) throw new HTTPException(404, { message: 'Invoice not found' });
    await postInvoiceJournal(tx, ctx, { invoiceId: sent.id, invoiceNumber: sent.invoiceNumber, date: sent.date, subtotal: sent.subtotal, taxAmount: sent.taxAmount, total: sent.total });
    await invoicesRepo.recordHistory(tx, ctx, id, { action: 'sent', fromStatus: prepared.invoice.status, toStatus: 'sent' });
    return sent;
  });
}

export async function remindInvoiceForUser(
  db: Database,
  userId: string,
  id: string,
  input: RemindInvoiceRequest,
  mailer: InvoiceMailer,
): Promise<InvoiceDto> {
  const prepared = await withOrganisationTx(db, userId, async (tx, ctx) => {
    const invoice = await invoicesRepo.getInvoice(tx, ctx.organisationId, id);
    if (!invoice) throw new HTTPException(404, { message: 'Invoice not found' });
    const customer = await customersRepo.getCustomer(tx, ctx.organisationId, invoice.customerId);
    if (!customer) throw new HTTPException(400, { message: 'Customer not found' });

    const recipients = input.to && input.to.length > 0 ? input.to : [customer.email];
    const validRecipients = recipients.map((address) => address.trim()).filter((address) => address.length > 0);
    if (validRecipients.length === 0) {
      throw apiError(400, 'customer_email_required', 'Add an email to this customer');
    }

    return { invoice, recipients: validRecipients };
  });

  try {
    const sendReminder = mailer.sendReminder?.bind(mailer) ?? mailer.sendInvoice.bind(mailer);
    await sendReminder({
      invoiceId: prepared.invoice.id,
      invoiceNumber: prepared.invoice.invoiceNumber,
      to: prepared.recipients,
      subject: input.subject,
      html: input.html,
    });
  } catch (error) {
    if (error instanceof HTTPException && error.status === 503) throw error;
    throw apiError(502, 'email_failed', 'Failed to send payment reminder');
  }

  return prepared.invoice;
}
