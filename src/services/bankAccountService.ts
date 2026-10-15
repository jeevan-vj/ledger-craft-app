import { supabase } from '@/integrations/supabase/client';
import { BankAccount, SupabaseBankAccount } from '../types/bankTransaction';
import {
  bankApi,
  bankApiEnabled,
  toCreateBankAccountRequest,
  toUpdateBankAccountRequest,
} from '@/features/bank/api/bankApi';

const mapSupabaseBankAccountToBankAccount = (account: SupabaseBankAccount): BankAccount => ({
  id: account.id,
  accountName: account.account_name,
  accountNumber: account.account_number,
  bankName: account.bank_name,
  accountType: account.account_type,
  currency: account.currency,
  openingBalance: account.opening_balance,
  currentBalance: account.current_balance,
  isActive: account.is_active,
  userId: account.user_id,
  createdAt: account.created_at,
  updatedAt: account.updated_at,
});

const mapBankAccountToSupabaseBankAccount = async (
  account: Omit<BankAccount, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Omit<SupabaseBankAccount, 'id' | 'created_at' | 'updated_at'>> => {
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id || '';

  return {
    account_name: account.accountName,
    account_number: account.accountNumber,
    bank_name: account.bankName,
    account_type: account.accountType,
    currency: account.currency,
    opening_balance: account.openingBalance,
    current_balance: account.currentBalance,
    is_active: account.isActive,
    user_id: account.userId || userId,
  };
};

export const bankAccountService = {
  async getBankAccounts(): Promise<BankAccount[]> {
    if (bankApiEnabled()) {
      return bankApi.listAccounts();
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      console.error('No authenticated user found');
      return [];
    }

    const { data, error } = await supabase
      .from('bank_accounts')
      .select('*')
      .eq('user_id', user.id)
      .order('account_name');

    if (error) {
      console.error('Error fetching bank accounts:', error);
      throw error;
    }

    return (data as SupabaseBankAccount[]).map(mapSupabaseBankAccountToBankAccount) || [];
  },

  async getBankAccount(id: string): Promise<BankAccount | null> {
    if (bankApiEnabled()) {
      return bankApi.getAccount(id);
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      console.error('No authenticated user found');
      return null;
    }

    const { data, error } = await supabase
      .from('bank_accounts')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      console.error('Error fetching bank account:', error);
      throw error;
    }

    return data ? mapSupabaseBankAccountToBankAccount(data as SupabaseBankAccount) : null;
  },

  async createBankAccount(account: Omit<BankAccount, 'id' | 'createdAt' | 'updatedAt'>): Promise<BankAccount> {
    this.validateBankAccount(account);
    if (bankApiEnabled()) {
      return bankApi.createAccount(toCreateBankAccountRequest(account));
    } 
    const supabaseAccount = await mapBankAccountToSupabaseBankAccount(account);

    const { data, error } = await supabase
      .from('bank_accounts')
      .insert([supabaseAccount])
      .select()
      .single();

    if (error) {
      console.error('Error creating bank account:', error);
      throw error;
    }

    return mapSupabaseBankAccountToBankAccount(data as SupabaseBankAccount);
  },

  async updateBankAccount(
    id: string,
    account: Partial<Omit<BankAccount, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<BankAccount> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      throw new Error('No authenticated user found');
    }

    // Check if account exists
    const existingAccount = await this.getBankAccount(id);
    if (!existingAccount) {
      throw new Error(`Bank account with id ${id} not found`);
    }

    // Validate updated data
    const mergedAccount = { ...existingAccount, ...account };
    this.validateBankAccount(mergedAccount);
    if (bankApiEnabled()) {
      return bankApi.updateAccount(id, toUpdateBankAccountRequest(account));
    }

    const updateData: Partial<SupabaseBankAccount> = {};
    if (account.accountName !== undefined) updateData.account_name = account.accountName;
    if (account.accountNumber !== undefined) updateData.account_number = account.accountNumber;
    if (account.bankName !== undefined) updateData.bank_name = account.bankName;
    if (account.accountType !== undefined) updateData.account_type = account.accountType;
    if (account.currency !== undefined) updateData.currency = account.currency;
    if (account.openingBalance !== undefined) updateData.opening_balance = account.openingBalance;
    if (account.currentBalance !== undefined) updateData.current_balance = account.currentBalance;
    if (account.isActive !== undefined) updateData.is_active = account.isActive;

    const { data, error } = await supabase
      .from('bank_accounts')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating bank account:', error);
      throw error;
    }

    return mapSupabaseBankAccountToBankAccount(data as SupabaseBankAccount);
  },

  async deleteBankAccount(id: string): Promise<void> {
    if (bankApiEnabled()) {
      await bankApi.removeAccount(id);
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      throw new Error('No authenticated user found');
    }

    const { error } = await supabase
      .from('bank_accounts')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting bank account:', error);
      throw new Error(error.message);
    }
  },

  validateBankAccount(account: Omit<BankAccount, 'id' | 'createdAt' | 'updatedAt'>): void {
    if (!account.accountName || account.accountName.trim().length === 0) {
      throw new Error('Account name is required');
    }

    if (!account.accountNumber || account.accountNumber.trim().length < 4) {
      throw new Error('Account number must be at least 4 characters');
    }

    if (!account.bankName || account.bankName.trim().length === 0) {
      throw new Error('Bank name is required');
    }

    const validAccountTypes = ['checking', 'savings', 'credit_card', 'business'];
    if (!validAccountTypes.includes(account.accountType)) {
      throw new Error('Invalid account type');
    }

    if (!account.currency || account.currency.trim().length === 0) {
      throw new Error('Currency is required');
    }

    if (account.openingBalance < 0) {
      throw new Error('Opening balance cannot be negative');
    }

    if (account.currentBalance < 0 && account.accountType !== 'credit_card') {
      throw new Error('Current balance cannot be negative for non-credit accounts');
    }
  },

  async getAccountsByType(accountType: BankAccount['accountType']): Promise<BankAccount[]> {
    if (bankApiEnabled()) {
      return (await bankApi.listAccounts()).filter((account) => account.accountType === accountType);
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      return [];
    }

    const { data, error } = await supabase
      .from('bank_accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('account_type', accountType)
      .order('account_name');

    if (error) {
      console.error('Error fetching accounts by type:', error);
      throw error;
    }

    return (data as SupabaseBankAccount[]).map(mapSupabaseBankAccountToBankAccount) || [];
  },

  async getActiveAccounts(): Promise<BankAccount[]> {
    if (bankApiEnabled()) {
      return (await bankApi.listAccounts()).filter((account) => account.isActive);
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      return [];
    }

    const { data, error } = await supabase
      .from('bank_accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('account_name');

    if (error) {
      console.error('Error fetching active accounts:', error);
      throw error;
    }

    return (data as SupabaseBankAccount[]).map(mapSupabaseBankAccountToBankAccount) || [];
  }
};