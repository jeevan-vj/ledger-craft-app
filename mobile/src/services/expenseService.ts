import { expensesApi, expensesApiEnabled } from '@/features/expenses/api/expensesApi';
import { supabase } from './supabaseClient';
import type { Expense, ExpenseCategory, Account, Customer } from '@/types/expense';
import type { ExpenseStatus, PaymentMethod } from '@/types/expense';

// Import types - check if they exist in a shared location
// Using the types from mobile/shared/types/index.ts pattern

interface ExpenseFilters {
  categoryId?: string;
  accountId?: string;
  customerId?: string;
  status?: ExpenseStatus;
  dateFrom?: string;
  dateTo?: string;
}

// Helper functions to transform snake_case to camelCase and vice versa
const mapSupabaseExpenseCategoryToExpenseCategory = (category: any): ExpenseCategory => ({
  id: category.id,
  name: category.name,
  description: category.description,
  color: category.color,
  userId: category.user_id,
  createdAt: category.created_at,
  updatedAt: category.updated_at,
});

const mapSupabaseAccountToAccount = (account: any): Account => ({
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

const mapSupabaseCustomerToCustomer = (customer: any): Customer => ({
  id: customer.id,
  name: customer.name,
  email: customer.email,
  phone: customer.phone,
  address: customer.address,
  city: customer.city,
  state: customer.state,
  zip: customer.zip,
  country: customer.country,
});

const mapSupabaseExpenseToExpense = (expense: any): Expense => ({
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

export class ExpenseService {
  // Fetch all expenses for the current user with optional filters
  async fetchExpenses(filters?: ExpenseFilters): Promise<Expense[]> {
    try {
      if (expensesApiEnabled()) {
        let rows = await expensesApi.list();
        if (filters?.categoryId) rows = rows.filter((row) => row.categoryId === filters.categoryId);
        if (filters?.accountId) rows = rows.filter((row) => row.accountId === filters.accountId);
        if (filters?.customerId) rows = rows.filter((row) => row.customerId === filters.customerId);
        if (filters?.status) rows = rows.filter((row) => row.status === filters.status);
        if (filters?.dateFrom) rows = rows.filter((row) => row.expenseDate >= filters.dateFrom!);
        if (filters?.dateTo) rows = rows.filter((row) => row.expenseDate <= filters.dateTo!);
        return rows;
      }

      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('User not authenticated');
      }

      let query = supabase
        .from('expenses')
        .select(`
          *,
          expense_categories (
            id,
            name,
            description,
            color,
            user_id,
            created_at,
            updated_at
          ),
          accounts (
            id,
            name,
            type,
            currency,
            opening_balance,
            current_balance,
            user_id,
            created_at,
            updated_at
          ),
          customers (
            id,
            name,
            email,
            phone,
            address,
            city,
            state,
            zip,
            country
          )
        `)
        .eq('user_id', user.id);

      // Apply filters
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

      if (error) throw error;

      // Transform snake_case to camelCase
      return (data || []).map(mapSupabaseExpenseToExpense);
    } catch (error) {
      console.error('Error fetching expenses:', error);
      throw error;
    }
  }

  // Fetch a single expense by ID
  async fetchExpenseById(id: string): Promise<Expense> {
    try {
      if (expensesApiEnabled()) {
        return expensesApi.get(id);
      }

      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('User not authenticated');
      }

      const { data, error } = await supabase
        .from('expenses')
        .select(`
          *,
          expense_categories (
            id,
            name,
            description,
            color,
            user_id,
            created_at,
            updated_at
          ),
          accounts (
            id,
            name,
            type,
            currency,
            opening_balance,
            current_balance,
            user_id,
            created_at,
            updated_at
          ),
          customers (
            id,
            name,
            email,
            phone,
            address,
            city,
            state,
            zip,
            country
          )
        `)
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

      if (error) throw error;
      if (!data) throw new Error('Expense not found');

      return mapSupabaseExpenseToExpense(data);
    } catch (error) {
      console.error('Error fetching expense:', error);
      throw error;
    }
  }

  // Create a new expense
  async createExpense(expense: Omit<Expense, 'id' | 'createdAt' | 'updatedAt' | 'category' | 'account' | 'customer'>): Promise<Expense> {
    try {
      if (expensesApiEnabled()) {
        return expensesApi.create({
          description: expense.description,
          amount: String(expense.amount),
          taxAmount: String(expense.taxAmount ?? 0),
          currency: expense.currency || 'NZD',
          expenseDate: expense.expenseDate,
          status: expense.status,
          isBillable: expense.isBillable,
          categoryId: expense.categoryId ?? null,
          accountId: expense.accountId ?? null,
          customerId: expense.customerId ?? null,
          vendorName: expense.vendorName ?? null,
          receiptUrl: expense.receiptUrl ?? null,
          paymentMethod: expense.paymentMethod ?? null,
          notes: expense.notes ?? null,
        });
      }

      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Transform to snake_case for database
      const dbExpenseData = {
        description: expense.description,
        amount: expense.amount,
        category_id: expense.categoryId || null,
        account_id: expense.accountId || null,
        vendor_name: expense.vendorName || null,
        receipt_url: expense.receiptUrl || null,
        expense_date: expense.expenseDate,
        status: expense.status || 'pending',
        is_billable: expense.isBillable || false,
        customer_id: expense.customerId || null,
        tax_amount: expense.taxAmount || 0,
        currency: expense.currency || 'USD',
        payment_method: expense.paymentMethod || null,
        notes: expense.notes || null,
        user_id: user.id,
      };

      // Insert expense
      const { data, error } = await supabase
        .from('expenses')
        .insert(dbExpenseData)
        .select(`
          *,
          expense_categories (
            id,
            name,
            description,
            color,
            user_id,
            created_at,
            updated_at
          ),
          accounts (
            id,
            name,
            type,
            currency,
            opening_balance,
            current_balance,
            user_id,
            created_at,
            updated_at
          ),
          customers (
            id,
            name,
            email,
            phone,
            address,
            city,
            state,
            zip,
            country
          )
        `)
        .single();

      if (error) throw error;

      return mapSupabaseExpenseToExpense(data);
    } catch (error) {
      console.error('Error creating expense:', error);
      throw error;
    }
  }

  // Update an existing expense
  async updateExpense(id: string, expense: Partial<Omit<Expense, 'id' | 'createdAt' | 'updatedAt' | 'category' | 'account' | 'customer'>>): Promise<Expense> {
    try {
      if (expensesApiEnabled()) {
        const input: Record<string, unknown> = {};
        if (expense.description !== undefined) input.description = expense.description;
        if (expense.amount !== undefined) input.amount = String(expense.amount);
        if (expense.taxAmount !== undefined) input.taxAmount = String(expense.taxAmount);
        if (expense.currency !== undefined) input.currency = expense.currency;
        if (expense.expenseDate !== undefined) input.expenseDate = expense.expenseDate;
        if (expense.status !== undefined) input.status = expense.status;
        if (expense.isBillable !== undefined) input.isBillable = expense.isBillable;
        if (expense.categoryId !== undefined) input.categoryId = expense.categoryId ?? null;
        if (expense.accountId !== undefined) input.accountId = expense.accountId ?? null;
        if (expense.customerId !== undefined) input.customerId = expense.customerId ?? null;
        if (expense.vendorName !== undefined) input.vendorName = expense.vendorName ?? null;
        if (expense.receiptUrl !== undefined) input.receiptUrl = expense.receiptUrl ?? null;
        if (expense.paymentMethod !== undefined) input.paymentMethod = expense.paymentMethod ?? null;
        if (expense.notes !== undefined) input.notes = expense.notes ?? null;
        return expensesApi.update(id, input);
      }

      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Transform to snake_case for database
      const updateData: any = {};
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
      updateData.updated_at = new Date().toISOString();

      // Update expense
      const { data, error } = await supabase
        .from('expenses')
        .update(updateData)
        .eq('id', id)
        .eq('user_id', user.id)
        .select(`
          *,
          expense_categories (
            id,
            name,
            description,
            color,
            user_id,
            created_at,
            updated_at
          ),
          accounts (
            id,
            name,
            type,
            currency,
            opening_balance,
            current_balance,
            user_id,
            created_at,
            updated_at
          ),
          customers (
            id,
            name,
            email,
            phone,
            address,
            city,
            state,
            zip,
            country
          )
        `)
        .single();

      if (error) throw error;

      return mapSupabaseExpenseToExpense(data);
    } catch (error) {
      console.error('Error updating expense:', error);
      throw error;
    }
  }

  // Delete an expense
  async deleteExpense(id: string): Promise<void> {
    try {
      if (expensesApiEnabled()) {
        await expensesApi.remove(id);
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Delete the expense
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting expense:', error);
      throw error;
    }
  }
}

export const expenseService = new ExpenseService();

