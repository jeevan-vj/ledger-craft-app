import { apiError } from '../../http-error';

export type InvoiceMail = {
  invoiceId: string;
  invoiceNumber: string;
  to: string[];
  subject?: string;
  html?: string;
  amountDue?: string;
  dueDate?: string | null;
  businessName?: string;
  publicUrl?: string;
  kind?: 'invoice' | 'quote' | 'reminder';
};

export type InvoiceMailer = {
  readonly availability?: 'available' | 'unavailable';
  sendInvoice(mail: InvoiceMail): Promise<void>;
  sendReminder?(mail: InvoiceMail): Promise<void>;
  /** Optional until a provider exists. Production leaves this unset and quote send returns 503. */
  sendQuote?(mail: InvoiceMail): Promise<void>;
};

export function createLoggingInvoiceMailer(): InvoiceMailer {
  return {
    availability: 'available',
    async sendInvoice(mail) {
      console.info(JSON.stringify({ msg: 'invoice_email_queued', ...mail }));
    },
    async sendReminder(mail) {
      console.info(JSON.stringify({ msg: 'invoice_reminder_queued', ...mail }));
    },
  };
}

export function createUnavailableInvoiceMailer(): InvoiceMailer {
  const unavailable = async () => {
    throw apiError(503, 'EMAIL_UNAVAILABLE', 'Email delivery is unavailable. Download or share the invoice instead.');
  };
  return {
    availability: 'unavailable',
    sendInvoice: unavailable,
    sendReminder: unavailable,
    sendQuote: async () => {
      throw apiError(503, 'EMAIL_UNAVAILABLE', 'Email delivery is unavailable. Share the quote link instead.');
    },
  };
}
