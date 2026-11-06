import type { CreateBankMatchingRuleRequest, UpdateBankMatchingRuleRequest } from '@ledgercraft/contracts';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client';
import { withOrganisationTx } from '../auth/bind-organisation';
import { decimal } from '../invoices/money';
import * as repo from './matching-rules.repository';

function validateRange(input: { amountMin?: string | null; amountMax?: string | null }) {
  if (input.amountMin != null && input.amountMax != null && decimal(input.amountMin).compare(input.amountMax) > 0) {
    throw new HTTPException(400, { message: 'Minimum amount cannot exceed maximum amount' });
  }
}

export async function listRulesForUser(db: Database, userId: string) {
  return withOrganisationTx(db, userId, async (tx, ctx) => ({ rules: await repo.listRules(tx, ctx.organisationId) }));
}

export async function createRuleForUser(db: Database, userId: string, input: CreateBankMatchingRuleRequest) {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    validateRange(input);
    if (!(await repo.hasAccount(tx, ctx.organisationId, input.targetAccountId))) throw new HTTPException(400, { message: 'Target account not found' });
    if (input.contactId && !(await repo.hasContact(tx, ctx.organisationId, input.contactId))) throw new HTTPException(400, { message: 'Contact not found' });
    return repo.insertRule(tx, ctx, input);
  });
}

export async function updateRuleForUser(db: Database, userId: string, id: string, input: UpdateBankMatchingRuleRequest) {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const existing = await repo.getRule(tx, ctx.organisationId, id);
    if (!existing) throw new HTTPException(404, { message: 'Matching rule not found' });
    validateRange({ amountMin: input.amountMin === undefined ? existing.amountMin : input.amountMin, amountMax: input.amountMax === undefined ? existing.amountMax : input.amountMax });
    if (input.targetAccountId && !(await repo.hasAccount(tx, ctx.organisationId, input.targetAccountId))) throw new HTTPException(400, { message: 'Target account not found' });
    if (input.contactId && !(await repo.hasContact(tx, ctx.organisationId, input.contactId))) throw new HTTPException(400, { message: 'Contact not found' });
    return repo.updateRule(tx, ctx.organisationId, id, input);
  });
}

export async function deleteRuleForUser(db: Database, userId: string, id: string) {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    if (!(await repo.deleteRule(tx, ctx.organisationId, id))) throw new HTTPException(404, { message: 'Matching rule not found' });
  });
}
