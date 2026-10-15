import { supabase } from '@/integrations/supabase/client';
import { bankAccountService } from '@/services/bankAccountService';
import { taxCalculationService } from '@/services/taxCalculationService';
import { bankApi, bankApiEnabled } from '@/features/bank/api/bankApi';
import { reconciliationApi, reconciliationApiEnabled } from '@/features/reconciliation/api/reconciliationApi';
import {
  evaluateGstPeriodReconciliation,
  GstPeriod,
  GstPeriodReconciliation,
  GstReconSession,
  GstReturnFigures,
  UnreconciledSample,
} from '@/utils/gstReconciliation';
import { SupabaseReconciliationSession } from '@/types/reconciliation';

function mapSession(data: SupabaseReconciliationSession): GstReconSession {
  return {
    id: data.id,
    bankAccountId: data.bank_account_id,
    statementStartDate: data.statement_start_date,
    statementEndDate: data.statement_end_date,
    status: data.status,
    unmatchedBankCount: data.unmatched_bank_count,
  };
}

export const gstReconciliationService = {
  async getPeriodReconciliation(
    userId: string,
    period: GstPeriod,
    returnValues: GstReturnFigures
  ): Promise<GstPeriodReconciliation> {
    const [accounts, sessions, unreconciled, books] = await Promise.all([
      bankAccountService.getBankAccounts(),
      fetchOverlappingSessions(userId, period),
      fetchUnreconciledTransactions(userId, period),
      taxCalculationService.calculateGSTSummary(userId, period.startDate, period.endDate),
    ]);

    const activeAccounts = accounts.filter((account) => account.isActive);

    return evaluateGstPeriodReconciliation({
      period,
      accounts: activeAccounts.map((account) => ({
        id: account.id,
        accountName: account.accountName,
        bankName: account.bankName,
      })),
      sessions,
      unreconciledTransactionCount: unreconciled.count,
      unreconciledSamples: unreconciled.samples,
      books: {
        totalSales: books.totalSales,
        gstOnSales: books.gstOnSales,
        totalPurchases: books.totalPurchases,
        gstOnPurchases: books.gstOnPurchases,
      },
      returnValues,
    });
  },
};

async function fetchOverlappingSessions(
  userId: string,
  period: GstPeriod
): Promise<GstReconSession[]> {
  if (reconciliationApiEnabled()) {
    const sessions = await reconciliationApi.listSessions();
    return sessions
      .filter((session) => session.statementStartDate <= period.endDate && session.statementEndDate >= period.startDate)
      .map((session) => ({
        id: session.id,
        bankAccountId: session.bankAccountId,
        statementStartDate: session.statementStartDate,
        statementEndDate: session.statementEndDate,
        status: session.status,
        unmatchedBankCount: session.unmatchedBankCount,
      }));
  }
  const { data, error } = await supabase
    .from('reconciliation_sessions')
    .select('*')
    .eq('user_id', userId)
    .lte('statement_start_date', period.endDate)
    .gte('statement_end_date', period.startDate);

  if (error) {
    console.error('Error fetching reconciliation sessions for GST period:', error);
    throw error;
  }

  return ((data || []) as SupabaseReconciliationSession[]).map(mapSession);
}

async function fetchUnreconciledTransactions(
  userId: string,
  period: GstPeriod
): Promise<{ count: number; samples: UnreconciledSample[] }> {
  if (bankApiEnabled()) {
    const rows = (await bankApi.listTransactions({ from: period.startDate, to: period.endDate })).filter(
      (row) => !row.isReconciled,
    );
    return {
      count: rows.length,
      samples: rows.slice(0, 5).map((row) => ({
        id: row.id,
        date: row.transactionDate,
        description: row.description,
        amount: row.amount,
      })),
    };
  }
  const { data, error, count } = await supabase
    .from('bank_transactions')
    .select('id, transaction_date, description, amount', { count: 'exact' })
    .eq('user_id', userId)
    .gte('transaction_date', period.startDate)
    .lte('transaction_date', period.endDate)
    .eq('is_reconciled', false)
    .order('transaction_date', { ascending: true })
    .limit(5);

  if (error) {
    console.error('Error fetching unreconciled bank transactions:', error);
    throw error;
  }

  const samples: UnreconciledSample[] = (data || []).map((row) => ({
    id: row.id,
    date: row.transaction_date,
    description: row.description,
    amount: Number(row.amount),
  }));

  return {
    count: count ?? samples.length,
    samples,
  };
}
