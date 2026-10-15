import { describe, expect, it, vi } from 'vitest';
import { createResendInvoiceMailer } from './resend';

describe('resend invoice mailer', () => {
  it('posts invoice mail to Resend', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    const mailer = createResendInvoiceMailer({
      apiKey: 're_test',
      from: 'LedgerCraft <noreply@example.com>',
      fetchImpl: fetchImpl as typeof fetch,
    });
    await mailer.sendInvoice({
      invoiceId: '11111111-1111-1111-1111-111111111111',
      invoiceNumber: 'INV-2026-0001',
      to: ['hello@nhcafe.nz'],
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_test');
    const body = JSON.parse(String(init.body)) as { to: string[]; subject: string };
    expect(body.to).toEqual(['hello@nhcafe.nz']);
    expect(body.subject).toContain('INV-2026-0001');
  });
});
