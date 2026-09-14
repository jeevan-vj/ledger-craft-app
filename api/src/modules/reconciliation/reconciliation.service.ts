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
import { moneyToCents, decimal, roundMoney } from '../invoices/money';
import * as expensesRepo from '../expenses/expenses.repository';
import * as invoicesRepo from '../invoices/invoices.repository';
import * as paymentsRepo from '../payments/payments.repository';
import * as repo from './reconciliation.repository';

async function bookAmount(
  tx: Parameters<typeof invoicesRepo.getInvoice>[0],
  organisationId: string,
  type: 'invoice' | 'payment' | 'expense',
  id: string,
): Promise<string> {
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
  const payment = await paymentsRepo.getPayment(tx, organisationId, id);
  if (!payment) throw new HTTPException(400, { message: 'Payment not found' });
  return payment.amount;
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
    const previous = await repo.lastCompletedBookBalance(
      tx,
      ctx.organisationId,
      input.bankAccountId,
      input.statementStartDate,
    );
    return repo.insertSession(tx, ctx, input, previous ?? account.openingBalance);
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
    const bankTx = await bankRepo.getTransaction(tx, ctx.organisationId, input.bankTransactionId);
    if (!bankTx) throw new HTTPException(400, { message: 'Bank transaction not found' });
    const book = await bookAmount(tx, ctx.organisationId, input.bookItemType, input.bookItemId);
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
    for (const input of matches) {
      const bankTx = await bankRepo.getTransaction(tx, ctx.organisationId, input.bankTransactionId);
      if (!bankTx) throw new HTTPException(400, { message: 'Bank transaction not found' });
      const book = await bookAmount(tx, ctx.organisationId, input.bookItemType, input.bookItemId);
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
    const adjustments = await repo.listAdjustments(tx, ctx.organisationId, sessionId);
    const deposits = adjustments
      .filter((row) => row.adjustmentType === 'deposit_in_transit')
      .reduce((sum, row) => sum.add(row.amount), decimal(0));
    const checks = adjustments
      .filter((row) => row.adjustmentType === 'outstanding_check')
      .reduce((sum, row) => sum.add(row.amount), decimal(0));
    const other = adjustments
      .filter((row) => row.adjustmentType !== 'deposit_in_transit' && row.adjustmentType !== 'outstanding_check')
      .reduce((sum, row) => {
        if (row.affectsBank) return sum.add(row.amount);
        if (row.affectsBook) return sum.sub(row.amount);
        return sum;
      }, decimal(0));
    const adjustedBank = decimal(session.statementClosingBalance).add(deposits).sub(checks);
    const adjustedBook = decimal(session.bookClosingBalance ?? '0').add(other);
    const difference = roundMoney(adjustedBank.sub(adjustedBook));
    if (moneyToCents(difference) !== 0n) {
      throw apiError(400, 'RECONCILIATION_UNBALANCED', 'Reconciliation still has a difference');
    }
    const completed = await repo.completeSession(tx, ctx.organisationId, sessionId, {
      bookClosingBalance: roundMoney(adjustedBook),
      difference: '0.00',
    });
    if (!completed) throw new HTTPException(404, { message: 'Reconciliation session not found' });
    await bankRepo.updateAccount(tx, ctx.organisationId, session.bankAccountId, {
      currentBalance: roundMoney(adjustedBank),
    });
    return completed;
  });
}
