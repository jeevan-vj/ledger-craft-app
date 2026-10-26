import { describe, expect, it } from 'vitest';
import { hasPermission } from './permissions';

describe('organisation role permissions', () => {
  it.each(['owner', 'admin', 'accountant'] as const)('%s may import invoices', (role) => {
    expect(hasPermission(role, 'invoices.import')).toBe(true);
  });

  it.each(['member', 'read_only'] as const)('%s may not import invoices', (role) => {
    expect(hasPermission(role, 'invoices.import')).toBe(false);
  });

  it.each(['owner', 'admin', 'accountant', 'member'] as const)('%s may use AI', (role) => {
    expect(hasPermission(role, 'ai.use')).toBe(true);
  });

  it('does not let read-only members use AI', () => {
    expect(hasPermission('read_only', 'ai.use')).toBe(false);
  });
});
