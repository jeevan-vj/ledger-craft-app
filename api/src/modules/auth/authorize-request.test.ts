import { describe, expect, it } from 'vitest';
import { permissionForRequest } from './authorize-request';

describe('permissionForRequest', () => {
  it.each([
    ['GET', '/api/customers', 'customers.read'],
    ['POST', '/api/customers', 'customers.write'],
    ['GET', '/api/invoices', 'invoices.read'],
    ['PATCH', '/api/quotes/id', 'invoices.write'],
    ['GET', '/api/bills', 'bills.read'],
    ['POST', '/api/expenses', 'bills.write'],
    ['GET', '/api/reconciliation-sessions', 'banking.read'],
    ['POST', '/api/book-entries', 'banking.write'],
    ['GET', '/api/tax-returns', 'reports.read'],
    ['POST', '/api/tax-returns', 'reports.read'],
    ['GET', '/api/items', 'settings.read'],
    ['DELETE', '/api/objects/id', 'settings.write'],
    ['POST', '/api/ai/chat', 'api.access'],
  ] as const)('%s %s requires %s', (method, path, expected) => {
    expect(permissionForRequest(method, path)).toBe(expected);
  });

  it('leaves public, auth and organisation-administration routes to their dedicated guards', () => {
    expect(permissionForRequest('GET', '/api/public/invoices/token')).toBeNull();
    expect(permissionForRequest('POST', '/api/auth/sign-in/email')).toBeNull();
    expect(permissionForRequest('PATCH', '/api/organisations/id/members/member')).toBeNull();
  });
});
