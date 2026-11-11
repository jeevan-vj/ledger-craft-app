import { describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { permissionForRequest } from './authorize-request';

describe('permissionForRequest', () => {
  it('protects GST registration changes and financial filing writes independently of report read access', () => {
    expect(permissionForRequest('PUT', '/api/tax/gst-settings')).toBe('settings.write');
    expect(permissionForRequest('GET', '/api/tax/gst-settings')).toBe('settings.read');
    expect(permissionForRequest('POST', '/api/tax-returns/id/file')).toBe('banking.write');
    expect(permissionForRequest('POST', '/api/tax-returns')).toBe('banking.write');
    expect(permissionForRequest('PATCH', '/api/tax-returns/id')).toBe('banking.write');
    expect(permissionForRequest('DELETE', '/api/tax-returns/id')).toBe('banking.write');
  });
  it.each([
    ['GET', '/api/customers', 'customers.read'],
    ['POST', '/api/customers', 'customers.write'],
    ['POST', '/api/sales', 'invoices.write'],
    ['GET', '/api/invoices', 'invoices.read'],
    ['POST', '/api/payments/id/reverse', 'invoices.write'],
    ['GET', '/api/credit-notes', 'invoices.read'],
    ['POST', '/api/credit-notes', 'invoices.write'],
    ['POST', '/api/credit-notes/id/refunds', 'invoices.write'],
    ['PATCH', '/api/quotes/id', 'invoices.write'],
    ['GET', '/api/bills', 'bills.read'],
    ['POST', '/api/expenses', 'bills.write'],
    ['GET', '/api/reconciliation-sessions', 'banking.read'],
    ['POST', '/api/book-entries', 'banking.write'],
    ['GET', '/api/tax-returns', 'reports.read'],
    ['GET', '/api/tax/gst-preparation', 'reports.read'],
    ['POST', '/api/tax/gst-preparation', 'banking.write'],
    ['GET', '/api/tax/sales-tax-reclassifications', 'reports.read'],
    ['POST', '/api/tax/sales-tax-reclassifications', 'banking.write'],
    ['POST', '/api/tax/sales-tax-reclassifications/preview', 'banking.write'],
    ['POST', '/api/tax/sales-tax-reclassifications/id/undo', 'banking.write'],
    ['POST', '/api/tax/company-income-tax-preparation', 'reports.read'],
    ['GET', '/api/journal-entries/ledger-audit', 'banking.read'],
    ['POST', '/api/journal-entries/ledger-audit/apply', 'banking.write'],
    ['POST', '/api/journal-entries/opening-balances', 'banking.write'],
    ['POST', '/api/fx-revaluations/preview', 'banking.read'],
    ['POST', '/api/fx-revaluations', 'banking.write'],
    ['POST', '/api/tax-returns', 'banking.write'],
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
      /^\/(?:api\/)?me(?:\/|$)/,
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
