import { describe, expect, it } from 'vitest';
import {
  canConvertQuote,
  canDeleteQuote,
  canEditQuote,
  canMarkQuoteSent,
  canRespondToQuote,
  canReviseQuote,
} from './actions';

describe('quote actions', () => {
  it('allows editing, deleting, and marking sent only for drafts', () => {
    expect(canEditQuote('draft')).toBe(true);
    expect(canDeleteQuote('draft')).toBe(true);
    expect(canMarkQuoteSent('draft')).toBe(true);
    expect(canEditQuote('sent')).toBe(false);
    expect(canDeleteQuote('accepted')).toBe(false);
  });

  it('revises sent, viewed, declined, and expired quotes', () => {
    expect(canReviseQuote('sent')).toBe(true);
    expect(canReviseQuote('viewed')).toBe(true);
    expect(canReviseQuote('declined')).toBe(true);
    expect(canReviseQuote('expired')).toBe(true);
    expect(canReviseQuote('accepted')).toBe(false);
    expect(canReviseQuote('converted')).toBe(false);
  });

  it('converts only an accepted quote and records a response from sent or viewed', () => {
    expect(canConvertQuote('accepted')).toBe(true);
    expect(canConvertQuote('sent')).toBe(false);
    expect(canRespondToQuote('viewed')).toBe(true);
    expect(canRespondToQuote('draft')).toBe(false);
  });
});
