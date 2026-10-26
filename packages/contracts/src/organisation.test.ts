import { describe, expect, it } from 'vitest';
import {
  acceptInvitationRequestSchema,
  createInvitationRequestSchema,
  createOrganisationRequestSchema,
  organisationRoleSchema,
  organisationPermissionSchema,
  updateMemberRequestSchema,
} from './organisation';

describe('organisation contracts', () => {
  it('supports the fixed collaboration roles', () => {
    for (const role of ['owner', 'admin', 'accountant', 'member', 'read_only'] as const) {
      expect(organisationRoleSchema.parse(role)).toBe(role);
    }
    expect(() => organisationRoleSchema.parse('superuser')).toThrow();
  });

  it('exposes dedicated invoice-import and AI-use permissions', () => {
    expect(organisationPermissionSchema.parse('invoices.import')).toBe('invoices.import');
    expect(organisationPermissionSchema.parse('ai.use')).toBe('ai.use');
  });

  it('validates organisation, member, and invitation writes', () => {
    expect(createOrganisationRequestSchema.parse({ name: 'South Island Studio' })).toEqual({
      name: 'South Island Studio',
    });
    expect(updateMemberRequestSchema.parse({ role: 'accountant' })).toEqual({ role: 'accountant' });
    expect(createInvitationRequestSchema.parse({ email: 'books@example.com', role: 'read_only' })).toEqual({
      email: 'books@example.com',
      role: 'read_only',
    });
    expect(acceptInvitationRequestSchema.parse({ token: 'a'.repeat(32) })).toEqual({ token: 'a'.repeat(32) });
  });
});
