import { supabase } from '@/integrations/supabase/client';
import { Payment, Receipt, CreatePaymentRequest, EnhancedInvoice } from '@/types/payment';
import { Invoice } from '@/types';
import { invoiceService } from './supabaseService';
import { accountingJournalService } from './accountingJournalService';
import { paymentsApi, paymentsApiEnabled, toCreatePaymentRequest } from '@/features/payments/api/paymentsApi';
import { receiptsApi, receiptsApiEnabled } from '@/features/receipts/api/receiptsApi';
import { invoicesApi, invoicesApiEnabled } from '@/features/invoices/api/invoicesApi';
import type { ReversePaymentRequest } from '@ledgercraft/contracts';

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
  updatedAt: payment.updated_at
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
  createdAt: receipt.created_at
});

export class PaymentService {
  // Create a new payment and automatically update invoice status
  async createPayment(paymentData: CreatePaymentRequest): Promise<Payment> {
    if (!Number.isFinite(paymentData.amount) || paymentData.amount <= 0) {
      throw new Error('Payment amount must be greater than zero');
    }
    if (paymentsApiEnabled()) {
      const payment = await paymentsApi.create(toCreatePaymentRequest(paymentData));
      if (receiptsApiEnabled() && paymentData.generateReceipt !== false) {
        await receiptsApi.create({ paymentId: payment.id });
      }
      return payment;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    try {
      // Start a transaction by creating the payment first
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
          status: 'completed'
        })
        .select()
        .single();

      if (paymentError) throw paymentError;

      // Update invoice payment status and amounts
      await this.updateInvoicePaymentStatus(paymentData.invoiceId);

      // Create journal entry for accounting
      try {
        await accountingJournalService.createPaymentJournalEntry(
          user.id,
          payment.id,
          paymentData.invoiceId,
          {
            amount: paymentData.amount,
            paymentDate: paymentData.paymentDate,
            paymentMethod: paymentData.paymentMethod
          }
        );
      } catch (journalError) {
        // Log error but don't fail payment creation
        // The payment exists, journal entry can be created manually if needed
        console.error('Error creating journal entry for payment:', journalError);
      }

      // Generate receipt
      await this.generateReceipt(payment.id);

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
      .select(`
        *,
        invoices!inner(
          invoice_number,
          customer_id,
          customers(name, email)
        )
      `)
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
      .order('created_at', { ascending: false });

    if (error) throw error;
    return payments?.map(mapSupabasePaymentToPayment) || [];
  }

  // Get a specific payment
  async getPayment(paymentId: string): Promise<Payment | null> {
    if (paymentsApiEnabled()) {
      return paymentsApi.get(paymentId);
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { data: payment, error } = await supabase
      .from('payments')
      .select('*')
      .eq('id', paymentId)
      .eq('user_id', user.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw error;
    }

    return payment ? mapSupabasePaymentToPayment(payment) : null;
  }

  async reversePayment(paymentId: string, input: ReversePaymentRequest): Promise<Payment> {
    if (!paymentsApiEnabled()) {
      throw new Error('Payment reversals require the LedgerCraft API');
    }
    return paymentsApi.reverse(paymentId, input);
  }

  // Update invoice payment status and amounts after payment
  private async updateInvoicePaymentStatus(invoiceId: string): Promise<void> {
    // Get current invoice
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('total')
      .eq('id', invoiceId)
      .single();

    if (invoiceError) throw invoiceError;

    // Calculate total payments for this invoice
    const { data: payments, error: paymentsError } = await supabase
      .from('payments')
      .select('amount')
      .eq('invoice_id', invoiceId)
      .eq('status', 'completed');

    if (paymentsError) throw paymentsError;

    const totalPaid = payments?.reduce((sum, payment) => sum + payment.amount, 0) || 0;
    const balanceDue = invoice.total - totalPaid;

    // Determine payment status
    let paymentStatus = 'unpaid';
    if (totalPaid >= invoice.total) {
      paymentStatus = 'paid';
    } else if (totalPaid > 0) {
      paymentStatus = 'partially_paid';
    }

    // Update invoice
    const { error: updateError } = await supabase
      .from('invoices')
      .update({
        total_paid: totalPaid,
        payment_status: paymentStatus,
        status: paymentStatus === 'paid' ? 'paid' : 'sent' // Update main status if paid
      })
      .eq('id', invoiceId);

    if (updateError) throw updateError;
  }

  // Generate receipt for a payment
  private async generateReceipt(paymentId: string): Promise<Receipt> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    // Get payment details with invoice and customer info
    const { data: paymentData, error: paymentError } = await supabase
      .from('payments')
      .select(`
        *,
        invoices!inner(
          *,
          customers!inner(*)
        )
      `)
      .eq('id', paymentId)
      .single();

    if (paymentError) throw paymentError;

    // Generate receipt number
    const receiptNumber = await this.generateReceiptNumber();

    // Prepare receipt data
    const receiptData = {
      payment: mapSupabasePaymentToPayment(paymentData),
      invoice: paymentData.invoices,
      customer: paymentData.invoices.customers,
      business: null, // Will be populated from business profile
      receiptNumber,
      paymentDate: paymentData.payment_date,
      amountPaid: paymentData.amount,
      paymentMethod: this.formatPaymentMethod(paymentData.payment_method),
      balanceAfterPayment: Math.max(0, paymentData.invoices.total - paymentData.invoices.total_paid)
    };

    // Create receipt record
    const { data: receipt, error: receiptError } = await supabase
      .from('receipts')
      .insert({
        payment_id: paymentId,
        receipt_number: receiptNumber,
        user_id: user.id,
        receipt_data: receiptData,
        is_emailed: false
      })
      .select()
      .single();

    if (receiptError) throw receiptError;

    return mapSupabaseReceiptToReceipt(receipt);
  }

  // Generate unique receipt number
  private async generateReceiptNumber(): Promise<string> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    
    // Calculate first day of next month for proper date range
    const nextMonth = new Date(year, now.getMonth() + 1, 1);
    const monthEnd = new Date(nextMonth.getTime() - 1);
    const monthEndStr = monthEnd.toISOString().split('T')[0]; // Format as YYYY-MM-DD
    
    // Get count of receipts for current month
    const { data: receipts, error } = await supabase
      .from('receipts')
      .select('id')
      .eq('user_id', user.id)
      .gte('created_at', `${year}-${month}-01`)
      .lt('created_at', nextMonth.toISOString().split('T')[0]); // Use first day of next month for exclusive range

    if (error) throw error;

    const receiptCount = (receipts?.length || 0) + 1;
    return `REC-${year}${month}-${String(receiptCount).padStart(4, '0')}`;
  }

  // Get all receipts for user
  async getReceipts(): Promise<Receipt[]> {
    if (receiptsApiEnabled()) {
      return receiptsApi.list();
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { data: receipts, error } = await supabase
      .from('receipts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return receipts?.map(mapSupabaseReceiptToReceipt) || [];
  }

  // Get receipt by ID
  async getReceipt(receiptId: string): Promise<Receipt | null> {
    if (receiptsApiEnabled()) {
      return receiptsApi.get(receiptId);
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { data: receipt, error } = await supabase
      .from('receipts')
      .select('*')
      .eq('id', receiptId)
      .eq('user_id', user.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return receipt ? mapSupabaseReceiptToReceipt(receipt) : null;
  }

  // Get receipt by payment ID
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
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return receipt ? mapSupabaseReceiptToReceipt(receipt) : null;
  }

  // Mark receipt as emailed
  async markReceiptAsEmailed(receiptId: string): Promise<void> {
    if (receiptsApiEnabled()) {
      throw new Error('Receipt email delivery is unavailable on the current free deployment');
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { error } = await supabase
      .from('receipts')
      .update({
        is_emailed: true,
        email_sent_at: new Date().toISOString()
      })
      .eq('id', receiptId)
      .eq('user_id', user.id);

    if (error) throw error;
  }

  // Get invoices with outstanding balances (for payment processing)
  async getInvoicesWithBalance(): Promise<EnhancedInvoice[]> {
    if (invoicesApiEnabled()) {
      const invoices = await invoicesApi.list();
      return invoices
        .filter((invoice) => invoice.status !== 'paid' && (invoice.balanceDue ?? invoice.total) > 0)
        .map((invoice) => ({
          ...invoice,
          paymentStatus: invoice.paymentStatus ?? 'unpaid',
          totalPaid: invoice.totalPaid ?? 0,
          balanceDue: invoice.balanceDue ?? invoice.total,
          taxInclusive: invoice.taxInclusive ?? false,
        }))
        .sort((left, right) => left.dueDate.localeCompare(right.dueDate));
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { data: invoices, error } = await supabase
      .from('invoices')
      .select(`
        *,
        customers!inner(*),
        line_items(*)
      `)
      .eq('user_id', user.id)
      .neq('status', 'cancelled')
      .order('due_date', { ascending: true });

    if (error) {
      console.error('Error fetching invoices with balance:', error);
      throw error;
    }

    console.log('Raw invoices from database:', invoices);

    // Map to EnhancedInvoice type with payment-specific fields
    const mappedInvoices: EnhancedInvoice[] = (invoices || []).map(invoice => {
      const totalPaid = invoice.total_paid || 0;
      const total = invoice.total || 0;
      const balanceDue = Math.max(0, total - totalPaid);
      
      console.log(`Invoice ${invoice.invoice_number}: total=${total}, totalPaid=${totalPaid}, balanceDue=${balanceDue}`);
      
      return {
        id: invoice.id,
        invoiceNumber: invoice.invoice_number || `INV-${invoice.id?.slice(-8) || 'UNKNOWN'}`,
        customerId: invoice.customer_id,
        customerName: invoice.customers?.name || '',
        customer: invoice.customers ? {
          id: invoice.customers.id || '',
          name: invoice.customers.name || 'Unknown Customer',
          email: invoice.customers.email || '',
          phone: invoice.customers.phone || '',
          address: invoice.customers.address || '',
          createdAt: invoice.customers.created_at || new Date().toISOString(),
          updatedAt: invoice.customers.updated_at || new Date().toISOString()
        } : {
          id: 'unknown',
          name: 'Unknown Customer',
          email: '',
          phone: '',
          address: '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        userId: invoice.user_id,
        issueDate: invoice.issue_date,
        dueDate: invoice.due_date,
        date: invoice.issue_date, // Add backward compatibility for date field
        status: invoice.status,
        paymentStatus: invoice.payment_status,
        subtotal: invoice.subtotal || 0,
        taxAmount: invoice.tax_amount || 0,
        total: total,
        totalPaid: totalPaid,
        balanceDue: balanceDue,
        currency: invoice.currency || '$', // Add currency field with default
        notes: invoice.notes,
        templateName: invoice.template_name,
        createdAt: invoice.created_at,
        updatedAt: invoice.updated_at,
        lineItems: (invoice.line_items || []).map((item: any) => ({
          id: item.id,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unit_price,
          total: item.total,
          taxAmount: item.tax_amount || 0
        })),
        // EnhancedInvoice specific fields
        taxInclusive: invoice.tax_inclusive || false,
        taxBreakdown: invoice.tax_amount ? {
          subtotal: invoice.subtotal || 0,
          taxAmount: invoice.tax_amount || 0,
          taxRate: 0.15, // Default rate
          taxName: 'Tax',
          taxInclusive: invoice.tax_inclusive || false,
          total: invoice.total
        } : undefined
      };
    });

    // Filter out invoices with no balance due and ensure they have required data
    const filteredInvoices = mappedInvoices.filter(invoice => {
      const hasBalance = invoice.balanceDue > 0;
      const hasValidData = invoice.id && invoice.total > 0;
      console.log(`Invoice ${invoice.invoiceNumber}: hasBalance=${hasBalance}, hasValidData=${hasValidData}`);
      return hasBalance && hasValidData;
    });
    
    console.log('Mapped invoices:', mappedInvoices);
    console.log('Filtered invoices with balance:', filteredInvoices);
    
    return filteredInvoices;
  }

  // Helper method to format payment method display
  private formatPaymentMethod(method: string): string {
    const methodMap: Record<string, string> = {
      'bank_transfer': 'Bank Transfer',
      'cash': 'Cash',
      'cheque': 'Cheque',
      'credit_card': 'Credit Card',
      'online': 'Online Payment',
      'eftpos': 'EFTPOS',
    };
    return methodMap[method] || method;
  }

  // Get payment statistics
  async getPaymentStats(): Promise<{
    totalPayments: number;
    totalAmount: number;
    pendingAmount: number;
    completedPayments: number;
  }> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { data: payments, error } = await supabase
      .from('payments')
      .select('amount, status')
      .eq('user_id', user.id);

    if (error) throw error;

    const totalPayments = payments?.length || 0;
    const totalAmount = payments?.reduce((sum, p) => sum + p.amount, 0) || 0;
    const completedPayments = payments?.filter(p => p.status === 'completed').length || 0;
    const pendingAmount = payments?.filter(p => p.status === 'pending').reduce((sum, p) => sum + p.amount, 0) || 0;

    return {
      totalPayments,
      totalAmount,
      pendingAmount,
      completedPayments
    };
  }
}

export const paymentService = new PaymentService();
