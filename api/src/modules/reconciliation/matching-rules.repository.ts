import {
  bankMatchingRuleSchema,
  type BankMatchingRuleDto,
  type CreateBankMatchingRuleRequest,
  type UpdateBankMatchingRuleRequest,
} from '@ledgercraft/contracts';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { accounts } from '../../db/schema/accounts';
import { bankMatchingRules } from '../../db/schema/bank';
import { customers } from '../../db/schema/customers';
import { vendors } from '../../db/schema/purchases';
import { roundMoney } from '../invoices/money';

function toDto(row: typeof bankMatchingRules.$inferSelect): BankMatchingRuleDto {
  return bankMatchingRuleSchema.parse({
    id: row.id,
    descriptionContains: row.descriptionContains,
    amountMin: row.amountMin == null ? null : roundMoney(row.amountMin),
    amountMax: row.amountMax == null ? null : roundMoney(row.amountMax),
    direction: row.direction,
    targetAccountId: row.targetAccountId,
    contactId: row.contactId ?? null,
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

export async function hasAccount(tx: Database, organisationId: string, accountId: string) {
  const [row] = await tx.select({ id: accounts.id }).from(accounts).where(and(
    eq(accounts.organisationId, organisationId), eq(accounts.id, accountId),
  ));
  return Boolean(row);
}

export async function hasContact(tx: Database, organisationId: string, contactId: string) {
  const [customer, vendor] = await Promise.all([
    tx.select({ id: customers.id }).from(customers).where(and(eq(customers.organisationId, organisationId), eq(customers.id, contactId))),
    tx.select({ id: vendors.id }).from(vendors).where(and(eq(vendors.organisationId, organisationId), eq(vendors.id, contactId))),
  ]);
  return customer.length > 0 || vendor.length > 0;
}

export async function listRules(tx: Database, organisationId: string, enabledOnly = false) {
  const rows = await tx.select().from(bankMatchingRules).where(and(
    eq(bankMatchingRules.organisationId, organisationId),
    enabledOnly ? eq(bankMatchingRules.enabled, true) : undefined,
  )).orderBy(bankMatchingRules.descriptionContains);
  return rows.map(toDto);
}

export async function getRule(tx: Database, organisationId: string, id: string) {
  const [row] = await tx.select().from(bankMatchingRules).where(and(
    eq(bankMatchingRules.organisationId, organisationId), eq(bankMatchingRules.id, id),
  ));
  return row ? toDto(row) : undefined;
}

export async function insertRule(tx: Database, ctx: { organisationId: string; userId: string }, input: CreateBankMatchingRuleRequest) {
  const [row] = await tx.insert(bankMatchingRules).values({
    organisationId: ctx.organisationId,
    userId: ctx.userId,
    descriptionContains: input.descriptionContains,
    amountMin: input.amountMin == null ? null : roundMoney(input.amountMin),
    amountMax: input.amountMax == null ? null : roundMoney(input.amountMax),
    direction: input.direction,
    targetAccountId: input.targetAccountId,
    contactId: input.contactId ?? null,
    enabled: input.enabled,
  }).returning();
  if (!row) throw new Error('Failed to create matching rule');
  return toDto(row);
}

export async function updateRule(tx: Database, organisationId: string, id: string, input: UpdateBankMatchingRuleRequest) {
  const patch: Partial<typeof bankMatchingRules.$inferInsert> = { updatedAt: new Date() };
  if (input.descriptionContains !== undefined) patch.descriptionContains = input.descriptionContains;
  if (input.amountMin !== undefined) patch.amountMin = input.amountMin == null ? null : roundMoney(input.amountMin);
  if (input.amountMax !== undefined) patch.amountMax = input.amountMax == null ? null : roundMoney(input.amountMax);
  if (input.direction !== undefined) patch.direction = input.direction;
  if (input.targetAccountId !== undefined) patch.targetAccountId = input.targetAccountId;
  if (input.contactId !== undefined) patch.contactId = input.contactId;
  if (input.enabled !== undefined) patch.enabled = input.enabled;
  const [row] = await tx.update(bankMatchingRules).set(patch).where(and(
    eq(bankMatchingRules.organisationId, organisationId), eq(bankMatchingRules.id, id),
  )).returning();
  return row ? toDto(row) : undefined;
}

export async function deleteRule(tx: Database, organisationId: string, id: string) {
  return (await tx.delete(bankMatchingRules).where(and(
    eq(bankMatchingRules.organisationId, organisationId), eq(bankMatchingRules.id, id),
  )).returning({ id: bankMatchingRules.id })).length > 0;
}
