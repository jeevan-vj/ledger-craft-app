import { financialReportQuerySchema } from '@ledgercraft/contracts';
import { Hono } from 'hono';
import type { AppEnv } from '../../types';
import { requireSession } from '../auth/require-session';
import * as service from './reports.service';

function queryInput(url: string) {
  const search = new URL(url).searchParams;
  const list = (name: string) => search.getAll(name).flatMap((value) => value.split(',')).filter(Boolean);
  return financialReportQuerySchema.parse({
    from: search.get('from'), to: search.get('to'), basis: search.get('basis') ?? 'accrual', baseCurrency: search.get('baseCurrency') ?? 'NZD',
    comparisonFrom: search.get('comparisonFrom') ?? undefined, comparisonTo: search.get('comparisonTo') ?? undefined,
    accountIds: list('accountIds').length ? list('accountIds') : undefined, categoryIds: list('categoryIds').length ? list('categoryIds') : undefined,
    customerIds: list('customerIds').length ? list('customerIds') : undefined, vendorIds: list('vendorIds').length ? list('vendorIds') : undefined,
  });
}

export function reportRoutes() {
  const routes = new Hono<AppEnv>();
  for (const prefix of ['', '/api'] as const) {
    routes.get(`${prefix}/reports/financial`, async (c) => { const { db, user } = await requireSession(c); return c.json(await service.financialReportForUser(db, user.id, queryInput(c.req.url))); });
    routes.get(`${prefix}/reports/general-ledger`, async (c) => { const { db, user } = await requireSession(c); return c.json(await service.generalLedgerForUser(db, user.id, queryInput(c.req.url))); });
    routes.get(`${prefix}/reports/accounts/:id/statement`, async (c) => { const { db, user } = await requireSession(c); return c.json(await service.accountStatementForUser(db, user.id, c.req.param('id'), queryInput(c.req.url))); });
  }
  return routes;
}
