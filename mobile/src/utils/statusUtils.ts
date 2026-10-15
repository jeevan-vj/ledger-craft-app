// Status utilities for invoice status management

export type StatusIconName = 'edit-3' | 'send' | 'check' | 'alert-circle' | 'circle';

export interface StatusOption {
  value: 'draft' | 'sent' | 'paid' | 'overdue';
  label: string;
  icon: StatusIconName;
  color: string;
  description: string;
}

export const STATUS_OPTIONS: StatusOption[] = [
  {
    value: 'draft',
    label: 'Draft',
    icon: 'edit-3',
    color: '#636366',
    description: 'Not sent to customer yet',
  },
  {
    value: 'sent',
    label: 'Sent',
    icon: 'send',
    color: '#163300',
    description: 'Sent and awaiting payment',
  },
  {
    value: 'paid',
    label: 'Paid',
    icon: 'check',
    color: '#34C759',
    description: 'Payment received',
  },
  {
    value: 'overdue',
    label: 'Overdue',
    icon: 'alert-circle',
    color: '#FF3B30',
    description: 'Payment past due date',
  },
];

export const getStatusColor = (status: string): string => {
  const option = STATUS_OPTIONS.find((opt) => opt.value === status);
  return option?.color || '#6b7280';
};

export const getStatusIcon = (status: string): StatusIconName => {
  const option = STATUS_OPTIONS.find((opt) => opt.value === status);
  return option?.icon || 'circle';
};

export const getStatusLabel = (status: string): string => {
  const option = STATUS_OPTIONS.find((opt) => opt.value === status);
  return option?.label || status;
};

export const getStatusDescription = (status: string): string => {
  const option = STATUS_OPTIONS.find((opt) => opt.value === status);
  return option?.description || '';
};

// Payment method options
export interface PaymentMethodOption {
  value: 'bank_transfer' | 'cash' | 'cheque' | 'credit_card' | 'online';
  label: string;
  description: string;
  requiresReference: boolean;
}

export const PAYMENT_METHOD_OPTIONS: PaymentMethodOption[] = [
  {
    value: 'bank_transfer',
    label: 'Bank Transfer',
    description: 'Direct bank transfer or wire',
    requiresReference: true,
  },
  {
    value: 'cash',
    label: 'Cash Payment',
    description: 'Cash received in person',
    requiresReference: false,
  },
  {
    value: 'cheque',
    label: 'Cheque',
    description: 'Check payment',
    requiresReference: true,
  },
  {
    value: 'credit_card',
    label: 'Credit/Debit Card',
    description: 'Card payment processed',
    requiresReference: true,
  },
  {
    value: 'online',
    label: 'Online Payment',
    description: 'PayPal, Stripe, etc.',
    requiresReference: true,
  },
];

export const getPaymentMethodLabel = (method: string): string => {
  const option = PAYMENT_METHOD_OPTIONS.find((opt) => opt.value === method);
  return option?.label || method;
};

