import { apiError } from '../../http-error';

export type InvoiceMail = {
  invoiceId: string;
  invoiceNumber: string;
  to: string[];
  subject?: string;
  html?: string;
};

export type InvoiceMailer = {
  sendInvoice(mail: InvoiceMail): Promise<void>;
  sendReminder?(mail: InvoiceMail): Promise<void>;
};

export function createLoggingInvoiceMailer(): InvoiceMailer {
  return {
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
  return { sendInvoice: unavailable, sendReminder: unavailable };
}
