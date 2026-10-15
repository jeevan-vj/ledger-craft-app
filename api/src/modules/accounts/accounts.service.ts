import {
  accountListResponseSchema,
  accountSchema,
  type AccountDto,
  type AccountListResponse,
  type CreateAccountRequest,
  type InitializeAccountsRequest,
  type UpdateAccountRequest,
} from '@ledgercraft/contracts';
import { and, eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client';
import { accounts, accountTemplates } from '../../db/schema/accounts';
import { withOrganisationTx } from '../auth/bind-organisation';
import { roundMoney } from '../invoices/money';

const DEFAULT_CHART = [
  { number: '1110', name: 'Bank Account - Current', type: 'bank', accountClass: 'asset', normalBalance: 'debit' },
  { number: '1120', name: 'Cash on Hand', type: 'cash', accountClass: 'asset', normalBalance: 'debit' },
  { number: '1200', name: 'Accounts Receivable', type: 'asset', accountClass: 'asset', normalBalance: 'debit' },
  { number: '2200', name: 'GST Collected on Sales', type: 'liability', accountClass: 'liability', normalBalance: 'credit' },
  { number: '2300', name: 'Credit Card', type: 'credit_card', accountClass: 'liability', normalBalance: 'credit' },
  { number: '4000', name: 'Sales Revenue', type: 'revenue', accountClass: 'revenue', normalBalance: 'credit' },
  { number: '4100', name: 'Service Revenue', type: 'revenue', accountClass: 'revenue', normalBalance: 'credit' },
] as const;

function toDto(row: typeof accounts.$inferSelect): AccountDto {
  return accountSchema.parse({
    id: row.id,
    name: row.name,
    type: row.type,
    currency: row.currency,
    openingBalance: roundMoney(row.openingBalance),
    currentBalance: roundMoney(row.currentBalance),
    accountNumber: row.accountNumber ?? null,
    accountClass: row.accountClass ?? null,
    isActive: row.isActive,
  });
}

async function listRows(tx: Database, organisationId: string) {
  return tx
    .select()
    .from(accounts)
    .where(eq(accounts.organisationId, organisationId))
    .orderBy(accounts.accountNumber, accounts.name);
}

export async function listAccountsForUser(db: Database, userId: string): Promise<AccountListResponse> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const rows = await listRows(tx, ctx.organisationId);
    return accountListResponseSchema.parse({ accounts: rows.map(toDto) });
  });
}

export async function createAccountForUser(
  db: Database,
  userId: string,
  input: CreateAccountRequest,
): Promise<AccountDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const [row] = await tx
      .insert(accounts)
      .values({
        organisationId: ctx.organisationId,
        userId: ctx.userId,
        name: input.name,
        type: input.type,
        currency: input.currency ?? 'NZD',
        openingBalance: roundMoney(input.openingBalance ?? 0),
        currentBalance: roundMoney(input.openingBalance ?? 0),
        accountNumber: input.accountNumber ?? null,
        accountClass: input.accountClass ?? null,
        description: input.description ?? null,
        isActive: input.isActive ?? true,
      })
      .returning();
    if (!row) throw new HTTPException(500, { message: 'Failed to create account' });
    return toDto(row);
  });
}

export async function updateAccountForUser(
  db: Database,
  userId: string,
  id: string,
  input: UpdateAccountRequest,
): Promise<AccountDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const patch: Partial<typeof accounts.$inferInsert> = { updatedAt: new Date() };
    if (input.name !== undefined) patch.name = input.name;
    if (input.type !== undefined) patch.type = input.type;
    if (input.currency !== undefined) patch.currency = input.currency;
    if (input.openingBalance !== undefined) patch.openingBalance = roundMoney(input.openingBalance);
    if (input.currentBalance !== undefined) patch.currentBalance = roundMoney(input.currentBalance);
    if (input.accountNumber !== undefined) patch.accountNumber = input.accountNumber;
    if (input.accountClass !== undefined) patch.accountClass = input.accountClass;
    if (input.description !== undefined) patch.description = input.description;
    if (input.isActive !== undefined) patch.isActive = input.isActive;

    const [row] = await tx
      .update(accounts)
      .set(patch)
      .where(and(eq(accounts.organisationId, ctx.organisationId), eq(accounts.id, id)))
      .returning();
    if (!row) throw new HTTPException(404, { message: 'Account not found' });
    return toDto(row);
  });
}

export async function initializeAccountsForUser(
  db: Database,
  userId: string,
  input: InitializeAccountsRequest,
): Promise<AccountListResponse> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const countryCode = input.countryCode ?? 'NZ';
    const templates = await tx
      .select()
      .from(accountTemplates)
      .where(eq(accountTemplates.countryCode, countryCode));
    const seeds =
      templates.length > 0
        ? templates.map((template) => ({
            number: template.accountNumber,
            name: template.name,
            type: template.accountType,
            accountClass: template.accountClass,
            normalBalance: template.normalBalance,
          }))
        : DEFAULT_CHART;

    const existing = await listRows(tx, ctx.organisationId);
    const have = new Set(existing.map((row) => row.accountNumber).filter(Boolean));

    for (const seed of seeds) {
      if (have.has(seed.number)) continue;
      await tx.insert(accounts).values({
        organisationId: ctx.organisationId,
        userId: ctx.userId,
        name: seed.name,
        type: seed.type,
        accountNumber: seed.number,
        accountClass: seed.accountClass,
        normalBalance: seed.normalBalance,
      });
      have.add(seed.number);
    }

    const rows = await listRows(tx, ctx.organisationId);
    return accountListResponseSchema.parse({ accounts: rows.map(toDto) });
  });
}
