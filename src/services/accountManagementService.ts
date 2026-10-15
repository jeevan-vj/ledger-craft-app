import { supabase } from '@/integrations/supabase/client';
import { accountsApi, accountsApiEnabled } from '@/features/payments/api/paymentsApi';

interface AccountTemplate {
  id: string;
  name: string;
  account_number: string;
  account_class: string;
  account_type: string;
  normal_balance: string;
  description: string | null;
  country_code: string;
}

interface Account {
  id: string;
  user_id: string;
  name: string;
  account_number: string | null;
  account_class: string | null;
  account_type: string | null;
  normal_balance: string | null;
  description: string | null;
  is_active: boolean;
}

/**
 * Account Management Service
 * Handles account lookup, creation, and initialization from templates
 */
export class AccountManagementService {
  /**
   * Get or create an account by account number for a user
   * Returns the account ID
   */
  async getOrCreateAccountByNumber(
    userId: string,
    accountNumber: string
  ): Promise<string> {
    if (accountsApiEnabled()) {
      const existing = (await accountsApi.list()).find(
        (account) => account.accountNumber === accountNumber && account.isActive !== false,
      );
      if (existing) return existing.id;
      const defaults: Record<string, { name: string; type: string; accountClass: string }> = {
        '1200': { name: 'Accounts Receivable', type: 'asset', accountClass: 'asset' },
        '2200': { name: 'GST Collected on Sales', type: 'liability', accountClass: 'liability' },
        '4000': { name: 'Sales Revenue', type: 'revenue', accountClass: 'revenue' },
        '4100': { name: 'Service Revenue', type: 'revenue', accountClass: 'revenue' },
        '1110': { name: 'Bank Account - Current', type: 'bank', accountClass: 'asset' },
        '1120': { name: 'Cash on Hand', type: 'cash', accountClass: 'asset' },
        '2300': { name: 'Credit Card', type: 'credit_card', accountClass: 'liability' },
      };
      const seed = defaults[accountNumber] ?? {
        name: `Account ${accountNumber}`,
        type: 'custom',
        accountClass: 'asset',
      };
      const created = await accountsApi.create({
        name: seed.name,
        type: seed.type,
        accountNumber,
        accountClass: seed.accountClass,
      });
      return created.id;
    }
    try {
      // First, check if account exists for this user
      const { data: existingAccount, error: findError } = await supabase
        .from('accounts')
        .select('id')
        .eq('user_id', userId)
        .eq('account_number', accountNumber)
        .eq('is_active', true)
        .maybeSingle(); // Use maybeSingle instead of single to handle 0 rows

      if (existingAccount && !findError) {
        return existingAccount.id;
      }

      // Account doesn't exist, try to get template
      const { data: template, error: templateError } = await supabase
        .from('account_templates')
        .select('*')
        .eq('account_number', accountNumber)
        .maybeSingle();

      // If template table doesn't exist or template not found, create account with defaults
      if (templateError || !template) {
        console.warn(
          `Account template not found for account number: ${accountNumber}. Creating account with defaults.`,
          templateError?.message
        );

        // Map account numbers to default account names
        const defaultAccountNames: Record<string, { name: string; type: string; accountClass: string }> = {
          '1200': { name: 'Accounts Receivable', type: 'receivable', accountClass: 'Asset' },
          '2200': { name: 'GST Collected on Sales', type: 'tax', accountClass: 'Liability' },
          '4000': { name: 'Sales Revenue', type: 'income', accountClass: 'Revenue' },
          '4100': { name: 'Service Revenue', type: 'income', accountClass: 'Revenue' },
          '1110': { name: 'Bank Account - Current', type: 'bank', accountClass: 'Asset' },
          '1120': { name: 'Cash on Hand', type: 'cash', accountClass: 'Asset' },
          '2300': { name: 'Credit Card', type: 'credit_card', accountClass: 'Liability' }
        };

        const defaults = defaultAccountNames[accountNumber] || {
          name: `Account ${accountNumber}`,
          type: 'custom',
          accountClass: 'Asset'
        };

        // Create account with defaults
        const { data: newAccount, error: createError } = await supabase
          .from('accounts')
          .insert({
            user_id: userId,
            name: defaults.name,
            account_number: accountNumber,
            account_class: defaults.accountClass,
            type: defaults.type,
            normal_balance: defaults.accountClass === 'Asset' || defaults.accountClass === 'Expense' ? 'debit' : 'credit',
            description: defaults.name,
            is_active: true,
            opening_balance: 0,
            current_balance: 0,
            currency: 'NZD'
          })
          .select('id')
          .single();

        if (createError || !newAccount) {
          throw new Error(
            `Failed to create account: ${createError?.message || 'Unknown error'}`
          );
        }

        return newAccount.id;
      }

      // Template exists, create account from template
      const { data: newAccount, error: createError } = await supabase
        .from('accounts')
        .insert({
          user_id: userId,
          name: template.name,
          account_number: template.account_number,
          account_class: template.account_class,
          type: template.account_type,
          normal_balance: template.normal_balance,
          description: template.description,
          is_active: true,
          opening_balance: 0,
          current_balance: 0,
          currency: 'NZD' // Default currency for NZ accounts
        })
        .select('id')
        .single();

      if (createError || !newAccount) {
        throw new Error(
          `Failed to create account from template: ${createError?.message || 'Unknown error'}`
        );
      }

      return newAccount.id;
    } catch (error) {
      console.error('Error in getOrCreateAccountByNumber:', error);
      throw error;
    }
  }

  /**
   * Initialize user's chart of accounts from NZ templates
   * Creates essential accounts needed for invoicing and payments
   */
  async initializeUserAccounts(userId: string): Promise<void> {
    if (accountsApiEnabled()) {
      await accountsApi.initialize();
      return;
    }
    try {
      // Check if user already has accounts
      const { data: existingAccounts, error: checkError } = await supabase
        .from('accounts')
        .select('id')
        .eq('user_id', userId)
        .limit(1);

      if (checkError) {
        throw new Error(`Error checking existing accounts: ${checkError.message}`);
      }

      // If user already has accounts, skip initialization
      if (existingAccounts && existingAccounts.length > 0) {
        return;
      }

      // Required account numbers for basic invoicing
      const requiredAccounts = [
        '1200', // Accounts Receivable
        '2200', // GST Collected on Sales
        '4000', // Sales Revenue
        '4100', // Service Revenue
        '1110', // Bank Account - Current
        '1120'  // Cash on Hand
      ];

      // Get all templates for NZ
      const { data: templates, error: templatesError } = await supabase
        .from('account_templates')
        .select('*')
        .eq('country_code', 'NZ')
        .in('account_number', requiredAccounts);

      if (templatesError) {
        throw new Error(`Error fetching account templates: ${templatesError.message}`);
      }

      if (!templates || templates.length === 0) {
        throw new Error('No account templates found for initialization');
      }

      // Create accounts from templates
      const accountsToCreate = templates.map((template) => ({
        user_id: userId,
        name: template.name,
        account_number: template.account_number,
        account_class: template.account_class,
        type: template.account_type,
        normal_balance: template.normal_balance,
        description: template.description,
        is_active: true,
        opening_balance: 0,
        current_balance: 0,
        currency: 'NZD' // Default currency for NZ accounts
      }));

      const { error: createError } = await supabase
        .from('accounts')
        .insert(accountsToCreate);

      if (createError) {
        throw new Error(`Error creating accounts: ${createError.message}`);
      }
    } catch (error) {
      console.error('Error initializing user accounts:', error);
      throw error;
    }
  }

  /**
   * Get account ID by number, throwing error if not found
   */
  async getAccountIdByNumber(userId: string, accountNumber: string): Promise<string> {
    // Use getOrCreate to ensure account exists
    return this.getOrCreateAccountByNumber(userId, accountNumber);
  }

  /**
   * Get bank account based on payment method
   */
  async getBankAccountForPaymentMethod(
    userId: string,
    paymentMethod: string
  ): Promise<string> {
    let accountNumber: string;

    switch (paymentMethod) {
      case 'bank_transfer':
      case 'online':
        accountNumber = '1110'; // Bank Account - Current
        break;
      case 'cash':
        accountNumber = '1120'; // Cash on Hand
        break;
      case 'credit_card':
        accountNumber = '2300'; // Credit Card
        break;
      default:
        // Default to bank account
        accountNumber = '1110';
    }

    return this.getOrCreateAccountByNumber(userId, accountNumber);
  }
}

export const accountManagementService = new AccountManagementService();

