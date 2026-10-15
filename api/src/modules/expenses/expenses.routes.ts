import {
  createExpenseCategoryRequestSchema,
  createExpenseRequestSchema,
  updateExpenseCategoryRequestSchema,
  updateExpenseRequestSchema,
} from '@ledgercraft/contracts';
import { Hono } from 'hono';
import type { AppEnv } from '../../types';
import { requireSession } from '../auth/require-session';
import * as expensesService from './expenses.service';

export function expenseRoutes() {
  const routes = new Hono<AppEnv>();

  for (const prefix of ['', '/api'] as const) {
    routes.get(`${prefix}/expenses`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await expensesService.listExpensesForUser(db, user.id));
    });

    routes.get(`${prefix}/expenses/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await expensesService.getExpenseForUser(db, user.id, c.req.param('id')));
    });

    routes.post(`${prefix}/expenses`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = createExpenseRequestSchema.parse(await c.req.json());
      return c.json(await expensesService.createExpenseForUser(db, user.id, input), 201);
    });

    routes.patch(`${prefix}/expenses/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = updateExpenseRequestSchema.parse(await c.req.json());
      return c.json(await expensesService.updateExpenseForUser(db, user.id, c.req.param('id'), input));
    });

    routes.delete(`${prefix}/expenses/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      await expensesService.deleteExpenseForUser(db, user.id, c.req.param('id'));
      return c.body(null, 204);
    });

    routes.get(`${prefix}/expense-categories`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await expensesService.listCategoriesForUser(db, user.id));
    });

    routes.post(`${prefix}/expense-categories`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = createExpenseCategoryRequestSchema.parse(await c.req.json());
      return c.json(await expensesService.createCategoryForUser(db, user.id, input), 201);
    });

    routes.patch(`${prefix}/expense-categories/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = updateExpenseCategoryRequestSchema.parse(await c.req.json());
      return c.json(
        await expensesService.updateCategoryForUser(db, user.id, c.req.param('id'), input),
      );
    });

    routes.delete(`${prefix}/expense-categories/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      await expensesService.deleteCategoryForUser(db, user.id, c.req.param('id'));
      return c.body(null, 204);
    });
  }

  return routes;
}
