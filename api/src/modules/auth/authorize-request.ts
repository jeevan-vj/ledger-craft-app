import type { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { OrganisationPermission } from '@ledgercraft/contracts';
import type { AppEnv } from '../../types';
import { withOrganisationTx } from './bind-organisation';
import { hasPermission } from './permissions';
import { requireSession } from './require-session';

const resourceDomains: Array<[RegExp, 'customers' | 'invoices' | 'bills' | 'banking' | 'reports' | 'settings' | 'api']> = [
  [/^\/(?:api\/)?customers(?:\/|$)/, 'customers'],
  [/^\/(?:api\/)?(?:invoices|quotes|payments|receipts)(?:\/|$)/, 'invoices'],
  [/^\/(?:api\/)?(?:vendors|bills|expenses|expense-categories)(?:\/|$)/, 'bills'],
  [/^\/(?:api\/)?(?:bank-accounts|bank-transactions|transaction-imports|reconciliation-sessions|book-entries|accounts|journal-entries)(?:\/|$)/, 'banking'],
  [/^\/(?:api\/)?(?:reports|tax-configurations|tax-returns|tax-adjustments)(?:\/|$)/, 'reports'],
  [/^\/(?:api\/)?(?:business-profile|items|item-categories|objects|currency-settings|currencies|exchange-rates|recurring-templates|recurring-runs)(?:\/|$)/, 'settings'],
  [/^\/(?:api\/)?(?:ai|conversations)(?:\/|$)/, 'api'],
];

export function permissionForRequest(method: string, path: string): OrganisationPermission | null {
  const match = resourceDomains.find(([pattern]) => pattern.test(path));
  if (!match) return null;
  const domain = match[1];
  if (domain === 'api') return 'api.access';
  if (domain === 'reports') return 'reports.read';
  const action = method === 'GET' || method === 'HEAD' ? 'read' : 'write';
  return `${domain}.${action}` as OrganisationPermission;
}

export async function authorizeProtectedRequest(c: Context<AppEnv>, next: Next) {
  const permission = permissionForRequest(c.req.method, c.req.path);
  if (!permission) return next();
  const { db, user } = await requireSession(c);
  await withOrganisationTx(db, user.id, async (_tx, context) => {
    if (!hasPermission(context.role, permission)) {
      throw new HTTPException(403, { message: `Missing permission: ${permission}` });
    }
  });
  return next();
}
