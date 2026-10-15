/**
 * Bank Reconciliation Service
 * 
 * Professional accounting-grade reconciliation for LedgerCraft
 * Handles:
 * - Creating and managing reconciliation sessions
 * - Auto-matching bank transactions to book entries
 * - Manual matching and adjustments
 * - Generating reconciliation reports
 */

import { supabase } from '@/integrations/supabase/client';
import {
  ReconciliationSession,
  SupabaseReconciliationSession,
  ReconciliationMatch,
  SupabaseReconciliationMatch,
  ReconciliationAdjustment,
  SupabaseReconciliationAdjustment,
  ReconciliationSetup,
  MatchableItem,
  SuggestedMatch,
  ReconciliationSummary,
  ReconciliationFilters,
  AutoMatchConfig,
  MatchType,
  MatchStatus,
  AdjustmentType,
} from '@/types/reconciliation';
import { BankTransaction, SupabaseBankTransaction } from '@/types/bankTransaction';
import { bankApi, bankApiEnabled } from '@/features/bank/api/bankApi';
import {
  reconciliationApi,
  reconciliationApiEnabled,
  toCreateSessionRequest,
} from '@/features/reconciliation/api/reconciliationApi';

// ===============================
// MAPPERS
// ===============================

const mapSupabaseSessionToSession = (data: SupabaseReconciliationSession): ReconciliationSession => ({
  id: data.id,
  bankAccountId: data.bank_account_id,
  userId: data.user_id,
  statementStartDate: data.statement_start_date,
  statementEndDate: data.statement_end_date,
  statementOpeningBalance: Number(data.statement_opening_balance),
  statementClosingBalance: Number(data.statement_closing_balance),
  bookOpeningBalance: Number(data.book_opening_balance),
  bookClosingBalance: data.book_closing_balance ? Number(data.book_closing_balance) : null,
  totalDeposits: Number(data.total_deposits),
  totalWithdrawals: Number(data.total_withdrawals),
  status: data.status,
  reconciledAt: data.reconciled_at,
  matchedCount: data.matched_count,
  unmatchedBankCount: data.unmatched_bank_count,
  unmatchedBookCount: data.unmatched_book_count,
  adjustmentCount: data.adjustment_count,
  difference: Number(data.difference),
  notes: data.notes,
  createdAt: data.created_at,
  updatedAt: data.updated_at,
});

const mapSupabaseMatchToMatch = (data: SupabaseReconciliationMatch): ReconciliationMatch => ({
  id: data.id,
  reconciliationId: data.reconciliation_id,
  bankTransactionId: data.bank_transaction_id,
  invoiceId: data.invoice_id,
  paymentId: data.payment_id,
  expenseId: data.expense_id,
  journalEntryId: data.journal_entry_id,
  matchType: data.match_type,
  confidenceScore: data.confidence_score,
  bankAmount: data.bank_amount ? Number(data.bank_amount) : null,
  bookAmount: data.book_amount ? Number(data.book_amount) : null,
  difference: Number(data.difference),
  status: data.status,
  notes: data.notes,
  matchedBy: data.matched_by,
  matchedAt: data.matched_at,
  createdAt: data.created_at,
});

const mapSupabaseAdjustmentToAdjustment = (data: SupabaseReconciliationAdjustment): ReconciliationAdjustment => ({
  id: data.id,
  reconciliationId: data.reconciliation_id,
  userId: data.user_id,
  adjustmentType: data.adjustment_type,
  description: data.description,
  amount: Number(data.amount),
  affectsBank: data.affects_bank,
  affectsBook: data.affects_book,
  referenceType: data.reference_type,
  referenceId: data.reference_id,
  referenceNumber: data.reference_number,
  journalEntryId: data.journal_entry_id,
  status: data.status,
  appliedAt: data.applied_at,
  createdAt: data.created_at,
  updatedAt: data.updated_at,
});

const mapSupabaseBankTransactionToBankTransaction = (data: SupabaseBankTransaction): BankTransaction => ({
  id: data.id,
  bankAccountId: data.bank_account_id,
  transactionDate: data.transaction_date,
  description: data.description,
  reference: data.reference,
  amount: Number(data.amount),
  type: data.type,
  balance: data.balance ? Number(data.balance) : undefined,
  category: data.category,
  merchant: data.merchant,
  isReconciled: data.is_reconciled,
  notes: data.notes,
  userId: data.user_id,
  createdAt: data.created_at,
  updatedAt: data.updated_at,
});

// ===============================
// DEFAULT AUTO-MATCH CONFIG
// ===============================

const DEFAULT_AUTO_MATCH_CONFIG: AutoMatchConfig = {
  enableExactMatch: true,
  enableFuzzyMatch: true,
  dateToleranceDays: 3,
  amountTolerancePercent: 0,
  matchByReference: true,
  matchByAmount: true,
  matchByDate: true,
  matchByDescription: true,
  minimumConfidenceScore: 70,
};

// ===============================
// RECONCILIATION SERVICE
// ===============================

export const reconciliationService = {
  // ========== SESSION MANAGEMENT ==========

  /**
   * Create a new reconciliation session
   */
  async createSession(setup: ReconciliationSetup): Promise<ReconciliationSession> {
    if (reconciliationApiEnabled()) {
      return reconciliationApi.createSession(toCreateSessionRequest(setup));
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) throw new Error('Not authenticated');

    // Calculate book opening balance from last reconciliation or opening balance
    const bookOpeningBalance = await this.calculateBookOpeningBalance(
      setup.bankAccountId,
      setup.statementStartDate
    );

    const sessionData = {
      bank_account_id: setup.bankAccountId,
      user_id: user.id,
      statement_start_date: setup.statementStartDate,
      statement_end_date: setup.statementEndDate,
      statement_opening_balance: setup.statementOpeningBalance,
      statement_closing_balance: setup.statementClosingBalance,
      book_opening_balance: bookOpeningBalance,
      status: 'in_progress',
    };

    const { data, error } = await supabase
      .from('reconciliation_sessions')
      .insert([sessionData])
      .select()
      .single();

    if (error) throw error;
    return mapSupabaseSessionToSession(data as SupabaseReconciliationSession);
  },

  /**
   * Get all reconciliation sessions for a bank account
   */
  async getSessions(bankAccountId: string): Promise<ReconciliationSession[]> {
    if (reconciliationApiEnabled()) {
      return reconciliationApi.listSessions(bankAccountId);
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return [];

    const { data, error } = await supabase
      .from('reconciliation_sessions')
      .select('*')
      .eq('bank_account_id', bankAccountId)
      .eq('user_id', user.id)
      .order('statement_end_date', { ascending: false });

    if (error) throw error;
    return (data as SupabaseReconciliationSession[]).map(mapSupabaseSessionToSession);
  },

  /**
   * Get a single reconciliation session
   */
  async getSession(sessionId: string): Promise<ReconciliationSession | null> {
    if (reconciliationApiEnabled()) {
      return reconciliationApi.getSession(sessionId);
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return null;

    const { data, error } = await supabase
      .from('reconciliation_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return mapSupabaseSessionToSession(data as SupabaseReconciliationSession);
  },

  /**
   * Update reconciliation session status
   */
  async updateSessionStatus(
    sessionId: string,
    status: 'in_progress' | 'completed' | 'locked',
    notes?: string
  ): Promise<ReconciliationSession> {
    const updateData: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (status === 'completed') {
      updateData.reconciled_at = new Date().toISOString();
    }

    if (notes !== undefined) {
      updateData.notes = notes;
    }

    const { data, error } = await supabase
      .from('reconciliation_sessions')
      .update(updateData)
      .eq('id', sessionId)
      .select()
      .single();

    if (error) throw error;
    return mapSupabaseSessionToSession(data as SupabaseReconciliationSession);
  },

  /**
   * Calculate book opening balance from previous reconciliation or bank account opening balance
   */
  async calculateBookOpeningBalance(bankAccountId: string, startDate: string): Promise<number> {
    // Check for last completed reconciliation
    const { data: lastSession } = await supabase
      .from('reconciliation_sessions')
      .select('book_closing_balance, statement_end_date')
      .eq('bank_account_id', bankAccountId)
      .eq('status', 'completed')
      .lt('statement_end_date', startDate)
      .order('statement_end_date', { ascending: false })
      .limit(1)
      .single();

    if (lastSession?.book_closing_balance) {
      return Number(lastSession.book_closing_balance);
    }

    // Fall back to bank account opening balance
    const { data: bankAccount } = await supabase
      .from('bank_accounts')
      .select('opening_balance')
      .eq('id', bankAccountId)
      .single();

    return bankAccount ? Number(bankAccount.opening_balance) : 0;
  },

  // ========== TRANSACTION FETCHING ==========

  /**
   * Get bank transactions for reconciliation period
   */
  async getBankTransactions(
    bankAccountId: string,
    startDate: string,
    endDate: string,
    filters?: ReconciliationFilters
  ): Promise<BankTransaction[]> {
    if (bankApiEnabled()) {
      let transactions = await bankApi.listTransactions({
        bankAccountId,
        from: startDate,
        to: endDate,
      });
      if (filters?.showReconciled === false) {
        transactions = transactions.filter((row) => !row.isReconciled);
      }
      if (filters?.transactionType && filters.transactionType !== 'all') {
        transactions = transactions.filter((row) => row.type === filters.transactionType);
      }
      if (filters?.category) {
        transactions = transactions.filter((row) => row.category === filters.category);
      }
      if (filters?.searchTerm) {
        const term = filters.searchTerm.toLowerCase();
        transactions = transactions.filter((row) => row.description.toLowerCase().includes(term));
      }
      if (filters?.amountMin !== undefined) {
        transactions = transactions.filter((row) => row.amount >= filters.amountMin!);
      }
      if (filters?.amountMax !== undefined) {
        transactions = transactions.filter((row) => row.amount <= filters.amountMax!);
      }
      return transactions;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return [];

    let query = supabase
      .from('bank_transactions')
      .select('*')
      .eq('bank_account_id', bankAccountId)
      .eq('user_id', user.id)
      .gte('transaction_date', startDate)
      .lte('transaction_date', endDate)
      .order('transaction_date', { ascending: true });

    // Apply filters
    if (filters?.showReconciled === false) {
      query = query.eq('is_reconciled', false);
    }
    if (filters?.transactionType && filters.transactionType !== 'all') {
      query = query.eq('type', filters.transactionType);
    }
    if (filters?.category) {
      query = query.eq('category', filters.category);
    }
    if (filters?.searchTerm) {
      query = query.ilike('description', `%${filters.searchTerm}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    let transactions = (data as SupabaseBankTransaction[]).map(mapSupabaseBankTransactionToBankTransaction);

    // Apply amount filters
    if (filters?.amountMin !== undefined) {
      transactions = transactions.filter(t => t.amount >= filters.amountMin!);
    }
    if (filters?.amountMax !== undefined) {
      transactions = transactions.filter(t => t.amount <= filters.amountMax!);
    }

    return transactions;
  },

  /**
   * Get book entries (invoices, expenses, payments) for reconciliation period
   */
  async getBookEntries(
    startDate: string,
    endDate: string
  ): Promise<MatchableItem[]> {
    if (reconciliationApiEnabled()) {
      return reconciliationApi.listBookEntries(startDate, endDate);
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return [];

    const items: MatchableItem[] = [];

    // Get invoice payments (income)
    const { data: invoices } = await supabase
      .from('invoices')
      .select('id, invoice_number, date, total, status, customer_id')
      .eq('user_id', user.id)
      .gte('date', startDate)
      .lte('date', endDate)
      .in('status', ['paid', 'partially_paid']);

    if (invoices) {
      for (const inv of invoices) {
        items.push({
          id: inv.id,
          type: 'invoice',
          date: inv.date,
          description: `Invoice ${inv.invoice_number}`,
          amount: Number(inv.total),
          reference: inv.invoice_number,
          isReconciled: false,
        });
      }
    }

    // Get expenses (outgoing payments)
    const { data: expenses } = await supabase
      .from('expenses')
      .select('id, description, expense_date, amount, vendor_name, status')
      .eq('user_id', user.id)
      .gte('expense_date', startDate)
      .lte('expense_date', endDate)
      .eq('status', 'approved');

    if (expenses) {
      for (const exp of expenses) {
        items.push({
          id: exp.id,
          type: 'expense',
          date: exp.expense_date,
          description: exp.description || exp.vendor_name || 'Expense',
          amount: Number(exp.amount),
          isReconciled: false,
        });
      }
    }

    // Get payments
    const { data: payments } = await supabase
      .from('payments')
      .select('id, amount, payment_date, reference_number, payment_method, status')
      .eq('user_id', user.id)
      .gte('payment_date', startDate)
      .lte('payment_date', endDate)
      .eq('status', 'completed');

    if (payments) {
      for (const pay of payments) {
        items.push({
          id: pay.id,
          type: 'payment',
          date: pay.payment_date,
          description: `Payment - ${pay.payment_method}`,
          amount: Number(pay.amount),
          reference: pay.reference_number,
          isReconciled: false,
        });
      }
    }

    return items.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  },

  // ========== AUTO-MATCHING ==========

  /**
   * Run auto-matching algorithm
   */
  async autoMatch(
    sessionId: string,
    config: AutoMatchConfig = DEFAULT_AUTO_MATCH_CONFIG
  ): Promise<SuggestedMatch[]> {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error('Session not found');

    // Get unreconciled bank transactions
    const bankTransactions = await this.getBankTransactions(
      session.bankAccountId,
      session.statementStartDate,
      session.statementEndDate,
      { showReconciled: false }
    );

    // Get book entries
    const bookEntries = await this.getBookEntries(
      session.statementStartDate,
      session.statementEndDate
    );

    const suggestedMatches: SuggestedMatch[] = [];
    const usedBankTransactions = new Set<string>();
    const usedBookEntries = new Set<string>();

    // First pass: Exact matches
    if (config.enableExactMatch) {
      for (const bankTx of bankTransactions) {
        if (usedBankTransactions.has(bankTx.id)) continue;

        for (const bookEntry of bookEntries) {
          if (usedBookEntries.has(bookEntry.id)) continue;

          const match = this.checkExactMatch(bankTx, bookEntry, config);
          if (match) {
            suggestedMatches.push(match);
            usedBankTransactions.add(bankTx.id);
            usedBookEntries.add(bookEntry.id);
            break;
          }
        }
      }
    }

    // Second pass: Fuzzy matches
    if (config.enableFuzzyMatch) {
      for (const bankTx of bankTransactions) {
        if (usedBankTransactions.has(bankTx.id)) continue;

        let bestMatch: SuggestedMatch | null = null;
        let bestScore = config.minimumConfidenceScore;

        for (const bookEntry of bookEntries) {
          if (usedBookEntries.has(bookEntry.id)) continue;

          const match = this.checkFuzzyMatch(bankTx, bookEntry, config);
          if (match && match.confidenceScore > bestScore) {
            bestMatch = match;
            bestScore = match.confidenceScore;
          }
        }

        if (bestMatch) {
          suggestedMatches.push(bestMatch);
          usedBankTransactions.add(bankTx.id);
          usedBookEntries.add(bestMatch.bookItem.id);
        }
      }
    }

    return suggestedMatches;
  },

  /**
   * Check for exact match between bank transaction and book entry
   */
  checkExactMatch(
    bankTx: BankTransaction,
    bookEntry: MatchableItem,
    config: AutoMatchConfig
  ): SuggestedMatch | null {
    const matchReasons: string[] = [];
    
    // Amount must match exactly (or within tolerance)
    const amountDiff = Math.abs(bankTx.amount - bookEntry.amount);
    const amountTolerance = bookEntry.amount * (config.amountTolerancePercent / 100);
    if (amountDiff > amountTolerance) {
      return null;
    }
    matchReasons.push('Amounts match');

    // Date must be within tolerance
    const bankDate = new Date(bankTx.transactionDate);
    const bookDate = new Date(bookEntry.date);
    const daysDiff = Math.abs(bankDate.getTime() - bookDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysDiff > config.dateToleranceDays) {
      return null;
    }
    matchReasons.push(`Dates within ${Math.round(daysDiff)} day(s)`);

    // Reference match (if both have references)
    if (config.matchByReference && bankTx.reference && bookEntry.reference) {
      if (bankTx.reference.toLowerCase().includes(bookEntry.reference.toLowerCase()) ||
          bookEntry.reference.toLowerCase().includes(bankTx.reference.toLowerCase())) {
        matchReasons.push('Reference numbers match');
      }
    }

    const bankItem: MatchableItem = {
      id: bankTx.id,
      type: 'bank_transaction',
      date: bankTx.transactionDate,
      description: bankTx.description,
      amount: bankTx.amount,
      reference: bankTx.reference,
      isReconciled: bankTx.isReconciled,
      category: bankTx.category,
    };

    return {
      bankTransaction: bankItem,
      bookItem: bookEntry,
      matchType: 'auto_exact',
      confidenceScore: 100,
      matchReasons,
    };
  },

  /**
   * Check for fuzzy match between bank transaction and book entry
   */
  checkFuzzyMatch(
    bankTx: BankTransaction,
    bookEntry: MatchableItem,
    config: AutoMatchConfig
  ): SuggestedMatch | null {
    let score = 0;
    const matchReasons: string[] = [];

    // Amount scoring (40 points max)
    if (config.matchByAmount) {
      const amountDiff = Math.abs(bankTx.amount - bookEntry.amount);
      const percentDiff = (amountDiff / bookEntry.amount) * 100;
      
      if (percentDiff === 0) {
        score += 40;
        matchReasons.push('Exact amount match');
      } else if (percentDiff <= 1) {
        score += 35;
        matchReasons.push('Amount within 1%');
      } else if (percentDiff <= 5) {
        score += 25;
        matchReasons.push('Amount within 5%');
      } else if (percentDiff <= 10) {
        score += 15;
        matchReasons.push('Amount within 10%');
      }
    }

    // Date scoring (30 points max)
    if (config.matchByDate) {
      const bankDate = new Date(bankTx.transactionDate);
      const bookDate = new Date(bookEntry.date);
      const daysDiff = Math.abs(bankDate.getTime() - bookDate.getTime()) / (1000 * 60 * 60 * 24);

      if (daysDiff === 0) {
        score += 30;
        matchReasons.push('Same date');
      } else if (daysDiff <= 1) {
        score += 25;
        matchReasons.push('Within 1 day');
      } else if (daysDiff <= 3) {
        score += 15;
        matchReasons.push(`Within ${Math.round(daysDiff)} days`);
      } else if (daysDiff <= config.dateToleranceDays) {
        score += 5;
        matchReasons.push(`Within ${Math.round(daysDiff)} days`);
      }
    }

    // Reference scoring (15 points max)
    if (config.matchByReference && bankTx.reference && bookEntry.reference) {
      const refMatch = this.fuzzyStringMatch(bankTx.reference, bookEntry.reference);
      if (refMatch > 0.8) {
        score += 15;
        matchReasons.push('Reference match');
      } else if (refMatch > 0.5) {
        score += 8;
        matchReasons.push('Partial reference match');
      }
    }

    // Description scoring (15 points max)
    if (config.matchByDescription) {
      const descMatch = this.fuzzyStringMatch(bankTx.description, bookEntry.description);
      if (descMatch > 0.7) {
        score += 15;
        matchReasons.push('Description match');
      } else if (descMatch > 0.4) {
        score += 8;
        matchReasons.push('Partial description match');
      }
    }

    if (score < config.minimumConfidenceScore) {
      return null;
    }

    const bankItem: MatchableItem = {
      id: bankTx.id,
      type: 'bank_transaction',
      date: bankTx.transactionDate,
      description: bankTx.description,
      amount: bankTx.amount,
      reference: bankTx.reference,
      isReconciled: bankTx.isReconciled,
      category: bankTx.category,
    };

    return {
      bankTransaction: bankItem,
      bookItem: bookEntry,
      matchType: 'auto_fuzzy',
      confidenceScore: Math.min(score, 100),
      matchReasons,
    };
  },

  /**
   * Fuzzy string matching using Levenshtein distance
   */
  fuzzyStringMatch(str1: string, str2: string): number {
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();

    if (s1 === s2) return 1;
    if (s1.length === 0 || s2.length === 0) return 0;

    // Simple contains check
    if (s1.includes(s2) || s2.includes(s1)) return 0.8;

    // Levenshtein distance
    const matrix: number[][] = [];
    for (let i = 0; i <= s1.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= s2.length; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= s1.length; i++) {
      for (let j = 1; j <= s2.length; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    const distance = matrix[s1.length][s2.length];
    const maxLen = Math.max(s1.length, s2.length);
    return 1 - distance / maxLen;
  },

  // ========== MANUAL MATCHING ==========

  /**
   * Create a manual match
   */
  async createMatch(
    sessionId: string,
    bankTransactionId: string,
    bookItemType: 'invoice' | 'payment' | 'expense',
    bookItemId: string,
    notes?: string
  ): Promise<ReconciliationMatch> {
    if (reconciliationApiEnabled()) {
      return reconciliationApi.createMatch(sessionId, {
        bankTransactionId,
        bookItemType,
        bookItemId,
        notes: notes ?? null,
      });
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) throw new Error('Not authenticated');

    // Get bank transaction amount
    const { data: bankTx } = await supabase
      .from('bank_transactions')
      .select('amount')
      .eq('id', bankTransactionId)
      .single();

    // Get book item amount based on type
    let bookAmount = 0;
    if (bookItemType === 'invoice') {
      const { data } = await supabase.from('invoices').select('total').eq('id', bookItemId).single();
      bookAmount = data ? Number(data.total) : 0;
    } else if (bookItemType === 'expense') {
      const { data } = await supabase.from('expenses').select('amount').eq('id', bookItemId).single();
      bookAmount = data ? Number(data.amount) : 0;
    } else if (bookItemType === 'payment') {
      const { data } = await supabase.from('payments').select('amount').eq('id', bookItemId).single();
      bookAmount = data ? Number(data.amount) : 0;
    }

    const bankAmount = bankTx ? Number(bankTx.amount) : 0;

    const matchData = {
      reconciliation_id: sessionId,
      bank_transaction_id: bankTransactionId,
      invoice_id: bookItemType === 'invoice' ? bookItemId : null,
      payment_id: bookItemType === 'payment' ? bookItemId : null,
      expense_id: bookItemType === 'expense' ? bookItemId : null,
      match_type: 'manual' as MatchType,
      confidence_score: 100,
      bank_amount: bankAmount,
      book_amount: bookAmount,
      difference: Math.abs(bankAmount - bookAmount),
      status: 'pending' as MatchStatus,
      notes,
      matched_by: user.id,
      matched_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('reconciliation_matches')
      .insert([matchData])
      .select()
      .single();

    if (error) throw error;
    return mapSupabaseMatchToMatch(data as SupabaseReconciliationMatch);
  },

  /**
   * Confirm suggested matches
   */
  async confirmMatches(
    sessionId: string,
    matches: SuggestedMatch[]
  ): Promise<ReconciliationMatch[]> {
    if (reconciliationApiEnabled()) {
      return reconciliationApi.confirmMatches(sessionId, matches);
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) throw new Error('Not authenticated');

    const results: ReconciliationMatch[] = [];

    for (const match of matches) {
      const matchData = {
        reconciliation_id: sessionId,
        bank_transaction_id: match.bankTransaction.id,
        invoice_id: match.bookItem.type === 'invoice' ? match.bookItem.id : null,
        payment_id: match.bookItem.type === 'payment' ? match.bookItem.id : null,
        expense_id: match.bookItem.type === 'expense' ? match.bookItem.id : null,
        match_type: match.matchType,
        confidence_score: match.confidenceScore,
        bank_amount: match.bankTransaction.amount,
        book_amount: match.bookItem.amount,
        difference: Math.abs(match.bankTransaction.amount - match.bookItem.amount),
        status: 'confirmed' as MatchStatus,
        notes: match.matchReasons.join(', '),
        matched_by: user.id,
        matched_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('reconciliation_matches')
        .insert([matchData])
        .select()
        .single();

      if (error) {
        console.error('Error confirming match:', error);
        continue;
      }

      // Mark bank transaction as reconciled
      await supabase
        .from('bank_transactions')
        .update({
          is_reconciled: true,
          reconciliation_id: sessionId,
          matched_record_type: match.bookItem.type,
          matched_record_id: match.bookItem.id,
        })
        .eq('id', match.bankTransaction.id);

      results.push(mapSupabaseMatchToMatch(data as SupabaseReconciliationMatch));
    }

    return results;
  },

  /**
   * Update match status
   */
  async updateMatchStatus(matchId: string, status: MatchStatus): Promise<ReconciliationMatch> {
    const { data, error } = await supabase
      .from('reconciliation_matches')
      .update({ status })
      .eq('id', matchId)
      .select()
      .single();

    if (error) throw error;
    return mapSupabaseMatchToMatch(data as SupabaseReconciliationMatch);
  },

  /**
   * Delete a match
   */
  async deleteMatch(matchId: string): Promise<void> {
    // Get the match first to un-reconcile the bank transaction
    const { data: match } = await supabase
      .from('reconciliation_matches')
      .select('bank_transaction_id')
      .eq('id', matchId)
      .single();

    if (match?.bank_transaction_id) {
      await supabase
        .from('bank_transactions')
        .update({
          is_reconciled: false,
          reconciliation_id: null,
          matched_record_type: null,
          matched_record_id: null,
        })
        .eq('id', match.bank_transaction_id);
    }

    const { error } = await supabase
      .from('reconciliation_matches')
      .delete()
      .eq('id', matchId);

    if (error) throw error;
  },

  // ========== ADJUSTMENTS ==========

  /**
   * Create a reconciliation adjustment
   */
  async createAdjustment(
    sessionId: string,
    adjustment: {
      adjustmentType: AdjustmentType;
      description: string;
      amount: number;
      affectsBank: boolean;
      affectsBook: boolean;
      referenceNumber?: string;
    }
  ): Promise<ReconciliationAdjustment> {
    if (reconciliationApiEnabled()) {
      return reconciliationApi.createAdjustment(sessionId, {
        adjustmentType: adjustment.adjustmentType,
        description: adjustment.description,
        amount: String(adjustment.amount),
        affectsBank: adjustment.affectsBank,
        affectsBook: adjustment.affectsBook,
        referenceNumber: adjustment.referenceNumber ?? null,
      });
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) throw new Error('Not authenticated');

    const adjustmentData = {
      reconciliation_id: sessionId,
      user_id: user.id,
      adjustment_type: adjustment.adjustmentType,
      description: adjustment.description,
      amount: adjustment.amount,
      affects_bank: adjustment.affectsBank,
      affects_book: adjustment.affectsBook,
      reference_number: adjustment.referenceNumber,
      status: 'pending' as const,
    };

    const { data, error } = await supabase
      .from('reconciliation_adjustments')
      .insert([adjustmentData])
      .select()
      .single();

    if (error) throw error;
    return mapSupabaseAdjustmentToAdjustment(data as SupabaseReconciliationAdjustment);
  },

  /**
   * Apply adjustment
   */
  async applyAdjustment(adjustmentId: string): Promise<ReconciliationAdjustment> {
    const { data, error } = await supabase
      .from('reconciliation_adjustments')
      .update({
        status: 'applied',
        applied_at: new Date().toISOString(),
      })
      .eq('id', adjustmentId)
      .select()
      .single();

    if (error) throw error;
    return mapSupabaseAdjustmentToAdjustment(data as SupabaseReconciliationAdjustment);
  },

  /**
   * Get adjustments for a session
   */
  async getAdjustments(sessionId: string): Promise<ReconciliationAdjustment[]> {
    if (reconciliationApiEnabled()) {
      return reconciliationApi.listAdjustments(sessionId);
    }
    const { data, error } = await supabase
      .from('reconciliation_adjustments')
      .select('*')
      .eq('reconciliation_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return (data as SupabaseReconciliationAdjustment[]).map(mapSupabaseAdjustmentToAdjustment);
  },

  // ========== REPORTS ==========

  /**
   * Generate reconciliation summary
   */
  async generateSummary(sessionId: string): Promise<ReconciliationSummary> {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error('Session not found');

    const bankAccount = bankApiEnabled()
      ? await bankApi.getAccount(session.bankAccountId)
      : null;
    const { data: supabaseBankAccount } = bankApiEnabled()
      ? { data: null }
      : await supabase
          .from('bank_accounts')
          .select('account_name, bank_name')
          .eq('id', session.bankAccountId)
          .single();

    // Get adjustments
    const adjustments = await this.getAdjustments(sessionId);
    const appliedAdjustments = adjustments.filter(a => a.status === 'applied');

    const outstandingDeposits = appliedAdjustments.filter(a => a.adjustmentType === 'deposit_in_transit');
    const outstandingChecks = appliedAdjustments.filter(a => a.adjustmentType === 'outstanding_check');
    const otherAdjustments = appliedAdjustments.filter(a => 
      !['deposit_in_transit', 'outstanding_check'].includes(a.adjustmentType)
    );

    const totalOutstandingDeposits = outstandingDeposits.reduce((sum, a) => sum + a.amount, 0);
    const totalOutstandingChecks = outstandingChecks.reduce((sum, a) => sum + a.amount, 0);
    const totalOtherAdjustments = otherAdjustments.reduce((sum, a) => {
      if (a.affectsBank) return sum + a.amount;
      if (a.affectsBook) return sum - a.amount;
      return sum;
    }, 0);

    const adjustedBankBalance = session.statementClosingBalance + totalOutstandingDeposits - totalOutstandingChecks;
    const adjustedBookBalance = (session.bookClosingBalance || 0) + totalOtherAdjustments;
    const finalDifference = adjustedBankBalance - adjustedBookBalance;

    return {
      session,
      bankAccountName: bankAccount?.accountName || supabaseBankAccount?.account_name || '',
      bankName: bankAccount?.bankName || supabaseBankAccount?.bank_name || '',
      bankBalance: session.statementClosingBalance,
      adjustedBankBalance,
      bookBalance: session.bookClosingBalance || 0,
      adjustedBookBalance,
      outstandingDeposits,
      outstandingChecks,
      otherAdjustments,
      totalOutstandingDeposits,
      totalOutstandingChecks,
      totalOtherAdjustments,
      finalDifference,
      isReconciled: Math.abs(finalDifference) < 0.01,
    };
  },

  /**
   * Complete reconciliation
   */
  async completeReconciliation(sessionId: string): Promise<ReconciliationSession> {
    if (reconciliationApiEnabled()) {
      return reconciliationApi.completeSession(sessionId);
    }
    const summary = await this.generateSummary(sessionId);
    
    if (!summary.isReconciled) {
      throw new Error(`Reconciliation has a difference of ${summary.finalDifference.toFixed(2)}. Please resolve before completing.`);
    }

    // Update session
    const { data, error } = await supabase
      .from('reconciliation_sessions')
      .update({
        status: 'completed',
        book_closing_balance: summary.adjustedBookBalance,
        reconciled_at: new Date().toISOString(),
        difference: 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId)
      .select()
      .single();

    if (error) throw error;

    // Update bank account current balance
    await supabase
      .from('bank_accounts')
      .update({
        current_balance: summary.adjustedBankBalance,
        updated_at: new Date().toISOString(),
      })
      .eq('id', summary.session.bankAccountId);

    return mapSupabaseSessionToSession(data as SupabaseReconciliationSession);
  },
};

