import {
  paymentReceiptListResponseSchema,
  type CreatePaymentReceiptRequest,
  type PaymentReceiptDto,
  type PaymentReceiptListResponse,
} from '@ledgercraft/contracts';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client';
import { withOrganisationTx } from '../auth/bind-organisation';
import * as customersRepo from '../customers/customers.repository';
import * as invoicesRepo from '../invoices/invoices.repository';
import * as paymentsRepo from '../payments/payments.repository';
import * as repo from './receipts.repository';

function receiptNumber(now: Date, sequence: number): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `REC-${year}${month}-${String(sequence).padStart(4, '0')}`;
}

export async function listReceiptsForUser(db: Database, userId: string): Promise<PaymentReceiptListResponse> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const rows = await repo.listReceipts(tx, ctx.organisationId);
    return paymentReceiptListResponseSchema.parse({ receipts: rows });
  });
}

export async function getReceiptForUser(db: Database, userId: string, id: string): Promise<PaymentReceiptDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const receipt = await repo.getReceipt(tx, ctx.organisationId, id);
    if (!receipt) throw new HTTPException(404, { message: 'Receipt not found' });
    return receipt;
  });
}

export async function createReceiptForUser(
  db: Database,
  userId: string,
  input: CreatePaymentReceiptRequest,
): Promise<PaymentReceiptDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const existing = await repo.getReceiptByPayment(tx, ctx.organisationId, input.paymentId);
    if (existing) return existing;

    const payment = await paymentsRepo.getPayment(tx, ctx.organisationId, input.paymentId);
    if (!payment) throw new HTTPException(404, { message: 'Payment not found' });

    const invoice = await invoicesRepo.getInvoice(tx, ctx.organisationId, payment.invoiceId);
    if (!invoice) throw new HTTPException(404, { message: 'Invoice not found' });

    const customer = await customersRepo.getCustomer(tx, ctx.organisationId, invoice.customerId);
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const sequence = (await repo.countReceiptsInMonth(tx, ctx.organisationId, monthStart, nextMonth)) + 1;

    return repo.insertReceipt(tx, ctx, {
      paymentId: payment.id,
      receiptNumber: receiptNumber(now, sequence),
      receiptData: {
        paymentId: payment.id,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        customerName: customer?.name ?? invoice.customerName,
        customerEmail: customer?.email ?? null,
        amountPaid: payment.amount,
        paymentDate: payment.paymentDate,
        invoiceDate: invoice.date,
        invoiceDueDate: invoice.dueDate,
        paymentMethod: payment.paymentMethod,
        currency: invoice.currency,
        invoiceTotal: invoice.total,
        totalPaid: invoice.totalPaid,
        balanceDue: invoice.balanceDue,
      },
    });
  });
}
