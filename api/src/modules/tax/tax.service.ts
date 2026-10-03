import {
  taxReturnListResponseSchema,
  type CreateTaxReturnRequest,
  type FileTaxReturnRequest,
  type TaxConfigurationDto,
  type TaxReturnDto,
  type TaxReturnListResponse,
  type UpdateTaxReturnRequest,
  type UpsertTaxConfigurationRequest,
} from '@ledgercraft/contracts';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client';
import { withOrganisationTx } from '../auth/bind-organisation';
import * as repo from './tax.repository';

export async function getTaxConfigurationForUser(
  db: Database,
  userId: string,
  countryCode?: string,
): Promise<TaxConfigurationDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const existing = await repo.getActiveConfig(tx, ctx.organisationId, countryCode ?? 'NZ');
    if (existing) return existing;
    return repo.insertDefaultConfig(tx, ctx, { countryCode: countryCode ?? 'NZ', taxRate: '0.15', taxName: 'GST' });
  });
}

export async function upsertTaxConfigurationForUser(
  db: Database,
  userId: string,
  input: UpsertTaxConfigurationRequest,
): Promise<TaxConfigurationDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => repo.upsertConfig(tx, ctx, input));
}

export async function listTaxReturnsForUser(db: Database, userId: string): Promise<TaxReturnListResponse> {
  return withOrganisationTx(db, userId, async (tx, ctx) =>
    taxReturnListResponseSchema.parse({ taxReturns: await repo.listReturns(tx, ctx.organisationId) }),
  );
}

export async function getTaxReturnForUser(db: Database, userId: string, id: string): Promise<TaxReturnDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const row = await repo.getReturn(tx, ctx.organisationId, id);
    if (!row) throw new HTTPException(404, { message: 'Tax return not found' });
    return row;
  });
}

export async function createTaxReturnForUser(
  db: Database,
  userId: string,
  input: CreateTaxReturnRequest,
): Promise<TaxReturnDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => repo.insertReturn(tx, ctx, input));
}

export async function updateTaxReturnForUser(
  db: Database,
  userId: string,
  id: string,
  input: UpdateTaxReturnRequest,
): Promise<TaxReturnDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const row = await repo.updateReturn(tx, ctx.organisationId, id, input);
    if (!row) throw new HTTPException(404, { message: 'Tax return not found' });
    return row;
  });
}

export async function fileTaxReturnForUser(
  db: Database,
  userId: string,
  id: string,
  input: FileTaxReturnRequest,
): Promise<TaxReturnDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const existing = await repo.getReturn(tx, ctx.organisationId, id);
    if (!existing) throw new HTTPException(404, { message: 'Tax return not found' });
    if (existing.status !== 'draft') {
      throw new HTTPException(409, { message: 'Only a draft tax return can be recorded as filed' });
    }
    const filed = await repo.fileReturn(tx, ctx.organisationId, id, input.irdReference);
    if (!filed) throw new HTTPException(409, { message: 'Tax return is no longer a draft' });
    return filed;
  });
}

export async function deleteTaxReturnForUser(db: Database, userId: string, id: string): Promise<void> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const deleted = await repo.deleteReturn(tx, ctx.organisationId, id);
    if (!deleted) throw new HTTPException(404, { message: 'Tax return not found' });
  });
}
