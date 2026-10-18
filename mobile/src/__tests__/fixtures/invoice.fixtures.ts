import { LineItem, Invoice } from '@/types/invoice';

export const mockLineItem: LineItem = {
  id: '1',
  description: 'Web Development',
  quantity: 10,
  unit: 'hour',
  rate: 150,
  total: 1500,
};

export const mockLineItems: LineItem[] = [
  mockLineItem,
  {
    id: '2',
    description: 'Software License',
    quantity: 1,
    unit: 'license',
    rate: 500,
    total: 500,
  },
];

export const mockInvoiceInput = {
  invoiceNumber: 'TEST_INV_001',
  customerId: 'test-customer-id-1',
  date: new Date().toISOString().split('T')[0],
  dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  currency: 'NZD',
  notes: 'Test invoice notes',
  terms: 'Net 30',
  items: mockLineItems,
  subtotal: 2000,
  taxAmount: 300,
  total: 2300,
  taxEnabled: true,
  taxRate: 15,
};

export const mockInvoice: Invoice = {
  id: 'test-invoice-id-1',
  invoiceNumber: 'TEST_INV_001',
  customerId: 'test-customer-id-1',
  customer: {
    id: 'test-customer-id-1',
    name: 'TEST_John Doe',
    email: 'johndoe@test.com',
  },
  date: new Date().toISOString().split('T')[0],
  dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  currency: 'NZD',
  notes: 'Test invoice notes',
  terms: 'Net 30',
  items: mockLineItems,
  subtotal: 2000,
  taxAmount: 300,
  total: 2300,
  status: 'draft',
  userId: 'test-user-id',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const mockInvoices: Invoice[] = [
  mockInvoice,
  {
    ...mockInvoice,
    id: 'test-invoice-id-2',
    invoiceNumber: 'TEST_INV_002',
    total: 1500,
    status: 'sent',
  },
  {
    ...mockInvoice,
    id: 'test-invoice-id-3',
    invoiceNumber: 'TEST_INV_003',
    total: 3000,
    status: 'paid',
  },
];

