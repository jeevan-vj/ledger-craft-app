// Browser-compatible email service that calls a backend API
export interface SendInvoiceEmailParams {
  to: string;
  invoiceNumber: string;
  businessName: string;
  customerName: string;
  total: number;
  currency: string;
  invoiceHtml: string;
  pdfBuffer?: ArrayBuffer;
}

export const emailService = {
  async sendInvoiceEmail(_params: SendInvoiceEmailParams): Promise<{ success: boolean; messageId?: string; error?: string }> {
    return {
      success: false,
      error: 'Invoice email is sent through /api/invoices/:id/send',
    };
  },

  async validateEmail(email: string): Promise<boolean> {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
};