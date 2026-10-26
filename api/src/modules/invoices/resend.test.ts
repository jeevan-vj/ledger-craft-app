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

  it.each([
    ['sendReminder', 'reminder', 'Payment reminder for invoice INV-9'],
    ['sendQuote', 'quote', 'Quote QUO-9'],
  ] as const)('sends canonical %s content through the same transport', async (method, keyPrefix, subject) => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    const mailer = createResendInvoiceMailer({ apiKey: 're_secret', from: 'EasyBizInvoice <invoices@jnok.co.nz>', fetchImpl: fetchImpl as typeof fetch });
    await mailer[method]!({
      invoiceId: 'internal-id', invoiceNumber: keyPrefix === 'quote' ? 'QUO-9' : 'INV-9', to: ['buyer@example.test'],
      amountDue: '230.00', dueDate: '2026-11-20', businessName: 'Crystal & Touch', publicUrl: `https://easybiz.example/shared/${keyPrefix}/public-token`,
    });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as { subject: string; text: string; html: string };
    expect(body.subject).toBe(subject);
    expect(body.text).toContain('NZD 230.00');
    expect(body.text).toContain('public-token');
    expect(body.html).toContain('Crystal &amp; Touch');
    expect(body.html).not.toContain('internal-id');
    expect(body.html).not.toContain('re_secret');
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe(`${keyPrefix}/internal-id`);
  });

  it('maps a Resend rejection to email_failed without leaking provider content', async () => {
    const mailer = createResendInvoiceMailer({
      apiKey: 're_secret', from: 'EasyBizInvoice <invoices@jnok.co.nz>',
      fetchImpl: vi.fn(async () => new Response('provider detail', { status: 500 })) as typeof fetch,
    });
    await expect(mailer.sendInvoice({ invoiceId: 'id', invoiceNumber: 'INV-1', to: ['buyer@example.test'] }))
      .rejects.toMatchObject({ status: 502, message: 'Failed to send email' });
  });
});
