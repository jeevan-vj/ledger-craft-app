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
    return repo.insertExpense(tx, ctx, input);
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
    const expense = await repo.updateExpense(tx, ctx.organisationId, id, input);
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
