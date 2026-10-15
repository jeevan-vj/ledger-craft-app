import { supabase } from '@/integrations/supabase/client';
import { FinancialSummary, AccountBalanceSummary } from '@/types/payment';
import { startOfMonth, endOfMonth, format } from 'date-fns';
import { inInclusiveDateRange, ledgerSnapshotEnabled, loadLedgerSnapshot } from '@/features/ledger/api/ledgerSnapshot';
import { accountsApiEnabled } from '@/features/payments/api/paymentsApi';

export interface FinancialPeriod {
  startDate: string;
  endDate: string;
}

export interface CashFlowData {
  day: string;
  inflow: number;
  outflow: number;
}

export interface RevenueExpenseData {
  month: string;
  revenue: number;
  expenses: number;
}

export class AccountingService {
  async getFinancialSummary(period?: FinancialPeriod): Promise<FinancialSummary> {
    try {
      const startDate = period?.startDate || format(startOfMonth(new Date()), 'yyyy-MM-dd');
      const endDate = period?.endDate || format(endOfMonth(new Date()), 'yyyy-MM-dd');

      if (ledgerSnapshotEnabled()) {
        const snapshot = await loadLedgerSnapshot();
        const invoices = snapshot.invoices.filter((invoice) => inInclusiveDateRange(invoice.date, startDate, endDate));
        const expenses = snapshot.expenses.filter((expense) => inInclusiveDateRange(expense.expenseDate, startDate, endDate));
        const payments = snapshot.payments.filter((payment) => inInclusiveDateRange(payment.paymentDate, startDate, endDate));
        const totalRevenue = invoices.reduce((sum, invoice) => sum + (invoice.total || 0), 0);
        const totalExpenses = expenses.reduce((sum, expense) => sum + (expense.amount || 0), 0);
        const unpaidInvoices = snapshot.invoices.filter((invoice) => invoice.status === 'sent');
        const gstCollected = invoices
          .filter((invoice) => invoice.status === 'paid')
          .reduce((sum, invoice) => sum + (invoice.taxAmount || invoice.total * 0.15), 0);
        const gstPaid = expenses.reduce((sum, expense) => sum + (expense.amount || 0) * 0.15, 0);
        return {
          totalRevenue,
          totalExpenses,
          netIncome: totalRevenue - totalExpenses,
          totalReceivables: unpaidInvoices.reduce((sum, invoice) => sum + (invoice.total || 0), 0),
          totalPayables: snapshot.expenses
            .filter((expense) => expense.status === 'pending')
            .reduce((sum, expense) => sum + (expense.amount || 0), 0),
          cashPosition: payments.reduce((sum, payment) => sum + (payment.amount || 0), 0),
          gstLiability: Math.max(0, gstCollected - gstPaid),
          period: { startDate, endDate },
        };
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Get invoices data with error handling
      const { data: invoices, error: invoicesError } = await supabase
        .from('invoices')
        .select('total, status')
        .eq('user_id', user.id)
        .gte('date', startDate)
        .lte('date', endDate);

      if (invoicesError) {
        console.error('Error fetching invoices:', invoicesError);
        throw new Error(`Failed to fetch invoices: ${invoicesError.message}`);
      }

      console.log('Invoices fetched:', invoices?.length || 0);

      // Get expenses data with error handling
      const { data: expenses, error: expensesError } = await supabase
        .from('expenses')
        .select('amount')
        .eq('user_id', user.id)
        .gte('expense_date', startDate)
        .lte('expense_date', endDate);

      if (expensesError) {
        console.error('Error fetching expenses:', expensesError);
        throw new Error(`Failed to fetch expenses: ${expensesError.message}`);
      }

      console.log('Expenses fetched:', expenses?.length || 0);

      // Get payments data with error handling
      const { data: payments, error: paymentsError } = await supabase
        .from('payments')
        .select('amount')
        .eq('user_id', user.id)
        .gte('payment_date', startDate)
        .lte('payment_date', endDate);

      if (paymentsError) {
        console.error('Error fetching payments:', paymentsError);
        // Don't throw for payments as it might not exist yet
        console.warn('Payments table might not exist or have data');
      }

      console.log('Payments fetched:', payments?.length || 0);

      // Calculate totals
      const totalRevenue = invoices?.reduce((sum, invoice) => sum + (invoice.total || 0), 0) || 0;
      const totalExpenses = expenses?.reduce((sum, expense) => sum + (expense.amount || 0), 0) || 0;
      const netIncome = totalRevenue - totalExpenses;

      // Calculate receivables (unpaid invoices)
      const { data: unpaidInvoices, error: unpaidError } = await supabase
        .from('invoices')
        .select('total')
        .eq('user_id', user.id)
        .eq('status', 'sent');

      if (unpaidError) {
        console.error('Error fetching unpaid invoices:', unpaidError);
        // Don't throw, use fallback
      }

      const totalReceivables = unpaidInvoices?.reduce((sum, invoice) => sum + (invoice.total || 0), 0) || 0;
      const outstandingInvoices = unpaidInvoices?.length || 0;

      // Calculate cash position from payments
      const cashPosition = payments?.reduce((sum, payment) => sum + (payment.amount || 0), 0) || 0;

      // Calculate GST liability using real tax calculation service
      const gstLiability = await this.calculateRealGSTLiability(startDate, endDate);

      // Calculate real payables from pending expenses
      const totalPayables = await this.calculateRealPayables();

      const result = {
        totalRevenue,
        totalExpenses,
        netIncome,
        totalReceivables,
        totalPayables,
        cashPosition,
        gstLiability,
        outstandingInvoices,
        period: {
          startDate,
          endDate
        }
      };

      console.log('Financial summary calculated:', result);
      return result;

    } catch (error) {
      console.error('Error in getFinancialSummary:', error);
      throw error;
    }
  }

  async getAccountBalances(): Promise<AccountBalanceSummary[]> {
    try {
      if (accountsApiEnabled()) {
        const snapshot = await loadLedgerSnapshot();
        if (snapshot.accounts.length === 0) return this.getDefaultAccountBalances();
        return snapshot.accounts.map((account) => ({
          accountId: account.id,
          accountName: account.name,
          accountNumber: '0000',
          accountClass: account.type || 'Asset',
          openingBalance: account.openingBalance || 0,
          totalDebits: 0,
          totalCredits: 0,
          closingBalance: account.currentBalance || account.openingBalance || 0,
        }));
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      console.log('Fetching account balances for user:', user.id);

      // Get accounts data
      const { data: accounts, error: accountsError } = await supabase
        .from('accounts')
        .select('*')
        .eq('user_id', user.id)
        .order('account_number');

      if (accountsError) {
        console.error('Error fetching accounts:', accountsError);
        console.log('Falling back to default accounts');
        return this.getDefaultAccountBalances();
      }

      console.log('Accounts fetched:', accounts?.length || 0);

      if (!accounts || accounts.length === 0) {
        // Return default accounts if none exist
        return this.getDefaultAccountBalances();
      }

      return accounts.map(account => ({
        accountId: account.id,
        accountName: account.name,
        accountNumber: account.account_number || '0000',
        accountClass: account.account_class || account.type || 'Asset',
        openingBalance: account.opening_balance || 0,
        totalDebits: 0, // Would need journal entries to calculate
        totalCredits: 0, // Would need journal entries to calculate
        closingBalance: account.current_balance || account.opening_balance || 0
      }));
    } catch (error) {
      console.error('Error in getAccountBalances:', error);
      return this.getDefaultAccountBalances();
    }
  }

  private getDefaultAccountBalances(): AccountBalanceSummary[] {
    return [
      {
        accountId: 'default-cash',
        accountName: 'Business Checking',
        accountNumber: '1110',
        accountClass: 'Asset',
        openingBalance: 0,
        totalDebits: 0,
        totalCredits: 0,
        closingBalance: 0
      },
      {
        accountId: 'default-receivables',
        accountName: 'Accounts Receivable',
        accountNumber: '1200',
        accountClass: 'Asset',
        openingBalance: 0,
        totalDebits: 0,
        totalCredits: 0,
        closingBalance: 0
      }
    ];
  }

  async getRevenueExpenseData(months: number = 6): Promise<RevenueExpenseData[]> {
    try {
      const data: RevenueExpenseData[] = [];
      const currentDate = new Date();
      if (ledgerSnapshotEnabled()) {
        const snapshot = await loadLedgerSnapshot();
        for (let i = months - 1; i >= 0; i--) {
          const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
          const startDate = format(startOfMonth(date), 'yyyy-MM-dd');
          const endDate = format(endOfMonth(date), 'yyyy-MM-dd');
          data.push({
            month: format(date, 'MMM'),
            revenue: snapshot.invoices
              .filter((invoice) => inInclusiveDateRange(invoice.date, startDate, endDate))
              .reduce((sum, invoice) => sum + (invoice.total || 0), 0),
            expenses: snapshot.expenses
              .filter((expense) => inInclusiveDateRange(expense.expenseDate, startDate, endDate))
              .reduce((sum, expense) => sum + (expense.amount || 0), 0),
          });
        }
        return data;
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      for (let i = months - 1; i >= 0; i--) {
        const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
        const startDate = format(startOfMonth(date), 'yyyy-MM-dd');
        const endDate = format(endOfMonth(date), 'yyyy-MM-dd');
        const monthName = format(date, 'MMM');

        // Get revenue for this month
        const { data: invoices } = await supabase
          .from('invoices')
          .select('total')
          .eq('user_id', user.id)
          .gte('date', startDate)
          .lte('date', endDate);

        // Get expenses for this month
        const { data: expenses } = await supabase
          .from('expenses')
          .select('amount')
          .eq('user_id', user.id)
          .gte('expense_date', startDate)
          .lte('expense_date', endDate);

        const revenue = invoices?.reduce((sum, invoice) => sum + (invoice.total || 0), 0) || 0;
        const expenseTotal = expenses?.reduce((sum, expense) => sum + (expense.amount || 0), 0) || 0;

        data.push({
          month: monthName,
          revenue,
          expenses: expenseTotal
        });
      }

      return data;
    } catch (error) {
      console.error('Error in getRevenueExpenseData:', error);
      return [];
    }
  }

  async getCashFlowData(days: number = 30): Promise<CashFlowData[]> {
    try {
      const data: CashFlowData[] = [];
      const currentDate = new Date();
      const weeksToShow = Math.ceil(days / 7);
      if (ledgerSnapshotEnabled()) {
        const snapshot = await loadLedgerSnapshot();
        for (let i = weeksToShow - 1; i >= 0; i--) {
          const weekStart = new Date(currentDate);
          weekStart.setDate(weekStart.getDate() - (i * 7 + 6));
          const weekEnd = new Date(currentDate);
          weekEnd.setDate(weekEnd.getDate() - (i * 7));
          const startDate = format(weekStart, 'yyyy-MM-dd');
          const endDate = format(weekEnd, 'yyyy-MM-dd');
          data.push({
            day: format(weekEnd, 'd'),
            inflow: snapshot.payments
              .filter((payment) => inInclusiveDateRange(payment.paymentDate, startDate, endDate))
              .reduce((sum, payment) => sum + (payment.amount || 0), 0),
            outflow: snapshot.expenses
              .filter((expense) => inInclusiveDateRange(expense.expenseDate, startDate, endDate))
              .reduce((sum, expense) => sum + (expense.amount || 0), 0),
          });
        }
        return data;
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      for (let i = weeksToShow - 1; i >= 0; i--) {
        const weekStart = new Date(currentDate);
        weekStart.setDate(weekStart.getDate() - (i * 7 + 6));
        const weekEnd = new Date(currentDate);
        weekEnd.setDate(weekEnd.getDate() - (i * 7));

        const startDate = format(weekStart, 'yyyy-MM-dd');
        const endDate = format(weekEnd, 'yyyy-MM-dd');

        // Get payments (cash inflow) - handle gracefully if table doesn't exist
        const { data: payments } = await supabase
          .from('payments')
          .select('amount')
          .eq('user_id', user.id)
          .gte('payment_date', startDate)
          .lte('payment_date', endDate)
          .then(result => result)
          .catch(() => ({ data: null }));

        // Get expenses (cash outflow)
        const { data: expenses } = await supabase
          .from('expenses')
          .select('amount')
          .eq('user_id', user.id)
          .gte('expense_date', startDate)
          .lte('expense_date', endDate)
          .then(result => result)
          .catch(() => ({ data: null }));

        const inflow = payments?.reduce((sum, payment) => sum + (payment.amount || 0), 0) || 0;
        const outflow = expenses?.reduce((sum, expense) => sum + (expense.amount || 0), 0) || 0;

        data.push({
          day: format(weekEnd, 'd'),
          inflow,
          outflow
        });
      }

      return data;
    } catch (error) {
      console.error('Error in getCashFlowData:', error);
      return [];
    }
  }

  async getExpenseBreakdown(period?: FinancialPeriod) {
    try {
      const startDate = period?.startDate || format(startOfMonth(new Date()), 'yyyy-MM-dd');
      const endDate = period?.endDate || format(endOfMonth(new Date()), 'yyyy-MM-dd');
      if (ledgerSnapshotEnabled()) {
        const snapshot = await loadLedgerSnapshot();
        const categoryTotals: { [key: string]: number } = {};
        let totalExpenses = 0;
        snapshot.expenses
          .filter((expense) => inInclusiveDateRange(expense.expenseDate, startDate, endDate))
          .forEach((expense) => {
            const categoryName = expense.category?.name || 'Uncategorized';
            const amount = expense.amount || 0;
            categoryTotals[categoryName] = (categoryTotals[categoryName] || 0) + amount;
            totalExpenses += amount;
          });
        return Object.entries(categoryTotals)
          .map(([category, amount]) => ({
            category,
            amount,
            percentage: totalExpenses > 0 ? Math.round((amount / totalExpenses) * 100) : 0,
          }))
          .sort((a, b) => b.amount - a.amount);
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Get expenses with categories - try category_id first, fallback to category
      let { data: expenses, error } = await supabase
        .from('expenses')
        .select(`
          amount,
          category_id,
          expense_categories (
            name
          )
        `)
        .eq('user_id', user.id)
        .gte('expense_date', startDate)
        .lte('expense_date', endDate);

      // If category_id doesn't exist, try with category field
      if (error && error.code === '42703') {
        console.log('category_id not found, trying category field...');
        const fallbackResult = await supabase
          .from('expenses')
          .select('amount, category')
          .eq('user_id', user.id)
          .gte('expense_date', startDate)
          .lte('expense_date', endDate);
        
        expenses = fallbackResult.data;
        error = fallbackResult.error;
      }

      if (error) {
        console.error('Error fetching expense breakdown:', error);
        return [];
      }

      // Group expenses by category
      const categoryTotals: { [key: string]: number } = {};
      let totalExpenses = 0;

      expenses?.forEach(expense => {
        // Handle both category_id (with join) and category (direct string) formats
        const categoryName = expense.expense_categories?.name || expense.category || 'Uncategorized';
        const amount = expense.amount || 0;
        categoryTotals[categoryName] = (categoryTotals[categoryName] || 0) + amount;
        totalExpenses += amount;
      });

      // Convert to array and calculate percentages
      return Object.entries(categoryTotals).map(([category, amount]) => ({
        category,
        amount,
        percentage: totalExpenses > 0 ? Math.round((amount / totalExpenses) * 100) : 0
      })).sort((a, b) => b.amount - a.amount);
    } catch (error) {
      console.error('Error in getExpenseBreakdown:', error);
      return [];
    }
  }

  private async calculateRealGSTLiability(startDate: string, endDate: string): Promise<number> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return 0;

      // Get GST collected from sales (invoices)
      const { data: invoices } = await supabase
        .from('invoices')
        .select('tax_amount, total_amount')
        .eq('user_id', user.id)
        .eq('status', 'paid')
        .gte('created_at', startDate)
        .lte('created_at', endDate);

      // Get GST paid on purchases (expenses)
      const { data: expenses } = await supabase
        .from('expenses')
        .select('amount')
        .eq('user_id', user.id)
        .gte('expense_date', startDate)
        .lte('expense_date', endDate);

      const gstCollected = invoices?.reduce((sum, invoice) => {
        // Use tax_amount if available, otherwise calculate 15% of total
        const gst = invoice.tax_amount || (invoice.total_amount * 0.15);
        return sum + gst;
      }, 0) || 0;

      // Assume 15% GST on expenses (simplified)
      const gstPaid = expenses?.reduce((sum, expense) => {
        const gst = (expense.amount || 0) * 0.15;
        return sum + gst;
      }, 0) || 0;

      // Net GST liability
      return Math.max(0, gstCollected - gstPaid);
    } catch (error) {
      console.error('Error calculating GST liability:', error);
      return 0;
    }
  }

  private async calculateRealPayables(): Promise<number> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return 0;

      // Get pending/unpaid expenses
      const { data: pendingExpenses } = await supabase
        .from('expenses')
        .select('amount')
        .eq('user_id', user.id)
        .eq('status', 'pending');

      return pendingExpenses?.reduce((sum, expense) => sum + (expense.amount || 0), 0) || 0;
    } catch (error) {
      console.error('Error calculating payables:', error);
      return 0;
    }
  }
}

export const accountingService = new AccountingService();