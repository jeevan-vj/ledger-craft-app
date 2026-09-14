import { describe, expect, it } from 'vitest';
import { createUnavailableInvoiceMailer } from './mailer';

describe('unavailable invoice mailer', () => {
  it('rejects sending and reminders instead of marking email as queued', async () => {
    const mailer = createUnavailableInvoiceMailer();
    const mail = { invoiceId: 'invoice', invoiceNumber: 'INV-1', to: ['test@example.com'] };
    await expect(mailer.sendInvoice(mail)).rejects.toMatchObject({ status: 503, cause: { code: 'EMAIL_UNAVAILABLE' } });
    await expect(mailer.sendReminder!(mail)).rejects.toMatchObject({ status: 503, cause: { code: 'EMAIL_UNAVAILABLE' } });
  });
});
