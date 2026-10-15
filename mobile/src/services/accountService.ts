import { accountsApi, accountsApiEnabled } from '@/features/payments/api/paymentsApi';
import { supabase } from './supabaseClient';
import type { Account } from '@/types/expense';

export class AccountService {
  // Fetch all accounts for the current user
  async fetchAccounts(): Promise<Account[]> {
    try {
      if (accountsApiEnabled()) {
        return accountsApi.list();
      }

      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('User not authenticated');
      }

      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('user_id', user.id)
        .order('name');

      if (error) throw error;

      // Transform snake_case to camelCase
      return (data || []).map((account: any) => ({
        id: account.id,
        name: account.name,
        type: account.type,
        currency: account.currency,
        openingBalance: account.opening_balance,
        currentBalance: account.current_balance,
        userId: account.user_id,
        createdAt: account.created_at,
        updatedAt: account.updated_at,
      }));
    } catch (error) {
      console.error('Error fetching accounts:', error);
      throw error;
    }
  }
}

export const accountService = new AccountService();

