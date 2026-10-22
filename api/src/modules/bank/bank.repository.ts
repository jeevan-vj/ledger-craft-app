import {
  bankAccountSchema,
  bankTransactionSchema,
  bankTransferSchema,
  type BankAccountDto,
  type BankTransactionDto,
  type BankTransferDto,
  type CreateBankTransactionRequest,
  type CreateBankTransferRequest,
  type CreateBankAccountRequest,
  type ImportBankTransactionsRequest,
  type UpdateBankAccountRequest,
  type UpdateBankTransactionRequest,
} from '@ledgercraft/contracts';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { bankAccounts, bankTransactions, bankTransfers, transactionImportBatches } from '../../db/schema/bank';
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

export function toTxDto(row: typeof bankTransactions.$inferSelect): BankTransactionDto {
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
    source: row.source,
    paymentMethod: row.paymentMethod ?? null,
    counterparty: row.counterparty ?? null,
    transferId: row.transferId ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

function toTransferDto(
  row: typeof bankTransfers.$inferSelect,
  sourceTransaction: BankTransactionDto,
  destinationTransaction: BankTransactionDto,
): BankTransferDto {
  return bankTransferSchema.parse({
    id: row.id,
    sourceAccountId: row.sourceAccountId,
    destinationAccountId: row.destinationAccountId,
    transactionDate: row.transactionDate,
    amount: roundMoney(row.amount),
    currency: row.currency,
    destinationCurrency: row.destinationCurrency,
    destinationAmount: row.destinationAmount,
    exchangeRate: row.exchangeRate,
    exchangeRateId: row.exchangeRateId ?? null,
    description: row.description,
    reference: row.reference ?? null,
    sourceTransaction,
    destinationTransaction,
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

export async function setAccountBalance(
  tx: Database,
  organisationId: string,
  id: string,
  currentBalance: string,
): Promise<BankAccountDto | undefined> {
  const [row] = await tx
    .update(bankAccounts)
    .set({ currentBalance: roundMoney(currentBalance), updatedAt: new Date() })
    .where(and(eq(bankAccounts.id, id), eq(bankAccounts.organisationId, organisationId)))
    .returning();
  return row ? toAccountDto(row) : undefined;
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

export async function insertManualTransaction(
  tx: Database,
  ctx: { organisationId: string; userId: string },
  input: CreateBankTransactionRequest,
  balance: string,
): Promise<BankTransactionDto> {
  const [row] = await tx.insert(bankTransactions).values({
    organisationId: ctx.organisationId,
    userId: ctx.userId,
    bankAccountId: input.bankAccountId,
    transactionDate: input.transactionDate,
    description: input.description,
    reference: input.reference ?? null,
    amount: roundMoney(input.amount),
    type: input.type,
    balance: roundMoney(balance),
    category: input.category ?? null,
    merchant: input.counterparty ?? null,
    counterparty: input.counterparty ?? null,
    paymentMethod: input.paymentMethod ?? null,
    notes: input.notes ?? null,
    source: 'manual',
    isReconciled: false,
  }).returning();
  if (!row) throw new Error('Failed to insert bank transaction');
  return toTxDto(row);
}

export async function updateManualTransaction(
  tx: Database,
  organisationId: string,
  id: string,
  input: UpdateBankTransactionRequest,
  balance: string,
): Promise<BankTransactionDto | undefined> {
  const patch: Partial<typeof bankTransactions.$inferInsert> = { balance: roundMoney(balance), updatedAt: new Date() };
  if (input.transactionDate !== undefined) patch.transactionDate = input.transactionDate;
  if (input.description !== undefined) patch.description = input.description;
  if (input.reference !== undefined) patch.reference = input.reference;
  if (input.amount !== undefined) patch.amount = roundMoney(input.amount);
  if (input.type !== undefined) patch.type = input.type;
  if (input.category !== undefined) patch.category = input.category;
  if (input.counterparty !== undefined) { patch.counterparty = input.counterparty; patch.merchant = input.counterparty; }
  if (input.paymentMethod !== undefined) patch.paymentMethod = input.paymentMethod;
  if (input.notes !== undefined) patch.notes = input.notes;
  const [row] = await tx.update(bankTransactions).set(patch).where(and(
    eq(bankTransactions.id, id),
    eq(bankTransactions.organisationId, organisationId),
    eq(bankTransactions.source, 'manual'),
  )).returning();
  return row ? toTxDto(row) : undefined;
}

export async function deleteManualTransaction(tx: Database, organisationId: string, id: string): Promise<boolean> {
  const rows = await tx.delete(bankTransactions).where(and(
    eq(bankTransactions.id, id),
    eq(bankTransactions.organisationId, organisationId),
    eq(bankTransactions.source, 'manual'),
  )).returning({ id: bankTransactions.id });
  return rows.length > 0;
}

export async function insertTransfer(
  tx: Database,
  ctx: { organisationId: string; userId: string },
  input: CreateBankTransferRequest,
  currency: string,
  balances: { source: string; destination: string },
  conversion: { destinationCurrency: string; destinationAmount: string; exchangeRate: string; exchangeRateId: string | null },
): Promise<BankTransferDto> {
  const description = input.description ?? 'Account transfer';
  const [transfer] = await tx.insert(bankTransfers).values({
    organisationId: ctx.organisationId,
    userId: ctx.userId,
    sourceAccountId: input.sourceAccountId,
    destinationAccountId: input.destinationAccountId,
    transactionDate: input.transactionDate,
    amount: roundMoney(input.amount),
    currency,
    destinationCurrency: conversion.destinationCurrency,
    destinationAmount: conversion.destinationAmount,
    exchangeRate: conversion.exchangeRate,
    exchangeRateId: conversion.exchangeRateId,
    description,
    reference: input.reference ?? null,
  }).returning();
  if (!transfer) throw new Error('Failed to insert bank transfer');
  const base = {
    organisationId: ctx.organisationId,
    userId: ctx.userId,
    transactionDate: input.transactionDate,
    description,
    reference: input.reference ?? null,
    amount: roundMoney(input.amount),
    category: 'Transfer',
    merchant: null,
    counterparty: null,
    paymentMethod: 'bank_transfer',
    notes: null,
    source: 'transfer',
    transferId: transfer.id,
    // The two legs reconcile each other inside the same atomic transfer and
    // must not be offered for matching to an invoice, expense, or payment.
    isReconciled: true,
  } as const;
  const [sourceRow] = await tx.insert(bankTransactions).values({
    ...base, bankAccountId: input.sourceAccountId, type: 'debit', balance: roundMoney(balances.source),
  }).returning();
  const [destinationRow] = await tx.insert(bankTransactions).values({
    ...base, amount: conversion.destinationAmount, bankAccountId: input.destinationAccountId, type: 'credit', balance: roundMoney(balances.destination),
  }).returning();
  if (!sourceRow || !destinationRow) throw new Error('Failed to insert transfer transactions');
  return toTransferDto(transfer, toTxDto(sourceRow), toTxDto(destinationRow));
}

export async function getTransfer(
  tx: Database,
  organisationId: string,
  id: string,
): Promise<BankTransferDto | undefined> {
  const [transfer] = await tx.select().from(bankTransfers).where(and(
    eq(bankTransfers.id, id), eq(bankTransfers.organisationId, organisationId),
  ));
  if (!transfer) return undefined;
  const legs = await tx.select().from(bankTransactions).where(and(
    eq(bankTransactions.organisationId, organisationId), eq(bankTransactions.transferId, id),
  ));
  const source = legs.find((row) => row.bankAccountId === transfer.sourceAccountId);
  const destination = legs.find((row) => row.bankAccountId === transfer.destinationAccountId);
  if (!source || !destination) throw new Error('Transfer is missing a transaction leg');
  return toTransferDto(transfer, toTxDto(source), toTxDto(destination));
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
        source: 'import',
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
