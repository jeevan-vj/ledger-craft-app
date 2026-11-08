import {
  accountListResponseSchema,
  accountSchema,
  type AccountDto,
  type PrepareBankLedgerRequest,
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
import { decimal, roundMoney } from '../invoices/money';
import { bankLedgerAccount } from '../accounting/posting';
import * as bankLedgerRepo from './bank-ledger.repository';
import { assertAccountingSettingsOpen, periodLockStateInTx } from '../accounting/period-lock';
import { apiError } from '../../http-error';
import { assertReplayMatches, getIdempotencyRecord, insertIdempotencyRecord, type IdempotencyScope } from '../invoices/idempotency';
import { hasPermission } from '../auth/permissions';
import { postingTouchesClosedBank } from '../accounting/bank-close.repository';

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
  expectedOrganisationId?: string,
  idempotency?: IdempotencyScope,
): Promise<AccountDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    if (expectedOrganisationId && expectedOrganisationId !== ctx.organisationId) throw apiError(409, 'ORGANISATION_CHANGED', 'The active company changed. Refresh and review the account setup.');
    if (idempotency) {
      const stored = await getIdempotencyRecord(tx, ctx, idempotency);
      if (stored) {
        assertReplayMatches(stored.requestHash, idempotency.requestHash);
        const original = accountSchema.parse(stored.responseBody);
        const current = await bankLedgerRepo.ledgerAccount(tx, ctx.organisationId, original.id);
        if (!current) throw apiError(409, 'ACCOUNT_REMOVED', 'The original account is no longer available; review the chart before creating another.');
        return toDto(current);
      }
    }
    const code = input.accountNumber?.trim().toUpperCase() || null;
    if (code && (await bankLedgerRepo.matchingCodes(tx, ctx.organisationId, code)).length) throw apiError(409, 'ACCOUNT_CODE_EXISTS', 'This account code already exists. Refresh the chart before creating another account.');
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
        accountNumber: code,
        accountClass: input.accountClass ?? null,
        description: input.description ?? null,
        isActive: input.isActive ?? true,
      })
      .returning();
    if (!row) throw new HTTPException(500, { message: 'Failed to create account' });
    const result = toDto(row);
    if (idempotency) await insertIdempotencyRecord(tx, ctx, idempotency, { status: 201, body: result });
    return result;
  });
}

export async function updateAccountForUser(
  db: Database,
  userId: string,
  id: string,
  input: UpdateAccountRequest,
): Promise<AccountDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const [current] = await tx.select().from(accounts).where(and(eq(accounts.organisationId, ctx.organisationId), eq(accounts.id, id)));
    if (!current) throw new HTTPException(404, { message: 'Account not found' });
    const identityChanged = (input.accountNumber !== undefined && input.accountNumber !== current.accountNumber)
      || (input.type !== undefined && input.type !== current.type)
      || (input.currency !== undefined && input.currency !== current.currency)
      || (input.accountClass !== undefined && input.accountClass !== current.accountClass)
      || (input.openingBalance !== undefined && decimal(input.openingBalance).compare(current.openingBalance) !== 0)
      || (input.currentBalance !== undefined && decimal(input.currentBalance).compare(current.currentBalance) !== 0);
    const period = identityChanged ? await periodLockStateInTx(tx, ctx.organisationId) : undefined;
    if (period?.closedThrough && await bankLedgerRepo.hasPostedHistoryThrough(tx, ctx.organisationId, id, period.closedThrough)) await assertAccountingSettingsOpen(tx, ctx.organisationId);
    if (identityChanged && await postingTouchesClosedBank(tx, ctx.organisationId, '0000-00-00', [id])) {
      throw new HTTPException(409, { message: 'The financial identity of a bank ledger with completed statements cannot be changed' });
    }
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

/** Creates an empty chart identity only; opening balances require a reviewed journal. */
export async function prepareBankLedgerForUser(db: Database, userId: string, input: PrepareBankLedgerRequest, expectedOrganisationId?: string): Promise<AccountDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    if (!hasPermission(ctx.role, 'banking.write')) throw new HTTPException(403, { message: 'Missing permission: banking.write' });
    if (expectedOrganisationId && expectedOrganisationId !== ctx.organisationId) throw apiError(409, 'ORGANISATION_CHANGED', 'The active company changed. Refresh and review the bank ledger setup.');
    const bank = await bankLedgerRepo.ownedBank(tx, ctx.organisationId, input.bankAccountId);
    if (!bank) throw new HTTPException(404, { message: 'Bank account not found' });
    if (!bank.isActive || bank.currency !== 'NZD') throw new HTTPException(422, { message: 'Choose an active NZD bank for opening balances' });
    const code = `BANK-${bank.id.slice(0, 8).toUpperCase()}`;
    const existing = await bankLedgerRepo.linkedAccounts(tx, ctx.organisationId, code);
    if (existing.length > 1 || existing.some(row => row.type !== 'bank' || row.accountClass !== 'asset' || row.currency !== bank.currency || !row.isActive || (row.normalBalance !== null && row.normalBalance !== 'debit'))) {
      throw new HTTPException(409, { message: 'The linked ledger needs accountant review before it can be used' });
    }
    const id = await bankLedgerAccount(tx, ctx, { id: bank.id, accountName: bank.accountName, currency: bank.currency });
    const row = await bankLedgerRepo.ledgerAccount(tx, ctx.organisationId, id);
    if (!row) throw new HTTPException(500, { message: 'Bank ledger could not be prepared' });
    return toDto(row);
  });
}
