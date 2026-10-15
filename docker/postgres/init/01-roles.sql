-- Local/CI roles. Passwords are for empty local databases only.

CREATE ROLE ledgercraft_migrator LOGIN PASSWORD 'migrator'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS;

CREATE ROLE ledgercraft_app LOGIN PASSWORD 'app'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;

CREATE ROLE ledgercraft_readonly LOGIN PASSWORD 'readonly'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;

GRANT CONNECT ON DATABASE ledgercraft TO ledgercraft_migrator, ledgercraft_app, ledgercraft_readonly;
-- Drizzle migrator creates the "drizzle" schema; CREATE on the database is required.
GRANT CREATE ON DATABASE ledgercraft TO ledgercraft_migrator;

GRANT USAGE, CREATE ON SCHEMA public TO ledgercraft_migrator;
GRANT USAGE ON SCHEMA public TO ledgercraft_app, ledgercraft_readonly;

ALTER SCHEMA public OWNER TO ledgercraft_migrator;

ALTER DEFAULT PRIVILEGES FOR ROLE ledgercraft_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ledgercraft_app;

ALTER DEFAULT PRIVILEGES FOR ROLE ledgercraft_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO ledgercraft_app;

ALTER DEFAULT PRIVILEGES FOR ROLE ledgercraft_migrator IN SCHEMA public
  GRANT SELECT ON TABLES TO ledgercraft_readonly;
