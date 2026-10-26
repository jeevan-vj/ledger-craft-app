import { describe, expect, it, vi } from 'vitest';
import { createInvoiceMailerFromEnv, createResendInvoiceMailer } from './resend';

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
      amountDue: '1150.00',
      dueDate: '2026-11-20',
      businessName: 'Crystal Touch Cleaning',
      publicUrl: 'https://easybiz.example/shared/invoice/token',
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_test');
    const body = JSON.parse(String(init.body)) as { to: string[]; subject: string; from: string; text: string; html: string };
    expect(body.to).toEqual(['hello@nhcafe.nz']);
    expect(body.subject).toContain('INV-2026-0001');
    expect(body.from).toBe('LedgerCraft <noreply@example.com>');
    expect(body.text).toContain('NZD 1,150.00');
    expect(body.text).toContain('20 November 2026');
    expect(body.text).toContain('Crystal Touch Cleaning');
    expect(body.text).toContain('https://easybiz.example/shared/invoice/token');
    expect(body.html).not.toContain('11111111-1111-1111-1111-111111111111');
    expect(body.html).not.toContain('re_test');
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe('invoice/11111111-1111-1111-1111-111111111111');
  });

  it.each([
    [{}, 'unavailable'],
    [{ RESEND_API_KEY: 're_test' }, 'unavailable'],
    [{ RESEND_FROM: 'EasyBizInvoice <invoices@jnok.co.nz>' }, 'unavailable'],
    [{ RESEND_API_KEY: 're_test', RESEND_FROM: 'EasyBizInvoice <invoices@jnok.co.nz>' }, 'available'],
  ])('selects the mailer only when both settings are non-empty', (env, expected) => {
    expect(createInvoiceMailerFromEnv(env).availability).toBe(expected);
  });
});
