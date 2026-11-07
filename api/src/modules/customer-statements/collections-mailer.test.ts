import { describe, it, expect, vi } from 'vitest';
import { createResendInvoiceMailer } from '../invoices/resend';
describe('collection delivery transport', () => {
    it('keeps scheduled step delivery identities distinct and escapes reviewed message text', async () => {
        const calls: Array<RequestInit> = [];
        const fetchImpl = vi.fn(async (_url: unknown, options?: RequestInit) => { calls.push(options!); return new Response('{"id":"accepted"}', { status: 200 }); });
        const mailer = createResendInvoiceMailer({ apiKey: 're_test', from: 'Test <test@example.test>', fetchImpl: fetchImpl as typeof fetch });
        for (const step of ['due', 'week'])
            await mailer.sendReminder!({ invoiceId: 'invoice-id', invoiceNumber: 'INV-1', to: ['buyer@example.test'], deliveryKey: `scheduled/org/invoice/${step}`, message: 'Hello <buyer> & team', amountDue: '1000.00' });
        expect(calls.map(v => (v.headers as Record<string, string>)['Idempotency-Key'])).toEqual(['scheduled/org/invoice/due', 'scheduled/org/invoice/week']);
        expect(JSON.parse(String(calls[0]?.body)).html).toContain('&lt;buyer&gt; &amp; team');
        await mailer.sendStatement!({ invoiceId: 'customer-id', invoiceNumber: '2026-10-01 to 2026-10-31', to: ['buyer@example.test'], deliveryKey: 'statement-stable', publicUrl: 'https://example.test/shared/statement/synthetic', amountDue: '600.00' });
        const value = JSON.parse(String(calls[2]?.body));
        expect(value.text).toContain('Customer statement');
        expect(value.text).toContain('NZD 600.00');
        expect(value.text).toContain('/shared/statement/');
    });
});
