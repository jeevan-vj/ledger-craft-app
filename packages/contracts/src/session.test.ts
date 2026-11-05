import { describe, expect, it } from 'vitest';
import { deleteAccountRequestSchema, deleteAccountResponseSchema, meResponseSchema } from './session';

describe('meResponseSchema', () => {
  it('requires password re-authentication and the exact typed confirmation', () => {
    expect(deleteAccountRequestSchema.safeParse({ password: 'password123', confirmation: 'DELETE' }).success).toBe(true);
    expect(deleteAccountRequestSchema.safeParse({ password: '', confirmation: 'DELETE' }).success).toBe(false);
    expect(deleteAccountRequestSchema.safeParse({ password: 'password123', confirmation: 'delete' }).success).toBe(false);
    expect(deleteAccountRequestSchema.safeParse({ password: 'password123', confirmation: 'DELETE', userId: 'forged' }).success).toBe(false);
  });

  it('keeps the deletion response free of account PII', () => {
    expect(deleteAccountResponseSchema.parse({ deleted: true, deletedAt: '2026-11-06T00:00:00.000Z' })).toEqual({
      deleted: true,
      deletedAt: '2026-11-06T00:00:00.000Z',
    });
  });

  it('accepts a session-bound user, organisation, and membership', () => {
    const payload = {
      user: {
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        email: 'owner@example.com',
        name: 'Owner',
      },
      organisation: {
        id: '11111111-1111-1111-1111-111111111111',
        name: 'Owner Ltd',
      },
      membership: {
        role: 'owner' as const,
      },
      permissions: ['api.access'],
    };

    expect(meResponseSchema.parse(payload)).toEqual(payload);
  });

  it('rejects a drizzle-shaped row leaked as the response', () => {
    const result = meResponseSchema.safeParse({
      id: 'row_1',
      organisation_id: '11111111-1111-1111-1111-111111111111',
      user_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      role: 'owner',
    });

    expect(result.success).toBe(false);
  });

  it('rejects an organisation id that is not a uuid', () => {
    const result = meResponseSchema.safeParse({
      user: { id: 'u1', email: 'a@example.com', name: 'A' },
      organisation: { id: 'not-a-uuid', name: 'A Ltd' },
      membership: { role: 'owner' },
    });

    expect(result.success).toBe(false);
  });
});
