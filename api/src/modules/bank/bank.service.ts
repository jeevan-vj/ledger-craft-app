import {
  bankAccountListResponseSchema,
  bankTransactionListResponseSchema,
  bankTransferSchema,
  importBankTransactionsResponseSchema,
  type BankAccountDto,
  type BankAccountListResponse,
  type BankTransactionListResponse,
  type BankTransactionDto,
  type BankTransferDto,
  type CreateBankTransactionRequest,
  type CreateBankTransferRequest,
  type CreateBankAccountRequest,
  type ImportBankTransactionsRequest,
  type ImportBankTransactionsResponse,
  type UpdateBankAccountRequest,
  type UpdateBankTransactionRequest,
} from '@ledgercraft/contracts';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client';
import { withOrganisationTx } from '../auth/bind-organisation';
import * as repo from './bank.repository';
import { decimal, roundMoney } from '../invoices/money';
import {
  assertReplayMatches,
  getIdempotencyRecord,
  insertIdempotencyRecord,
  type IdempotencyScope,
} from '../invoices/idempotency';

function applyAmount(balance: string, type: 'debit' | 'credit', amount: string) {
  return roundMoney(type === 'credit' ? decimal(balance).add(amount) : decimal(balance).sub(amount));
}

function reverseAmount(balance: string, type: 'debit' | 'credit', amount: string) {
  return roundMoney(type === 'credit' ? decimal(balance).sub(amount) : decimal(balance).add(amount));
}

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

export async function getBankTransactionForUser(
  db: Database,
  userId: string,
  id: string,
): Promise<BankTransactionDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const transaction = await repo.getTransaction(tx, ctx.organisationId, id);
    if (!transaction) throw new HTTPException(404, { message: 'Bank transaction not found' });
    return transaction;
  });
}

export async function createBankTransactionForUser(
  db: Database,
  userId: string,
  input: CreateBankTransactionRequest,
): Promise<BankTransactionDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const account = await repo.getAccount(tx, ctx.organisationId, input.bankAccountId);
    if (!account || !account.isActive) throw new HTTPException(400, { message: 'Active bank account not found' });
    const balance = applyAmount(account.currentBalance, input.type, input.amount);
    const transaction = await repo.insertManualTransaction(tx, ctx, input, balance);
    await repo.setAccountBalance(tx, ctx.organisationId, account.id, balance);
    return transaction;
  });
}

export async function updateBankTransactionForUser(
  db: Database,
  userId: string,
  id: string,
  input: UpdateBankTransactionRequest,
): Promise<BankTransactionDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const existing = await repo.getTransaction(tx, ctx.organisationId, id);
    if (!existing) throw new HTTPException(404, { message: 'Bank transaction not found' });
    if (existing.source !== 'manual' || existing.isReconciled) {
      throw new HTTPException(409, { message: 'Only unreconciled manual transactions can be edited' });
    }
    const account = await repo.getAccount(tx, ctx.organisationId, existing.bankAccountId);
    if (!account) throw new HTTPException(409, { message: 'Bank account not found' });
    const withoutExisting = reverseAmount(account.currentBalance, existing.type, existing.amount);
    const type = input.type ?? existing.type;
    const amount = input.amount ?? existing.amount;
    const balance = applyAmount(withoutExisting, type, amount);
    const updated = await repo.updateManualTransaction(tx, ctx.organisationId, id, input, balance);
    if (!updated) throw new HTTPException(409, { message: 'Bank transaction could not be updated' });
    await repo.setAccountBalance(tx, ctx.organisationId, account.id, balance);
    return updated;
  });
}

export async function deleteBankTransactionForUser(db: Database, userId: string, id: string): Promise<void> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const existing = await repo.getTransaction(tx, ctx.organisationId, id);
    if (!existing) throw new HTTPException(404, { message: 'Bank transaction not found' });
    if (existing.source !== 'manual' || existing.isReconciled) {
      throw new HTTPException(409, { message: 'Only unreconciled manual transactions can be deleted' });
    }
    const account = await repo.getAccount(tx, ctx.organisationId, existing.bankAccountId);
    if (!account) throw new HTTPException(409, { message: 'Bank account not found' });
    const balance = reverseAmount(account.currentBalance, existing.type, existing.amount);
    if (!(await repo.deleteManualTransaction(tx, ctx.organisationId, id))) {
      throw new HTTPException(409, { message: 'Bank transaction could not be deleted' });
    }
    await repo.setAccountBalance(tx, ctx.organisationId, account.id, balance);
  });
}

export async function createBankTransferForUser(
  db: Database,
  userId: string,
  input: CreateBankTransferRequest,
  idempotency?: IdempotencyScope,
): Promise<BankTransferDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    if (idempotency) {
      const existing = await getIdempotencyRecord(tx, ctx, idempotency);
      if (existing) {
        assertReplayMatches(existing.requestHash, idempotency.requestHash);
        return bankTransferSchema.parse(existing.responseBody);
      }
    }
    if (input.sourceAccountId === input.destinationAccountId) {
      throw new HTTPException(400, { message: 'Source and destination accounts must be different' });
    }
    const [source, destination] = await Promise.all([
      repo.getAccount(tx, ctx.organisationId, input.sourceAccountId),
      repo.getAccount(tx, ctx.organisationId, input.destinationAccountId),
    ]);
    if (!source || !destination || !source.isActive || !destination.isActive) {
      throw new HTTPException(400, { message: 'Active source and destination accounts are required' });
    }
    if (source.currency !== destination.currency) {
      throw new HTTPException(400, { message: 'Cross-currency transfers require an explicit exchange-rate workflow' });
    }
    const balances = {
      source: applyAmount(source.currentBalance, 'debit', input.amount),
      destination: applyAmount(destination.currentBalance, 'credit', input.amount),
    };
    const transfer = await repo.insertTransfer(tx, ctx, input, source.currency, balances);
    await repo.setAccountBalance(tx, ctx.organisationId, source.id, balances.source);
    await repo.setAccountBalance(tx, ctx.organisationId, destination.id, balances.destination);
    if (idempotency) await insertIdempotencyRecord(tx, ctx, idempotency, { status: 201, body: transfer });
    return transfer;
  });
}

export async function getBankTransferForUser(db: Database, userId: string, id: string): Promise<BankTransferDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const transfer = await repo.getTransfer(tx, ctx.organisationId, id);
    if (!transfer) throw new HTTPException(404, { message: 'Bank transfer not found' });
    return transfer;
  });
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
