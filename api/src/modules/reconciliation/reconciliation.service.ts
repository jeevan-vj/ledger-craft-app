import {
  bookEntryListResponseSchema,
  type BookEntryDto,
  type CreateReconciliationAdjustmentRequest,
  type CreateReconciliationMatchRequest,
  type CreateReconciliationSessionRequest,
  type ReconciliationAdjustmentDto,
  type ReconciliationMatchDto,
  type ReconciliationSessionDto,
} from '@ledgercraft/contracts';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client';
import { apiError } from '../../http-error';
import { withOrganisationTx } from '../auth/bind-organisation';
import * as bankRepo from '../bank/bank.repository';
import { reconciliationSummaryInTx } from './reconciliation-summary';
import * as expensesRepo from '../expenses/expenses.repository';
import * as invoicesRepo from '../invoices/invoices.repository';
import * as paymentsRepo from '../payments/payments.repository';
import * as purchasesRepo from '../purchases/purchases.repository';
import * as repo from './reconciliation.repository';
import { assertSupportedStatementBank } from '../currency/currency.service';
import { existingPostingRetry, matchExistingPosting } from './existing-posting';
import { bankLedgerBalance } from './existing-posting.repository';
import { decimal } from '../invoices/money';

async function bookAmount(
  tx: Parameters<typeof invoicesRepo.getInvoice>[0],
  organisationId: string,
  type: 'invoice' | 'bill' | 'payment' | 'bill_payment' | 'expense',
  id: string,
): Promise<string> {
  if (type === 'bill_payment') {
    const amount = await repo.supplierPaymentAmount(tx, organisationId, id);
    if (amount === undefined) throw new HTTPException(400, { message: 'Completed supplier payment not found' });
    return amount;
  }
  if (type === 'invoice') {
    const invoice = await invoicesRepo.getInvoice(tx, organisationId, id);
    if (!invoice) throw new HTTPException(400, { message: 'Invoice not found' });
    return invoice.total;
  }
  if (type === 'expense') {
    const expense = await expensesRepo.getExpense(tx, organisationId, id);
    if (!expense) throw new HTTPException(400, { message: 'Expense not found' });
    return expense.amount;
  }
  if (type === 'bill') {
    const bill = await purchasesRepo.getBill(tx, organisationId, id);
    if (!bill) throw new HTTPException(400, { message: 'Bill not found' });
    return bill.total;
  }
  const payment = await paymentsRepo.getPayment(tx, organisationId, id);
  if (!payment) throw new HTTPException(400, { message: 'Payment not found' });
  return payment.baseAmount ?? payment.amount;
}

export async function listSessionsForUser(
  db: Database,
  userId: string,
  bankAccountId?: string,
): Promise<{ sessions: ReconciliationSessionDto[] }> {
  return withOrganisationTx(db, userId, async (tx, ctx) => ({
    sessions: await repo.listSessions(tx, ctx.organisationId, bankAccountId),
  }));
}

export async function getSessionForUser(
  db: Database,
  userId: string,
  id: string,
): Promise<ReconciliationSessionDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const session = await repo.getSession(tx, ctx.organisationId, id);
    if (!session) throw new HTTPException(404, { message: 'Reconciliation session not found' });
    return session;
  });
}

export async function createSessionForUser(
  db: Database,
  userId: string,
  input: CreateReconciliationSessionRequest,
): Promise<ReconciliationSessionDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const account = await bankRepo.getAccount(tx, ctx.organisationId, input.bankAccountId);
    if (!account) throw new HTTPException(400, { message: 'Bank account not found' });
    await assertSupportedStatementBank(tx, ctx.organisationId, account.currency);
    const previous = await repo.lastCompletedBookBalance(
      tx,
      ctx.organisationId,
      input.bankAccountId,
      input.statementStartDate,
    );
    const opening = await bankLedgerBalance(tx, ctx.organisationId, account.id, input.statementStartDate, true);
    return repo.insertSession(tx, ctx, input, opening.hasEntries ? opening.balance : previous ?? account.openingBalance);
  });
}

export async function listBookEntriesForUser(
  db: Database,
  userId: string,
  from: string,
  to: string,
): Promise<{ entries: BookEntryDto[] }> {
  return withOrganisationTx(db, userId, async (tx, ctx) =>
    bookEntryListResponseSchema.parse({
      entries: await repo.listBookEntries(tx, ctx.organisationId, from, to),
    }),
  );
}

export async function createMatchForUser(
  db: Database,
  userId: string,
  sessionId: string,
  input: CreateReconciliationMatchRequest,
): Promise<ReconciliationMatchDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const session = await repo.getSession(tx, ctx.organisationId, sessionId);
    if (!session) throw new HTTPException(404, { message: 'Reconciliation session not found' });
    const retry = await existingPostingRetry(tx, ctx.organisationId, input);
    if (retry) return retry;
    if (session.status !== 'in_progress') throw new HTTPException(409, { message: 'Completed reconciliation cannot be changed' });
    const bankTx = await bankRepo.getTransaction(tx, ctx.organisationId, input.bankTransactionId);
    if (!bankTx) throw new HTTPException(400, { message: 'Bank transaction not found' });
    if (bankTx.bankAccountId !== session.bankAccountId) throw new HTTPException(400, { message: 'Bank transaction belongs to another bank account' });
    const account = await bankRepo.getAccount(tx, ctx.organisationId, bankTx.bankAccountId);
    if (!account) throw new HTTPException(409, { message: 'Bank account not found' });
    await assertSupportedStatementBank(tx, ctx.organisationId, account.currency);
    const book = await bookAmount(tx, ctx.organisationId, input.bookItemType, input.bookItemId);
    await matchExistingPosting(tx, ctx, bankTx, input, book);
    const match = await repo.insertMatch(tx, ctx, sessionId, input, {
      bankAmount: bankTx.amount,
      bookAmount: book,
    });
    if ((input.status ?? 'pending') === 'confirmed') {
      await bankRepo.markTransactionReconciled(tx, ctx.organisationId, bankTx.id, true);
    }
    return match;
  });
}

export async function confirmMatchesForUser(
  db: Database,
  userId: string,
  sessionId: string,
  matches: CreateReconciliationMatchRequest[],
): Promise<{ matches: ReconciliationMatchDto[] }> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const session = await repo.getSession(tx, ctx.organisationId, sessionId);
    if (!session) throw new HTTPException(404, { message: 'Reconciliation session not found' });
    const saved: ReconciliationMatchDto[] = [];
    if (session.status !== 'in_progress') throw new HTTPException(409, { message: 'Completed reconciliation cannot be changed' });
    for (const input of matches) {
      const confirmed = { ...input, status: input.status ?? 'confirmed' };
      const retry = await existingPostingRetry(tx, ctx.organisationId, confirmed);
      if (retry) { saved.push(retry); continue; }
      const bankTx = await bankRepo.getTransaction(tx, ctx.organisationId, input.bankTransactionId);
      if (!bankTx) throw new HTTPException(400, { message: 'Bank transaction not found' });
      if (bankTx.bankAccountId !== session.bankAccountId) throw new HTTPException(400, { message: 'Bank transaction belongs to another bank account' });
      const account = await bankRepo.getAccount(tx, ctx.organisationId, bankTx.bankAccountId);
      if (!account) throw new HTTPException(409, { message: 'Bank account not found' });
      await assertSupportedStatementBank(tx, ctx.organisationId, account.currency);
      const book = await bookAmount(tx, ctx.organisationId, input.bookItemType, input.bookItemId);
      await matchExistingPosting(tx, ctx, bankTx, confirmed, book);
      const match = await repo.insertMatch(tx, ctx, sessionId, { ...input, status: input.status ?? 'confirmed' }, {
        bankAmount: bankTx.amount,
        bookAmount: book,
      });
      await bankRepo.markTransactionReconciled(tx, ctx.organisationId, bankTx.id, true);
      saved.push(match);
    }
    return { matches: saved };
  });
}

export async function createAdjustmentForUser(
  db: Database,
  userId: string,
  sessionId: string,
  input: CreateReconciliationAdjustmentRequest,
): Promise<ReconciliationAdjustmentDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const session = await repo.getSession(tx, ctx.organisationId, sessionId);
    if (!session) throw new HTTPException(404, { message: 'Reconciliation session not found' });
    if (session.status !== 'in_progress') throw apiError(409, 'BANK_STATEMENT_CLOSED', 'Completed or locked statements cannot be changed');
    if (!['deposit_in_transit', 'outstanding_check', 'bank_error'].includes(input.adjustmentType) || input.affectsBook || !input.affectsBank) {
      throw apiError(422, 'BOOK_POSTING_REQUIRED', 'Record bank fees, interest and book corrections as actual bank transactions or posted journals first. This form records bank-side timing differences and bank errors only.');
    }
    if (!/^-?\d+(?:\.\d{1,2})?$/.test(input.amount) || decimal(input.amount).compare(0) === 0 || (input.adjustmentType !== 'bank_error' && decimal(input.amount).compare(0) < 0)) {
      throw apiError(422, 'INVALID_ADJUSTMENT_AMOUNT', 'Use a non-zero amount with at most two decimal places; timing items must be positive.');
    }
    return repo.insertAdjustment(tx, ctx, sessionId, input);
  });
}

export async function listAdjustmentsForUser(
  db: Database,
  userId: string,
  sessionId: string,
): Promise<{ adjustments: ReconciliationAdjustmentDto[] }> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const session = await repo.getSession(tx, ctx.organisationId, sessionId);
    if (!session) throw new HTTPException(404, { message: 'Reconciliation session not found' });
    return { adjustments: await repo.listAdjustments(tx, ctx.organisationId, sessionId) };
  });
}

export async function completeSessionForUser(
  db: Database,
  userId: string,
  sessionId: string,
): Promise<ReconciliationSessionDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const session = await repo.getSession(tx, ctx.organisationId, sessionId);
    if (!session) throw new HTTPException(404, { message: 'Reconciliation session not found' });
    if (session.status === 'completed') return session;
    if (session.status === 'locked') throw new HTTPException(409, { message: 'Reconciliation is locked' });
    const summary = await reconciliationSummaryInTx(tx, ctx.organisationId, session);
    if (!summary.isReconciled) throw apiError(400, 'RECONCILIATION_UNBALANCED', 'Reconciliation still has a difference');
    const completed = await repo.completeSession(tx, ctx.organisationId, sessionId, {
      bookClosingBalance: summary.adjustedBookBalance,
      difference: '0.00',
    });
    if (!completed) throw new HTTPException(404, { message: 'Reconciliation session not found' });
    await bankRepo.updateAccount(tx, ctx.organisationId, session.bankAccountId, {
      currentBalance: summary.adjustedBankBalance,
    });
    return completed;
  });
}

export async function summaryForUser(db: Database, userId: string, sessionId: string) {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const session = await repo.getSession(tx, ctx.organisationId, sessionId);
    if (!session) throw new HTTPException(404, { message: 'Reconciliation session not found' });
    return reconciliationSummaryInTx(tx, ctx.organisationId, session);
  });
}
