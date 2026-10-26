import {
  bankAccountListResponseSchema,
  bankTransactionListResponseSchema,
  bankTransferSchema,
  importBankTransactionsResponseSchema,
  type BankAccountDto,
  type BankAccountListResponse,
  type BankTransactionListResponse,
  type BankTransactionDto,
  type BankTransactionDetailsRequest,
  type DuplicateBankTransactionRequest,
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
import { csvCell } from '../../lib/csv';
import { withOrganisationTx } from '../auth/bind-organisation';
import * as repo from './bank.repository';
import * as detailsRepo from './bank-details.repository';
import { decimal, roundMoney } from '../invoices/money';
import {
  assertReplayMatches,
  getIdempotencyRecord,
  insertIdempotencyRecord,
  type IdempotencyScope,
} from '../invoices/idempotency';
import { assertKeyOwned } from '../storage/keys';
import { currencyRepository } from '../currency/currency.service';
import { bankLedgerAccount, postBalancedEntry, reversePosting, systemAccount } from '../accounting/posting';

async function postBankTransaction(
  tx: Database,
  ctx: { organisationId: string; userId: string },
  account: BankAccountDto,
  transaction: BankTransactionDto,
  referenceType = 'bank_transaction',
  referenceId = transaction.id,
) {
  const bankId = await bankLedgerAccount(tx, ctx, account);
  const otherId = await systemAccount(tx, ctx, transaction.type === 'credit' ? '4900' : '5000');
  await postBalancedEntry(tx, ctx, {
    date: transaction.transactionDate, description: transaction.description, referenceType, referenceId,
    lines: transaction.type === 'credit'
      ? [{ accountId: bankId, description: transaction.description, debit: transaction.amount, credit: '0' }, { accountId: otherId, description: transaction.description, debit: '0', credit: transaction.amount }]
      : [{ accountId: otherId, description: transaction.description, debit: transaction.amount, credit: '0' }, { accountId: bankId, description: transaction.description, debit: '0', credit: transaction.amount }],
  });
}

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
      transactions: await Promise.all((await repo.listTransactions(tx, ctx.organisationId, filters))
        .map((transaction) => detailsRepo.hydrateTransaction(tx, ctx.organisationId, transaction))),
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
    return detailsRepo.hydrateTransaction(tx, ctx.organisationId, transaction);
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
    await postBankTransaction(tx, ctx, account, transaction);
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
    if ((input.amount !== undefined || input.type !== undefined) && await detailsRepo.hasDetails(tx, ctx.organisationId, id)) {
      throw new HTTPException(409, { message: 'Remove transaction splits and document connections before changing amount or direction' });
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
    if (input.amount !== undefined || input.type !== undefined || input.transactionDate !== undefined) {
      await reversePosting(tx, ctx, { referenceType: 'bank_transaction', referenceId: id, reversalType: 'bank_transaction_reversal', date: updated.transactionDate, description: `Reverse ${existing.description}` });
      await postBankTransaction(tx, ctx, account, updated);
    }
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
    if (await detailsRepo.hasDetails(tx, ctx.organisationId, id)) {
      throw new HTTPException(409, { message: 'Transactions with splits, document connections, or attachments cannot be deleted' });
    }
    const account = await repo.getAccount(tx, ctx.organisationId, existing.bankAccountId);
    if (!account) throw new HTTPException(409, { message: 'Bank account not found' });
    const balance = reverseAmount(account.currentBalance, existing.type, existing.amount);
    await reversePosting(tx, ctx, { referenceType: 'bank_transaction', referenceId: id, reversalType: 'bank_transaction_reversal', date: new Date().toISOString().slice(0, 10), description: `Reverse ${existing.description}` });
    if (!(await repo.deleteManualTransaction(tx, ctx.organisationId, id))) {
      throw new HTTPException(409, { message: 'Bank transaction could not be deleted' });
    }
    await repo.setAccountBalance(tx, ctx.organisationId, account.id, balance);
  });
}

export async function saveBankTransactionDetailsForUser(
  db: Database,
  userId: string,
  id: string,
  input: BankTransactionDetailsRequest,
): Promise<BankTransactionDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const transaction = await repo.getTransaction(tx, ctx.organisationId, id);
    if (!transaction) throw new HTTPException(404, { message: 'Bank transaction not found' });
    if (transaction.source === 'transfer') throw new HTTPException(409, { message: 'Transfer legs cannot be split or connected to documents' });
    if (await detailsRepo.hasDetails(tx, ctx.organisationId, id)) {
      throw new HTTPException(409, { message: 'Transaction details have already been allocated' });
    }
    const account = await repo.getAccount(tx, ctx.organisationId, transaction.bankAccountId);
    if (!account) throw new HTTPException(409, { message: 'Bank account not found' });
    for (const attachment of input.attachments) assertKeyOwned(attachment.objectKey, ctx.organisationId);

    const splitTotal = input.splits.reduce((sum, split) => sum.add(split.amount), decimal(0));
    if (input.splits.length && splitTotal.compare(transaction.amount) !== 0) {
      throw new HTTPException(400, { message: 'Split amounts must equal the transaction amount exactly' });
    }
    const connectionTotal = input.documentConnections.reduce((sum, connection) => sum.add(connection.amount), decimal(0));
    if (connectionTotal.compare(transaction.amount) > 0) {
      throw new HTTPException(400, { message: 'Document connections cannot exceed the transaction amount' });
    }
    const uniqueDocuments = new Set(input.documentConnections.map((connection) => `${connection.documentType}:${connection.documentId}`));
    if (uniqueDocuments.size !== input.documentConnections.length) {
      throw new HTTPException(400, { message: 'A document can only be connected once per transaction' });
    }

    const documents = [] as Array<{
      input: BankTransactionDetailsRequest['documentConnections'][number];
      document: NonNullable<Awaited<ReturnType<typeof detailsRepo.getDocument>>>;
    }>;
    for (const connection of input.documentConnections) {
      if ((connection.documentType === 'invoice' && transaction.type !== 'credit') ||
          (connection.documentType === 'bill' && transaction.type !== 'debit')) {
        throw new HTTPException(400, { message: 'Income connects to invoices and expenses connect to bills' });
      }
      const document = await detailsRepo.getDocument(tx, ctx.organisationId, connection.documentType, connection.documentId);
      if (!document) throw new HTTPException(404, { message: `${connection.documentType === 'invoice' ? 'Invoice' : 'Bill'} not found` });
      if (document.currency !== account.currency) throw new HTTPException(400, { message: 'Document and bank account currencies must match' });
      if (connection.documentType === 'bill' && document.status !== 'received') {
        throw new HTTPException(409, { message: 'Only received bills can be connected' });
      }
      if (decimal(connection.amount).compare(document.balanceDue) > 0) {
        throw new HTTPException(400, { message: 'Connection exceeds the document balance' });
      }
      documents.push({ input: connection, document });
    }

    await detailsRepo.insertDetails(tx, ctx.organisationId, id, input);
    for (const { input: connection, document } of documents) {
      await detailsRepo.setConnectionDocumentNumber(tx, ctx.organisationId, id, connection.documentType, connection.documentId, document.number);
      await detailsRepo.applyDocumentAllocation(tx, ctx.organisationId, connection.documentType, connection.documentId, {
        totalPaid: roundMoney(decimal(document.totalPaid).add(connection.amount)),
        balanceDue: roundMoney(decimal(document.balanceDue).sub(connection.amount)),
      });
    }
    return detailsRepo.hydrateTransaction(tx, ctx.organisationId, transaction);
  });
}

export async function duplicateBankTransactionForUser(
  db: Database,
  userId: string,
  id: string,
  input: DuplicateBankTransactionRequest,
): Promise<BankTransactionDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const existing = await repo.getTransaction(tx, ctx.organisationId, id);
    if (!existing) throw new HTTPException(404, { message: 'Bank transaction not found' });
    if (existing.source === 'transfer') throw new HTTPException(409, { message: 'Transfer legs cannot be duplicated' });
    const account = await repo.getAccount(tx, ctx.organisationId, existing.bankAccountId);
    if (!account || !account.isActive) throw new HTTPException(409, { message: 'Active bank account not found' });
    const balance = applyAmount(account.currentBalance, existing.type, existing.amount);
    const duplicate = await repo.insertManualTransaction(tx, ctx, {
      bankAccountId: existing.bankAccountId,
      transactionDate: input.transactionDate ?? existing.transactionDate,
      description: `${existing.description} (copy)`,
      reference: existing.reference,
      amount: existing.amount,
      type: existing.type,
      category: existing.category,
      counterparty: existing.counterparty,
      paymentMethod: existing.paymentMethod,
      notes: existing.notes,
    }, balance);
    await repo.setAccountBalance(tx, ctx.organisationId, account.id, balance);
    return duplicate;
  });
}

export async function exportBankTransactionsCsvForUser(db: Database, userId: string, bankAccountId?: string): Promise<string> {
  const result = await listBankTransactionsForUser(db, userId, { bankAccountId });
  const header = ['Date', 'Description', 'Counterparty', 'Reference', 'Direction', 'Amount', 'Category', 'Source', 'Reconciled'];
  return [header.join(','), ...result.transactions.map((transaction) => [
    transaction.transactionDate, transaction.description, transaction.counterparty, transaction.reference,
    transaction.type, transaction.amount, transaction.category, transaction.source, transaction.isReconciled ? 'yes' : 'no',
  ].map(csvCell).join(','))].join('\n');
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
    const localization = await currencyRepository.getLocalization(tx, ctx.organisationId);
    const sourceDefinition = await currencyRepository.getCurrency(tx, ctx.organisationId, source.currency);
    const destinationDefinition = await currencyRepository.getCurrency(tx, ctx.organisationId, destination.currency);
    if (!sourceDefinition?.enabled || !destinationDefinition?.enabled) throw new HTTPException(400, { message: 'Both account currencies must be enabled' });
    const sourceAmount = decimal(input.amount).toFixed(sourceDefinition.precision);
    let destinationAmount = sourceAmount;
    let exchangeRate = '1';
    let exchangeRateId: string | null = null;
    if (source.currency !== destination.currency) {
      if (!input.exchangeRateId) throw new HTTPException(400, { message: 'Cross-currency transfers require an explicit persisted exchange rate' });
      const rate = await currencyRepository.getRateById(tx, ctx.organisationId, input.exchangeRateId);
      if (!rate || rate.effectiveDate > input.transactionDate) throw new HTTPException(400, { message: 'Exchange rate is missing or dated after the transfer' });
      if (source.currency === localization.baseCurrency && rate.currencyCode === destination.currency && rate.baseCurrency === source.currency) {
        destinationAmount = decimal(sourceAmount).div(rate.rate).toFixed(destinationDefinition.precision);
      } else if (destination.currency === localization.baseCurrency && rate.currencyCode === source.currency && rate.baseCurrency === destination.currency) {
        destinationAmount = decimal(sourceAmount).mul(rate.rate).toFixed(destinationDefinition.precision);
      } else {
        throw new HTTPException(400, { message: 'The selected rate must connect one transfer account to the organisation base currency' });
      }
      exchangeRate = rate.rate; exchangeRateId = rate.id;
    }
    const balances = {
      source: decimal(source.currentBalance).sub(sourceAmount).toFixed(sourceDefinition.precision),
      destination: decimal(destination.currentBalance).add(destinationAmount).toFixed(destinationDefinition.precision),
    };
    const transfer = await repo.insertTransfer(tx, ctx, { ...input, amount: sourceAmount }, source.currency, balances, {
      destinationCurrency: destination.currency, destinationAmount, exchangeRate, exchangeRateId,
    });
    await repo.setAccountBalance(tx, ctx.organisationId, source.id, balances.source);
    await repo.setAccountBalance(tx, ctx.organisationId, destination.id, balances.destination);
    if (exchangeRateId) await currencyRepository.recordRateUsage(tx, ctx.organisationId, exchangeRateId, 'transfer', transfer.id);
    const sourceLedger = await bankLedgerAccount(tx, ctx, source);
    const destinationLedger = await bankLedgerAccount(tx, ctx, destination);
    const postedAmount = source.currency === localization.baseCurrency
      ? sourceAmount
      : destination.currency === localization.baseCurrency
        ? destinationAmount
        : sourceAmount;
    await postBalancedEntry(tx, ctx, {
      date: transfer.transactionDate, description: transfer.description, referenceType: 'bank_transfer', referenceId: transfer.id,
      lines: [
        { accountId: destinationLedger, description: transfer.description, debit: postedAmount, credit: '0' },
        { accountId: sourceLedger, description: transfer.description, debit: '0', credit: postedAmount },
      ],
    });
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
    for (const transaction of result.imported) await postBankTransaction(tx, ctx, account, transaction);
    return importBankTransactionsResponseSchema.parse({
      importedCount: result.imported.length,
      duplicatesSkipped: result.duplicatesSkipped,
      transactions: result.imported,
    });
  });
}
