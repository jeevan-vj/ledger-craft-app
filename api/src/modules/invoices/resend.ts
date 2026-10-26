import { apiError } from '../../http-error';
import { createUnavailableInvoiceMailer, type InvoiceMail, type InvoiceMailer } from './mailer';

type ResendOptions = {
  apiKey?: string;
  from?: string;
  fetchImpl?: typeof fetch;
};

type ResendEnv = { RESEND_API_KEY?: string; RESEND_FROM?: string };

function presentMoney(value = '0'): string {
  const [wholeRaw, fractionRaw = ''] = value.split('.');
  const negative = wholeRaw.startsWith('-');
  const digits = negative ? wholeRaw.slice(1) : wholeRaw;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `NZD ${negative ? '-' : ''}${grouped}.${(fractionRaw + '00').slice(0, 2)}`;
}

function presentDate(value?: string | null): string | null {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat('en-NZ', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Pacific/Auckland' })
    .format(new Date(Date.UTC(year, month - 1, day)));
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
}

function content(mail: InvoiceMail) {
  const label = mail.kind === 'quote' ? 'Quote' : mail.kind === 'reminder' ? 'Payment reminder for invoice' : 'Invoice';
  const amount = presentMoney(mail.amountDue);
  const date = presentDate(mail.dueDate);
  const lines = [
    `${label} ${mail.invoiceNumber} from ${mail.businessName ?? 'EasyBizInvoice'}`,
    `Amount due: ${amount}`,
    date ? `${mail.kind === 'quote' ? 'Valid until' : 'Due date'}: ${date}` : null,
    mail.publicUrl ? `View online: ${mail.publicUrl}` : null,
  ].filter((line): line is string => Boolean(line));
  return { text: lines.join('\n'), html: `<p>${lines.map(escapeHtml).join('<br>')}</p>` };
}

export function createResendInvoiceMailer(opts: ResendOptions = {}): InvoiceMailer {
  const apiKey = opts.apiKey ?? process.env.RESEND_API_KEY;
  const from = opts.from ?? process.env.RESEND_FROM;
  const fetchImpl = opts.fetchImpl ?? fetch;

  async function post(mail: InvoiceMail, fallbackSubject: string) {
    if (!apiKey?.trim() || !from?.trim() || apiKey === 'your_resend_api_key') {
      throw apiError(503, 'EMAIL_UNAVAILABLE', 'Email is not configured');
    }
    const bodyContent = content(mail);
    const response = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `${mail.kind ?? 'invoice'}/${mail.invoiceId}`,
      },
      body: JSON.stringify({
        from,
        to: mail.to,
        subject: mail.subject ?? fallbackSubject,
        text: bodyContent.text,
        html: bodyContent.html,
      }),
    });
    if (!response.ok) {
      throw apiError(502, 'email_failed', 'Failed to send email');
    }
  }

  return {
    availability: 'available',
    async sendInvoice(mail: InvoiceMail) {
      await post(mail, `Invoice ${mail.invoiceNumber}`);
    },
    async sendReminder(mail: InvoiceMail) {
      await post({ ...mail, kind: 'reminder' }, `Payment reminder for invoice ${mail.invoiceNumber}`);
    },
    async sendQuote(mail: InvoiceMail) {
      await post({ ...mail, kind: 'quote' }, `Quote ${mail.invoiceNumber}`);
    },
  };
}

export function createInvoiceMailerFromEnv(env: ResendEnv, options: { fetchImpl?: typeof fetch } = {}): InvoiceMailer {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.RESEND_FROM?.trim();
  if (!apiKey || !from) return createUnavailableInvoiceMailer();
  return createResendInvoiceMailer({ apiKey, from, fetchImpl: options.fetchImpl });
}

export function createRuntimeInvoiceMailer(): InvoiceMailer {
  return createInvoiceMailerFromEnv({
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM: process.env.RESEND_FROM,
  });
}
