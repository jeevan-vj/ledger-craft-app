-- W3 identity: organisations, memberships, Better Auth tables.
-- Product table `accounts` is the chart of accounts — provider accounts live in auth_accounts.
-- Do not create a quoted singular "user" table.

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  email_verified BOOLEAN NOT NULL DEFAULT false,
  image TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expires_at TIMESTAMPTZ NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX sessions_user_id_idx ON sessions (user_id);

CREATE TABLE auth_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer TEXT NOT NULL,
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  access_token TEXT,
  refresh_token TEXT,
  id_token TEXT,
  access_token_expires_at TIMESTAMPTZ,
  refresh_token_expires_at TIMESTAMPTZ,
  scope TEXT,
  password TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (issuer, account_id)
);

CREATE INDEX auth_accounts_user_id_idx ON auth_accounts (user_id);

CREATE TABLE verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX verifications_identifier_idx ON verifications (identifier);

CREATE TABLE organisations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE organisation_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, user_id)
);

CREATE INDEX organisation_memberships_user_id_idx ON organisation_memberships (user_id);

DO $$
DECLARE
  auth_table text;
BEGIN
  FOREACH auth_table IN ARRAY ARRAY['users', 'sessions', 'auth_accounts', 'verifications']
  LOOP
    EXECUTE format('ALTER TABLE %I OWNER TO ledgercraft_migrator', auth_table);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I TO ledgercraft_app', auth_table);
    EXECUTE format('GRANT SELECT ON TABLE %I TO ledgercraft_readonly', auth_table);
  END LOOP;
END
$$;

ALTER TABLE organisations OWNER TO ledgercraft_migrator;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE organisations TO ledgercraft_app;
GRANT SELECT ON TABLE organisations TO ledgercraft_readonly;
ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organisations_isolation ON organisations;
CREATE POLICY organisations_isolation ON organisations
  FOR ALL
  TO ledgercraft_app
  USING (
    id = NULLIF(current_setting('app.organisation_id', true), '')::uuid
  )
  WITH CHECK (
    id = NULLIF(current_setting('app.organisation_id', true), '')::uuid
  );

ALTER TABLE organisation_memberships OWNER TO ledgercraft_migrator;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE organisation_memberships TO ledgercraft_app;
GRANT SELECT ON TABLE organisation_memberships TO ledgercraft_readonly;
ALTER TABLE organisation_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisation_memberships FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organisation_memberships_isolation ON organisation_memberships;
CREATE POLICY organisation_memberships_isolation ON organisation_memberships
  FOR ALL
  TO ledgercraft_app
  USING (
    organisation_id = NULLIF(current_setting('app.organisation_id', true), '')::uuid
    OR user_id::text = NULLIF(current_setting('app.user_id', true), '')
  )
  WITH CHECK (
    organisation_id = NULLIF(current_setting('app.organisation_id', true), '')::uuid
  );
