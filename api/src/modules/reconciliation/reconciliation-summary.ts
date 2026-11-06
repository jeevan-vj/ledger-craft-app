import { createReconciliationSessionRequestSchema, reconciliationSummarySchema, type ReconciliationSessionDto, type ReconciliationSummaryDto } from '@ledgercraft/contracts';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client';
import { decimal, moneyToCents, roundMoney } from '../invoices/money';
import * as bankRepo from '../bank/bank.repository';
import { assertSupportedStatementBank } from '../currency/currency.service';
import * as repo from './reconciliation.repository';
import { bankLedgerBalance } from './existing-posting.repository';

/** Single source for the read-only preview and the completion transaction. */
export async function reconciliationSummaryInTx(tx: Database, organisationId: string, session: ReconciliationSessionDto): Promise<ReconciliationSummaryDto> {
  const period = createReconciliationSessionRequestSchema.safeParse({
    bankAccountId: session.bankAccountId, statementStartDate: session.statementStartDate, statementEndDate: session.statementEndDate,
    statementOpeningBalance: session.statementOpeningBalance, statementClosingBalance: session.statementClosingBalance,
  });
  if (!period.success) throw new HTTPException(409, { message: 'Review the invalid stored statement period or cent precision before reconciliation' });
  const account = await bankRepo.getAccount(tx, organisationId, session.bankAccountId);
  if (!account) throw new HTTPException(404, { message: 'Bank account not found' });
  await assertSupportedStatementBank(tx, organisationId, account.currency);
  const closing = await bankLedgerBalance(tx, organisationId, account.id, session.statementEndDate);
  const adjustments = (await repo.listAdjustments(tx, organisationId, session.id)).filter(row => row.status !== 'reversed');
  // These declarations reconcile the bank statement; they never post books.
  const supported = adjustments.filter(row => row.affectsBank && !row.affectsBook
    && ['deposit_in_transit', 'outstanding_check', 'bank_error'].includes(row.adjustmentType)
    && /^-?\d+(?:\.\d{1,2})?$/.test(row.amount) && decimal(row.amount).compare(0) !== 0
    && (row.adjustmentType === 'bank_error' || decimal(row.amount).compare(0) > 0));
  const outstandingDeposits = supported.filter(row => row.adjustmentType === 'deposit_in_transit');
  const outstandingChecks = supported.filter(row => row.adjustmentType === 'outstanding_check');
  const otherAdjustments = supported.filter(row => row.adjustmentType === 'bank_error');
  const deposits = outstandingDeposits.reduce((sum, row) => sum.add(row.amount), decimal(0));
  const checks = outstandingChecks.reduce((sum, row) => sum.add(row.amount), decimal(0));
  const other = supported.filter(row => row.adjustmentType === 'bank_error')
    .reduce((sum, row) => sum.add(row.amount), decimal(0));
  const warnings = supported.length !== adjustments.length
    ? ['Unposted book adjustments and invalid statement declarations are excluded. Record the actual bank transaction or posted journal before completing this statement; historical declarations remain available for review.'] : [];
  // Metadata opening is only a fallback without ledger history; never add it
  // again to opening capital which has already been posted to this bank.
  const bookBalance = closing.hasEntries ? closing.balance : account.openingBalance;
  const adjustedBankBalance = roundMoney(decimal(session.statementClosingBalance).add(deposits).sub(checks).add(other));
  const adjustedBookBalance = roundMoney(bookBalance);
  const finalDifference = roundMoney(decimal(adjustedBankBalance).sub(adjustedBookBalance));
  return reconciliationSummarySchema.parse({
    session, bankAccountName: account.accountName, bankName: account.bankName,
    bankBalance: roundMoney(session.statementClosingBalance), adjustedBankBalance,
    bookBalance: roundMoney(bookBalance), adjustedBookBalance,
    outstandingDeposits, outstandingChecks, otherAdjustments,
    totalOutstandingDeposits: roundMoney(deposits), totalOutstandingChecks: roundMoney(checks), totalOtherAdjustments: roundMoney(other),
    finalDifference, isReconciled: moneyToCents(finalDifference) === 0n, warnings,
  });
}
