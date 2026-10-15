import { describe, expect, it } from 'vitest';
import {
  addConversationMessageRequestSchema,
  createConversationRequestSchema,
  updateConversationRequestSchema,
} from './conversation';

describe('conversation contracts', () => {
  it('rejects ownership ids on create and message', () => {
    expect(
      createConversationRequestSchema.safeParse({
        title: 'GST help',
        organisationId: '11111111-1111-1111-1111-111111111111',
      }).success,
    ).toBe(false);
    expect(
      addConversationMessageRequestSchema.safeParse({
        role: 'user',
        content: 'hello',
        userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      }).success,
    ).toBe(false);
    expect(
      updateConversationRequestSchema.safeParse({
        status: 'completed',
        organisationId: '11111111-1111-1111-1111-111111111111',
      }).success,
    ).toBe(false);
  });
});
