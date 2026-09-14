import { apiError } from '../../http-error';
import { createUnavailableInvoiceMailer, type InvoiceMail, type InvoiceMailer } from './mailer';

type ResendOptions = {
  apiKey?: string;
  from?: string;
  fetchImpl?: typeof fetch;
};

export function createResendInvoiceMailer(opts: ResendOptions = {}): InvoiceMailer {
  const apiKey = opts.apiKey ?? process.env.RESEND_API_KEY;
  const from = opts.from ?? process.env.RESEND_FROM ?? 'LedgerCraft <noreply@easybizinvoice.com>';
  const fetchImpl = opts.fetchImpl ?? fetch;

  async function post(mail: InvoiceMail, fallbackSubject: string, fallbackHtml: string) {
    if (!apiKey || apiKey === 'your_resend_api_key') {
      throw apiError(503, 'EMAIL_UNAVAILABLE', 'Email is not configured');
    }
    const response = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: mail.to,
        subject: mail.subject ?? fallbackSubject,
        html: mail.html ?? fallbackHtml,
      }),
    });
    if (!response.ok) {
      throw apiError(502, 'EMAIL_ERROR', 'Failed to send invoice email');
    }
  }

  return {
    async sendInvoice(mail: InvoiceMail) {
      await post(mail, `Invoice ${mail.invoiceNumber}`, `<p>Invoice ${mail.invoiceNumber} is ready.</p>`);
    },
    async sendReminder(mail: InvoiceMail) {
      await post(
        mail,
        `Payment reminder for invoice ${mail.invoiceNumber}`,
        `<p>This is a reminder for invoice ${mail.invoiceNumber}.</p>`,
      );
    },
  };
}

export function createRuntimeInvoiceMailer(): InvoiceMailer {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === 'your_resend_api_key') {
    return createUnavailableInvoiceMailer();
  }
  return createResendInvoiceMailer({ apiKey });
}
