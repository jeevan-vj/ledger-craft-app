import {
  billPaymentSchema,
  billSchema,
  vendorSchema,
  type BillDto,
  type BillPaymentDto,
  type CreateBillRequest,
  type CreateVendorRequest,
  type RecordBillPaymentRequest,
  type UpdateBillRequest,
  type UpdateVendorRequest,
  type VendorDto,
} from '@ledgercraft/contracts';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { accounts } from '../../db/schema/accounts';
import { bankAccounts } from '../../db/schema/bank';
import { billLines, billPayments, bills, vendors } from '../../db/schema/purchases';
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

export function calculateBillLines(input: CreateBillRequest | UpdateBillRequest) {
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
      unitPrice: roundMoney(line.unitPrice),
      taxRate: roundMoney(line.taxRate ?? '15'),
      subtotal: subtotal.toFixed(),
      taxAmount: tax.toFixed(),
      total: total.toFixed(),
      accountId: line.accountId ?? null,
    };
  });
  return {
    lines: calculated,
    subtotal: calculated.reduce((sum, line) => sum.add(line.subtotal), decimal(0)).toFixed(),
    taxAmount: calculated.reduce((sum, line) => sum.add(line.taxAmount), decimal(0)).toFixed(),
    total: calculated.reduce((sum, line) => sum.add(line.total), decimal(0)).toFixed(),
  };
}

async function nextBillNumber(tx: Database, organisationId: string): Promise<string> {
  const [{ count }] = await tx.select({ count: sql<number>`count(*)` }).from(bills)
    .where(eq(bills.organisationId, organisationId));
  return `BILL-${String(Number(count) + 1).padStart(4, '0')}`;
}

async function toBillDto(tx: Database, row: typeof bills.$inferSelect): Promise<BillDto> {
  const [vendor, lines] = await Promise.all([
    getVendor(tx, row.organisationId, row.vendorId),
    tx.select({ line: billLines, accountName: accounts.name }).from(billLines)
      .leftJoin(accounts, and(eq(accounts.organisationId, row.organisationId), eq(accounts.id, billLines.accountId)))
      .where(and(eq(billLines.organisationId, row.organisationId), eq(billLines.billId, row.id)))
      .orderBy(asc(billLines.lineOrder)),
  ]);
  if (!vendor) throw new Error('Bill vendor missing');
  const today = new Date().toISOString().slice(0, 10);
  const displayStatus = row.lifecycleStatus === 'void' ? 'void'
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
    issueDate: row.issueDate,
    dueDate: row.dueDate,
    lifecycleStatus: row.lifecycleStatus,
    paymentStatus: row.paymentStatus,
    displayStatus,
    currency: row.currency,
    taxInclusive: row.taxInclusive,
    subtotal: roundMoney(row.subtotal),
    taxAmount: roundMoney(row.taxAmount),
    total: roundMoney(row.total),
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

export async function insertBill(tx: Database, ctx: OrganisationContext, input: CreateBillRequest) {
  const totals = calculateBillLines(input);
  const [row] = await tx.insert(bills).values({
    organisationId: ctx.organisationId,
    userId: ctx.userId,
    billNumber: await nextBillNumber(tx, ctx.organisationId),
    vendorId: input.vendorId,
    vendorReference: input.vendorReference ?? null,
    issueDate: input.issueDate,
    dueDate: input.dueDate,
    currency: input.currency ?? 'NZD',
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
  return toBillDto(tx, row);
}

export async function updateBill(tx: Database, organisationId: string, id: string, input: UpdateBillRequest) {
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
    const totals = calculateBillLines({ ...input, taxInclusive: input.taxInclusive ?? existing.taxInclusive });
    patch.subtotal = totals.subtotal;
    patch.taxAmount = totals.taxAmount;
    patch.total = totals.total;
    patch.balanceDue = decimal(totals.total).sub(existing.totalPaid).toFixed();
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

export async function insertPayment(
  tx: Database,
  ctx: OrganisationContext,
  bill: BillDto,
  input: RecordBillPaymentRequest,
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
