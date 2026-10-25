import { and, desc, eq } from 'drizzle-orm';
import type { CreateJournalEntryRequest, JournalEntryDto, UpdateJournalEntryRequest } from '@ledgercraft/contracts';
import { journalEntrySchema } from '@ledgercraft/contracts';
import type { Database } from '../../db/client';
import { accounts, journalEntries, journalEntryLines } from '../../db/schema/accounts';
import { decimal, roundMoney } from '../invoices/money';

type OrgCtx = { organisationId: string; userId: string };

async function mapEntry(tx: Database, entry: typeof journalEntries.$inferSelect): Promise<JournalEntryDto> {
  const lines = await tx
    .select()
    .from(journalEntryLines)
    .where(and(eq(journalEntryLines.journalEntryId, entry.id), eq(journalEntryLines.organisationId, entry.organisationId)))
    .orderBy(journalEntryLines.lineOrder);
  const debitLine = lines.find((line) => decimal(line.debitAmount).compare(0) > 0) ?? lines[0];
  const creditLine = lines.find((line) => decimal(line.creditAmount).compare(0) > 0) ?? lines[1] ?? lines[0];
  const [debitAccount] = debitLine
    ? await tx.select({ id: accounts.id, name: accounts.name }).from(accounts).where(and(eq(accounts.id, debitLine.accountId), eq(accounts.organisationId, entry.organisationId)))
    : [];
  const [creditAccount] = creditLine
    ? await tx.select({ id: accounts.id, name: accounts.name }).from(accounts).where(and(eq(accounts.id, creditLine.accountId), eq(accounts.organisationId, entry.organisationId)))
    : [];
  return journalEntrySchema.parse({
    id: entry.id,
    entryNumber: entry.entryNumber,
    entryDate: entry.entryDate,
    description: entry.description,
    referenceNumber: entry.referenceType === 'manual' ? (entry.referenceId ?? null) : null,
    debitAccountId: debitLine?.accountId ?? debitAccount?.id,
    debitAccountName: debitAccount?.name ?? 'Unknown Account',
    debitAmount: roundMoney(debitLine?.debitAmount ?? 0),
    creditAccountId: creditLine?.accountId ?? creditAccount?.id ?? debitLine?.accountId,
    creditAccountName: creditAccount?.name ?? 'Unknown Account',
    creditAmount: roundMoney(creditLine?.creditAmount ?? 0),
    status: entry.status,
    notes: debitLine?.description ?? creditLine?.description ?? null,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  });
}

export async function listJournalEntries(tx: Database, organisationId: string): Promise<JournalEntryDto[]> {
  const rows = await tx
    .select()
    .from(journalEntries)
    .where(eq(journalEntries.organisationId, organisationId))
    .orderBy(desc(journalEntries.entryDate), desc(journalEntries.entryNumber));
  const mapped = [];
  for (const row of rows) {
    mapped.push(await mapEntry(tx, row));
  }
  return mapped;
}

export async function getJournalEntry(
  tx: Database,
  organisationId: string,
  id: string,
): Promise<JournalEntryDto | null> {
  const [row] = await tx
    .select()
    .from(journalEntries)
    .where(and(eq(journalEntries.organisationId, organisationId), eq(journalEntries.id, id)));
  if (!row) return null;
  return mapEntry(tx, row);
}

export async function insertJournalEntry(
  tx: Database,
  ctx: OrgCtx,
  input: CreateJournalEntryRequest,
  entryNumber: string,
): Promise<JournalEntryDto> {
  const [entry] = await tx
    .insert(journalEntries)
    .values({
      organisationId: ctx.organisationId,
      userId: ctx.userId,
      entryNumber,
      entryDate: input.entryDate,
      description: input.description,
      referenceType: 'manual',
      referenceId: null,
      totalAmount: roundMoney(input.amount),
      status: 'draft',
    })
    .returning();
  if (!entry) throw new Error('Failed to create journal entry');

  await tx.insert(journalEntryLines).values([
    {
      organisationId: ctx.organisationId,
      journalEntryId: entry.id,
      accountId: input.debitAccountId,
      description: input.notes || input.description,
      debitAmount: roundMoney(input.amount),
      creditAmount: '0.00',
      lineOrder: 1,
    },
    {
      organisationId: ctx.organisationId,
      journalEntryId: entry.id,
      accountId: input.creditAccountId,
      description: input.notes || input.description,
      debitAmount: '0.00',
      creditAmount: roundMoney(input.amount),
      lineOrder: 2,
    },
  ]);

  return mapEntry(tx, entry);
}

export async function updateJournalEntry(
  tx: Database,
  organisationId: string,
  id: string,
  input: UpdateJournalEntryRequest,
): Promise<JournalEntryDto | null> {
  if (!input.status) {
    return getJournalEntry(tx, organisationId, id);
  }
  const [row] = await tx
    .update(journalEntries)
    .set({ status: input.status, updatedAt: new Date() })
    .where(and(eq(journalEntries.organisationId, organisationId), eq(journalEntries.id, id)))
    .returning();
  if (!row) return null;
  return mapEntry(tx, row);
}

export async function deleteJournalEntry(tx: Database, organisationId: string, id: string): Promise<boolean> {
  await tx
    .delete(journalEntryLines)
    .where(and(eq(journalEntryLines.organisationId, organisationId), eq(journalEntryLines.journalEntryId, id)));
  const deleted = await tx
    .delete(journalEntries)
    .where(and(eq(journalEntries.organisationId, organisationId), eq(journalEntries.id, id)))
    .returning({ id: journalEntries.id });
  return deleted.length > 0;
}

export async function getOrgAccount(
  tx: Database,
  organisationId: string,
  accountId: string,
): Promise<{ id: string } | null> {
  const [row] = await tx
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.organisationId, organisationId), eq(accounts.id, accountId)));
  return row ?? null;
}
