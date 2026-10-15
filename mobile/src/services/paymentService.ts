import { receiptsApi, receiptsApiEnabled } from '@/features/receipts/api/receiptsApi';
import { supabase } from './supabaseClient';
import type { Payment, Receipt, CreatePaymentRequest } from '@/types/payment';

// Map Supabase payment to Payment type
const mapSupabasePaymentToPayment = (payment: any): Payment => ({
  id: payment.id,
  invoiceId: payment.invoice_id,
  userId: payment.user_id,
  paymentMethod: payment.payment_method,
  amount: payment.amount,
  paymentDate: payment.payment_date,
  referenceNumber: payment.reference_number,
  notes: payment.notes,
  status: payment.status,
  createdAt: payment.created_at,
  updatedAt: payment.updated_at,
});

// Map Supabase receipt to Receipt type
const mapSupabaseReceiptToReceipt = (receipt: any): Receipt => ({
  id: receipt.id,
  paymentId: receipt.payment_id,
  receiptNumber: receipt.receipt_number,
  userId: receipt.user_id,
  generatedAt: receipt.generated_at,
  emailSentAt: receipt.email_sent_at,
  isEmailed: receipt.is_emailed,
  receiptData: receipt.receipt_data,
  createdAt: receipt.created_at,
});

export class PaymentService {
  // Create a new payment and automatically update invoice status
  async createPayment(paymentData: CreatePaymentRequest): Promise<Payment> {
    if (paymentsApiEnabled()) {
      const payment = await paymentsApi.create({
        invoiceId: paymentData.invoiceId,
        paymentMethod: paymentData.paymentMethod,
        amount: String(paymentData.amount),
        paymentDate: paymentData.paymentDate,
        referenceNumber: paymentData.referenceNumber ?? null,
        notes: paymentData.notes ?? null,
      });
      if (receiptsApiEnabled() && paymentData.generateReceipt !== false) {
        await receiptsApi.create(payment.id);
      }
      return payment;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    try {
      // Start by creating the payment
      const { data: payment, error: paymentError } = await supabase
        .from('payments')
        .insert({
          invoice_id: paymentData.invoiceId,
          user_id: user.id,
          payment_method: paymentData.paymentMethod,
          amount: paymentData.amount,
          payment_date: paymentData.paymentDate,
          reference_number: paymentData.referenceNumber,
          notes: paymentData.notes,
          status: 'completed',
        })
        .select()
        .single();

      if (paymentError) throw paymentError;

      // Update invoice payment status and amounts
      await this.updateInvoicePaymentStatus(paymentData.invoiceId);

      // Generate receipt if requested
      if (paymentData.generateReceipt) {
        await this.generateReceipt(payment.id);
      }

      return mapSupabasePaymentToPayment(payment);
    } catch (error) {
      console.error('Error creating payment:', error);
      throw error;
    }
  }

  // Get all payments for a user
  async getPayments(): Promise<Payment[]> {
    if (paymentsApiEnabled()) {
      return paymentsApi.list();
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { data: payments, error } = await supabase
      .from('payments')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return payments?.map(mapSupabasePaymentToPayment) || [];
  }

  // Get payments for a specific invoice
  async getPaymentsByInvoice(invoiceId: string): Promise<Payment[]> {
    if (paymentsApiEnabled()) {
      return paymentsApi.list(invoiceId);
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { data: payments, error } = await supabase
      .from('payments')
      .select('*')
      .eq('invoice_id', invoiceId)
      .eq('user_id', user.id)
      .order('payment_date', { ascending: false });

    if (error) throw error;
    return payments?.map(mapSupabasePaymentToPayment) || [];
  }

  // Get a single payment by ID
  async getPayment(paymentId: string): Promise<Payment | null> {
    if (paymentsApiEnabled()) {
      try {
        return await paymentsApi.get(paymentId);
      } catch (error) {
        if (error instanceof Error && 'status' in error && (error as { status: number }).status === 404) {
          return null;
        }
        throw error;
      }
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { data: payment, error } = await supabase
      .from('payments')
      .select('*')
      .eq('id', paymentId)
      .eq('user_id', user.id)
      .single();

    if (error) throw error;
    return payment ? mapSupabasePaymentToPayment(payment) : null;
  }

  // Update invoice payment status based on payments
  private async updateInvoicePaymentStatus(invoiceId: string): Promise<void> {
    try {
      // Get the invoice
      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .select('total, status')
        .eq('id', invoiceId)
        .single();

      if (invoiceError) throw invoiceError;

      // Get all completed payments for this invoice
      const { data: payments, error: paymentsError } = await supabase
        .from('payments')
        .select('amount')
        .eq('invoice_id', invoiceId)
        .eq('status', 'completed');

      if (paymentsError) throw paymentsError;

      // Calculate total paid
      const totalPaid = payments?.reduce((sum, p) => sum + p.amount, 0) || 0;
      const balanceDue = invoice.total - totalPaid;

      // Determine payment status
      let paymentStatus: string;
      let invoiceStatus: string = invoice.status;

      if (totalPaid === 0) {
        paymentStatus = 'unpaid';
      } else if (totalPaid >= invoice.total) {
        paymentStatus = 'paid';
        invoiceStatus = 'paid';
      } else {
        paymentStatus = 'partially_paid';
      }

      // Update the invoice
      const { error: updateError } = await supabase
        .from('invoices')
        .update({
          payment_status: paymentStatus,
          total_paid: totalPaid,
          balance_due: balanceDue,
          status: invoiceStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', invoiceId);

      if (updateError) throw updateError;
    } catch (error) {
      console.error('Error updating invoice payment status:', error);
      throw error;
    }
  }

  // Generate receipt for a payment
  private async generateReceipt(paymentId: string): Promise<Receipt> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    try {
      // Get payment details
      const { data: payment, error: paymentError } = await supabase
        .from('payments')
        .select('*')
        .eq('id', paymentId)
        .single();

      if (paymentError) throw paymentError;

      // Generate receipt number (simplified version)
      const receiptNumber = `REC-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

      // Create receipt
      const { data: receipt, error: receiptError } = await supabase
        .from('receipts')
        .insert({
          payment_id: paymentId,
          receipt_number: receiptNumber,
          user_id: user.id,
          generated_at: new Date().toISOString(),
          is_emailed: false,
          receipt_data: {
            paymentId,
            amount: payment.amount,
            paymentMethod: payment.payment_method,
            paymentDate: payment.payment_date,
          },
        })
        .select()
        .single();

      if (receiptError) throw receiptError;

      return mapSupabaseReceiptToReceipt(receipt);
    } catch (error) {
      console.error('Error generating receipt:', error);
      throw error;
    }
  }

  // Get receipt for a payment
  async getReceiptByPayment(paymentId: string): Promise<Receipt | null> {
    if (receiptsApiEnabled()) {
      const receipts = await receiptsApi.list();
      return receipts.find((receipt) => receipt.paymentId === paymentId) ?? null;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { data: receipt, error } = await supabase
      .from('receipts')
      .select('*')
      .eq('payment_id', paymentId)
      .eq('user_id', user.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw error;
    }

    return receipt ? mapSupabaseReceiptToReceipt(receipt) : null;
  }
}

export const paymentService = new PaymentService();

