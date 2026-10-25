-- Read-only verification for 20261026090000_lock_down_accounts_rls_and_security_definer_functions.sql
-- Run in the SQL editor (or psql) after applying the migration. Every row should show ok = true.
-- Makes no changes.

WITH checks AS (
  SELECT 'accounts RLS enabled' AS check_name,
         c.relrowsecurity AS ok
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'accounts'

  UNION ALL
  SELECT 'accounts has select/insert/update/delete owner policies',
         count(*) FILTER (WHERE policyname IN ('accounts_select_own','accounts_insert_own','accounts_update_own','accounts_delete_own')) = 4
  FROM pg_policies WHERE schemaname = 'public' AND tablename = 'accounts'

  UNION ALL
  SELECT 'anon has no privileges on public.accounts',
         NOT (has_table_privilege('anon', 'public.accounts', 'SELECT')
           OR has_table_privilege('anon', 'public.accounts', 'INSERT')
           OR has_table_privilege('anon', 'public.accounts', 'UPDATE')
           OR has_table_privilege('anon', 'public.accounts', 'DELETE'))

  UNION ALL
  SELECT 'anon cannot EXECUTE ' || p.oid::regprocedure::text,
         NOT has_function_privilege('anon', p.oid, 'EXECUTE')
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prosecdef

  UNION ALL
  SELECT 'authenticated cannot EXECUTE ' || p.oid::regprocedure::text,
         NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('handle_new_user', 'create_default_accounts_for_user', 'generate_receipt_number')

  UNION ALL
  SELECT 'authenticated keeps EXECUTE on update_invoice_payment_status (payments trigger)',
         has_function_privilege('authenticated', 'public.update_invoice_payment_status(uuid)', 'EXECUTE')

  UNION ALL
  SELECT 'search_path pinned on ' || p.oid::regprocedure::text,
         EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) cfg WHERE cfg LIKE 'search_path=%')
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
)
SELECT check_name, ok FROM checks ORDER BY ok, check_name;
