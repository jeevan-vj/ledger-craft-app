import { apiError } from '../../http-error';

export type InvoiceMail = {
  invoiceId: string;
  invoiceNumber: string;
  to: string[];
  subject?: string;
  html?: string;
  amountDue?: string;
  currency?: string;
  dueDate?: string | null;
  businessName?: string;
  publicUrl?: string;
  kind?: 'invoice' | 'quote' | 'reminder' | 'statement';
  deliveryKey?: string;
  message?: string;
};

export type InvoiceMailer = {
  readonly availability?: 'available' | 'unavailable';
  sendInvoice(mail: InvoiceMail): Promise<void>;
  sendReminder?(mail: InvoiceMail): Promise<void>;
  /** Optional provider methods fail closed when the transport lacks support. */
  sendQuote?(mail: InvoiceMail): Promise<void>;
  sendStatement?(mail: InvoiceMail): Promise<void>;
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
    sendStatement: unavailable,
    sendQuote: async () => {
      throw apiError(503, 'EMAIL_UNAVAILABLE', 'Email delivery is unavailable. Share the quote link instead.');
    },
  };
}
