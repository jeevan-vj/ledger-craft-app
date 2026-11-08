import { applyLedgerAuditRequestSchema, openingBalancesRequestSchema } from '@ledgercraft/contracts';
import { closeAccountingPeriodRequestSchema, reopenAccountingPeriodRequestSchema } from '@ledgercraft/contracts';
import { accountingPeriodsForUser, closeAccountingPeriodForUser, reopenAccountingPeriodForUser } from './period-lock';
import { Hono } from 'hono';
import type { AppEnv } from '../../types';
import { requireSession } from '../auth/require-session';
import { applyLedgerAuditForUser, auditLedgerForUser, postOpeningBalancesForUser } from './recovery.service';

/** Mounted before generic journal-entries/:id routes. Banking permissions apply. */
export function accountingRoutes() {
  const routes = new Hono<AppEnv>();
  for (const prefix of ['', '/api'] as const) {
    routes.get(`${prefix}/accounting-periods`, async c => { const {db,user}=await requireSession(c);return c.json(await accountingPeriodsForUser(db,user.id)); });
    routes.post(`${prefix}/accounting-periods/close`, async c => { const {db,user}=await requireSession(c);return c.json(await closeAccountingPeriodForUser(db,user.id,closeAccountingPeriodRequestSchema.parse(await c.req.json()),c.req.header('X-Expected-Organisation-ID'))); });
    routes.post(`${prefix}/accounting-periods/reopen`, async c => { const {db,user}=await requireSession(c);return c.json(await reopenAccountingPeriodForUser(db,user.id,reopenAccountingPeriodRequestSchema.parse(await c.req.json()),c.req.header('X-Expected-Organisation-ID'))); });
    routes.get(`${prefix}/journal-entries/ledger-audit`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await auditLedgerForUser(db, user.id));
    });
    routes.post(`${prefix}/journal-entries/ledger-audit/apply`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await applyLedgerAuditForUser(db, user.id, applyLedgerAuditRequestSchema.parse(await c.req.json())));
    });
    routes.post(`${prefix}/journal-entries/opening-balances`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await postOpeningBalancesForUser(db, user.id, openingBalancesRequestSchema.parse(await c.req.json())), 201);
    });
  }
  return routes;
}
