-- Bank Reconciliation System Migration
-- Professional accounting-grade reconciliation for LedgerCraft

-- 1. Bank Transactions Table (if not exists)
CREATE TABLE IF NOT EXISTS bank_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_id UUID REFERENCES bank_accounts(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  transaction_date DATE NOT NULL,
  description TEXT NOT NULL,
  reference VARCHAR(100),
  amount DECIMAL(12,2) NOT NULL,
  type VARCHAR(10) NOT NULL CHECK (type IN ('debit', 'credit')),
  balance DECIMAL(12,2),
  category VARCHAR(100),
  merchant VARCHAR(255),
  is_reconciled BOOLEAN DEFAULT false,
  reconciliation_id UUID,
  matched_record_type VARCHAR(50), -- 'invoice', 'payment', 'expense', 'journal_entry', 'manual'
  matched_record_id UUID,
  notes TEXT,
  import_batch_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Reconciliation Sessions Table
CREATE TABLE IF NOT EXISTS reconciliation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_id UUID REFERENCES bank_accounts(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  
  -- Period being reconciled
  statement_start_date DATE NOT NULL,
  statement_end_date DATE NOT NULL,
  
  -- Bank Statement Balances
  statement_opening_balance DECIMAL(12,2) NOT NULL,
  statement_closing_balance DECIMAL(12,2) NOT NULL,
  
  -- Book Balances (from our records)
  book_opening_balance DECIMAL(12,2) NOT NULL,
  book_closing_balance DECIMAL(12,2),
  
  -- Calculated fields
  total_deposits DECIMAL(12,2) DEFAULT 0,
  total_withdrawals DECIMAL(12,2) DEFAULT 0,
  
  -- Reconciliation status
  status VARCHAR(20) DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'locked')),
  reconciled_at TIMESTAMP WITH TIME ZONE,
  
  -- Summary
  matched_count INTEGER DEFAULT 0,
  unmatched_bank_count INTEGER DEFAULT 0,
  unmatched_book_count INTEGER DEFAULT 0,
  adjustment_count INTEGER DEFAULT 0,
  
  -- Difference (should be zero when completed)
  difference DECIMAL(12,2) DEFAULT 0,
  
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Reconciliation Matches Table
CREATE TABLE IF NOT EXISTS reconciliation_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_id UUID REFERENCES reconciliation_sessions(id) ON DELETE CASCADE NOT NULL,
  
  -- Bank side
  bank_transaction_id UUID REFERENCES bank_transactions(id) ON DELETE SET NULL,
  
  -- Book side (one of these will be populated)
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  payment_id UUID,
  expense_id UUID REFERENCES expenses(id) ON DELETE SET NULL,
  journal_entry_id UUID,
  
  -- Match details
  match_type VARCHAR(30) NOT NULL CHECK (match_type IN (
    'auto_exact',      -- Automatic exact match
    'auto_fuzzy',      -- Automatic fuzzy match
    'manual',          -- User manually matched
    'split',           -- One bank transaction matched to multiple records
    'combined',        -- Multiple bank transactions matched to one record
    'unmatched_bank',  -- Bank transaction with no book match
    'unmatched_book'   -- Book entry with no bank match
  )),
  
  -- Match quality score (0-100)
  confidence_score INTEGER DEFAULT 100,
  
  -- Amounts for verification
  bank_amount DECIMAL(12,2),
  book_amount DECIMAL(12,2),
  difference DECIMAL(12,2) DEFAULT 0,
  
  -- Status
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected', 'adjusted')),
  
  notes TEXT,
  matched_by UUID REFERENCES auth.users(id),
  matched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Reconciliation Adjustments Table
CREATE TABLE IF NOT EXISTS reconciliation_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_id UUID REFERENCES reconciliation_sessions(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  
  -- Adjustment details
  adjustment_type VARCHAR(30) NOT NULL CHECK (adjustment_type IN (
    'outstanding_check',    -- Check written but not cleared
    'deposit_in_transit',   -- Deposit made but not credited
    'bank_error',           -- Error by the bank
    'book_error',           -- Error in our books
    'bank_fee',             -- Bank fees not recorded
    'interest_earned',      -- Interest not recorded
    'nsf_check',            -- Non-sufficient funds
    'other'
  )),
  
  description TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  
  -- Which side to adjust
  affects_bank BOOLEAN DEFAULT false,  -- Adjust bank balance
  affects_book BOOLEAN DEFAULT false,  -- Adjust book balance
  
  -- Link to source document
  reference_type VARCHAR(50),
  reference_id UUID,
  reference_number VARCHAR(100),
  
  -- Optional: Create journal entry for adjustment
  journal_entry_id UUID,
  
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'reversed')),
  applied_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Import Batches Table (for tracking file imports)
CREATE TABLE IF NOT EXISTS transaction_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_id UUID REFERENCES bank_accounts(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  
  file_name VARCHAR(255) NOT NULL,
  file_type VARCHAR(20) NOT NULL, -- 'csv', 'ofx', 'qif', 'pdf'
  file_size INTEGER,
  
  -- Import results
  total_rows INTEGER DEFAULT 0,
  imported_count INTEGER DEFAULT 0,
  duplicates_skipped INTEGER DEFAULT 0,
  errors_count INTEGER DEFAULT 0,
  
  -- Date range of transactions
  earliest_date DATE,
  latest_date DATE,
  
  -- Processing status
  status VARCHAR(20) DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed', 'partially_failed')),
  error_message TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_bank_transactions_account ON bank_transactions(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_date ON bank_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_reconciled ON bank_transactions(is_reconciled);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_user ON bank_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_matched ON bank_transactions(matched_record_type, matched_record_id);

CREATE INDEX IF NOT EXISTS idx_reconciliation_sessions_account ON reconciliation_sessions(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_sessions_user ON reconciliation_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_sessions_status ON reconciliation_sessions(status);

CREATE INDEX IF NOT EXISTS idx_reconciliation_matches_session ON reconciliation_matches(reconciliation_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_matches_bank_tx ON reconciliation_matches(bank_transaction_id);

CREATE INDEX IF NOT EXISTS idx_reconciliation_adjustments_session ON reconciliation_adjustments(reconciliation_id);

CREATE INDEX IF NOT EXISTS idx_import_batches_account ON transaction_import_batches(bank_account_id);

-- Row Level Security
ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_import_batches ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can manage their own bank transactions" ON bank_transactions
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own reconciliation sessions" ON reconciliation_sessions
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can access matches through reconciliation sessions" ON reconciliation_matches
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM reconciliation_sessions rs 
      WHERE rs.id = reconciliation_matches.reconciliation_id 
      AND rs.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage their own reconciliation adjustments" ON reconciliation_adjustments
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own import batches" ON transaction_import_batches
  FOR ALL USING (auth.uid() = user_id);

-- Function to update reconciliation session statistics
CREATE OR REPLACE FUNCTION update_reconciliation_stats()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE reconciliation_sessions
  SET 
    matched_count = (
      SELECT COUNT(*) FROM reconciliation_matches 
      WHERE reconciliation_id = COALESCE(NEW.reconciliation_id, OLD.reconciliation_id)
      AND status = 'confirmed'
      AND match_type NOT IN ('unmatched_bank', 'unmatched_book')
    ),
    unmatched_bank_count = (
      SELECT COUNT(*) FROM reconciliation_matches 
      WHERE reconciliation_id = COALESCE(NEW.reconciliation_id, OLD.reconciliation_id)
      AND match_type = 'unmatched_bank'
    ),
    unmatched_book_count = (
      SELECT COUNT(*) FROM reconciliation_matches 
      WHERE reconciliation_id = COALESCE(NEW.reconciliation_id, OLD.reconciliation_id)
      AND match_type = 'unmatched_book'
    ),
    updated_at = NOW()
  WHERE id = COALESCE(NEW.reconciliation_id, OLD.reconciliation_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger for auto-updating stats
DROP TRIGGER IF EXISTS trigger_update_reconciliation_stats ON reconciliation_matches;
CREATE TRIGGER trigger_update_reconciliation_stats
  AFTER INSERT OR UPDATE OR DELETE ON reconciliation_matches
  FOR EACH ROW EXECUTE FUNCTION update_reconciliation_stats();

-- Function to calculate reconciliation difference
CREATE OR REPLACE FUNCTION calculate_reconciliation_difference(session_id UUID)
RETURNS DECIMAL AS $$
DECLARE
  v_statement_closing DECIMAL;
  v_book_closing DECIMAL;
  v_adjustments DECIMAL;
BEGIN
  SELECT statement_closing_balance, book_closing_balance
  INTO v_statement_closing, v_book_closing
  FROM reconciliation_sessions WHERE id = session_id;
  
  SELECT COALESCE(SUM(
    CASE 
      WHEN affects_bank THEN amount
      WHEN affects_book THEN -amount
      ELSE 0
    END
  ), 0)
  INTO v_adjustments
  FROM reconciliation_adjustments 
  WHERE reconciliation_id = session_id AND status = 'applied';
  
  RETURN v_statement_closing - v_book_closing - v_adjustments;
END;
$$ LANGUAGE plpgsql;

-- View for reconciliation summary
CREATE OR REPLACE VIEW reconciliation_summary AS
SELECT 
  rs.id,
  rs.bank_account_id,
  ba.account_name,
  ba.bank_name,
  rs.statement_start_date,
  rs.statement_end_date,
  rs.statement_opening_balance,
  rs.statement_closing_balance,
  rs.book_opening_balance,
  rs.book_closing_balance,
  rs.status,
  rs.matched_count,
  rs.unmatched_bank_count,
  rs.unmatched_book_count,
  calculate_reconciliation_difference(rs.id) as current_difference,
  rs.created_at,
  rs.reconciled_at
FROM reconciliation_sessions rs
JOIN bank_accounts ba ON rs.bank_account_id = ba.id;

