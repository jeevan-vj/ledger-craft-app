import {
  bankAccountListResponseSchema,
  bankTransactionListResponseSchema,
  importBankTransactionsResponseSchema,
  type BankAccountDto,
  type BankAccountListResponse,
  type BankTransactionListResponse,
  type CreateBankAccountRequest,
  type ImportBankTransactionsRequest,
  type ImportBankTransactionsResponse,
  type UpdateBankAccountRequest,
} from '@ledgercraft/contracts';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client';
import { withOrganisationTx } from '../auth/bind-organisation';
import * as repo from './bank.repository';

export async function listBankAccountsForUser(
  db: Database,
  userId: string,
): Promise<BankAccountListResponse> {
  return withOrganisationTx(db, userId, async (tx, ctx) =>
    bankAccountListResponseSchema.parse({ bankAccounts: await repo.listAccounts(tx, ctx.organisationId) }),
  );
}

export async function getBankAccountForUser(
  db: Database,
  userId: string,
  id: string,
): Promise<BankAccountDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const account = await repo.getAccount(tx, ctx.organisationId, id);
    if (!account) throw new HTTPException(404, { message: 'Bank account not found' });
    return account;
  });
}

export async function createBankAccountForUser(
  db: Database,
  userId: string,
  input: CreateBankAccountRequest,
): Promise<BankAccountDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => repo.insertAccount(tx, ctx, input));
}

export async function updateBankAccountForUser(
  db: Database,
  userId: string,
  id: string,
  input: UpdateBankAccountRequest,
): Promise<BankAccountDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const account = await repo.updateAccount(tx, ctx.organisationId, id, input);
    if (!account) throw new HTTPException(404, { message: 'Bank account not found' });
    return account;
  });
}

export async function deleteBankAccountForUser(db: Database, userId: string, id: string): Promise<void> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const deleted = await repo.deleteAccount(tx, ctx.organisationId, id);
    if (!deleted) throw new HTTPException(404, { message: 'Bank account not found' });
  });
}

export async function listBankTransactionsForUser(
  db: Database,
  userId: string,
  filters: { bankAccountId?: string; from?: string; to?: string },
): Promise<BankTransactionListResponse> {
  return withOrganisationTx(db, userId, async (tx, ctx) =>
    bankTransactionListResponseSchema.parse({
      transactions: await repo.listTransactions(tx, ctx.organisationId, filters),
    }),
  );
}

export async function importBankTransactionsForUser(
  db: Database,
  userId: string,
  input: ImportBankTransactionsRequest,
): Promise<ImportBankTransactionsResponse> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const account = await repo.getAccount(tx, ctx.organisationId, input.bankAccountId);
    if (!account) throw new HTTPException(400, { message: 'Bank account not found' });
    const result = await repo.importTransactions(tx, ctx, input);
    return importBankTransactionsResponseSchema.parse({
      importedCount: result.imported.length,
      duplicatesSkipped: result.duplicatesSkipped,
      transactions: result.imported,
    });
  });
}
