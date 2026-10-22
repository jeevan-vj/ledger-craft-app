import { decimal } from '../invoices/money';
import {
  expenseListResponseSchema,
  type CreateExpenseCategoryRequest,
  type CreateExpenseRequest,
  type ExpenseCategoryDto,
  type ExpenseDto,
  type ExpenseListResponse,
  type UpdateExpenseCategoryRequest,
  type UpdateExpenseRequest,
} from '@ledgercraft/contracts';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client';
import { withOrganisationTx } from '../auth/bind-organisation';
import * as repo from './expenses.repository';
import { convertToBase, resolveDocumentCurrency, roundAt, currencyRepository } from '../currency/currency.service';

async function assertRefs(
  tx: Database,
  organisationId: string,
  input: { categoryId?: string | null; accountId?: string | null; customerId?: string | null },
): Promise<void> {
  if (input.categoryId) {
    const category = await repo.getCategory(tx, organisationId, input.categoryId);
    if (!category) throw new HTTPException(400, { message: 'Expense category not found' });
  }
  if (input.accountId) {
    const ok = await repo.orgHasAccount(tx, organisationId, input.accountId);
    if (!ok) throw new HTTPException(400, { message: 'Account not found' });
  }
  if (input.customerId) {
    const ok = await repo.orgHasCustomer(tx, organisationId, input.customerId);
    if (!ok) throw new HTTPException(400, { message: 'Customer not found' });
  }
}

export async function listExpensesForUser(db: Database, userId: string): Promise<ExpenseListResponse> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const [expenseRows, categories] = await Promise.all([
      repo.listExpenses(tx, ctx.organisationId),
      repo.listCategories(tx, ctx.organisationId),
    ]);
    return expenseListResponseSchema.parse({ expenses: expenseRows, categories });
  });
}

export async function getExpenseForUser(db: Database, userId: string, id: string): Promise<ExpenseDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const expense = await repo.getExpense(tx, ctx.organisationId, id);
    if (!expense) throw new HTTPException(404, { message: 'Expense not found' });
    return expense;
  });
}

export async function createExpenseForUser(
  db: Database,
  userId: string,
  input: CreateExpenseRequest,
): Promise<ExpenseDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    await assertRefs(tx, ctx.organisationId, input);
    const resolved = await resolveDocumentCurrency(tx, ctx.organisationId, input.currency, input.expenseDate);
    const amount = roundAt(input.amount, resolved.currency.precision);
    const taxAmount = roundAt(input.taxAmount ?? '0', resolved.currency.precision);
    const expense = await repo.insertExpense(tx, ctx, input, {
      amount, taxAmount, exchangeRate: resolved.rate, exchangeRateId: resolved.rateId,
      baseCurrency: resolved.base.code, baseAmount: convertToBase(amount, resolved.rate, resolved.base.precision),
      baseTaxAmount: convertToBase(taxAmount, resolved.rate, resolved.base.precision),
    });
    if (resolved.rateId) await currencyRepository.recordRateUsage(tx, ctx.organisationId, resolved.rateId, 'expense', expense.id);
    return expense;
  });
}

export async function updateExpenseForUser(
  db: Database,
  userId: string,
  id: string,
  input: UpdateExpenseRequest,
): Promise<ExpenseDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    if (input.amount !== undefined && decimal(input.amount).compare(0) <= 0) {
      throw new HTTPException(400, { message: 'Amount must be greater than 0' });
    }
    await assertRefs(tx, ctx.organisationId, input);
    const existing = await repo.getExpense(tx, ctx.organisationId, id);
    if (!existing) throw new HTTPException(404, { message: 'Expense not found' });
    if (existing.exchangeRateId && ((input.currency && input.currency !== existing.currency) || (input.expenseDate && input.expenseDate !== existing.expenseDate))) {
      throw new HTTPException(409, { message: 'Currency and date are locked after a foreign exchange rate is attached' });
    }
    const resolved = await resolveDocumentCurrency(tx, ctx.organisationId, input.currency ?? existing.currency, input.expenseDate ?? existing.expenseDate);
    const amount = roundAt(input.amount ?? existing.amount, resolved.currency.precision);
    const taxAmount = roundAt(input.taxAmount ?? existing.taxAmount, resolved.currency.precision);
    const expense = await repo.updateExpense(tx, ctx.organisationId, id, input, {
      amount, taxAmount, exchangeRate: resolved.rate, exchangeRateId: resolved.rateId,
      baseCurrency: resolved.base.code, baseAmount: convertToBase(amount, resolved.rate, resolved.base.precision),
      baseTaxAmount: convertToBase(taxAmount, resolved.rate, resolved.base.precision),
    });
    if (!expense) throw new HTTPException(404, { message: 'Expense not found' });
    return expense;
  });
}

export async function deleteExpenseForUser(db: Database, userId: string, id: string): Promise<void> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const deleted = await repo.deleteExpense(tx, ctx.organisationId, id);
    if (!deleted) throw new HTTPException(404, { message: 'Expense not found' });
  });
}

export async function listCategoriesForUser(
  db: Database,
  userId: string,
): Promise<{ categories: ExpenseCategoryDto[] }> {
  return withOrganisationTx(db, userId, async (tx, ctx) => ({
    categories: await repo.listCategories(tx, ctx.organisationId),
  }));
}

export async function createCategoryForUser(
  db: Database,
  userId: string,
  input: CreateExpenseCategoryRequest,
): Promise<ExpenseCategoryDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => repo.insertCategory(tx, ctx, input));
}

export async function updateCategoryForUser(
  db: Database,
  userId: string,
  id: string,
  input: UpdateExpenseCategoryRequest,
): Promise<ExpenseCategoryDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const category = await repo.updateCategory(tx, ctx.organisationId, id, input);
    if (!category) throw new HTTPException(404, { message: 'Expense category not found' });
    return category;
  });
}

export async function deleteCategoryForUser(db: Database, userId: string, id: string): Promise<void> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const deleted = await repo.deleteCategory(tx, ctx.organisationId, id);
    if (!deleted) throw new HTTPException(404, { message: 'Expense category not found' });
  });
}
