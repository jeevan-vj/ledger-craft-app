import { supabase } from '@/integrations/supabase/client';
import { 
  Customer, Invoice, BusinessProfile, LineItem, ItemCategory, Item,
  SupabaseCustomer, SupabaseInvoice, SupabaseLineItem, SupabaseBusinessProfile, SupabaseItemCategory, SupabaseItem,
  Account, SupabaseAccount, AccountType, InvoiceStatus,
  Expense, ExpenseCategory, SupabaseExpense, SupabaseExpenseCategory, ExpenseStatus, PaymentMethod,
  SharedInvoice, SupabaseSharedInvoice, InvoiceTemplateName
} from '@/types';
import { accountingJournalService } from './accountingJournalService';
import {
  customersApi,
  customersApiEnabled,
  toCreateCustomerRequest,
  toUpdateCustomerRequest,
} from '@/features/customers/api/customersApi';
import {
  businessProfileApi,
  businessProfileApiEnabled,
} from '@/features/business-profile/api/businessProfileApi';
import {
  itemsApi,
  itemsApiEnabled,
  toCreateItemRequest,
  toUpdateItemRequest,
} from '@/features/items/api/itemsApi';
import { invoicesApi, invoicesApiEnabled } from '@/features/invoices/api/invoicesApi';
import {
  expensesApi,
  expensesApiEnabled,
  toCreateExpenseCategoryRequest,
  toCreateExpenseRequest,
  toUpdateExpenseRequest,
} from '@/features/expenses/api/expensesApi';
import { accountsApi, accountsApiEnabled } from '@/features/payments/api/paymentsApi';

const mapSupabaseCustomerToCustomer = (customer: SupabaseCustomer): Customer => ({
  id: customer.id,
  name: customer.name,
  email: customer.email,
  address: customer.address,
  city: customer.city,
  state: customer.state,
  zip: customer.zip,
  country: customer.country,
  phone: customer.phone || undefined,
  isVip: customer.is_vip || false,
  tags: customer.tags || [],
  userId: customer.user_id,
  createdAt: customer.created_at,
  updatedAt: customer.updated_at
});

const mapCustomerToSupabaseCustomer = async (customer: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>): Promise<Omit<SupabaseCustomer, 'id' | 'created_at' | 'updated_at'>> => {
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id || '';

  return {
    name: customer.name,
    email: customer.email || '',
    address: customer.address || null,
    city: customer.city || null,
    state: customer.state || null,
    zip: customer.zip || null,
    country: customer.country || 'New Zealand',
    phone: customer.phone || null,
    is_vip: customer.isVip || false,
    tags: customer.tags || null,
    user_id: customer.userId || userId
  };
};

const mapSupabaseInvoiceToInvoice = (invoice: SupabaseInvoice | any, items: SupabaseLineItem[] = []): Invoice => ({
  id: invoice.id,
  invoiceNumber: invoice.invoice_number,
  customerId: invoice.customer_id,
  customer: invoice.customers ? {
    id: invoice.customer_id,
    name: invoice.customers.name,
    email: invoice.customers.email,
    address: invoice.customers.address,
    city: invoice.customers.city,
    state: invoice.customers.state,
    zip: invoice.customers.zip,
    country: invoice.customers.country
  } : undefined,
  date: invoice.date,
  dueDate: invoice.due_date,
  items: items.map(item => ({
    id: item.id,
    invoiceId: item.invoice_id,
    description: item.description,
    quantity: item.quantity,
    unit: item.unit || 'each',
    rate: item.rate,
    rateUnit: item.rate_unit || item.unit || 'each',
    tax: item.tax,
    total: item.total,
    createdAt: item.created_at,
    updatedAt: item.updated_at
  })),
  subtotal: invoice.subtotal,
  taxAmount: invoice.tax_amount,
  discount: invoice.discount,
  additionalCharges: invoice.additional_charges,
  additionalChargesList: invoice.additional_charges_list,
  additionalChargesTotal: invoice.additional_charges_total,
  total: invoice.total,
  status: invoice.status as InvoiceStatus,
  notes: invoice.notes || undefined,
  terms: invoice.terms || undefined,
  currency: invoice.currency,
  templateName: invoice.template_name || 'classic',
  userId: invoice.user_id,
  createdAt: invoice.created_at,
  updatedAt: invoice.updated_at,
  public_viewed_at: invoice.public_viewed_at || undefined
});

const mapInvoiceToSupabaseInvoice = async (invoice: Omit<Invoice, 'id' | 'createdAt' | 'updatedAt'>): Promise<Omit<SupabaseInvoice, 'id' | 'created_at' | 'updated_at', 'public_viewed_at'>> => {
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id || '';

  return {
    invoice_number: invoice.invoiceNumber,
    customer_id: invoice.customerId,
    date: invoice.date,
    due_date: invoice.dueDate,
    subtotal: invoice.subtotal,
    tax_amount: invoice.taxAmount,
    discount: invoice.discount || null,
    additional_charges: invoice.additionalCharges || null,
    additional_charges_list: invoice.additionalChargesList || null,
    additional_charges_total: invoice.additionalChargesTotal || null,
    total: invoice.total,
    status: invoice.status,
    notes: invoice.notes || null,
    terms: invoice.terms || null,
    currency: invoice.currency,
    template_name: invoice.templateName || 'classic',
    user_id: invoice.userId || userId,
    public_viewed_at: invoice.public_viewed_at || null
  };
};

const mapSupabaseBusinessProfileToBusinessProfile = (profile: SupabaseBusinessProfile): BusinessProfile => ({
  id: profile.id,
  name: profile.name,
  email: profile.email,
  phone: profile.phone,
  address: profile.address,
  city: profile.city,
  state: profile.state,
  zip: profile.zip,
  country: profile.country,
  taxId: profile.tax_id,
  logoUrl: profile.logo_url,
  website: profile.website,
  defaultTaxRate: profile.default_tax_rate,
  defaultTerms: profile.default_terms,
  defaultNotes: profile.default_notes,
  bankInfo: profile.bank_info,
  theme: profile.theme,
  userId: profile.user_id,
  createdAt: profile.created_at,
  updatedAt: profile.updated_at,
  invoiceNumberFormat: profile.invoice_number_format,
  invoiceNumberSequence: profile.invoice_number_sequence,
});

const mapBusinessProfileToSupabaseBusinessProfile = async (
  profile: Omit<BusinessProfile, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Omit<SupabaseBusinessProfile, 'id' | 'created_at' | 'updated_at'>> => {
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id || '';

  return {
    name: profile.name,
    email: profile.email,
    phone: profile.phone || null,
    address: profile.address || null,
    city: profile.city || null,
    state: profile.state || null,
    zip: profile.zip || null,
    country: profile.country || 'New Zealand',
    tax_id: profile.taxId || null,
    logo_url: profile.logoUrl || null,
    website: profile.website || null,
    default_tax_rate: profile.defaultTaxRate || null,
    default_terms: profile.defaultTerms || null,
    default_notes: profile.defaultNotes || null,
    bank_info: profile.bankInfo || null,
    theme: profile.theme || null,
    user_id: profile.userId || userId,
    invoice_number_format: profile.invoiceNumberFormat || null,
    invoice_number_sequence: profile.invoiceNumberSequence ?? null
  };
};

const mapSupabaseItemCategoryToItemCategory = (category: SupabaseItemCategory): ItemCategory => ({
  id: category.id,
  name: category.name,
  userId: category.user_id,
  createdAt: category.created_at,
  updatedAt: category.updated_at
});

const mapItemCategoryToSupabaseItemCategory = async (category: Omit<ItemCategory, 'id' | 'createdAt' | 'updatedAt'>): Promise<Omit<SupabaseItemCategory, 'id' | 'created_at' | 'updated_at'>> => {
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id || '';

  return {
    name: category.name,
    user_id: category.userId || userId
  };
};

const mapSupabaseItemToItem = (supabaseItem: SupabaseItem & { item_categories?: SupabaseItemCategory }): Item => {
  return {
    id: supabaseItem.id,
    name: supabaseItem.name,
    description: supabaseItem.description,
    type: supabaseItem.type as 'product' | 'service',
    categoryId: supabaseItem.category_id,
    salePrice: supabaseItem.sale_price,
    purchasePrice: supabaseItem.purchase_price,
    taxRate: supabaseItem.tax_rate,
    enableSaleInfo: supabaseItem.enable_sale_info,
    enablePurchaseInfo: supabaseItem.enable_purchase_info,
    unit: supabaseItem.unit || 'each',
    category: supabaseItem.item_categories ? {
      id: supabaseItem.item_categories.id,
      name: supabaseItem.item_categories.name,
    } : undefined,
    createdAt: supabaseItem.created_at,
    updatedAt: supabaseItem.updated_at
  };
};

const mapItemToSupabaseItem = async (item: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'category'>): Promise<Omit<SupabaseItem, 'id' | 'created_at' | 'updated_at'>> => {
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id || '';

  return {
    name: item.name,
    description: item.description || null,
    type: item.type,
    category_id: item.categoryId || null,
    sale_price: item.salePrice || null,
    purchase_price: item.purchasePrice || null,
    tax_rate: item.taxRate || null,
    enable_sale_info: item.enableSaleInfo,
    enable_purchase_info: item.enablePurchaseInfo,
    unit: item.unit || 'each',
    user_id: item.userId || userId
  };
};

const mapSupabaseAccountToAccount = (account: SupabaseAccount): Account => ({
  id: account.id,
  name: account.name,
  type: account.type,
  currency: account.currency,
  openingBalance: account.opening_balance,
  currentBalance: account.current_balance,
  userId: account.user_id,
  createdAt: account.created_at,
  updatedAt: account.updated_at,
});

const mapAccountToSupabaseAccount = async (
  account: Omit<Account, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Omit<SupabaseAccount, 'id' | 'created_at' | 'updated_at'>> => {
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id || '';
  return {
    name: account.name,
    type: account.type,
    currency: account.currency,
    opening_balance: account.openingBalance,
    current_balance: account.currentBalance,
    user_id: account.userId || userId,
  };
};

const mapSupabaseExpenseCategoryToExpenseCategory = (category: SupabaseExpenseCategory): ExpenseCategory => ({
  id: category.id,
  name: category.name,
  description: category.description,
  color: category.color,
  userId: category.user_id,
  createdAt: category.created_at,
  updatedAt: category.updated_at,
});

const mapExpenseCategoryToSupabaseExpenseCategory = async (
  category: Omit<ExpenseCategory, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Omit<SupabaseExpenseCategory, 'id' | 'created_at' | 'updated_at'>> => {
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id || '';
  return {
    name: category.name,
    description: category.description || null,
    color: category.color || null,
    user_id: category.userId || userId,
  };
};

const mapSupabaseExpenseToExpense = (
  expense: SupabaseExpense & { 
    expense_categories?: SupabaseExpenseCategory;
    accounts?: SupabaseAccount;
    customers?: SupabaseCustomer;
  }
): Expense => ({
  id: expense.id,
  description: expense.description,
  amount: expense.amount,
  categoryId: expense.category_id,
  category: expense.expense_categories ? mapSupabaseExpenseCategoryToExpenseCategory(expense.expense_categories) : undefined,
  accountId: expense.account_id,
  account: expense.accounts ? mapSupabaseAccountToAccount(expense.accounts) : undefined,
  vendorName: expense.vendor_name,
  receiptUrl: expense.receipt_url,
  expenseDate: expense.expense_date,
  status: expense.status,
  isBillable: expense.is_billable,
  customerId: expense.customer_id,
  customer: expense.customers ? mapSupabaseCustomerToCustomer(expense.customers) : undefined,
  taxAmount: expense.tax_amount,
  currency: expense.currency,
  paymentMethod: expense.payment_method,
  notes: expense.notes,
  userId: expense.user_id,
  createdAt: expense.created_at,
  updatedAt: expense.updated_at,
});

const mapExpenseToSupabaseExpense = async (
  expense: Omit<Expense, 'id' | 'createdAt' | 'updatedAt' | 'category' | 'account' | 'customer'>
): Promise<Omit<SupabaseExpense, 'id' | 'created_at' | 'updated_at'>> => {
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id || '';
  return {
    description: expense.description,
    amount: expense.amount,
    category_id: expense.categoryId || null,
    account_id: expense.accountId || null,
    vendor_name: expense.vendorName || null,
    receipt_url: expense.receiptUrl || null,
    expense_date: expense.expenseDate,
    status: expense.status,
    is_billable: expense.isBillable,
    customer_id: expense.customerId || null,
    tax_amount: expense.taxAmount,
    currency: expense.currency,
    payment_method: expense.paymentMethod || null,
    notes: expense.notes || null,
    user_id: expense.userId || userId,
  };
};

export const customerService = {
  async getCustomers(): Promise<Customer[]> {
    if (customersApiEnabled()) {
      return customersApi.list();
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      console.error('No authenticated user found');
      return [];
    }
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('user_id', user.id)
      .order('name');

    if (error) {
      console.error('Error fetching customers:', error);
      throw error;
    }
    
    return (data as SupabaseCustomer[]).map(mapSupabaseCustomerToCustomer) || [];
  },

  async getCustomer(id: string): Promise<Customer | null> {
    if (customersApiEnabled()) {
      return customersApi.get(id);
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      console.error('No authenticated user found');
      return null;
    }
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (error) {
      console.error('Error fetching customer:', error);
      throw error;
    }
    
    return data ? mapSupabaseCustomerToCustomer(data as SupabaseCustomer) : null;
  },

  async createCustomer(customer: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>): Promise<Customer> {
    if (customersApiEnabled()) {
      return customersApi.create(toCreateCustomerRequest(customer));
    }
    const supabaseCustomer = await mapCustomerToSupabaseCustomer(customer);
    
    const { data, error } = await supabase
      .from('customers')
      .insert([supabaseCustomer])
      .select()
      .single();

    if (error) {
      console.error('Error creating customer:', error);
      throw error;
    }
    
    return mapSupabaseCustomerToCustomer(data as SupabaseCustomer);
  },

  async updateCustomer(id: string, customer: Partial<Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Customer> {
    if (customersApiEnabled()) {
      return customersApi.update(id, toUpdateCustomerRequest(customer));
    }
    const existingCustomer = await this.getCustomer(id);
    if (!existingCustomer) {
      throw new Error(`Customer with id ${id} not found`);
    }
    
    const mergedCustomer = {
      ...existingCustomer,
      ...customer,
      id: undefined,
      createdAt: undefined,
      updatedAt: undefined
    };
    
    const supabaseCustomer = await mapCustomerToSupabaseCustomer(mergedCustomer as Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>);
    
    const { data, error } = await supabase
      .from('customers')
      .update(supabaseCustomer)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating customer:', error);
      throw error;
    }
    
    return mapSupabaseCustomerToCustomer(data as SupabaseCustomer);
  },

  async deleteCustomer(id: string): Promise<void> {
    if (customersApiEnabled()) {
      await customersApi.remove(id);
      return;
    }
    const { error } = await supabase
      .from('customers')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting customer:', error);
      throw error;
    }
  }
};

export const invoiceService = {
  async getInvoices(): Promise<Invoice[]> {
    if (invoicesApiEnabled()) {
      return invoicesApi.list();
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      console.error('No authenticated user found');
      return [];
    }
    const { data: invoicesData, error: invoicesError } = await supabase
      .from('invoices')
      .select(`
        *,
        customers (name, email)
      `)
      .eq('user_id', user.id)
      .order('date', { ascending: false });

    if (invoicesError) {
      console.error('Error fetching invoices:', invoicesError);
      throw invoicesError;
    }
    
    const invoices = await Promise.all((invoicesData as SupabaseInvoice[]).map(async (invoice) => {
      const { data: lineItemsData } = await supabase
        .from('line_items')
        .select('*')
        .eq('invoice_id', invoice.id);
      
      return mapSupabaseInvoiceToInvoice(invoice as unknown as SupabaseInvoice, lineItemsData as SupabaseLineItem[]);
    }));
    
    return invoices || [];
  },

  async getInvoice(id: string): Promise<Invoice | null> {
    if (invoicesApiEnabled()) {
      return invoicesApi.get(id);
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      console.error('No authenticated user found');
      return null;
    }
    const { data: invoiceData, error: invoiceError } = await supabase
      .from('invoices')
      .select(`
        *,
        customers (*)
      `)
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (invoiceError) {
      console.error('Error fetching invoice:', invoiceError);
      throw invoiceError;
    }
    
    if (!invoiceData) {
      return null;
    }
    
    const { data: lineItemsData, error: lineItemsError } = await supabase
      .from('line_items')
      .select('*')
      .eq('invoice_id', id);
      
    if (lineItemsError) {
      console.error('Error fetching line items:', lineItemsError);
      throw lineItemsError;
    }
    
    return mapSupabaseInvoiceToInvoice(invoiceData as unknown as SupabaseInvoice, lineItemsData as SupabaseLineItem[]);
  },

  async getInvoicesForCustomer(customerId: string): Promise<Invoice[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      console.error('No authenticated user found');
      return [];
    }
    const { data: invoicesData, error: invoicesError } = await supabase
      .from('invoices')
      .select('*')
      .eq('customer_id', customerId)
      .eq('user_id', user.id)
      .order('date', { ascending: false });

    if (invoicesError) {
      console.error('Error fetching customer invoices:', invoicesError);
      throw invoicesError;
    }
    
    const invoices = await Promise.all((invoicesData as any[]).map(async (invoice) => {
      const { data: lineItemsData } = await supabase
        .from('line_items')
        .select('*')
        .eq('invoice_id', invoice.id);
      
      return mapSupabaseInvoiceToInvoice(invoice as unknown as SupabaseInvoice, lineItemsData as SupabaseLineItem[]);
    }));
    
    return invoices || [];
  },

  async createInvoice(invoice: Omit<Invoice, 'id' | 'createdAt' | 'updatedAt'>, lineItems: Omit<LineItem, 'id' | 'invoiceId' | 'createdAt' | 'updatedAt'>[]): Promise<Invoice> {
    if (invoicesApiEnabled()) {
      return invoicesApi.create(invoice, lineItems);
    }
    const supabaseInvoice = await mapInvoiceToSupabaseInvoice(invoice);
    
    // Get user ID for journal entry
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id;
    
    const { data: invoiceData, error: invoiceError } = await supabase
      .from('invoices')
      .insert([supabaseInvoice])
      .select()
      .single();

    if (invoiceError) {
      console.error('Error creating invoice:', invoiceError);
      throw invoiceError;
    }

    if (lineItems.length > 0) {
      const itemsWithInvoiceId = lineItems.map(item => ({
        description: item.description,
        quantity: item.quantity,
        unit: item.unit || 'each',
        rate: item.rate,
        rate_unit: item.rateUnit || item.unit || 'each',
        tax: item.tax || null,
        total: item.total,
        invoice_id: invoiceData.id
      }));

      const { error: lineItemsError } = await supabase
        .from('line_items')
        .insert(itemsWithInvoiceId);

      if (lineItemsError) {
        console.error('Error creating line items:', lineItemsError);
        throw lineItemsError;
      }
    }

    // Create journal entry for accounting
    if (userId) {
      try {
        await accountingJournalService.createInvoiceJournalEntry(
          userId,
          invoiceData.id,
          {
            subtotal: invoice.subtotal,
            taxAmount: invoice.taxAmount || 0,
            total: invoice.total,
            taxInclusive: invoiceData.tax_inclusive ?? true, // Default to true for NZ
            date: invoice.date,
            invoiceNumber: invoice.invoiceNumber
          }
        );
      } catch (journalError) {
        // Log error but don't fail invoice creation
        // The invoice exists, journal entry can be created manually if needed
        console.error('Error creating journal entry for invoice:', journalError);
      }
    }
    
    return this.getInvoice(invoiceData.id) as Promise<Invoice>;
  },

  async updateInvoice(id: string, invoice: Partial<Omit<Invoice, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Invoice> {
    if (invoicesApiEnabled()) {
      return invoicesApi.update(id, invoice, invoice.items);
    }
    const existingInvoice = await this.getInvoice(id);
    if (!existingInvoice) {
      throw new Error(`Invoice with id ${id} not found`);
    }
    
    const { items, customer, ...updatableInvoice } = invoice;
    
    const updatedInvoiceFields: Partial<SupabaseInvoice> = {};
    
    if (updatableInvoice.invoiceNumber) updatedInvoiceFields.invoice_number = updatableInvoice.invoiceNumber;
    if (updatableInvoice.customerId) updatedInvoiceFields.customer_id = updatableInvoice.customerId;
    if (updatableInvoice.date) updatedInvoiceFields.date = updatableInvoice.date;
    if (updatableInvoice.dueDate) updatedInvoiceFields.due_date = updatableInvoice.dueDate;
    if (updatableInvoice.subtotal) updatedInvoiceFields.subtotal = updatableInvoice.subtotal;
    if (updatableInvoice.taxAmount !== undefined) updatedInvoiceFields.tax_amount = updatableInvoice.taxAmount;
    if (updatableInvoice.discount !== undefined) updatedInvoiceFields.discount = updatableInvoice.discount;
    if (updatableInvoice.additionalCharges !== undefined) updatedInvoiceFields.additional_charges = updatableInvoice.additionalCharges;
    if (updatableInvoice.additionalChargesList !== undefined) updatedInvoiceFields.additional_charges_list = updatableInvoice.additionalChargesList;
    if (updatableInvoice.additionalChargesTotal !== undefined) updatedInvoiceFields.additional_charges_total = updatableInvoice.additionalChargesTotal;
    if (updatableInvoice.total) updatedInvoiceFields.total = updatableInvoice.total;
    if (updatableInvoice.status) updatedInvoiceFields.status = updatableInvoice.status;
    if (updatableInvoice.notes !== undefined) updatedInvoiceFields.notes = updatableInvoice.notes;
    if (updatableInvoice.terms !== undefined) updatedInvoiceFields.terms = updatableInvoice.terms;
    if (updatableInvoice.currency) updatedInvoiceFields.currency = updatableInvoice.currency;
    if (updatableInvoice.templateName !== undefined) updatedInvoiceFields.template_name = updatableInvoice.templateName;
    if (updatableInvoice.public_viewed_at !== undefined) updatedInvoiceFields.public_viewed_at = updatableInvoice.public_viewed_at;
    
    const { data, error } = await supabase
      .from('invoices')
      .update(updatedInvoiceFields)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating invoice:', error);
      throw error;
    }
    
    if (items && items.length > 0) {
      await supabase
        .from('line_items')
        .delete()
        .eq('invoice_id', id);
        
      const newItems = items.map(item => ({
        description: item.description,
        quantity: item.quantity,
        unit: item.unit || 'each',
        rate: item.rate,
        rate_unit: item.rateUnit || item.unit || 'each',
        tax: item.tax || null,
        total: item.total,
        invoice_id: id
      }));
      
      await supabase
        .from('line_items')
        .insert(newItems);
    }
    
    return this.getInvoice(id) as Promise<Invoice>;
  },

  async deleteInvoice(id: string): Promise<void> {
    const { error } = await supabase
      .from('invoices')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting invoice:', error);
      throw error;
    }
  },
  
  async updateInvoiceStatus(id: string, status: Invoice['status']): Promise<Invoice> {
    if (invoicesApiEnabled()) {
      return invoicesApi.updateStatus(id, status);
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      console.error('No authenticated user found');
      throw new Error('No authenticated user');
    }
    const { data, error } = await supabase
      .from('invoices')
      .update({ status })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating invoice status:', error);
      throw error;
    }
    
    return this.getInvoice(id) as Promise<Invoice>;
  },

  async getLineItems(invoiceId: string): Promise<LineItem[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      console.error('No authenticated user found');
      return [];
    }
    const { data, error } = await supabase
      .from('line_items')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('created_at');

    if (error) {
      console.error('Error fetching line items:', error);
      throw error;
    }
    
    return (data as SupabaseLineItem[]).map(item => ({
      id: item.id,
      invoiceId: item.invoice_id,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit || 'each',
      rate: item.rate,
      rateUnit: item.rate_unit || item.unit || 'each',
      tax: item.tax,
      total: item.total,
      createdAt: item.created_at,
      updatedAt: item.updated_at
    })) || [];
  },
  
  async addLineItem(invoiceId: string, lineItem: Omit<LineItem, 'id' | 'invoiceId' | 'createdAt' | 'updatedAt'>): Promise<LineItem> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      console.error('No authenticated user found');
      throw new Error('No authenticated user');
    }
    const { data, error } = await supabase
      .from('line_items')
      .insert([{ 
        description: lineItem.description,
        quantity: lineItem.quantity,
        unit: lineItem.unit || 'each',
        rate: lineItem.rate,
        rate_unit: lineItem.rateUnit || lineItem.unit || 'each',
        tax: lineItem.tax || null,
        total: lineItem.total,
        invoice_id: invoiceId 
      }])
      .select()
      .single();

    if (error) {
      console.error('Error adding line item:', error);
      throw error;
    }
    
    return {
      id: data.id,
      invoiceId: data.invoice_id,
      description: data.description,
      quantity: data.quantity,
      unit: 'each',
      rate: data.rate,
      tax: data.tax,
      total: data.total,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  },
  
  async updateLineItem(id: string, lineItem: Partial<Omit<LineItem, 'id' | 'invoiceId' | 'createdAt' | 'updatedAt'>>): Promise<LineItem> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      console.error('No authenticated user found');
      throw new Error('No authenticated user');
    }
    const updateData: any = {};
    if (lineItem.description !== undefined) updateData.description = lineItem.description;
    if (lineItem.quantity !== undefined) updateData.quantity = lineItem.quantity;
    if (lineItem.unit !== undefined) updateData.unit = lineItem.unit;
    if (lineItem.rate !== undefined) updateData.rate = lineItem.rate;
    if (lineItem.tax !== undefined) updateData.tax = lineItem.tax;
    if (lineItem.total !== undefined) updateData.total = lineItem.total;
    
    const { data, error } = await supabase
      .from('line_items')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating line item:', error);
      throw error;
    }
    
    return {
      id: data.id,
      invoiceId: data.invoice_id,
      description: data.description,
      quantity: data.quantity,
      unit: 'each',
      rate: data.rate,
      tax: data.tax,
      total: data.total,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  },
  
  async deleteLineItem(id: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      console.error('No authenticated user found');
      throw new Error('No authenticated user');
    }
    const { error } = await supabase
      .from('line_items')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting line item:', error);
      throw error;
    }
  },

  async getNextInvoiceNumber(): Promise<string> {
    if (invoicesApiEnabled()) {
      return invoicesApi.nextNumber();
    }
    // Get business profile
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) throw new Error('No authenticated user');
    const { data: profile, error: profileError } = await supabase
      .from('business_profiles')
      .select('*')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile) throw new Error('Business profile not found');
    const format = profile.invoice_number_format || 'INV-{YYYY}-{MM}-{SEQ}';

    // Fetch the latest invoice for this user
    const { data: lastInvoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('invoice_number, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (invoiceError) throw invoiceError;

    // Extract last sequence
    let lastSeq = 0;
    if (lastInvoice && lastInvoice.invoice_number) {
      // Try to extract the last sequence from the invoice number
      const match = lastInvoice.invoice_number.match(/(\d{3,})$/);
      if (match) {
        lastSeq = parseInt(match[1], 10);
      } else {
        // If no sequence found in format, use the stored sequence
        lastSeq = profile.invoice_number_sequence || 0;
      }
    } else {
         lastSeq = profile.invoice_number_sequence || 0;
    }
    const nextSeq = lastSeq + 1;

    // Format the new invoice number
    const currentDate = new Date();
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const seq = String(nextSeq).padStart(4, '0');
    let invoiceNumber = format
      .replace('{YYYY}', year.toString())
      .replace('{MM}', month)
      .replace('{SEQ}', seq);

    // Optionally update the business profile's sequence (if you want to keep it in sync)
    await supabase
      .from('business_profiles')
      .update({ invoice_number_sequence: nextSeq })
      .eq('user_id', user.id);

    return invoiceNumber;
  }
};

export const itemCategoryService = {
  async getItemCategories(): Promise<ItemCategory[]> {
    if (itemsApiEnabled()) {
      return (await itemsApi.list()).categories;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      console.error('No authenticated user found');
      return [];
    }
    const { data, error } = await supabase
      .from('item_categories')
      .select('*')
      .eq('user_id', user.id)
      .order('name');

    if (error) {
      console.error('Error fetching item categories:', error);
      throw error;
    }
    
    return (data as SupabaseItemCategory[]).map(mapSupabaseItemCategoryToItemCategory) || [];
  },

  async createItemCategory(category: Omit<ItemCategory, 'id' | 'createdAt' | 'updatedAt'>): Promise<ItemCategory> {
    if (itemsApiEnabled()) {
      return itemsApi.createCategory({ name: category.name, color: category.color ?? null });
    }
    const supabaseCategory = await mapItemCategoryToSupabaseItemCategory(category);
    
    const { data, error } = await supabase
      .from('item_categories')
      .insert([supabaseCategory])
      .select()
      .single();

    if (error) {
      console.error('Error creating item category:', error);
      throw error;
    }
    
    return mapSupabaseItemCategoryToItemCategory(data as SupabaseItemCategory);
  },

  async updateItemCategory(id: string, category: Partial<Omit<ItemCategory, 'id' | 'createdAt' | 'updatedAt'>>): Promise<ItemCategory> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      console.error('No authenticated user found');
      throw new Error('No authenticated user');
    }
    const { data: existingData } = await supabase
      .from('item_categories')
      .select()
      .eq('id', id)
      .eq('user_id', user.id)
      .single();
      
    if (!existingData) {
      throw new Error(`Category with id ${id} not found for this user`);
    }
    
    const { data, error } = await supabase
      .from('item_categories')
      .update({ name: category.name })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating item category:', error);
      throw error;
    }
    
    return mapSupabaseItemCategoryToItemCategory(data as SupabaseItemCategory);
  },

  async deleteItemCategory(id: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      console.error('No authenticated user found');
      throw new Error('No authenticated user');
    }
    const { error } = await supabase
      .from('item_categories')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting item category:', error);
      throw error;
    }
  }
};

export const itemService = {
  async getItems(): Promise<Item[]> {
    if (itemsApiEnabled()) {
      return (await itemsApi.list()).items;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      console.error('No authenticated user found');
      return [];
    }
    const { data: itemsData, error: itemsError } = await supabase
      .from('items')
      .select(`*, item_categories(*)`)
      .eq('user_id', user.id)
      .order('name');

    if (itemsError) {
      console.error('Error fetching items:', itemsError);
      throw itemsError;
    }
    
    return itemsData.map(item => {
      let category = undefined;
      if (item.item_categories) {
        category = mapSupabaseItemCategoryToItemCategory(item.item_categories);
      }
      
      return mapSupabaseItemToItem(item, category);
    }) || [];
  },

  async getItem(id: string): Promise<Item | null> {
    if (itemsApiEnabled()) {
      const item = (await itemsApi.list()).items.find((row) => row.id === id);
      return item ?? null;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      console.error('No authenticated user found');
      return null;
    }
    const { data, error } = await supabase
      .from('items')
      .select(`*, item_categories(*)`)
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      console.error('Error fetching item:', error);
      throw error;
    }

    let category = undefined;
    if (data.item_categories) {
      category = mapSupabaseItemCategoryToItemCategory(data.item_categories);
    }
    
    return data ? mapSupabaseItemToItem(data, category) : null;
  },

  async createItem(item: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'category'>): Promise<Item> {
    if (itemsApiEnabled()) {
      return itemsApi.create(toCreateItemRequest(item));
    }
    const supabaseItem = await mapItemToSupabaseItem(item);
    
    const { data, error } = await supabase
      .from('items')
      .insert([supabaseItem])
      .select(`*, item_categories(*)`)
      .single();

    if (error) {
      console.error('Error creating item:', error);
      throw error;
    }

    let category = undefined;
    if (data.item_categories) {
      category = mapSupabaseItemCategoryToItemCategory(data.item_categories);
    }
    
    return mapSupabaseItemToItem(data, category);
  },

  async updateItem(id: string, item: Partial<Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'category'>>): Promise<Item> {
    if (itemsApiEnabled()) {
      return itemsApi.update(id, toUpdateItemRequest(item));
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      console.error('No authenticated user found');
      throw new Error('No authenticated user');
    }
    const updateData: any = {};
    
    if (item.name !== undefined) updateData.name = item.name;
    if (item.description !== undefined) updateData.description = item.description;
    if (item.type !== undefined) updateData.type = item.type;
    if (item.categoryId !== undefined) updateData.category_id = item.categoryId;
    if (item.salePrice !== undefined) updateData.sale_price = item.salePrice;
    if (item.purchasePrice !== undefined) updateData.purchase_price = item.purchasePrice;
    if (item.taxRate !== undefined) updateData.tax_rate = item.taxRate;
    if (item.enableSaleInfo !== undefined) updateData.enable_sale_info = item.enableSaleInfo;
    if (item.enablePurchaseInfo !== undefined) updateData.enable_purchase_info = item.enablePurchaseInfo;
    if (item.unit !== undefined) updateData.unit = item.unit;
    
    const { data, error } = await supabase
      .from('items')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', user.id)
      .select(`*, item_categories(*)`)
      .single();

    if (error) {
      console.error('Error updating item:', error);
      throw error;
    }

    let category = undefined;
    if (data.item_categories) {
      category = mapSupabaseItemCategoryToItemCategory(data.item_categories);
    }
    
    return mapSupabaseItemToItem(data, category);
  },

  async deleteItem(id: string): Promise<void> {
    if (itemsApiEnabled()) {
      await itemsApi.remove(id);
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      console.error('No authenticated user found');
      throw new Error('No authenticated user');
    }
    const { error } = await supabase
      .from('items')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting item:', error);
      throw error;
    }
  },
  
  async getItemsByType(type: 'product' | 'service'): Promise<Item[]> {
    if (itemsApiEnabled()) {
      return (await itemsApi.list()).items.filter((item) => item.type === type);
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      console.error('No authenticated user found');
      return [];
    }
    const { data, error } = await supabase
      .from('items')
      .select(`*, item_categories(*)`)
      .eq('type', type)
      .eq('user_id', user.id)
      .order('name');

    if (error) {
      console.error(`Error fetching items by type ${type}:`, error);
      throw error;
    }
    
    return data.map(item => {
      let category = undefined;
      if (item.item_categories) {
        category = mapSupabaseItemCategoryToItemCategory(item.item_categories);
      }
      
      return mapSupabaseItemToItem(item, category);
    }) || [];
  }
};

export const businessProfileService = {
  async getBusinessProfile(): Promise<BusinessProfile | null> {
    if (businessProfileApiEnabled()) {
      return businessProfileApi.get();
    }
    const { data: { user } } = await supabase.auth.getUser();
    const sessionUser = user ?? (await supabase.auth.getSession()).data.session?.user;
    if (!sessionUser?.id) {
      console.error('No authenticated user found when checking business profile');
      return null;
    }
    
    console.log('Fetching business profile for user:', sessionUser.id);
    
    try {
      // Simplified query without timeout wrapper
      const { data, error } = await supabase
        .from('business_profiles')
        .select('*')
        .eq('user_id', sessionUser.id)
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error fetching business profile:', error);
        // Return null instead of throwing to prevent blocking onboarding check
        return null;
      }
      
      console.log('Business profile query result:', data ? 'Profile found' : 'No profile found');
      return data ? mapSupabaseBusinessProfileToBusinessProfile(data as SupabaseBusinessProfile) : null;
    } catch (error) {
      console.error('Business profile fetch failed:', error);
      // Return null instead of throwing to prevent blocking onboarding check
      return null;
    }
  },

  async createOrUpdateBusinessProfile(profile: Omit<BusinessProfile, 'id' | 'createdAt' | 'updatedAt'>): Promise<BusinessProfile> {
    if (businessProfileApiEnabled()) {
      return businessProfileApi.upsert(profile);
    }
    const { data: { user } } = await supabase.auth.getUser();
    const sessionUser = user ?? (await supabase.auth.getSession()).data.session?.user;
    const userId = sessionUser?.id || profile.userId;
    if (!userId) {
      throw new Error('No authenticated user');
    }
    
    const profileWithUserId = {
      ...profile,
      userId
    };
    
    const supabaseProfile = await mapBusinessProfileToSupabaseBusinessProfile(profileWithUserId);
    
    const { data: existingProfile } = await supabase
      .from('business_profiles')
      .select('id')
      .eq('user_id', userId)
      .limit(1);
    
    let result;
    
    if (existingProfile && existingProfile.length > 0) {
      const { data, error } = await supabase
        .from('business_profiles')
        .update(supabaseProfile)
        .eq('id', existingProfile[0].id)
        .select()
        .single();
        
      if (error) {
        console.error('Error updating business profile:', error);
        throw error;
      }
      
      result = data;
    } else {
      const { data, error } = await supabase
        .from('business_profiles')
        .insert([supabaseProfile])
        .select()
        .single();
        
      if (error) {
        console.error('Error creating business profile:', error);
        throw error;
      }
      
      result = data;
    }
    
    return mapSupabaseBusinessProfileToBusinessProfile(result as SupabaseBusinessProfile);
  },

  async saveBusinessProfile(profile: Omit<BusinessProfile, 'id' | 'createdAt' | 'updatedAt'>): Promise<BusinessProfile> {
    // saveBusinessProfile is an alias for createOrUpdateBusinessProfile
    return this.createOrUpdateBusinessProfile(profile);
  },

  async updateBusinessProfile(profile: BusinessProfile): Promise<BusinessProfile> {
    if (businessProfileApiEnabled()) {
      return businessProfileApi.upsert(profile);
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      throw new Error('No authenticated user');
    }
    
    const profileWithUserId = {
      ...profile,
      userId: user.id
    };
    
    const supabaseProfile = await mapBusinessProfileToSupabaseBusinessProfile(profileWithUserId);
    
    const { data, error } = await supabase
      .from('business_profiles')
      .update(supabaseProfile)
      .eq('id', profile.id)
      .select()
      .single();
      
    if (error) {
      console.error('Error updating business profile:', error);
      throw error;
    }
    
    return mapSupabaseBusinessProfileToBusinessProfile(data as SupabaseBusinessProfile);
  }
};

export const dashboardService = {
  async getDashboardStats() {
    const user = await supabase.auth.getUser();
    if (!user.data.user?.id) {
      throw new Error('No authenticated user');
    }
    
    const { data: invoices, error: invoicesError } = await supabase
      .from('invoices')
      .select('*')
      .eq('user_id', user.data.user.id);
      
    if (invoicesError) {
      console.error('Error fetching invoices for stats:', invoicesError);
      throw invoicesError;
    }
    
    const { count: customerCount, error: customerError } = await supabase
      .from('customers')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.data.user.id);
      
    if (customerError) {
      console.error('Error counting customers:', customerError);
      throw customerError;
    }
    
    const totalEarnings = invoices
      ?.filter(i => i.status === 'paid')
      .reduce((sum, invoice) => sum + (Number(invoice.total) || 0), 0) || 0;
      
    const paidInvoices = invoices?.filter(i => i.status === 'paid').length || 0;
    const unpaidInvoices = invoices?.filter(i => i.status === 'sent').length || 0;
    const overdueInvoices = invoices?.filter(i => i.status === 'overdue').length || 0;
    
    const currentYear = new Date().getFullYear();
    const monthlyRevenue = Array(12).fill(0).map((_, i) => ({ month: i + 1, revenue: 0 }));
    
    invoices
      ?.filter(invoice => {
        const invoiceYear = new Date(invoice.date).getFullYear();
        return invoiceYear === currentYear && invoice.status === 'paid';
      })
      .forEach(invoice => {
        const month = new Date(invoice.date).getMonth();
        monthlyRevenue[month].revenue += Number(invoice.total) || 0;
      });
      
    return {
      totalEarnings,
      paidInvoices,
      unpaidInvoices,
      overdueInvoices,
      customerCount: customerCount || 0,
      revenueByMonth: monthlyRevenue
    };
  }
};

export const accountService = {
  async getAccounts(): Promise<Account[]> {
    if (accountsApiEnabled()) {
      return accountsApi.list();
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      console.error('No authenticated user found');
      return [];
    }
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('user_id', user.id)
      .order('name');
    if (error) {
      console.error('Error fetching accounts:', error);
      throw error;
    }
    return (data as SupabaseAccount[]).map(mapSupabaseAccountToAccount) || [];
  },

  async getAccount(id: string): Promise<Account | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      console.error('No authenticated user found');
      return null;
    }
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();
    if (error) {
      console.error('Error fetching account:', error);
      throw error;
    }
    return data ? mapSupabaseAccountToAccount(data as SupabaseAccount) : null;
  },

  async createAccount(account: Omit<Account, 'id' | 'createdAt' | 'updatedAt'>): Promise<Account> {
    const supabaseAccount = await mapAccountToSupabaseAccount(account);
    const { data, error } = await supabase
      .from('accounts')
      .insert([supabaseAccount])
      .select()
      .single();
    if (error) {
      console.error('Error creating account:', error);
      throw error;
    }
    return mapSupabaseAccountToAccount(data as SupabaseAccount);
  },

  async updateAccount(id: string, account: Partial<Omit<Account, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Account> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      console.error('No authenticated user found');
      throw new Error('No authenticated user');
    }
    const existingAccount = await this.getAccount(id);
    if (!existingAccount) {
      throw new Error(`Account with id ${id} not found for this user`);
    }
    const mergedAccount = {
      ...existingAccount,
      ...account,
      id: undefined,
      createdAt: undefined,
      updatedAt: undefined,
    };
    const supabaseAccount = await mapAccountToSupabaseAccount(mergedAccount as Omit<Account, 'id' | 'createdAt' | 'updatedAt'>);
    const { data, error } = await supabase
      .from('accounts')
      .update(supabaseAccount)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();
    if (error) {
      console.error('Error updating account:', error);
      throw error;
    }
    return mapSupabaseAccountToAccount(data as SupabaseAccount);
  },

  async deleteAccount(id: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      console.error('No authenticated user found');
      throw new Error('No authenticated user');
    }
    const { error } = await supabase
      .from('accounts')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);
    if (error) {
      console.error('Error deleting account:', error);
      throw error;
    }
  },
};

export const expenseCategoryService = {
  async getExpenseCategories(): Promise<ExpenseCategory[]> {
    if (expensesApiEnabled()) {
      return expensesApi.listCategories();
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      console.error('No authenticated user found');
      return [];
    }
    
    const { data, error } = await supabase
      .from('expense_categories')
      .select('*')
      .eq('user_id', user.id)
      .order('name');

    if (error) {
      console.error('Error fetching expense categories:', error);
      throw error;
    }
    
    return (data as SupabaseExpenseCategory[]).map(mapSupabaseExpenseCategoryToExpenseCategory) || [];
  },

  async getExpenseCategory(id: string): Promise<ExpenseCategory | null> {
    if (expensesApiEnabled()) {
      const categories = await expensesApi.listCategories();
      return categories.find((category) => category.id === id) ?? null;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      console.error('No authenticated user found');
      return null;
    }
    
    const { data, error } = await supabase
      .from('expense_categories')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      console.error('Error fetching expense category:', error);
      throw error;
    }
    
    return data ? mapSupabaseExpenseCategoryToExpenseCategory(data as SupabaseExpenseCategory) : null;
  },

  async createExpenseCategory(category: Omit<ExpenseCategory, 'id' | 'createdAt' | 'updatedAt'>): Promise<ExpenseCategory> {
    if (expensesApiEnabled()) {
      return expensesApi.createCategory(toCreateExpenseCategoryRequest(category));
    }
    const supabaseCategory = await mapExpenseCategoryToSupabaseExpenseCategory(category);
    
    const { data, error } = await supabase
      .from('expense_categories')
      .insert([supabaseCategory])
      .select()
      .single();

    if (error) {
      console.error('Error creating expense category:', error);
      throw error;
    }
    
    return mapSupabaseExpenseCategoryToExpenseCategory(data as SupabaseExpenseCategory);
  },

  async updateExpenseCategory(id: string, category: Partial<Omit<ExpenseCategory, 'id' | 'createdAt' | 'updatedAt'>>): Promise<ExpenseCategory> {
    if (expensesApiEnabled()) {
      const input: { name?: string; description?: string | null; color?: string | null } = {};
      if (category.name !== undefined) input.name = category.name;
      if (category.description !== undefined) input.description = category.description ?? null;
      if (category.color !== undefined) input.color = category.color ?? null;
      return expensesApi.updateCategory(id, input);
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      throw new Error('No authenticated user found');
    }

    const updateData: Partial<SupabaseExpenseCategory> = {};
    if (category.name !== undefined) updateData.name = category.name;
    if (category.description !== undefined) updateData.description = category.description || null;
    if (category.color !== undefined) updateData.color = category.color || null;

    const { data, error } = await supabase
      .from('expense_categories')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating expense category:', error);
      throw error;
    }
    
    return mapSupabaseExpenseCategoryToExpenseCategory(data as SupabaseExpenseCategory);
  },

  async deleteExpenseCategory(id: string): Promise<void> {
    if (expensesApiEnabled()) {
      await expensesApi.removeCategory(id);
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      throw new Error('No authenticated user found');
    }

    const { error } = await supabase
      .from('expense_categories')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting expense category:', error);
      throw error;
    }
  },
};

export const expenseService = {
  async getExpenses(filters?: { 
    categoryId?: string; 
    accountId?: string; 
    customerId?: string; 
    status?: ExpenseStatus; 
    dateFrom?: string; 
    dateTo?: string; 
  }): Promise<Expense[]> {
    if (expensesApiEnabled()) {
      let rows = await expensesApi.listExpenses();
      if (filters?.categoryId) rows = rows.filter((row) => row.categoryId === filters.categoryId);
      if (filters?.accountId) rows = rows.filter((row) => row.accountId === filters.accountId);
      if (filters?.customerId) rows = rows.filter((row) => row.customerId === filters.customerId);
      if (filters?.status) rows = rows.filter((row) => row.status === filters.status);
      if (filters?.dateFrom) rows = rows.filter((row) => row.expenseDate >= filters.dateFrom!);
      if (filters?.dateTo) rows = rows.filter((row) => row.expenseDate <= filters.dateTo!);
      return rows;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      console.error('No authenticated user found');
      return [];
    }
    
    let query = supabase
      .from('expenses')
      .select(`
        *,
        expense_categories(*),
        accounts(*),
        customers(*)
      `)
      .eq('user_id', user.id);

    if (filters?.categoryId) {
      query = query.eq('category_id', filters.categoryId);
    }
    if (filters?.accountId) {
      query = query.eq('account_id', filters.accountId);
    }
    if (filters?.customerId) {
      query = query.eq('customer_id', filters.customerId);
    }
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.dateFrom) {
      query = query.gte('expense_date', filters.dateFrom);
    }
    if (filters?.dateTo) {
      query = query.lte('expense_date', filters.dateTo);
    }

    const { data, error } = await query.order('expense_date', { ascending: false });

    if (error) {
      console.error('Error fetching expenses:', error);
      throw error;
    }
    
    return (data as any[]).map(mapSupabaseExpenseToExpense) || [];
  },

  async getExpense(id: string): Promise<Expense | null> {
    if (expensesApiEnabled()) {
      return expensesApi.get(id);
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      console.error('No authenticated user found');
      return null;
    }
    
    const { data, error } = await supabase
      .from('expenses')
      .select(`
        *,
        expense_categories(*),
        accounts(*),
        customers(*)
      `)
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      console.error('Error fetching expense:', error);
      throw error;
    }
    
    return data ? mapSupabaseExpenseToExpense(data as any) : null;
  },

  async createExpense(expense: Omit<Expense, 'id' | 'createdAt' | 'updatedAt' | 'category' | 'account' | 'customer'>): Promise<Expense> {
    if (expensesApiEnabled()) {
      return expensesApi.create(toCreateExpenseRequest(expense));
    }
    const supabaseExpense = await mapExpenseToSupabaseExpense(expense);
    
    const { data, error } = await supabase
      .from('expenses')
      .insert([supabaseExpense])
      .select(`
        *,
        expense_categories(*),
        accounts(*),
        customers(*)
      `)
      .single();

    if (error) {
      console.error('Error creating expense:', error);
      throw error;
    }
    
    return mapSupabaseExpenseToExpense(data as any);
  },

  async updateExpense(id: string, expense: Partial<Omit<Expense, 'id' | 'createdAt' | 'updatedAt' | 'category' | 'account' | 'customer'>>): Promise<Expense> {
    if (expensesApiEnabled()) {
      return expensesApi.update(id, toUpdateExpenseRequest(expense));
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      throw new Error('No authenticated user found');
    }

    const updateData: Partial<SupabaseExpense> = {};
    if (expense.description !== undefined) updateData.description = expense.description;
    if (expense.amount !== undefined) updateData.amount = expense.amount;
    if (expense.categoryId !== undefined) updateData.category_id = expense.categoryId || null;
    if (expense.accountId !== undefined) updateData.account_id = expense.accountId || null;
    if (expense.vendorName !== undefined) updateData.vendor_name = expense.vendorName || null;
    if (expense.receiptUrl !== undefined) updateData.receipt_url = expense.receiptUrl || null;
    if (expense.expenseDate !== undefined) updateData.expense_date = expense.expenseDate;
    if (expense.status !== undefined) updateData.status = expense.status;
    if (expense.isBillable !== undefined) updateData.is_billable = expense.isBillable;
    if (expense.customerId !== undefined) updateData.customer_id = expense.customerId || null;
    if (expense.taxAmount !== undefined) updateData.tax_amount = expense.taxAmount;
    if (expense.currency !== undefined) updateData.currency = expense.currency;
    if (expense.paymentMethod !== undefined) updateData.payment_method = expense.paymentMethod || null;
    if (expense.notes !== undefined) updateData.notes = expense.notes || null;

    const { data, error } = await supabase
      .from('expenses')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', user.id)
      .select(`
        *,
        expense_categories(*),
        accounts(*),
        customers(*)
      `)
      .single();

    if (error) {
      console.error('Error updating expense:', error);
      throw error;
    }
    
    return mapSupabaseExpenseToExpense(data as any);
  },

  async deleteExpense(id: string): Promise<void> {
    if (expensesApiEnabled()) {
      await expensesApi.remove(id);
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      throw new Error('No authenticated user found');
    }

    // First get the expense to check for receipt files
    const expense = await this.getExpense(id);
    
    // Delete the expense record
    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting expense:', error);
      throw error;
    }

    // If expense had a receipt file uploaded to our storage, delete it
    if (expense?.receiptUrl && expense.receiptUrl.includes('/storage/v1/object/public/business-assets/receipts/')) {
      try {
        const { storageService } = await import('./storageService');
        await storageService.deleteReceipt(expense.receiptUrl);
      } catch (storageError) {
        console.warn('Failed to delete receipt file:', storageError);
        // Don't throw here - expense deletion succeeded, file cleanup is secondary
      }
    }
  },

  async getExpensesByCategory(): Promise<{ category: string; amount: number; count: number }[]> {
    if (expensesApiEnabled()) {
      const rows = await expensesApi.listExpenses();
      const categoryTotals = new Map<string, { amount: number; count: number }>();
      rows.forEach((expense) => {
        const categoryName = expense.category?.name || 'Uncategorized';
        const existing = categoryTotals.get(categoryName) || { amount: 0, count: 0 };
        categoryTotals.set(categoryName, {
          amount: existing.amount + expense.amount,
          count: existing.count + 1,
        });
      });
      return Array.from(categoryTotals.entries()).map(([category, data]) => ({
        category,
        amount: data.amount,
        count: data.count,
      }));
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      console.error('No authenticated user found');
      return [];
    }

    const { data, error } = await supabase
      .from('expenses')
      .select(`
        amount,
        expense_categories(name)
      `)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error fetching expenses by category:', error);
      throw error;
    }

    const categoryTotals = new Map<string, { amount: number; count: number }>();
    
    data?.forEach((expense: any) => {
      const categoryName = expense.expense_categories?.name || 'Uncategorized';
      const existing = categoryTotals.get(categoryName) || { amount: 0, count: 0 };
      categoryTotals.set(categoryName, {
        amount: existing.amount + expense.amount,
        count: existing.count + 1
      });
    });

    return Array.from(categoryTotals.entries()).map(([category, data]) => ({
      category,
      amount: data.amount,
      count: data.count
    }));
  },

  async getMonthlyExpenseTotals(year: number): Promise<{ month: number; amount: number }[]> {
    if (expensesApiEnabled()) {
      const rows = await expensesApi.listExpenses();
      const monthlyTotals = new Array(12).fill(0);
      rows.forEach((expense) => {
        if (!expense.expenseDate.startsWith(String(year))) return;
        const month = new Date(expense.expenseDate).getMonth();
        monthlyTotals[month] += expense.amount;
      });
      return monthlyTotals.map((amount, index) => ({ month: index + 1, amount }));
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      console.error('No authenticated user found');
      return [];
    }

    const { data, error } = await supabase
      .from('expenses')
      .select('amount, expense_date')
      .eq('user_id', user.id)
      .gte('expense_date', `${year}-01-01`)
      .lte('expense_date', `${year}-12-31`);

    if (error) {
      console.error('Error fetching monthly expense totals:', error);
      throw error;
    }

    const monthlyTotals = new Array(12).fill(0);
    
    data?.forEach((expense: any) => {
      const month = new Date(expense.expense_date).getMonth();
      monthlyTotals[month] += expense.amount;
    });

    return monthlyTotals.map((amount, index) => ({
      month: index + 1,
      amount
    }));
  }
};

export const publicInvoiceService = {
  async getPublicInvoice(invoiceId: string): Promise<{ invoice: Invoice; businessProfile: BusinessProfile | null } | null> {
    try {
      const { data: invoiceData, error: invoiceError } = await supabase
        .from('invoices')
        .select(`
          *,
          customers (*)
        `)
        .eq('id', invoiceId)
        .single();

      if (invoiceError || !invoiceData) {
        console.error('Error fetching public invoice:', invoiceError);
        return null;
      }
      
      const { data: lineItemsData, error: lineItemsError } = await supabase
        .from('line_items')
        .select('*')
        .eq('invoice_id', invoiceId);
        
      if (lineItemsError) {
        console.error('Error fetching line items:', lineItemsError);
        return null;
      }
      
      const invoice = mapSupabaseInvoiceToInvoice(invoiceData as unknown as SupabaseInvoice, lineItemsData as SupabaseLineItem[]);
      
      // Fetch business profile for the invoice's user_id
      let businessProfile: BusinessProfile | null = null;
      if (invoiceData.user_id) {
        const { data: businessProfileData, error: businessProfileError } = await supabase
          .from('business_profiles')
          .select('*')
          .eq('user_id', invoiceData.user_id)
          .maybeSingle();
        if (businessProfileError) {
          console.error('Error fetching business profile:', businessProfileError);
        } else if (businessProfileData) {
          businessProfile = mapSupabaseBusinessProfileToBusinessProfile(businessProfileData as SupabaseBusinessProfile);
        }
      }
      
      // Update public_viewed_at timestamp
      await supabase
        .from('invoices')
        .update({ public_viewed_at: new Date().toISOString() })
        .eq('id', invoiceId);
      
      return { invoice, businessProfile };
    } catch (error) {
      console.error('Error in getPublicInvoice:', error);
      return null;
    }
  }
};

// Helper functions for shared invoices
const mapSupabaseSharedInvoiceToSharedInvoice = (sharedInvoice: SupabaseSharedInvoice): SharedInvoice => ({
  id: sharedInvoice.id,
  originalInvoiceId: sharedInvoice.original_invoice_id,
  invoiceData: sharedInvoice.invoice_data,
  templateData: sharedInvoice.template_data,
  shareToken: sharedInvoice.share_token,
  createdAt: sharedInvoice.created_at,
  expiresAt: sharedInvoice.expires_at,
  accessCount: sharedInvoice.access_count,
  isActive: sharedInvoice.is_active,
  createdBy: sharedInvoice.created_by,
});

export const sharedInvoiceService = {
  async createSharedInvoice(
    invoiceId: string, 
    templateName: InvoiceTemplateName,
    expiresAt?: string
  ): Promise<SharedInvoice> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      throw new Error('No authenticated user');
    }

    // Get the invoice data with all related information
    const { data: invoiceData, error: invoiceError } = await supabase
      .from('invoices')
      .select(`
        *,
        customers(*),
        line_items(*)
      `)
      .eq('id', invoiceId)
      .eq('user_id', user.id)
      .single();

    if (invoiceError || !invoiceData) {
      throw new Error('Invoice not found or access denied');
    }

    // Get business profile
    const { data: businessProfileData, error: businessProfileError } = await supabase
      .from('business_profiles')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (businessProfileError || !businessProfileData) {
      throw new Error('Business profile not found');
    }

    // Prepare the invoice data snapshot
    const invoice = mapSupabaseInvoiceToInvoice(invoiceData, invoiceData.line_items || []);
    const businessProfile = mapSupabaseBusinessProfileToBusinessProfile(businessProfileData);

    // Create shared invoice record
    const { data, error } = await supabase
      .from('shared_invoices')
      .insert([{
        original_invoice_id: invoiceId,
        invoice_data: invoice,
        template_data: {
          templateName,
          businessProfile
        },
        expires_at: expiresAt || null,
        created_by: user.id
      }])
      .select()
      .single();

    if (error) {
      console.error('Error creating shared invoice:', error);
      throw error;
    }

    return mapSupabaseSharedInvoiceToSharedInvoice(data);
  },

  async getSharedInvoiceByToken(shareToken: string): Promise<{ 
    invoiceData: Invoice; 
    templateData: { templateName: string; businessProfile: BusinessProfile }; 
  } | null> {
    try {
      // This needs to be a public function call since it's accessed anonymously
      const { data, error } = await supabase.rpc('get_shared_invoice_by_token', {
        token: shareToken
      });

      if (error) {
        console.error('Error fetching shared invoice by token:', error);
        return null;
      }

      // RPC functions return arrays, so we get the first result
      const sharedInvoice = data && data.length > 0 ? data[0] : null;

      if (!sharedInvoice || !sharedInvoice.is_active) {
        return null;
      }

      // Check expiration
      if (sharedInvoice.expires_at && new Date(sharedInvoice.expires_at) < new Date()) {
        return null;
      }

      // Increment access count
      await supabase.rpc('increment_shared_invoice_access', {
        token: shareToken
      });

      return {
        invoiceData: sharedInvoice.invoice_data,
        templateData: sharedInvoice.template_data
      };
    } catch (error) {
      console.error('Error in getSharedInvoiceByToken:', error);
      return null;
    }
  },

  async getSharedInvoices(): Promise<SharedInvoice[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      return [];
    }

    const { data, error } = await supabase
      .from('shared_invoices')
      .select('*')
      .eq('created_by', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching shared invoices:', error);
      throw error;
    }

    return data.map(mapSupabaseSharedInvoiceToSharedInvoice);
  },

  async updateSharedInvoice(id: string, updates: { isActive?: boolean; expiresAt?: string | null }): Promise<SharedInvoice> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      throw new Error('No authenticated user');
    }

    const updateData: any = {};
    if (updates.isActive !== undefined) updateData.is_active = updates.isActive;
    if (updates.expiresAt !== undefined) updateData.expires_at = updates.expiresAt;

    const { data, error } = await supabase
      .from('shared_invoices')
      .update(updateData)
      .eq('id', id)
      .eq('created_by', user.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating shared invoice:', error);
      throw error;
    }

    return mapSupabaseSharedInvoiceToSharedInvoice(data);
  },

  async deleteSharedInvoice(id: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      throw new Error('No authenticated user');
    }

    const { error } = await supabase
      .from('shared_invoices')
      .delete()
      .eq('id', id)
      .eq('created_by', user.id);

    if (error) {
      console.error('Error deleting shared invoice:', error);
      throw error;
    }
  }
};
