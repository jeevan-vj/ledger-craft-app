// Bank Reconciliation Types
// Professional accounting-grade reconciliation for LedgerCraft

// ===============================
// RECONCILIATION SESSION TYPES
// ===============================

export type ReconciliationStatus = 'in_progress' | 'completed' | 'locked';

export interface ReconciliationSession {
  id: string;
  bankAccountId: string;
  userId: string;
  
  // Period being reconciled
  statementStartDate: string;
  statementEndDate: string;
  
  // Bank Statement Balances
  statementOpeningBalance: number;
  statementClosingBalance: number;
  
  // Book Balances
  bookOpeningBalance: number;
  bookClosingBalance: number | null;
  
  // Calculated totals
  totalDeposits: number;
  totalWithdrawals: number;
  
  // Status
  status: ReconciliationStatus;
  reconciledAt: string | null;
  
  // Summary counts
  matchedCount: number;
  unmatchedBankCount: number;
  unmatchedBookCount: number;
  adjustmentCount: number;
  
  // Difference (should be 0 when completed)
  difference: number;
  
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupabaseReconciliationSession {
  id: string;
  bank_account_id: string;
  user_id: string;
  statement_start_date: string;
  statement_end_date: string;
  statement_opening_balance: number;
  statement_closing_balance: number;
  book_opening_balance: number;
  book_closing_balance: number | null;
  total_deposits: number;
  total_withdrawals: number;
  status: ReconciliationStatus;
  reconciled_at: string | null;
  matched_count: number;
  unmatched_bank_count: number;
  unmatched_book_count: number;
  adjustment_count: number;
  difference: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ===============================
// RECONCILIATION MATCH TYPES
// ===============================

export type MatchType = 
  | 'auto_exact'      // Automatic exact match
  | 'auto_fuzzy'      // Automatic fuzzy match
  | 'manual'          // User manually matched
  | 'split'           // One bank transaction matched to multiple records
  | 'combined'        // Multiple bank transactions matched to one record
  | 'unmatched_bank'  // Bank transaction with no book match
  | 'unmatched_book'; // Book entry with no bank match

export type MatchStatus = 'pending' | 'confirmed' | 'rejected' | 'adjusted';

export interface ReconciliationMatch {
  id: string;
  reconciliationId: string;
  
  // Bank side
  bankTransactionId: string | null;
  
  // Book side (one of these will be populated)
  invoiceId: string | null;
  paymentId: string | null;
  expenseId: string | null;
  journalEntryId: string | null;
  
  // Match details
  matchType: MatchType;
  confidenceScore: number;
  
  // Amounts
  bankAmount: number | null;
  bookAmount: number | null;
  difference: number;
  
  // Status
  status: MatchStatus;
  
  notes: string | null;
  matchedBy: string | null;
  matchedAt: string;
  createdAt: string;
}

export interface SupabaseReconciliationMatch {
  id: string;
  reconciliation_id: string;
  bank_transaction_id: string | null;
  invoice_id: string | null;
  payment_id: string | null;
  expense_id: string | null;
  journal_entry_id: string | null;
  match_type: MatchType;
  confidence_score: number;
  bank_amount: number | null;
  book_amount: number | null;
  difference: number;
  status: MatchStatus;
  notes: string | null;
  matched_by: string | null;
  matched_at: string;
  created_at: string;
}

// ===============================
// RECONCILIATION ADJUSTMENT TYPES
// ===============================

export type AdjustmentType = 
  | 'outstanding_check'    // Check written but not cleared
  | 'deposit_in_transit'   // Deposit made but not credited
  | 'bank_error'           // Error by the bank
  | 'book_error'           // Error in our books
  | 'bank_fee'             // Bank fees not recorded
  | 'interest_earned'      // Interest not recorded
  | 'nsf_check'            // Non-sufficient funds
  | 'other';

export type AdjustmentStatus = 'pending' | 'applied' | 'reversed';

export interface ReconciliationAdjustment {
  id: string;
  reconciliationId: string;
  userId: string;
  
  adjustmentType: AdjustmentType;
  description: string;
  amount: number;
  
  // Which side to adjust
  affectsBank: boolean;
  affectsBook: boolean;
  
  // Reference to source document
  referenceType: string | null;
  referenceId: string | null;
  referenceNumber: string | null;
  
  journalEntryId: string | null;
  
  status: AdjustmentStatus;
  appliedAt: string | null;
  
  createdAt: string;
  updatedAt: string;
}

export interface SupabaseReconciliationAdjustment {
  id: string;
  reconciliation_id: string;
  user_id: string;
  adjustment_type: AdjustmentType;
  description: string;
  amount: number;
  affects_bank: boolean;
  affects_book: boolean;
  reference_type: string | null;
  reference_id: string | null;
  reference_number: string | null;
  journal_entry_id: string | null;
  status: AdjustmentStatus;
  applied_at: string | null;
  created_at: string;
  updated_at: string;
}

// ===============================
// IMPORT BATCH TYPES
// ===============================

export type ImportBatchStatus = 'processing' | 'completed' | 'failed' | 'partially_failed';
export type ImportFileType = 'csv' | 'ofx' | 'qif' | 'pdf';

export interface TransactionImportBatch {
  id: string;
  bankAccountId: string;
  userId: string;
  
  fileName: string;
  fileType: ImportFileType;
  fileSize: number | null;
  
  totalRows: number;
  importedCount: number;
  duplicatesSkipped: number;
  errorsCount: number;
  
  earliestDate: string | null;
  latestDate: string | null;
  
  status: ImportBatchStatus;
  errorMessage: string | null;
  
  createdAt: string;
  completedAt: string | null;
}

export interface SupabaseTransactionImportBatch {
  id: string;
  bank_account_id: string;
  user_id: string;
  file_name: string;
  file_type: ImportFileType;
  file_size: number | null;
  total_rows: number;
  imported_count: number;
  duplicates_skipped: number;
  errors_count: number;
  earliest_date: string | null;
  latest_date: string | null;
  status: ImportBatchStatus;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

// ===============================
// UI & SERVICE TYPES
// ===============================

// For the reconciliation wizard
export interface ReconciliationSetup {
  bankAccountId: string;
  statementStartDate: string;
  statementEndDate: string;
  statementOpeningBalance: number;
  statementClosingBalance: number;
}

// For displaying matched items
export interface MatchableItem {
  id: string;
  type: 'bank_transaction' | 'invoice' | 'payment' | 'expense';
  date: string;
  description: string;
  amount: number;
  reference?: string;
  isReconciled: boolean;
  category?: string;
}

// For the matching UI
export interface SuggestedMatch {
  bankTransaction: MatchableItem;
  bookItem: MatchableItem;
  matchType: MatchType;
  confidenceScore: number;
  matchReasons: string[];
}

// Reconciliation summary for reports
export interface ReconciliationSummary {
  session: ReconciliationSession;
  bankAccountName: string;
  bankName: string;
  
  // Calculated values
  bankBalance: number;
  adjustedBankBalance: number;
  bookBalance: number;
  adjustedBookBalance: number;
  
  // Outstanding items
  outstandingDeposits: ReconciliationAdjustment[];
  outstandingChecks: ReconciliationAdjustment[];
  otherAdjustments: ReconciliationAdjustment[];
  
  // Totals
  totalOutstandingDeposits: number;
  totalOutstandingChecks: number;
  totalOtherAdjustments: number;
  
  // Final difference
  finalDifference: number;
  isReconciled: boolean;
}

// For the transactions list in reconciliation
export interface ReconciliationTransaction {
  id: string;
  date: string;
  description: string;
  reference: string | null;
  amount: number;
  type: 'debit' | 'credit';
  category: string | null;
  isCleared: boolean; // Cleared by bank
  isReconciled: boolean;
  matchId: string | null;
  matchedTo: {
    type: 'invoice' | 'payment' | 'expense' | 'journal_entry' | null;
    id: string | null;
    description: string | null;
  } | null;
}

// Reconciliation filter options
export interface ReconciliationFilters {
  dateFrom?: string;
  dateTo?: string;
  showReconciled?: boolean;
  showUnreconciled?: boolean;
  amountMin?: number;
  amountMax?: number;
  transactionType?: 'all' | 'debit' | 'credit';
  category?: string;
  searchTerm?: string;
}

// Bulk actions
export interface BulkMatchAction {
  bankTransactionIds: string[];
  bookItemIds: string[];
  matchType: MatchType;
}

// Auto-matching configuration
export interface AutoMatchConfig {
  enableExactMatch: boolean;
  enableFuzzyMatch: boolean;
  dateToleranceDays: number;
  amountTolerancePercent: number;
  matchByReference: boolean;
  matchByAmount: boolean;
  matchByDate: boolean;
  matchByDescription: boolean;
  minimumConfidenceScore: number;
}

// Standard bank file formats support
export interface OFXTransaction {
  fitId: string;
  date: string;
  amount: number;
  name: string;
  memo?: string;
  type: 'CREDIT' | 'DEBIT' | 'INT' | 'DIV' | 'FEE' | 'SRVCHG' | 'DEP' | 'ATM' | 'POS' | 'XFER' | 'CHECK' | 'PAYMENT' | 'CASH' | 'DIRECTDEP' | 'DIRECTDEBIT' | 'REPEATPMT' | 'OTHER';
  checkNum?: string;
  refNum?: string;
}

export interface QIFTransaction {
  date: string;
  amount: number;
  payee: string;
  memo?: string;
  category?: string;
  checkNumber?: string;
  clearedStatus: '' | '*' | 'c' | 'X' | 'R';
}

// Bank format detection
export interface BankFormatDetection {
  format: 'csv' | 'ofx' | 'qif' | 'unknown';
  bankName?: string;
  confidence: number;
  suggestedMapping?: {
    dateColumn?: string;
    descriptionColumn?: string;
    amountColumn?: string;
    typeColumn?: string;
    referenceColumn?: string;
    balanceColumn?: string;
  };
}

