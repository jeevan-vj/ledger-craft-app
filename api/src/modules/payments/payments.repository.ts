import {
  paymentSchema,
  type CreatePaymentRequest,
  type PaymentDto,
} from '@ledgercraft/contracts';
import { and, desc, eq } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { invoices } from '../../db/schema/invoices';
import { payments } from '../../db/schema/payments';
import { decimal, roundMoney } from '../invoices/money';

function toPaymentDto(
  row: typeof payments.$inferSelect,
  invoiceNumber: string | null,
): PaymentDto {
  return paymentSchema.parse({
    id: row.id,
    invoiceId: row.invoiceId,
    invoiceNumber,
    paymentMethod: row.paymentMethod,
    amount: roundMoney(row.amount),
    paymentDate: row.paymentDate,
    referenceNumber: row.referenceNumber ?? null,
    notes: row.notes ?? null,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

export async function listPayments(
  tx: Database,
  organisationId: string,
  invoiceId?: string,
): Promise<PaymentDto[]> {
  const rows = await tx
    .select({ payment: payments, invoiceNumber: invoices.invoiceNumber })
    .from(payments)
    .leftJoin(invoices, and(eq(invoices.id, payments.invoiceId), eq(invoices.organisationId, organisationId)))
    .where(
      invoiceId
        ? and(eq(payments.organisationId, organisationId), eq(payments.invoiceId, invoiceId))
        : eq(payments.organisationId, organisationId),
    )
    .orderBy(desc(payments.paymentDate), desc(payments.createdAt));
  return rows.map((row) => toPaymentDto(row.payment, row.invoiceNumber ?? null));
}

export async function getPayment(
  tx: Database,
  organisationId: string,
  id: string,
): Promise<PaymentDto | undefined> {
  const [row] = await tx
    .select({ payment: payments, invoiceNumber: invoices.invoiceNumber })
    .from(payments)
    .leftJoin(invoices, and(eq(invoices.id, payments.invoiceId), eq(invoices.organisationId, organisationId)))
    .where(and(eq(payments.id, id), eq(payments.organisationId, organisationId)));
  return row ? toPaymentDto(row.payment, row.invoiceNumber ?? null) : undefined;
}

export async function insertPayment(
  tx: Database,
  ctx: { organisationId: string; userId: string },
  input: CreatePaymentRequest,
): Promise<PaymentDto> {
  const [row] = await tx
    .insert(payments)
    .values({
      organisationId: ctx.organisationId,
      userId: ctx.userId,
      invoiceId: input.invoiceId,
      paymentMethod: input.paymentMethod,
      amount: roundMoney(input.amount),
      paymentDate: input.paymentDate,
      referenceNumber: input.referenceNumber ?? null,
      notes: input.notes ?? null,
      status: 'completed',
    })
    .returning();
  if (!row) throw new Error('Failed to insert payment');
  return getPayment(tx, ctx.organisationId, row.id) as Promise<PaymentDto>;
}

export async function sumCompletedPayments(
  tx: Database,
  organisationId: string,
  invoiceId: string,
): Promise<string> {
  const rows = await tx
    .select({ amount: payments.amount })
    .from(payments)
    .where(
      and(
        eq(payments.organisationId, organisationId),
        eq(payments.invoiceId, invoiceId),
        eq(payments.status, 'completed'),
      ),
    );
  return rows.reduce((sum, row) => sum.add(row.amount), decimal(0)).toFixed();
}
