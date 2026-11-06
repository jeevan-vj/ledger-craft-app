import { organisationToday } from '../accounting/organisation-date';
import type { BillDto, BillPaymentDto } from '@ledgercraft/contracts';
import { and, eq, sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { nextJournalEntryNumber } from '../accounting/entry-number';
import type { Database } from '../../db/client';
import { accounts, journalEntries, journalEntryLines } from '../../db/schema/accounts';
import { decimal, roundMoney } from '../invoices/money';
import { exchangeDifferenceLine } from '../currency/settlement.service';
import { bankLedgerAccount } from '../accounting/posting';
import { getAccount as getBankAccount } from '../bank/bank.repository';

type OrganisationContext = { organisationId: string; userId: string };
const SYSTEM_ACCOUNTS = {
  '1110': { name: 'Bank Account - Current', type: 'bank', accountClass: 'asset', normalBalance: 'debit' },
  '2100': { name: 'Accounts Payable', type: 'liability', accountClass: 'liability', normalBalance: 'credit' },
  '2150': { name: 'GST Paid on Purchases', type: 'asset', accountClass: 'asset', normalBalance: 'debit' },
} as const;

async function systemAccount(tx: Database, ctx: OrganisationContext, number: keyof typeof SYSTEM_ACCOUNTS) {
  const [existing] = await tx.select().from(accounts)
    .where(and(eq(accounts.organisationId, ctx.organisationId), eq(accounts.accountNumber, number)));
  if (existing) return existing.id;
  const definition = SYSTEM_ACCOUNTS[number];
  const [row] = await tx.insert(accounts).values({
    organisationId: ctx.organisationId,
    userId: ctx.userId,
    accountNumber: number,
    ...definition,
  }).returning();
  if (!row) throw new Error(`Failed to create account ${number}`);
  return row.id;
}

async function post(
  tx: Database,
  ctx: OrganisationContext,
  input: {
    date: string;
    description: string;
    referenceType: string;
    referenceId: string;
    total: string;
    lines: Array<{ accountId: string; description: string; debit: string; credit: string }>;
  },
) {
  const [existing] = await tx.select({ id: journalEntries.id }).from(journalEntries).where(and(
    eq(journalEntries.organisationId, ctx.organisationId),
    eq(journalEntries.referenceType, input.referenceType),
    eq(journalEntries.referenceId, input.referenceId),
  ));
  if (existing) return;
  const debit = input.lines.reduce((sum, line) => sum.add(line.debit), decimal(0));
  const credit = input.lines.reduce((sum, line) => sum.add(line.credit), decimal(0));
  if (debit.compare(credit) !== 0) throw new HTTPException(500, { message: 'Journal entry is not balanced' });
  const [entry] = await tx.insert(journalEntries).values({
    organisationId: ctx.organisationId,
    userId: ctx.userId,
    entryNumber: await nextJournalEntryNumber(tx, ctx.organisationId, input.date),
    entryDate: input.date,
    description: input.description,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    totalAmount: input.total,
    status: 'posted',
  }).returning();
  if (!entry) throw new Error('Failed to create journal entry');
  for (const [index, line] of input.lines.entries()) {
    await tx.insert(journalEntryLines).values({
      organisationId: ctx.organisationId,
      journalEntryId: entry.id,
      accountId: line.accountId,
      description: line.description,
      debitAmount: line.debit,
      creditAmount: line.credit,
      lineOrder: index + 1,
    });
  }
}

export async function postReceivedBill(tx: Database, ctx: OrganisationContext, bill: BillDto) {
  const payableId = await systemAccount(tx, ctx, '2100');
  const gstId = await systemAccount(tx, ctx, '2150');
  const foreign = bill.currency !== bill.baseCurrency;
  if (foreign && !bill.exchangeRateId) throw new HTTPException(422, { message: 'A reviewed source exchange rate is required before receiving this foreign bill' });
  const total = foreign ? bill.baseTotal : bill.total;
  const tax = foreign ? bill.baseTaxAmount : bill.taxAmount;
  const expenses = new Map<string, ReturnType<typeof decimal>>();
  for (const line of bill.lines) {
    if (!line.accountId) throw new HTTPException(400, { message: 'Every bill line needs an account before receiving' });
    expenses.set(line.accountId, (expenses.get(line.accountId) ?? decimal(0)).add(line.subtotal));
  }
  let allocated = decimal(0);
  let sourceAllocated = decimal(0);
  const netBase = decimal(total).sub(tax);
  const lines = [...expenses.entries()].map(([accountId, amount]) => {
    sourceAllocated = sourceAllocated.add(amount);
    // Cumulative allocation conserves the base total without a negative final
    // line when many tiny source categories individually round upward.
    const cumulative = foreign ? decimal(bill.subtotal).compare(0) === 0 ? decimal(0) : decimal(roundMoney(netBase.mul(sourceAllocated).div(bill.subtotal))) : sourceAllocated;
    const debit = roundMoney(cumulative.sub(allocated));
    allocated = cumulative;
    return { accountId, description: `Expense - ${bill.billNumber}`, debit, credit: '0.00' };
  });
  if (decimal(tax).compare(0) > 0) {
    lines.push({ accountId: gstId, description: `GST - ${bill.billNumber}`, debit: tax, credit: '0.00' });
  }
  lines.push({ accountId: payableId, description: `Accounts payable - ${bill.billNumber}`, debit: '0.00', credit: total });
  await post(tx, ctx, {
    date: bill.issueDate,
    description: `Bill ${bill.billNumber}`,
    referenceType: 'bill',
    referenceId: bill.id,
    total,
    lines,
  });
}

export async function postBillPayment(
  tx: Database,
  ctx: OrganisationContext,
  bill: BillDto,
  payment: BillPaymentDto,
) {
  const payableId = await systemAccount(tx, ctx, '2100');
  const bank = await getBankAccount(tx, ctx.organisationId, payment.bankAccountId);
  if (!bank) throw new HTTPException(400, { message: 'Bank account not found' });
  if (bank.currency !== bill.baseCurrency) throw new HTTPException(422, { message: 'Select a bank account in the company base currency for this settlement' });
  const bankId = await bankLedgerAccount(tx, ctx, bank);
  const baseAmount = payment.baseAmount ?? payment.amount;
  const bookBaseAmount = payment.bookBaseAmount ?? payment.amount;
  await post(tx, ctx, {
    date: payment.paymentDate,
    description: `Payment for ${bill.billNumber}`,
    referenceType: 'bill_payment',
    referenceId: payment.id,
    total: decimal(baseAmount).compare(bookBaseAmount) >= 0 ? baseAmount : bookBaseAmount,
    lines: [
      { accountId: payableId, description: `Payment for ${bill.billNumber}`, debit: bookBaseAmount, credit: '0.00' },
      { accountId: bankId, description: payment.bankAccountName, debit: '0.00', credit: baseAmount },
      ...await exchangeDifferenceLine(tx, ctx, 'bill', payment.exchangeDifference ?? '0'),
    ],
  });
}

export async function reverseBill(tx: Database, ctx: OrganisationContext, bill: BillDto) {
  const [source] = await tx.select().from(journalEntries).where(and(
    eq(journalEntries.organisationId, ctx.organisationId),
    eq(journalEntries.referenceType, 'bill'),
    eq(journalEntries.referenceId, bill.id),
  ));
  if (!source) return;
  const sourceLines = await tx.select().from(journalEntryLines).where(and(
    eq(journalEntryLines.organisationId, ctx.organisationId),
    eq(journalEntryLines.journalEntryId, source.id),
  ));
  await post(tx, ctx, {
    date: await organisationToday(tx, ctx.organisationId),
    description: `Void ${bill.billNumber}`,
    referenceType: 'bill_void',
    referenceId: bill.id,
    total: source.totalAmount,
    lines: sourceLines.map((line) => ({
      accountId: line.accountId,
      description: `Reverse ${line.description ?? bill.billNumber}`,
      debit: line.creditAmount,
      credit: line.debitAmount,
    })),
  });
  await tx.update(journalEntries).set({ status: 'reversed', updatedAt: new Date() })
    .where(and(eq(journalEntries.organisationId, ctx.organisationId), eq(journalEntries.id, source.id)));
}

export async function restoreBill(tx: Database, ctx: OrganisationContext, bill: BillDto) {
  const [voidEntry] = await tx.select().from(journalEntries).where(and(
    eq(journalEntries.organisationId, ctx.organisationId),
    eq(journalEntries.referenceType, 'bill_void'),
    eq(journalEntries.referenceId, bill.id),
  ));
  if (!voidEntry) throw new HTTPException(409, { message: 'Bill cancellation journal is missing' });
  const voidLines = await tx.select().from(journalEntryLines).where(and(
    eq(journalEntryLines.organisationId, ctx.organisationId),
    eq(journalEntryLines.journalEntryId, voidEntry.id),
  ));
  await post(tx, ctx, {
    date: await organisationToday(tx, ctx.organisationId),
    description: `Restore ${bill.billNumber}`,
    referenceType: 'bill_restore',
    referenceId: bill.id,
    total: voidEntry.totalAmount,
    lines: voidLines.map((line) => ({
      accountId: line.accountId,
      description: `Restore ${line.description ?? bill.billNumber}`,
      debit: line.creditAmount,
      credit: line.debitAmount,
    })),
  });
}
