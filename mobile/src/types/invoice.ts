// Invoice types for mobile app
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';

export interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  total: number;
  tax?: number;
  discountType?: 'fixed' | 'percent';
  discountValue?: number | null;
  discountAmount?: number;
  taxes?: { id: string; name: string; rate: number }[];
}

export interface AdditionalCharge {
  id: string;
  name: string;
  amount: number;
  calculationType: 'fixed' | 'percentage';
  isActive: boolean;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string;
}

export interface BusinessProfile {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string;
  taxId?: string | null;
  logoUrl?: string | null;
  website?: string | null;
  defaultTaxRate?: number | null;
  gstRegistrationStatus?: 'unknown' | 'registered' | 'not_registered';
  defaultNotes?: string | null;
  defaultTerms?: string | null;
  currency?: string;
  bankInfo?: string | null;
  bankAccountName?: string | null;
  bankAccountNumber?: string | null;
  /**
   * Brand colours for invoice preview and PDF. Missing tokens fall back inside
   * `resolveInvoiceTheme`. Ownership stays on the loaded profile, not the form.
   */
  theme?: {
    primary?: string | null;
    secondary?: string | null;
    accent?: string | null;
    text?: string | null;
    textLight?: string | null;
    background?: string | null;
    surface?: string | null;
  } | null;
  userId: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  externalId?: string | null;
  externalNumber?: string | null;
  externalIssuerName?: string | null;
  sourceImportDocumentId?: string | null;
  thirdPartyIssued?: boolean;
  customerId: string;
  customer?: Customer;
  businessProfile?: BusinessProfile;
  date: string;
  dueDate: string;
  items: LineItem[];
  subtotal: number;
  taxAmount: number;
  discount?: number | null;
  additionalCharges?: number | null;
  additionalChargesList?: AdditionalCharge[];
  additionalChargesTotal?: number;
  total: number;
  totalPaid?: number;
  balanceDue?: number;
  /** Exact balance-due decimal from the API. Payment capture uses this string. */
  balanceDueText?: string;
  paymentStatus?: 'unpaid' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled' | string;
  taxInclusive?: boolean;
  status: InvoiceStatus;
  notes?: string | null;
  terms?: string | null;
  currency: string;
  templateName?: string;
  sourceQuoteId?: string;
  sourceQuoteNumber?: string;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
  archivedAt?: string | null;
}
