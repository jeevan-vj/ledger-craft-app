import { useState } from 'react';
import { useAppData } from '@/hooks/useAppData';
import { Invoice } from '@/types';
import type { CreatePaymentRequest, Payment } from '@/types/payment';
import { paymentService } from '@/services/paymentService';

export const useInvoicePayment = () => {
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  
  const {
    createPayment,
    updateInvoiceStatus,
  } = useAppData();
  const getPaymentsByInvoice = (invoiceId: string) => paymentService.getPaymentsByInvoice(invoiceId);
  const getReceiptByPayment = (paymentId: string) => paymentService.getReceiptByPayment(paymentId);

  const processInvoicePayment = async (
    invoice: Invoice,
    paymentData: Omit<CreatePaymentRequest, 'invoiceId'>
  ) => {
    setIsProcessingPayment(true);
    try {
      // Create the payment
      const payment = await createPayment({
        ...paymentData,
        invoiceId: invoice.id
      });

      // Get the generated receipt
      const receipt = await getReceiptByPayment(payment.id);

      return {
        payment,
        receipt,
        success: true
      };
    } catch (error) {
      console.error('Error processing payment:', error);
      return {
        payment: null,
        receipt: null,
        success: false,
        error
      };
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const getInvoicePaymentHistory = async (invoiceId: string) => {
    try {
      return await getPaymentsByInvoice(invoiceId);
    } catch (error) {
      console.error('Error fetching payment history:', error);
      return [];
    }
  };

  const calculateInvoicePaymentStatus = (invoice: Invoice, payments: Payment[] = []) => {
    const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);
    const balance = invoice.total - totalPaid;
    
    let status: 'unpaid' | 'partially_paid' | 'paid' | 'overdue' = 'unpaid';
    
    if (totalPaid >= invoice.total) {
      status = 'paid';
    } else if (totalPaid > 0) {
      status = 'partially_paid';
    } else if (new Date(invoice.dueDate) < new Date()) {
      status = 'overdue';
    }

    return {
      totalPaid,
      balance,
      status,
      isFullyPaid: totalPaid >= invoice.total,
      isOverdue: new Date(invoice.dueDate) < new Date() && totalPaid < invoice.total
    };
  };

  return {
    processInvoicePayment,
    getInvoicePaymentHistory,
    calculateInvoicePaymentStatus,
    isProcessingPayment
  };
};