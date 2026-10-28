import {
  paymentListResponseSchema,
  paymentSchema,
  type CreatePaymentRequest,
  type PaymentDto,
  type PaymentListResponse,
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
import { bankLedgerAccount, postBalancedEntry, systemAccount } from '../accounting/posting';
import * as bankRepo from '../bank/bank.repository';
import { postInvoiceJournal } from '../invoices/invoices.journal';

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
  options?: { clearingAccountNumber?: '1130' },
): Promise<PaymentDto> {
  if (idempotency) {
    const existing = await getIdempotencyRecord(tx, ctx, idempotency);
    if (existing) {
      assertReplayMatches(existing.requestHash, idempotency.requestHash);
      return paymentSchema.parse(existing.responseBody);
    }
  }

  const invoice = await invoicesRepo.getInvoice(tx, ctx.organisationId, input.invoiceId);
  if (!invoice) throw new HTTPException(404, { message: 'Invoice not found' });
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

  const payment = await repo.insertPayment(tx, ctx, input);
  const totalPaid = roundMoney(await repo.sumCompletedPayments(tx, ctx.organisationId, invoice.id));
  const remaining = decimal(invoice.total).sub(totalPaid);
  const balanceDue = roundMoney(remaining.compare(0) < 0 ? '0' : remaining);
  const next = paymentState(invoice.total, totalPaid, invoice.status === 'draft' ? 'sent' : invoice.status);
  await invoicesRepo.applyPaymentTotals(tx, ctx.organisationId, invoice.id, {
    totalPaid,
    balanceDue,
    paymentStatus: next.paymentStatus,
    status: next.status,
  });
  const receivableId = await systemAccount(tx, ctx, '1200');
  const bankAccounts = await bankRepo.listAccounts(tx, ctx.organisationId);
  const selectedBank = bankAccounts.find((account) => account.accountName === input.paymentMethod || account.accountNumber === input.referenceNumber) ?? bankAccounts[0];
  let cashId: string;
  if (options?.clearingAccountNumber) cashId = await systemAccount(tx, ctx, options.clearingAccountNumber);
  else if (selectedBank) cashId = await bankLedgerAccount(tx, ctx, selectedBank);
  else cashId = await systemAccount(tx, ctx, '1110');
  await postBalancedEntry(tx, ctx, {
    date: payment.paymentDate,
    description: `Payment for ${invoice.invoiceNumber}`,
    referenceType: 'invoice_payment', referenceId: payment.id,
    lines: [
      { accountId: cashId, description: `Payment for ${invoice.invoiceNumber}`, debit: payment.amount, credit: '0' },
      { accountId: receivableId, description: `Payment for ${invoice.invoiceNumber}`, debit: '0', credit: payment.amount },
    ],
  });
  if (idempotency) {
    await insertIdempotencyRecord(tx, ctx, idempotency, { status: 201, body: payment });
  }
  return payment;
}
