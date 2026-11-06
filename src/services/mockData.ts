
import { Customer, Invoice, BusinessProfile, LineItem } from '@/types';
import { generateInvoiceNumber, formatDate } from '@/utils/invoiceUtils';

// Create sample customers
export const mockCustomers: Customer[] = [
  {
    id: 'c1',
    name: 'Acme Corp',
    email: 'billing@acmecorp.com',
    address: '123 Business Ave',
    city: 'San Francisco',
    state: 'CA',
    zip: '94107',
    country: 'USA',
    phone: '(415) 555-1234',
    isVip: true,
    tags: ['tech', 'enterprise']
  },
  {
    id: 'c2',
    name: 'Global Solutions Inc',
    email: 'accounts@globalsolutions.co',
    address: '456 Corporate Blvd',
    city: 'New York',
    state: 'NY',
    zip: '10001',
    country: 'USA',
    phone: '(212) 555-5678',
    tags: ['consulting']
  },
  {
    id: 'c3',
    name: 'Startup Innovations',
    email: 'finance@startupinnovations.io',
    address: '789 Venture St',
    city: 'Austin',
    state: 'TX',
    zip: '73301',
    country: 'USA',
    phone: '(512) 555-9012',
    tags: ['startup', 'tech']
  }
];

// Create sample business profile
export const mockBusinessProfile: BusinessProfile = {
  name: 'Your Business Name',
  email: 'contact@yourbusiness.com',
  phone: '(555) 123-4567',
  address: '100 Main Street',
  city: 'Anytown',
  state: 'ST',
  zip: '12345',
  country: 'USA',
  taxId: '12-3456789',
  website: 'www.yourbusiness.com',
  defaultTaxRate: 7.5,
  defaultTerms: 'Payment due within 30 days.',
  defaultNotes: 'Thank you for your business!',
  bankInfo: 'Bank: National Bank, Account: 987654321, Routing: 123456789',
};

// Create sample line items
const createSampleLineItems = (): LineItem[] => [
  {
    id: `item-${Math.random().toString(36).substring(2, 9)}`,
    description: 'Web Development Services',
    quantity: 40,
    unit: 'each',
    rateUnit: 'each', // Added unit property
    rate: 75,
    tax: 7.5,
    total: 40 * 75
  },
  {
    id: `item-${Math.random().toString(36).substring(2, 9)}`,
    description: 'UI/UX Design',
    quantity: 25,
    unit: 'each',
    rateUnit: 'each', // Added unit property
    rate: 90,
    tax: 7.5,
    total: 25 * 90
  }
];

// Create sample invoices
export const mockInvoices: Invoice[] = [
  {
    id: 'i1',
    invoiceNumber: generateInvoiceNumber(),
    customerId: 'c1',
    date: formatDate(new Date()),
    dueDate: formatDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)),
    items: createSampleLineItems(),
    subtotal: 5250,
    taxAmount: 393.75,
    total: 5643.75,
    status: 'sent',
    terms: mockBusinessProfile.defaultTerms,
    notes: mockBusinessProfile.defaultNotes,
    currency: 'USD',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'i2',
    invoiceNumber: generateInvoiceNumber(),
    customerId: 'c2',
    date: formatDate(new Date(Date.now() - 45 * 24 * 60 * 60 * 1000)),
    dueDate: formatDate(new Date(Date.now() - 15 * 24 * 60 * 60 * 1000)),
    items: [
      {
        id: `item-${Math.random().toString(36).substring(2, 9)}`,
        description: 'Consulting Services',
        quantity: 10,
        unit: 'each',
    rateUnit: 'each', // Added unit property
        rate: 150,
        tax: 7.5,
        total: 10 * 150
      }
    ],
    subtotal: 1500,
    taxAmount: 112.5,
    total: 1612.5,
    status: 'paid',
    terms: mockBusinessProfile.defaultTerms,
    notes: mockBusinessProfile.defaultNotes,
    currency: 'USD',
    createdAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'i3',
    invoiceNumber: generateInvoiceNumber(),
    customerId: 'c3',
    date: formatDate(new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)),
    dueDate: formatDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
    items: [
      {
        id: `item-${Math.random().toString(36).substring(2, 9)}`,
        description: 'Mobile App Development',
        quantity: 80,
        unit: 'each',
    rateUnit: 'each', // Added unit property
        rate: 85,
        tax: 7.5,
        total: 80 * 85
      }
    ],
    subtotal: 6800,
    taxAmount: 510,
    total: 7310,
    status: 'overdue',
    terms: mockBusinessProfile.defaultTerms,
    notes: mockBusinessProfile.defaultNotes,
    currency: 'USD',
    createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
  }
];
