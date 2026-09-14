import {
  bookEntrySchema,
  reconciliationAdjustmentSchema,
  reconciliationMatchSchema,
  reconciliationSessionSchema,
  type BookEntryDto,
  type CreateReconciliationAdjustmentRequest,
  type CreateReconciliationMatchRequest,
  type CreateReconciliationSessionRequest,
  type ReconciliationAdjustmentDto,
  type ReconciliationMatchDto,
  type ReconciliationSessionDto,
} from '@ledgercraft/contracts';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { expenses } from '../../db/schema/expenses';
import { invoices } from '../../db/schema/invoices';
import { payments } from '../../db/schema/payments';
import {
  reconciliationAdjustments,
  reconciliationMatches,
  reconciliationSessions,
} from '../../db/schema/reconciliation';
import { decimal, roundMoney } from '../invoices/money';

function toSessionDto(row: typeof reconciliationSessions.$inferSelect): ReconciliationSessionDto {
  return reconciliationSessionSchema.parse({
    id: row.id,
    bankAccountId: row.bankAccountId,
    statementStartDate: row.statementStartDate,
    statementEndDate: row.statementEndDate,
    statementOpeningBalance: roundMoney(row.statementOpeningBalance),
    statementClosingBalance: roundMoney(row.statementClosingBalance),
    bookOpeningBalance: roundMoney(row.bookOpeningBalance),
    bookClosingBalance: row.bookClosingBalance == null ? null : roundMoney(row.bookClosingBalance),
    totalDeposits: roundMoney(row.totalDeposits),
    totalWithdrawals: roundMoney(row.totalWithdrawals),
    status: row.status,
    reconciledAt: row.reconciledAt ? row.reconciledAt.toISOString() : null,
    matchedCount: row.matchedCount,
    unmatchedBankCount: row.unmatchedBankCount,
    unmatchedBookCount: row.unmatchedBookCount,
    adjustmentCount: row.adjustmentCount,
    difference: roundMoney(row.difference),
    notes: row.notes ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

function toMatchDto(row: typeof reconciliationMatches.$inferSelect): ReconciliationMatchDto {
  const stored = Number(row.confidenceScore);
  return reconciliationMatchSchema.parse({
    id: row.id,
    reconciliationId: row.reconciliationId,
    bankTransactionId: row.bankTransactionId ?? null,
    invoiceId: row.invoiceId ?? null,
    paymentId: row.paymentId ?? null,
    expenseId: row.expenseId ?? null,
    journalEntryId: row.journalEntryId ?? null,
    matchType: row.matchType,
    confidenceScore: stored <= 1 ? Math.round(stored * 100) : stored,
    bankAmount: row.bankAmount == null ? null : roundMoney(row.bankAmount),
    bookAmount: row.bookAmount == null ? null : roundMoney(row.bookAmount),
    difference: roundMoney(row.difference),
    status: row.status,
    notes: row.notes ?? null,
    matchedAt: row.matchedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  });
}

function toAdjustmentDto(row: typeof reconciliationAdjustments.$inferSelect): ReconciliationAdjustmentDto {
  return reconciliationAdjustmentSchema.parse({
    id: row.id,
    reconciliationId: row.reconciliationId,
    adjustmentType: row.adjustmentType,
    description: row.description,
    amount: roundMoney(row.amount),
    affectsBank: row.affectsBank,
    affectsBook: row.affectsBook,
    referenceNumber: row.referenceNumber ?? null,
    status: row.status,
    appliedAt: row.appliedAt ? row.appliedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

export async function listSessions(
  tx: Database,
  organisationId: string,
  bankAccountId?: string,
): Promise<ReconciliationSessionDto[]> {
  const rows = await tx
    .select()
    .from(reconciliationSessions)
    .where(
      and(
        eq(reconciliationSessions.organisationId, organisationId),
        bankAccountId ? eq(reconciliationSessions.bankAccountId, bankAccountId) : undefined,
      ),
    )
    .orderBy(desc(reconciliationSessions.statementEndDate));
  return rows.map(toSessionDto);
}

export async function getSession(
  tx: Database,
  organisationId: string,
  id: string,
): Promise<ReconciliationSessionDto | undefined> {
  const [row] = await tx
    .select()
    .from(reconciliationSessions)
    .where(and(eq(reconciliationSessions.id, id), eq(reconciliationSessions.organisationId, organisationId)));
  return row ? toSessionDto(row) : undefined;
}

export async function lastCompletedBookBalance(
  tx: Database,
  organisationId: string,
  bankAccountId: string,
  beforeDate: string,
): Promise<string | undefined> {
  const [row] = await tx
    .select()
    .from(reconciliationSessions)
    .where(
      and(
        eq(reconciliationSessions.organisationId, organisationId),
        eq(reconciliationSessions.bankAccountId, bankAccountId),
        eq(reconciliationSessions.status, 'completed'),
      ),
    )
    .orderBy(desc(reconciliationSessions.statementEndDate));
  if (!row || row.statementEndDate >= beforeDate || row.bookClosingBalance == null) return undefined;
  return roundMoney(row.bookClosingBalance);
}

export async function insertSession(
  tx: Database,
  ctx: { organisationId: string; userId: string },
  input: CreateReconciliationSessionRequest,
  bookOpeningBalance: string,
): Promise<ReconciliationSessionDto> {
  const [row] = await tx
    .insert(reconciliationSessions)
    .values({
      organisationId: ctx.organisationId,
      userId: ctx.userId,
      bankAccountId: input.bankAccountId,
      statementStartDate: input.statementStartDate,
      statementEndDate: input.statementEndDate,
      statementOpeningBalance: roundMoney(input.statementOpeningBalance),
      statementClosingBalance: roundMoney(input.statementClosingBalance),
      bookOpeningBalance,
      notes: input.notes ?? null,
    })
    .returning();
  if (!row) throw new Error('Failed to insert reconciliation session');
  return toSessionDto(row);
}

export async function completeSession(
  tx: Database,
  organisationId: string,
  id: string,
  input: { bookClosingBalance: string; difference: string },
): Promise<ReconciliationSessionDto | undefined> {
  const [row] = await tx
    .update(reconciliationSessions)
    .set({
      status: 'completed',
      bookClosingBalance: input.bookClosingBalance,
      difference: input.difference,
      reconciledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(reconciliationSessions.id, id), eq(reconciliationSessions.organisationId, organisationId)))
    .returning();
  return row ? toSessionDto(row) : undefined;
}

export async function listMatches(
  tx: Database,
  organisationId: string,
  reconciliationId: string,
): Promise<ReconciliationMatchDto[]> {
  const rows = await tx
    .select()
    .from(reconciliationMatches)
    .where(
      and(
        eq(reconciliationMatches.organisationId, organisationId),
        eq(reconciliationMatches.reconciliationId, reconciliationId),
      ),
    )
    .orderBy(desc(reconciliationMatches.createdAt));
  return rows.map(toMatchDto);
}

export async function insertMatch(
  tx: Database,
  ctx: { organisationId: string; userId: string },
  reconciliationId: string,
  input: CreateReconciliationMatchRequest,
  amounts: { bankAmount: string; bookAmount: string },
): Promise<ReconciliationMatchDto> {
  const percent = input.confidenceScore ?? 100;
  const [row] = await tx
    .insert(reconciliationMatches)
    .values({
      organisationId: ctx.organisationId,
      reconciliationId,
      bankTransactionId: input.bankTransactionId,
      invoiceId: input.bookItemType === 'invoice' ? input.bookItemId : null,
      paymentId: input.bookItemType === 'payment' ? input.bookItemId : null,
      expenseId: input.bookItemType === 'expense' ? input.bookItemId : null,
      matchType: input.matchType ?? 'manual',
      confidenceScore: (percent / 100).toFixed(4),
      bankAmount: amounts.bankAmount,
      bookAmount: amounts.bookAmount,
      difference: roundMoney(decimal(amounts.bankAmount).sub(amounts.bookAmount).abs()),
      status: input.status ?? 'pending',
      notes: input.notes ?? null,
      matchedBy: ctx.userId,
    })
    .returning();
  if (!row) throw new Error('Failed to insert reconciliation match');
  return toMatchDto(row);
}

export async function listAdjustments(
  tx: Database,
  organisationId: string,
  reconciliationId: string,
): Promise<ReconciliationAdjustmentDto[]> {
  const rows = await tx
    .select()
    .from(reconciliationAdjustments)
    .where(
      and(
        eq(reconciliationAdjustments.organisationId, organisationId),
        eq(reconciliationAdjustments.reconciliationId, reconciliationId),
      ),
    )
    .orderBy(reconciliationAdjustments.createdAt);
  return rows.map(toAdjustmentDto);
}

export async function insertAdjustment(
  tx: Database,
  ctx: { organisationId: string; userId: string },
  reconciliationId: string,
  input: CreateReconciliationAdjustmentRequest,
): Promise<ReconciliationAdjustmentDto> {
  const [row] = await tx
    .insert(reconciliationAdjustments)
    .values({
      organisationId: ctx.organisationId,
      userId: ctx.userId,
      reconciliationId,
      adjustmentType: input.adjustmentType,
      description: input.description,
      amount: roundMoney(input.amount),
      affectsBank: input.affectsBank,
      affectsBook: input.affectsBook,
      referenceNumber: input.referenceNumber ?? null,
    })
    .returning();
  if (!row) throw new Error('Failed to insert reconciliation adjustment');
  return toAdjustmentDto(row);
}

export async function listBookEntries(
  tx: Database,
  organisationId: string,
  from: string,
  to: string,
): Promise<BookEntryDto[]> {
  const invoiceRows = await tx
    .select()
    .from(invoices)
    .where(
      and(eq(invoices.organisationId, organisationId), gte(invoices.date, from), lte(invoices.date, to)),
    );
  const expenseRows = await tx
    .select()
    .from(expenses)
    .where(
      and(eq(expenses.organisationId, organisationId), gte(expenses.expenseDate, from), lte(expenses.expenseDate, to)),
    );
  const paymentRows = await tx
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.organisationId, organisationId),
        gte(payments.paymentDate, from),
        lte(payments.paymentDate, to),
        eq(payments.status, 'completed'),
      ),
    );

  const entries: BookEntryDto[] = [
    ...invoiceRows.map((row) =>
      bookEntrySchema.parse({
        id: row.id,
        type: 'invoice' as const,
        date: row.date,
        description: `Invoice ${row.invoiceNumber}`,
        amount: roundMoney(row.total),
        reference: row.invoiceNumber,
      }),
    ),
    ...expenseRows.map((row) =>
      bookEntrySchema.parse({
        id: row.id,
        type: 'expense' as const,
        date: row.expenseDate,
        description: row.description,
        amount: roundMoney(row.amount),
        reference: row.vendorName ?? null,
      }),
    ),
    ...paymentRows.map((row) =>
      bookEntrySchema.parse({
        id: row.id,
        type: 'payment' as const,
        date: row.paymentDate,
        description: `Payment - ${row.paymentMethod}`,
        amount: roundMoney(row.amount),
        reference: row.referenceNumber ?? null,
      }),
    ),
  ];
  return entries.sort((a, b) => a.date.localeCompare(b.date));
}
