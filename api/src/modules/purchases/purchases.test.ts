import {
  billListResponseSchema,
  billPaymentBatchSchema,
  billSchema,
  errorEnvelopeSchema,
  vendorListResponseSchema,
  vendorSchema,
} from '@ledgercraft/contracts';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { createDb } from '../../db/local';
import { getDatabaseUrl } from '../../env';
import { assertLocalDatabaseReachable, withTestDb } from '../../test/harness';
import { createAuth } from '../auth/auth';

function cookieHeader(response: Response): string {
  return response.headers.getSetCookie().map((cookie) => cookie.split(';')[0]).join('; ');
}

const jsonHeaders = { Origin: 'http://localhost:8080', 'Content-Type': 'application/json' };

async function signUp(app: ReturnType<typeof createApp>, name: string) {
  const response = await app.request('/api/auth/sign-up/email', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({
      name,
      email: `${name.toLowerCase().replace(/\s+/g, '-')}-${crypto.randomUUID()}@example.com`,
      password: 'password123',
    }),
  });
  expect(response.status).toBeLessThan(400);
  return cookieHeader(response);
}

describe('purchase routes', () => {
  it('protects the purchase directory', async () => {
    const response = await createApp().request('/api/vendors');
    expect(response.status).toBe(401);
    expect(errorEnvelopeSchema.parse(await response.json()).error.code).toBe('UNAUTHORIZED');
  });

  it('creates, receives, pays and isolates a bill with balanced journals', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const app = createApp({ auth: createAuth(db), db, checkDatabase: async () => true });
        const ownerA = await signUp(app, 'Purchase Owner A');
        const ownerB = await signUp(app, 'Purchase Owner B');

        const accountResponse = await app.request('/api/accounts', {
          method: 'POST',
          headers: { ...jsonHeaders, Cookie: ownerA },
          body: JSON.stringify({
            name: 'Office expenses',
            type: 'expense',
            accountNumber: '6100',
            accountClass: 'expense',
          }),
        });
        const expenseAccount = await accountResponse.json() as { id: string };

        const bankResponse = await app.request('/api/bank-accounts', {
          method: 'POST',
          headers: { ...jsonHeaders, Cookie: ownerA },
          body: JSON.stringify({
            accountName: 'Business cheque',
            accountNumber: '12-3456-7890123-00',
            bankName: 'ANZ',
            accountType: 'checking',
          }),
        });
        const bankAccount = await bankResponse.json() as { id: string };
        const secondBankResponse = await app.request('/api/bank-accounts', {
          method: 'POST', headers: { ...jsonHeaders, Cookie: ownerA },
          body: JSON.stringify({ accountName: 'Savings', accountNumber: '12-3456-7890123-01', bankName: 'ANZ', accountType: 'savings' }),
        });
        const secondBank = await secondBankResponse.json() as { id: string };

        const vendorResponse = await app.request('/api/vendors', {
          method: 'POST',
          headers: { ...jsonHeaders, Cookie: ownerA },
          body: JSON.stringify({ name: 'Harbour Office Supplies', paymentTermDays: 20 }),
        });
        expect(vendorResponse.status).toBe(201);
        const vendor = vendorSchema.parse(await vendorResponse.json());

        const importCsv = [
          'importIdentifier,name,contactName,email,phone,taxId,address,paymentTermDays,defaultAccountId,defaultTaxRate,isActive',
          `"vendor-002","South, Harbour Supplies","Mereana Lee","mereana@example.com","","","12 Quay Street, Wellington","14","${expenseAccount.id}","15","false"`,
        ].join('\n');
        const previewImport = await app.request('/api/vendors/import', {
          method: 'POST', headers: { ...jsonHeaders, Cookie: ownerA },
          body: JSON.stringify({ csv: importCsv, dryRun: true }),
        });
        expect(previewImport.status).toBe(200);
        expect(await previewImport.json()).toMatchObject({ dryRun: true, validRows: 1, appliedRows: 0, errors: [] });
        const applyImport = await app.request('/api/vendors/import', {
          method: 'POST', headers: { ...jsonHeaders, Cookie: ownerA },
          body: JSON.stringify({ csv: importCsv, dryRun: false }),
        });
        expect(await applyImport.json()).toMatchObject({ validRows: 1, appliedRows: 1, errors: [] });
        const vendorExport = await app.request('/api/vendors-export.csv', { headers: { Cookie: ownerA } });
        expect(vendorExport.status).toBe(200);
        expect(await vendorExport.text()).toContain('"South, Harbour Supplies"');
        await app.request('/api/vendors', {
          method: 'POST', headers: { ...jsonHeaders, Cookie: ownerA },
          body: JSON.stringify({ name: '=HYPERLINK("https://example.test")' }),
        });
        const safeVendorExport = await app.request('/api/vendors-export.csv', { headers: { Cookie: ownerA } });
        expect(await safeVendorExport.text()).toContain("'=HYPERLINK");

        const billInput = {
          vendorId: vendor.id,
          vendorReference: 'HS-1042',
          issueDate: '2026-10-03',
          dueDate: '2026-10-23',
          taxInclusive: true,
          lines: [{
            description: 'Printer paper',
            quantity: '2',
            unitPrice: '11.50',
            taxRate: '15',
            accountId: expenseAccount.id,
          }],
        };
        const billResponse = await app.request('/api/bills', {
          method: 'POST',
          headers: { ...jsonHeaders, Cookie: ownerA, 'Idempotency-Key': 'bill-create-retry-1' },
          body: JSON.stringify(billInput),
        });
        expect(billResponse.status).toBe(201);
        const draft = billSchema.parse(await billResponse.json());
        expect(draft).toMatchObject({
          billNumber: 'BILL-0001',
          lifecycleStatus: 'draft',
          subtotal: '20.00',
          taxAmount: '3.00',
          total: '23.00',
          balanceDue: '23.00',
        });
        expect(draft.history.map((entry) => entry.event)).toContain('created');
        const replay = await app.request('/api/bills', {
          method: 'POST', headers: { ...jsonHeaders, Cookie: ownerA, 'Idempotency-Key': 'bill-create-retry-1' },
          body: JSON.stringify(billInput),
        });
        expect(billSchema.parse(await replay.json()).id).toBe(draft.id);

        const upload = await app.request('/api/objects', {
          method: 'POST', headers: { ...jsonHeaders, Cookie: ownerA },
          body: JSON.stringify({ kind: 'receipt', filename: 'bill.pdf', contentType: 'application/pdf', contentBase64: 'YmlsbA==' }),
        });
        expect(upload.status).toBe(201);
        const uploaded = await upload.json() as { key: string };
        const attached = await app.request(`/api/bills/${draft.id}/attachments`, {
          method: 'POST', headers: { ...jsonHeaders, Cookie: ownerA },
          body: JSON.stringify({ objectKey: uploaded.key, filename: 'bill.pdf', contentType: 'application/pdf', size: 4 }),
        });
        expect(attached.status).toBe(201);
        const sourceAttachment = await attached.json() as { id: string };
        await sql.unsafe("UPDATE bill_attachments SET role = 'source_document', locked = 1 WHERE id = ?", [sourceAttachment.id]);
        const lockedDelete = await app.request(`/api/bills/${draft.id}/attachments/${sourceAttachment.id}`, { method: 'DELETE', headers: { Cookie: ownerA } });
        expect(lockedDelete.status).toBe(409);
        expect((await lockedDelete.json() as { error: { code: string } }).error.code).toBe('SOURCE_DOCUMENT_LOCKED');
        expect(await sql.unsafe('SELECT id FROM bill_attachments WHERE id = ?', [sourceAttachment.id])).toHaveLength(1);

        const regularAttachment = await (await app.request(`/api/bills/${draft.id}/attachments`, {
          method: 'POST', headers: { ...jsonHeaders, Cookie: ownerA },
          body: JSON.stringify({ objectKey: `${uploaded.key}-regular`, filename: 'regular.pdf', contentType: 'application/pdf', size: 4 }),
        })).json() as { id: string };
        expect((await app.request(`/api/bills/${draft.id}/attachments/${regularAttachment.id}`, { method: 'DELETE', headers: { Cookie: ownerA } })).status).toBe(204);

        const receivedResponse = await app.request(`/api/bills/${draft.id}/receive`, {
          method: 'POST',
          headers: { ...jsonHeaders, Cookie: ownerA },
        });
        expect(receivedResponse.status).toBe(200);
        expect(billSchema.parse(await receivedResponse.json()).lifecycleStatus).toBe('received');

        const entries = await sql.unsafe(
          `SELECT reference_type, reference_id, total_amount FROM journal_entries
           WHERE reference_type = 'bill' AND reference_id = ?`,
          [draft.id],
        );
        expect(entries).toHaveLength(1);
        expect(entries[0]?.total_amount).toBe('23.00');
        const totals = await sql.unsafe(
          `SELECT debit_amount, credit_amount FROM journal_entry_lines
           WHERE journal_entry_id = (SELECT id FROM journal_entries WHERE reference_type = 'bill' AND reference_id = ?)`,
          [draft.id],
        );
        const debit = totals.reduce((sum, row) => sum + Number(row.debit_amount), 0);
        const credit = totals.reduce((sum, row) => sum + Number(row.credit_amount), 0);
        expect(debit).toBe(credit);
        expect(debit).toBe(23);

        for (const amount of ['1.005', '0.001']) {
          const extraCents = await app.request(`/api/bills/${draft.id}/payments`, {
            method: 'POST',
            headers: { ...jsonHeaders, Cookie: ownerA },
            body: JSON.stringify({ bankAccountId: bankAccount.id, amount, paymentDate: '2026-10-04' }),
          });
          expect(extraCents.status).toBe(400);
          const error = (await extraCents.json() as { error: { code: string; message: string } }).error;
          expect(error.code).toBe('VALIDATION_ERROR');
          expect(error.message).toMatch(/at most 2 decimal places/);
        }

        const paymentResponse = await app.request(`/api/bills/${draft.id}/payments`, {
          method: 'POST',
          headers: { ...jsonHeaders, Cookie: ownerA },
          body: JSON.stringify({
            allocations: [
              { bankAccountId: bankAccount.id, amount: '3.00' },
              { bankAccountId: secondBank.id, amount: '2.00' },
            ],
            paymentDate: '2026-10-04',
          }),
        });
        expect(paymentResponse.status).toBe(201);
        const paymentBatch = billPaymentBatchSchema.parse(await paymentResponse.json());
        expect(paymentBatch).toMatchObject({ total: '5.00' });
        expect(paymentBatch.payments).toHaveLength(2);
        const paidBill = billSchema.parse(
          await (await app.request(`/api/bills/${draft.id}`, { headers: { Cookie: ownerA } })).json(),
        );
        expect(paidBill).toMatchObject({ paymentStatus: 'partial', totalPaid: '5.00', balanceDue: '18.00' });
        expect(paidBill.attachments).toHaveLength(1);
        expect(paidBill.history.map((entry) => entry.event)).toEqual(expect.arrayContaining(['created', 'received', 'payment_recorded', 'attachment_added']));
        const billExport = await app.request('/api/bills-export.csv', { headers: { Cookie: ownerA } });
        expect(billExport.status).toBe(200);
        const billCsv = await billExport.text();
        expect(billCsv).not.toContain('\n=HYPERLINK');
        expect(billCsv).toContain('BILL-0001');

        expect((await app.request(`/api/bills/${draft.id}/attachments/${paidBill.attachments[0]!.id}`, {
          method: 'DELETE', headers: { ...jsonHeaders, Cookie: ownerB },
        })).status).toBe(404);

        const overpayment = await app.request(`/api/bills/${draft.id}/payments`, {
          method: 'POST',
          headers: { ...jsonHeaders, Cookie: ownerA },
          body: JSON.stringify({ bankAccountId: bankAccount.id, amount: '100.00', paymentDate: '2026-10-04' }),
        });
        expect(overpayment.status).toBe(400);

        const vendorsB = vendorListResponseSchema.parse(
          await (await app.request('/api/vendors', { headers: { Cookie: ownerB } })).json(),
        );
        expect(vendorsB.vendors).toEqual([]);
        const billsB = billListResponseSchema.parse(
          await (await app.request('/api/bills', { headers: { Cookie: ownerB } })).json(),
        );
        expect(billsB.bills).toEqual([]);
        expect((await app.request(`/api/bills/${draft.id}`, { headers: { Cookie: ownerB } })).status).toBe(404);

        const secondDraftResponse = await app.request('/api/bills', {
          method: 'POST', headers: { ...jsonHeaders, Cookie: ownerA },
          body: JSON.stringify({ vendorId: vendor.id, issueDate: '2026-10-03', dueDate: '2026-10-23', lines: [{ description: 'Pens', quantity: '1', unitPrice: '11.50', taxRate: '15', accountId: expenseAccount.id }] }),
        });
        const secondDraft = billSchema.parse(await secondDraftResponse.json());
        await app.request(`/api/bills/${secondDraft.id}/receive`, { method: 'POST', headers: { ...jsonHeaders, Cookie: ownerA } });
        const cancelledResponse = await app.request(`/api/bills/${secondDraft.id}/cancel`, { method: 'POST', headers: { ...jsonHeaders, Cookie: ownerA } });
        expect(billSchema.parse(await cancelledResponse.json()).displayStatus).toBe('cancelled');
        const restoredResponse = await app.request(`/api/bills/${secondDraft.id}/restore`, { method: 'POST', headers: { ...jsonHeaders, Cookie: ownerA } });
        const restored = billSchema.parse(await restoredResponse.json());
        expect(restored.lifecycleStatus).toBe('received');
        expect(restored.history.map((entry) => entry.event)).toEqual(expect.arrayContaining(['cancelled', 'restored']));
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });
});
