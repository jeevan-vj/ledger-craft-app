import { expensesApi, expensesApiEnabled } from '@/features/expenses/api/expensesApi';
import { supabase } from './supabaseClient';
import type { ExpenseCategory } from '@/types/expense';

// Helper function to transform snake_case to camelCase
const mapSupabaseExpenseCategoryToExpenseCategory = (category: any): ExpenseCategory => ({
  id: category.id,
  name: category.name,
  description: category.description,
  color: category.color,
  userId: category.user_id,
  createdAt: category.created_at,
  updatedAt: category.updated_at,
});

export class ExpenseCategoryService {
  // Fetch all expense categories for the current user
  async fetchExpenseCategories(): Promise<ExpenseCategory[]> {
    try {
      if (expensesApiEnabled()) {
        return expensesApi.listCategories();
      }

      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('User not authenticated');
      }

      const { data, error } = await supabase
        .from('expense_categories')
        .select('*')
        .eq('user_id', user.id)
        .order('name');

      if (error) throw error;

      // Transform snake_case to camelCase
      return (data || []).map(mapSupabaseExpenseCategoryToExpenseCategory);
    } catch (error) {
      console.error('Error fetching expense categories:', error);
      throw error;
    }
  }

  // Fetch a single expense category by ID
  async fetchExpenseCategoryById(id: string): Promise<ExpenseCategory | null> {
    try {
      if (expensesApiEnabled()) {
        const categories = await expensesApi.listCategories();
        return categories.find((category) => category.id === id) ?? null;
      }

      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('User not authenticated');
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
        throw error;
      }

      if (!data) return null;

      return mapSupabaseExpenseCategoryToExpenseCategory(data);
    } catch (error) {
      console.error('Error fetching expense category:', error);
      throw error;
    }
  }

  // Create a new expense category
  async createExpenseCategory(category: Omit<ExpenseCategory, 'id' | 'createdAt' | 'updatedAt'>): Promise<ExpenseCategory> {
    try {
      if (expensesApiEnabled()) {
        return expensesApi.createCategory({
          name: category.name,
          description: category.description ?? null,
          color: category.color ?? null,
        });
      }

      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Transform to snake_case for database
      const dbCategoryData = {
        name: category.name,
        description: category.description || null,
        color: category.color || null,
        user_id: user.id,
      };

      const { data, error } = await supabase
        .from('expense_categories')
        .insert(dbCategoryData)
        .select()
        .single();

      if (error) throw error;

      return mapSupabaseExpenseCategoryToExpenseCategory(data);
    } catch (error) {
      console.error('Error creating expense category:', error);
      throw error;
    }
  }

  // Update an existing expense category
  async updateExpenseCategory(id: string, category: Partial<Omit<ExpenseCategory, 'id' | 'createdAt' | 'updatedAt'>>): Promise<ExpenseCategory> {
    try {
      if (expensesApiEnabled()) {
        const input: Record<string, unknown> = {};
        if (category.name !== undefined) input.name = category.name;
        if (category.description !== undefined) input.description = category.description ?? null;
        if (category.color !== undefined) input.color = category.color ?? null;
        return expensesApi.updateCategory(id, input);
      }

      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Transform to snake_case for database
      const updateData: any = {};
      if (category.name !== undefined) updateData.name = category.name;
      if (category.description !== undefined) updateData.description = category.description || null;
      if (category.color !== undefined) updateData.color = category.color || null;
      updateData.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from('expense_categories')
        .update(updateData)
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) throw error;

      return mapSupabaseExpenseCategoryToExpenseCategory(data);
    } catch (error) {
      console.error('Error updating expense category:', error);
      throw error;
    }
  }

  // Delete an expense category
  async deleteExpenseCategory(id: string): Promise<void> {
    try {
      if (expensesApiEnabled()) {
        await expensesApi.removeCategory(id);
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('User not authenticated');
      }

      const { error } = await supabase
        .from('expense_categories')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting expense category:', error);
      throw error;
    }
  }
}

export const expenseCategoryService = new ExpenseCategoryService();

