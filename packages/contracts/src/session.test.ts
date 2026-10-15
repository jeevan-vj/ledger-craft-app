import { describe, expect, it } from 'vitest';
import { meResponseSchema } from './session';

describe('meResponseSchema', () => {
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
