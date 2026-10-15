-- Isolated database for API Vitest. Do not point the API process at this name.
CREATE DATABASE ledgercraft_test;

GRANT CONNECT ON DATABASE ledgercraft_test TO ledgercraft_migrator, ledgercraft_app, ledgercraft_readonly;
GRANT CREATE ON DATABASE ledgercraft_test TO ledgercraft_migrator;

\connect ledgercraft_test

GRANT USAGE, CREATE ON SCHEMA public TO ledgercraft_migrator;
GRANT USAGE ON SCHEMA public TO ledgercraft_app, ledgercraft_readonly;

ALTER SCHEMA public OWNER TO ledgercraft_migrator;

ALTER DEFAULT PRIVILEGES FOR ROLE ledgercraft_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ledgercraft_app;

ALTER DEFAULT PRIVILEGES FOR ROLE ledgercraft_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO ledgercraft_app;

ALTER DEFAULT PRIVILEGES FOR ROLE ledgercraft_migrator IN SCHEMA public
  GRANT SELECT ON TABLES TO ledgercraft_readonly;
