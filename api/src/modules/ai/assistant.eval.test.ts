import { errorEnvelopeSchema, invoiceSchema, previewAssistantProposalResponseSchema, type AssistantTurnResponse } from '@ledgercraft/contracts';
import { count, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { createDb } from '../../db/local';
import { getDatabaseUrl } from '../../env';
import { assistantEvents } from '../../db/schema/assistant-events';
import { assistantProposals } from '../../db/schema/assistant-proposals';
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
const DATELINE = new Date('2026-11-13T11:30:00.000Z');
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
    limits?: { dailyMessages?: number; perMinute?: number; dailyCostUsd?: string; callReserveUsd?: string; previewPerMinute?: number };
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

  it('asks for the missing parts price and resolves Friday in Pacific/Auckland', () => run({
    steps: [turn([
      { name: 'search_customers', arguments: { query: 'Sarah' } },
      { name: 'search_catalogue', arguments: { query: 'plumbing' } },
      { name: 'prepare_invoice_proposal', arguments: { customerQuery: 'Sarah', dueDate: 'Friday', taxRate: '0', lines: [
        { description: 'Plumbing', quantity: '3', itemQuery: 'plumbing', rate: '1.00' },
        { description: 'Parts', quantity: '1' },
      ] } },
    ])],
  }, async ({ call, ask, db }) => {
    await call('/api/customers', 'POST', { name: 'Sarah Chen', email: 'sarah@example.test' }, 201);
    await call('/api/items', 'POST', { name: 'Plumbing', type: 'service', salePrice: '120.00', unit: 'h' }, 201);
    const before = await tally(db);
    const reply = await ask(prompt('sarah-missing-parts'));
    const proposal = reply.parts.find((part) => part.type === 'proposal');
    expect(proposal?.type).toBe('proposal');
    if (proposal?.type !== 'proposal') return;
    expect(proposal.proposal).toMatchObject({
      status: 'needs_input', date: '2026-11-09', dueDate: '2026-11-13', taxRate: '15', taxInclusive: null,
      actions: { saveDraft: true, send: false },
      totals: null,
    });
    expect(proposal.proposal.lines[0]).toMatchObject({ description: 'Plumbing', rate: '120.00' });
    expect(proposal.proposal.lines[1]).toMatchObject({ description: 'Parts', rate: null });
    expect(proposal.proposal.missing.join(' ')).toContain('rate');
    const saved = await call('/api/ai/assistant/drafts', 'POST', { conversationId: reply.conversationId, proposalId: proposal.proposal.id }, 422);
    expect(saved).toMatchObject({ error: { code: 'PROPOSAL_INCOMPLETE' } });
    expect(await tally(db)).toEqual(before);
  }));

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

  it('refuses an expense-named tool with a link to Expenses', () => run({
    steps: [turn([{ name: 'prepare_expense', arguments: { amount: '45.00' } }])],
  }, async ({ ask, db, calls }) => {
    const reply = await ask('Record $45 of fuel');
    expect(reply.parts).toContainEqual({ type: 'link', href: '/expenses', label: 'Expenses' });
    expect(reply.parts.some((part) => part.type === 'link' && part.href === '/invoices')).toBe(false);
    expect((await tally(db)).expenses).toBe(0);
    expect(calls.n).toBe(1);
  }));

  it('routes a fuel expense to Expenses when the model only answers in text', () => {
    const seen = { n: 0 };
    const model: AssistantModel = {
      async complete() {
        seen.n += 1;
        return { text: 'Use the Invoices screen.', toolCalls: [], inputTokens: 4, outputTokens: 2 };
      },
    };
    return run({ model }, async ({ ask, db }) => {
      const reply = await ask(prompt('expense-deferred'));
      expect(reply.parts).toContainEqual({ type: 'text', text: 'Expenses cannot be saved from the assistant yet. Use the Expenses screen.' });
      expect(reply.parts).toContainEqual({ type: 'link', href: '/expenses', label: 'Expenses' });
      expect(reply.parts.some((part) => part.type === 'link' && part.href === '/invoices')).toBe(false);
      expect((await tally(db)).expenses).toBe(0);
      expect(seen.n).toBe(0);
    });
  });

  it('keeps one outstanding summary when list_outstanding is repeated', () => {
    const seen = { n: 0 };
    const model: AssistantModel = {
      async complete() {
        seen.n += 1;
        return turn([{ name: 'list_outstanding', arguments: {} }]);
      },
    };
    return run({ model }, async ({ ask }) => {
      const reply = await ask(prompt('who-owes'));
      expect(reply.parts.filter((part) => part.type === 'text')).toHaveLength(1);
      expect(reply.parts.filter((part) => part.type === 'link')).toHaveLength(1);
      expect(seen.n).toBe(2);
    });
  });

  it('keeps one quick-pick list when search_customers is repeated', () => {
    const seen = { n: 0 };
    const model: AssistantModel = {
      async complete() {
        seen.n += 1;
        return turn([{ name: 'search_customers', arguments: { query: 'Sarah' } }]);
      },
    };
    return run({ model }, async ({ call, ask }) => {
      await call('/api/customers', 'POST', { name: 'Sarah Chen', email: 'sarah.chen@example.test' }, 201);
      await call('/api/customers', 'POST', { name: 'Sarah Jones', email: 'sarah.jones@example.test' }, 201);
      const reply = await ask(prompt('ambiguous-customer'));
      expect(reply.parts.filter((part) => part.type === 'quick_picks')).toHaveLength(1);
      expect(seen.n).toBe(2);
    });
  });

  it('prepares an invoice when a repeated search shares a step with a new tool', () => {
    const seen = { n: 0 };
    const model: AssistantModel = {
      async complete({ messages }) {
        seen.n += 1;
        const ran = messages.filter((message) => message.role === 'tool').length;
        if (ran === 0) return turn([{ name: 'search_customers', arguments: { query: 'Sarah' } }]);
        return turn([
          { name: 'search_customers', arguments: { query: 'Sarah' } },
          { name: 'prepare_invoice_proposal', arguments: { customerQuery: 'Sarah', dueDate: '2026-11-13', taxInclusive: true, lines: [{ description: 'Plumbing', quantity: '1', rate: '100.00' }] } },
        ]);
      },
    };
    return run({ model }, async ({ call, ask }) => {
      await call('/api/customers', 'POST', { name: 'Sarah Chen', email: 'sarah@example.test' }, 201);
      const reply = await ask(prompt('gst-inclusive'));
      expect(reply.parts.filter((part) => part.type === 'proposal')).toHaveLength(1);
      expect(reply.parts.filter((part) => part.type === 'text')).toHaveLength(1);
      expect(seen.n).toBe(2);
    });
  });

  it('still runs the same tool when the arguments differ', () => {
    const seen = { n: 0 };
    const model: AssistantModel = {
      async complete({ messages }) {
        seen.n += 1;
        const ran = messages.filter((message) => message.role === 'tool').length;
        if (ran === 0) return turn([{ name: 'search_customers', arguments: { query: 'Sarah' } }]);
        if (ran === 1) return turn([{ name: 'search_customers', arguments: { query: 'Jones' } }]);
        return { text: 'Done.', toolCalls: [], inputTokens: 1, outputTokens: 1 };
      },
    };
    return run({ model }, async ({ call, ask }) => {
      await call('/api/customers', 'POST', { name: 'Sarah Chen', email: 'sarah.chen@example.test' }, 201);
      await call('/api/customers', 'POST', { name: 'Sarah Jones', email: 'sarah.jones@example.test' }, 201);
      const reply = await ask(prompt('ambiguous-customer'));
      expect(reply.parts.filter((part) => part.type === 'quick_picks')).toHaveLength(1);
      expect(seen.n).toBe(3);
    });
  });

  it('prices inclusive GST on the server and saves one non-posting draft', () => run({
    steps: [turn([{ name: 'prepare_invoice_proposal', arguments: { customerQuery: 'Sarah', dueDate: '2026-11-13', taxInclusive: true, taxRate: '0', lines: [{ description: 'Plumbing', quantity: '3', rate: '100.00' }] } }])],
  }, async ({ call, ask, db }) => {
    await call('/api/customers', 'POST', { name: 'Sarah Chen', email: 'sarah@example.test' }, 201);
    const before = await tally(db);
    const reply = await ask(prompt('gst-inclusive'));
    const proposal = reply.parts.find((part) => part.type === 'proposal');
    if (proposal?.type !== 'proposal') throw new Error('missing proposal');
    expect(proposal.proposal).toMatchObject({ taxRate: '15', taxInclusive: true, actions: { send: false }, totals: { subtotal: '260.87', taxAmount: '39.13', total: '300.00' } });
    const saved = invoiceSchema.parse(await call('/api/ai/assistant/drafts', 'POST', { conversationId: reply.conversationId, proposalId: proposal.proposal.id }, 201));
    expect(saved).toMatchObject({ status: 'draft', total: '300.00', taxAmount: '39.13', subtotal: '260.87' });
    const after = await tally(db);
    expect(after.invoices).toBe(before.invoices + 1);
    expect(after.journals).toBe(before.journals);
  }));

  it('prices exclusive GST when the request says plus GST', () => run({
    steps: [turn([{ name: 'prepare_invoice_proposal', arguments: { customerQuery: 'Sarah', dueDate: '2026-11-13', taxInclusive: false, taxRate: '0', lines: [{ description: 'Plumbing', quantity: '3', rate: '100.00' }] } }])],
  }, async ({ call, ask }) => {
    await call('/api/customers', 'POST', { name: 'Sarah Chen', email: 'sarah@example.test' }, 201);
    const reply = await ask(prompt('gst-exclusive'));
    const proposal = reply.parts.find((part) => part.type === 'proposal');
    expect(proposal).toMatchObject({ type: 'proposal', proposal: { taxInclusive: false, taxRate: '15', totals: { subtotal: '300.00', taxAmount: '45.00', total: '345.00' } } });
  }));

  it('resolves Friday on the Auckland side of the UTC date line', () => run({
    now: DATELINE,
    steps: [turn([{ name: 'prepare_invoice_proposal', arguments: { customerQuery: 'Sarah', dueDate: 'Friday', lines: [{ description: 'Callout', quantity: '1', rate: '100.00' }] } }])],
  }, async ({ call, ask }) => {
    await call('/api/customers', 'POST', { name: 'Sarah Chen', email: 'sarah@example.test' }, 201);
    const reply = await ask(prompt('friday-dateline'));
    expect(reply.parts.find((part) => part.type === 'proposal')).toMatchObject({
      type: 'proposal', proposal: { date: '2026-11-14', dueDate: '2026-11-20' },
    });
  }));

  it('treats an injected customer name as data and refuses an unlisted tool', () => {
    const seen = { n: 0 };
    const model: AssistantModel = {
      async complete({ messages }) {
        seen.n += 1;
        const tool = [...messages].reverse().find((message) => message.role === 'tool');
        if (!tool) return turn([{ name: 'search_customers', arguments: { query: 'Sarah' } }]);
        return turn([{ name: 'run_sql', arguments: { sql: tool.content } }]);
      },
    };
    return run({ model }, async ({ call, ask, db }) => {
      const injected = "Sarah'); DROP TABLE invoices; --";
      await call('/api/customers', 'POST', { name: injected, email: 'injected@example.test' }, 201);
      const before = await tally(db);
      const reply = await ask(prompt('injection-name'));
      expect(seen.n).toBeGreaterThan(1);
      expect(reply.parts).toContainEqual({ type: 'link', href: '/invoices', label: 'Invoices' });
      expect(JSON.stringify(reply)).not.toContain('DROP TABLE');
      expect(await tally(db)).toEqual(before);
      const events = await db.select().from(assistantEvents);
      expect(JSON.stringify(events)).not.toContain('DROP TABLE');
      expect(JSON.stringify(events)).not.toContain(prompt('injection-name'));
      expect(await call('/api/invoices', 'GET')).toHaveProperty('invoices');
    });
  });

  it('stores an injected note as text only after an explicit save', () => run({
    steps: [turn([{ name: 'prepare_invoice_proposal', arguments: { customerQuery: 'Sarah', dueDate: '2026-11-13', taxInclusive: true, notes: "'); DROP TABLE invoices; --", lines: [{ description: 'Plumbing', quantity: '1', rate: '100.00' }] } }])],
  }, async ({ call, ask, db }) => {
    await call('/api/customers', 'POST', { name: 'Sarah Chen', email: 'sarah@example.test' }, 201);
    const reply = await ask(prompt('injection-notes'));
    const proposal = reply.parts.find((part) => part.type === 'proposal');
    if (proposal?.type !== 'proposal') throw new Error('missing proposal');
    expect(proposal.proposal.notes).toBe("'); DROP TABLE invoices; --");
    expect((await tally(db)).invoices).toBe(0);
    const saved = invoiceSchema.parse(await call('/api/ai/assistant/drafts', 'POST', { conversationId: reply.conversationId, proposalId: proposal.proposal.id }, 201));
    expect(saved.notes).toBe("'); DROP TABLE invoices; --");
    expect(saved.status).toBe('draft');
    expect(await call('/api/customers', 'GET')).toHaveProperty('customers');
  }));

  it('denies a customer id from another business', () => run({ steps: [] }, async ({ app, db, cookie }) => {
    const other = await app.request('/api/auth/sign-up/email', { method: 'POST', headers, body: JSON.stringify({ name: 'Other', email: `other-${crypto.randomUUID()}@example.test`, password: 'password123' }) });
    const otherCookie = cookieOf(other);
    const secret = await app.request('/api/customers', { method: 'POST', headers: { ...headers, Cookie: otherCookie }, body: JSON.stringify({ name: 'Secret Buyer', email: 'secret@example.test' }) });
    const secretBody = await secret.json() as { id: string };
    expect(secret.status).toBe(201);
    const calls = { n: 0 };
    const scoped = createApp({
      auth: createAuth(db), db, checkDatabase: async () => true,
      capabilities: { email: 'unavailable', ai: 'unavailable', stripe: 'unavailable', assistant: 'available' },
      assistant: { model: scripted([turn([{ name: 'prepare_invoice_proposal', arguments: { customerId: secretBody.id, dueDate: '2026-11-13', lines: [{ description: 'Plumbing', quantity: '1', rate: '100.00' }] } }])], calls), now: MONDAY, timeoutMs: 2_000 },
    });
    const response = await scoped.request('/api/ai/assistant', { method: 'POST', headers: { ...headers, Cookie: cookie }, body: JSON.stringify({ message: prompt('cross-business-id') }) });
    const body = await response.json() as AssistantTurnResponse;
    expect(response.status).toBe(200);
    expect(JSON.stringify(body)).not.toContain('Secret Buyer');
    expect(body.parts.some((part) => part.type === 'proposal')).toBe(false);
    expect((await tally(db)).invoices).toBe(0);
    const denied = await scoped.request('/api/ai/assistant/drafts', { method: 'POST', headers: { ...headers, Cookie: otherCookie }, body: JSON.stringify({ conversationId: body.conversationId, proposalId: crypto.randomUUID() }) });
    expect(denied.status).toBe(404);
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
    limits: { dailyCostUsd: '0.01', callReserveUsd: '0.001' },
    steps: [turn([{ name: 'list_outstanding', arguments: {} }], { inputTokens: 1_000_000, outputTokens: 1 })],
  }, async ({ ask, calls }) => {
    await ask(prompt('who-owes'));
    const seen = calls.n;
    const second = await ask('Who owes me money?', 429);
    expect(second.error?.code).toBe('ASSISTANT_LIMIT');
    expect(calls.n).toBe(seen);
  }));

  it('stops a second overlapping turn when the reserved costs cross the ceiling', () => {
    let release = () => {};
    const entered = new Promise<void>((resolve) => { release = resolve; });
    const seen = { n: 0 };
    const model: AssistantModel = {
      async complete() {
        seen.n += 1;
        if (seen.n === 1) {
          release();
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
        return { text: 'Done.', toolCalls: [], inputTokens: 1, outputTokens: 1 };
      },
    };
    return run({ model, limits: { dailyCostUsd: '0.10', callReserveUsd: '0.06' } }, async ({ ask }) => {
      const first = ask(prompt('who-owes'));
      await entered;
      const second = await ask('Who owes me money?', 429);
      expect(second.error?.code).toBe('ASSISTANT_LIMIT');
      expect(seen.n).toBe(1);
      expect((await first).parts.some((part) => part.type === 'text')).toBe(true);
    });
  });

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
    expect(events.find((event) => event.outcome === 'timeout')?.costUsd).toBe('0.050000');
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

  it('does not create a second draft when save is tapped twice', () => run({
    steps: [turn([{ name: 'prepare_invoice_proposal', arguments: { customerQuery: 'Sarah', dueDate: '2026-11-13', taxInclusive: true, lines: [{ description: 'Plumbing', quantity: '3', rate: '100.00' }] } }])],
  }, async ({ call, ask, db, app, cookie }) => {
    await call('/api/customers', 'POST', { name: 'Sarah Chen', email: 'sarah@example.test' }, 201);
    const reply = await ask(prompt('gst-inclusive'));
    const proposal = reply.parts.find((part) => part.type === 'proposal');
    if (proposal?.type !== 'proposal') throw new Error('missing proposal');
    const body = { conversationId: reply.conversationId, proposalId: proposal.proposal.id };
    const first = invoiceSchema.parse(await call('/api/ai/assistant/drafts', 'POST', body, 201));
    const second = invoiceSchema.parse(await call('/api/ai/assistant/drafts', 'POST', body, 201));
    expect(second.id).toBe(first.id);
    const [kept] = await db.select().from(assistantProposals).where(eq(assistantProposals.id, proposal.proposal.id));
    expect(kept?.payload).toBe('');
    expect(kept?.savedInvoiceId).toBe(first.id);
    expect(kept?.signature.length).toBeGreaterThan(0);
    const conflict = await app.request('/api/ai/assistant/drafts', { method: 'POST', headers: { ...headers, Cookie: cookie, 'Idempotency-Key': 'draft-tap-1' }, body: JSON.stringify(body) });
    expect(conflict.status).toBe(201);
    const changed = await app.request('/api/ai/assistant/drafts', { method: 'POST', headers: { ...headers, Cookie: cookie, 'Idempotency-Key': 'draft-tap-1' }, body: JSON.stringify({ ...body, edits: { notes: 'different' } }) });
    expect(errorEnvelopeSchema.parse(await changed.json()).error.code).toBe('IDEMPOTENCY_CONFLICT');
    expect((await tally(db)).invoices).toBe(1);
  }));

  it('recomputes totals when the draft is edited before save', () => run({
    steps: [turn([{ name: 'prepare_invoice_proposal', arguments: { customerQuery: 'Sarah', dueDate: '2026-11-13', taxInclusive: true, lines: [{ description: 'Plumbing', quantity: '3', rate: '100.00' }] } }])],
  }, async ({ call, ask }) => {
    await call('/api/customers', 'POST', { name: 'Sarah Chen', email: 'sarah@example.test' }, 201);
    const reply = await ask(prompt('gst-inclusive'));
    const proposal = reply.parts.find((part) => part.type === 'proposal');
    if (proposal?.type !== 'proposal') throw new Error('missing proposal');
    const saved = invoiceSchema.parse(await call('/api/ai/assistant/drafts', 'POST', {
      conversationId: reply.conversationId,
      proposalId: proposal.proposal.id,
      edits: { lines: [{ description: 'Plumbing', quantity: '2', rate: '100.00' }] },
    }, 201));
    expect(saved).toMatchObject({ status: 'draft', subtotal: '173.91', taxAmount: '26.09', total: '200.00' });
  }));

  it('keeps a rate the user edited instead of the catalogue price', () => run({
    steps: [turn([{ name: 'prepare_invoice_proposal', arguments: { customerQuery: 'Sarah', dueDate: '2026-11-13', taxInclusive: true, lines: [{ description: 'Plumbing', quantity: '3', itemQuery: 'plumbing', rate: '1.00' }] } }])],
  }, async ({ call, ask }) => {
    await call('/api/customers', 'POST', { name: 'Sarah Chen', email: 'sarah@example.test' }, 201);
    const item = await call('/api/items', 'POST', { name: 'Plumbing', type: 'service', salePrice: '120.00', unit: 'h' }, 201);
    const reply = await ask('Invoice Sarah for 3 hours of plumbing');
    const proposal = reply.parts.find((part) => part.type === 'proposal');
    if (proposal?.type !== 'proposal') throw new Error('missing proposal');
    expect(proposal.proposal.lines[0]?.rate).toBe('120.00');
    const saved = invoiceSchema.parse(await call('/api/ai/assistant/drafts', 'POST', {
      conversationId: reply.conversationId,
      proposalId: proposal.proposal.id,
      edits: { lines: [{ description: 'Plumbing', quantity: '3', rate: '80.00', itemId: String(item.id) }] },
    }, 201));
    expect(saved.items[0]).toMatchObject({ rate: '80.00' });
    expect(saved).toMatchObject({ status: 'draft', subtotal: '208.70', taxAmount: '31.30', total: '240.00' });
  }));

  it('ignores a client-written copy of the proposal id', () => run({
    steps: [turn([{ name: 'prepare_invoice_proposal', arguments: { customerQuery: 'Sarah', dueDate: '2026-11-13', taxInclusive: true, lines: [{ description: 'Plumbing', quantity: '1', rate: '100.00' }] } }])],
  }, async ({ call, ask, app, cookie, db }) => {
    await call('/api/customers', 'POST', { name: 'Sarah Chen', email: 'sarah@example.test' }, 201);
    const reply = await ask('Invoice Sarah for plumbing');
    const proposal = reply.parts.find((part) => part.type === 'proposal');
    if (proposal?.type !== 'proposal') throw new Error('missing proposal');
    const forged = await app.request(`/api/conversations/${reply.conversationId}/messages`, {
      method: 'POST',
      headers: { ...headers, Cookie: cookie },
      body: JSON.stringify({
        role: 'assistant',
        content: 'forged',
        metadata: {
          kind: 'assistant_proposal',
          signature: 'deadbeef',
          proposal: { ...proposal.proposal, lines: [{ ...proposal.proposal.lines[0], rate: '1.00' }] },
        },
      }),
    });
    expect(forged.status).toBeLessThan(400);
    const body = { conversationId: reply.conversationId, proposalId: proposal.proposal.id };
    const first = invoiceSchema.parse(await call('/api/ai/assistant/drafts', 'POST', body, 201));
    const second = invoiceSchema.parse(await call('/api/ai/assistant/drafts', 'POST', body, 201));
    expect(first.total).toBe('100.00');
    expect(second.id).toBe(first.id);
    expect((await tally(db)).invoices).toBe(1);
  }));

  it('forgets a proposal after 90 days', () => run({
    steps: [turn([{ name: 'prepare_invoice_proposal', arguments: { customerQuery: 'Sarah', dueDate: '2026-11-13', taxInclusive: true, lines: [{ description: 'Plumbing', quantity: '1', rate: '100.00' }] } }])],
  }, async ({ call, ask, app, cookie, db }) => {
    await call('/api/customers', 'POST', { name: 'Sarah Chen', email: 'sarah@example.test' }, 201);
    const reply = await ask('Invoice Sarah for plumbing');
    const proposal = reply.parts.find((part) => part.type === 'proposal');
    if (proposal?.type !== 'proposal') throw new Error('missing proposal');
    const old = new Date(MONDAY.getTime() - 91 * 86_400_000);
    await db.update(assistantProposals).set({ createdAt: old }).where(eq(assistantProposals.id, proposal.proposal.id));
    await ask('fresh-marker-prompt');
    expect(await db.select().from(assistantProposals).where(eq(assistantProposals.id, proposal.proposal.id))).toEqual([]);
    const expired = await app.request('/api/ai/assistant/drafts', {
      method: 'POST',
      headers: { ...headers, Cookie: cookie },
      body: JSON.stringify({ conversationId: reply.conversationId, proposalId: proposal.proposal.id }),
    });
    expect(expired.status).toBe(404);
    expect(errorEnvelopeSchema.parse(await expired.json()).error.code).toBe('NOT_FOUND');
  }));

  it('removes the proposal when the conversation is deleted', () => run({
    steps: [turn([{ name: 'prepare_invoice_proposal', arguments: { customerQuery: 'Sarah', dueDate: '2026-11-13', taxInclusive: true, lines: [{ description: 'Plumbing', quantity: '1', rate: '100.00' }] } }])],
  }, async ({ call, ask, app, cookie, db }) => {
    await call('/api/customers', 'POST', { name: 'Sarah Chen', email: 'sarah@example.test' }, 201);
    const reply = await ask('Invoice Sarah for plumbing');
    const proposal = reply.parts.find((part) => part.type === 'proposal');
    if (proposal?.type !== 'proposal') throw new Error('missing proposal');
    const removed = await app.request(`/api/conversations/${reply.conversationId}`, { method: 'DELETE', headers: { Cookie: cookie } });
    expect(removed.status).toBeLessThan(400);
    expect(await db.select().from(assistantProposals).where(eq(assistantProposals.id, proposal.proposal.id))).toEqual([]);
    const gone = await app.request('/api/ai/assistant/drafts', {
      method: 'POST',
      headers: { ...headers, Cookie: cookie },
      body: JSON.stringify({ conversationId: reply.conversationId, proposalId: proposal.proposal.id }),
    });
    expect(gone.status).toBe(404);
    expect(errorEnvelopeSchema.parse(await gone.json()).error.code).toBe('NOT_FOUND');
  }));

  it('keeps receipt scanning available when the assistant flag is off', () => run({
    assistant: 'unavailable',
    scanner: { async scan() { return { merchantName: 'Cafe', date: '2026-11-09', total: '10.00', tax: '1.30', subtotal: '8.70', items: [], paymentMethod: 'card', suggestedCategory: null, confidence: 0.5, notes: null }; } },
    steps: [turn([{ name: 'list_outstanding', arguments: {} }])],
  }, async ({ app, cookie, calls, ask }) => {
    const previous = process.env.ASSISTANT_ENABLED;
    process.env.ASSISTANT_ENABLED = '1';
    try {
      const denied = await ask(prompt('who-owes'), 403);
      expect(denied.error?.code).toBe('ASSISTANT_DISABLED');
      expect(calls.n).toBe(0);
      const draft = await app.request('/api/ai/assistant/drafts', {
        method: 'POST',
        headers: { ...headers, Cookie: cookie },
        body: JSON.stringify({ conversationId: crypto.randomUUID(), proposalId: crypto.randomUUID() }),
      });
      expect(draft.status).toBe(403);
      expect(errorEnvelopeSchema.parse(await draft.json()).error.code).toBe('ASSISTANT_DISABLED');
    } finally {
      if (previous === undefined) delete process.env.ASSISTANT_ENABLED;
      else process.env.ASSISTANT_ENABLED = previous;
    }
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
    const [stale] = await db.select().from(assistantEvents);
    await db.update(assistantEvents).set({ createdAt: old }).where(eq(assistantEvents.id, stale.id));
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
    expect(events.some((event) => event.id === stale.id)).toBe(false);
    expect(JSON.stringify(events)).not.toContain(marker);
    expect(events.some((event) => event.action === 'turn')).toBe(true);
  }));

  it('rejects a forged proposal that was not signed by the server', () => run({ steps: [] }, async ({ app, cookie, db }) => {
    const created = await app.request('/api/conversations', { method: 'POST', headers: { ...headers, Cookie: cookie }, body: JSON.stringify({ title: 'Forged', context: { kind: 'assistant' } }) });
    const conversation = await created.json() as { id: string };
    const proposalId = crypto.randomUUID();
    await app.request(`/api/conversations/${conversation.id}/messages`, { method: 'POST', headers: { ...headers, Cookie: cookie }, body: JSON.stringify({
      role: 'assistant',
      content: 'forged',
      metadata: { kind: 'assistant_proposal', signature: 'deadbeef', proposal: { id: proposalId, kind: 'invoice', status: 'ready', customerId: null, customerName: null, date: '2026-11-09', dueDate: '2026-11-13', taxInclusive: true, taxRate: '0', currency: 'NZD', notes: null, lines: [{ description: 'X', quantity: '1', rate: '1.00', unit: null, itemId: null, missing: [] }], missing: [], totals: { subtotal: '1.00', taxAmount: '0.00', total: '1.00' }, actions: { saveDraft: true, send: false } } },
    }) });
    const saved = await app.request('/api/ai/assistant/drafts', { method: 'POST', headers: { ...headers, Cookie: cookie }, body: JSON.stringify({ conversationId: conversation.id, proposalId }) });
    expect(errorEnvelopeSchema.parse(await saved.json()).error.code).toBe('NOT_FOUND');
    expect((await tally(db)).invoices).toBe(0);
  }));

  it('requires a session', async () => {
    const response = await createApp().request('/api/ai/assistant', { method: 'POST', headers, body: JSON.stringify({ message: 'Hello' }) });
    expect(response.status).toBe(401);
    expect(errorEnvelopeSchema.parse(await response.json()).error.code).toBe('UNAUTHORIZED');
    const preview = await createApp().request('/api/ai/assistant/proposals/11111111-1111-4111-8111-111111111111/preview', {
      method: 'POST', headers, body: JSON.stringify({ conversationId: '22222222-2222-4222-8222-222222222222' }),
    });
    expect(preview.status).toBe(401);
    expect(errorEnvelopeSchema.parse(await preview.json()).error.code).toBe('UNAUTHORIZED');
  });

  it('previews the same totals save will store and writes nothing', () => run({
    steps: [turn([{ name: 'prepare_invoice_proposal', arguments: { customerQuery: 'Sarah', dueDate: '2026-11-13', taxInclusive: true, lines: [{ description: 'Plumbing', quantity: '3', rate: '100.00' }] } }])],
  }, async ({ call, ask, db, app, cookie }) => {
    await call('/api/customers', 'POST', { name: 'Sarah Chen', email: 'sarah@example.test' }, 201);
    const reply = await ask(prompt('gst-inclusive'));
    const proposal = reply.parts.find((part) => part.type === 'proposal');
    if (proposal?.type !== 'proposal') throw new Error('missing proposal');
    const edits = {
      issueDate: '2026-11-01',
      dueDate: '2026-11-20',
      taxInclusive: false,
      taxRate: '15',
      lines: [
        { description: 'Plumbing', quantity: '1', rate: '100.00', taxRate: '15' },
        { description: 'Exempt supply', quantity: '1', rate: '40.00', taxRate: '0' },
      ],
    };
    const body = { conversationId: reply.conversationId, proposalId: proposal.proposal.id, edits };
    const beforeProposals = await db.select().from(assistantProposals);
    const beforeEvents = await db.select().from(assistantEvents);
    const before = await tally(db);
    const previewResponse = await app.request(`/api/ai/assistant/proposals/${proposal.proposal.id}/preview`, {
      method: 'POST', headers: { ...headers, Cookie: cookie }, body: JSON.stringify({ conversationId: reply.conversationId, edits }),
    });
    expect(previewResponse.status).toBe(200);
    const preview = previewAssistantProposalResponseSchema.parse(await previewResponse.json());
    expect(preview.errors).toEqual([]);
    expect(preview).toMatchObject({
      date: '2026-11-01',
      dueDate: '2026-11-20',
      taxInclusive: false,
      taxRate: '15',
      subtotal: '140.00',
      taxAmount: '15.00',
      total: '155.00',
    });
    expect(preview.lines.map((line) => ({ description: line.description, tax: line.tax, total: line.total }))).toEqual([
      { description: 'Plumbing', tax: '15.00', total: '100.00' },
      { description: 'Exempt supply', tax: '0.00', total: '40.00' },
    ]);
    expect(await db.select().from(assistantProposals)).toEqual(beforeProposals);
    expect(await db.select().from(assistantEvents)).toEqual(beforeEvents);
    expect(await tally(db)).toEqual(before);
    const saveDraft = (payload: unknown, key = 'preview-fields-1') => app.request('/api/ai/assistant/drafts', {
      method: 'POST',
      headers: { ...headers, Cookie: cookie, 'Idempotency-Key': key },
      body: JSON.stringify(payload),
    });
    const savedResponse = await saveDraft(body);
    expect(savedResponse.status).toBe(201);
    const saved = invoiceSchema.parse(await savedResponse.json());
    expect(saved).toMatchObject({
      status: 'draft',
      date: '2026-11-01',
      dueDate: '2026-11-20',
      subtotal: preview.subtotal,
      taxAmount: preview.taxAmount,
      total: preview.total,
    });
    expect(saved.items.map((item) => ({ description: item.description, rate: item.rate, tax: item.tax, total: item.total }))).toEqual(
      preview.lines.map((line) => ({ description: line.description, rate: line.rate, tax: line.tax, total: line.total })),
    );
    const againResponse = await saveDraft(body);
    expect(againResponse.status).toBe(201);
    const again = invoiceSchema.parse(await againResponse.json());
    expect(again.id).toBe(saved.id);
    expect(again.total).toBe(preview.total);
    const conflict = await app.request('/api/ai/assistant/drafts', {
      method: 'POST',
      headers: { ...headers, Cookie: cookie, 'Idempotency-Key': 'preview-fields-1' },
      body: JSON.stringify({ ...body, edits: { ...edits, issueDate: '2026-11-02' } }),
    });
    expect(conflict.status).toBe(409);
    expect(errorEnvelopeSchema.parse(await conflict.json()).error.code).toBe('IDEMPOTENCY_CONFLICT');
    expect((await tally(db)).invoices).toBe(before.invoices + 1);
  }));

  it('keeps the proposal date and GST rate when the new fields are omitted', () => run({
    steps: [turn([{ name: 'prepare_invoice_proposal', arguments: { customerQuery: 'Sarah', dueDate: '2026-11-13', taxInclusive: true, lines: [{ description: 'Plumbing', quantity: '3', rate: '100.00' }] } }])],
  }, async ({ call, ask, app, cookie }) => {
    await call('/api/customers', 'POST', { name: 'Sarah Chen', email: 'sarah@example.test' }, 201);
    const reply = await ask(prompt('gst-inclusive'));
    const proposal = reply.parts.find((part) => part.type === 'proposal');
    if (proposal?.type !== 'proposal') throw new Error('missing proposal');
    const edits = { lines: [{ description: 'Plumbing', quantity: '2', rate: '100.00' }] };
    const previewResponse = await app.request(`/api/ai/assistant/proposals/${proposal.proposal.id}/preview`, {
      method: 'POST', headers: { ...headers, Cookie: cookie }, body: JSON.stringify({ conversationId: reply.conversationId, edits }),
    });
    const preview = previewAssistantProposalResponseSchema.parse(await previewResponse.json());
    expect(preview).toMatchObject({ date: proposal.proposal.date, taxRate: proposal.proposal.taxRate, taxInclusive: true, subtotal: '173.91', taxAmount: '26.09', total: '200.00', errors: [] });
    const saved = invoiceSchema.parse(await call('/api/ai/assistant/drafts', 'POST', {
      conversationId: reply.conversationId, proposalId: proposal.proposal.id, edits,
    }, 201));
    expect(saved).toMatchObject({ date: proposal.proposal.date, subtotal: preview.subtotal, taxAmount: preview.taxAmount, total: preview.total });
  }));

  it('rejects an invalid GST rate or date and reports a due date before the issue date', () => run({
    steps: [turn([{ name: 'prepare_invoice_proposal', arguments: { customerQuery: 'Sarah', dueDate: '2026-11-13', taxInclusive: true, lines: [{ description: 'Plumbing', quantity: '1', rate: '100.00' }] } }])],
  }, async ({ call, ask, app, cookie, db }) => {
    await call('/api/customers', 'POST', { name: 'Sarah Chen', email: 'sarah@example.test' }, 201);
    const reply = await ask(prompt('gst-inclusive'));
    const proposal = reply.parts.find((part) => part.type === 'proposal');
    if (proposal?.type !== 'proposal') throw new Error('missing proposal');
    const send = (path: string, payload: unknown) => app.request(path, {
      method: 'POST', headers: { ...headers, Cookie: cookie }, body: JSON.stringify(payload),
    });
    const badRate = await send('/api/ai/assistant/proposals/' + proposal.proposal.id + '/preview', {
      conversationId: reply.conversationId, edits: { taxRate: '150' },
    });
    expect(badRate.status).toBe(400);
    expect(errorEnvelopeSchema.parse(await badRate.json()).error.message).toMatch(/taxRate/);
    const badDate = await send('/api/ai/assistant/drafts', {
      conversationId: reply.conversationId, proposalId: proposal.proposal.id, edits: { issueDate: '2026-02-31' },
    });
    expect(badDate.status).toBe(400);
    expect(errorEnvelopeSchema.parse(await badDate.json()).error.message).toMatch(/issueDate/);
    const earlyDue = await send(`/api/ai/assistant/proposals/${proposal.proposal.id}/preview`, {
      conversationId: reply.conversationId, edits: { issueDate: '2026-11-20' },
    });
    expect(earlyDue.status).toBe(200);
    const earlyBody = previewAssistantProposalResponseSchema.parse(await earlyDue.json());
    expect(earlyBody.errors).toContainEqual({ field: 'dueDate', message: "Due date can't be before the invoice date" });
    expect(earlyBody.total).toBe('100.00');
    const refused = await send('/api/ai/assistant/drafts', {
      conversationId: reply.conversationId, proposalId: proposal.proposal.id, edits: { issueDate: '2026-11-20' },
    });
    expect(refused.status).toBe(400);
    expect(errorEnvelopeSchema.parse(await refused.json()).error).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: "Due date can't be before the invoice date",
    });
    expect((await tally(db)).invoices).toBe(0);
  }));

  it('hides a proposal from another business on preview the same way as save', () => run({
    steps: [turn([{ name: 'prepare_invoice_proposal', arguments: { customerQuery: 'Sarah', dueDate: '2026-11-13', taxInclusive: true, lines: [{ description: 'Plumbing', quantity: '1', rate: '100.00' }] } }])],
  }, async ({ call, ask, app, db }) => {
    await call('/api/customers', 'POST', { name: 'Sarah Chen', email: 'sarah@example.test' }, 201);
    const reply = await ask(prompt('gst-inclusive'));
    const proposal = reply.parts.find((part) => part.type === 'proposal');
    if (proposal?.type !== 'proposal') throw new Error('missing proposal');
    const other = await app.request('/api/auth/sign-up/email', { method: 'POST', headers, body: JSON.stringify({ name: 'Other', email: `other-${crypto.randomUUID()}@example.test`, password: 'password123' }) });
    const otherCookie = cookieOf(other);
    const preview = await app.request(`/api/ai/assistant/proposals/${proposal.proposal.id}/preview`, {
      method: 'POST', headers: { ...headers, Cookie: otherCookie }, body: JSON.stringify({ conversationId: reply.conversationId }),
    });
    const save = await app.request('/api/ai/assistant/drafts', {
      method: 'POST', headers: { ...headers, Cookie: otherCookie }, body: JSON.stringify({ conversationId: reply.conversationId, proposalId: proposal.proposal.id }),
    });
    const previewError = errorEnvelopeSchema.parse(await preview.json()).error;
    const saveError = errorEnvelopeSchema.parse(await save.json()).error;
    expect(preview.status).toBe(save.status);
    expect(previewError.code).toBe(saveError.code);
    expect(previewError.message).toBe(saveError.message);
    expect(previewError.message).toBe('That proposal is not in this business.');
    expect((await tally(db)).invoices).toBe(0);
  }));

  it('rate-limits previews without using the daily message quota', () => run({
    limits: { dailyMessages: 2, previewPerMinute: 1 },
    steps: [
      turn([{ name: 'prepare_invoice_proposal', arguments: { customerQuery: 'Sarah', dueDate: '2026-11-13', taxInclusive: true, lines: [{ description: 'Plumbing', quantity: '1', rate: '100.00' }] } }]),
      turn([{ name: 'list_outstanding', arguments: {} }]),
    ],
  }, async ({ call, ask, app, cookie, db }) => {
    await call('/api/customers', 'POST', { name: 'Sarah Chen', email: 'sarah@example.test' }, 201);
    const reply = await ask(prompt('gst-inclusive'));
    const proposal = reply.parts.find((part) => part.type === 'proposal');
    if (proposal?.type !== 'proposal') throw new Error('missing proposal');
    const sendPreview = () => app.request(`/api/ai/assistant/proposals/${proposal.proposal.id}/preview`, {
      method: 'POST', headers: { ...headers, Cookie: cookie }, body: JSON.stringify({ conversationId: reply.conversationId }),
    });
    expect((await sendPreview()).status).toBe(200);
    const limited = await sendPreview();
    expect(limited.status).toBe(429);
    expect(errorEnvelopeSchema.parse(await limited.json()).error.code).toBe('ASSISTANT_PREVIEW_LIMIT');
    expect((await db.select().from(assistantEvents)).filter((event) => event.action === 'turn')).toHaveLength(1);
    const followUp = await ask(prompt('who-owes'));
    expect(followUp.parts.some((part) => part.type === 'text')).toBe(true);
    expect((await db.select().from(assistantEvents)).filter((event) => event.action === 'turn')).toHaveLength(2);
    const blocked = await ask(prompt('who-owes'), 429);
    expect(blocked.error?.code).toBe('ASSISTANT_LIMIT');
  }));

  it('refuses a preview when the assistant is off', () => run({
    assistant: 'unavailable',
    steps: [turn([{ name: 'prepare_invoice_proposal', arguments: { customerQuery: 'Sarah', dueDate: '2026-11-13', taxInclusive: true, lines: [{ description: 'Plumbing', quantity: '1', rate: '100.00' }] } }])],
  }, async ({ app, cookie }) => {
    const preview = await app.request(`/api/ai/assistant/proposals/${crypto.randomUUID()}/preview`, {
      method: 'POST', headers: { ...headers, Cookie: cookie }, body: JSON.stringify({ conversationId: crypto.randomUUID() }),
    });
    expect(preview.status).toBe(403);
    expect(errorEnvelopeSchema.parse(await preview.json()).error.code).toBe('ASSISTANT_DISABLED');
  }));
});
