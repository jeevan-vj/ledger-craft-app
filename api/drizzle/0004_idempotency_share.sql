CREATE TABLE idempotency_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL,
  user_id UUID NOT NULL,
  key TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_status INTEGER NOT NULL,
  response_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, user_id, method, path, key)
);

SELECT ledgercraft_apply_org_rls('idempotency_keys');

CREATE OR REPLACE FUNCTION ledgercraft_get_shared_invoice(p_token text)
RETURNS TABLE (
  invoice_data JSONB,
  template_data JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE shared_invoices
  SET access_count = access_count + 1
  WHERE share_token = p_token
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now())
  RETURNING shared_invoices.invoice_data, shared_invoices.template_data;
END;
$$;

REVOKE ALL ON FUNCTION ledgercraft_get_shared_invoice(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ledgercraft_get_shared_invoice(text) TO ledgercraft_app;
