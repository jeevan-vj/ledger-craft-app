import { chatCompletionResponseSchema, errorEnvelopeSchema, receiptScanResultSchema } from '@ledgercraft/contracts';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { createDb } from '../../db/local';
import { getDatabaseUrl } from '../../env';
import { createAuth } from '../auth/auth';
import { assertLocalDatabaseReachable, withTestDb } from '../../test/harness';
import type { ChatCompleter } from './chat';
import type { ReceiptScanner } from './scanner';

function cookieHeader(response: Response): string {
  const cookies = response.headers.getSetCookie();
  return cookies.map((cookie) => cookie.split(';')[0]).join('; ');
}

const originHeaders = {
  Origin: 'http://localhost:8080',
  'Content-Type': 'application/json',
};

async function signUp(app: ReturnType<typeof createApp>, name: string) {
  const email = `${name.toLowerCase().replace(/\s+/g, '-')}-${crypto.randomUUID()}@example.com`;
  const response = await app.request('/api/auth/sign-up/email', {
    method: 'POST',
    headers: originHeaders,
    body: JSON.stringify({ name, email, password: 'password123' }),
  });
  expect(response.status).toBeLessThan(400);
  return { cookie: cookieHeader(response) };
}

describe('ai routes', () => {
  it('unauthenticated POST /api/ai/receipt-scan returns 401', async () => {
    const response = await createApp().request('/api/ai/receipt-scan', {
      method: 'POST',
      headers: originHeaders,
      body: JSON.stringify({ imageBase64: 'abc' }),
    });
    expect(response.status).toBe(401);
    expect(errorEnvelopeSchema.parse(await response.json()).error.code).toBe('UNAUTHORIZED');
  });

  it('returns a validated scan from the injected scanner and 503 without one', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const auth = createAuth(db);
        const missing = createApp({ auth, db, checkDatabase: async () => true });
        const owner = await signUp(missing, 'Owner A');
        const unavailable = await missing.request('/api/ai/receipt-scan', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: owner.cookie },
          body: JSON.stringify({ imageBase64: 'abc' }),
        });
        expect(unavailable.status).toBe(503);
        expect(errorEnvelopeSchema.parse(await unavailable.json()).error.code).toBe('AI_UNAVAILABLE');

        const scanner: ReceiptScanner = {
          async scan() {
            return {
              merchantName: 'North Harbour Cafe',
              date: '2026-09-08',
              total: 12.5,
              tax: 1.63,
              subtotal: 10.87,
              items: [{ description: 'Flat white', quantity: 1, price: 5 }],
              paymentMethod: 'card',
              suggestedCategory: 'Food & Beverage',
              confidence: 91,
              notes: null,
            };
          },
        };
        const app = createApp({ auth, db, checkDatabase: async () => true, receiptScanner: scanner });
        const scanned = await app.request('/api/ai/receipt-scan', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: owner.cookie },
          body: JSON.stringify({ imageBase64: 'abc', contentType: 'image/png' }),
        });
        expect(scanned.status).toBe(200);
        const result = receiptScanResultSchema.parse(await scanned.json());
        expect(result.merchantName).toBe('North Harbour Cafe');
        expect(result.total).toBe(12.5);
      } finally {
        await sql.end();
      }
    });
  });

  it('unauthenticated POST /api/ai/chat returns 401', async () => {
    const response = await createApp().request('/api/ai/chat', {
      method: 'POST',
      headers: originHeaders,
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Hello' }] }),
    });
    expect(response.status).toBe(401);
    expect(errorEnvelopeSchema.parse(await response.json()).error.code).toBe('UNAUTHORIZED');
  });

  it('returns chat content from the injected completer and 503 without one', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const auth = createAuth(db);
        const missing = createApp({ auth, db, checkDatabase: async () => true });
        const owner = await signUp(missing, 'Owner Chat');
        const unavailable = await missing.request('/api/ai/chat', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: owner.cookie },
          body: JSON.stringify({ messages: [{ role: 'user', content: 'Hello' }] }),
        });
        expect(unavailable.status).toBe(503);
        expect(errorEnvelopeSchema.parse(await unavailable.json()).error.code).toBe('AI_UNAVAILABLE');

        const chatCompleter: ChatCompleter = {
          async complete() {
            return '{"intent":"create_invoice","entities":[],"confidence":0.9}';
          },
        };
        const app = createApp({ auth, db, checkDatabase: async () => true, chatCompleter });
        const completed = await app.request('/api/ai/chat', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: owner.cookie },
          body: JSON.stringify({ messages: [{ role: 'user', content: 'Create an invoice' }] }),
        });
        expect(completed.status).toBe(200);
        const result = chatCompletionResponseSchema.parse(await completed.json());
        expect(result.content).toContain('create_invoice');
      } finally {
        await sql.end();
      }
    });
  });
});
