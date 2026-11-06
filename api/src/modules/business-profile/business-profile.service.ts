import { isNzBusinessCountry, normalizeNzGstNumber, type BusinessProfileDto, type UpsertBusinessProfileRequest } from '@ledgercraft/contracts';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client';
import { withOrganisationTx } from '../auth/bind-organisation';
import * as repo from './business-profile.repository';
import { assertGstCalendarChangeAllowed } from '../tax/gst-calendar-lock';

export async function getBusinessProfileForUser(
  db: Database,
  userId: string,
): Promise<BusinessProfileDto | null> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    return (await repo.getBusinessProfile(tx, ctx.organisationId)) ?? null;
  });
}

export async function upsertBusinessProfileForUser(
  db: Database,
  userId: string,
  input: UpsertBusinessProfileRequest,
): Promise<BusinessProfileDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const current = await repo.getBusinessProfile(tx, ctx.organisationId);
    if (current) await assertGstCalendarChangeAllowed(tx, ctx.organisationId, current, input);
    const country = input.country ?? current?.country ?? 'NZ';
    const status = input.gstRegistrationStatus ?? current?.gstRegistrationStatus ?? 'unknown';
    const date = input.gstRegisteredFrom === undefined ? current?.gstRegisteredFrom : input.gstRegisteredFrom;
    if (isNzBusinessCountry(country) && status === 'registered' && (input.gstRegistrationStatus === 'registered' || input.gstRegisteredFrom !== undefined) && !date) {
      throw new HTTPException(400, { message: 'Add the effective GST registration date from your IRD registration before marking this NZ business as registered.' });
    }
    if (isNzBusinessCountry(country) && status === 'registered' && input.taxId !== undefined && input.taxId !== null) {
      const taxId = normalizeNzGstNumber(input.taxId);
      if (!taxId) throw new HTTPException(400, { message: 'Enter a valid 8- or 9-digit NZ IRD/GST number, including its check digit.' });
      return repo.upsertBusinessProfile(tx, ctx, { ...input, taxId });
    }
    return repo.upsertBusinessProfile(tx, ctx, input);
  });
}

export async function requireBusinessProfile(
  db: Database,
  userId: string,
): Promise<BusinessProfileDto> {
  const profile = await getBusinessProfileForUser(db, userId);
  if (!profile) {
    throw new HTTPException(400, { message: 'Set up your business profile first' });
  }
  return profile;
}
