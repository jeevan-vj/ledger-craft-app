/**
 * Stable Data Manager - Singleton pattern for API calls
 * This is completely independent of React lifecycle and HMR
 */

import { customerService, invoiceService, businessProfileService, itemService, itemCategoryService, accountService, expenseService, expenseCategoryService } from "@/services/supabaseService";
import { paymentService } from "@/services/paymentService";
import { Customer, Invoice, BusinessProfile, Item, ItemCategory, Account, Expense, ExpenseCategory } from "@/types";
import { Payment, Receipt, CreatePaymentRequest, EnhancedInvoice } from "@/types/payment";

interface DataState {
  customers: Customer[];
  invoices: Invoice[];
  businessProfile: BusinessProfile | null;
  items: Item[];
  itemCategories: ItemCategory[];
  accounts: Account[];
  expenses: Expense[];
  expenseCategories: ExpenseCategory[];
  payments: Payment[];
  receipts: Receipt[];
}

interface LoadingState {
  customers: boolean;
  invoices: boolean;
  businessProfile: boolean;
  items: boolean;
  itemCategories: boolean;
  accounts: boolean;
  expenses: boolean;
  expenseCategories: boolean;
  payments: boolean;
  receipts: boolean;
}

type DataKey = keyof DataState;
type Subscriber = (data: DataState, loading: LoadingState) => void;

class DataManager {
  private static instance: DataManager;
  private data: DataState = {
    customers: [],
    invoices: [],
    businessProfile: null,
    items: [],
    itemCategories: [],
    accounts: [],
    expenses: [],
    expenseCategories: [],
    payments: [],
    receipts: []
  };

  private loading: LoadingState = {
    customers: true,
    invoices: true,
    businessProfile: true,
    items: true,
    itemCategories: true,
    accounts: true,
    expenses: true,
    expenseCategories: true,
    payments: true,
    receipts: true
  };

  private subscribers: Set<Subscriber> = new Set();
  private initialized = false;
  private currentUserId: string | null = null;

  private constructor() {}

  static getInstance(): DataManager {
    if (!DataManager.instance) {
      DataManager.instance = new DataManager();
    }
    return DataManager.instance;
  }

  // Subscribe to data changes
  subscribe(callback: Subscriber): () => void {
    this.subscribers.add(callback);
    // Immediately call with current data
    callback(this.data, this.loading);
    
    return () => {
      this.subscribers.delete(callback);
    };
  }

  // Notify all subscribers
  private notify() {
    this.subscribers.forEach(callback => {
      callback(this.data, this.loading);
    });
  }

  // Initialize data for a user (only once per user)
  async initialize(userId: string): Promise<void> {
    if (this.initialized && this.currentUserId === userId) {
      console.log('DataManager: Already initialized for user', userId);
      return;
    }

    if (this.currentUserId !== userId) {
      console.log('DataManager: New user, resetting data');
      this.reset();
    }

    console.log('DataManager: Initializing data for user', userId);
    this.currentUserId = userId;
    this.initialized = true;

    // Fetch all data in parallel
    await Promise.all([
      this.fetchCustomers(),
      this.fetchInvoices(),
      this.fetchBusinessProfile(),
      this.fetchItems(),
      this.fetchItemCategories(),
      this.fetchAccounts(),
      this.fetchExpenses(),
      this.fetchExpenseCategories(),
      this.fetchPayments(),
      this.fetchReceipts()
    ]);
  }

  // Reset data (for user logout)
  reset(): void {
    console.log('DataManager: Resetting data');
    this.data = {
      customers: [],
      invoices: [],
      businessProfile: null,
      items: [],
      itemCategories: [],
      accounts: [],
      expenses: [],
      expenseCategories: [],
      payments: [],
      receipts: []
    };
    this.loading = {
      customers: true,
      invoices: true,
      businessProfile: true,
      items: true,
      itemCategories: true,
      accounts: true,
      expenses: true,
      expenseCategories: true,
      payments: true,
      receipts: true
    };
    this.initialized = false;
    this.currentUserId = null;
    this.notify();
  }

  // Generic fetch method
  private async fetchData<Key extends keyof DataState>(
    key: Key,
    fetchFn: () => Promise<DataState[Key]>,
    transform?: (data: DataState[Key]) => DataState[Key]
  ): Promise<void> {
    try {
      this.loading[key] = true;
      this.notify();

      const result = await fetchFn();
      this.data[key] = transform ? transform(result) : result;
    } catch (error) {
      console.error(`DataManager: Error fetching ${key}:`, error);
    } finally {
      this.loading[key] = false;
      this.notify();
    }
  }

  // Individual fetch methods
  async fetchCustomers(): Promise<void> {
    await this.fetchData('customers', () => customerService.getCustomers());
  }

  async fetchInvoices(): Promise<void> {
    await this.fetchData('invoices', () => invoiceService.getInvoices(), (data: Invoice[]) => 
      data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    );
  }

  async fetchBusinessProfile(): Promise<void> {
    await this.fetchData('businessProfile', () => businessProfileService.getBusinessProfile());
  }

  async fetchItems(): Promise<void> {
    await this.fetchData('items', () => itemService.getItems());
  }

  async fetchItemCategories(): Promise<void> {
    await this.fetchData('itemCategories', () => itemCategoryService.getItemCategories());
  }

  async fetchAccounts(): Promise<void> {
    await this.fetchData('accounts', () => accountService.getAccounts());
  }

  async fetchExpenses(): Promise<void> {
    await this.fetchData('expenses', () => expenseService.getExpenses());
  }

  async fetchExpenseCategories(): Promise<void> {
    await this.fetchData('expenseCategories', () => expenseCategoryService.getExpenseCategories());
  }

  async fetchPayments(): Promise<void> {
    await this.fetchData('payments', () => paymentService.getPayments());
  }

  async fetchReceipts(): Promise<void> {
    await this.fetchData('receipts', () => paymentService.getReceipts());
  }

  // Getters for current data
  getData(): DataState {
    return { ...this.data };
  }

  getLoading(): LoadingState {
    return { ...this.loading };
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getCurrentUserId(): string | null {
    return this.currentUserId;
  }

  // CRUD Operations
  async createInvoice(invoice: Omit<Invoice, "id" | "createdAt" | "updatedAt">): Promise<Invoice> {
    try {
      const newInvoice = await invoiceService.createInvoice(invoice, invoice.items);
      // Add to local state and sort
      this.data.invoices = [newInvoice, ...this.data.invoices]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      this.notify();
      return newInvoice;
    } catch (error) {
      console.error('DataManager: Error creating invoice:', error);
      throw error;
    }
  }

  async updateInvoice(invoice: Invoice): Promise<Invoice> {
    try {
      const updatedInvoice = await invoiceService.updateInvoice(invoice.id, invoice);
      // Update in local state
      const index = this.data.invoices.findIndex(i => i.id === invoice.id);
      if (index !== -1) {
        this.data.invoices[index] = updatedInvoice;
        this.notify();
      }
      return updatedInvoice;
    } catch (error) {
      console.error('DataManager: Error updating invoice:', error);
      throw error;
    }
  }

  async deleteInvoice(id: string): Promise<void> {
    try {
      await invoiceService.deleteInvoice(id);
      // Remove from local state
      this.data.invoices = this.data.invoices.filter(i => i.id !== id);
      this.notify();
    } catch (error) {
      console.error('DataManager: Error deleting invoice:', error);
      throw error;
    }
  }

  async getNextInvoiceNumber(): Promise<string> {
    try {
      return await invoiceService.getNextInvoiceNumber();
    } catch (error) {
      console.error('DataManager: Error getting next invoice number:', error);
      throw error;
    }
  }

  async updateInvoiceStatus(id: string, status: Invoice['status']): Promise<Invoice> {
    try {
      const updatedInvoice = await invoiceService.updateInvoiceStatus(id, status);
      // Update in local state
      const index = this.data.invoices.findIndex(i => i.id === id);
      if (index !== -1) {
        this.data.invoices[index] = updatedInvoice;
        this.notify();
      }
      return updatedInvoice;
    } catch (error) {
      console.error('DataManager: Error updating invoice status:', error);
      throw error;
    }
  }

  async getInvoice(id: string): Promise<Invoice | null> {
    try {
      return await invoiceService.getInvoice(id);
    } catch (error) {
      console.error('DataManager: Error getting invoice:', error);
      throw error;
    }
  }

  // Customer CRUD
  async createCustomer(customer: Omit<Customer, "id" | "createdAt" | "updatedAt">): Promise<Customer> {
    try {
      const newCustomer = await customerService.createCustomer(customer);
      this.data.customers = [...this.data.customers, newCustomer];
      this.notify();
      return newCustomer;
    } catch (error) {
      console.error('DataManager: Error creating customer:', error);
      throw error;
    }
  }

  async updateCustomer(id: string, customer: Partial<Omit<Customer, "id" | "createdAt" | "updatedAt">>): Promise<Customer> {
    try {
      const updatedCustomer = await customerService.updateCustomer(id, customer);
      const index = this.data.customers.findIndex(c => c.id === id);
      if (index !== -1) {
        this.data.customers[index] = updatedCustomer;
        this.notify();
      }
      return updatedCustomer;
    } catch (error) {
      console.error('DataManager: Error updating customer:', error);
      throw error;
    }
  }

  async deleteCustomer(id: string): Promise<void> {
    try {
      await customerService.deleteCustomer(id);
      this.data.customers = this.data.customers.filter(c => c.id !== id);
      this.notify();
    } catch (error) {
      console.error('DataManager: Error deleting customer:', error);
      throw error;
    }
  }

  async getCustomer(id: string): Promise<Customer | null> {
    try {
      return await customerService.getCustomer(id);
    } catch (error) {
      console.error('DataManager: Error getting customer:', error);
      throw error;
    }
  }

  // Business Profile CRUD
  async saveBusinessProfile(profile: Omit<BusinessProfile, "id" | "createdAt" | "updatedAt">): Promise<BusinessProfile> {
    try {
      const savedProfile = await businessProfileService.saveBusinessProfile(profile);
      this.data.businessProfile = savedProfile;
      this.notify();
      return savedProfile;
    } catch (error) {
      console.error('DataManager: Error saving business profile:', error);
      throw error;
    }
  }

  async updateBusinessProfile(profile: BusinessProfile): Promise<BusinessProfile> {
    try {
      const updatedProfile = await businessProfileService.updateBusinessProfile(profile);
      this.data.businessProfile = updatedProfile;
      this.notify();
      return updatedProfile;
    } catch (error) {
      console.error('DataManager: Error updating business profile:', error);
      throw error;
    }
  }

  // Payment operations
  async createPayment(payment: CreatePaymentRequest): Promise<Payment> {
    try {
      const newPayment = await paymentService.createPayment(payment);
      this.data.payments = [newPayment, ...this.data.payments];
      // Refresh invoices and receipts to update payment status
      await Promise.all([this.fetchInvoices(), this.fetchReceipts()]);
      return newPayment;
    } catch (error) {
      console.error('DataManager: Error creating payment:', error);
      throw error;
    }
  }

  async getInvoicesWithBalance(): Promise<EnhancedInvoice[]> {
    try {
      return await paymentService.getInvoicesWithBalance();
    } catch (error) {
      console.error('DataManager: Error getting invoices with balance:', error);
      throw error;
    }
  }
}

export const dataManager = DataManager.getInstance();
