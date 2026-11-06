import type {
  AcceptBankTransactionSuggestionRequest,
  BankReconciliationActionDto,
  MarkBankTransactionPersonalRequest,
  UndoBankTransactionReconciliationRequest,
} from '@ledgercraft/contracts';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client';
import { accounts } from '../../db/schema/accounts';
import { and, eq } from 'drizzle-orm';
import { postBalancedEntry, reversePosting, systemAccount, type PostingLine } from '../accounting/posting';
import { withOrganisationTx } from '../auth/bind-organisation';
import * as detailsRepo from '../bank/bank-details.repository';
import * as bankRepo from '../bank/bank.repository';
import { decimal } from '../invoices/money';
import * as paymentsService from '../payments/payments.service';
import * as purchasesService from '../purchases/purchases.service';
import * as actionRepo from './reconciliation-actions.repository';
import { assertSupportedStatementBank } from '../currency/currency.service';
import { hasCompletedStatement, rejectTransactionMatches } from './existing-posting.repository';

async function requireTargetAccount(tx: Database, organisationId: string, id: string) {
  const [account] = await tx.select().from(accounts).where(and(eq(accounts.organisationId, organisationId), eq(accounts.id, id)));
  if (!account) throw new HTTPException(400, { message: 'Split account not found' });
  return account;
}

function validateDirection(type: 'debit' | 'credit', documentType: 'invoice' | 'bill') {
  if ((type === 'credit' && documentType !== 'invoice') || (type === 'debit' && documentType !== 'bill')) {
    throw new HTTPException(400, { message: 'Money in connects to invoices and money out connects to bills' });
  }
}

export async function acceptSuggestionForUser(
  db: Database,
  userId: string,
  transactionId: string,
  input: AcceptBankTransactionSuggestionRequest,
): Promise<BankReconciliationActionDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const transaction = await bankRepo.getTransaction(tx, ctx.organisationId, transactionId);
    if (!transaction) throw new HTTPException(404, { message: 'Bank transaction not found' });
    if (transaction.isReconciled || await actionRepo.getActiveAction(tx, ctx.organisationId, transactionId)) {
      throw new HTTPException(409, { message: 'Bank transaction is already reconciled' });
    }
    if (transaction.source === 'transfer') throw new HTTPException(409, { message: 'Transfer legs are already reconciled' });
    if (await detailsRepo.hasAllocations(tx, ctx.organisationId, transactionId)) {
      throw new HTTPException(409, { message: 'Transaction allocations already exist' });
    }
    if (input.bankFee && transaction.type !== 'debit') throw new HTTPException(400, { message: 'Bank fees can only be added to money-out transactions' });
    if (input.bankFee && decimal(input.bankFee).compare(decimal(transaction.amount).mul('0.10')) > 0) {
      throw new HTTPException(400, { message: 'Bank fee adjustments cannot exceed 10% of the bank transaction' });
    }

    const total = [...input.allocations, ...input.splits].reduce((sum, item) => sum.add(item.amount), decimal(input.bankFee ?? '0'));
    if (total.compare(transaction.amount) > 0) throw new HTTPException(400, { message: 'Allocations cannot exceed the bank transaction amount' });
    if (total.compare(transaction.amount) !== 0) throw new HTTPException(400, { message: 'Allocate the full bank transaction amount or add a remainder split' });
    const unique = new Set(input.allocations.map((allocation) => `${allocation.documentType}:${allocation.documentId}`));
    if (unique.size !== input.allocations.length) throw new HTTPException(400, { message: 'A document can only be allocated once' });

    const account = await bankRepo.getAccount(tx, ctx.organisationId, transaction.bankAccountId);
    if (!account) throw new HTTPException(409, { message: 'Bank account not found' });
    await assertSupportedStatementBank(tx, ctx.organisationId, account.currency);
    const paymentDate = input.paymentDate ?? transaction.transactionDate;
    const paymentItems: Array<{ documentType: 'invoice' | 'bill'; documentId: string; paymentId: string | null; billPaymentId: string | null; amount: string }> = [];
    const targetLines: PostingLine[] = [];
    const connections: Array<{ documentType: 'invoice' | 'bill'; documentId: string; amount: string }> = [];
    const receivable = transaction.type === 'credit' ? await systemAccount(tx, ctx, '1200') : null;
    const payable = transaction.type === 'debit' ? await systemAccount(tx, ctx, '2100') : null;

    for (const allocation of input.allocations) {
      validateDirection(transaction.type, allocation.documentType);
      const document = await detailsRepo.getDocument(tx, ctx.organisationId, allocation.documentType, allocation.documentId);
      if (!document) throw new HTTPException(404, { message: `${allocation.documentType === 'invoice' ? 'Invoice' : 'Bill'} not found` });
      if (document.currency !== account.currency) throw new HTTPException(400, { message: 'Document and bank account currencies must match' });
      if (decimal(allocation.amount).compare(document.balanceDue) > 0) throw new HTTPException(400, { message: 'Allocation exceeds the document balance' });
      if (allocation.documentType === 'invoice') {
        if (document.status === 'draft' || document.status === 'cancelled') throw new HTTPException(409, { message: 'Only open issued invoices can be reconciled' });
        const payment = await paymentsService.createPaymentInTx(tx, ctx, {
          invoiceId: allocation.documentId,
          paymentMethod: 'bank_transfer',
          amount: allocation.amount,
          paymentDate,
          referenceNumber: input.reference ?? transaction.reference,
          notes: input.notes ?? `Bank reconciliation ${transaction.id}`,
        }, undefined, { skipPosting: true });
        paymentItems.push({ ...allocation, paymentId: payment.id, billPaymentId: null });
        targetLines.push({ accountId: receivable!, description: `Invoice ${document.number}`, debit: '0', credit: allocation.amount });
      } else {
        if (document.status !== 'received') throw new HTTPException(409, { message: 'Only received bills can be reconciled' });
        const result = await purchasesService.recordBillPaymentInTx(tx, ctx, allocation.documentId, {
          bankAccountId: account.id,
          amount: allocation.amount,
          paymentDate,
          referenceNumber: input.reference ?? transaction.reference,
          notes: input.notes ?? `Bank reconciliation ${transaction.id}`,
        }, { skipPosting: true });
        const payment = result.payments[0];
        if (!payment) throw new Error('Bill payment was not created');
        paymentItems.push({ ...allocation, paymentId: null, billPaymentId: payment.id });
        targetLines.push({ accountId: payable!, description: `Bill ${document.number}`, debit: allocation.amount, credit: '0' });
      }
      connections.push(allocation);
    }

    for (const split of input.splits) {
      await requireTargetAccount(tx, ctx.organisationId, split.accountId);
      targetLines.push(transaction.type === 'credit'
        ? { accountId: split.accountId, description: split.description ?? transaction.description, debit: '0', credit: split.amount }
        : { accountId: split.accountId, description: split.description ?? transaction.description, debit: split.amount, credit: '0' });
    }
    if (input.bankFee) {
      const feeAccount = await systemAccount(tx, ctx, '5100');
      targetLines.push({ accountId: feeAccount, description: 'Bank fee', debit: input.bankFee, credit: '0' });
    }
    const genericAccount = await systemAccount(tx, ctx, transaction.type === 'credit' ? '4900' : '5000');
    const genericLine: PostingLine = transaction.type === 'credit'
      ? { accountId: genericAccount, description: `Reclassify ${transaction.description}`, debit: transaction.amount, credit: '0' }
      : { accountId: genericAccount, description: `Reclassify ${transaction.description}`, debit: '0', credit: transaction.amount };

    const actionId = crypto.randomUUID();
    const journalEntryId = await postBalancedEntry(tx, ctx, {
      date: paymentDate,
      description: `Reconcile ${transaction.description}`,
      referenceType: 'bank_reconciliation_accept',
      referenceId: actionId,
      lines: [genericLine, ...targetLines],
    });
    const action = await actionRepo.insertAction(tx, ctx, { id: actionId, transactionId, actionType: 'accept', journalEntryId });
    await actionRepo.insertActionItems(tx, ctx.organisationId, action.id, paymentItems);
    await detailsRepo.insertDetails(tx, ctx.organisationId, transactionId, {
      documentConnections: connections,
      splits: [
        ...input.splits.map((split) => ({ category: `Account:${split.accountId}`, description: split.description ?? null, amount: split.amount })),
        ...(input.bankFee ? [{ category: 'Bank fee', description: 'Bank fee adjustment', amount: input.bankFee }] : []),
      ],
      attachments: [],
    });
    for (const connection of connections) {
      const document = await detailsRepo.getDocument(tx, ctx.organisationId, connection.documentType, connection.documentId);
      if (document) await detailsRepo.setConnectionDocumentNumber(tx, ctx.organisationId, transactionId, connection.documentType, connection.documentId, document.number);
    }
    await bankRepo.markTransactionReconciled(tx, ctx.organisationId, transactionId, true);
    return (await actionRepo.getActiveAction(tx, ctx.organisationId, transactionId))!;
  });
}

export async function markPersonalForUser(
  db: Database,
  userId: string,
  transactionId: string,
  _input: MarkBankTransactionPersonalRequest,
) {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const transaction = await bankRepo.getTransaction(tx, ctx.organisationId, transactionId);
    if (!transaction) throw new HTTPException(404, { message: 'Bank transaction not found' });
    if (transaction.isReconciled || await actionRepo.getActiveAction(tx, ctx.organisationId, transactionId)) throw new HTTPException(409, { message: 'Bank transaction is already reconciled' });
    if (await detailsRepo.hasAllocations(tx, ctx.organisationId, transactionId)) throw new HTTPException(409, { message: 'Transaction allocations already exist' });
    const bank = await bankRepo.getAccount(tx, ctx.organisationId, transaction.bankAccountId);
    if (!bank) throw new HTTPException(409, { message: 'Bank account not found' });
    await assertSupportedStatementBank(tx, ctx.organisationId, bank.currency);
    const generic = await systemAccount(tx, ctx, transaction.type === 'credit' ? '4900' : '5000');
    const drawings = await systemAccount(tx, ctx, '3100');
    const actionId = crypto.randomUUID();
    const journalEntryId = await postBalancedEntry(tx, ctx, {
      date: transaction.transactionDate,
      description: `Personal: ${transaction.description}`,
      referenceType: 'bank_reconciliation_personal',
      referenceId: actionId,
      lines: transaction.type === 'debit'
        ? [{ accountId: drawings, description: transaction.description, debit: transaction.amount, credit: '0' }, { accountId: generic, description: transaction.description, debit: '0', credit: transaction.amount }]
        : [{ accountId: generic, description: transaction.description, debit: transaction.amount, credit: '0' }, { accountId: drawings, description: transaction.description, debit: '0', credit: transaction.amount }],
    });
    await actionRepo.insertAction(tx, ctx, { id: actionId, transactionId, actionType: 'personal', journalEntryId });
    await bankRepo.markTransactionReconciled(tx, ctx.organisationId, transactionId, true);
    return (await actionRepo.getActiveAction(tx, ctx.organisationId, transactionId))!;
  });
}

export async function undoReconciliationForUser(
  db: Database,
  userId: string,
  transactionId: string,
  input: UndoBankTransactionReconciliationRequest,
) {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const transaction = await bankRepo.getTransaction(tx, ctx.organisationId, transactionId);
    if (!transaction) throw new HTTPException(404, { message: 'Bank transaction not found' });
    const action = await actionRepo.getActiveAction(tx, ctx.organisationId, transactionId);
    if (!action) throw new HTTPException(409, { message: 'Bank transaction has no undoable reconciliation action' });
    if (await hasCompletedStatement(tx, ctx.organisationId, transaction.bankAccountId, transaction.transactionDate)) {
      throw new HTTPException(409, { message: 'Completed bank reconciliation cannot be undone' });
    }
    for (const item of await actionRepo.listActionItems(tx, ctx.organisationId, action.id)) {
      if (item.paymentId) await paymentsService.reversePaymentInTx(tx, ctx, item.paymentId, input, { skipPosting: true });
      if (item.billPaymentId) {
        await purchasesService.reverseBillPaymentInTx(tx, ctx, item.billPaymentId, input);
      }
    }
    const journal = await actionRepo.actionJournalReference(tx, ctx.organisationId, action.journalEntryId);
    if (!journal?.referenceType || !journal.referenceId || journal.status !== 'posted') throw new HTTPException(409, { message: 'The reconciliation journal is missing or already reversed; review this action before undo' });
    await reversePosting(tx, ctx, {
      referenceType: journal.referenceType,
      referenceId: journal.referenceId,
      reversalType: 'bank_reconciliation_undo',
      date: input.reversalDate,
      description: `Undo bank reconciliation: ${input.reason}`,
    });
    if (action.actionType === 'accept') await detailsRepo.removeAllocations(tx, ctx.organisationId, transactionId);
    await bankRepo.markTransactionReconciled(tx, ctx.organisationId, transactionId, false);
    await rejectTransactionMatches(tx, ctx.organisationId, transactionId);
    return actionRepo.markActionReversed(tx, ctx.organisationId, action.id, input.reason);
  });
}
