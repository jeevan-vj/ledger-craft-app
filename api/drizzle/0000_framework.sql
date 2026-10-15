CREATE TABLE IF NOT EXISTS rls_probe (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL,
  label TEXT NOT NULL
);

ALTER TABLE rls_probe OWNER TO ledgercraft_migrator;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE rls_probe TO ledgercraft_app;
GRANT SELECT ON TABLE rls_probe TO ledgercraft_readonly;

ALTER TABLE rls_probe ENABLE ROW LEVEL SECURITY;
ALTER TABLE rls_probe FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_probe_organisation ON rls_probe;
CREATE POLICY rls_probe_organisation ON rls_probe
  FOR ALL
  TO ledgercraft_app
  USING (
    organisation_id = NULLIF(current_setting('app.organisation_id', true), '')::uuid
  )
  WITH CHECK (
    organisation_id = NULLIF(current_setting('app.organisation_id', true), '')::uuid
  );
