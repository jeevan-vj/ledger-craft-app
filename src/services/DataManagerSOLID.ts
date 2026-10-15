/**
 * SOLID-compliant Data Manager
 * S - Single Responsibility: Each class has one reason to change
 * O - Open/Closed: Open for extension, closed for modification
 * L - Liskov Substitution: Can be substituted with any IDataManager implementation
 * I - Interface Segregation: Implements focused interfaces
 * D - Dependency Inversion: Depends on abstractions (ServiceContainer)
 */

import { IDataManager, IDataState, ILoadingState, IDataSubscriber } from "@/interfaces/IDataManager";
import { serviceContainer } from "@/services/ServiceContainer";
import { Customer, Invoice, BusinessProfile, Item, ItemCategory, Account, Expense, ExpenseCategory } from "@/types";
import { Payment, Receipt, CreatePaymentRequest, EnhancedInvoice } from "@/types/payment";
import { businessProfileApiEnabled } from '@/features/business-profile/api/businessProfileApi';
import { customersApiEnabled } from '@/features/customers/api/customersApi';
import { expensesApiEnabled } from '@/features/expenses/api/expensesApi';
import { invoicesApiEnabled } from '@/features/invoices/api/invoicesApi';
import { itemsApiEnabled } from '@/features/items/api/itemsApi';
import { accountsApiEnabled, paymentsApiEnabled } from '@/features/payments/api/paymentsApi';
import { receiptsApiEnabled } from '@/features/receipts/api/receiptsApi';

// Single Responsibility: State Management
class DataStateManager {
  private data: IDataState = {
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
    units: ['each', 'hour', 'kg', 'g', 'mg', 'liter', 'ml', 'meter', 'cm', 'mm', 'sq meter', 'sq foot', 'cubic meter', 'cubic foot', 'gallon', 'quart', 'pint', 'ounce', 'lb', 'box', 'pack', 'pair', 'roll', 'set', 'sheet', 'unit']
  };

  private loading: ILoadingState = {
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

  getData(): IDataState {
    return { ...this.data };
  }

  getLoading(): ILoadingState {
    return { ...this.loading };
  }

  updateData<K extends keyof IDataState>(key: K, value: IDataState[K]): void {
    this.data[key] = value;
  }

  updateLoading<K extends keyof ILoadingState>(key: K, value: ILoadingState[K]): void {
    this.loading[key] = value;
  }

  reset(): void {
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
      receipts: [],
      units: ['each', 'hour', 'kg', 'g', 'mg', 'liter', 'ml', 'meter', 'cm', 'mm', 'sq meter', 'sq foot', 'cubic meter', 'cubic foot', 'gallon', 'quart', 'pint', 'ounce', 'lb', 'box', 'pack', 'pair', 'roll', 'set', 'sheet', 'unit']
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
  }
}

// Single Responsibility: Subscription Management
class SubscriptionManager {
  private subscribers: Set<IDataSubscriber> = new Set();

  subscribe(callback: IDataSubscriber): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  unsubscribe(callback: IDataSubscriber): void {
    this.subscribers.delete(callback);
  }

  notify(data: IDataState, loading: ILoadingState): void {
    this.subscribers.forEach(callback => {
      callback(data, loading);
    });
  }
}

// Single Responsibility: Lifecycle Management
class LifecycleManager {
  private initialized = false;
  private currentUserId: string | null = null;

  initialize(userId: string): boolean {
    if (this.initialized && this.currentUserId === userId) {
      console.log('DataManager: Already initialized for user', userId);
      return false; // Already initialized
    }

    if (this.currentUserId !== userId) {
      console.log('DataManager: New user, resetting data');
      this.reset();
    }

    console.log('DataManager: Initializing data for user', userId);
    this.currentUserId = userId;
    this.initialized = true;
    return true; // Needs initialization
  }

  reset(): void {
    console.log('DataManager: Resetting lifecycle');
    this.initialized = false;
    this.currentUserId = null;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getCurrentUserId(): string | null {
    return this.currentUserId;
  }
}

// Main DataManager implementing all interfaces
class SOLIDDataManager implements IDataManager {
  private static instance: SOLIDDataManager;
  private stateManager = new DataStateManager();
  private subscriptionManager = new SubscriptionManager();
  private lifecycleManager = new LifecycleManager();

  private constructor() {}

  static getInstance(): SOLIDDataManager {
    if (!SOLIDDataManager.instance) {
      SOLIDDataManager.instance = new SOLIDDataManager();
    }
    return SOLIDDataManager.instance;
  }

  // ISubscriptionManager implementation
  subscribe(callback: IDataSubscriber): () => void {
    // Immediately call with current data
    callback(this.stateManager.getData(), this.stateManager.getLoading());
    return this.subscriptionManager.subscribe(callback);
  }

  unsubscribe(callback: IDataSubscriber): void {
    this.subscriptionManager.unsubscribe(callback);
  }

  notify(): void {
    this.subscriptionManager.notify(
      this.stateManager.getData(),
      this.stateManager.getLoading()
    );
  }

  // ILifecycleManager implementation
  async initialize(userId: string): Promise<void> {
    const needsInitialization = this.lifecycleManager.initialize(userId);
    
    if (!needsInitialization) {
      return;
    }

    const skip = async (key: keyof ILoadingState) => {
      this.stateManager.updateLoading(key, false);
    };

    await Promise.all([
      customersApiEnabled() ? skip('customers') : this.fetchCustomers(),
      invoicesApiEnabled() ? skip('invoices') : this.fetchInvoices(),
      businessProfileApiEnabled() ? skip('businessProfile') : this.fetchBusinessProfile(),
      itemsApiEnabled()
        ? Promise.all([skip('items'), skip('itemCategories')])
        : Promise.all([this.fetchItems(), this.fetchItemCategories()]),
      accountsApiEnabled() ? skip('accounts') : this.fetchAccounts(),
      expensesApiEnabled()
        ? Promise.all([skip('expenses'), skip('expenseCategories')])
        : Promise.all([this.fetchExpenses(), this.fetchExpenseCategories()]),
      paymentsApiEnabled() ? skip('payments') : this.fetchPayments(),
      receiptsApiEnabled() ? skip('receipts') : this.fetchReceipts(),
    ]);
    this.notify();
  }

  reset(): void {
    this.lifecycleManager.reset();
    this.stateManager.reset();
    this.notify();
  }

  isInitialized(): boolean {
    return this.lifecycleManager.isInitialized();
  }

  getCurrentUserId(): string | null {
    return this.lifecycleManager.getCurrentUserId();
  }

  // Data access
  getData(): IDataState {
    return this.stateManager.getData();
  }

  getLoading(): ILoadingState {
    return this.stateManager.getLoading();
  }

  // Generic fetch method following DRY principle
  private async fetchData<T>(
    key: keyof IDataState,
    fetchFn: () => Promise<T>,
    transform?: (data: T) => any
  ): Promise<void> {
    try {
      this.stateManager.updateLoading(key as keyof ILoadingState, true);
      this.notify();

      const result = await fetchFn();
      const transformedData = transform ? transform(result) : result;
      this.stateManager.updateData(key, transformedData);
    } catch (error) {
      console.error(`DataManager: Error fetching ${String(key)}:`, error);
    } finally {
      this.stateManager.updateLoading(key as keyof ILoadingState, false);
      this.notify();
    }
  }

  // IDataFetcher implementation
  async fetchCustomers(): Promise<void> {
    await this.fetchData('customers', () => serviceContainer.customerService.getCustomers());
  }

  async fetchInvoices(): Promise<void> {
    await this.fetchData('invoices', () => serviceContainer.invoiceService.getInvoices(), 
      (data: Invoice[]) => data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    );
  }

  async fetchBusinessProfile(): Promise<void> {
    await this.fetchData('businessProfile', () => serviceContainer.businessProfileService.getBusinessProfile());
  }

  async fetchItems(): Promise<void> {
    await this.fetchData('items', () => serviceContainer.itemService.getItems());
  }

  async fetchItemCategories(): Promise<void> {
    await this.fetchData('itemCategories', () => serviceContainer.itemCategoryService.getItemCategories());
  }

  async fetchAccounts(): Promise<void> {
    await this.fetchData('accounts', () => serviceContainer.accountService.getAccounts());
  }

  async fetchExpenses(): Promise<void> {
    await this.fetchData('expenses', () => serviceContainer.expenseService.getExpenses());
  }

  async fetchExpenseCategories(): Promise<void> {
    await this.fetchData('expenseCategories', () => serviceContainer.expenseCategoryService.getExpenseCategories());
  }

  async fetchPayments(): Promise<void> {
    await this.fetchData('payments', () => serviceContainer.paymentService.getPayments());
  }

  async fetchReceipts(): Promise<void> {
    await this.fetchData('receipts', () => serviceContainer.paymentService.getReceipts());
  }

  // IDataCRUD implementation
  async createInvoice(invoice: Omit<Invoice, "id" | "createdAt" | "updatedAt">): Promise<Invoice> {
    try {
      // Extract items from invoice data and ensure currentData.invoices is defined
      const { items, ...invoiceData } = invoice;
      const lineItems = items || [];
      
      const newInvoice = await serviceContainer.invoiceService.createInvoice(invoiceData, lineItems);
      const currentData = this.stateManager.getData();
      
      // Ensure invoices array exists, fallback to empty array if undefined
      const existingInvoices = currentData.invoices || [];
      const updatedInvoices = [newInvoice, ...existingInvoices]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      this.stateManager.updateData('invoices', updatedInvoices);
      this.notify();
      return newInvoice;
    } catch (error) {
      console.error('DataManager: Error creating invoice:', error);
      throw error;
    }
  }

  async updateInvoice(invoice: Invoice): Promise<Invoice> {
    try {
      // Extract id and rest of the invoice data to match service signature
      const { id, ...invoiceData } = invoice;
      const updatedInvoice = await serviceContainer.invoiceService.updateInvoice(id, invoiceData);
      const currentData = this.stateManager.getData();
      
      // Ensure invoices array exists, fallback to empty array if undefined
      const existingInvoices = currentData.invoices || [];
      const index = existingInvoices.findIndex(i => i.id === invoice.id);
      if (index !== -1) {
        const updatedInvoices = [...existingInvoices];
        updatedInvoices[index] = updatedInvoice;
        this.stateManager.updateData('invoices', updatedInvoices);
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
      await serviceContainer.invoiceService.deleteInvoice(id);
      const currentData = this.stateManager.getData();
      const existingInvoices = currentData.invoices || [];
      const updatedInvoices = existingInvoices.filter(i => i.id !== id);
      this.stateManager.updateData('invoices', updatedInvoices);
      this.notify();
    } catch (error) {
      console.error('DataManager: Error deleting invoice:', error);
      throw error;
    }
  }

  async getInvoice(id: string): Promise<Invoice | null> {
    try {
      return await serviceContainer.invoiceService.getInvoice(id);
    } catch (error) {
      console.error('DataManager: Error getting invoice:', error);
      throw error;
    }
  }

  async getNextInvoiceNumber(): Promise<string> {
    try {
      return await serviceContainer.invoiceService.getNextInvoiceNumber();
    } catch (error) {
      console.error('DataManager: Error getting next invoice number:', error);
      throw error;
    }
  }

  async updateInvoiceStatus(id: string, status: Invoice['status']): Promise<Invoice> {
    try {
      const updatedInvoice = await serviceContainer.invoiceService.updateInvoiceStatus(id, status);
      const currentData = this.stateManager.getData();
      const existingInvoices = currentData.invoices || [];
      const index = existingInvoices.findIndex(i => i.id === id);
      if (index !== -1) {
        const updatedInvoices = [...existingInvoices];
        updatedInvoices[index] = updatedInvoice;
        this.stateManager.updateData('invoices', updatedInvoices);
        this.notify();
      }
      return updatedInvoice;
    } catch (error) {
      console.error('DataManager: Error updating invoice status:', error);
      throw error;
    }
  }

  // Customer CRUD operations
  async createCustomer(customer: Omit<Customer, "id" | "createdAt" | "updatedAt">): Promise<Customer> {
    try {
      const newCustomer = await serviceContainer.customerService.createCustomer(customer);
      const currentData = this.stateManager.getData();
      this.stateManager.updateData('customers', [...currentData.customers, newCustomer]);
      this.notify();
      return newCustomer;
    } catch (error) {
      console.error('DataManager: Error creating customer:', error);
      throw error;
    }
  }

  async updateCustomer(id: string, customer: Partial<Omit<Customer, "id" | "createdAt" | "updatedAt">>): Promise<Customer> {
    try {
      const updatedCustomer = await serviceContainer.customerService.updateCustomer(id, customer);
      const currentData = this.stateManager.getData();
      const existingCustomers = currentData.customers || [];
      const index = existingCustomers.findIndex(c => c.id === id);
      if (index !== -1) {
        const updatedCustomers = [...existingCustomers];
        updatedCustomers[index] = updatedCustomer;
        this.stateManager.updateData('customers', updatedCustomers);
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
      await serviceContainer.customerService.deleteCustomer(id);
      const currentData = this.stateManager.getData();
      const existingCustomers = currentData.customers || [];
      const updatedCustomers = existingCustomers.filter(c => c.id !== id);
      this.stateManager.updateData('customers', updatedCustomers);
      this.notify();
    } catch (error) {
      console.error('DataManager: Error deleting customer:', error);
      throw error;
    }
  }

  async getCustomer(id: string): Promise<Customer | null> {
    try {
      return await serviceContainer.customerService.getCustomer(id);
    } catch (error) {
      console.error('DataManager: Error getting customer:', error);
      throw error;
    }
  }

  // Business Profile operations
  async saveBusinessProfile(profile: Omit<BusinessProfile, "id" | "createdAt" | "updatedAt">): Promise<BusinessProfile> {
    try {
      const savedProfile = await serviceContainer.businessProfileService.saveBusinessProfile(profile);
      this.stateManager.updateData('businessProfile', savedProfile);
      this.notify();
      return savedProfile;
    } catch (error) {
      console.error('DataManager: Error saving business profile:', error);
      throw error;
    }
  }

  async updateBusinessProfile(profile: BusinessProfile): Promise<BusinessProfile> {
    try {
      const updatedProfile = await serviceContainer.businessProfileService.updateBusinessProfile(profile);
      this.stateManager.updateData('businessProfile', updatedProfile);
      this.notify();
      return updatedProfile;
    } catch (error) {
      console.error('DataManager: Error updating business profile:', error);
      throw error;
    }
  }

  // Item operations
  async createItem(item: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'category'>): Promise<Item> {
    try {
      const newItem = await serviceContainer.itemService.createItem(item);
      const currentData = this.stateManager.getData();
      const existingItems = currentData.items || [];
      this.stateManager.updateData('items', [...existingItems, newItem]);
      this.notify();
      return newItem;
    } catch (error) {
      console.error('DataManager: Error creating item:', error);
      throw error;
    }
  }

  async updateItem(id: string, item: Partial<Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'category'>>): Promise<Item> {
    try {
      const updatedItem = await serviceContainer.itemService.updateItem(id, item);
      const currentData = this.stateManager.getData();
      const existingItems = currentData.items || [];
      const index = existingItems.findIndex(i => i.id === id);
      if (index !== -1) {
        const updatedItems = [...existingItems];
        updatedItems[index] = updatedItem;
        this.stateManager.updateData('items', updatedItems);
        this.notify();
      }
      return updatedItem;
    } catch (error) {
      console.error('DataManager: Error updating item:', error);
      throw error;
    }
  }

  async deleteItem(id: string): Promise<void> {
    try {
      await serviceContainer.itemService.deleteItem(id);
      const currentData = this.stateManager.getData();
      const existingItems = currentData.items || [];
      const updatedItems = existingItems.filter(i => i.id !== id);
      this.stateManager.updateData('items', updatedItems);
      this.notify();
    } catch (error) {
      console.error('DataManager: Error deleting item:', error);
      throw error;
    }
  }

  async getItem(id: string): Promise<Item | null> {
    try {
      return await serviceContainer.itemService.getItem(id);
    } catch (error) {
      console.error('DataManager: Error getting item:', error);
      throw error;
    }
  }

  // Item Category operations
  async createItemCategory(category: Omit<ItemCategory, 'id' | 'createdAt' | 'updatedAt'>): Promise<ItemCategory> {
    try {
      const newCategory = await serviceContainer.itemCategoryService.createItemCategory(category);
      const currentData = this.stateManager.getData();
      const existingCategories = currentData.itemCategories || [];
      this.stateManager.updateData('itemCategories', [...existingCategories, newCategory]);
      this.notify();
      return newCategory;
    } catch (error) {
      console.error('DataManager: Error creating item category:', error);
      throw error;
    }
  }

  async updateItemCategory(id: string, category: Partial<Omit<ItemCategory, 'id' | 'createdAt' | 'updatedAt'>>): Promise<ItemCategory> {
    try {
      const updatedCategory = await serviceContainer.itemCategoryService.updateItemCategory(id, category);
      const currentData = this.stateManager.getData();
      const existingCategories = currentData.itemCategories || [];
      const index = existingCategories.findIndex(c => c.id === id);
      if (index !== -1) {
        const updatedCategories = [...existingCategories];
        updatedCategories[index] = updatedCategory;
        this.stateManager.updateData('itemCategories', updatedCategories);
        this.notify();
      }
      return updatedCategory;
    } catch (error) {
      console.error('DataManager: Error updating item category:', error);
      throw error;
    }
  }

  async deleteItemCategory(id: string): Promise<void> {
    try {
      await serviceContainer.itemCategoryService.deleteItemCategory(id);
      const currentData = this.stateManager.getData();
      const existingCategories = currentData.itemCategories || [];
      const updatedCategories = existingCategories.filter(c => c.id !== id);
      this.stateManager.updateData('itemCategories', updatedCategories);
      this.notify();
    } catch (error) {
      console.error('DataManager: Error deleting item category:', error);
      throw error;
    }
  }

  async getItemCategory(id: string): Promise<ItemCategory | null> {
    try {
      return await serviceContainer.itemCategoryService.getItemCategory(id);
    } catch (error) {
      console.error('DataManager: Error getting item category:', error);
      throw error;
    }
  }

  // Expense operations
  async createExpense(expense: Omit<Expense, 'id' | 'createdAt' | 'updatedAt' | 'category' | 'account' | 'customer'>): Promise<Expense> {
    try {
      const newExpense = await serviceContainer.expenseService.createExpense(expense);
      const currentData = this.stateManager.getData();
      const existingExpenses = currentData.expenses || [];
      this.stateManager.updateData('expenses', [newExpense, ...existingExpenses]);
      this.notify();
      return newExpense;
    } catch (error) {
      console.error('DataManager: Error creating expense:', error);
      throw error;
    }
  }

  async updateExpense(id: string, expense: Partial<Omit<Expense, 'id' | 'createdAt' | 'updatedAt' | 'category' | 'account' | 'customer'>>): Promise<Expense> {
    try {
      const updatedExpense = await serviceContainer.expenseService.updateExpense(id, expense);
      const currentData = this.stateManager.getData();
      const existingExpenses = currentData.expenses || [];
      const index = existingExpenses.findIndex(e => e.id === id);
      if (index !== -1) {
        const updatedExpenses = [...existingExpenses];
        updatedExpenses[index] = updatedExpense;
        this.stateManager.updateData('expenses', updatedExpenses);
        this.notify();
      }
      return updatedExpense;
    } catch (error) {
      console.error('DataManager: Error updating expense:', error);
      throw error;
    }
  }

  async deleteExpense(id: string): Promise<void> {
    try {
      await serviceContainer.expenseService.deleteExpense(id);
      const currentData = this.stateManager.getData();
      const existingExpenses = currentData.expenses || [];
      const updatedExpenses = existingExpenses.filter(e => e.id !== id);
      this.stateManager.updateData('expenses', updatedExpenses);
      this.notify();
    } catch (error) {
      console.error('DataManager: Error deleting expense:', error);
      throw error;
    }
  }

  async getExpense(id: string): Promise<Expense | null> {
    try {
      return await serviceContainer.expenseService.getExpense(id);
    } catch (error) {
      console.error('DataManager: Error getting expense:', error);
      throw error;
    }
  }

  // Expense Category operations
  async createExpenseCategory(category: Omit<ExpenseCategory, 'id' | 'createdAt' | 'updatedAt'>): Promise<ExpenseCategory> {
    try {
      const newCategory = await serviceContainer.expenseCategoryService.createExpenseCategory(category);
      const currentData = this.stateManager.getData();
      const existingCategories = currentData.expenseCategories || [];
      this.stateManager.updateData('expenseCategories', [...existingCategories, newCategory]);
      this.notify();
      return newCategory;
    } catch (error) {
      console.error('DataManager: Error creating expense category:', error);
      throw error;
    }
  }

  async updateExpenseCategory(id: string, category: Partial<Omit<ExpenseCategory, 'id' | 'createdAt' | 'updatedAt'>>): Promise<ExpenseCategory> {
    try {
      const updatedCategory = await serviceContainer.expenseCategoryService.updateExpenseCategory(id, category);
      const currentData = this.stateManager.getData();
      const existingCategories = currentData.expenseCategories || [];
      const index = existingCategories.findIndex(c => c.id === id);
      if (index !== -1) {
        const updatedCategories = [...existingCategories];
        updatedCategories[index] = updatedCategory;
        this.stateManager.updateData('expenseCategories', updatedCategories);
        this.notify();
      }
      return updatedCategory;
    } catch (error) {
      console.error('DataManager: Error updating expense category:', error);
      throw error;
    }
  }

  async deleteExpenseCategory(id: string): Promise<void> {
    try {
      await serviceContainer.expenseCategoryService.deleteExpenseCategory(id);
      const currentData = this.stateManager.getData();
      const existingCategories = currentData.expenseCategories || [];
      const updatedCategories = existingCategories.filter(c => c.id !== id);
      this.stateManager.updateData('expenseCategories', updatedCategories);
      this.notify();
    } catch (error) {
      console.error('DataManager: Error deleting expense category:', error);
      throw error;
    }
  }

  async getExpenseCategory(id: string): Promise<ExpenseCategory | null> {
    try {
      return await serviceContainer.expenseCategoryService.getExpenseCategory(id);
    } catch (error) {
      console.error('DataManager: Error getting expense category:', error);
      throw error;
    }
  }

  // Payment operations
  async createPayment(payment: CreatePaymentRequest): Promise<Payment> {
    try {
      const newPayment = await serviceContainer.paymentService.createPayment(payment);
      const currentData = this.stateManager.getData();
      const existingPayments = currentData.payments || [];
      this.stateManager.updateData('payments', [newPayment, ...existingPayments]);
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
      return await serviceContainer.paymentService.getInvoicesWithBalance();
    } catch (error) {
      console.error('DataManager: Error getting invoices with balance:', error);
      throw error;
    }
  }
}

export const solidDataManager = SOLIDDataManager.getInstance();
