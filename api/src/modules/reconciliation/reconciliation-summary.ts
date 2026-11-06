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
  const adjustments = await repo.listAdjustments(tx, organisationId, session.id);
  // Preserve completion's adjustment semantics: pending/applied adjustments are
  // declared statement facts. This endpoint does not post or change their state.
  const outstandingDeposits = adjustments.filter(row => row.adjustmentType === 'deposit_in_transit');
  const outstandingChecks = adjustments.filter(row => row.adjustmentType === 'outstanding_check');
  const otherAdjustments = adjustments.filter(row => row.adjustmentType !== 'deposit_in_transit' && row.adjustmentType !== 'outstanding_check');
  const deposits = outstandingDeposits.reduce((sum, row) => sum.add(row.amount), decimal(0));
  const checks = outstandingChecks.reduce((sum, row) => sum.add(row.amount), decimal(0));
  const other = otherAdjustments.reduce((sum, row) => {
    if (row.affectsBank) return sum.add(row.amount);
    if (row.affectsBook) return sum.sub(row.amount);
    return sum;
  }, decimal(0));
  // Metadata opening is only a fallback without ledger history; never add it
  // again to opening capital which has already been posted to this bank.
  const bookBalance = closing.hasEntries ? closing.balance : account.openingBalance;
  const adjustedBankBalance = roundMoney(decimal(session.statementClosingBalance).add(deposits).sub(checks));
  const adjustedBookBalance = roundMoney(decimal(bookBalance).add(other));
  const finalDifference = roundMoney(decimal(adjustedBankBalance).sub(adjustedBookBalance));
  return reconciliationSummarySchema.parse({
    session, bankAccountName: account.accountName, bankName: account.bankName,
    bankBalance: roundMoney(session.statementClosingBalance), adjustedBankBalance,
    bookBalance: roundMoney(bookBalance), adjustedBookBalance,
    outstandingDeposits, outstandingChecks, otherAdjustments,
    totalOutstandingDeposits: roundMoney(deposits), totalOutstandingChecks: roundMoney(checks), totalOtherAdjustments: roundMoney(other),
    finalDifference, isReconciled: moneyToCents(finalDifference) === 0n,
  });
}
