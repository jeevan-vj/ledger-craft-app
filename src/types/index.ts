export interface Customer {
  id: string;
  name: string;
  email: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string;
  phone?: string | null;
  isVip?: boolean | null;
  tags?: string[] | null;
  userId?: string; // Added for Supabase compatibility
  createdAt?: string;
  updatedAt?: string;
}

// Theme types for business branding
export interface BusinessTheme {
  primary: string;      // Primary brand color (hex)
  secondary: string;    // Secondary brand color (hex)  
  accent: string;       // Accent color for highlights (hex)
  text: string;         // Primary text color (hex)
  textLight: string;    // Light/muted text color (hex)
  background: string;   // Background color (hex)
  surface: string;      // Surface/card background color (hex)
}

export const DEFAULT_BUSINESS_THEME: BusinessTheme = {
  primary: '#3B82F6',     // Blue-600
  secondary: '#06B6D4',   // Cyan-500
  accent: '#10B981',      // Emerald-500
  text: '#111827',        // Gray-900
  textLight: '#6B7280',   // Gray-500
  background: '#F9FAFB',  // Gray-50
  surface: '#FFFFFF'      // White
};

export const PRESET_THEMES: Record<string, BusinessTheme> = {
  blue: {
    primary: '#3B82F6',
    secondary: '#06B6D4', 
    accent: '#10B981',
    text: '#111827',
    textLight: '#6B7280',
    background: '#F9FAFB',
    surface: '#FFFFFF'
  },
  purple: {
    primary: '#8B5CF6',
    secondary: '#A855F7',
    accent: '#EC4899',
    text: '#111827',
    textLight: '#6B7280',
    background: '#FAF5FF',
    surface: '#FFFFFF'
  },
  green: {
    primary: '#10B981',
    secondary: '#059669',
    accent: '#F59E0B',
    text: '#111827',
    textLight: '#6B7280',
    background: '#F0FDF4',
    surface: '#FFFFFF'
  },
  red: {
    primary: '#EF4444',
    secondary: '#F97316',
    accent: '#8B5CF6',
    text: '#111827',
    textLight: '#6B7280',
    background: '#FEF2F2',
    surface: '#FFFFFF'
  },
  pink: {
    primary: '#EC4899',      // Hot Pink-500 - vibrant and professional
    secondary: '#F472B6',    // Pink-400 - softer pink for accents
    accent: '#8B5CF6',       // Violet-500 - complementary purple accent
    text: '#1F2937',         // Gray-800 - strong contrast for readability
    textLight: '#6B7280',    // Gray-500 - muted text
    background: '#FDF2F8',   // Pink-50 - very light pink background
    surface: '#FFFFFF'       // White - clean surface color  
  },
  slate: {
    primary: '#475569',
    secondary: '#64748B',
    accent: '#0EA5E9',
    text: '#0F172A',
    textLight: '#64748B',
    background: '#F8FAFC',
    surface: '#FFFFFF'
  }
};

export interface BusinessProfile {
  id?: string;
  name: string;
  email: string;
  currency?: string;
  phone?: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string;
  taxId?: string | null;
  logoUrl?: string | null;  // Ensure consistent camelCase naming
  website?: string | null;
  defaultTaxRate?: number | null;
  defaultTerms?: string | null;
  defaultNotes?: string | null;
  bankInfo?: string | null;
  bankAccountName?: string | null;
  bankAccountNumber?: string | null;
  theme?: BusinessTheme | null;  // Business theme colors
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
  invoiceNumberFormat?: string | null;
  invoiceNumberSequence?: number | null;
  paymentTermDays?: number;
}

export interface LineItem {
  id: string;
  invoiceId?: string;
  description: string;
  quantity: number;
  unit: string;  // Unit for quantity
  rate: number;
  rateUnit: string;  // Unit the rate is specified in (e.g., per kg)
  tax?: number | null;
  total: number;
  createdAt?: string;
  updatedAt?: string;
}

export type AdditionalChargeType = 
  | 'delivery' 
  | 'handling' 
  | 'rush' 
  | 'service' 
  | 'processing' 
  | 'international' 
  | 'setup' 
  | 'administrative' 
  | 'custom';

export interface AdditionalCharge {
  id: string;
  type: AdditionalChargeType;
  label: string;
  calculationType: 'fixed' | 'percentage';
  amount: number;
  description?: string;
  isActive: boolean;
}

export const ADDITIONAL_CHARGE_PRESETS: Record<AdditionalChargeType, { label: string; icon: string; description: string }> = {
  delivery: { label: 'Delivery', icon: '🚚', description: 'Shipping and delivery charges' },
  handling: { label: 'Handling Fee', icon: '📦', description: 'Packaging and handling costs' },
  rush: { label: 'Rush/Expedite', icon: '⚡', description: 'Priority processing fee' },
  service: { label: 'Service Fee', icon: '🏪', description: 'General service charges' },
  processing: { label: 'Payment Processing', icon: '💳', description: 'Credit card processing fees' },
  international: { label: 'International Fee', icon: '🌍', description: 'Cross-border transaction fees' },
  setup: { label: 'Setup/Installation', icon: '🔧', description: 'One-time setup costs' },
  administrative: { label: 'Administrative Fee', icon: '📋', description: 'Paperwork and admin costs' },
  custom: { label: 'Custom', icon: '🎯', description: 'Custom additional charge' }
};

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue';

export interface Invoice {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customer?: Customer;
  businessProfile?: BusinessProfile;
  date: string;
  dueDate: string;
  paymentTermDays?: number | null;
  items: LineItem[];
  subtotal: number;
  taxAmount: number;
  discountType?: 'fixed' | 'percent';
  discountPercent?: number | null;
  discount?: number | null;
  additionalCharges?: number | null; // Keep for backward compatibility
  additionalChargesList?: AdditionalCharge[]; // New structured charges
  additionalChargesTotal?: number; // Calculated total of all additional charges
  total: number;
  status: InvoiceStatus;
  notes?: string | null;
  terms?: string | null;
  currency: string;
  templateName?: string; // Template used for this invoice
  userId?: string; // Added for Supabase compatibility
  createdAt?: string;
  updatedAt?: string;
  public_viewed_at?: string | null;
}

// Helper interfaces for Supabase compatibility
export interface SupabaseCustomer {
  id: string;
  name: string;
  email: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string;
  phone: string | null;
  is_vip: boolean | null;
  tags: string[] | null;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface SupabaseInvoice {
  id: string;
  invoice_number: string;
  customer_id: string;
  date: string;
  due_date: string;
  subtotal: number;
  tax_amount: number;
  discount: number | null;
  additional_charges: number | null;
  additional_charges_list: AdditionalCharge[] | null;
  additional_charges_total: number | null;
  total: number;
  status: InvoiceStatus;
  notes: string | null;
  terms: string | null;
  currency: string;
  template_name: string | null;
  user_id: string;
  created_at: string;
  updated_at: string;
  public_viewed_at: string | null;
  customers?: {
    name: string;
    email: string;
  };
}

export interface SupabaseLineItem {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit: string;  // Unit for quantity
  rate: number;
  rate_unit: string;  // Unit the rate is specified in (snake_case for database)
  tax: number | null;
  total: number;
  created_at: string;
  updated_at: string;
}

export interface SupabaseBusinessProfile {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string;
  tax_id: string | null;
  logo_url: string | null;  // This stays snake_case for database mapping
  website: string | null;
  default_tax_rate: number | null;
  default_terms: string | null;
  default_notes: string | null;
  bank_info: string | null;
  theme: BusinessTheme | null;  // Business theme stored as JSON
  user_id: string;
  created_at: string;
  updated_at: string;
  invoice_number_format: string | null;
  invoice_number_sequence: number | null;
}

export interface ItemCategory {
  id: string;
  name: string;
  color?: string; // Hex color code for category color
  isActive?: boolean;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Item {
  id: string;
  name: string;
  description?: string | null;
  type: 'product' | 'service';
  categoryId?: string | null;
  category?: ItemCategory | null;
  salePrice?: number | null;
  purchasePrice?: number | null;
  taxRate?: number | null;
  enableSaleInfo: boolean;
  enablePurchaseInfo: boolean;
  unit: string;
  isActive?: boolean;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SupabaseItemCategory {
  id: string;
  name: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface SupabaseItem {
  id: string;
  name: string;
  description: string | null;
  type: 'product' | 'service';
  category_id: string | null;
  sale_price: number | null;
  purchase_price: number | null;
  tax_rate: number | null;
  enable_sale_info: boolean;
  enable_purchase_info: boolean;
  unit: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

// Account types
export type AccountType = 'bank' | 'cash' | 'credit_card' | 'loan' | 'custom';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  openingBalance: number;
  currentBalance: number;
  accountNumber?: string | null;
  accountClass?: string | null;
  isActive?: boolean;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SupabaseAccount {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  opening_balance: number;
  current_balance: number;
  user_id: string;
  created_at: string;
  updated_at: string;
}

// Expense types
export type ExpenseStatus = 'pending' | 'approved' | 'rejected';
export type PaymentMethod = 'cash' | 'card' | 'bank_transfer' | 'check' | 'other';
export type GstTreatment = 'standard' | 'zero_rated' | 'exempt' | 'partial' | 'private_use';
export type GstExemptionReason = 'none' | 'motor_vehicle' | 'financial_services' | 'residential_rent' | 'insurance_life' | 'exported_services' | 'entertainment_50' | 'home_office' | 'second_hand_goods' | 'other_exempt';

export interface ExpenseCategory {
  id: string;
  name: string;
  description?: string | null;
  color?: string | null;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  categoryId?: string | null;
  category?: ExpenseCategory;
  accountId?: string | null;
  account?: Account;
  vendorName?: string | null;
  receiptUrl?: string | null;
  expenseDate: string;
  status: ExpenseStatus;
  isBillable: boolean;
  customerId?: string | null;
  customer?: Customer;
  taxAmount: number;
  currency: string;
  paymentMethod?: PaymentMethod | null;
  notes?: string | null;
  gstTreatment?: GstTreatment;
  gstExemptionReason?: GstExemptionReason;
  gstClaimablePercentage?: number;
  privateUsePercentage?: number;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SupabaseExpenseCategory {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface SupabaseExpense {
  id: string;
  description: string;
  amount: number;
  category_id: string | null;
  account_id: string | null;
  vendor_name: string | null;
  receipt_url: string | null;
  expense_date: string;
  status: ExpenseStatus;
  is_billable: boolean;
  customer_id: string | null;
  tax_amount: number;
  currency: string;
  payment_method: PaymentMethod | null;
  notes: string | null;
  user_id: string;
  created_at: string;
  updated_at: string;
}

// Onboarding types
export interface OnboardingData {
  businessName: string;
  businessEmail: string;
  country: string;
  invoiceNumberFormat?: string;
  defaultTaxRate?: number;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  theme?: BusinessTheme;
}

export interface OnboardingStepProps {
  data: OnboardingData;
  onDataChange: (updates: Partial<OnboardingData>) => void;
  onNext: () => void;
  onSkip?: () => void;
  isLoading?: boolean;
}

// Shared Invoice types for anonymous sharing feature
export interface SharedInvoice {
  id: string;
  originalInvoiceId: string;
  invoiceData: Invoice; // Complete invoice data snapshot
  templateData: {
    templateName: string;
    businessProfile: BusinessProfile;
  };
  shareToken: string;
  createdAt: string;
  expiresAt?: string | null;
  accessCount: number;
  isActive: boolean;
  createdBy: string;
}

export interface SupabaseSharedInvoice {
  id: string;
  original_invoice_id: string;
  invoice_data: any; // JSONB data
  template_data: any; // JSONB data
  share_token: string;
  created_at: string;
  expires_at: string | null;
  access_count: number;
  is_active: boolean;
  created_by: string;
}

// Template types
export type InvoiceTemplateName = 
  | 'classic' 
  | 'modern' 
  | 'minimal' 
  | 'executive' 
  | 'corporate' 
  | 'modernPro';

export interface InvoiceTemplateConfig {
  name: InvoiceTemplateName;
  displayName: string;
  description: string;
  preview?: string; // Preview image URL
}

// AI Conversation Types
export type ConversationRole = 'user' | 'assistant' | 'system';

export type ConversationIntent = 
  | 'create_invoice' 
  | 'edit_invoice' 
  | 'send_invoice' 
  | 'track_payment'
  | 'create_customer' 
  | 'find_customer' 
  | 'update_customer'
  | 'add_expense' 
  | 'categorize_expense' 
  | 'scan_receipt'
  | 'generate_report' 
  | 'show_analytics' 
  | 'financial_summary'
  | 'help' 
  | 'clarification' 
  | 'greeting'
  | 'unknown';

export interface ConversationEntity {
  type: 'customer' | 'amount' | 'date' | 'product' | 'service' | 'invoice' | 'expense' | 'category' | 'selection';
  value: string;
  confidence: number;
  resolved?: boolean;
  resolvedValue?: any;
}

export interface ConversationAction {
  type: string;
  parameters: Record<string, any>;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  result?: any;
  error?: string;
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  role: ConversationRole;
  content: string;
  timestamp: Date;
  metadata?: {
    intent?: ConversationIntent;
    entities?: ConversationEntity[];
    actions?: ConversationAction[];
    confidence?: number;
  };
}

export interface InvoiceCreationContext {
  step: 'customer_search' | 'customer_disambiguation' | 'item_selection' | 'additional_charges' | 'template_selection' | 'invoice_creation';
  searchTerm?: string;
  customerCandidates?: Customer[];
  selectedCustomer?: Customer;
  availableItems?: Item[];
  selectedItems?: Array<Item & { quantity: number; rate: number }>;
  additionalCharges?: AdditionalCharge[];
  selectedTemplate?: string;
  completedInvoice?: Invoice;
}

export interface ConversationContext {
  currentTask?: {
    type: ConversationIntent;
    progress: Record<string, any>;
    requiredFields: string[];
    completedFields: string[];
  };
  currentInvoiceCreation?: InvoiceCreationContext;
  recentEntities: {
    customers: Customer[];
    invoices: Invoice[];
    expenses: Expense[];
    items: Item[];
  };
  userPreferences: {
    defaultTemplate: string;
    currency: string;
    dateFormat: string;
    language: string;
  };
  businessContext?: {
    businessProfile?: BusinessProfile;
    recentActivity: string[];
  };
}

export interface ConversationSession {
  id: string;
  userId: string;
  title?: string;
  messages: ConversationMessage[];
  context: ConversationContext;
  status: 'active' | 'completed' | 'paused';
  createdAt: string;
  updatedAt: string;
}

export interface AIResponse {
  message: string;
  intent: ConversationIntent;
  entities: ConversationEntity[];
  actions: ConversationAction[];
  needsConfirmation: boolean;
  suggestedActions?: string[];
  context?: Partial<ConversationContext>;
}

export interface ActionResult {
  success: boolean;
  data?: any;
  error?: string;
  needsInfo?: string;
  suggestions?: string[];
}

// Supabase types for AI conversation
export interface SupabaseConversation {
  id: string;
  user_id: string;
  title: string | null;
  context: any; // JSONB
  status: 'active' | 'completed' | 'paused';
  created_at: string;
  updated_at: string;
}

export interface SupabaseConversationMessage {
  id: string;
  conversation_id: string;
  role: ConversationRole;
  content: string;
  metadata: any | null; // JSONB
  created_at: string;
}
