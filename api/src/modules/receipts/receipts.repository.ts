import {
  paymentReceiptSchema,
  type PaymentReceiptDto,
} from '@ledgercraft/contracts';
import { and, desc, eq, gte, lt } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { receipts } from '../../db/schema/receipts';

function toDto(row: typeof receipts.$inferSelect): PaymentReceiptDto {
  return paymentReceiptSchema.parse({
    id: row.id,
    paymentId: row.paymentId,
    receiptNumber: row.receiptNumber,
    generatedAt: row.generatedAt.toISOString(),
    emailSentAt: row.emailSentAt ? row.emailSentAt.toISOString() : null,
    isEmailed: row.isEmailed,
    receiptData: row.receiptData,
    createdAt: row.createdAt.toISOString(),
  });
}

export async function listReceipts(tx: Database, organisationId: string): Promise<PaymentReceiptDto[]> {
  const rows = await tx
    .select()
    .from(receipts)
    .where(eq(receipts.organisationId, organisationId))
    .orderBy(desc(receipts.createdAt));
  return rows.map(toDto);
}

export async function getReceipt(
  tx: Database,
  organisationId: string,
  id: string,
): Promise<PaymentReceiptDto | undefined> {
  const [row] = await tx
    .select()
    .from(receipts)
    .where(and(eq(receipts.id, id), eq(receipts.organisationId, organisationId)));
  return row ? toDto(row) : undefined;
}

export async function getReceiptByPayment(
  tx: Database,
  organisationId: string,
  paymentId: string,
): Promise<PaymentReceiptDto | undefined> {
  const [row] = await tx
    .select()
    .from(receipts)
    .where(and(eq(receipts.paymentId, paymentId), eq(receipts.organisationId, organisationId)));
  return row ? toDto(row) : undefined;
}

export async function countReceiptsInMonth(
  tx: Database,
  organisationId: string,
  monthStart: Date,
  nextMonth: Date,
): Promise<number> {
  const rows = await tx
    .select({ id: receipts.id })
    .from(receipts)
    .where(
      and(
        eq(receipts.organisationId, organisationId),
        gte(receipts.createdAt, monthStart),
        lt(receipts.createdAt, nextMonth),
      ),
    );
  return rows.length;
}

export async function insertReceipt(
  tx: Database,
  ctx: { organisationId: string; userId: string },
  input: {
    paymentId: string;
    receiptNumber: string;
    receiptData: Record<string, unknown>;
  },
): Promise<PaymentReceiptDto> {
  const [row] = await tx
    .insert(receipts)
    .values({
      organisationId: ctx.organisationId,
      userId: ctx.userId,
      paymentId: input.paymentId,
      receiptNumber: input.receiptNumber,
      receiptData: input.receiptData,
    })
    .returning();
  return toDto(row);
}
