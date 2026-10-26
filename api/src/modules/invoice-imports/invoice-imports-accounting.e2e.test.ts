/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { createDb } from '../../db/local';
import { getDatabaseUrl } from '../../env';
import { withTestDb } from '../../test/harness';
import { createAuth } from '../auth/auth';
import { createMemoryFileStorage } from '../storage/file-storage';

const jsonHeaders = { Origin: 'http://localhost:8080', 'Content-Type': 'application/json' };
const fixtureDir = resolve(import.meta.dirname, '__fixtures__');
const reportPath = '/api/reports/financial?from=2026-10-01&to=2026-10-31&basis=accrual&baseCurrency=NZD';
const ledgerPath = '/api/reports/general-ledger?from=2026-10-01&to=2026-10-31&basis=accrual&baseCurrency=NZD';

function cookie(response: Response) {
  return response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
}

async function requestJson(
  app: ReturnType<typeof createApp>,
  path: string,
  init: RequestInit,
  expectedStatus: number,
) {
  const response = await app.request(path, init);
  expect(response.status, `${init.method ?? 'GET'} ${path}`).toBe(expectedStatus);
  return await response.json() as any;
}

async function signUp(app: ReturnType<typeof createApp>, name: string, email = `${crypto.randomUUID()}@example.test`) {
  const response = await app.request('/api/auth/sign-up/email', {
    method: 'POST', headers: jsonHeaders,
    body: JSON.stringify({ name, email, password: 'Local-phase4-accounting-123!' }),
  });
  expect(response.status).toBeLessThan(400);
  return { cookie: cookie(response), email };
}

async function uploadFixture(app: ReturnType<typeof createApp>, authCookie: string, filename: string) {
  const bytes = await readFile(resolve(fixtureDir, filename));
  const result = await requestJson(app, '/api/invoice-imports', {
    method: 'POST', headers: { ...jsonHeaders, Cookie: authCookie },
    body: JSON.stringify({ files: [{ filename, contentType: 'application/pdf', contentBase64: bytes.toString('base64') }] }),
  }, 201);
  return result.documents[0].id as string;
}

async function extract(app: ReturnType<typeof createApp>, authCookie: string, id: string) {
  return requestJson(app, `/api/invoice-imports/${id}/extract`, { method: 'POST', headers: { Cookie: authCookie } }, 200);
}

async function patchDraft(app: ReturnType<typeof createApp>, authCookie: string, id: string, body: Record<string, unknown>) {
  return requestJson(app, `/api/invoice-imports/${id}/draft`, {
    method: 'PATCH', headers: { ...jsonHeaders, Cookie: authCookie }, body: JSON.stringify(body),
  }, 200);
}

async function commit(app: ReturnType<typeof createApp>, authCookie: string, id: string, acknowledgeDuplicates = false) {
  return requestJson(app, `/api/invoice-imports/${id}/commit`, {
    method: 'POST', headers: { ...jsonHeaders, Cookie: authCookie }, body: JSON.stringify({ acknowledgeDuplicates }),
  }, 201);
}

async function ledger(app: ReturnType<typeof createApp>, authCookie: string) {
  return requestJson(app, ledgerPath, { headers: { Cookie: authCookie } }, 200);
}

function linesFor(result: any, referenceType: string, referenceId: string) {
  return result.lines
    .filter((line: any) => line.referenceType === referenceType && line.referenceId === referenceId)
    .map((line: any) => ({ accountNumber: line.accountNumber, debit: line.debit, credit: line.credit }));
}

describe('invoice import accounting and GST end-to-end', () => {
  it('keeps imports as drafts, posts through normal lifecycle routes, reports GST, requires direction, records payment, and enforces read-only access', async () => {
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const app = createApp({
          auth: createAuth(db), db, fileStorage: createMemoryFileStorage(),
          invoiceMailer: { sendInvoice: async () => undefined },
        });
        const owner = await signUp(app, 'Crystal Touch Owner');
        const ownerHeaders = { ...jsonHeaders, Cookie: owner.cookie };
        await requestJson(app, '/api/business-profile', {
          method: 'PUT', headers: ownerHeaders,
          body: JSON.stringify({
            name: 'Crystal Touch Cleaning', email: 'owner@crystal.example.test', country: 'NZ',
            defaultTaxRate: '15', gstRegistrationStatus: 'registered', taxId: '111-222-333',
          }),
        }, 200);
        const me = await requestJson(app, '/api/me', { headers: ownerHeaders }, 200);
        const customer = await requestJson(app, '/api/customers', {
          method: 'POST', headers: ownerHeaders,
          body: JSON.stringify({ name: 'Cleancorp Ltd', email: 'accounts@cleancorp.example.test', country: 'NZ' }),
        }, 201);
        const expenseAccount = await requestJson(app, '/api/accounts', {
          method: 'POST', headers: ownerHeaders,
          body: JSON.stringify({ name: 'Operating Expenses', type: 'expense', accountNumber: '5000', accountClass: 'expense' }),
        }, 201);
        const vendor = await requestJson(app, '/api/vendors', {
          method: 'POST', headers: ownerHeaders,
          body: JSON.stringify({ name: 'Sparkle Supplies Ltd', email: 'accounts@sparkle.example.test', taxId: '987-654-321' }),
        }, 201);

        // 1. The extractor's SALES suggestion is not a direction decision. Commit creates only a draft.
        const salesDocumentId = await uploadFixture(app, owner.cookie, 'cleancorp-buyer-created-tax-invoice.pdf');
        const salesExtraction = await extract(app, owner.cookie, salesDocumentId);
        expect(salesExtraction).toMatchObject({
          provider: 'mock', mock: true, direction: null,
          draft: { suggestedDirection: 'SALES', net: '200.00', gst: '30.00', total: '230.00' },
        });
        const missingDirection = await app.request(`/api/invoice-imports/${salesDocumentId}/commit`, {
          method: 'POST', headers: ownerHeaders, body: '{}',
        });
        expect(missingDirection.status).toBe(422);
        expect(await missingDirection.json()).toMatchObject({ error: { code: 'DIRECTION_REQUIRED' } });
        await patchDraft(app, owner.cookie, salesDocumentId, { direction: 'SALES', thirdPartyIssued: true, contactId: customer.id });
        const salesCommit = await commit(app, owner.cookie, salesDocumentId);
        const draftInvoice = await requestJson(app, `/api/invoices/${salesCommit.recordId}`, { headers: ownerHeaders }, 200);
        expect(draftInvoice).toMatchObject({
          status: 'draft', paymentStatus: 'unpaid', subtotal: '200.00', taxAmount: '30.00', total: '230.00',
          totalPaid: '0.00', balanceDue: '230.00', thirdPartyIssued: true,
        });
        expect(linesFor(await ledger(app, owner.cookie), 'invoice', draftInvoice.id)).toEqual([]);

        const issuedInvoice = await requestJson(app, `/api/invoices/${draftInvoice.id}/send`, {
          method: 'POST', headers: ownerHeaders, body: '{}',
        }, 200);
        expect(issuedInvoice.status).toBe('sent');
        expect(linesFor(await ledger(app, owner.cookie), 'invoice', draftInvoice.id)).toEqual([
          { accountNumber: '1200', debit: '230.00', credit: '0.00' },
          { accountNumber: '4000', debit: '0.00', credit: '200.00' },
          { accountNumber: '2200', debit: '0.00', credit: '30.00' },
        ]);

        // 2. Supplier import stays draft and unposted. Classification uses the normal bill edit route before receive.
        const purchaseDocumentId = await uploadFixture(app, owner.cookie, 'sparkle-supplies-bill.pdf');
        const purchaseExtraction = await extract(app, owner.cookie, purchaseDocumentId);
        expect(purchaseExtraction).toMatchObject({
          direction: null, draft: { suggestedDirection: 'PURCHASE', net: '100.00', gst: '15.00', total: '115.00' },
        });
        await patchDraft(app, owner.cookie, purchaseDocumentId, { direction: 'PURCHASE', thirdPartyIssued: false, contactId: vendor.id });
        const purchaseCommit = await commit(app, owner.cookie, purchaseDocumentId);
        const draftBill = await requestJson(app, `/api/bills/${purchaseCommit.recordId}`, { headers: ownerHeaders }, 200);
        expect(draftBill).toMatchObject({ lifecycleStatus: 'draft', paymentStatus: 'unpaid', subtotal: '100.00', taxAmount: '15.00', total: '115.00' });
        expect(linesFor(await ledger(app, owner.cookie), 'bill', draftBill.id)).toEqual([]);
        const classifiedBill = await requestJson(app, `/api/bills/${draftBill.id}`, {
          method: 'PATCH', headers: ownerHeaders,
          body: JSON.stringify({ lines: draftBill.lines.map((line: any) => ({
            description: line.description, quantity: line.quantity, unitPrice: line.unitPrice,
            taxRate: line.taxRate, accountId: expenseAccount.id,
          })) }),
        }, 200);
        expect(classifiedBill.lines[0].accountId).toBe(expenseAccount.id);
        const receivedBill = await requestJson(app, `/api/bills/${draftBill.id}/receive`, {
          method: 'POST', headers: ownerHeaders, body: '{}',
        }, 200);
        expect(receivedBill.lifecycleStatus).toBe('received');
        expect(linesFor(await ledger(app, owner.cookie), 'bill', draftBill.id)).toEqual([
          { accountNumber: '5000', debit: '100.00', credit: '0.00' },
          { accountNumber: '2150', debit: '15.00', credit: '0.00' },
          { accountNumber: '2100', debit: '0.00', credit: '115.00' },
        ]);

        // 3-4. GST and trial balance both come from the real financial report route.
        const report = await requestJson(app, reportPath, { headers: { Cookie: owner.cookie } }, 200);
        expect(report.taxSummary).toMatchObject({
          basis: 'invoice', outputGst: '30.00', inputGst: '15.00', netGst: '15.00',
          collected: '30.00', paid: '15.00', netPayable: '15.00', position: 'payable',
        });
        expect(report.trialBalance).toMatchObject({ totalDebits: '345.00', totalCredits: '345.00', balanced: true });

        // 5. A SALES suggestion can become PURCHASE only after an explicit user PATCH; commit never consumes the suggestion.
        const flippedDocumentId = await uploadFixture(app, owner.cookie, 'cleancorp-buyer-created-tax-invoice.pdf');
        const flippedExtraction = await extract(app, owner.cookie, flippedDocumentId);
        expect(flippedExtraction).toMatchObject({ direction: null, draft: { suggestedDirection: 'SALES' } });
        const unreviewedFlip = await app.request(`/api/invoice-imports/${flippedDocumentId}/commit`, {
          method: 'POST', headers: ownerHeaders, body: JSON.stringify({ acknowledgeDuplicates: true }),
        });
        expect(unreviewedFlip.status).toBe(422);
        expect(await unreviewedFlip.json()).toMatchObject({ error: { code: 'DIRECTION_REQUIRED' } });
        const explicitFlip = await patchDraft(app, owner.cookie, flippedDocumentId, { direction: 'PURCHASE', contactId: vendor.id });
        expect(explicitFlip).toMatchObject({ direction: 'PURCHASE', draft: { suggestedDirection: 'SALES' } });
        const flippedCommit = await commit(app, owner.cookie, flippedDocumentId, true);
        expect(flippedCommit.recordType).toBe('bill');

        // 6. Review/commit has no paid field: only the payments route settles the imported invoice.
        const payment = await requestJson(app, '/api/payments', {
          method: 'POST', headers: { ...ownerHeaders, 'Idempotency-Key': crypto.randomUUID() },
          body: JSON.stringify({
            invoiceId: draftInvoice.id, amount: '230.00', paymentDate: '2026-10-25',
            paymentMethod: 'bank_transfer', referenceNumber: 'PHASE4-DEMO-PAYMENT',
          }),
        }, 201);
        const paidInvoice = await requestJson(app, `/api/invoices/${draftInvoice.id}`, { headers: ownerHeaders }, 200);
        expect(paidInvoice).toMatchObject({ status: 'paid', paymentStatus: 'paid', totalPaid: '230.00', balanceDue: '0.00' });
        expect(linesFor(await ledger(app, owner.cookie), 'invoice_payment', payment.id)).toEqual([
          { accountNumber: '1110', debit: '230.00', credit: '0.00' },
          { accountNumber: '1200', debit: '0.00', credit: '230.00' },
        ]);

        // 7. A genuine read-only membership is denied before import or lifecycle business validation runs.
        const readOnlyEmail = `${crypto.randomUUID()}@example.test`;
        const invitation = await requestJson(app, `/api/organisations/${me.organisation.id}/invitations`, {
          method: 'POST', headers: ownerHeaders, body: JSON.stringify({ email: readOnlyEmail, role: 'read_only' }),
        }, 201);
        const readOnly = await signUp(app, 'Read Only Import Reviewer', readOnlyEmail);
        const readOnlyHeaders = { ...jsonHeaders, Cookie: readOnly.cookie };
        await requestJson(app, '/api/invitations/accept', {
          method: 'POST', headers: readOnlyHeaders, body: JSON.stringify({ token: invitation.acceptToken }),
        }, 200);
        const deniedUploadBytes = await readFile(resolve(fixtureDir, 'sparkle-supplies-bill.pdf'));
        const deniedRequests: Array<[string, RequestInit]> = [
          ['/api/invoice-imports', { method: 'POST', headers: readOnlyHeaders, body: JSON.stringify({ files: [{ filename: 'denied.pdf', contentType: 'application/pdf', contentBase64: deniedUploadBytes.toString('base64') }] }) }],
          [`/api/invoice-imports/${flippedDocumentId}/extract`, { method: 'POST', headers: readOnlyHeaders }],
          [`/api/invoice-imports/${flippedDocumentId}/commit`, { method: 'POST', headers: readOnlyHeaders, body: '{}' }],
          [`/api/invoices/${draftInvoice.id}/send`, { method: 'POST', headers: readOnlyHeaders, body: '{}' }],
          [`/api/bills/${draftBill.id}/receive`, { method: 'POST', headers: readOnlyHeaders, body: '{}' }],
        ];
        for (const [path, init] of deniedRequests) {
          expect((await app.request(path, init)).status, `${init.method} ${path}`).toBe(403);
        }

        const finalReport = await requestJson(app, reportPath, { headers: { Cookie: owner.cookie } }, 200);
        expect(finalReport.trialBalance.balanced).toBe(true);
        expect(finalReport.trialBalance.totalDebits).toBe(finalReport.trialBalance.totalCredits);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });
});
