import {
  expenseCategorySchema,
  expenseSchema,
  type CreateExpenseCategoryRequest,
  type CreateExpenseRequest,
  type ExpenseCategoryDto,
  type ExpenseDto,
  type UpdateExpenseCategoryRequest,
  type UpdateExpenseRequest,
} from '@ledgercraft/contracts';
import { and, desc, eq } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { accounts } from '../../db/schema/accounts';
import { customers } from '../../db/schema/customers';
import { expenseCategories, expenses } from '../../db/schema/expenses';

function toCategoryDto(row: typeof expenseCategories.$inferSelect): ExpenseCategoryDto {
  return expenseCategorySchema.parse({
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    color: row.color ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

function toExpenseDto(
  row: typeof expenses.$inferSelect,
  names: { categoryName: string | null; accountName: string | null; customerName: string | null },
): ExpenseDto {
  return expenseSchema.parse({
    id: row.id,
    description: row.description,
    amount: row.amount,
    taxAmount: row.taxAmount,
    currency: row.currency,
    exchangeRate: row.exchangeRate,
    exchangeRateId: row.exchangeRateId ?? null,
    baseCurrency: row.baseCurrency,
    baseAmount: row.baseAmount,
    baseTaxAmount: row.baseTaxAmount,
    expenseDate: row.expenseDate,
    status: row.status,
    isBillable: row.isBillable,
    categoryId: row.categoryId ?? null,
    categoryName: names.categoryName,
    accountId: row.accountId ?? null,
    accountName: names.accountName,
    customerId: row.customerId ?? null,
    customerName: names.customerName,
    vendorName: row.vendorName ?? null,
    receiptUrl: row.receiptUrl ?? null,
    paymentMethod: row.paymentMethod ?? null,
    notes: row.notes ?? null,
    gstTreatment: row.gstTreatment,
    gstExemptionReason: row.gstExemptionReason,
    gstClaimablePercentage: row.gstClaimablePercentage,
    privateUsePercentage: row.privateUsePercentage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

export async function listCategories(
  tx: Database,
  organisationId: string,
): Promise<ExpenseCategoryDto[]> {
  const rows = await tx
    .select()
    .from(expenseCategories)
    .where(eq(expenseCategories.organisationId, organisationId))
    .orderBy(expenseCategories.name);
  return rows.map(toCategoryDto);
}

export async function listExpenses(tx: Database, organisationId: string): Promise<ExpenseDto[]> {
  const rows = await tx
    .select({
      expense: expenses,
      categoryName: expenseCategories.name,
      accountName: accounts.name,
      customerName: customers.name,
    })
    .from(expenses)
    .leftJoin(expenseCategories, and(eq(expenseCategories.id, expenses.categoryId), eq(expenseCategories.organisationId, organisationId)))
    .leftJoin(accounts, and(eq(accounts.id, expenses.accountId), eq(accounts.organisationId, organisationId)))
    .leftJoin(customers, and(eq(customers.id, expenses.customerId), eq(customers.organisationId, organisationId)))
    .where(eq(expenses.organisationId, organisationId))
    .orderBy(desc(expenses.expenseDate), desc(expenses.createdAt));
  return rows.map((row) =>
    toExpenseDto(row.expense, {
      categoryName: row.categoryName ?? null,
      accountName: row.accountName ?? null,
      customerName: row.customerName ?? null,
    }),
  );
}

export async function getExpense(
  tx: Database,
  organisationId: string,
  id: string,
): Promise<ExpenseDto | undefined> {
  const [row] = await tx
    .select({
      expense: expenses,
      categoryName: expenseCategories.name,
      accountName: accounts.name,
      customerName: customers.name,
    })
    .from(expenses)
    .leftJoin(expenseCategories, and(eq(expenseCategories.id, expenses.categoryId), eq(expenseCategories.organisationId, organisationId)))
    .leftJoin(accounts, and(eq(accounts.id, expenses.accountId), eq(accounts.organisationId, organisationId)))
    .leftJoin(customers, and(eq(customers.id, expenses.customerId), eq(customers.organisationId, organisationId)))
    .where(and(eq(expenses.id, id), eq(expenses.organisationId, organisationId)));
  if (!row) return undefined;
  return toExpenseDto(row.expense, {
    categoryName: row.categoryName ?? null,
    accountName: row.accountName ?? null,
    customerName: row.customerName ?? null,
  });
}

export async function insertCategory(
  tx: Database,
  ctx: { organisationId: string; userId: string },
  input: CreateExpenseCategoryRequest,
): Promise<ExpenseCategoryDto> {
  const [row] = await tx
    .insert(expenseCategories)
    .values({
      organisationId: ctx.organisationId,
      userId: ctx.userId,
      name: input.name,
      description: input.description ?? null,
      color: input.color ?? null,
    })
    .returning();
  if (!row) throw new Error('Failed to insert expense category');
  return toCategoryDto(row);
}

export async function updateCategory(
  tx: Database,
  organisationId: string,
  id: string,
  input: UpdateExpenseCategoryRequest,
): Promise<ExpenseCategoryDto | undefined> {
  const patch: Partial<typeof expenseCategories.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;
  if (input.color !== undefined) patch.color = input.color;
  const [row] = await tx
    .update(expenseCategories)
    .set(patch)
    .where(and(eq(expenseCategories.id, id), eq(expenseCategories.organisationId, organisationId)))
    .returning();
  return row ? toCategoryDto(row) : undefined;
}

export async function deleteCategory(
  tx: Database,
  organisationId: string,
  id: string,
): Promise<boolean> {
  const deleted = await tx
    .delete(expenseCategories)
    .where(and(eq(expenseCategories.id, id), eq(expenseCategories.organisationId, organisationId)))
    .returning({ id: expenseCategories.id });
  return deleted.length > 0;
}

export async function getCategory(
  tx: Database,
  organisationId: string,
  id: string,
): Promise<ExpenseCategoryDto | undefined> {
  const [row] = await tx
    .select()
    .from(expenseCategories)
    .where(and(eq(expenseCategories.id, id), eq(expenseCategories.organisationId, organisationId)));
  return row ? toCategoryDto(row) : undefined;
}

export async function insertExpense(
  tx: Database,
  ctx: { organisationId: string; userId: string },
  input: CreateExpenseRequest,
  currency: { amount: string; taxAmount: string; exchangeRate: string; exchangeRateId: string | null; baseCurrency: string; baseAmount: string; baseTaxAmount: string },
): Promise<ExpenseDto> {
  const [row] = await tx
    .insert(expenses)
    .values({
      organisationId: ctx.organisationId,
      userId: ctx.userId,
      description: input.description,
      amount: currency.amount,
      taxAmount: currency.taxAmount,
      currency: input.currency ?? 'NZD',
      exchangeRate: currency.exchangeRate,
      exchangeRateId: currency.exchangeRateId,
      baseCurrency: currency.baseCurrency,
      baseAmount: currency.baseAmount,
      baseTaxAmount: currency.baseTaxAmount,
      expenseDate: input.expenseDate,
      status: input.status ?? 'pending',
      isBillable: input.isBillable ?? false,
      categoryId: input.categoryId ?? null,
      accountId: input.accountId ?? null,
      customerId: input.customerId ?? null,
      vendorName: input.vendorName ?? null,
      receiptUrl: input.receiptUrl ?? null,
      paymentMethod: input.paymentMethod ?? null,
      notes: input.notes ?? null,
      gstTreatment: input.gstTreatment ?? 'standard',
      gstExemptionReason: input.gstExemptionReason ?? 'none',
      gstClaimablePercentage: input.gstClaimablePercentage ?? 100,
      privateUsePercentage: input.privateUsePercentage ?? 0,
    })
    .returning();
  if (!row) throw new Error('Failed to insert expense');
  return getExpense(tx, ctx.organisationId, row.id) as Promise<ExpenseDto>;
}

export async function updateExpense(
  tx: Database,
  organisationId: string,
  id: string,
  input: UpdateExpenseRequest,
  currency?: { amount: string; taxAmount: string; exchangeRate: string; exchangeRateId: string | null; baseCurrency: string; baseAmount: string; baseTaxAmount: string },
): Promise<ExpenseDto | undefined> {
  const existing = await getExpense(tx, organisationId, id);
  if (!existing) return undefined;
  const patch: Partial<typeof expenses.$inferInsert> = { updatedAt: new Date() };
  if (input.description !== undefined) patch.description = input.description;
  if (currency) {
    patch.amount = currency.amount; patch.taxAmount = currency.taxAmount; patch.exchangeRate = currency.exchangeRate;
    patch.exchangeRateId = currency.exchangeRateId; patch.baseCurrency = currency.baseCurrency;
    patch.baseAmount = currency.baseAmount; patch.baseTaxAmount = currency.baseTaxAmount;
  }
  if (input.currency !== undefined) patch.currency = input.currency;
  if (input.expenseDate !== undefined) patch.expenseDate = input.expenseDate;
  if (input.status !== undefined) patch.status = input.status;
  if (input.isBillable !== undefined) patch.isBillable = input.isBillable;
  if (input.categoryId !== undefined) patch.categoryId = input.categoryId;
  if (input.accountId !== undefined) patch.accountId = input.accountId;
  if (input.customerId !== undefined) patch.customerId = input.customerId;
  if (input.vendorName !== undefined) patch.vendorName = input.vendorName;
  if (input.receiptUrl !== undefined) patch.receiptUrl = input.receiptUrl;
  if (input.paymentMethod !== undefined) patch.paymentMethod = input.paymentMethod;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.gstTreatment !== undefined) patch.gstTreatment = input.gstTreatment;
  if (input.gstExemptionReason !== undefined) patch.gstExemptionReason = input.gstExemptionReason;
  if (input.gstClaimablePercentage !== undefined) patch.gstClaimablePercentage = input.gstClaimablePercentage;
  if (input.privateUsePercentage !== undefined) patch.privateUsePercentage = input.privateUsePercentage;
  await tx
    .update(expenses)
    .set(patch)
    .where(and(eq(expenses.id, id), eq(expenses.organisationId, organisationId)));
  return getExpense(tx, organisationId, id);
}

export async function deleteExpense(
  tx: Database,
  organisationId: string,
  id: string,
): Promise<boolean> {
  const deleted = await tx
    .delete(expenses)
    .where(and(eq(expenses.id, id), eq(expenses.organisationId, organisationId)))
    .returning({ id: expenses.id });
  return deleted.length > 0;
}

export async function orgHasAccount(
  tx: Database,
  organisationId: string,
  id: string,
): Promise<boolean> {
  const [row] = await tx
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.organisationId, organisationId)));
  return Boolean(row);
}

export async function orgHasCustomer(
  tx: Database,
  organisationId: string,
  id: string,
): Promise<boolean> {
  const [row] = await tx
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, id), eq(customers.organisationId, organisationId)));
  return Boolean(row);
}
