/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { createDb } from '../../db/local';
import { getDatabaseUrl } from '../../env';
import { withTestDb } from '../../test/harness';
import { createAuth } from '../auth/auth';
import { createMemoryObjectStore } from '../storage/object-store';

const headers = { Origin: 'http://localhost:8080', 'Content-Type': 'application/json' };
function cookie(response: Response) { return response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; '); }

async function signUp(app: ReturnType<typeof createApp>, label: string) {
  const response = await app.request('/api/auth/sign-up/email', { method: 'POST', headers, body: JSON.stringify({
    name: label, email: `${crypto.randomUUID()}@example.test`, password: 'password123',
  }) });
  return cookie(response);
}

async function seed(app: ReturnType<typeof createApp>, authCookie: string) {
  await app.request('/api/business-profile', { method: 'PUT', headers: { ...headers, Cookie: authCookie }, body: JSON.stringify({
    name: 'Lifecycle Studio', email: 'owner@example.test', country: 'NZ', defaultTaxRate: '15',
  }) });
  const customer = await app.request('/api/customers', { method: 'POST', headers: { ...headers, Cookie: authCookie }, body: JSON.stringify({
    name: 'Harbour Client', email: 'client@example.test', country: 'NZ',
  }) });
  return (await customer.json() as { id: string }).id;
}

describe('invoice lifecycle', () => {
  it('keeps exact mixed tax totals, immutable history, balanced cancellation, restore, duplicate and archive', async () => {
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const app = createApp({
          auth: createAuth(db),
          db,
          objectStore: createMemoryObjectStore(),
          invoiceMailer: { sendInvoice: async () => undefined },
        });
        const owner = await signUp(app, 'Lifecycle Owner');
        const other = await signUp(app, 'Other Owner');
        const customerId = await seed(app, owner);
        const ownerHeaders = { ...headers, Cookie: owner };
        const created = await app.request('/api/invoices', { method: 'POST', headers: ownerHeaders, body: JSON.stringify({
          customerId, date: '2026-10-23', dueDate: '2026-11-23', taxInclusive: false,
          items: [{ description: 'Implementation', quantity: '2', rate: '100', discountType: 'percent', discountValue: '10', taxes: [
            { id: 'gst', name: 'GST', rate: '15' }, { id: 'levy', name: 'Levy', rate: '2.5' },
          ] }],
        }) });
        expect(created.status).toBe(201);
        const invoice = await created.json() as any;
        expect(invoice.items[0]).toMatchObject({ discountAmount: '20.00', tax: '31.50', total: '180.00' });
        expect(invoice).toMatchObject({ subtotal: '180.00', taxAmount: '31.50', total: '211.50' });

        const sent = await app.request(`/api/invoices/${invoice.id}/send`, {
          method: 'POST', headers: ownerHeaders, body: '{}',
        });
        expect(sent.status).toBe(200);
        expect((await sent.json() as any).status).toBe('sent');

        const leaked = await app.request(`/api/invoices/${invoice.id}/history`, { headers: { Cookie: other } });
        expect(leaked.status).toBe(404);

        const duplicateHeaders = { ...ownerHeaders, 'Idempotency-Key': 'duplicate-proof-1' };
        const duplicate = await app.request(`/api/invoices/${invoice.id}/duplicate`, { method: 'POST', headers: duplicateHeaders });
        expect(duplicate.status).toBe(201);
        const copy = await duplicate.json() as any;
        expect(copy.id).not.toBe(invoice.id);
        expect(copy.invoiceNumber).not.toBe(invoice.invoiceNumber);
        expect(copy.status).toBe('draft');
        const duplicateRetry = await app.request(`/api/invoices/${invoice.id}/duplicate`, { method: 'POST', headers: duplicateHeaders });
        expect((await duplicateRetry.json() as any).id).toBe(copy.id);

        const cancel = await app.request(`/api/invoices/${invoice.id}/cancel`, { method: 'POST', headers: ownerHeaders, body: JSON.stringify({ reason: 'Customer request' }) });
        expect(cancel.status).toBe(200);
        expect((await cancel.json() as any).status).toBe('cancelled');
        const retry = await app.request(`/api/invoices/${invoice.id}/cancel`, { method: 'POST', headers: ownerHeaders, body: '{}' });
        expect(retry.status).toBe(200);
        const reversals = await sql.unsafe(
          `SELECT COUNT(DISTINCT entries.id) AS count,
                  printf('%.2f', SUM(CAST(lines.debit_amount AS REAL))) AS debit,
                  printf('%.2f', SUM(CAST(lines.credit_amount AS REAL))) AS credit
             FROM journal_entries entries
             JOIN journal_entry_lines lines ON lines.journal_entry_id = entries.id
            WHERE entries.reference_type = ? AND entries.reference_id = ?`,
          ['invoice_cancellation', invoice.id],
        ) as Array<{ count: number; debit: string; credit: string }>;
        expect(reversals[0]).toEqual({ count: 1, debit: '211.50', credit: '211.50' });
        const restore = await app.request(`/api/invoices/${invoice.id}/restore`, { method: 'POST', headers: ownerHeaders, body: '{}' });
        expect((await restore.json() as any).status).toBe('sent');

        const history = await app.request(`/api/invoices/${invoice.id}/history`, { headers: ownerHeaders });
        const actions = (await history.json() as any).history.map((event: any) => event.action);
        expect(actions).toEqual(expect.arrayContaining(['created', 'cancelled', 'restored']));

        const archived = await app.request(`/api/invoices/${copy.id}`, { method: 'DELETE', headers: ownerHeaders });
        expect(archived.status).toBe(200);
        const list = await app.request('/api/invoices', { headers: ownerHeaders });
        expect((await list.json() as any).invoices.map((row: any) => row.id)).not.toContain(copy.id);
        expect((await app.request(`/api/invoices/${copy.id}/restore`, { method: 'POST', headers: ownerHeaders, body: '{}' })).status).toBe(200);
      } finally { await sql.end({ timeout: 5 }); }
    });
  });

  it('snapshots attachment access and imports idempotently by external id', async () => {
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const store = createMemoryObjectStore();
        const app = createApp({ auth: createAuth(db), db, objectStore: store });
        const owner = await signUp(app, 'Attachment Owner');
        const customerId = await seed(app, owner);
        const ownerHeaders = { ...headers, Cookie: owner };
        const created = await app.request('/api/invoices', { method: 'POST', headers: ownerHeaders, body: JSON.stringify({
          customerId, date: '2026-10-23', dueDate: '2026-11-23', items: [{ description: 'Work', quantity: '1', rate: '10' }],
        }) });
        const invoice = await created.json() as any;
        const upload = await app.request('/api/objects', { method: 'POST', headers: ownerHeaders, body: JSON.stringify({
          kind: 'invoice', filename: 'brief.pdf', contentType: 'application/pdf', contentBase64: Buffer.from('%PDF-proof').toString('base64'),
        }) });
        const object = await upload.json() as any;
        const attached = await app.request(`/api/invoices/${invoice.id}/attachments`, { method: 'POST', headers: ownerHeaders, body: JSON.stringify({
          objectKey: object.key, filename: 'brief.pdf', contentType: 'application/pdf', size: 10,
        }) });
        expect(attached.status).toBe(201);
        const attachment = await attached.json() as any;
        const shared = await app.request(`/api/invoices/${invoice.id}/share`, { method: 'POST', headers: ownerHeaders, body: '{}' });
        const token = (await shared.json() as any).shareToken;
        const publicFile = await app.request(`/api/public/invoices/${token}/attachments/${attachment.id}`);
        expect(publicFile.status).toBe(200);
        expect(await publicFile.text()).toBe('%PDF-proof');

        const laterUpload = await app.request('/api/objects', { method: 'POST', headers: ownerHeaders, body: JSON.stringify({
          kind: 'invoice', filename: 'after-share.png', contentType: 'image/png', contentBase64: Buffer.from('later-image').toString('base64'),
        }) });
        const laterObject = await laterUpload.json() as any;
        const laterAttached = await app.request(`/api/invoices/${invoice.id}/attachments`, { method: 'POST', headers: ownerHeaders, body: JSON.stringify({
          objectKey: laterObject.key, filename: 'after-share.png', contentType: 'image/png', size: 11,
        }) });
        const laterAttachment = await laterAttached.json() as any;
        expect((await app.request(`/api/public/invoices/${token}/attachments/${laterAttachment.id}`)).status).toBe(404);
        const publicSnapshot = await app.request(`/api/public/invoices/${token}`);
        expect((await publicSnapshot.json() as any).attachments.map((file: any) => file.id)).toEqual([attachment.id]);

        const importBody = { dryRun: false, rows: [{ externalId: 'legacy-100', customerId, date: '2026-10-01', dueDate: '2026-10-31', currency: 'NZD', items: [{ description: 'Imported', quantity: '1', rate: '20' }] }] };
        const imported = await app.request('/api/invoices-import', { method: 'POST', headers: ownerHeaders, body: JSON.stringify(importBody) });
        expect(await imported.json()).toMatchObject({ valid: true, imported: 1 });
        const duplicate = await app.request('/api/invoices-import', { method: 'POST', headers: ownerHeaders, body: JSON.stringify(importBody) });
        expect(await duplicate.json()).toMatchObject({ valid: false, imported: 0 });
        const exported = await app.request('/api/invoices-export.csv', { headers: ownerHeaders });
        expect(await exported.text()).toContain('legacy-100');
      } finally { await sql.end({ timeout: 5 }); }
    });
  });

  it('imports paid invoices through a real payment and keeps dry runs side-effect free', async () => {
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const app = createApp({ auth: createAuth(db), db });
        const owner = await signUp(app, 'Paid Import Owner');
        const customerId = await seed(app, owner);
        const ownerHeaders = { ...headers, Cookie: owner };
        const row = {
          externalId: '=HYPERLINK("https://example.test")', externalNumber: 'BUYER-PAID-42',
          customerId, date: '2026-10-01', dueDate: '2026-10-31', status: 'paid',
          paymentDate: '2026-10-04', paymentMethod: 'bank_transfer', paymentReference: 'BANK-42',
          taxInclusive: false, taxRate: '15', items: [{ description: 'Imported paid work', quantity: '1', rate: '100' }],
        } as const;

        const preview = await app.request('/api/invoices-import', {
          method: 'POST', headers: ownerHeaders, body: JSON.stringify({ dryRun: true, rows: [{ ...row, externalId: 'dry-paid-1' }] }),
        });
        expect(await preview.json()).toMatchObject({ valid: true, imported: 0 });
        expect((await sql.unsafe('SELECT * FROM payments'))).toHaveLength(0);

        const response = await app.request('/api/invoices-import', {
          method: 'POST', headers: ownerHeaders, body: JSON.stringify({ dryRun: false, rows: [row] }),
        });
        expect(await response.json()).toMatchObject({ valid: true, imported: 1 });
        const imported = (await (await app.request('/api/invoices', { headers: ownerHeaders })).json() as any).invoices
          .find((invoice: any) => invoice.externalNumber === 'BUYER-PAID-42');
        expect(imported).toMatchObject({ total: '115.00', totalPaid: '115.00', balanceDue: '0.00', status: 'paid' });

        const payments = await sql.unsafe('SELECT invoice_id, amount, payment_date, payment_method, reference_number FROM payments WHERE invoice_id = ?', [imported.id]);
        expect(payments).toEqual([{ invoice_id: imported.id, amount: '115.00', payment_date: '2026-10-04', payment_method: 'bank_transfer', reference_number: 'BANK-42' }]);
        const invoiceLines = await sql.unsafe(
          `SELECT accounts.account_number, journal_entry_lines.debit_amount, journal_entry_lines.credit_amount
             FROM journal_entry_lines JOIN accounts ON accounts.id = journal_entry_lines.account_id
             JOIN journal_entries ON journal_entries.id = journal_entry_lines.journal_entry_id
            WHERE journal_entries.reference_type = 'invoice' AND journal_entries.reference_id = ?`,
          [imported.id],
        );
        expect(invoiceLines).toEqual(expect.arrayContaining([
          expect.objectContaining({ account_number: '1200', debit_amount: '115.00', credit_amount: '0.00' }),
          expect.objectContaining({ account_number: '4000', debit_amount: '0.00', credit_amount: '100.00' }),
          expect.objectContaining({ account_number: '2200', debit_amount: '0.00', credit_amount: '15.00' }),
        ]));
        const lines = await sql.unsafe(
          `SELECT accounts.account_number, journal_entry_lines.debit_amount, journal_entry_lines.credit_amount
             FROM journal_entry_lines JOIN accounts ON accounts.id = journal_entry_lines.account_id
             JOIN journal_entries ON journal_entries.id = journal_entry_lines.journal_entry_id
            WHERE journal_entries.reference_type = 'invoice_payment' AND journal_entries.reference_id = (SELECT id FROM payments WHERE invoice_id = ?)`,
          [imported.id],
        );
        expect(lines).toEqual(expect.arrayContaining([
          expect.objectContaining({ account_number: '1110', debit_amount: '115.00', credit_amount: '0.00' }),
          expect.objectContaining({ account_number: '1200', debit_amount: '0.00', credit_amount: '115.00' }),
        ]));
        const debit = lines.reduce((sum, line) => sum + Number(line.debit_amount), 0);
        const credit = lines.reduce((sum, line) => sum + Number(line.credit_amount), 0);
        expect(debit).toBe(credit);

        const csv = await (await app.request('/api/invoices-export.csv', { headers: ownerHeaders })).text();
        expect(csv).toContain("'=HYPERLINK");
      } finally { await sql.end({ timeout: 5 }); }
    });
  });

  it('keeps locked source attachments in the database and object store and out of public shares', async () => {
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const store = createMemoryObjectStore();
        const app = createApp({ auth: createAuth(db), db, objectStore: store });
        const owner = await signUp(app, 'Locked Attachment Owner');
        const customerId = await seed(app, owner);
        const ownerHeaders = { ...headers, Cookie: owner };
        const invoice = await (await app.request('/api/invoices', { method: 'POST', headers: ownerHeaders, body: JSON.stringify({
          customerId, date: '2026-10-23', dueDate: '2026-11-23', items: [{ description: 'Work', quantity: '1', rate: '10' }],
        }) })).json() as any;
        const uploaded = await (await app.request('/api/objects', { method: 'POST', headers: ownerHeaders, body: JSON.stringify({
          kind: 'invoice', filename: 'source.pdf', contentType: 'application/pdf', contentBase64: Buffer.from('%PDF-source').toString('base64'),
        }) })).json() as any;
        const attachmentId = crypto.randomUUID();
        await sql.unsafe(
          `INSERT INTO invoice_attachments (id, organisation_id, invoice_id, object_key, filename, content_type, size, created_by, role, locked)
           SELECT ?, organisation_id, id, ?, 'source.pdf', 'application/pdf', 11, user_id, 'source_document', 1 FROM invoices WHERE id = ?`,
          [attachmentId, uploaded.key, invoice.id],
        );

        const removal = await app.request(`/api/invoices/${invoice.id}/attachments/${attachmentId}`, { method: 'DELETE', headers: ownerHeaders });
        expect(removal.status).toBe(409);
        expect((await removal.json() as any).error.code).toBe('SOURCE_DOCUMENT_LOCKED');
        expect(await sql.unsafe('SELECT id FROM invoice_attachments WHERE id = ?', [attachmentId])).toHaveLength(1);
        expect(await store.get(uploaded.key)).toBeTruthy();

        const regularUpload = await (await app.request('/api/objects', { method: 'POST', headers: ownerHeaders, body: JSON.stringify({
          kind: 'invoice', filename: 'regular.png', contentType: 'image/png', contentBase64: Buffer.from('regular').toString('base64'),
        }) })).json() as any;
        const regularAttachment = await (await app.request(`/api/invoices/${invoice.id}/attachments`, { method: 'POST', headers: ownerHeaders, body: JSON.stringify({
          objectKey: regularUpload.key, filename: 'regular.png', contentType: 'image/png', size: 7,
        }) })).json() as any;
        expect((await app.request(`/api/invoices/${invoice.id}/attachments/${regularAttachment.id}`, { method: 'DELETE', headers: ownerHeaders })).status).toBe(204);
        expect(await store.get(regularUpload.key)).toBeUndefined();

        const shared = await app.request(`/api/invoices/${invoice.id}/share`, { method: 'POST', headers: ownerHeaders, body: '{}' });
        const token = (await shared.json() as any).shareToken;
        expect((await app.request(`/api/public/invoices/${token}/attachments/${attachmentId}`)).status).toBe(404);
        expect((await (await app.request(`/api/public/invoices/${token}`)).json() as any).attachments).toEqual([]);
      } finally { await sql.end({ timeout: 5 }); }
    });
  });
});
