import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { customerService, invoiceService, businessProfileService, itemService, itemCategoryService, accountService, expenseService, expenseCategoryService } from "@/services/supabaseService";
import { paymentService } from "@/services/paymentService";
import { Customer, Invoice, BusinessProfile, Item, ItemCategory, Account, Expense, ExpenseCategory } from "@/types";
import { Payment, Receipt, CreatePaymentRequest, EnhancedInvoice } from "@/types/payment";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";

interface AppContextType {
  customers: Customer[];
  isLoadingCustomers: boolean;
  getCustomer: (id: string) => Promise<Customer | null>;
  createCustomer: (customer: Omit<Customer, "id" | "createdAt" | "updatedAt">) => Promise<Customer>;
  updateCustomer: (id: string, customer: Partial<Omit<Customer, "id" | "createdAt" | "updatedAt">>) => Promise<Customer>;
  deleteCustomer: (id: string) => Promise<void>;
  invoices: Invoice[];
  isLoadingInvoices: boolean;
  getInvoice: (id: string) => Promise<Invoice | null>;
  createInvoice: (invoice: Omit<Invoice, "id" | "createdAt" | "updatedAt">) => Promise<Invoice>;
  updateInvoice: (invoice: Invoice) => Promise<Invoice>;
  deleteInvoice: (id: string) => Promise<void>;
  refreshInvoices: () => Promise<void>;
  refreshCustomers: () => Promise<void>;
  businessProfile: BusinessProfile | null;
  isLoadingBusinessProfile: boolean;
  saveBusinessProfile: (profile: Omit<BusinessProfile, "id" | "createdAt" | "updatedAt">) => Promise<BusinessProfile>;
  updateBusinessProfile: (profile: BusinessProfile) => Promise<BusinessProfile>;
  refreshBusinessProfile: () => Promise<void>;
  items: Item[];
  isLoadingItems: boolean;
  getItem: (id: string) => Promise<Item | null>;
  createItem: (item: Omit<Item, "id" | "createdAt" | "updatedAt" | "category">) => Promise<Item>;
  updateItem: (id: string, item: Partial<Omit<Item, "id" | "createdAt" | "updatedAt" | "category">>) => Promise<Item>;
  deleteItem: (id: string) => Promise<void>;
  itemCategories: ItemCategory[];
  isLoadingItemCategories: boolean;
  createItemCategory: (category: Omit<ItemCategory, "id" | "createdAt" | "updatedAt">) => Promise<ItemCategory>;
  updateItemCategory: (id: string, category: Partial<Omit<ItemCategory, "id" | "createdAt" | "updatedAt">>) => Promise<ItemCategory>;
  deleteItemCategory: (id: string) => Promise<void>;
  fetchItemCategories: () => Promise<void>;
  getNextInvoiceNumber: () => Promise<string>;
  updateInvoiceStatus: (id: string, status: Invoice['status']) => Promise<Invoice>;
  accounts: Account[];
  isLoadingAccounts: boolean;
  getAccount: (id: string) => Promise<Account | null>;
  createAccount: (account: Omit<Account, "id" | "createdAt" | "updatedAt">) => Promise<Account>;
  updateAccount: (id: string, account: Partial<Omit<Account, "id" | "createdAt" | "updatedAt">>) => Promise<Account>;
  deleteAccount: (id: string) => Promise<void>;
  refreshAccounts: () => Promise<void>;
  expenses: Expense[];
  isLoadingExpenses: boolean;
  getExpense: (id: string) => Promise<Expense | null>;
  createExpense: (expense: Omit<Expense, "id" | "createdAt" | "updatedAt" | "category" | "account" | "customer">) => Promise<Expense>;
  updateExpense: (id: string, expense: Partial<Omit<Expense, "id" | "createdAt" | "updatedAt" | "category" | "account" | "customer">>) => Promise<Expense>;
  deleteExpense: (id: string) => Promise<void>;
  refreshExpenses: () => Promise<void>;
  expenseCategories: ExpenseCategory[];
  isLoadingExpenseCategories: boolean;
  getExpenseCategory: (id: string) => Promise<ExpenseCategory | null>;
  createExpenseCategory: (category: Omit<ExpenseCategory, "id" | "createdAt" | "updatedAt">) => Promise<ExpenseCategory>;
  updateExpenseCategory: (id: string, category: Partial<Omit<ExpenseCategory, "id" | "createdAt" | "updatedAt">>) => Promise<ExpenseCategory>;
  deleteExpenseCategory: (id: string) => Promise<void>;
  refreshExpenseCategories: () => Promise<void>;
  units: string[];
  // Payment system
  payments: Payment[];
  isLoadingPayments: boolean;
  receipts: Receipt[];
  isLoadingReceipts: boolean;
  createPayment: (payment: CreatePaymentRequest) => Promise<Payment>;
  getPayment: (id: string) => Promise<Payment | null>;
  getPaymentsByInvoice: (invoiceId: string) => Promise<Payment[]>;
  getReceipt: (id: string) => Promise<Receipt | null>;
  getReceiptByPayment: (paymentId: string) => Promise<Receipt | null>;
  markReceiptAsEmailed: (receiptId: string) => Promise<void>;
  refreshPayments: () => Promise<void>;
  refreshReceipts: () => Promise<void>;
  getInvoicesWithBalance: () => Promise<EnhancedInvoice[]>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(true);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoadingInvoices, setIsLoadingInvoices] = useState(true);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);
  const [isLoadingBusinessProfile, setIsLoadingBusinessProfile] = useState(true);
  const [items, setItems] = useState<Item[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(true);
  const [itemCategories, setItemCategories] = useState<ItemCategory[]>([]);
  const [isLoadingItemCategories, setIsLoadingItemCategories] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(true);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoadingExpenses, setIsLoadingExpenses] = useState(true);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [isLoadingExpenseCategories, setIsLoadingExpenseCategories] = useState(true);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [isLoadingPayments, setIsLoadingPayments] = useState(true);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [isLoadingReceipts, setIsLoadingReceipts] = useState(true);
  const defaultUnits = ['each', 'hour', 'kg', 'g', 'mg', 'liter', 'ml', 'meter', 'cm', 'mm', 'sq meter', 'sq foot', 'cubic meter', 'cubic foot', 'gallon', 'quart', 'pint', 'ounce', 'lb', 'box', 'pack', 'pair', 'roll', 'set', 'sheet', 'unit'];
  const [units, setUnits] = useState<string[]>(defaultUnits);
  const { toast } = useToast();
  const { user, loading } = useAuth();
  const initializationRef = useRef(false);
  
  // Use localStorage to persist initialization state across HMR reloads
  const getInitializationKey = (userId: string) => `app_initialized_${userId}`;
  const isInitialized = (userId: string) => {
    return localStorage.getItem(getInitializationKey(userId)) === 'true';
  };
  const setInitialized = (userId: string) => {
    localStorage.setItem(getInitializationKey(userId), 'true');
  };
  const clearInitialized = () => {
    // Clear all initialization flags
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('app_initialized_')) {
        localStorage.removeItem(key);
      }
    });
  };
  
  // Expose clear function globally for development
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    Object.assign(window, { clearAppInitialization: () => {
      clearInitialized();
      initializationRef.current = false;
      console.log('App initialization state cleared. Refresh to reinitialize.');
    } });
  }

  // Define all fetch functions first (no useCallback needed for internal functions)
  const fetchCustomers = async () => {
    try {
      setIsLoadingCustomers(true);
      const data = await customerService.getCustomers();
      setCustomers(data);
    } catch (error) {
      console.error("Error loading customers:", error);
      // Don't use toast in fetch functions to avoid dependency issues
    } finally {
      setIsLoadingCustomers(false);
    }
  };

  const getCustomer = async (id: string) => {
    try {
      return await customerService.getCustomer(id);
    } catch (error) {
      console.error("Error loading customer:", error);
      toast({
        title: "Error",
        description: "Failed to load customer details. Please try again.",
        variant: "destructive",
      });
      return null;
    }
  };

  const createCustomer = async (customer: Omit<Customer, "id" | "createdAt" | "updatedAt">) => {
    try {
      const newCustomer = await customerService.createCustomer(customer);
      setCustomers([...customers, newCustomer]);
      toast({
        title: "Success",
        description: "Customer created successfully.",
      });
      return newCustomer;
    } catch (error) {
      console.error("Error creating customer:", error);
      toast({
        title: "Error",
        description: "Failed to create customer. Please try again.",
        variant: "destructive",
      });
      throw error;
    }
  };

  const updateCustomer = async (id: string, customer: Partial<Omit<Customer, "id" | "createdAt" | "updatedAt">>) => {
    try {
      const updatedCustomer = await customerService.updateCustomer(id, customer);
      setCustomers(customers.map(c => c.id === id ? updatedCustomer : c));
      toast({
        title: "Success",
        description: "Customer updated successfully.",
      });
      return updatedCustomer;
    } catch (error) {
      console.error("Error updating customer:", error);
      toast({
        title: "Error",
        description: "Failed to update customer. Please try again.",
        variant: "destructive",
      });
      throw error;
    }
  };

  const deleteCustomer = async (id: string) => {
    try {
      await customerService.deleteCustomer(id);
      setCustomers(customers.filter(c => c.id !== id));
      toast({
        title: "Success",
        description: "Customer deleted successfully.",
      });
    } catch (error) {
      console.error("Error deleting customer:", error);
      toast({
        title: "Error",
        description: "Failed to delete customer. Please try again.",
        variant: "destructive",
      });
      throw error;
    }
  };

  const fetchInvoices = async () => {
    try {
      setIsLoadingInvoices(true);
      const data = await invoiceService.getInvoices();
      // Sort invoices by createdAt in descending order
      const sortedData = data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setInvoices(sortedData);
    } catch (error) {
      console.error("Error loading invoices:", error);
      // Don't use toast in fetch functions to avoid dependency issues
    } finally {
      setIsLoadingInvoices(false);
    }
  };

  const getInvoice = async (id: string) => {
    try {
      return await invoiceService.getInvoice(id);
    } catch (error) {
      console.error("Error loading invoice:", error);
      toast({
        title: "Error",
        description: "Failed to load invoice details. Please try again.",
        variant: "destructive",
      });
      return null;
    }
  };

  const createInvoice = async (invoice: Omit<Invoice, "id" | "createdAt" | "updatedAt">) => {
    try {
      const newInvoice = await invoiceService.createInvoice(invoice, invoice.items);
      setInvoices([...invoices, newInvoice]);
      toast({
        title: "Success",
        description: "Invoice created successfully.",
      });
      return newInvoice;
    } catch (error) {
      console.error("Error creating invoice:", error);
      toast({
        title: "Error",
        description: "Failed to create invoice. Please try again.",
        variant: "destructive",
      });
      throw error;
    }
  };

  const updateInvoice = async (invoice: Invoice) => {
    try {
      const { id, items, ...rest } = invoice;
      const updatedInvoice = await invoiceService.updateInvoice(id, { ...rest, items });
      setInvoices(invoices.map(i => i.id === id ? updatedInvoice : i));
      toast({
        title: "Success",
        description: "Invoice updated successfully.",
      });
      return updatedInvoice;
    } catch (error) {
      console.error("Error updating invoice:", error);
      toast({
        title: "Error",
        description: "Failed to update invoice. Please try again.",
        variant: "destructive",
      });
      throw error;
    }
  };

  const deleteInvoice = async (id: string) => {
    try {
      await invoiceService.deleteInvoice(id);
      setInvoices(invoices.filter(i => i.id !== id));
      toast({
        title: "Success",
        description: "Invoice deleted successfully.",
      });
    } catch (error) {
      console.error("Error deleting invoice:", error);
      toast({
        title: "Error",
        description: "Failed to delete invoice. Please try again.",
        variant: "destructive",
      });
      throw error;
    }
  };

  const refreshInvoices = useCallback(async () => {
    await fetchInvoices();
  }, []);

  const fetchBusinessProfile = async () => {
    try {
      setIsLoadingBusinessProfile(true);
      const data = await businessProfileService.getBusinessProfile();
      setBusinessProfile(data);
    } catch (error) {
      console.error("Error loading business profile:", error);
      // Don't use toast in fetch functions to avoid dependency issues
    } finally {
      setIsLoadingBusinessProfile(false);
    }
  };

  const refreshBusinessProfile = useCallback(async () => {
    await fetchBusinessProfile();
  }, []);

  const saveBusinessProfile = async (profile: Omit<BusinessProfile, "id" | "createdAt" | "updatedAt">) => {
    try {
      const updatedProfile = await businessProfileService.createOrUpdateBusinessProfile(profile);
      setBusinessProfile(updatedProfile);
      toast({
        title: "Success",
        description: "Business profile saved successfully.",
      });
      return updatedProfile;
    } catch (error) {
      console.error("Error saving business profile:", error);
      toast({
        title: "Error",
        description: "Failed to save business profile. Please try again.",
        variant: "destructive",
      });
      throw error;
    }
  };

  const updateBusinessProfile = async (profile: BusinessProfile) => {
    try {
      const { id, ...rest } = profile;
      const updatedProfile = await businessProfileService.createOrUpdateBusinessProfile(rest);
      setBusinessProfile(updatedProfile);
      toast({
        title: "Success",
        description: "Business profile updated successfully.",
      });
      return updatedProfile;
    } catch (error) {
      console.error("Error updating business profile:", error);
      toast({
        title: "Error",
        description: "Failed to update business profile. Please try again.",
        variant: "destructive",
      });
      throw error;
    }
  };

  // New functions for items
  const fetchItems = async () => {
    try {
      setIsLoadingItems(true);
      const data = await itemService.getItems();
      setItems(data);
    } catch (error) {
      console.error("Error loading items:", error);
      // Don't use toast in fetch functions to avoid dependency issues
    } finally {
      setIsLoadingItems(false);
    }
  };

  const getItem = async (id: string) => {
    try {
      return await itemService.getItem(id);
    } catch (error) {
      console.error("Error loading item:", error);
      toast({
        title: "Error",
        description: "Failed to load item details. Please try again.",
        variant: "destructive",
      });
      return null;
    }
  };

  const createItem = async (item: Omit<Item, "id" | "createdAt" | "updatedAt" | "category">) => {
    try {
      const newItem = await itemService.createItem(item);
      setItems([...items, newItem]);
      toast({
        title: "Success",
        description: "Item created successfully.",
      });
      return newItem;
    } catch (error) {
      console.error("Error creating item:", error);
      toast({
        title: "Error",
        description: "Failed to create item. Please try again.",
        variant: "destructive",
      });
      throw error;
    }
  };

  const updateItem = async (id: string, item: Partial<Omit<Item, "id" | "createdAt" | "updatedAt" | "category">>) => {
    try {
      const updatedItem = await itemService.updateItem(id, item);
      setItems(items.map(i => i.id === id ? updatedItem : i));
      toast({
        title: "Success",
        description: "Item updated successfully.",
      });
      return updatedItem;
    } catch (error) {
      console.error("Error updating item:", error);
      toast({
        title: "Error",
        description: "Failed to update item. Please try again.",
        variant: "destructive",
      });
      throw error;
    }
  };

  const deleteItem = async (id: string) => {
    try {
      await itemService.deleteItem(id);
      setItems(items.filter(i => i.id !== id));
      toast({
        title: "Success",
        description: "Item deleted successfully.",
      });
    } catch (error) {
      console.error("Error deleting item:", error);
      toast({
        title: "Error",
        description: "Failed to delete item. Please try again.",
        variant: "destructive",
      });
      throw error;
    }
  };

  // New functions for item categories
  const fetchItemCategories = async () => {
    try {
      setIsLoadingItemCategories(true);
      const data = await itemCategoryService.getItemCategories();
      setItemCategories(data);
    } catch (error) {
      console.error("Error loading item categories:", error);
      // Don't use toast in fetch functions to avoid dependency issues
    } finally {
      setIsLoadingItemCategories(false);
    }
  };

  const createItemCategory = async (category: Omit<ItemCategory, "id" | "createdAt" | "updatedAt">) => {
    try {
      const newCategory = await itemCategoryService.createItemCategory(category);
      setItemCategories([...itemCategories, newCategory]);
      toast({
        title: "Success",
        description: "Category created successfully.",
      });
      return newCategory;
    } catch (error) {
      console.error("Error creating category:", error);
      toast({
        title: "Error",
        description: "Failed to create category. Please try again.",
        variant: "destructive",
      });
      throw error;
    }
  };

  const updateItemCategory = async (id: string, category: Partial<Omit<ItemCategory, "id" | "createdAt" | "updatedAt">>) => {
    try {
      const updatedCategory = await itemCategoryService.updateItemCategory(id, category);
      setItemCategories(itemCategories.map(c => c.id === id ? updatedCategory : c));
      toast({
        title: "Success",
        description: "Category updated successfully.",
      });
      return updatedCategory;
    } catch (error) {
      console.error("Error updating category:", error);
      toast({
        title: "Error",
        description: "Failed to update category. Please try again.",
        variant: "destructive",
      });
      throw error;
    }
  };

  const deleteItemCategory = async (id: string) => {
    try {
      await itemCategoryService.deleteItemCategory(id);
      setItemCategories(itemCategories.filter(c => c.id !== id));
      toast({
        title: "Success",
        description: "Category deleted successfully.",
      });
    } catch (error) {
      console.error("Error deleting category:", error);
      toast({
        title: "Error",
        description: "Failed to delete category. Please try again.",
        variant: "destructive",
      });
      throw error;
    }
  };

  const getNextInvoiceNumber = async () => {
    return await invoiceService.getNextInvoiceNumber();
  };

  const updateInvoiceStatus = async (id: string, status: Invoice['status']) => {
    try {
      const updatedInvoice = await invoiceService.updateInvoiceStatus(id, status);
      setInvoices(invoices.map(i => i.id === id ? updatedInvoice : i));
      toast({
        title: 'Success',
        description: 'Invoice status updated successfully.',
      });
      return updatedInvoice;
    } catch (error) {
      console.error('Error updating invoice status:', error);
      toast({
        title: 'Error',
        description: 'Failed to update invoice status. Please try again.',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const refreshCustomers = useCallback(async () => {
    await fetchCustomers();
  }, []);

  const fetchAccounts = async () => {
    try {
      setIsLoadingAccounts(true);
      const data = await accountService.getAccounts();
      setAccounts(data);
    } catch (error) {
      console.error("Error loading accounts:", error);
      // Don't use toast in fetch functions to avoid dependency issues
    } finally {
      setIsLoadingAccounts(false);
    }
  };

  const getAccount = async (id: string) => {
    try {
      return await accountService.getAccount(id);
    } catch (error) {
      toast({ title: "Error", description: "Failed to load account.", variant: "destructive" });
      return null;
    }
  };

  const createAccount = async (account: Omit<Account, "id" | "createdAt" | "updatedAt">) => {
    try {
      const newAccount = await accountService.createAccount(account);
      setAccounts([...accounts, newAccount]);
      toast({ title: "Success", description: "Account created." });
      return newAccount;
    } catch (error) {
      toast({ title: "Error", description: "Failed to create account.", variant: "destructive" });
      throw error;
    }
  };

  const updateAccount = async (id: string, account: Partial<Omit<Account, "id" | "createdAt" | "updatedAt">>) => {
    try {
      const updated = await accountService.updateAccount(id, account);
      setAccounts(accounts.map(a => a.id === id ? updated : a));
      toast({ title: "Success", description: "Account updated." });
      return updated;
    } catch (error) {
      toast({ title: "Error", description: "Failed to update account.", variant: "destructive" });
      throw error;
    }
  };

  const deleteAccount = async (id: string) => {
    try {
      await accountService.deleteAccount(id);
      setAccounts(accounts.filter(a => a.id !== id));
      toast({ title: "Success", description: "Account deleted." });
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete account.", variant: "destructive" });
      throw error;
    }
  };

  const refreshAccounts = useCallback(async () => {
    await fetchAccounts();
  }, []);

  // Expense Category functions
  const fetchExpenseCategories = async () => {
    try {
      setIsLoadingExpenseCategories(true);
      const data = await expenseCategoryService.getExpenseCategories();
      setExpenseCategories(data);
    } catch (error) {
      console.error("Error loading expense categories:", error);
      // Don't use toast in fetch functions to avoid dependency issues
    } finally {
      setIsLoadingExpenseCategories(false);
    }
  };

  const getExpenseCategory = async (id: string) => {
    try {
      return await expenseCategoryService.getExpenseCategory(id);
    } catch (error) {
      console.error("Error loading expense category:", error);
      toast({
        title: "Error",
        description: "Failed to load expense category. Please try again.",
        variant: "destructive",
      });
      return null;
    }
  };

  const createExpenseCategory = async (category: Omit<ExpenseCategory, "id" | "createdAt" | "updatedAt">) => {
    try {
      const newCategory = await expenseCategoryService.createExpenseCategory(category);
      setExpenseCategories([...expenseCategories, newCategory]);
      toast({
        title: "Success",
        description: "Expense category created successfully.",
      });
      return newCategory;
    } catch (error) {
      console.error("Error creating expense category:", error);
      toast({
        title: "Error",
        description: "Failed to create expense category. Please try again.",
        variant: "destructive",
      });
      throw error;
    }
  };

  const updateExpenseCategory = async (id: string, category: Partial<Omit<ExpenseCategory, "id" | "createdAt" | "updatedAt">>) => {
    try {
      const updatedCategory = await expenseCategoryService.updateExpenseCategory(id, category);
      setExpenseCategories(expenseCategories.map(c => c.id === id ? updatedCategory : c));
      toast({
        title: "Success",
        description: "Expense category updated successfully.",
      });
      return updatedCategory;
    } catch (error) {
      console.error("Error updating expense category:", error);
      toast({
        title: "Error",
        description: "Failed to update expense category. Please try again.",
        variant: "destructive",
      });
      throw error;
    }
  };

  const deleteExpenseCategory = async (id: string) => {
    try {
      await expenseCategoryService.deleteExpenseCategory(id);
      setExpenseCategories(expenseCategories.filter(c => c.id !== id));
      toast({
        title: "Success",
        description: "Expense category deleted successfully.",
      });
    } catch (error) {
      console.error("Error deleting expense category:", error);
      toast({
        title: "Error",
        description: "Failed to delete expense category. Please try again.",
        variant: "destructive",
      });
      throw error;
    }
  };

  const refreshExpenseCategories = useCallback(async () => {
    await fetchExpenseCategories();
  }, []);

  // Expense functions
  const fetchExpenses = async () => {
    try {
      setIsLoadingExpenses(true);
      const data = await expenseService.getExpenses();
      setExpenses(data);
    } catch (error) {
      console.error("Error loading expenses:", error);
      // Don't use toast in fetch functions to avoid dependency issues
    } finally {
      setIsLoadingExpenses(false);
    }
  };

  const getExpense = async (id: string) => {
    try {
      return await expenseService.getExpense(id);
    } catch (error) {
      console.error("Error loading expense:", error);
      toast({
        title: "Error",
        description: "Failed to load expense. Please try again.",
        variant: "destructive",
      });
      return null;
    }
  };

  const createExpense = async (expense: Omit<Expense, "id" | "createdAt" | "updatedAt" | "category" | "account" | "customer">) => {
    try {
      const newExpense = await expenseService.createExpense(expense);
      setExpenses([...expenses, newExpense]);
      toast({
        title: "Success",
        description: "Expense created successfully.",
      });
      return newExpense;
    } catch (error) {
      console.error("Error creating expense:", error);
      toast({
        title: "Error",
        description: "Failed to create expense. Please try again.",
        variant: "destructive",
      });
      throw error;
    }
  };

  const updateExpense = async (id: string, expense: Partial<Omit<Expense, "id" | "createdAt" | "updatedAt" | "category" | "account" | "customer">>) => {
    try {
      const updatedExpense = await expenseService.updateExpense(id, expense);
      setExpenses(expenses.map(e => e.id === id ? updatedExpense : e));
      toast({
        title: "Success",
        description: "Expense updated successfully.",
      });
      return updatedExpense;
    } catch (error) {
      console.error("Error updating expense:", error);
      toast({
        title: "Error",
        description: "Failed to update expense. Please try again.",
        variant: "destructive",
      });
      throw error;
    }
  };

  const deleteExpense = async (id: string) => {
    try {
      await expenseService.deleteExpense(id);
      setExpenses(expenses.filter(e => e.id !== id));
      toast({
        title: "Success",
        description: "Expense deleted successfully.",
      });
    } catch (error) {
      console.error("Error deleting expense:", error);
      toast({
        title: "Error",
        description: "Failed to delete expense. Please try again.",
        variant: "destructive",
      });
      throw error;
    }
  };

  const refreshExpenses = useCallback(async () => {
    await fetchExpenses();
  }, []);

  // Payment functions
  const fetchPayments = async () => {
    try {
      setIsLoadingPayments(true);
      const data = await paymentService.getPayments();
      setPayments(data);
    } catch (error) {
      console.error("Error loading payments:", error);
      // Don't use toast in fetch functions to avoid dependency issues
    } finally {
      setIsLoadingPayments(false);
    }
  };

  const fetchReceipts = async () => {
    try {
      setIsLoadingReceipts(true);
      const data = await paymentService.getReceipts();
      setReceipts(data);
    } catch (error) {
      console.error("Error loading receipts:", error);
      // Don't use toast in fetch functions to avoid dependency issues
    } finally {
      setIsLoadingReceipts(false);
    }
  };

  // Only fetch data when user is authenticated and auth loading is complete
  useEffect(() => {
    const userInitialized = user ? isInitialized(user.id) : false;
    console.log('AppContext useEffect triggered:', { 
      loading, 
      user: !!user, 
      refInitialized: initializationRef.current,
      localStorageInitialized: userInitialized
    });
    
    if (!loading && user && !initializationRef.current && !userInitialized) {
      console.log('AppContext: Initializing data for user:', user.id);
      initializationRef.current = true;
      setInitialized(user.id);
      
      // Call fetch functions directly on initial load
      fetchCustomers();
      fetchInvoices();
      fetchBusinessProfile();
      fetchItems();
      fetchItemCategories();
      fetchAccounts();
      fetchExpenses();
      fetchExpenseCategories();
      fetchPayments();
      fetchReceipts();
    } else if (!loading && !user) {
      console.log('AppContext: Resetting data - no user');
      initializationRef.current = false;
      clearInitialized();
      
      // Reset loading states when not authenticated
      setIsLoadingCustomers(false);
      setIsLoadingInvoices(false);
      setIsLoadingBusinessProfile(false);
      setIsLoadingItems(false);
      setIsLoadingItemCategories(false);
      setIsLoadingAccounts(false);
      setIsLoadingExpenses(false);
      setIsLoadingExpenseCategories(false);
      setIsLoadingPayments(false);
      setIsLoadingReceipts(false);
      
      // Clear any existing data
      setCustomers([]);
      setInvoices([]);
      setBusinessProfile(null);
      setItems([]);
      setItemCategories([]);
      setAccounts([]);
      setExpenses([]);
      setExpenseCategories([]);
      setPayments([]);
      setReceipts([]);
    } else if (!loading && user && userInitialized) {
      console.log('AppContext: User already initialized, skipping data fetch');
      initializationRef.current = true;
    }
  }, [user, loading]);

  const createPayment = async (payment: CreatePaymentRequest) => {
    try {
      const newPayment = await paymentService.createPayment(payment);
      setPayments([newPayment, ...payments]);
      
      // Refresh invoices to update payment status
      await refreshInvoices();
      
      // Refresh receipts to include new receipt
      await fetchReceipts();
      
      toast({
        title: "Success",
        description: "Payment recorded successfully and receipt generated.",
      });
      return newPayment;
    } catch (error) {
      console.error("Error creating payment:", error);
      toast({
        title: "Error",
        description: "Failed to record payment. Please try again.",
        variant: "destructive",
      });
      throw error;
    }
  };

  const getPayment = async (id: string) => {
    try {
      return await paymentService.getPayment(id);
    } catch (error) {
      console.error("Error loading payment:", error);
      toast({
        title: "Error",
        description: "Failed to load payment details. Please try again.",
        variant: "destructive",
      });
      return null;
    }
  };

  const getPaymentsByInvoice = async (invoiceId: string) => {
    try {
      return await paymentService.getPaymentsByInvoice(invoiceId);
    } catch (error) {
      console.error("Error loading payments for invoice:", error);
      toast({
        title: "Error",
        description: "Failed to load invoice payments. Please try again.",
        variant: "destructive",
      });
      return [];
    }
  };

  const getReceipt = async (id: string) => {
    try {
      return await paymentService.getReceipt(id);
    } catch (error) {
      console.error("Error loading receipt:", error);
      toast({
        title: "Error",
        description: "Failed to load receipt details. Please try again.",
        variant: "destructive",
      });
      return null;
    }
  };

  const getReceiptByPayment = async (paymentId: string) => {
    try {
      return await paymentService.getReceiptByPayment(paymentId);
    } catch (error) {
      console.error("Error loading receipt for payment:", error);
      toast({
        title: "Error",
        description: "Failed to load receipt. Please try again.",
        variant: "destructive",
      });
      return null;
    }
  };

  const markReceiptAsEmailed = async (receiptId: string) => {
    try {
      await paymentService.markReceiptAsEmailed(receiptId);
      
      // Update receipts in state
      setReceipts(prev => 
        prev.map(receipt => 
          receipt.id === receiptId 
            ? { ...receipt, isEmailed: true, emailSentAt: new Date().toISOString() }
            : receipt
        )
      );
      
      toast({
        title: "Success",
        description: "Receipt marked as emailed successfully.",
      });
    } catch (error) {
      console.error("Error marking receipt as emailed:", error);
      toast({
        title: "Error",
        description: "Failed to update receipt status. Please try again.",
        variant: "destructive",
      });
      throw error;
    }
  };

  const refreshPayments = useCallback(async () => {
    await fetchPayments();
  }, []);

  const refreshReceipts = useCallback(async () => {
    await fetchReceipts();
  }, []);

  const getInvoicesWithBalance = async () => {
    try {
      return await paymentService.getInvoicesWithBalance();
    } catch (error) {
      console.error("Error loading invoices with balance:", error);
      toast({
        title: "Error",
        description: "Failed to load unpaid invoices. Please try again.",
        variant: "destructive",
      });
      return [];
    }
  };

  return (
    <AppContext.Provider value={{
      customers,
      isLoadingCustomers,
      getCustomer,
      createCustomer,
      updateCustomer,
      deleteCustomer,
      invoices,
      isLoadingInvoices,
      getInvoice,
      createInvoice,
      updateInvoice,
      deleteInvoice,
      refreshInvoices,
      refreshCustomers,
      businessProfile,
      isLoadingBusinessProfile,
      saveBusinessProfile,
      updateBusinessProfile,
      refreshBusinessProfile,
      items,
      isLoadingItems,
      getItem,
      createItem,
      updateItem,
      deleteItem,
      itemCategories,
      isLoadingItemCategories,
      createItemCategory,
      updateItemCategory,
      deleteItemCategory,
      fetchItemCategories,
      getNextInvoiceNumber,
      updateInvoiceStatus,
      accounts,
      isLoadingAccounts,
      getAccount,
      createAccount,
      updateAccount,
      deleteAccount,
      refreshAccounts,
      expenses,
      isLoadingExpenses,
      getExpense,
      createExpense,
      updateExpense,
      deleteExpense,
      refreshExpenses,
      expenseCategories,
      isLoadingExpenseCategories,
      getExpenseCategory,
      createExpenseCategory,
      updateExpenseCategory,
      deleteExpenseCategory,
      refreshExpenseCategories,
      units,
      // Payment system
      payments,
      isLoadingPayments,
      receipts,
      isLoadingReceipts,
      createPayment,
      getPayment,
      getPaymentsByInvoice,
      getReceipt,
      getReceiptByPayment,
      markReceiptAsEmailed,
      refreshPayments,
      refreshReceipts,
      getInvoicesWithBalance
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error("useAppContext must be used within an AppProvider");
  }
  return context;
};
