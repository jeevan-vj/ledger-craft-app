import { errorEnvelopeSchema, type AssistantTurnResponse } from '@ledgercraft/contracts';
import { count, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { createDb } from '../../db/local';
import { getDatabaseUrl } from '../../env';
import { assistantEvents } from '../../db/schema/assistant-events';
import { conversationMessages } from '../../db/schema/conversations';
import { expenses } from '../../db/schema/expenses';
import { invoices } from '../../db/schema/invoices';
import { journalEntries } from '../../db/schema/accounts';
import { apiError } from '../../http-error';
import { assertLocalDatabaseReachable, withTestDb } from '../../test/harness';
import { createAuth } from '../auth/auth';
import type { AssistantModel, AssistantModelTurn } from './assistant.config';
import { ASSISTANT_EVAL_PROMPTS } from './assistant.prompts';
import type { ReceiptScanner } from './scanner';

const headers = { Origin: 'http://localhost:8080', 'Content-Type': 'application/json' };
const MONDAY = new Date('2026-11-09T01:00:00.000Z');
const prompt = (id: typeof ASSISTANT_EVAL_PROMPTS[number]['id']) => ASSISTANT_EVAL_PROMPTS.find((item) => item.id === id)!.prompt;

function cookieOf(response: Response): string {
  return response.headers.getSetCookie().map((cookie) => cookie.split(';')[0]).join('; ');
}

function scripted(steps: AssistantModelTurn[], calls: { n: number }): AssistantModel {
  let index = 0;
  return {
    async complete({ signal }) {
      if (signal.aborted) throw apiError(504, 'ASSISTANT_TIMEOUT', 'The assistant took too long. Nothing was saved. Use Invoices to continue.');
      calls.n += 1;
      return steps[index++] ?? { text: '', toolCalls: [], inputTokens: 1, outputTokens: 1 };
    },
  };
}

function turn(tools: Array<{ name: string; arguments: unknown }>, tokens?: Partial<Pick<AssistantModelTurn, 'inputTokens' | 'outputTokens'>>): AssistantModelTurn {
  return {
    toolCalls: tools.map((tool, index) => ({ id: `call_${index + 1}`, name: tool.name, arguments: tool.arguments })),
    inputTokens: tokens?.inputTokens ?? 20,
    outputTokens: tokens?.outputTokens ?? 8,
  };
}

async function tally(db: ReturnType<typeof createDb>['db']) {
  const [invoiceCount] = await db.select({ value: count() }).from(invoices);
  const [journalCount] = await db.select({ value: count() }).from(journalEntries);
  const [expenseCount] = await db.select({ value: count() }).from(expenses);
  return { invoices: Number(invoiceCount.value), journals: Number(journalCount.value), expenses: Number(expenseCount.value) };
}

describe('assistant eval suite', () => {
  beforeAll(async () => { await assertLocalDatabaseReachable(); });

  async function run(options: {
    steps?: AssistantModelTurn[];
    model?: AssistantModel;
    now?: Date;
    limits?: { dailyMessages?: number; perMinute?: number; dailyCostUsd?: string };
    timeoutMs?: number;
    assistant?: 'available' | 'unavailable';
    scanner?: ReceiptScanner;
  }, execute: (ctx: {
    app: ReturnType<typeof createApp>;
    db: ReturnType<typeof createDb>['db'];
    cookie: string;
    calls: { n: number };
    call: (path: string, method: string, body?: unknown, expected?: number) => Promise<Record<string, unknown>>;
    ask: (message: string, expected?: number) => Promise<AssistantTurnResponse & { error?: { code: string } }>;
  }) => Promise<void>) {
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const calls = { n: 0 };
        const app = createApp({
          auth: createAuth(db),
          db,
          checkDatabase: async () => true,
          receiptScanner: options.scanner,
          capabilities: { email: 'unavailable', ai: options.scanner ? 'available' : 'unavailable', stripe: 'unavailable', assistant: options.assistant ?? 'available' },
          assistant: {
            model: options.model ?? scripted(options.steps ?? [], calls),
            now: options.now ?? MONDAY,
            timeoutMs: options.timeoutMs ?? 2_000,
            limits: { dailyMessages: 100, perMinute: 100, dailyCostUsd: '50.00', ...options.limits },
          },
        });
        const email = `owner-${crypto.randomUUID()}@example.test`;
        const signup = await app.request('/api/auth/sign-up/email', { method: 'POST', headers, body: JSON.stringify({ name: 'Owner', email, password: 'password123' }) });
        expect(signup.status).toBeLessThan(400);
        const cookie = cookieOf(signup);
        const call = async (path: string, method: string, body?: unknown, expected = 200) => {
          const response = await app.request(path, { method, headers: { ...headers, Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
          const text = await response.text();
          const json = text ? JSON.parse(text) as Record<string, unknown> : {};
          expect(response.status, JSON.stringify(json)).toBe(expected);
          return json;
        };
        await call('/api/business-profile', 'PUT', { name: 'Kauri Plumbing', email: 'owner@example.test', country: 'NZ', defaultTaxRate: '15' });
        const ask = async (message: string, expected = 200) => {
          const response = await app.request('/api/ai/assistant', { method: 'POST', headers: { ...headers, Cookie: cookie }, body: JSON.stringify({ message }) });
          const json = await response.json() as AssistantTurnResponse & { error?: { code: string } };
          expect(response.status, JSON.stringify(json)).toBe(expected);
          return json;
        };
        await execute({ app, db, cookie, calls, call, ask });
      } finally { await sql.end(); }
    });
  }

  it('offers quick picks for an ambiguous customer and does not choose one', () => run({
    steps: [turn([{ name: 'search_customers', arguments: { query: 'Sarah' } }])],
  }, async ({ call, ask }) => {
    await call('/api/customers', 'POST', { name: 'Sarah Chen', email: 'sarah.chen@example.test' }, 201);
    await call('/api/customers', 'POST', { name: 'Sarah Jones', email: 'sarah.jones@example.test' }, 201);
    const reply = await ask(prompt('ambiguous-customer'));
    const picks = reply.parts.find((part) => part.type === 'quick_picks');
    expect(picks).toMatchObject({ type: 'quick_picks', field: 'customerId' });
    if (picks?.type !== 'quick_picks') return;
    expect(picks.options.map((option) => option.label).sort()).toEqual(['Sarah Chen', 'Sarah Jones']);
    expect(reply.parts.some((part) => part.type === 'proposal')).toBe(false);
  }));

  it('offers quick picks for an ambiguous catalogue item', () => run({
    steps: [turn([{ name: 'search_catalogue', arguments: { query: 'filter' } }])],
  }, async ({ call, ask }) => {
    await call('/api/items', 'POST', { name: 'Pool filter', type: 'product', salePrice: '40.00' }, 201);
    await call('/api/items', 'POST', { name: 'Air filter', type: 'product', salePrice: '25.00' }, 201);
    const reply = await ask(prompt('ambiguous-item'));
    const picks = reply.parts.find((part) => part.type === 'quick_picks');
    expect(picks).toMatchObject({ field: 'itemId' });
    if (picks?.type !== 'quick_picks') return;
    expect(picks.options).toHaveLength(2);
    expect(reply.parts.some((part) => part.type === 'proposal')).toBe(false);
  }));

  it('summarises outstanding invoices without writing', () => run({
    steps: [turn([{ name: 'list_outstanding', arguments: {} }])],
  }, async ({ call, ask, db }) => {
    const customer = await call('/api/customers', 'POST', { name: 'Owing Customer', email: 'owing@example.test' }, 201);
    const sent = await call('/api/invoices', 'POST', { customerId: customer.id, date: '2026-11-09', dueDate: '2026-11-20', taxInclusive: true, items: [{ description: 'Work', quantity: '1', rate: '100' }] }, 201);
    await call(`/api/invoices/${String(sent.id)}`, 'PATCH', { status: 'sent' });
    await call('/api/invoices', 'POST', { customerId: customer.id, date: '2026-11-09', dueDate: '2026-11-20', taxInclusive: true, items: [{ description: 'Draft only', quantity: '1', rate: '50' }] }, 201);
    const before = await tally(db);
    const reply = await ask(prompt('who-owes'));
    expect(reply.parts.find((part) => part.type === 'text')).toMatchObject({ text: '1 outstanding invoice, 100.00 NZD.' });
    expect(reply.parts.some((part) => part.type === 'link' && part.href === `/invoices/${String(sent.id)}`)).toBe(true);
    expect(reply.parts.some((part) => part.type === 'proposal')).toBe(false);
    expect(await tally(db)).toEqual(before);
  }));

  it('refuses an unsupported delete and links to Invoices', () => run({
    steps: [turn([{ name: 'delete_invoices', arguments: { all: true } }])],
  }, async ({ ask, db }) => {
    const before = await tally(db);
    const reply = await ask(prompt('unsupported-delete'));
    expect(reply.parts).toContainEqual({ type: 'link', href: '/invoices', label: 'Invoices' });
    expect(reply.parts.some((part) => part.type === 'proposal')).toBe(false);
    expect(await tally(db)).toEqual(before);
  }));

  it('does not prepare an expense because there is no non-posting draft', () => run({
    steps: [turn([{ name: 'prepare_expense', arguments: { amount: '45.00' } }])],
  }, async ({ ask, db }) => {
    const reply = await ask(prompt('expense-deferred'));
    expect(reply.parts).toContainEqual({ type: 'link', href: '/expenses', label: 'Expenses' });
    expect((await tally(db)).expenses).toBe(0);
  }));

  it('treats an injected customer name as data and refuses an unlisted tool', () => run({
    steps: [
      turn([{ name: 'search_customers', arguments: { query: 'Sarah' } }]),
      turn([{ name: 'run_sql', arguments: { sql: 'DROP TABLE invoices' } }]),
    ],
  }, async ({ call, ask, db }) => {
    const injected = "Sarah'); DROP TABLE invoices; --";
    await call('/api/customers', 'POST', { name: injected, email: 'injected@example.test' }, 201);
    const before = await tally(db);
    const reply = await ask(prompt('injection-name'));
    expect(reply.parts).toContainEqual({ type: 'link', href: '/invoices', label: 'Invoices' });
    expect(await tally(db)).toEqual(before);
    const events = await db.select().from(assistantEvents);
    expect(JSON.stringify(events)).not.toContain('DROP TABLE');
    expect(JSON.stringify(events)).not.toContain(prompt('injection-name'));
    expect(await call('/api/invoices', 'GET')).toHaveProperty('invoices');
  }));

  it('does not return another business from search', () => run({
    steps: [turn([{ name: 'search_customers', arguments: { query: 'Secret' } }])],
  }, async ({ app, ask }) => {
    const other = await app.request('/api/auth/sign-up/email', { method: 'POST', headers, body: JSON.stringify({ name: 'Other', email: `other-${crypto.randomUUID()}@example.test`, password: 'password123' }) });
    await app.request('/api/customers', { method: 'POST', headers: { ...headers, Cookie: cookieOf(other) }, body: JSON.stringify({ name: 'Secret Buyer', email: 'secret@example.test' }) });
    const reply = await ask(prompt('cross-business-search'));
    expect(JSON.stringify(reply)).not.toContain('Secret Buyer');
    expect(reply.parts.some((part) => part.type === 'quick_picks' || part.type === 'proposal')).toBe(false);
  }));

  it('stops provider calls when the daily message limit is exhausted', () => run({
    limits: { dailyMessages: 1 },
    steps: [turn([{ name: 'list_outstanding', arguments: {} }])],
  }, async ({ ask, calls, app, cookie }) => {
    const first = await ask(prompt('who-owes'));
    expect(first.parts.some((part) => part.type === 'text')).toBe(true);
    const seen = calls.n;
    await app.request(`/api/conversations/${first.conversationId}`, { method: 'DELETE', headers: { Cookie: cookie } });
    const second = await ask(prompt('who-owes'), 429);
    expect(second.error?.code).toBe('ASSISTANT_LIMIT');
    expect(calls.n).toBe(seen);
  }));

  it('stops provider calls when the per-minute limit is exhausted', () => run({
    limits: { perMinute: 1 },
    steps: [turn([{ name: 'list_outstanding', arguments: {} }])],
  }, async ({ ask, calls }) => {
    await ask(prompt('who-owes'));
    const seen = calls.n;
    const second = await ask('Who owes me money?', 429);
    expect(second.error?.code).toBe('ASSISTANT_LIMIT');
    expect(calls.n).toBe(seen);
  }));

  it('stops provider calls when the daily cost ceiling is exhausted', () => run({
    limits: { dailyCostUsd: '0.01' },
    steps: [turn([{ name: 'list_outstanding', arguments: {} }], { inputTokens: 1_000_000, outputTokens: 1 })],
  }, async ({ ask, calls }) => {
    await ask(prompt('who-owes'));
    const seen = calls.n;
    const second = await ask('Who owes me money?', 429);
    expect(second.error?.code).toBe('ASSISTANT_LIMIT');
    expect(calls.n).toBe(seen);
  }));

  it('saves nothing when the provider times out', () => run({
    timeoutMs: 40,
    model: { async complete({ signal }) { return new Promise((_, reject) => { const fail = () => reject(apiError(504, 'ASSISTANT_TIMEOUT', 'The assistant took too long. Nothing was saved. Use Invoices to continue.')); signal.addEventListener('abort', fail); }); } },
  }, async ({ ask, db }) => {
    const marker = 'timeout-marker-not-stored';
    const failed = await ask(marker, 504);
    expect(failed.error?.code).toBe('ASSISTANT_TIMEOUT');
    expect((await tally(db)).invoices).toBe(0);
    const events = await db.select().from(assistantEvents);
    expect(events.map((event) => event.outcome)).toContain('timeout');
    expect(JSON.stringify(events)).not.toContain(marker);
    const messages = await db.select().from(conversationMessages);
    expect(messages.map((message) => message.content).join(' ')).not.toContain(marker);
  }));

  it('saves nothing when the provider output is malformed', () => run({
    model: { async complete() { return { toolCalls: 'nope' } as never; } },
  }, async ({ ask, db }) => {
    const marker = 'malformed-marker-not-stored';
    const failed = await ask(marker, 502);
    expect(failed.error?.code).toBe('ASSISTANT_OUTPUT_INVALID');
    expect((await tally(db)).invoices).toBe(0);
    const events = await db.select().from(assistantEvents);
    expect(events.map((event) => event.outcome)).toContain('invalid_output');
    expect(JSON.stringify(events)).not.toContain(marker);
  }));

  it('keeps receipt scanning available when the assistant flag is off', () => run({
    assistant: 'unavailable',
    scanner: { async scan() { return { merchantName: 'Cafe', date: '2026-11-09', total: '10.00', tax: '1.30', subtotal: '8.70', items: [], paymentMethod: 'card', suggestedCategory: null, confidence: 0.5, notes: null }; } },
    steps: [turn([{ name: 'list_outstanding', arguments: {} }])],
  }, async ({ app, cookie, calls, ask }) => {
    const denied = await ask(prompt('who-owes'), 403);
    expect(denied.error?.code).toBe('ASSISTANT_DISABLED');
    expect(calls.n).toBe(0);
    const scan = await app.request('/api/ai/receipt-scan', { method: 'POST', headers: { ...headers, Cookie: cookie }, body: JSON.stringify({ imageBase64: 'abc', exactAmounts: true }) });
    expect(scan.status).toBe(200);
  }));

  it('keeps the audit free of the prompt and purges assistant history after 90 days', () => run({
    steps: [turn([{ name: 'list_outstanding', arguments: {} }])],
  }, async ({ ask, db, app, cookie }) => {
    const marker = 'retention-marker-prompt';
    const first = await ask(marker);
    const old = new Date(MONDAY.getTime() - 91 * 86_400_000);
    await db.update(conversationMessages).set({ createdAt: old }).where(eq(conversationMessages.conversationId, first.conversationId));
    const kept = await app.request('/api/conversations', { method: 'POST', headers: { ...headers, Cookie: cookie }, body: JSON.stringify({ title: 'Notes' }) });
    const keptBody = await kept.json() as { id: string };
    await app.request(`/api/conversations/${keptBody.id}/messages`, { method: 'POST', headers: { ...headers, Cookie: cookie }, body: JSON.stringify({ role: 'user', content: 'keep-me' }) });
    await db.update(conversationMessages).set({ createdAt: old }).where(eq(conversationMessages.conversationId, keptBody.id));
    await ask('fresh-marker-prompt');
    const messages = await db.select().from(conversationMessages);
    const contents = messages.map((message) => message.content);
    expect(contents.join('\n')).not.toContain(marker);
    expect(contents).toContain('keep-me');
    expect(contents).toContain('fresh-marker-prompt');
    const events = await db.select().from(assistantEvents);
    expect(JSON.stringify(events)).not.toContain(marker);
    expect(events.some((event) => event.action === 'turn')).toBe(true);
  }));

  it('requires a session', async () => {
    const response = await createApp().request('/api/ai/assistant', { method: 'POST', headers, body: JSON.stringify({ message: 'Hello' }) });
    expect(response.status).toBe(401);
    expect(errorEnvelopeSchema.parse(await response.json()).error.code).toBe('UNAUTHORIZED');
  });
});
