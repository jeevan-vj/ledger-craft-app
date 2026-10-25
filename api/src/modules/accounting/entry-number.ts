import { and, eq, like } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { journalEntries } from '../../db/schema/accounts';

/**
 * Next sequential `JE-YYYY-NNN` number for an organisation.
 *
 * Uses max(sequence)+1 within the caller's transaction rather than count(*)+1,
 * so deleted draft journals (gaps) cannot make a new number collide with the
 * unique (organisation_id, entry_number) index. Non-numeric suffixes (e.g. the
 * random suffixes used by generic postings) are ignored.
 */
export async function nextJournalEntryNumber(tx: Database, organisationId: string, date: string): Promise<string> {
  const prefix = `JE-${date.slice(0, 4)}-`;
  const rows = await tx.select({ entryNumber: journalEntries.entryNumber }).from(journalEntries).where(and(
    eq(journalEntries.organisationId, organisationId),
    like(journalEntries.entryNumber, `${prefix}%`),
  ));
  let max = 0;
  for (const { entryNumber } of rows) {
    const suffix = entryNumber.slice(prefix.length);
    if (/^\d+$/.test(suffix)) max = Math.max(max, Number(suffix));
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}
