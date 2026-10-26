import {
  billPaymentSchema,
  billAttachmentSchema,
  billHistorySchema,
  billSchema,
  vendorSchema,
  type BillDto,
  type BillPaymentDto,
  type CreateBillRequest,
  type CreateVendorRequest,
  type AttachBillObjectRequest,
  type UpdateBillRequest,
  type UpdateVendorRequest,
  type VendorDto,
} from '@ledgercraft/contracts';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { accounts } from '../../db/schema/accounts';
import { bankAccounts } from '../../db/schema/bank';
import { billAttachments, billHistory, billLines, billPayments, bills, vendors } from '../../db/schema/purchases';
import { decimal, roundMoney } from '../invoices/money';

type OrganisationContext = { organisationId: string; userId: string };

function toVendor(row: typeof vendors.$inferSelect): VendorDto {
  return vendorSchema.parse({
    id: row.id,
    name: row.name,
    email: row.email ?? null,
    phone: row.phone ?? null,
    taxId: row.taxId ?? null,
    address: row.address ?? null,
    paymentTermDays: row.paymentTermDays,
    notes: row.notes ?? null,
    isActive: row.isActive,
    contactName: row.contactName ?? null,
    defaultAccountId: row.defaultAccountId ?? null,
    defaultTaxRate: roundMoney(row.defaultTaxRate),
    importIdentifier: row.importIdentifier ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

export async function listVendors(tx: Database, organisationId: string): Promise<VendorDto[]> {
  const rows = await tx.select().from(vendors)
    .where(eq(vendors.organisationId, organisationId)).orderBy(asc(vendors.name));
  return rows.map(toVendor);
}

export async function getVendor(tx: Database, organisationId: string, id: string) {
  const [row] = await tx.select().from(vendors)
    .where(and(eq(vendors.organisationId, organisationId), eq(vendors.id, id)));
  return row ? toVendor(row) : undefined;
}

export async function getVendorByImportIdentifier(tx: Database, organisationId: string, importIdentifier: string) {
  const [row] = await tx.select().from(vendors).where(and(
    eq(vendors.organisationId, organisationId),
    eq(vendors.importIdentifier, importIdentifier),
  ));
  return row ? toVendor(row) : undefined;
}

export async function insertVendor(tx: Database, ctx: OrganisationContext, input: CreateVendorRequest) {
  const [row] = await tx.insert(vendors).values({
    organisationId: ctx.organisationId,
    userId: ctx.userId,
    name: input.name,
    email: input.email ?? null,
    phone: input.phone ?? null,
    taxId: input.taxId ?? null,
    address: input.address ?? null,
    paymentTermDays: input.paymentTermDays ?? 20,
    notes: input.notes ?? null,
    isActive: input.isActive ?? true,
    contactName: input.contactName ?? null,
    defaultAccountId: input.defaultAccountId ?? null,
    defaultTaxRate: input.defaultTaxRate ?? '15',
    importIdentifier: input.importIdentifier ?? null,
  }).returning();
  if (!row) throw new Error('Failed to create vendor');
  return toVendor(row);
}

export async function updateVendor(
  tx: Database,
  organisationId: string,
  id: string,
  input: UpdateVendorRequest,
) {
  const patch: Partial<typeof vendors.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.email !== undefined) patch.email = input.email;
  if (input.phone !== undefined) patch.phone = input.phone;
  if (input.taxId !== undefined) patch.taxId = input.taxId;
  if (input.address !== undefined) patch.address = input.address;
  if (input.paymentTermDays !== undefined) patch.paymentTermDays = input.paymentTermDays;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.isActive !== undefined) patch.isActive = input.isActive;
  if (input.contactName !== undefined) patch.contactName = input.contactName;
  if (input.defaultAccountId !== undefined) patch.defaultAccountId = input.defaultAccountId;
  if (input.defaultTaxRate !== undefined) patch.defaultTaxRate = input.defaultTaxRate;
  if (input.importIdentifier !== undefined) patch.importIdentifier = input.importIdentifier;
  const [row] = await tx.update(vendors).set(patch)
    .where(and(eq(vendors.organisationId, organisationId), eq(vendors.id, id))).returning();
  return row ? toVendor(row) : undefined;
}

export async function deleteVendor(tx: Database, organisationId: string, id: string) {
  const deleted = await tx.delete(vendors)
    .where(and(eq(vendors.organisationId, organisationId), eq(vendors.id, id)))
    .returning({ id: vendors.id });
  return deleted.length > 0;
}

export function calculateBillLines(input: CreateBillRequest | UpdateBillRequest, currencyPrecision = 2) {
  const round = (value: Parameters<typeof roundMoney>[0]) => decimal(value).toFixed(currencyPrecision);
  const taxInclusive = input.taxInclusive ?? true;
  const calculated = (input.lines ?? []).map((line) => {
    const gross = decimal(line.quantity).mul(line.unitPrice);
    const rate = decimal(line.taxRate ?? '15');
    const tax = taxInclusive
      ? (rate.compare(0) ? gross.mul(rate).div(decimal(100).add(rate)) : decimal(0))
      : gross.mul(rate).div(100);
    const subtotal = taxInclusive ? gross.sub(tax) : gross;
    const total = taxInclusive ? gross : gross.add(tax);
    return {
      ...line,
      quantity: roundMoney(line.quantity),
      unitPrice: round(line.unitPrice),
      taxRate: roundMoney(line.taxRate ?? '15'),
      subtotal: round(subtotal),
      taxAmount: round(tax),
      total: round(total),
      accountId: line.accountId ?? null,
    };
  });
  return {
    lines: calculated,
    subtotal: round(calculated.reduce((sum, line) => sum.add(line.subtotal), decimal(0))),
    taxAmount: round(calculated.reduce((sum, line) => sum.add(line.taxAmount), decimal(0))),
    total: round(calculated.reduce((sum, line) => sum.add(line.total), decimal(0))),
  };
}

async function nextBillNumber(tx: Database, organisationId: string): Promise<string> {
  const [{ count }] = await tx.select({ count: sql<number>`count(*)` }).from(bills)
    .where(eq(bills.organisationId, organisationId));
  return `BILL-${String(Number(count) + 1).padStart(4, '0')}`;
}

async function toBillDto(tx: Database, row: typeof bills.$inferSelect): Promise<BillDto> {
  const [vendor, lines, payments, attachments, history] = await Promise.all([
    getVendor(tx, row.organisationId, row.vendorId),
    tx.select({ line: billLines, accountName: accounts.name }).from(billLines)
      .leftJoin(accounts, and(eq(accounts.organisationId, row.organisationId), eq(accounts.id, billLines.accountId)))
      .where(and(eq(billLines.organisationId, row.organisationId), eq(billLines.billId, row.id)))
      .orderBy(asc(billLines.lineOrder)),
    tx.select({ payment: billPayments, bankName: bankAccounts.accountName }).from(billPayments)
      .leftJoin(bankAccounts, and(eq(bankAccounts.organisationId, row.organisationId), eq(bankAccounts.id, billPayments.bankAccountId)))
      .where(and(eq(billPayments.organisationId, row.organisationId), eq(billPayments.billId, row.id)))
      .orderBy(desc(billPayments.createdAt)),
    tx.select().from(billAttachments)
      .where(and(eq(billAttachments.organisationId, row.organisationId), eq(billAttachments.billId, row.id)))
      .orderBy(desc(billAttachments.createdAt)),
    tx.select().from(billHistory)
      .where(and(eq(billHistory.organisationId, row.organisationId), eq(billHistory.billId, row.id)))
      .orderBy(desc(billHistory.createdAt)),
  ]);
  if (!vendor) throw new Error('Bill vendor missing');
  const today = new Date().toISOString().slice(0, 10);
  const displayStatus = row.lifecycleStatus === 'void' ? 'cancelled'
    : row.lifecycleStatus === 'draft' ? 'draft'
      : row.paymentStatus === 'paid' ? 'paid'
        : row.paymentStatus === 'partial' ? 'partial'
          : row.dueDate < today ? 'overdue' : 'received';
  return billSchema.parse({
    id: row.id,
    billNumber: row.billNumber,
    vendorId: row.vendorId,
    vendorName: vendor.name,
    vendorReference: row.vendorReference ?? null,
    externalNumber: row.externalNumber ?? null,
    externalIssuerName: row.externalIssuerName ?? null,
    sourceImportDocumentId: row.importDocumentId ?? null,
    issueDate: row.issueDate,
    dueDate: row.dueDate,
    lifecycleStatus: row.lifecycleStatus,
    paymentStatus: row.paymentStatus,
    displayStatus,
    currency: row.currency,
    exchangeRate: row.exchangeRate,
    exchangeRateId: row.exchangeRateId ?? null,
    baseCurrency: row.baseCurrency,
    baseSubtotal: row.baseSubtotal,
    baseTaxAmount: row.baseTaxAmount,
    baseTotal: row.baseTotal,
    taxInclusive: row.taxInclusive,
    subtotal: row.subtotal,
    taxAmount: row.taxAmount,
    total: row.total,
    totalPaid: roundMoney(row.totalPaid),
    balanceDue: roundMoney(row.balanceDue),
    notes: row.notes ?? null,
    lines: lines.map(({ line, accountName }) => ({
      id: line.id,
      description: line.description,
      quantity: roundMoney(line.quantity),
      unitPrice: roundMoney(line.unitPrice),
      taxRate: roundMoney(line.taxRate),
      subtotal: roundMoney(line.subtotal),
      taxAmount: roundMoney(line.taxAmount),
      total: roundMoney(line.total),
      accountId: line.accountId ?? null,
      accountName: accountName ?? null,
    })),
    payments: payments.map(({ payment, bankName }) => billPaymentSchema.parse({
      id: payment.id,
      billId: payment.billId,
      bankAccountId: payment.bankAccountId,
      bankAccountName: bankName ?? 'Bank account',
      amount: roundMoney(payment.amount),
      paymentDate: payment.paymentDate,
      referenceNumber: payment.referenceNumber ?? null,
      notes: payment.notes ?? null,
      createdAt: payment.createdAt.toISOString(),
    })),
    attachments: attachments.map((attachment) => billAttachmentSchema.parse({
      ...attachment,
      createdAt: attachment.createdAt.toISOString(),
    })),
    history: history.map((entry) => billHistorySchema.parse({
      ...entry,
      createdAt: entry.createdAt.toISOString(),
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

export async function listBills(tx: Database, organisationId: string) {
  const rows = await tx.select().from(bills).where(eq(bills.organisationId, organisationId))
    .orderBy(desc(bills.issueDate), desc(bills.createdAt));
  return Promise.all(rows.map((row) => toBillDto(tx, row)));
}

export async function getBill(tx: Database, organisationId: string, id: string) {
  const [row] = await tx.select().from(bills)
    .where(and(eq(bills.organisationId, organisationId), eq(bills.id, id)));
  return row ? toBillDto(tx, row) : undefined;
}

type BillCurrencySnapshot = { precision: number; exchangeRate: string; exchangeRateId: string | null; baseCurrency: string; basePrecision: number };

export async function insertBill(tx: Database, ctx: OrganisationContext, input: CreateBillRequest, currency: BillCurrencySnapshot) {
  const totals = calculateBillLines(input, currency.precision);
  const [row] = await tx.insert(bills).values({
    organisationId: ctx.organisationId,
    userId: ctx.userId,
    billNumber: await nextBillNumber(tx, ctx.organisationId),
    vendorId: input.vendorId,
    vendorReference: input.vendorReference ?? null,
    issueDate: input.issueDate,
    dueDate: input.dueDate,
    currency: input.currency ?? 'NZD',
    exchangeRate: currency.exchangeRate,
    exchangeRateId: currency.exchangeRateId,
    baseCurrency: currency.baseCurrency,
    baseSubtotal: decimal(totals.subtotal).mul(currency.exchangeRate).toFixed(currency.basePrecision),
    baseTaxAmount: decimal(totals.taxAmount).mul(currency.exchangeRate).toFixed(currency.basePrecision),
    baseTotal: decimal(totals.total).mul(currency.exchangeRate).toFixed(currency.basePrecision),
    taxInclusive: input.taxInclusive ?? true,
    subtotal: totals.subtotal,
    taxAmount: totals.taxAmount,
    total: totals.total,
    totalPaid: '0.00',
    balanceDue: totals.total,
    notes: input.notes ?? null,
  }).returning();
  if (!row) throw new Error('Failed to create bill');
  for (const [index, line] of totals.lines.entries()) {
    await tx.insert(billLines).values({ ...line, organisationId: ctx.organisationId, billId: row.id, lineOrder: index + 1 });
  }
  await appendBillHistory(tx, ctx, row.id, 'created', 'Bill created');
  return toBillDto(tx, row);
}

export async function updateBill(tx: Database, organisationId: string, id: string, input: UpdateBillRequest, currency: BillCurrencySnapshot) {
  const [existing] = await tx.select().from(bills)
    .where(and(eq(bills.organisationId, organisationId), eq(bills.id, id)));
  if (!existing) return undefined;
  const patch: Partial<typeof bills.$inferInsert> = { updatedAt: new Date() };
  if (input.vendorId !== undefined) patch.vendorId = input.vendorId;
  if (input.vendorReference !== undefined) patch.vendorReference = input.vendorReference;
  if (input.issueDate !== undefined) patch.issueDate = input.issueDate;
  if (input.dueDate !== undefined) patch.dueDate = input.dueDate;
  if (input.currency !== undefined) patch.currency = input.currency;
  if (input.taxInclusive !== undefined) patch.taxInclusive = input.taxInclusive;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.lines !== undefined) {
    const totals = calculateBillLines({ ...input, taxInclusive: input.taxInclusive ?? existing.taxInclusive }, currency.precision);
    patch.subtotal = totals.subtotal;
    patch.taxAmount = totals.taxAmount;
    patch.total = totals.total;
    patch.balanceDue = decimal(totals.total).sub(existing.totalPaid).toFixed();
    patch.exchangeRate = currency.exchangeRate; patch.exchangeRateId = currency.exchangeRateId; patch.baseCurrency = currency.baseCurrency;
    patch.baseSubtotal = decimal(totals.subtotal).mul(currency.exchangeRate).toFixed(currency.basePrecision);
    patch.baseTaxAmount = decimal(totals.taxAmount).mul(currency.exchangeRate).toFixed(currency.basePrecision);
    patch.baseTotal = decimal(totals.total).mul(currency.exchangeRate).toFixed(currency.basePrecision);
    await tx.delete(billLines).where(and(eq(billLines.organisationId, organisationId), eq(billLines.billId, id)));
    for (const [index, line] of totals.lines.entries()) {
      await tx.insert(billLines).values({ ...line, organisationId, billId: id, lineOrder: index + 1 });
    }
  }
  const [row] = await tx.update(bills).set(patch)
    .where(and(eq(bills.organisationId, organisationId), eq(bills.id, id))).returning();
  return row ? toBillDto(tx, row) : undefined;
}

export async function deleteBill(tx: Database, organisationId: string, id: string) {
  const deleted = await tx.delete(bills)
    .where(and(eq(bills.organisationId, organisationId), eq(bills.id, id)))
    .returning({ id: bills.id });
  return deleted.length > 0;
}

export async function markBillReceived(tx: Database, organisationId: string, id: string) {
  const [row] = await tx.update(bills).set({ lifecycleStatus: 'received', receivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(bills.organisationId, organisationId), eq(bills.id, id))).returning();
  return row ? toBillDto(tx, row) : undefined;
}

export async function markBillVoid(tx: Database, organisationId: string, id: string) {
  const [row] = await tx.update(bills).set({ lifecycleStatus: 'void', voidedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(bills.organisationId, organisationId), eq(bills.id, id))).returning();
  return row ? toBillDto(tx, row) : undefined;
}

export async function markBillRestored(tx: Database, organisationId: string, id: string) {
  const [row] = await tx.update(bills).set({ lifecycleStatus: 'received', voidedAt: null, updatedAt: new Date() })
    .where(and(eq(bills.organisationId, organisationId), eq(bills.id, id))).returning();
  return row ? toBillDto(tx, row) : undefined;
}

export async function insertPayment(
  tx: Database,
  ctx: OrganisationContext,
  bill: BillDto,
  input: { bankAccountId: string; amount: string; paymentDate: string; referenceNumber?: string | null; notes?: string | null },
): Promise<BillPaymentDto> {
  const [row] = await tx.insert(billPayments).values({
    organisationId: ctx.organisationId,
    userId: ctx.userId,
    billId: bill.id,
    bankAccountId: input.bankAccountId,
    amount: roundMoney(input.amount),
    paymentDate: input.paymentDate,
    referenceNumber: input.referenceNumber ?? null,
    notes: input.notes ?? null,
  }).returning();
  if (!row) throw new Error('Failed to record bill payment');
  const [bank] = await tx.select().from(bankAccounts)
    .where(and(eq(bankAccounts.organisationId, ctx.organisationId), eq(bankAccounts.id, input.bankAccountId)));
  if (!bank) throw new Error('Payment bank account missing');
  return billPaymentSchema.parse({
    id: row.id,
    billId: row.billId,
    bankAccountId: row.bankAccountId,
    bankAccountName: bank.accountName,
    amount: roundMoney(row.amount),
    paymentDate: row.paymentDate,
    referenceNumber: row.referenceNumber ?? null,
    notes: row.notes ?? null,
    createdAt: row.createdAt.toISOString(),
  });
}

export async function applyPayment(tx: Database, organisationId: string, bill: BillDto, amount: string) {
  const totalPaid = decimal(bill.totalPaid).add(amount).toFixed();
  const balanceDue = decimal(bill.total).sub(totalPaid).toFixed();
  const paymentStatus = decimal(balanceDue).compare(0) === 0 ? 'paid' : 'partial';
  await tx.update(bills).set({ totalPaid, balanceDue, paymentStatus, updatedAt: new Date() })
    .where(and(eq(bills.organisationId, organisationId), eq(bills.id, bill.id)));
}

export async function hasBankAccount(tx: Database, organisationId: string, id: string) {
  const [row] = await tx.select({ id: bankAccounts.id }).from(bankAccounts)
    .where(and(eq(bankAccounts.organisationId, organisationId), eq(bankAccounts.id, id)));
  return Boolean(row);
}

export async function hasAccount(tx: Database, organisationId: string, id: string) {
  const [row] = await tx.select({ id: accounts.id }).from(accounts)
    .where(and(eq(accounts.organisationId, organisationId), eq(accounts.id, id)));
  return Boolean(row);
}

export async function appendBillHistory(
  tx: Database,
  ctx: OrganisationContext,
  billId: string,
  event: typeof billHistory.$inferInsert.event,
  summary: string,
) {
  await tx.insert(billHistory).values({ organisationId: ctx.organisationId, userId: ctx.userId, billId, event, summary });
}

export async function attachObject(tx: Database, ctx: OrganisationContext, billId: string, input: AttachBillObjectRequest) {
  const [row] = await tx.insert(billAttachments).values({ organisationId: ctx.organisationId, billId, ...input }).returning();
  if (!row) throw new Error('Failed to attach file');
  return billAttachmentSchema.parse({ ...row, createdAt: row.createdAt.toISOString() });
}

export async function removeAttachment(tx: Database, organisationId: string, billId: string, attachmentId: string) {
  const rows = await tx.delete(billAttachments).where(and(
    eq(billAttachments.organisationId, organisationId),
    eq(billAttachments.billId, billId),
    eq(billAttachments.id, attachmentId),
  )).returning();
  return rows[0];
}

export async function getBillAttachment(tx: Database, organisationId: string, billId: string, attachmentId: string) {
  const [row] = await tx.select().from(billAttachments).where(and(
    eq(billAttachments.organisationId, organisationId),
    eq(billAttachments.billId, billId),
    eq(billAttachments.id, attachmentId),
  ));
  return row;
}
