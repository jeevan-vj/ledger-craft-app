-- Security lockdown for the legacy hosted Supabase project (invoicegen / viqckjmborlqaemavrzu).
--
-- Findings addressed (Supabase security advisor, verified read-only on 2026-10-26 NZDT):
--   1. rls_disabled_in_public: public.accounts has RLS disabled (anon key can read/write every row).
--   2. anon_/authenticated_security_definer_function_executable: six SECURITY DEFINER
--      functions are executable by anon and authenticated through /rest/v1/rpc.
--   3. function_search_path_mutable: nine functions have no fixed search_path.
--
-- The app on main no longer talks to Supabase (Hono API + Cloudflare Durable Object SQLite).
-- No code on main calls any of these RPCs against a live client, so nothing is kept anon-callable.
--
-- Idempotent: every statement can be re-run safely.
-- NOT auto-applied. Apply manually after review (see PR body for rollback notes).

------------------------------------------------------------------------------
-- 1. public.accounts: enable RLS with owner-scoped policies (owner column: user_id -> auth.users.id)
------------------------------------------------------------------------------
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "accounts_select_own" ON public.accounts;
CREATE POLICY "accounts_select_own" ON public.accounts
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "accounts_insert_own" ON public.accounts;
CREATE POLICY "accounts_insert_own" ON public.accounts
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "accounts_update_own" ON public.accounts;
CREATE POLICY "accounts_update_own" ON public.accounts
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "accounts_delete_own" ON public.accounts;
CREATE POLICY "accounts_delete_own" ON public.accounts
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- Defence in depth: anonymous callers have no business touching the chart of accounts.
REVOKE ALL ON TABLE public.accounts FROM anon;

------------------------------------------------------------------------------
-- 2. Fix mutable search_path (9 advisor-flagged functions).
--    search_path = '' and every table/function reference is schema-qualified.
--    Bodies are otherwise identical to the live definitions read on 2026-10-26.
--    CREATE OR REPLACE keeps the owner, existing grants and trigger bindings.
------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.calculate_reconciliation_difference(session_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SET search_path = ''
AS $function$
DECLARE
  v_statement_closing DECIMAL;
  v_book_closing DECIMAL;
  v_adjustments DECIMAL;
BEGIN
  SELECT statement_closing_balance, book_closing_balance
  INTO v_statement_closing, v_book_closing
  FROM public.reconciliation_sessions WHERE id = session_id;

  SELECT COALESCE(SUM(
    CASE
      WHEN affects_bank THEN amount
      WHEN affects_book THEN -amount
      ELSE 0
    END
  ), 0)
  INTO v_adjustments
  FROM public.reconciliation_adjustments
  WHERE reconciliation_id = session_id AND status = 'applied';

  RETURN v_statement_closing - COALESCE(v_book_closing, 0) - v_adjustments;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_default_accounts_for_user(user_uuid uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
BEGIN
  -- Check if user already has accounts
  IF EXISTS (SELECT 1 FROM public.accounts WHERE user_id = user_uuid) THEN
    RETURN;
  END IF;

  INSERT INTO public.accounts (user_id, name, type, currency, opening_balance, current_balance, account_number, account_class, normal_balance, description, is_active) VALUES
    (user_uuid, 'Business Checking Account', 'bank', 'NZD', 0, 0, '1110', 'Asset', 'debit', 'Primary business bank account', true),
    (user_uuid, 'Accounts Receivable', 'custom', 'NZD', 0, 0, '1200', 'Asset', 'debit', 'Money owed by customers', true),
    (user_uuid, 'Inventory', 'custom', 'NZD', 0, 0, '1300', 'Asset', 'debit', 'Products and materials for sale', true),
    (user_uuid, 'Office Equipment', 'custom', 'NZD', 0, 0, '1500', 'Asset', 'debit', 'Computers, furniture, and office equipment', true),
    (user_uuid, 'Vehicles', 'custom', 'NZD', 0, 0, '1600', 'Asset', 'debit', 'Company vehicles', true),
    (user_uuid, 'Accounts Payable', 'custom', 'NZD', 0, 0, '2100', 'Liability', 'credit', 'Money owed to suppliers', true),
    (user_uuid, 'GST Payable', 'custom', 'NZD', 0, 0, '2200', 'Liability', 'credit', 'GST collected and owing to IRD', true),
    (user_uuid, 'PAYE Payable', 'custom', 'NZD', 0, 0, '2300', 'Liability', 'credit', 'PAYE tax owed to IRD', true),
    (user_uuid, 'Credit Card', 'credit_card', 'NZD', 0, 0, '2400', 'Liability', 'credit', 'Business credit card balance', true),
    (user_uuid, 'Owner Equity', 'custom', 'NZD', 0, 0, '3100', 'Equity', 'credit', 'Owner investment in business', true),
    (user_uuid, 'Retained Earnings', 'custom', 'NZD', 0, 0, '3200', 'Equity', 'credit', 'Accumulated business profits', true),
    (user_uuid, 'Service Revenue', 'custom', 'NZD', 0, 0, '4000', 'Revenue', 'credit', 'Income from services provided', true),
    (user_uuid, 'Product Sales', 'custom', 'NZD', 0, 0, '4100', 'Revenue', 'credit', 'Income from product sales', true),
    (user_uuid, 'Interest Income', 'custom', 'NZD', 0, 0, '4200', 'Revenue', 'credit', 'Interest earned on bank accounts', true),
    (user_uuid, 'Office Rent', 'custom', 'NZD', 0, 0, '6000', 'Expense', 'debit', 'Monthly office rent payments', true),
    (user_uuid, 'Utilities', 'custom', 'NZD', 0, 0, '6100', 'Expense', 'debit', 'Electricity, water, internet, phone', true),
    (user_uuid, 'Office Supplies', 'custom', 'NZD', 0, 0, '6200', 'Expense', 'debit', 'Stationery, printer ink, etc.', true),
    (user_uuid, 'Marketing & Advertising', 'custom', 'NZD', 0, 0, '6300', 'Expense', 'debit', 'Promotional and advertising costs', true),
    (user_uuid, 'Professional Services', 'custom', 'NZD', 0, 0, '6400', 'Expense', 'debit', 'Legal, accounting, consulting fees', true),
    (user_uuid, 'Travel & Entertainment', 'custom', 'NZD', 0, 0, '6500', 'Expense', 'debit', 'Business travel and client entertainment', true),
    (user_uuid, 'Insurance', 'custom', 'NZD', 0, 0, '6600', 'Expense', 'debit', 'Business insurance premiums', true),
    (user_uuid, 'Bank Fees', 'custom', 'NZD', 0, 0, '6700', 'Expense', 'debit', 'Bank account and transaction fees', true),
    (user_uuid, 'Depreciation', 'custom', 'NZD', 0, 0, '6800', 'Expense', 'debit', 'Asset depreciation expense', true),
    (user_uuid, 'Other Expenses', 'custom', 'NZD', 0, 0, '6900', 'Expense', 'debit', 'Miscellaneous business expenses', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_receipt_number(user_uuid uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
    current_year text;
    current_month text;
    receipt_count integer;
    receipt_number text;
BEGIN
    current_year := EXTRACT(year FROM now())::text;
    current_month := LPAD(EXTRACT(month FROM now())::text, 2, '0');

    SELECT COUNT(*) INTO receipt_count
    FROM public.receipts
    WHERE user_id = user_uuid
    AND EXTRACT(year FROM created_at) = EXTRACT(year FROM now())
    AND EXTRACT(month FROM created_at) = EXTRACT(month FROM now());

    receipt_number := 'REC-' || current_year || current_month || '-' || LPAD((receipt_count + 1)::text, 4, '0');

    RETURN receipt_number;
END;
$function$;

-- Body already schema-qualifies public.profiles; only pin the search_path.
ALTER FUNCTION public.handle_new_user() SET search_path = '';

CREATE OR REPLACE FUNCTION public.trigger_update_invoice_payment_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = ''
AS $function$
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        PERFORM public.update_invoice_payment_status(NEW.invoice_id);
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        PERFORM public.update_invoice_payment_status(OLD.invoice_id);
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_conversation_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = ''
AS $function$
BEGIN
    UPDATE public.conversations
    SET updated_at = timezone('utc'::text, now())
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_invoice_payment_status(invoice_uuid uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
    invoice_total numeric;
    total_payments numeric;
    new_payment_status text;
    new_balance_due numeric;
BEGIN
    SELECT total INTO invoice_total FROM public.invoices WHERE id = invoice_uuid;

    SELECT COALESCE(SUM(amount), 0) INTO total_payments
    FROM public.payments
    WHERE invoice_id = invoice_uuid AND status = 'completed';

    new_balance_due := invoice_total - total_payments;

    IF total_payments = 0 THEN
        new_payment_status := 'unpaid';
    ELSIF total_payments >= invoice_total THEN
        new_payment_status := 'paid';
        new_balance_due := 0;
    ELSE
        new_payment_status := 'partially_paid';
    END IF;

    UPDATE public.invoices
    SET
        total_paid = total_payments,
        payment_status = new_payment_status,
        balance_due = new_balance_due,
        updated_at = now()
    WHERE id = invoice_uuid;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_reconciliation_stats()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = ''
AS $function$
BEGIN
  UPDATE public.reconciliation_sessions
  SET
    matched_count = (
      SELECT COUNT(*) FROM public.reconciliation_matches
      WHERE reconciliation_id = COALESCE(NEW.reconciliation_id, OLD.reconciliation_id)
      AND status = 'confirmed'
      AND match_type NOT IN ('unmatched_bank', 'unmatched_book')
    ),
    unmatched_bank_count = (
      SELECT COUNT(*) FROM public.reconciliation_matches
      WHERE reconciliation_id = COALESCE(NEW.reconciliation_id, OLD.reconciliation_id)
      AND match_type = 'unmatched_bank'
    ),
    unmatched_book_count = (
      SELECT COUNT(*) FROM public.reconciliation_matches
      WHERE reconciliation_id = COALESCE(NEW.reconciliation_id, OLD.reconciliation_id)
      AND match_type = 'unmatched_book'
    ),
    updated_at = NOW()
  WHERE id = COALESCE(NEW.reconciliation_id, OLD.reconciliation_id);

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Body has no table references; only pin the search_path.
ALTER FUNCTION public.update_updated_at_column() SET search_path = '';

------------------------------------------------------------------------------
-- 3. Lock down EXECUTE on the six SECURITY DEFINER functions.
------------------------------------------------------------------------------

-- Trigger function (auth.users AFTER INSERT): never callable over RPC.
-- Triggers do not check EXECUTE when they fire, so signup keeps working.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Take an arbitrary user_uuid, so any caller could act on another user's data. No caller on main.
REVOKE EXECUTE ON FUNCTION public.create_default_accounts_for_user(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_receipt_number(uuid) FROM PUBLIC, anon, authenticated;

-- Called by trigger_update_invoice_payment_status (SECURITY INVOKER) when an authenticated
-- user writes public.payments, so authenticated must keep EXECUTE.
REVOKE EXECUTE ON FUNCTION public.update_invoice_payment_status(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.update_invoice_payment_status(uuid) TO authenticated;

-- Shared-invoice RPCs: the live share page (src/pages/SharedInvoice.tsx) uses the Hono API
-- (invoicesApi.getShared). The only Supabase caller (supabaseService.getSharedInvoiceByToken)
-- goes through the removed-Supabase stub, so anon does not need these.
REVOKE EXECUTE ON FUNCTION public.get_shared_invoice_by_token(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.increment_shared_invoice_access(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_shared_invoice_by_token(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.increment_shared_invoice_access(uuid) TO authenticated;

-- service_role keeps EXECUTE on everything (explicit, in case it only had it via PUBLIC).
GRANT EXECUTE ON FUNCTION
  public.handle_new_user(),
  public.create_default_accounts_for_user(uuid),
  public.generate_receipt_number(uuid),
  public.update_invoice_payment_status(uuid),
  public.get_shared_invoice_by_token(uuid),
  public.increment_shared_invoice_access(uuid)
TO service_role;

------------------------------------------------------------------------------
-- 4. NOT ENABLED - needs a decision. Separate finding from the same review:
--    public.invoices has policy "Allow public read" (FOR SELECT USING (true)), so the anon key
--    can read every invoice. Only the stubbed legacy PublicInvoice page relied on it.
--    Uncomment to close it:
-- DROP POLICY IF EXISTS "Allow public read" ON public.invoices;
------------------------------------------------------------------------------
