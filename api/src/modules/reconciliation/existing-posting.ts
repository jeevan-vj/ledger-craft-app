import { reconciliationMatchSchema, type BankTransactionDto, type CreateReconciliationMatchRequest } from '@ledgercraft/contracts';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client';
import type { OrganisationContext } from '../auth/bind-organisation';
import { decimal } from '../invoices/money';
import { postBalancedEntry, systemAccount } from '../accounting/posting';
import { getActiveAction, insertAction } from './reconciliation-actions.repository';
import { creditRefundBookEntry } from './reconciliation.repository';
import { confirmedMatches, postedCashLines } from './existing-posting.repository';

export async function existingPostingRetry(tx: Database, organisationId: string, input: CreateReconciliationMatchRequest) {
  if (!['payment', 'bill_payment', 'expense', 'credit_refund'].includes(input.bookItemType) || input.status !== 'confirmed') return;
  const matches = await confirmedMatches(tx, organisationId, input);
  const same = matches.find((row) => row.bankTransactionId === input.bankTransactionId
    && (input.bookItemType === 'credit_refund' ? row.journalEntryId : input.bookItemType === 'payment' ? row.paymentId : input.bookItemType === 'bill_payment' ? row.billPaymentId : row.expenseId) === input.bookItemId);
  if (same) return reconciliationMatchSchema.parse({ ...same,
    confidenceScore: Math.round(Number(same.confidenceScore) * 100), matchedAt: same.matchedAt.toISOString(), createdAt: same.createdAt.toISOString(),
  });
  if (matches.length) throw new HTTPException(409, { message: 'Statement row or book entry is already matched' });
}

/** Remove the imported generic P&L duplicate and move the original cash leg to
 * the statement bank. Source payment/expense and its GST remain immutable. */
export async function matchExistingPosting(tx: Database, ctx: OrganisationContext, transaction: BankTransactionDto, input: CreateReconciliationMatchRequest, bookAmount: string) {
  if (input.status !== 'confirmed') return;
  if (input.bookItemType !== 'payment' && input.bookItemType !== 'bill_payment' && input.bookItemType !== 'expense' && input.bookItemType !== 'credit_refund') {
    throw new HTTPException(409, { message: 'Use Accept on an unpaid invoice or bill to record its settlement, or match an already recorded payment or approved expense. Confirming an invoice or bill directly would duplicate its accounting.' });
  }
  if (input.bookItemType === 'credit_refund') {
    const refund = await creditRefundBookEntry(tx, ctx.organisationId, input.bookItemId);
    if (!refund || refund.bankAccountId !== transaction.bankAccountId) throw new HTTPException(400, { message: 'Refund belongs to another bank account or is no longer completed' });
  }
  if (transaction.isReconciled || await getActiveAction(tx, ctx.organisationId, transaction.id)) throw new HTTPException(409, { message: 'Bank transaction is already reconciled' });
  if ((input.bookItemType === 'payment') !== (transaction.type === 'credit')) throw new HTTPException(400, { message: 'Payment/expense direction does not match the bank transaction' });
  if (decimal(transaction.amount).compare(bookAmount) !== 0) throw new HTTPException(400, { message: 'Existing payment or expense must match the full statement amount' });
  const cashLines = await postedCashLines(tx, ctx.organisationId, input.bookItemType, input.bookItemId);
  const cash = cashLines.find((line) => decimal(input.bookItemType === 'payment' ? line.debit : line.credit).compare(bookAmount) === 0);
  if (cashLines.length !== 1 || !cash) throw new HTTPException(409, { message: 'Book entry has no supported posted cash journal' });
  const generic = await systemAccount(tx, ctx, transaction.type === 'credit' ? '4900' : '5000');
  const id = crypto.randomUUID();
  const journalEntryId = await postBalancedEntry(tx, ctx, {
    date: transaction.transactionDate, description: `Match existing ${input.bookItemType}: ${transaction.description}`,
    referenceType: 'bank_reconciliation_accept', referenceId: id,
    lines: transaction.type === 'credit'
      ? [{ accountId: generic, description: transaction.description, debit: transaction.amount, credit: '0' }, { accountId: cash.accountId, description: transaction.description, debit: '0', credit: transaction.amount }]
      : [{ accountId: cash.accountId, description: transaction.description, debit: transaction.amount, credit: '0' }, { accountId: generic, description: transaction.description, debit: '0', credit: transaction.amount }],
  });
  // No action items: undo must reverse only this reclassification, never the
  // pre-existing payment or approved expense.
  await insertAction(tx, ctx, { id, transactionId: transaction.id, actionType: 'accept', journalEntryId });
}
