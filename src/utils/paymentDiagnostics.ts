import { supabase } from '@/integrations/supabase/client';

/**
 * Payment System Diagnostics
 * 
 * This utility helps diagnose issues with the payment system
 * and ensures all tables and data are properly connected.
 */

export const paymentDiagnostics = {
  
  async checkDatabaseTables() {
    console.log('🔍 Checking payment system database tables...');
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('❌ No authenticated user');
        return false;
      }

      console.log('✅ User authenticated:', user.id);

      // Check if payments table exists and has data
      const { data: payments, error: paymentsError } = await supabase
        .from('payments')
        .select('*')
        .limit(1);

      if (paymentsError) {
        console.error('❌ Payments table error:', paymentsError);
        return false;
      }

      console.log('✅ Payments table accessible');
      console.log('📊 Sample payments data:', payments?.length || 0, 'records');

      // Check if receipts table exists
      const { data: receipts, error: receiptsError } = await supabase
        .from('receipts')
        .select('*')
        .limit(1);

      if (receiptsError) {
        console.error('❌ Receipts table error:', receiptsError);
        return false;
      }

      console.log('✅ Receipts table accessible');
      console.log('📊 Sample receipts data:', receipts?.length || 0, 'records');

      // Check invoices table for payment status fields
      const { data: invoices, error: invoicesError } = await supabase
        .from('invoices')
        .select('id, payment_status, total_paid, balance_due')
        .eq('user_id', user.id)
        .limit(5);

      if (invoicesError) {
        console.error('❌ Invoices table error:', invoicesError);
        return false;
      }

      console.log('✅ Invoices table accessible');
      console.log('📊 Sample invoices with payment status:', invoices);

      return true;
    } catch (error) {
      console.error('❌ Database check failed:', error);
      return false;
    }
  },

  async checkPaymentDataFlow() {
    console.log('🔍 Checking payment data flow...');
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      // Get invoices that are marked as 'paid' but have no payment records
      const { data: paidInvoices } = await supabase
        .from('invoices')
        .select('id, invoice_number, status, payment_status, total, total_paid')
        .eq('user_id', user.id)
        .eq('status', 'paid');

      console.log('📋 Invoices marked as paid:', paidInvoices?.length || 0);

      if (paidInvoices && paidInvoices.length > 0) {
        for (const invoice of paidInvoices) {
          // Check if this invoice has actual payment records
          const { data: payments } = await supabase
            .from('payments')
            .select('*')
            .eq('invoice_id', invoice.id);

          console.log(`📄 Invoice ${invoice.invoice_number}:`);
          console.log(`   Status: ${invoice.status}, Payment Status: ${invoice.payment_status}`);
          console.log(`   Total: $${invoice.total}, Paid: $${invoice.total_paid || 0}`);
          console.log(`   Payment Records: ${payments?.length || 0}`);

          if (!payments || payments.length === 0) {
            console.warn(`⚠️  Invoice ${invoice.invoice_number} is marked as paid but has no payment records!`);
          }
        }
      }

      return true;
    } catch (error) {
      console.error('❌ Payment data flow check failed:', error);
      return false;
    }
  },

  async createTestPayment(invoiceId: string) {
    console.log('🧪 Creating test payment for invoice:', invoiceId);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('❌ No authenticated user');
        return null;
      }

      // Get invoice details
      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', invoiceId)
        .eq('user_id', user.id)
        .single();

      if (invoiceError || !invoice) {
        console.error('❌ Invoice not found:', invoiceError);
        return null;
      }

      console.log('📄 Found invoice:', invoice.invoice_number, '$' + invoice.total);

      // Create test payment
      const testPayment = {
        invoice_id: invoiceId,
        user_id: user.id,
        payment_method: 'bank_transfer',
        amount: invoice.total,
        payment_date: new Date().toISOString().split('T')[0],
        reference_number: `TEST-${Date.now()}`,
        notes: 'Test payment created by diagnostics',
        status: 'completed'
      };

      const { data: payment, error: paymentError } = await supabase
        .from('payments')
        .insert(testPayment)
        .select()
        .single();

      if (paymentError) {
        console.error('❌ Failed to create test payment:', paymentError);
        return null;
      }

      console.log('✅ Test payment created:', payment.id);

      // Update invoice payment status
      const totalPaid = invoice.total;
      const { error: updateError } = await supabase
        .from('invoices')
        .update({
          total_paid: totalPaid,
          payment_status: 'paid'
        })
        .eq('id', invoiceId);

      if (updateError) {
        console.error('❌ Failed to update invoice:', updateError);
        return payment;
      }

      console.log('✅ Invoice payment status updated');

      // Generate test receipt
      const receiptNumber = `REC-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(Date.now()).slice(-4)}`;
      
      const testReceipt = {
        payment_id: payment.id,
        receipt_number: receiptNumber,
        user_id: user.id,
        receipt_data: {
          payment: payment,
          invoice: invoice,
          receiptNumber: receiptNumber,
          paymentDate: payment.payment_date,
          amountPaid: payment.amount,
          paymentMethod: 'Bank Transfer'
        },
        is_emailed: false
      };

      const { data: receipt, error: receiptError } = await supabase
        .from('receipts')
        .insert(testReceipt)
        .select()
        .single();

      if (receiptError) {
        console.error('❌ Failed to create test receipt:', receiptError);
      } else {
        console.log('✅ Test receipt created:', receipt.receipt_number);
      }

      return payment;
    } catch (error) {
      console.error('❌ Test payment creation failed:', error);
      return null;
    }
  },

  async runFullDiagnostic() {
    console.log('🚀 Running full payment system diagnostic...');
    console.log('=====================================');
    
    const tablesOk = await this.checkDatabaseTables();
    const dataFlowOk = await this.checkPaymentDataFlow();
    
    console.log('=====================================');
    console.log('📊 Diagnostic Summary:');
    console.log('✅ Database Tables:', tablesOk ? 'OK' : 'FAILED');
    console.log('✅ Data Flow:', dataFlowOk ? 'OK' : 'NEEDS ATTENTION');
    
    if (tablesOk && dataFlowOk) {
      console.log('🎉 Payment system appears to be working correctly!');
    } else {
      console.log('⚠️  Payment system needs attention. Check logs above for details.');
    }
    
    return { tablesOk, dataFlowOk };
  }
};

// Make it available globally for easy debugging
if (typeof window !== 'undefined') {
  Object.assign(window, { paymentDiagnostics });
}