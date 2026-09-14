import { decimal } from './money';
import { and, eq, sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client';
import { accounts, journalEntries, journalEntryLines } from '../../db/schema/accounts';

const DEFAULT_ACCOUNTS = [
  { number: '1200', name: 'Accounts Receivable', type: 'asset', accountClass: 'asset', normalBalance: 'debit' },
  { number: '2200', name: 'GST Collected on Sales', type: 'liability', accountClass: 'liability', normalBalance: 'credit' },
  { number: '4000', name: 'Sales Revenue', type: 'revenue', accountClass: 'revenue', normalBalance: 'credit' },
] as const;

async function getOrCreateAccount(
  tx: Database,
  ctx: { organisationId: string; userId: string },
  number: string,
): Promise<string> {
  const [existing] = await tx
    .select()
    .from(accounts)
    .where(and(eq(accounts.organisationId, ctx.organisationId), eq(accounts.accountNumber, number)));
  if (existing) return existing.id;

  const template = DEFAULT_ACCOUNTS.find((account) => account.number === number);
  if (!template) throw new Error(`Unknown account number ${number}`);

  const [row] = await tx
    .insert(accounts)
    .values({
      organisationId: ctx.organisationId,
      userId: ctx.userId,
      name: template.name,
      type: template.type,
      accountNumber: template.number,
      accountClass: template.accountClass,
      normalBalance: template.normalBalance,
    })
    .returning();
  if (!row) throw new Error(`Failed to create account ${number}`);
  return row.id;
}

export async function postInvoiceJournal(
  tx: Database,
  ctx: { organisationId: string; userId: string },
  input: {
    invoiceId: string;
    invoiceNumber: string;
    date: string;
    subtotal: string;
    taxAmount: string;
    total: string;
  },
): Promise<void> {
  const arId = await getOrCreateAccount(tx, ctx, '1200');
  const gstId = await getOrCreateAccount(tx, ctx, '2200');
  const salesId = await getOrCreateAccount(tx, ctx, '4000');

  const year = input.date.slice(0, 4);
  const [{ count }] = await tx
    .select({ count: sql<number>`count(*)` })
    .from(journalEntries)
    .where(eq(journalEntries.organisationId, ctx.organisationId));
  const entryNumber = `JE-${year}-${String(Number(count) + 1).padStart(3, '0')}`;

  const [entry] = await tx
    .insert(journalEntries)
    .values({
      organisationId: ctx.organisationId,
      userId: ctx.userId,
      entryNumber,
      entryDate: input.date,
      description: `Invoice ${input.invoiceNumber}`,
      referenceType: 'invoice',
      referenceId: input.invoiceId,
      totalAmount: input.total,
      status: 'posted',
    })
    .returning();
  if (!entry) throw new HTTPException(500, { message: 'Failed to post journal entry' });

  const taxAmount = decimal(input.taxAmount);
  const total = decimal(input.total);
  const salesCredit = total.sub(taxAmount).toFixed();
  const lines = [
    { accountId: arId, description: `Invoice ${input.invoiceNumber}`, debit: input.total, credit: '0.00', order: 1 },
    { accountId: salesId, description: `Sales revenue - Invoice ${input.invoiceNumber}`, debit: '0.00', credit: salesCredit, order: 2 },
  ];
  if (taxAmount.compare(0) > 0) {
    lines.push({
      accountId: gstId,
      description: `GST on Invoice ${input.invoiceNumber}`,
      debit: '0.00',
      credit: input.taxAmount,
      order: 3,
    });
  }

  const debit = lines.reduce((sum, line) => sum.add(line.debit), decimal(0));
  const credit = lines.reduce((sum, line) => sum.add(line.credit), decimal(0));
  if (debit.compare(credit) !== 0) {
    throw new HTTPException(500, { message: `Journal unbalanced: ${debit.toFixed()} != ${credit.toFixed()}` });
  }

  for (const line of lines) {
    await tx.insert(journalEntryLines).values({
      organisationId: ctx.organisationId,
      journalEntryId: entry.id,
      accountId: line.accountId,
      description: line.description,
      debitAmount: line.debit,
      creditAmount: line.credit,
      lineOrder: line.order,
    });
  }
}
