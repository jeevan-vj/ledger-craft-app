/**
 * Finds active invoices left with a zero net ledger by the old restore-cycle
 * bug (cancellation journals outnumber restore journals) and optionally posts
 * the missing restore journals.
 *
 *   pnpm --filter ./api repair:invoice-restores            # dry run (default)
 *   pnpm --filter ./api repair:invoice-restores -- --apply # post missing journals
 *
 * Runs against DATABASE_URL via the local SQLite driver only; it has no
 * production (D1) binding. Idempotent: a second --apply posts nothing.
 */
import { createDb } from '../src/db/local';
import { getDatabaseUrl } from '../src/env';
import { repairInvoiceRestoreJournals } from '../src/modules/invoices/restore-repair';

async function main() {
  const apply = process.argv.includes('--apply');
  const { db, sql } = createDb(getDatabaseUrl());
  try {
    const result = await repairInvoiceRestoreJournals(db, { apply });
    console.log(JSON.stringify({
      mode: apply ? 'apply' : 'dry-run',
      candidates: result.candidates,
      journalsPosted: result.journalsPosted,
    }, null, 2));
    if (!apply && result.candidates.length) console.log('Dry run only. Re-run with --apply to post the missing restore journals.');
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
