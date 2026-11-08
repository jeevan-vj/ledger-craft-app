import { assertAccountingDateOpen } from '../accounting/period-lock';
import { defaultBankAccount } from '../bank/bank-workspace.repository';
import {
  paymentListResponseSchema,
  paymentSchema,
  type CreatePaymentRequest,
  type PaymentDto,
  type PaymentListResponse,
  type ReversePaymentRequest,
} from '@ledgercraft/contracts';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client';
import { apiError } from '../../http-error';
import { withOrganisationTx, type OrganisationContext } from '../auth/bind-organisation';
import * as invoicesRepo from '../invoices/invoices.repository';
import {
  assertReplayMatches,
  getIdempotencyRecord,
  insertIdempotencyRecord,
  type IdempotencyScope,
} from '../invoices/idempotency';
import { moneyToCents, decimal, roundMoney } from '../invoices/money';
import * as repo from './payments.repository';
import { bankLedgerAccount, postBalancedEntry, reversePosting, systemAccount } from '../accounting/posting';
import * as bankRepo from '../bank/bank.repository';
import { hasActiveCreditNotes, latestActiveCreditNoteDate } from '../credit-notes/credit-notes.repository';
import { postInvoiceJournal } from '../invoices/invoices.journal';
import { assertOpenSettlementPeriod, exchangeDifferenceLine, settlementSnapshot } from '../currency/settlement.service';

function paymentState(total: string, totalPaid: string, currentStatus: string) {
  const paid = decimal(totalPaid);
  const invoiceTotal = decimal(total);
  if (paid.compare(0) <= 0) {
    return { paymentStatus: 'unpaid', status: currentStatus === 'paid' ? 'sent' : currentStatus };
  }
  if (paid.compare(invoiceTotal) >= 0) {
    return { paymentStatus: 'paid', status: 'paid' };
  }
  return { paymentStatus: 'partially_paid', status: currentStatus === 'paid' ? 'sent' : currentStatus };
}

export async function listPaymentsForUser(
  db: Database,
  userId: string,
  invoiceId?: string,
): Promise<PaymentListResponse> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const payments = await repo.listPayments(tx, ctx.organisationId, invoiceId);
    return paymentListResponseSchema.parse({ payments });
  });
}

export async function getPaymentForUser(db: Database, userId: string, id: string): Promise<PaymentDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const payment = await repo.getPayment(tx, ctx.organisationId, id);
    if (!payment) throw new HTTPException(404, { message: 'Payment not found' });
    return payment;
  });
}

export async function createPaymentForUser(
  db: Database,
  userId: string,
  input: CreatePaymentRequest,
  idempotency?: IdempotencyScope,
): Promise<PaymentDto> {
  return withOrganisationTx(db, userId, (tx, ctx) => createPaymentInTx(tx, ctx, input, idempotency));
}

export async function createPaymentInTx(
  tx: Database,
  ctx: OrganisationContext,
  input: CreatePaymentRequest,
  idempotency?: IdempotencyScope,
  options?: { clearingAccountNumber?: '1130'; skipPosting?: boolean },
): Promise<PaymentDto> {
  if (idempotency) {
    const existing = await getIdempotencyRecord(tx, ctx, idempotency);
    if (existing) {
      assertReplayMatches(existing.requestHash, idempotency.requestHash);
      return paymentSchema.parse(existing.responseBody);
    }
  }

  await assertAccountingDateOpen(tx, ctx.organisationId, input.paymentDate);
  const invoice = await invoicesRepo.getInvoice(tx, ctx.organisationId, input.invoiceId);
  if (!invoice) throw new HTTPException(404, { message: 'Invoice not found' });
  if (input.paymentDate < invoice.date) throw apiError(400, 'PAYMENT_PRECEDES_INVOICE', 'Record a customer advance as a liability; an invoice payment cannot precede its invoice date');
  const creditDate = await latestActiveCreditNoteDate(tx, ctx.organisationId, invoice.id);
  if (creditDate && input.paymentDate < creditDate) throw new HTTPException(409, { message: 'A payment cannot precede an already allocated credit note; review the credit note first' });
  if (invoice.paymentStatus === 'cancelled') {
    throw new HTTPException(400, { message: 'Cannot pay a cancelled invoice' });
  }
  if (moneyToCents(input.amount) > moneyToCents(invoice.balanceDue)) {
    throw apiError(400, 'PAYMENT_EXCEEDS_BALANCE', 'Payment exceeds invoice balance');
  }

  if (invoice.status === 'draft') {
    await postInvoiceJournal(tx, ctx, { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, date: invoice.date, subtotal: invoice.subtotal, taxAmount: invoice.taxAmount, total: invoice.total });
    await invoicesRepo.updateInvoiceStatus(tx, ctx.organisationId, invoice.id, 'sent');
  }

  const snapshot = await settlementSnapshot(tx, ctx.organisationId, {
    type: 'invoice', documentId: invoice.id, currency: invoice.currency, baseCurrency: invoice.baseCurrency,
    total: invoice.total, baseTotal: invoice.baseTotal, amount: input.amount, date: input.paymentDate,
    exchangeRateId: input.exchangeRateId, outstanding: invoice.balanceDue, baseCredited: invoice.baseCredited,
  });
  const payment = await repo.insertPayment(tx, ctx, input, snapshot);
  const totalPaid = roundMoney(await repo.sumCompletedPayments(tx, ctx.organisationId, invoice.id));
  const collectible = roundMoney(decimal(invoice.total).sub(invoice.totalCredited ?? '0'));
  const remaining = decimal(collectible).sub(totalPaid);
  const balanceDue = roundMoney(remaining.compare(0) < 0 ? '0' : remaining);
  const next = paymentState(collectible, totalPaid, invoice.status === 'draft' ? 'sent' : invoice.status);
  await invoicesRepo.applyPaymentTotals(tx, ctx.organisationId, invoice.id, {
    totalPaid,
    balanceDue,
    paymentStatus: next.paymentStatus,
    status: next.status,
  });
  if (!options?.skipPosting) {
    const receivableId = await systemAccount(tx, ctx, '1200');
    const bankAccounts = (await bankRepo.listAccounts(tx, ctx.organisationId)).filter(account => account.isActive);
    const defaultAccountId = await defaultBankAccount(tx, ctx.organisationId);
    const selectedBank = bankAccounts.find((account) => account.accountName === input.paymentMethod || account.accountNumber === input.referenceNumber) ?? bankAccounts.find(account => account.id === defaultAccountId) ?? bankAccounts[0];
    if (selectedBank && selectedBank.currency !== snapshot.baseCurrency) throw new HTTPException(422, { message: 'Select a bank account in the company base currency for this settlement' });
    let cashId: string;
    if (options?.clearingAccountNumber) cashId = await systemAccount(tx, ctx, options.clearingAccountNumber);
    else if (selectedBank) cashId = await bankLedgerAccount(tx, ctx, selectedBank);
    else cashId = await systemAccount(tx, ctx, '1110');
    await postBalancedEntry(tx, ctx, {
      date: payment.paymentDate,
      description: `Payment for ${invoice.invoiceNumber}`,
      referenceType: 'invoice_payment', referenceId: payment.id,
      lines: [
        { accountId: cashId, description: `Payment for ${invoice.invoiceNumber}`, debit: snapshot.baseAmount, credit: '0' },
        { accountId: receivableId, description: `Payment for ${invoice.invoiceNumber}`, debit: '0', credit: snapshot.bookBaseAmount },
        ...await exchangeDifferenceLine(tx, ctx, 'invoice', snapshot.exchangeDifference),
      ],
    });
  }
  if (idempotency) {
    await insertIdempotencyRecord(tx, ctx, idempotency, { status: 201, body: payment });
  }
  return payment;
}

export async function reversePaymentForUser(
  db: Database,
  userId: string,
  id: string,
  input: ReversePaymentRequest,
): Promise<PaymentDto> {
  return withOrganisationTx(db, userId, (tx, ctx) => reversePaymentInTx(tx, ctx, id, input));
}

export async function reversePaymentInTx(
  tx: Database,
  ctx: OrganisationContext,
  id: string,
  input: ReversePaymentRequest,
  options?: { skipPosting?: boolean },
): Promise<PaymentDto> {
    const payment = await repo.getPayment(tx, ctx.organisationId, id);
    if (!payment) throw new HTTPException(404, { message: 'Payment not found' });
    await assertAccountingDateOpen(tx, ctx.organisationId, payment.paymentDate, input.reversalDate);
    if (payment.status === 'refunded') {
      throw apiError(409, 'PAYMENT_ALREADY_REVERSED', 'Payment has already been reversed');
    }
    if (payment.status !== 'completed') {
      throw apiError(409, 'PAYMENT_NOT_REVERSIBLE', 'Only completed payments can be reversed');
    }
    if (input.reversalDate < payment.paymentDate) {
      throw apiError(400, 'REVERSAL_PRECEDES_PAYMENT', 'Reversal date cannot be before the payment date');
    }

    const invoice = await invoicesRepo.getInvoice(tx, ctx.organisationId, payment.invoiceId);
    if (!invoice) throw new HTTPException(404, { message: 'Invoice not found' });
    if (await hasActiveCreditNotes(tx, ctx.organisationId, invoice.id)) throw new HTTPException(409, { message: 'Reverse the active credit notes before reversing an invoice payment' });
    if (invoice.currency !== invoice.baseCurrency) await assertOpenSettlementPeriod(tx, ctx.organisationId, 'invoice', invoice.id, input.reversalDate);
    const reversed = await repo.reversePayment(tx, ctx, id, input);
    if (!reversed) {
      throw apiError(409, 'PAYMENT_NOT_REVERSIBLE', 'Payment is no longer reversible');
    }

    if (!options?.skipPosting) {
      await reversePosting(tx, ctx, {
        referenceType: 'invoice_payment',
        referenceId: payment.id,
        reversalType: 'invoice_payment_reversal',
        date: input.reversalDate,
        description: `Reversal of payment for ${invoice.invoiceNumber}: ${input.reason}`,
      });
    }

    const totalPaid = roundMoney(await repo.sumCompletedPayments(tx, ctx.organisationId, invoice.id));
    const collectible = roundMoney(decimal(invoice.total).sub(invoice.totalCredited ?? '0'));
    const remaining = decimal(collectible).sub(totalPaid);
    const balanceDue = roundMoney(remaining.compare(0) < 0 ? '0' : remaining);
    const next = paymentState(collectible, totalPaid, invoice.status);
    await invoicesRepo.applyPaymentTotals(tx, ctx.organisationId, invoice.id, {
      totalPaid,
      balanceDue,
      paymentStatus: next.paymentStatus,
      status: next.status,
    });
    return reversed;
}
