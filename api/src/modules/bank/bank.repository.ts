import {
  bankAccountSchema,
  bankTransactionSchema,
  type BankAccountDto,
  type BankTransactionDto,
  type CreateBankAccountRequest,
  type ImportBankTransactionsRequest,
  type UpdateBankAccountRequest,
} from '@ledgercraft/contracts';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { bankAccounts, bankTransactions, transactionImportBatches } from '../../db/schema/bank';
import { roundMoney } from '../invoices/money';

function toAccountDto(row: typeof bankAccounts.$inferSelect): BankAccountDto {
  return bankAccountSchema.parse({
    id: row.id,
    accountName: row.accountName,
    accountNumber: row.accountNumber,
    bankName: row.bankName,
    accountType: row.accountType,
    currency: row.currency,
    openingBalance: roundMoney(row.openingBalance),
    currentBalance: roundMoney(row.currentBalance),
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

function toTxDto(row: typeof bankTransactions.$inferSelect): BankTransactionDto {
  return bankTransactionSchema.parse({
    id: row.id,
    bankAccountId: row.bankAccountId,
    transactionDate: row.transactionDate,
    description: row.description,
    reference: row.reference ?? null,
    amount: roundMoney(row.amount),
    type: row.type,
    balance: row.balance == null ? null : roundMoney(row.balance),
    category: row.category ?? null,
    merchant: row.merchant ?? null,
    isReconciled: row.isReconciled,
    notes: row.notes ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

export async function listAccounts(tx: Database, organisationId: string): Promise<BankAccountDto[]> {
  const rows = await tx
    .select()
    .from(bankAccounts)
    .where(eq(bankAccounts.organisationId, organisationId))
    .orderBy(bankAccounts.accountName);
  return rows.map(toAccountDto);
}

export async function getAccount(
  tx: Database,
  organisationId: string,
  id: string,
): Promise<BankAccountDto | undefined> {
  const [row] = await tx
    .select()
    .from(bankAccounts)
    .where(and(eq(bankAccounts.id, id), eq(bankAccounts.organisationId, organisationId)));
  return row ? toAccountDto(row) : undefined;
}

export async function insertAccount(
  tx: Database,
  ctx: { organisationId: string; userId: string },
  input: CreateBankAccountRequest,
): Promise<BankAccountDto> {
  const opening = roundMoney(input.openingBalance ?? '0');
  const [row] = await tx
    .insert(bankAccounts)
    .values({
      organisationId: ctx.organisationId,
      userId: ctx.userId,
      accountName: input.accountName,
      accountNumber: input.accountNumber,
      bankName: input.bankName,
      accountType: input.accountType,
      currency: input.currency ?? 'NZD',
      openingBalance: opening,
      currentBalance: roundMoney(input.currentBalance ?? opening),
      isActive: input.isActive ?? true,
    })
    .returning();
  if (!row) throw new Error('Failed to insert bank account');
  return toAccountDto(row);
}

export async function updateAccount(
  tx: Database,
  organisationId: string,
  id: string,
  input: UpdateBankAccountRequest,
): Promise<BankAccountDto | undefined> {
  const existing = await getAccount(tx, organisationId, id);
  if (!existing) return undefined;
  const patch: Partial<typeof bankAccounts.$inferInsert> = { updatedAt: new Date() };
  if (input.accountName !== undefined) patch.accountName = input.accountName;
  if (input.accountNumber !== undefined) patch.accountNumber = input.accountNumber;
  if (input.bankName !== undefined) patch.bankName = input.bankName;
  if (input.accountType !== undefined) patch.accountType = input.accountType;
  if (input.currency !== undefined) patch.currency = input.currency;
  if (input.openingBalance !== undefined) patch.openingBalance = roundMoney(input.openingBalance);
  if (input.currentBalance !== undefined) patch.currentBalance = roundMoney(input.currentBalance);
  if (input.isActive !== undefined) patch.isActive = input.isActive;
  const [row] = await tx
    .update(bankAccounts)
    .set(patch)
    .where(and(eq(bankAccounts.id, id), eq(bankAccounts.organisationId, organisationId)))
    .returning();
  return row ? toAccountDto(row) : undefined;
}

export async function deleteAccount(tx: Database, organisationId: string, id: string): Promise<boolean> {
  const deleted = await tx
    .delete(bankAccounts)
    .where(and(eq(bankAccounts.id, id), eq(bankAccounts.organisationId, organisationId)))
    .returning({ id: bankAccounts.id });
  return deleted.length > 0;
}

export async function listTransactions(
  tx: Database,
  organisationId: string,
  filters: { bankAccountId?: string; from?: string; to?: string },
): Promise<BankTransactionDto[]> {
  const rows = await tx
    .select()
    .from(bankTransactions)
    .where(
      and(
        eq(bankTransactions.organisationId, organisationId),
        filters.bankAccountId ? eq(bankTransactions.bankAccountId, filters.bankAccountId) : undefined,
        filters.from ? gte(bankTransactions.transactionDate, filters.from) : undefined,
        filters.to ? lte(bankTransactions.transactionDate, filters.to) : undefined,
      ),
    )
    .orderBy(desc(bankTransactions.transactionDate), desc(bankTransactions.createdAt));
  return rows.map(toTxDto);
}

export async function getTransaction(
  tx: Database,
  organisationId: string,
  id: string,
): Promise<BankTransactionDto | undefined> {
  const [row] = await tx
    .select()
    .from(bankTransactions)
    .where(and(eq(bankTransactions.id, id), eq(bankTransactions.organisationId, organisationId)));
  return row ? toTxDto(row) : undefined;
}

export async function markTransactionReconciled(
  tx: Database,
  organisationId: string,
  id: string,
  isReconciled: boolean,
): Promise<void> {
  await tx
    .update(bankTransactions)
    .set({ isReconciled, updatedAt: new Date() })
    .where(and(eq(bankTransactions.id, id), eq(bankTransactions.organisationId, organisationId)));
}

export async function importTransactions(
  tx: Database,
  ctx: { organisationId: string; userId: string },
  input: ImportBankTransactionsRequest,
): Promise<{ imported: BankTransactionDto[]; duplicatesSkipped: number }> {
  const existing = await listTransactions(tx, ctx.organisationId, { bankAccountId: input.bankAccountId });
  const skip = input.skipDuplicates !== false;
  const imported: BankTransactionDto[] = [];
  let duplicatesSkipped = 0;
  const dates: string[] = [];

  for (const row of input.transactions) {
    const amount = roundMoney(row.amount);
    const isDup =
      skip &&
      existing.some(
        (item) =>
          item.transactionDate === row.transactionDate &&
          item.description === row.description &&
          item.amount === amount,
      );
    if (isDup) {
      duplicatesSkipped += 1;
      continue;
    }
    const [saved] = await tx
      .insert(bankTransactions)
      .values({
        organisationId: ctx.organisationId,
        userId: ctx.userId,
        bankAccountId: input.bankAccountId,
        transactionDate: row.transactionDate,
        description: row.description,
        reference: row.reference ?? null,
        amount,
        type: row.type,
        balance: row.balance == null ? null : roundMoney(row.balance),
        category: row.category ?? null,
        merchant: row.merchant ?? null,
        isReconciled: false,
      })
      .returning();
    if (!saved) throw new Error('Failed to insert bank transaction');
    const dto = toTxDto(saved);
    imported.push(dto);
    existing.push(dto);
    dates.push(row.transactionDate);
  }

  await tx.insert(transactionImportBatches).values({
    organisationId: ctx.organisationId,
    userId: ctx.userId,
    bankAccountId: input.bankAccountId,
    fileName: input.fileName ?? 'import.csv',
    fileType: input.fileType ?? 'csv',
    totalRows: input.transactions.length,
    importedCount: imported.length,
    duplicatesSkipped,
    earliestDate: dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : null,
    latestDate: dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : null,
    status: 'completed',
    completedAt: new Date(),
  });

  return { imported, duplicatesSkipped };
}
