-- Compatibility product schema derived from src/types and service mappers.
-- Do not replay supabase/migrations. organisation_id is the Lane B tenant key.

CREATE OR REPLACE FUNCTION ledgercraft_apply_org_rls(p_table text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE format('ALTER TABLE %I OWNER TO ledgercraft_migrator', p_table);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I TO ledgercraft_app', p_table);
  EXECUTE format('GRANT SELECT ON TABLE %I TO ledgercraft_readonly', p_table);
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', p_table);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', p_table);
  EXECUTE format('DROP POLICY IF EXISTS %I ON %I', p_table || '_organisation', p_table);
  EXECUTE format(
    $policy$
    CREATE POLICY %I ON %I
      FOR ALL
      TO ledgercraft_app
      USING (
        organisation_id = NULLIF(current_setting('app.organisation_id', true), '')::uuid
      )
      WITH CHECK (
        organisation_id = NULLIF(current_setting('app.organisation_id', true), '')::uuid
      )
    $policy$,
    p_table || '_organisation',
    p_table
  );
END;
$$;

CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  country TEXT NOT NULL DEFAULT 'NZ',
  phone TEXT,
  is_vip BOOLEAN,
  tags TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE business_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  country TEXT NOT NULL DEFAULT 'NZ',
  tax_id TEXT,
  logo_url TEXT,
  website TEXT,
  default_tax_rate NUMERIC(9, 4),
  default_terms TEXT,
  default_notes TEXT,
  bank_info TEXT,
  theme JSONB,
  invoice_number_format TEXT,
  invoice_number_sequence INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE item_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK (type IN ('product', 'service')),
  category_id UUID REFERENCES item_categories (id) ON DELETE SET NULL,
  sale_price NUMERIC(19, 4),
  purchase_price NUMERIC(19, 4),
  tax_rate NUMERIC(9, 4),
  enable_sale_info BOOLEAN NOT NULL DEFAULT false,
  enable_purchase_info BOOLEAN NOT NULL DEFAULT false,
  unit TEXT NOT NULL DEFAULT 'ea',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL,
  user_id UUID NOT NULL,
  invoice_number TEXT NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers (id) ON DELETE RESTRICT,
  date DATE NOT NULL,
  due_date DATE NOT NULL,
  subtotal NUMERIC(19, 4) NOT NULL CHECK (subtotal >= 0),
  tax_amount NUMERIC(19, 4) NOT NULL CHECK (tax_amount >= 0),
  discount NUMERIC(19, 4),
  additional_charges NUMERIC(19, 4),
  additional_charges_list JSONB,
  additional_charges_total NUMERIC(19, 4),
  total NUMERIC(19, 4) NOT NULL CHECK (total >= 0),
  total_paid NUMERIC(19, 4) NOT NULL DEFAULT 0 CHECK (total_paid >= 0),
  balance_due NUMERIC(19, 4) NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'partially_paid', 'paid', 'overdue', 'cancelled')),
  tax_inclusive BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'paid', 'overdue')),
  notes TEXT,
  terms TEXT,
  currency TEXT NOT NULL DEFAULT 'NZD',
  template_name TEXT,
  public_viewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, invoice_number)
);

CREATE TABLE line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL,
  invoice_id UUID NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC(19, 4) NOT NULL CHECK (quantity > 0),
  unit TEXT NOT NULL DEFAULT 'ea',
  rate NUMERIC(19, 4) NOT NULL CHECK (rate >= 0),
  rate_unit TEXT NOT NULL DEFAULT 'ea',
  tax NUMERIC(19, 4),
  total NUMERIC(19, 4) NOT NULL CHECK (total >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NZD',
  opening_balance NUMERIC(19, 4) NOT NULL DEFAULT 0,
  current_balance NUMERIC(19, 4) NOT NULL DEFAULT 0,
  account_number TEXT,
  account_class TEXT,
  normal_balance TEXT CHECK (normal_balance IN ('debit', 'credit')),
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  parent_account_id UUID REFERENCES accounts (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE account_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_class TEXT NOT NULL,
  account_type TEXT NOT NULL,
  normal_balance TEXT NOT NULL CHECK (normal_balance IN ('debit', 'credit')),
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT true,
  country_code TEXT NOT NULL DEFAULT 'NZ',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (country_code, account_number)
);

CREATE TABLE expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL,
  user_id UUID NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC(19, 4) NOT NULL CHECK (amount >= 0),
  category_id UUID REFERENCES expense_categories (id) ON DELETE SET NULL,
  account_id UUID REFERENCES accounts (id) ON DELETE SET NULL,
  vendor_name TEXT,
  receipt_url TEXT,
  expense_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  is_billable BOOLEAN NOT NULL DEFAULT false,
  customer_id UUID REFERENCES customers (id) ON DELETE SET NULL,
  tax_amount NUMERIC(19, 4) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  currency TEXT NOT NULL DEFAULT 'NZD',
  payment_method TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL,
  user_id UUID NOT NULL,
  invoice_id UUID NOT NULL REFERENCES invoices (id) ON DELETE RESTRICT,
  payment_method TEXT NOT NULL,
  amount NUMERIC(19, 4) NOT NULL CHECK (amount >= 0),
  payment_date DATE NOT NULL,
  reference_number TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'completed'
    CHECK (status IN ('pending', 'completed', 'failed', 'cancelled', 'refunded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL,
  user_id UUID NOT NULL,
  payment_id UUID NOT NULL REFERENCES payments (id) ON DELETE CASCADE,
  receipt_number TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  email_sent_at TIMESTAMPTZ,
  is_emailed BOOLEAN NOT NULL DEFAULT false,
  receipt_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tax_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL,
  user_id UUID NOT NULL,
  country_code TEXT NOT NULL DEFAULT 'NZ',
  tax_type TEXT NOT NULL CHECK (tax_type IN ('GST', 'VAT', 'Sales_Tax')),
  tax_rate NUMERIC(9, 4) NOT NULL,
  tax_name TEXT NOT NULL,
  applies_to_services BOOLEAN NOT NULL DEFAULT true,
  applies_to_goods BOOLEAN NOT NULL DEFAULT true,
  effective_from DATE NOT NULL,
  effective_to DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tax_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL,
  user_id UUID NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  return_type TEXT NOT NULL CHECK (return_type IN ('GST', 'Income_Tax', 'PAYE')),
  total_sales NUMERIC(19, 4) NOT NULL DEFAULT 0,
  total_purchases NUMERIC(19, 4) NOT NULL DEFAULT 0,
  gst_on_sales NUMERIC(19, 4) NOT NULL DEFAULT 0,
  gst_on_purchases NUMERIC(19, 4) NOT NULL DEFAULT 0,
  net_gst NUMERIC(19, 4) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
  submitted_at TIMESTAMPTZ,
  ird_reference TEXT,
  return_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tax_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL,
  user_id UUID NOT NULL,
  tax_return_id UUID REFERENCES tax_returns (id) ON DELETE SET NULL,
  adjustment_type TEXT NOT NULL
    CHECK (adjustment_type IN ('bad_debt', 'capital_goods', 'correction', 'other')),
  description TEXT NOT NULL,
  amount NUMERIC(19, 4) NOT NULL,
  tax_impact NUMERIC(19, 4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL,
  user_id UUID NOT NULL,
  entry_number TEXT NOT NULL,
  entry_date DATE NOT NULL,
  description TEXT NOT NULL,
  reference_type TEXT,
  reference_id UUID,
  total_amount NUMERIC(19, 4) NOT NULL CHECK (total_amount >= 0),
  status TEXT NOT NULL DEFAULT 'posted'
    CHECK (status IN ('draft', 'posted', 'reversed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, entry_number)
);

CREATE TABLE journal_entry_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL,
  journal_entry_id UUID NOT NULL REFERENCES journal_entries (id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts (id) ON DELETE RESTRICT,
  description TEXT,
  debit_amount NUMERIC(19, 4) NOT NULL DEFAULT 0 CHECK (debit_amount >= 0),
  credit_amount NUMERIC(19, 4) NOT NULL DEFAULT 0 CHECK (credit_amount >= 0),
  line_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE shared_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL,
  original_invoice_id UUID NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
  invoice_data JSONB NOT NULL,
  template_data JSONB NOT NULL,
  share_token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ,
  access_count INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL,
  user_id UUID NOT NULL,
  title TEXT,
  context JSONB,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'paused')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL,
  conversation_id UUID NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL,
  user_id UUID NOT NULL,
  account_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  account_type TEXT NOT NULL
    CHECK (account_type IN ('checking', 'savings', 'credit_card', 'business')),
  currency TEXT NOT NULL DEFAULT 'NZD',
  opening_balance NUMERIC(19, 4) NOT NULL DEFAULT 0,
  current_balance NUMERIC(19, 4) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE bank_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL,
  user_id UUID NOT NULL,
  bank_account_id UUID NOT NULL REFERENCES bank_accounts (id) ON DELETE CASCADE,
  transaction_date DATE NOT NULL,
  description TEXT NOT NULL,
  reference TEXT,
  amount NUMERIC(19, 4) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('debit', 'credit')),
  balance NUMERIC(19, 4),
  category TEXT,
  merchant TEXT,
  is_reconciled BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE reconciliation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL,
  user_id UUID NOT NULL,
  bank_account_id UUID NOT NULL REFERENCES bank_accounts (id) ON DELETE CASCADE,
  statement_start_date DATE NOT NULL,
  statement_end_date DATE NOT NULL,
  statement_opening_balance NUMERIC(19, 4) NOT NULL,
  statement_closing_balance NUMERIC(19, 4) NOT NULL,
  book_opening_balance NUMERIC(19, 4) NOT NULL,
  book_closing_balance NUMERIC(19, 4),
  total_deposits NUMERIC(19, 4) NOT NULL DEFAULT 0,
  total_withdrawals NUMERIC(19, 4) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed', 'locked')),
  reconciled_at TIMESTAMPTZ,
  matched_count INTEGER NOT NULL DEFAULT 0,
  unmatched_bank_count INTEGER NOT NULL DEFAULT 0,
  unmatched_book_count INTEGER NOT NULL DEFAULT 0,
  adjustment_count INTEGER NOT NULL DEFAULT 0,
  difference NUMERIC(19, 4) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE reconciliation_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL,
  reconciliation_id UUID NOT NULL REFERENCES reconciliation_sessions (id) ON DELETE CASCADE,
  bank_transaction_id UUID REFERENCES bank_transactions (id) ON DELETE SET NULL,
  invoice_id UUID REFERENCES invoices (id) ON DELETE SET NULL,
  payment_id UUID REFERENCES payments (id) ON DELETE SET NULL,
  expense_id UUID REFERENCES expenses (id) ON DELETE SET NULL,
  journal_entry_id UUID REFERENCES journal_entries (id) ON DELETE SET NULL,
  match_type TEXT NOT NULL,
  confidence_score NUMERIC(5, 4) NOT NULL DEFAULT 0,
  bank_amount NUMERIC(19, 4),
  book_amount NUMERIC(19, 4),
  difference NUMERIC(19, 4) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'rejected', 'adjusted')),
  notes TEXT,
  matched_by UUID,
  matched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE reconciliation_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL,
  user_id UUID NOT NULL,
  reconciliation_id UUID NOT NULL REFERENCES reconciliation_sessions (id) ON DELETE CASCADE,
  adjustment_type TEXT NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC(19, 4) NOT NULL,
  affects_bank BOOLEAN NOT NULL DEFAULT false,
  affects_book BOOLEAN NOT NULL DEFAULT false,
  reference_type TEXT,
  reference_id UUID,
  reference_number TEXT,
  journal_entry_id UUID REFERENCES journal_entries (id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'applied', 'reversed')),
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE transaction_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL,
  user_id UUID NOT NULL,
  bank_account_id UUID NOT NULL REFERENCES bank_accounts (id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('csv', 'ofx', 'qif', 'pdf')),
  file_size INTEGER,
  total_rows INTEGER NOT NULL DEFAULT 0,
  imported_count INTEGER NOT NULL DEFAULT 0,
  duplicates_skipped INTEGER NOT NULL DEFAULT 0,
  errors_count INTEGER NOT NULL DEFAULT 0,
  earliest_date DATE,
  latest_date DATE,
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'completed', 'failed', 'partially_failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE account_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  organization TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE account_templates OWNER TO ledgercraft_migrator;
GRANT SELECT ON TABLE account_templates TO ledgercraft_app, ledgercraft_readonly;

SELECT ledgercraft_apply_org_rls('customers');
SELECT ledgercraft_apply_org_rls('business_profiles');
SELECT ledgercraft_apply_org_rls('item_categories');
SELECT ledgercraft_apply_org_rls('items');
SELECT ledgercraft_apply_org_rls('invoices');
SELECT ledgercraft_apply_org_rls('line_items');
SELECT ledgercraft_apply_org_rls('accounts');
SELECT ledgercraft_apply_org_rls('expense_categories');
SELECT ledgercraft_apply_org_rls('expenses');
SELECT ledgercraft_apply_org_rls('payments');
SELECT ledgercraft_apply_org_rls('receipts');
SELECT ledgercraft_apply_org_rls('tax_configurations');
SELECT ledgercraft_apply_org_rls('tax_returns');
SELECT ledgercraft_apply_org_rls('tax_adjustments');
SELECT ledgercraft_apply_org_rls('journal_entries');
SELECT ledgercraft_apply_org_rls('journal_entry_lines');
SELECT ledgercraft_apply_org_rls('shared_invoices');
SELECT ledgercraft_apply_org_rls('conversations');
SELECT ledgercraft_apply_org_rls('conversation_messages');
SELECT ledgercraft_apply_org_rls('bank_accounts');
SELECT ledgercraft_apply_org_rls('bank_transactions');
SELECT ledgercraft_apply_org_rls('reconciliation_sessions');
SELECT ledgercraft_apply_org_rls('reconciliation_matches');
SELECT ledgercraft_apply_org_rls('reconciliation_adjustments');
SELECT ledgercraft_apply_org_rls('transaction_import_batches');
SELECT ledgercraft_apply_org_rls('account_contacts');
