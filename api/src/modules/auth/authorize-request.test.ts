import { describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { permissionForRequest } from './authorize-request';

describe('permissionForRequest', () => {
  it.each([
    ['GET', '/api/customers', 'customers.read'],
    ['POST', '/api/customers', 'customers.write'],
    ['POST', '/api/sales', 'invoices.write'],
    ['GET', '/api/invoices', 'invoices.read'],
    ['PATCH', '/api/quotes/id', 'invoices.write'],
    ['GET', '/api/bills', 'bills.read'],
    ['POST', '/api/expenses', 'bills.write'],
    ['GET', '/api/reconciliation-sessions', 'banking.read'],
    ['POST', '/api/book-entries', 'banking.write'],
    ['GET', '/api/tax-returns', 'reports.read'],
    ['POST', '/api/tax-returns', 'reports.read'],
    ['GET', '/api/items', 'settings.read'],
    ['POST', '/api/recurring-templates/preview', 'settings.read'],
    ['GET', '/api/items/export', 'settings.write'],
    ['POST', '/api/items/import', 'settings.write'],
    ['DELETE', '/api/objects/id', 'settings.write'],
    ['POST', '/api/invoices-import', 'invoices.import'],
    ['POST', '/api/invoice-imports', 'invoices.import'],
    ['DELETE', '/api/invoice-imports/id', 'invoices.import'],
    ['GET', '/api/invoice-imports/id', 'invoices.read'],
    ['GET', '/api/invoice-imports/id/file', 'invoices.read'],
    ['GET', '/api/invoices-export.csv', 'invoices.write'],
    ['GET', '/api/bills-export.csv', 'bills.write'],
    ['GET', '/api/vendors-export.csv', 'bills.write'],
    ['GET', '/api/bank-transactions/export.csv', 'banking.write'],
    ['POST', '/api/bank-transactions/import', 'banking.write'],
    ['POST', '/api/ai/chat', 'ai.use'],
    ['POST', '/api/ai/receipt-scan', 'ai.use'],
    ['GET', '/api/conversations', 'api.access'],
    ['POST', '/api/conversations', 'ai.use'],
  ] as const)('%s %s requires %s', (method, path, expected) => {
    expect(permissionForRequest(method, path)).toBe(expected);
  });

  it('leaves public, auth and organisation-administration routes to their dedicated guards', () => {
    expect(permissionForRequest('GET', '/api/public/invoices/token')).toBeNull();
    expect(permissionForRequest('POST', '/api/auth/sign-in/email')).toBeNull();
    expect(permissionForRequest('PATCH', '/api/organisations/id/members/member')).toBeNull();
  });

  it('maps every registered non-public application route to a permission', () => {
    const explicitlyGuardedOrPublic = [
      /^\/$/,
      /^\/(?:api\/)?(?:healthz|readyz)$/,
      /^\/api\/auth\//,
      /^\/(?:api\/)?me$/,
      /^\/(?:api\/)?public\//,
      /^\/api\/stripe\/webhooks\/(?:platform|connect)$/,
      /^\/api\/stripe\/mock\//,
      /^\/api\/(?:organisations|invitations)(?:\/|$)/,
      /^\/api\/__test\//,
    ];
    const routes = createApp().routes.filter((route) =>
      route.method !== 'ALL'
      && !explicitlyGuardedOrPublic.some((pattern) => pattern.test(route.path)));

    expect(routes.length).toBeGreaterThan(0);
    expect(routes.filter((route) => permissionForRequest(route.method, route.path) == null))
      .toEqual([]);
  });
});
