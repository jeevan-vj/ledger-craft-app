import {
  journalEntryListResponseSchema,
  journalEntrySchema,
  type CreateJournalEntryRequest,
  type JournalEntryDto,
  type JournalEntryListResponse,
  type UpdateJournalEntryRequest,
} from '@ledgercraft/contracts';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client';
import { apiError } from '../../http-error';
import { withOrganisationTx } from '../auth/bind-organisation';
import { nextJournalEntryNumber } from '../accounting/entry-number';
import { roundMoney } from '../invoices/money';
import { assertReplayMatches, getIdempotencyRecord, insertIdempotencyRecord, type IdempotencyScope } from '../invoices/idempotency';
import * as repo from './journals.repository';
import { assertOpenBankPostingDate } from '../accounting/posting';

export async function listJournalEntriesForUser(db: Database, userId: string): Promise<JournalEntryListResponse> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const journalEntries = await repo.listJournalEntries(tx, ctx.organisationId);
    return journalEntryListResponseSchema.parse({ journalEntries });
  });
}

export async function getJournalEntryForUser(db: Database, userId: string, id: string): Promise<JournalEntryDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const entry = await repo.getJournalEntry(tx, ctx.organisationId, id);
    if (!entry) throw new HTTPException(404, { message: 'Journal entry not found' });
    return entry;
  });
}

export async function createJournalEntryForUser(
  db: Database,
  userId: string,
  input: CreateJournalEntryRequest,
  idempotency?: IdempotencyScope,
): Promise<JournalEntryDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    if (idempotency) {
      const stored = await getIdempotencyRecord(tx, ctx, idempotency);
      if (stored) {
        assertReplayMatches(stored.requestHash, idempotency.requestHash);
        const original = journalEntrySchema.parse(stored.responseBody);
        const current = await repo.getJournalEntry(tx, ctx.organisationId, original.id);
        if (!current) throw apiError(409, 'CONFLICT', 'The original journal was deleted; review before creating another entry');
        return current;
      }
    }
    const debit = await repo.getOrgAccount(tx, ctx.organisationId, input.debitAccountId);
    const credit = await repo.getOrgAccount(tx, ctx.organisationId, input.creditAccountId);
    if (!debit || !credit) throw new HTTPException(404, { message: 'Account not found' });
    const amount = input.amount;
    const entryNumber = await nextJournalEntryNumber(tx, ctx.organisationId, input.entryDate);
    const entry = await repo.insertJournalEntry(tx, ctx, { ...input, amount: roundMoney(amount) }, entryNumber);
    if (idempotency) await insertIdempotencyRecord(tx, ctx, idempotency, { status: 201, body: entry });
    return entry;
  });
}

export async function updateJournalEntryForUser(
  db: Database,
  userId: string,
  id: string,
  input: UpdateJournalEntryRequest,
): Promise<JournalEntryDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const current = await repo.getJournalEntry(tx, ctx.organisationId, id);
    if (!current) throw new HTTPException(404, { message: 'Journal entry not found' });
    if ((input.status as string | undefined) === 'reversed') {
      throw apiError(409, 'CONFLICT', 'Journal entries can only be reversed by posting a reversing entry');
    }
    if (current.status !== 'draft' && input.status !== current.status) {
      throw apiError(409, 'CONFLICT', 'Posted journal entries are immutable; create a reversing entry instead');
    }
    if (current.status === 'draft' && input.status === 'posted') {
      await assertOpenBankPostingDate(tx, ctx.organisationId, current.entryDate, [current.debitAccountId, current.creditAccountId]);
    }
    const updated = await repo.updateJournalEntry(tx, ctx.organisationId, id, input);
    if (!updated) throw new HTTPException(404, { message: 'Journal entry not found' });
    return updated;
  });
}

export async function deleteJournalEntryForUser(db: Database, userId: string, id: string): Promise<void> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const current = await repo.getJournalEntry(tx, ctx.organisationId, id);
    if (!current) throw new HTTPException(404, { message: 'Journal entry not found' });
    if (current.status !== 'draft') {
      throw apiError(409, 'CONFLICT', 'Posted journal entries are immutable; create a reversing entry instead');
    }
    const deleted = await repo.deleteJournalEntry(tx, ctx.organisationId, id);
    if (!deleted) throw new HTTPException(404, { message: 'Journal entry not found' });
  });
}
