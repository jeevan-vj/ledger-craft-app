import { and, eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client';
import { accounts, journalEntries, journalEntryLines } from '../../db/schema/accounts';
import { decimal, roundMoney } from '../invoices/money';

export type PostingContext = { organisationId: string; userId: string };
export type PostingLine = { accountId: string; description: string; debit: string; credit: string };

const SYSTEM_ACCOUNTS: Record<string, { name: string; type: string; accountClass: string; normalBalance: string }> = {
  '1110': { name: 'Bank Account - Current', type: 'bank', accountClass: 'asset', normalBalance: 'debit' },
  '1130': { name: 'Stripe Clearing', type: 'bank', accountClass: 'asset', normalBalance: 'debit' },
  '1200': { name: 'Accounts Receivable', type: 'asset', accountClass: 'asset', normalBalance: 'debit' },
  '2100': { name: 'Accounts Payable', type: 'liability', accountClass: 'liability', normalBalance: 'credit' },
  '2150': { name: 'GST Paid on Purchases', type: 'asset', accountClass: 'asset', normalBalance: 'debit' },
  '2200': { name: 'GST Collected on Sales', type: 'liability', accountClass: 'liability', normalBalance: 'credit' },
  '4900': { name: 'Other Income', type: 'revenue', accountClass: 'revenue', normalBalance: 'credit' },
  '5000': { name: 'Operating Expenses', type: 'expense', accountClass: 'expense', normalBalance: 'debit' },
  '5100': { name: 'Merchant and Platform Fees', type: 'expense', accountClass: 'expense', normalBalance: 'debit' },
};

export async function systemAccount(tx: Database, ctx: PostingContext, accountNumber: keyof typeof SYSTEM_ACCOUNTS) {
  const [existing] = await tx.select().from(accounts).where(and(eq(accounts.organisationId, ctx.organisationId), eq(accounts.accountNumber, accountNumber)));
  if (existing) return existing.id;
  const [row] = await tx.insert(accounts).values({ organisationId: ctx.organisationId, userId: ctx.userId, accountNumber, ...SYSTEM_ACCOUNTS[accountNumber] }).returning();
  if (!row) throw new Error(`Failed to create system account ${accountNumber}`);
  return row.id;
}

export async function bankLedgerAccount(tx: Database, ctx: PostingContext, bankAccount: { id: string; accountName: string; currency: string }) {
  const accountNumber = `BANK-${bankAccount.id.slice(0, 8).toUpperCase()}`;
  const [existing] = await tx.select().from(accounts).where(and(eq(accounts.organisationId, ctx.organisationId), eq(accounts.accountNumber, accountNumber)));
  if (existing) return existing.id;
  const [row] = await tx.insert(accounts).values({ organisationId: ctx.organisationId, userId: ctx.userId, accountNumber, name: bankAccount.accountName, type: 'bank', accountClass: 'asset', normalBalance: 'debit', currency: bankAccount.currency }).returning();
  if (!row) throw new Error('Failed to create bank ledger account');
  return row.id;
}

export async function postBalancedEntry(tx: Database, ctx: PostingContext, input: { date: string; description: string; referenceType: string; referenceId: string; lines: PostingLine[] }) {
  const [existing] = await tx.select({ id: journalEntries.id }).from(journalEntries).where(and(eq(journalEntries.organisationId, ctx.organisationId), eq(journalEntries.referenceType, input.referenceType), eq(journalEntries.referenceId, input.referenceId), eq(journalEntries.status, 'posted')));
  if (existing) return existing.id;
  const debit = input.lines.reduce((sum, line) => sum.add(line.debit), decimal(0));
  const credit = input.lines.reduce((sum, line) => sum.add(line.credit), decimal(0));
  if (debit.compare(credit) !== 0 || debit.compare(0) <= 0) throw new HTTPException(500, { message: 'Journal entry is not balanced' });
  const [entry] = await tx.insert(journalEntries).values({ organisationId: ctx.organisationId, userId: ctx.userId, entryNumber: `JE-${input.date.slice(0, 4)}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, entryDate: input.date, description: input.description, referenceType: input.referenceType, referenceId: input.referenceId, totalAmount: roundMoney(debit), status: 'posted' }).returning();
  if (!entry) throw new Error('Failed to create journal entry');
  await tx.insert(journalEntryLines).values(input.lines.map((line, index) => ({ organisationId: ctx.organisationId, journalEntryId: entry.id, accountId: line.accountId, description: line.description, debitAmount: roundMoney(line.debit), creditAmount: roundMoney(line.credit), lineOrder: index + 1 })));
  return entry.id;
}

export async function reversePosting(tx: Database, ctx: PostingContext, input: { referenceType: string; referenceId: string; reversalType: string; date: string; description: string }) {
  const [source] = await tx.select().from(journalEntries).where(and(eq(journalEntries.organisationId, ctx.organisationId), eq(journalEntries.referenceType, input.referenceType), eq(journalEntries.referenceId, input.referenceId), eq(journalEntries.status, 'posted')));
  if (!source) return;
  const lines = await tx.select().from(journalEntryLines).where(and(eq(journalEntryLines.organisationId, ctx.organisationId), eq(journalEntryLines.journalEntryId, source.id)));
  await postBalancedEntry(tx, ctx, { date: input.date, description: input.description, referenceType: input.reversalType, referenceId: source.id, lines: lines.map((line) => ({ accountId: line.accountId, description: input.description, debit: line.creditAmount, credit: line.debitAmount })) });
  await tx.update(journalEntries).set({ status: 'reversed', updatedAt: new Date() }).where(and(eq(journalEntries.organisationId, ctx.organisationId), eq(journalEntries.id, source.id)));
}
