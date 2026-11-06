/**
 * Application Data Slice - Business data management
 * Single responsibility: Managing application business data
 */

import { StateCreator } from 'zustand';
import { Customer, Invoice, BusinessProfile, Item, ItemCategory, Account, Expense, ExpenseCategory } from '@/types';
import { Payment, Receipt, CreatePaymentRequest } from '@/types/payment';
import { solidDataManager } from '@/services/DataManagerSOLID';
import { paymentService } from '@/services/paymentService';

export interface AppDataSlice {
  // State
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
  units: string[];

  // Loading states
  loadingCustomers: boolean;
  loadingInvoices: boolean;
  loadingBusinessProfile: boolean;
  loadingItems: boolean;
  loadingItemCategories: boolean;
  loadingAccounts: boolean;
  loadingExpenses: boolean;
  loadingExpenseCategories: boolean;
  loadingPayments: boolean;
  loadingReceipts: boolean;

  // Actions - Customers
  fetchCustomers: () => Promise<void>;
  createCustomer: (customer: Omit<Customer, "id" | "createdAt" | "updatedAt">) => Promise<Customer>;
  updateCustomer: (id: string, customer: Partial<Omit<Customer, "id" | "createdAt" | "updatedAt">>) => Promise<Customer>;
  deleteCustomer: (id: string) => Promise<void>;
  getCustomer: (id: string) => Promise<Customer | null>;

  // Actions - Invoices
  fetchInvoices: () => Promise<void>;
  createInvoice: (invoice: Omit<Invoice, "id" | "createdAt" | "updatedAt">) => Promise<Invoice>;
  updateInvoice: (invoice: Invoice) => Promise<Invoice>;
  deleteInvoice: (id: string) => Promise<void>;
  getInvoice: (id: string) => Promise<Invoice | null>;
  updateInvoiceStatus: (id: string, status: Invoice['status']) => Promise<Invoice>;

  // Actions - Business Profile
  fetchBusinessProfile: () => Promise<void>;
  saveBusinessProfile: (profile: Omit<BusinessProfile, "id" | "createdAt" | "updatedAt">) => Promise<BusinessProfile>;

  // Actions - Items
  fetchItems: () => Promise<void>;
  createItem: (item: Omit<Item, "id" | "createdAt" | "updatedAt" | "category">) => Promise<Item>;
  updateItem: (id: string, item: Partial<Omit<Item, "id" | "createdAt" | "updatedAt" | "category">>) => Promise<Item>;
  deleteItem: (id: string) => Promise<void>;

  // Actions - Payments
  fetchPayments: () => Promise<void>;
  createPayment: (payment: CreatePaymentRequest) => Promise<Payment>;
  getPaymentsByInvoice: (invoiceId: string) => Promise<Payment[]>;

  // Initialization and cleanup
  initializeData: (userId: string) => Promise<void>;
  resetData: () => void;
  
  // Internal state updaters
  updateCustomers: (customers: Customer[]) => void;
  updateInvoices: (invoices: Invoice[]) => void;
  updateBusinessProfile: (profile: BusinessProfile | null) => void;
  updateItems: (items: Item[]) => void;
  updatePayments: (payments: Payment[]) => void;
}

export const createAppDataSlice: StateCreator<
  AppDataSlice,
  [["zustand/immer", never], ["zustand/devtools", never], ["zustand/subscribeWithSelector", never]],
  [],
  AppDataSlice
> = (set, get) => ({
  // Initial state
  customers: [],
  invoices: [],
  businessProfile: null,
  items: [],
  itemCategories: [],
  accounts: [],
  expenses: [],
  expenseCategories: [],
  payments: [],
  receipts: [],
  units: ['each', 'hour', 'kg', 'g', 'mg', 'liter', 'ml', 'meter', 'cm', 'mm', 'sq meter', 'sq foot'],

  // Loading states
  loadingCustomers: true,
  loadingInvoices: true,
  loadingBusinessProfile: true,
  loadingItems: true,
  loadingItemCategories: true,
  loadingAccounts: true,
  loadingExpenses: true,
  loadingExpenseCategories: true,
  loadingPayments: true,
  loadingReceipts: true,

  // Customer actions
  fetchCustomers: async () => {
    set((state) => { state.loadingCustomers = true; });
    try {
      await solidDataManager.fetchCustomers();
    } catch (error) {
      console.error('Error fetching customers:', error);
    }
  },

  createCustomer: async (customerData) => {
    try {
      const customer = await solidDataManager.createCustomer(customerData);
      return customer;
    } catch (error) {
      console.error('Error creating customer:', error);
      throw error;
    }
  },

  updateCustomer: async (id, customerData) => {
    try {
      const customer = await solidDataManager.updateCustomer(id, customerData);
      return customer;
    } catch (error) {
      console.error('Error updating customer:', error);
      throw error;
    }
  },

  deleteCustomer: async (id) => {
    try {
      await solidDataManager.deleteCustomer(id);
    } catch (error) {
      console.error('Error deleting customer:', error);
      throw error;
    }
  },

  getCustomer: async (id) => {
    try {
      return await solidDataManager.getCustomer(id);
    } catch (error) {
      console.error('Error getting customer:', error);
      throw error;
    }
  },

  // Invoice actions
  fetchInvoices: async () => {
    set((state) => { state.loadingInvoices = true; });
    try {
      await solidDataManager.fetchInvoices();
    } catch (error) {
      console.error('Error fetching invoices:', error);
    }
  },

  createInvoice: async (invoiceData) => {
    try {
      const invoice = await solidDataManager.createInvoice(invoiceData);
      return invoice;
    } catch (error) {
      console.error('Error creating invoice:', error);
      throw error;
    }
  },

  updateInvoice: async (invoice) => {
    try {
      const updatedInvoice = await solidDataManager.updateInvoice(invoice);
      return updatedInvoice;
    } catch (error) {
      console.error('Error updating invoice:', error);
      throw error;
    }
  },

  deleteInvoice: async (id) => {
    try {
      await solidDataManager.deleteInvoice(id);
    } catch (error) {
      console.error('Error deleting invoice:', error);
      throw error;
    }
  },

  getInvoice: async (id) => {
    try {
      return await solidDataManager.getInvoice(id);
    } catch (error) {
      console.error('Error getting invoice:', error);
      throw error;
    }
  },

  updateInvoiceStatus: async (id, status) => {
    try {
      return await solidDataManager.updateInvoiceStatus(id, status);
    } catch (error) {
      console.error('Error updating invoice status:', error);
      throw error;
    }
  },

  // Business Profile actions
  fetchBusinessProfile: async () => {
    set((state) => { state.loadingBusinessProfile = true; });
    try {
      await solidDataManager.fetchBusinessProfile();
    } catch (error) {
      console.error('Error fetching business profile:', error);
    }
  },

  saveBusinessProfile: async (profileData) => {
    try {
      const profile = await solidDataManager.saveBusinessProfile(profileData);
      return profile;
    } catch (error) {
      console.error('Error saving business profile:', error);
      throw error;
    }
  },

  // Item actions
  fetchItems: async () => {
    set((state) => { state.loadingItems = true; });
    try {
      await solidDataManager.fetchItems();
    } catch (error) {
      console.error('Error fetching items:', error);
    }
  },

  createItem: async (itemData) => {
    try {
      const item = await solidDataManager.createItem(itemData);
      return item;
    } catch (error) {
      console.error('Error creating item:', error);
      throw error;
    }
  },

  updateItem: async (id, itemData) => {
    try {
      const item = await solidDataManager.updateItem(id, itemData);
      return item;
    } catch (error) {
      console.error('Error updating item:', error);
      throw error;
    }
  },

  deleteItem: async (id) => {
    try {
      await solidDataManager.deleteItem(id);
    } catch (error) {
      console.error('Error deleting item:', error);
      throw error;
    }
  },

  // Payment actions
  fetchPayments: async () => {
    set((state) => { state.loadingPayments = true; });
    try {
      await solidDataManager.fetchPayments();
    } catch (error) {
      console.error('Error fetching payments:', error);
    }
  },

  createPayment: async (paymentData) => {
    try {
      const payment = await solidDataManager.createPayment(paymentData);
      return payment;
    } catch (error) {
      console.error('Error creating payment:', error);
      throw error;
    }
  },

  getPaymentsByInvoice: async (invoiceId) => {
    try {
      return await paymentService.getPaymentsByInvoice(invoiceId);
    } catch (error) {
      console.error('Error getting payments:', error);
      throw error;
    }
  },

  // Initialization and cleanup
  initializeData: async (userId) => {
    try {
      // Initialize the data manager for this user
      solidDataManager.initialize(userId);
      
      // Subscribe to data changes
      solidDataManager.subscribe((newData, newLoading) => {
        set((state) => {
          // Update data
          state.customers = newData.customers;
          state.invoices = newData.invoices;
          state.businessProfile = newData.businessProfile;
          state.items = newData.items;
          state.itemCategories = newData.itemCategories;
          state.accounts = newData.accounts;
          state.expenses = newData.expenses;
          state.expenseCategories = newData.expenseCategories;
          state.payments = newData.payments;
          state.receipts = newData.receipts;
          state.units = newData.units;

          // Update loading states
          state.loadingCustomers = newLoading.customers;
          state.loadingInvoices = newLoading.invoices;
          state.loadingBusinessProfile = newLoading.businessProfile;
          state.loadingItems = newLoading.items;
          state.loadingItemCategories = newLoading.itemCategories;
          state.loadingAccounts = newLoading.accounts;
          state.loadingExpenses = newLoading.expenses;
          state.loadingExpenseCategories = newLoading.expenseCategories;
          state.loadingPayments = newLoading.payments;
          state.loadingReceipts = newLoading.receipts;
        });
      });

      // Fetch initial data
      await Promise.all([
        get().fetchCustomers(),
        get().fetchInvoices(),
        get().fetchBusinessProfile(),
        get().fetchItems(),
        get().fetchPayments(),
      ]);
    } catch (error) {
      console.error('Error initializing data:', error);
    }
  },

  resetData: () => {
    solidDataManager.reset();
    set((state) => {
      // Reset all data
      state.customers = [];
      state.invoices = [];
      state.businessProfile = null;
      state.items = [];
      state.itemCategories = [];
      state.accounts = [];
      state.expenses = [];
      state.expenseCategories = [];
      state.payments = [];
      state.receipts = [];

      // Reset loading states
      state.loadingCustomers = true;
      state.loadingInvoices = true;
      state.loadingBusinessProfile = true;
      state.loadingItems = true;
      state.loadingItemCategories = true;
      state.loadingAccounts = true;
      state.loadingExpenses = true;
      state.loadingExpenseCategories = true;
      state.loadingPayments = true;
      state.loadingReceipts = true;
    });
  },

  // Internal state updaters
  updateCustomers: (customers) => set((state) => { state.customers = customers; }),
  updateInvoices: (invoices) => set((state) => { state.invoices = invoices; }),
  updateBusinessProfile: (profile) => set((state) => { state.businessProfile = profile; }),
  updateItems: (items) => set((state) => { state.items = items; }),
  updatePayments: (payments) => set((state) => { state.payments = payments; }),
});
