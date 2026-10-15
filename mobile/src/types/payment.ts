// Payment-related types for mobile app

export interface Payment {
  id: string;
  invoiceId: string;
  userId: string;
  paymentMethod: 'bank_transfer' | 'cash' | 'cheque' | 'credit_card' | 'online';
  amount: number;
  paymentDate: string;
  referenceNumber?: string;
  notes?: string;
  status: 'completed' | 'pending' | 'failed';
  createdAt: string;
  updatedAt: string;
}

export interface Receipt {
  id: string;
  paymentId: string;
  receiptNumber: string;
  userId: string;
  generatedAt: string;
  emailSentAt?: string;
  isEmailed: boolean;
  receiptData: any;
  createdAt: string;
}

export interface CreatePaymentRequest {
  invoiceId: string;
  paymentMethod: 'bank_transfer' | 'cash' | 'cheque' | 'credit_card' | 'online';
  amount: number;
  paymentDate: string;
  referenceNumber?: string;
  notes?: string;
  generateReceipt?: boolean;
}

export interface EnhancedInvoice {
  id: string;
  invoiceNumber: string;
  customerId: string;
  date: string;
  dueDate: string;
  subtotal: number;
  taxAmount: number;
  discount?: number;
  additionalCharges?: number;
  total: number;
  status: 'draft' | 'sent' | 'paid' | 'overdue';
  currency: string;
  paymentStatus?: 'unpaid' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled';
  totalPaid?: number;
  balanceDue?: number;
  taxInclusive?: boolean;
}

