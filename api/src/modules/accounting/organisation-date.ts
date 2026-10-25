import { eq } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { organisationLocalizationSettings } from '../../db/schema/currency';

export const DEFAULT_ORGANISATION_TIMEZONE = 'Pacific/Auckland';

/** Calendar date (YYYY-MM-DD) of `now` in `timeZone`, falling back to NZ time for unknown zones. */
export function localDateIn(now: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  } catch {
    return new Intl.DateTimeFormat('en-CA', { timeZone: DEFAULT_ORGANISATION_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  }
}

/**
 * The organisation's "today" for system-dated journals (cancel, void, restore).
 * Using the UTC date would back-date NZ actions taken before 13:00 NZDT into the
 * previous day, and across a quarter boundary, into the previous GST period.
 */
export async function organisationToday(tx: Database, organisationId: string, now: Date = new Date()): Promise<string> {
  const [settings] = await tx.select({ timezone: organisationLocalizationSettings.timezone })
    .from(organisationLocalizationSettings)
    .where(eq(organisationLocalizationSettings.organisationId, organisationId))
    .limit(1);
  return localDateIn(now, settings?.timezone ?? DEFAULT_ORGANISATION_TIMEZONE);
}
