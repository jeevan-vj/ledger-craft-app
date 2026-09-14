import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

process.env.NODE_ENV = 'test';
// Never derive this from the production database URL or a developer's .env.
const testDirectory = mkdtempSync(join(tmpdir(), 'ledgercraft-sqlite-test-'));
process.env.DATABASE_URL = pathToFileURL(join(testDirectory, 'ledgercraft_test.sqlite')).href;
process.env.DATABASE_MIGRATE_URL = process.env.DATABASE_URL;
delete process.env.DATABASE_ADMIN_URL;
process.env.BETTER_AUTH_SECRET = 'test-only-better-auth-secret-32ch';
process.env.BETTER_AUTH_URL = 'http://localhost:8080';
process.env.BETTER_AUTH_TRUSTED_ORIGINS = 'http://localhost:8080';
