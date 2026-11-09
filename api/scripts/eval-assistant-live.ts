/**
 * Live assistant eval against Cloudflare Workers AI.
 *
 * Not part of CI. Deterministic cases (limits, timeout, malformed output,
 * duplicate save) stay in src/modules/ai/assistant.eval.test.ts.
 *
 *   pnpm --filter @ledgercraft/api eval:assistant:live
 *
 * Requires CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN with Workers AI run
 * permission. The script uses a temporary SQLite file and does not call a
 * deployed production API.
 */
import { ASSISTANT_WORKERS_AI_MODEL } from '../src/modules/ai/workers-ai';

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!accountId || !token) {
  console.log([
    'Live Workers AI eval was not run.',
    'Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN, then run:',
    '  pnpm --filter @ledgercraft/api eval:assistant:live',
    `Model: ${ASSISTANT_WORKERS_AI_MODEL} (override with ASSISTANT_WORKERS_AI_MODEL).`,
    'The script creates a temporary business, sends the CI prompts, and prints pass/fail plus p50/p95 latency.',
    'Exit 2: credentials were absent.',
  ].join('\n'));
  process.exit(2);
}

const { mkdtempSync } = await import('node:fs');
const { tmpdir } = await import('node:os');
const { join } = await import('node:path');
const { pathToFileURL } = await import('node:url');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = pathToFileURL(join(mkdtempSync(join(tmpdir(), 'ledgercraft-sqlite-test-')), 'ledgercraft_test.sqlite')).href;
process.env.BETTER_AUTH_SECRET ||= 'live-eval-better-auth-secret-32ch';
process.env.BETTER_AUTH_URL ||= 'http://localhost:8080';
process.env.BETTER_AUTH_TRUSTED_ORIGINS ||= 'http://localhost:8080';

const { createApp } = await import('../src/app');
const { createDb } = await import('../src/db/local');
const { withTestDb } = await import('../src/test/harness');
const { createAuth } = await import('../src/modules/auth/auth');
const { parseWorkersAiAssistantTurn } = await import('../src/modules/ai/assistant.workers');
const { ASSISTANT_EVAL_PROMPTS } = await import('../src/modules/ai/assistant.prompts');
const { pricedTotals } = await import('../src/modules/ai/assistant.proposal');

const modelName = process.env.ASSISTANT_WORKERS_AI_MODEL || ASSISTANT_WORKERS_AI_MODEL;
const headers = { Origin: 'http://localhost:8080', 'Content-Type': 'application/json' };
const monday = new Date('2026-11-09T01:00:00.000Z');
const dateline = new Date('2026-11-13T11:30:00.000Z');

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index] ?? 0;
}

await withTestDb(async () => {
  const { db, sql } = createDb(process.env.DATABASE_URL!);
  try {
    const runtime: import('../src/modules/ai/assistant.config').AssistantRuntime = {
      model: {
        async complete({ messages, tools, signal }) {
          const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${modelName}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages, tools }),
            signal,
          });
          const payload = await response.json() as unknown;
          if (!response.ok) throw new Error(`Workers AI HTTP ${response.status}`);
          return parseWorkersAiAssistantTurn(payload);
        },
      },
      now: monday,
      timeoutMs: 20_000,
    };
    const app = createApp({
      auth: createAuth(db), db, checkDatabase: async () => true, assistant: runtime,
      capabilities: { email: 'unavailable', ai: 'unavailable', stripe: 'unavailable', assistant: 'available' },
    });
    const signup = await app.request('/api/auth/sign-up/email', { method: 'POST', headers, body: JSON.stringify({ name: 'Live owner', email: `live-${crypto.randomUUID()}@example.test`, password: 'password123' }) });
    const cookie = signup.headers.getSetCookie().map((cookie) => cookie.split(';')[0]).join('; ');
    const call = async (path: string, method: string, body?: unknown) => {
      const response = await app.request(path, { method, headers: { ...headers, Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
      if (response.status >= 400) throw new Error(`${method} ${path} ${response.status} ${await response.text()}`);
      return response.json() as Promise<Record<string, unknown>>;
    };
    await call('/api/business-profile', 'PUT', { name: 'Kauri Plumbing', email: 'owner@example.test', country: 'NZ', defaultTaxRate: '15' });
    await call('/api/customers', 'POST', { name: 'Sarah Chen', email: 'sarah.chen@example.test' });
    await call('/api/customers', 'POST', { name: 'Sarah Jones', email: 'sarah.jones@example.test' });
    await call('/api/items', 'POST', { name: 'Plumbing', type: 'service', salePrice: '120.00', unit: 'h' });
    await call('/api/items', 'POST', { name: 'Pool filter', type: 'product', salePrice: '40.00' });
    await call('/api/items', 'POST', { name: 'Air filter', type: 'product', salePrice: '25.00' });
    const owing = await call('/api/customers', 'POST', { name: 'Owing Customer', email: 'owing@example.test' });
    const invoice = await call('/api/invoices', 'POST', { customerId: owing.id, date: '2026-11-09', dueDate: '2026-11-20', taxInclusive: true, items: [{ description: 'Work', quantity: '1', rate: '100' }] });
    await call(`/api/invoices/${String(invoice.id)}`, 'PATCH', { status: 'sent' });
    const other = await app.request('/api/auth/sign-up/email', { method: 'POST', headers, body: JSON.stringify({ name: 'Other', email: `other-${crypto.randomUUID()}@example.test`, password: 'password123' }) });
    const otherCookie = other.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
    await app.request('/api/customers', { method: 'POST', headers: { ...headers, Cookie: otherCookie }, body: JSON.stringify({ name: 'Secret Buyer', email: 'secret@example.test' }) });

    const latencies: number[] = [];
    let failed = 0;
    console.log('| Prompt | Result | Detail | ms |');
    console.log('| --- | --- | --- | --- |');
    for (const item of ASSISTANT_EVAL_PROMPTS) {
      runtime.now = item.id === 'friday-dateline' ? dateline : monday;
      const started = Date.now();
      const response = await app.request('/api/ai/assistant', { method: 'POST', headers: { ...headers, Cookie: cookie }, body: JSON.stringify({ message: item.prompt }) });
      const elapsed = Date.now() - started;
      latencies.push(elapsed);
      const body = await response.json() as { parts?: Array<{ type: string; text?: string; href?: string; proposal?: { taxInclusive?: boolean; taxRate?: string; dueDate?: string | null; date?: string; lines?: Array<{ description: string; quantity: string; rate: string | null }>; totals?: { subtotal: string; taxAmount: string; total: string } | null } }> };
      const parts = body.parts ?? [];
      const proposal = parts.find((part) => part.type === 'proposal')?.proposal;
      const priced = proposal?.lines?.every((line) => line.rate) ? pricedTotals({
        taxInclusive: proposal.taxInclusive ?? true,
        taxRate: proposal.taxRate ?? '0',
        lines: (proposal.lines ?? []).flatMap((line) => line.rate ? [{ description: line.description, quantity: line.quantity, rate: line.rate }] : []),
      }) : null;
      const invoices = await call('/api/invoices', 'GET');
      const invoiceCount = Array.isArray(invoices.invoices) ? invoices.invoices.length : 0;
      let pass = response.status === 200 && invoiceCount === 1 && !JSON.stringify(body).includes('Secret Buyer');
      let detail = response.status === 200 ? parts.map((part) => part.type).join(', ') : `HTTP ${response.status}`;
      if (item.id === 'who-owes') pass = pass && parts.some((part) => part.type === 'text' && part.text?.includes('outstanding'));
      if (item.id === 'unsupported-delete') pass = pass && parts.some((part) => part.href === '/invoices');
      if (item.id === 'expense-deferred') pass = pass && parts.some((part) => part.href === '/expenses' || part.text?.includes('Expenses'));
      if (item.id === 'ambiguous-customer' || item.id === 'ambiguous-item') pass = pass && parts.some((part) => part.type === 'quick_picks');
      if (item.id.startsWith('gst') || item.id === 'sarah-missing-parts' || item.id === 'friday-dateline') {
        pass = pass && !!proposal && !!priced && proposal.taxRate === '15' && proposal.totals?.total === priced.total && proposal.totals?.subtotal === priced.subtotal;
        detail = proposal ? `total ${proposal.totals?.total ?? 'none'} due ${proposal.dueDate ?? 'none'}` : detail;
      }
      if (!pass) failed += 1;
      console.log(`| ${item.id} | ${pass ? 'pass' : 'fail'} | ${detail.replace(/\|/g, '/')} | ${elapsed} |`);
    }
    console.log(`p50 ${percentile(latencies, 50)}ms  p95 ${percentile(latencies, 95)}ms  model ${modelName}`);
    console.log('Skipped deterministic cases: limits, timeout, malformed output, duplicate save, forged proposal. Those run in CI.');
    process.exitCode = failed ? 1 : 0;
  } finally {
    await sql.end();
  }
});
