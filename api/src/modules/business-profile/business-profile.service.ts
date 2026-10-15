import type { BusinessProfileDto, UpsertBusinessProfileRequest } from '@ledgercraft/contracts';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client';
import { withOrganisationTx } from '../auth/bind-organisation';
import * as repo from './business-profile.repository';

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
