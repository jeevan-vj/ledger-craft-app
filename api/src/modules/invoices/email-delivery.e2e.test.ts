import { createServer, type IncomingHttpHeaders } from 'node:http';
import { once } from 'node:events';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { withTestDb } from '../../test/harness';
import { createAuth } from '../auth/auth';
import { createResendInvoiceMailer } from './resend';

const headers = { Origin: 'http://localhost:8080', 'Content-Type': 'application/json' };
async function company(app: ReturnType<typeof createApp>) {
  const signup = await app.request('/api/auth/sign-up/email', { method: 'POST', headers,
    body: JSON.stringify({ name: 'Mail Owner', email: `mail-${crypto.randomUUID()}@example.test`, password: 'Local-mail-test-123!' }) });
  expect(signup.status).toBe(200);
  const cookie = signup.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
  const owner = { ...headers, Cookie: cookie };
  const profile = await app.request('/api/business-profile', { method: 'PUT', headers: owner,
    body: JSON.stringify({ name: 'Kauri Email Limited', country: 'NZ', email: 'owner@example.test' }) });
  expect(profile.status).toBe(200);
  const response = await app.request('/api/customers', { method: 'POST', headers: owner,
    body: JSON.stringify({ name: 'Harbour Cafe', email: 'buyer@example.test' }) });
  const customer = await response.json() as { id: string };
  expect(response.status).toBe(201);
  const created = await app.request('/api/invoices', { method: 'POST', headers: owner,
    body: JSON.stringify({ customerId: customer.id, date: '2026-11-06', dueDate: '2026-12-06',
      currency: 'NZD', taxInclusive: false, taxRate: '15', items: [{ description: 'Consulting', quantity: '1', rate: '1000' }] }) });
  expect(created.status).toBe(201);
  return { owner, invoice: await created.json() as { id: string; invoiceNumber: string } };
}

describe('invoice delivery acceptance', () => {
  it('keeps an invoice draft when no email transport was supplied', async () => {
    await withTestDb(async ({ db }) => {
      const app = createApp({ db, auth: createAuth(db) });
      const { owner, invoice } = await company(app);
      const response = await app.request(`/api/invoices/${invoice.id}/send`, { method: 'POST', headers: owner, body: '{}' });
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ error: { code: 'EMAIL_UNAVAILABLE' } });
      const stored = await app.request(`/api/invoices/${invoice.id}`, { headers: owner });
      expect(await stored.json()).toMatchObject({ status: 'draft' });
    });
  });

  it('uses real local HTTP transport and marks sent only after provider acceptance', async () => {
    const received: Array<{ headers: IncomingHttpHeaders; body: { to: string[]; text: string; html: string } }> = [];
    let reject = true;
    const server = createServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      received.push({ headers: request.headers, body: JSON.parse(Buffer.concat(chunks).toString()) });
      response.writeHead(reject ? 503 : 200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(reject ? { message: 'provider unavailable' } : { id: 'local-provider-accepted-1' }));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected local server address');
    const transport: typeof fetch = (_input, init) => fetch(`http://127.0.0.1:${address.port}/emails`, init);
    try {
      await withTestDb(async ({ db }) => {
        const mailer = createResendInvoiceMailer({ apiKey: 'local-test-key', from: 'Kauri <invoices@example.test>', fetchImpl: transport });
        const app = createApp({ db, auth: createAuth(db), invoiceMailer: mailer });
        const { owner, invoice } = await company(app);
        const send = () => app.request(`/api/invoices/${invoice.id}/send`, { method: 'POST', headers: owner, body: '{}' });
        const failed = await send();
        expect(failed.status).toBe(502);
        const draft = await app.request(`/api/invoices/${invoice.id}`, { headers: owner });
        expect(await draft.json()).toMatchObject({ status: 'draft' });
        reject = false;
        const accepted = await send();
        expect(accepted.status).toBe(200);
        expect(await accepted.json()).toMatchObject({ status: 'sent' });
        expect(received).toHaveLength(2);
        expect(received[1].headers['idempotency-key']).toBe(`invoice/${invoice.id}`);
        expect(received[1].body.to).toEqual(['buyer@example.test']);
        expect(received[1].body.text).toContain('NZD 1,150.00');
        expect(received[1].body.text).toContain('Kauri Email Limited');
        expect(received[1].body.text).toContain('/shared/invoice/');
        expect(received[1].body.html).not.toContain('local-test-key');
      });
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, rejectClose) => server.close((error) => error ? rejectClose(error) : resolve()));
    }
  });
});
