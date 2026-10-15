import { supabase } from '@/integrations/supabase/client';
import { startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, subMonths, subQuarters, subYears, format } from 'date-fns';
import { inInclusiveDateRange, ledgerSnapshotEnabled, loadLedgerSnapshot } from '@/features/ledger/api/ledgerSnapshot';

export interface FinancialReport {
  id: string;
  name: string;
  type: 'profit_loss' | 'balance_sheet' | 'cash_flow' | 'trial_balance' | 'accounts_receivable' | 'accounts_payable';
  period: {
    startDate: string;
    endDate: string;
  };
  data: any;
  generatedAt: string;
}

export interface ReportSummary {
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
  grossMargin: number;
  totalAssets: number;
  totalLiabilities: number;
  cashFlow: number;
  periodsCompared: number;
}

export interface ProfitLossData {
  totalRevenue: number;
  costOfGoodsSold: number;
  grossProfit: number;
  operatingExpenses: number;
  netIncome: number;
  revenueBreakdown: Array<{
    category: string;
    amount: number;
    percentage: number;
  }>;
  expenseBreakdown: Array<{
    category: string;
    amount: number;
    percentage: number;
  }>;
}

export interface BalanceSheetData {
  totalAssets: number;
  currentAssets: number;
  fixedAssets: number;
  totalLiabilities: number;
  currentLiabilities: number;
  longTermLiabilities: number;
  equity: number;
  assetBreakdown: Array<{
    category: string;
    amount: number;
    percentage: number;
  }>;
  liabilityBreakdown: Array<{
    category: string;
    amount: number;
    percentage: number;
  }>;
}

export interface CashFlowData {
  operatingCashFlow: number;
  investingCashFlow: number;
  financingCashFlow: number;
  netCashFlow: number;
  beginningCash: number;
  endingCash: number;
  operatingActivities: Array<{
    description: string;
    amount: number;
  }>;
  investingActivities: Array<{
    description: string;
    amount: number;
  }>;
  financingActivities: Array<{
    description: string;
    amount: number;
  }>;
}

export interface TrialBalanceData {
  totalDebits: number;
  totalCredits: number;
  accountCount: number;
  balanceStatus: 'balanced' | 'unbalanced';
  accounts: Array<{
    accountName: string;
    accountType: string;
    debitBalance: number;
    creditBalance: number;
  }>;
}

export class FinancialReportsService {
  private static instance: FinancialReportsService;
  
  static getInstance(): FinancialReportsService {
    if (!FinancialReportsService.instance) {
      FinancialReportsService.instance = new FinancialReportsService();
    }
    return FinancialReportsService.instance;
  }

  private getPeriodDates(period: string, customStartDate?: Date, customEndDate?: Date): { startDate: Date, endDate: Date } {
    const now = new Date();
    
    switch (period) {
      case 'current_month':
        return { startDate: startOfMonth(now), endDate: endOfMonth(now) };
      case 'last_month':
        return { startDate: startOfMonth(subMonths(now, 1)), endDate: endOfMonth(subMonths(now, 1)) };
      case 'current_quarter':
        return { startDate: startOfQuarter(now), endDate: endOfQuarter(now) };
      case 'last_quarter':
        return { startDate: startOfQuarter(subQuarters(now, 1)), endDate: endOfQuarter(subQuarters(now, 1)) };
      case 'current_year':
        return { startDate: startOfYear(now), endDate: endOfYear(now) };
      case 'last_year':
        return { startDate: startOfYear(subYears(now, 1)), endDate: endOfYear(subYears(now, 1)) };
      case 'custom':
        return { 
          startDate: customStartDate || startOfMonth(now), 
          endDate: customEndDate || endOfMonth(now) 
        };
      default:
        return { startDate: startOfMonth(now), endDate: endOfMonth(now) };
    }
  }

  private async loadSnapshotRows(startDate: Date, endDate: Date) {
    const snapshot = await loadLedgerSnapshot();
    return {
      invoices: snapshot.invoices.filter((invoice) => inInclusiveDateRange(invoice.date, startDate, endDate)),
      expenses: snapshot.expenses.filter((expense) => inInclusiveDateRange(expense.expenseDate, startDate, endDate)),
      accounts: snapshot.accounts,
      unpaidInvoices: snapshot.invoices.filter(
        (invoice) => invoice.status === 'sent' && inInclusiveDateRange(invoice.date, new Date('1970-01-01'), endDate),
      ),
      unpaidExpenses: snapshot.expenses.filter(
        (expense) => expense.status === 'pending' && inInclusiveDateRange(expense.expenseDate, new Date('1970-01-01'), endDate),
      ),
      paidInvoices: snapshot.invoices.filter(
        (invoice) => invoice.status === 'paid' && inInclusiveDateRange(invoice.date, startDate, endDate),
      ),
    };
  }

  async generateProfitLossReport(period: string, customStartDate?: Date, customEndDate?: Date): Promise<ProfitLossData> {
    try {
      const { startDate, endDate } = this.getPeriodDates(period, customStartDate, customEndDate);
      const start = startDate.toISOString().split('T')[0];
      const end = endDate.toISOString().split('T')[0];

      let invoices: Array<{ total: number; tax_amount?: number; status?: string }> | null;
      let expenses: Array<{ amount: number; tax_amount?: number; expense_categories?: { name?: string } | null }> | null;

      if (ledgerSnapshotEnabled()) {
        const snapshot = await loadLedgerSnapshot();
        invoices = snapshot.invoices
          .filter((invoice) => invoice.status === 'paid' && inInclusiveDateRange(invoice.date, start, end))
          .map((invoice) => ({ total: invoice.total, tax_amount: invoice.taxAmount, status: invoice.status }));
        expenses = snapshot.expenses
          .filter((expense) => inInclusiveDateRange(expense.expenseDate, start, end))
          .map((expense) => ({
            amount: expense.amount,
            tax_amount: expense.taxAmount,
            expense_categories: { name: expense.category?.name },
          }));
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.id) throw new Error('User not authenticated');

        const { data: invoiceRows, error: invoiceError } = await supabase
          .from('invoices')
          .select('total, tax_amount, created_at, status')
          .eq('user_id', user.id)
          .gte('date', start)
          .lte('date', end)
          .eq('status', 'paid');
        if (invoiceError) throw invoiceError;

        const { data: expenseRows, error: expenseError } = await supabase
          .from('expenses')
          .select(`
            amount, 
            tax_amount,
            expense_date,
            category_id,
            expense_categories (
              name
            )
          `)
          .eq('user_id', user.id)
          .gte('expense_date', start)
          .lte('expense_date', end);
        if (expenseError) throw expenseError;
        invoices = invoiceRows;
        expenses = expenseRows;
      }

      // Calculate totals
      const totalRevenue = invoices?.reduce((sum, invoice) => sum + (invoice.total || 0), 0) || 0;
      const totalExpenses = expenses?.reduce((sum, expense) => sum + (expense.amount || 0), 0) || 0;
      
      // Calculate cost of goods sold (from specific expense categories)
      const costOfGoodsSold = expenses?.filter(exp => {
        const categoryName = exp.expense_categories?.name?.toLowerCase() || '';
        return ['inventory', 'materials', 'direct labor', 'manufacturing', 'cost of goods sold', 'cogs'].includes(categoryName);
      }).reduce((sum, exp) => sum + (exp.amount || 0), 0) || 0;

      const grossProfit = totalRevenue - costOfGoodsSold;
      const operatingExpenses = totalExpenses - costOfGoodsSold;
      const netIncome = totalRevenue - totalExpenses;

      // Revenue breakdown - for simplicity, assume all revenue is in "Sales" category
      // In a real app, you'd have invoice line items with categories
      const revenueBreakdown = totalRevenue > 0 ? [
        {
          category: 'Sales Revenue',
          amount: totalRevenue,
          percentage: 100
        }
      ] : [];

      // Expense breakdown by category
      const expenseCategories = new Map<string, number>();
      expenses?.forEach(expense => {
        const category = expense.expense_categories?.name || 'Uncategorized';
        expenseCategories.set(category, (expenseCategories.get(category) || 0) + (expense.amount || 0));
      });

      const expenseBreakdown = Array.from(expenseCategories.entries()).map(([category, amount]) => ({
        category,
        amount,
        percentage: totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0
      }));

      return {
        totalRevenue,
        costOfGoodsSold,
        grossProfit,
        operatingExpenses,
        netIncome,
        revenueBreakdown,
        expenseBreakdown
      };
    } catch (error) {
      console.error('Error generating profit & loss report:', error);
      throw error;
    }
  }

  async generateBalanceSheetReport(asOfDate: Date): Promise<BalanceSheetData> {
    try {
      const asOf = asOfDate.toISOString().split('T')[0];
      let accounts: Array<{ current_balance: number; name: string; type: string }> | null;
      let unpaidInvoices: Array<{ total: number }> | null;
      let unpaidExpenses: Array<{ amount: number }> | null;

      if (ledgerSnapshotEnabled()) {
        const snapshot = await loadLedgerSnapshot();
        accounts = snapshot.accounts.map((account) => ({
          current_balance: account.currentBalance,
          name: account.name,
          type: account.type,
        }));
        unpaidInvoices = snapshot.invoices
          .filter((invoice) => invoice.status === 'sent' && invoice.date <= asOf)
          .map((invoice) => ({ total: invoice.total }));
        unpaidExpenses = snapshot.expenses
          .filter((expense) => expense.status === 'pending' && expense.expenseDate <= asOf)
          .map((expense) => ({ amount: expense.amount }));
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.id) throw new Error('User not authenticated');

        const { data: accountRows, error: accountError } = await supabase
          .from('accounts')
          .select('current_balance, name, type')
          .eq('user_id', user.id);
        if (accountError) throw accountError;

        const { data: invoiceRows, error: invoiceError } = await supabase
          .from('invoices')
          .select('total, due_date')
          .eq('user_id', user.id)
          .eq('status', 'sent')
          .lte('date', asOf);
        if (invoiceError) throw invoiceError;

        const { data: expenseRows, error: expenseError } = await supabase
          .from('expenses')
          .select('amount')
          .eq('user_id', user.id)
          .eq('status', 'pending')
          .lte('expense_date', asOf);
        if (expenseError) throw expenseError;
        accounts = accountRows;
        unpaidInvoices = invoiceRows;
        unpaidExpenses = expenseRows;
      }

      // Calculate assets
      const cashAccounts = accounts?.filter(acc => acc.type === 'cash' || acc.type === 'bank') || [];
      const cashAndBankBalance = cashAccounts.reduce((sum, account) => sum + (account.current_balance || 0), 0);
      const accountsReceivable = unpaidInvoices?.reduce((sum, invoice) => sum + (invoice.total || 0), 0) || 0;
      
      // Get other asset accounts
      const assetAccounts = accounts?.filter(acc => acc.type === 'asset') || [];
      const otherAssets = assetAccounts.reduce((sum, account) => sum + (account.current_balance || 0), 0);
      
      const currentAssets = cashAndBankBalance + accountsReceivable;
      const fixedAssets = otherAssets; // Use real asset data
      const totalAssets = currentAssets + fixedAssets;

      // Calculate liabilities
      const accountsPayable = unpaidExpenses?.reduce((sum, expense) => sum + (expense.amount || 0), 0) || 0;
      
      // Get liability accounts
      const liabilityAccounts = accounts?.filter(acc => acc.type === 'liability') || [];
      const otherLiabilities = liabilityAccounts.reduce((sum, account) => sum + Math.abs(account.current_balance || 0), 0);
      
      const currentLiabilities = accountsPayable;
      const longTermLiabilities = otherLiabilities;
      const totalLiabilities = currentLiabilities + longTermLiabilities;

      // Calculate equity
      const equity = totalAssets - totalLiabilities;

      // Asset breakdown
      const assetBreakdown = [
        { category: 'Cash & Bank', amount: cashAndBankBalance, percentage: totalAssets > 0 ? (cashAndBankBalance / totalAssets) * 100 : 0 },
        { category: 'Accounts Receivable', amount: accountsReceivable, percentage: totalAssets > 0 ? (accountsReceivable / totalAssets) * 100 : 0 },
        { category: 'Fixed Assets', amount: fixedAssets, percentage: totalAssets > 0 ? (fixedAssets / totalAssets) * 100 : 0 }
      ];

      // Liability breakdown
      const liabilityBreakdown = [
        { category: 'Accounts Payable', amount: accountsPayable, percentage: totalLiabilities > 0 ? (accountsPayable / totalLiabilities) * 100 : 0 },
        { category: 'Long-term Liabilities', amount: longTermLiabilities, percentage: totalLiabilities > 0 ? (longTermLiabilities / totalLiabilities) * 100 : 0 }
      ];

      return {
        totalAssets,
        currentAssets,
        fixedAssets,
        totalLiabilities,
        currentLiabilities,
        longTermLiabilities,
        equity,
        assetBreakdown,
        liabilityBreakdown
      };
    } catch (error) {
      console.error('Error generating balance sheet report:', error);
      throw error;
    }
  }

  async generateCashFlowReport(period: string, customStartDate?: Date, customEndDate?: Date): Promise<CashFlowData> {
    try {
      const { startDate, endDate } = this.getPeriodDates(period, customStartDate, customEndDate);
      const start = startDate.toISOString().split('T')[0];
      const end = endDate.toISOString().split('T')[0];
      let invoicePayments: Array<{ total: number }> | null;
      let expensePayments: Array<{ amount: number; expense_categories?: { name?: string } | null }> | null;
      let cashAccounts: Array<{ current_balance: number }> | null;

      if (ledgerSnapshotEnabled()) {
        const snapshot = await loadLedgerSnapshot();
        invoicePayments = snapshot.invoices
          .filter((invoice) => invoice.status === 'paid' && inInclusiveDateRange(invoice.date, start, end))
          .map((invoice) => ({ total: invoice.total }));
        expensePayments = snapshot.expenses
          .filter((expense) => inInclusiveDateRange(expense.expenseDate, start, end))
          .map((expense) => ({ amount: expense.amount, expense_categories: { name: expense.category?.name } }));
        cashAccounts = snapshot.accounts
          .filter((account) => account.type === 'cash' || account.type === 'bank')
          .map((account) => ({ current_balance: account.currentBalance }));
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.id) throw new Error('User not authenticated');

        const { data: invoiceRows, error: invoiceError } = await supabase
          .from('invoices')
          .select('total, date')
          .eq('user_id', user.id)
          .eq('status', 'paid')
          .gte('date', start)
          .lte('date', end);
        if (invoiceError) throw invoiceError;

        const { data: expenseRows, error: expenseError } = await supabase
          .from('expenses')
          .select(`
            amount, 
            expense_date,
            expense_categories (
              name
            )
          `)
          .eq('user_id', user.id)
          .gte('expense_date', start)
          .lte('expense_date', end);
        if (expenseError) throw expenseError;

        const { data: accountRows, error: accountError } = await supabase
          .from('accounts')
          .select('current_balance')
          .eq('user_id', user.id)
          .in('type', ['cash', 'bank']);
        if (accountError) throw accountError;
        invoicePayments = invoiceRows;
        expensePayments = expenseRows;
        cashAccounts = accountRows;
      }

      // Calculate operating cash flow
      const cashFromSales = invoicePayments?.reduce((sum, invoice) => sum + (invoice.total || 0), 0) || 0;
      const operatingExpenses = expensePayments?.filter(exp => {
        const categoryName = exp.expense_categories?.name?.toLowerCase() || '';
        return !['equipment', 'investment', 'loan', 'capital expenditure', 'fixed assets'].includes(categoryName);
      }).reduce((sum, exp) => sum + (exp.amount || 0), 0) || 0;
      
      const operatingCashFlow = cashFromSales - operatingExpenses;

      // Calculate investing cash flow (equipment, investments)
      const investingCashFlow = -(expensePayments?.filter(exp => {
        const categoryName = exp.expense_categories?.name?.toLowerCase() || '';
        return ['equipment', 'investment', 'capital expenditure', 'fixed assets'].includes(categoryName);
      }).reduce((sum, exp) => sum + (exp.amount || 0), 0) || 0);

      // Calculate financing cash flow (loans, financing)
      const financingCashFlow = -(expensePayments?.filter(exp => {
        const categoryName = exp.expense_categories?.name?.toLowerCase() || '';
        return ['loan', 'financing', 'debt payment', 'interest'].includes(categoryName);
      }).reduce((sum, exp) => sum + (exp.amount || 0), 0) || 0);

      const netCashFlow = operatingCashFlow + investingCashFlow + financingCashFlow;

      const beginningCash = cashAccounts?.reduce((sum, account) => sum + (account.current_balance || 0), 0) || 0;
      const endingCash = beginningCash + netCashFlow;

      // Operating activities breakdown
      const operatingActivities = [
        { description: 'Cash from sales', amount: cashFromSales },
        { description: 'Operating expenses', amount: -operatingExpenses }
      ];

      // Investing activities breakdown
      const investingActivities = [
        { description: 'Equipment purchases', amount: investingCashFlow }
      ];

      // Financing activities breakdown
      const financingActivities = [
        { description: 'Loan payments', amount: financingCashFlow }
      ];

      return {
        operatingCashFlow,
        investingCashFlow,
        financingCashFlow,
        netCashFlow,
        beginningCash,
        endingCash,
        operatingActivities,
        investingActivities,
        financingActivities
      };
    } catch (error) {
      console.error('Error generating cash flow report:', error);
      throw error;
    }
  }

  async generateTrialBalanceReport(asOfDate: Date): Promise<TrialBalanceData> {
    try {
      const asOf = asOfDate.toISOString().split('T')[0];
      let accounts: Array<{ name: string; current_balance: number; type: string }> | null = null;
      let invoices: Array<{ total: number; status?: string }> | null = null;
      let expenses: Array<{ amount: number; expense_categories?: { name?: string } | null }> | null = null;

      if (ledgerSnapshotEnabled()) {
        const snapshot = await loadLedgerSnapshot();
        accounts = snapshot.accounts.map((account) => ({
          name: account.name,
          current_balance: account.currentBalance,
          type: account.type,
        }));
        invoices = snapshot.invoices
          .filter((invoice) => invoice.status === 'paid' && inInclusiveDateRange(invoice.date, new Date('1970-01-01'), asOfDate))
          .map((invoice) => ({ total: invoice.total, status: invoice.status }));
        expenses = snapshot.expenses
          .filter((expense) => inInclusiveDateRange(expense.expenseDate, new Date('1970-01-01'), asOfDate))
          .map((expense) => ({
            amount: expense.amount,
            expense_categories: { name: expense.category?.name },
          }));
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.id) throw new Error('User not authenticated');

        const { data: accountRows, error: accountError } = await supabase
          .from('accounts')
          .select('name, current_balance, type')
          .eq('user_id', user.id);
        if (accountError) throw accountError;
        accounts = accountRows;

        const { data: invoiceRows, error: invoiceError } = await supabase
          .from('invoices')
          .select('total, status')
          .eq('user_id', user.id)
          .lte('date', asOf)
          .eq('status', 'paid');
        if (invoiceError) throw invoiceError;
        invoices = invoiceRows;

        const { data: expenseRows, error: expenseError } = await supabase
          .from('expenses')
          .select(`
          amount,
          expense_categories (
            name
          )
        `)
          .eq('user_id', user.id)
          .lte('expense_date', asOf);
        if (expenseError) throw expenseError;
        expenses = expenseRows as typeof expenses;
      }

      // Build trial balance accounts
      const trialBalanceAccounts: Array<{
        accountName: string;
        accountType: string;
        debitBalance: number;
        creditBalance: number;
      }> = [];

      // Add all accounts from the accounts table
      accounts?.forEach(account => {
        const balance = account.current_balance || 0;
        let accountType = 'Asset';
        let debitBalance = 0;
        let creditBalance = 0;

        // Determine account type and balance side based on account type
        switch (account.type?.toLowerCase()) {
          case 'asset':
          case 'cash':
          case 'bank':
            accountType = 'Asset';
            debitBalance = balance > 0 ? balance : 0;
            creditBalance = balance < 0 ? Math.abs(balance) : 0;
            break;
          case 'liability':
            accountType = 'Liability';
            debitBalance = balance < 0 ? Math.abs(balance) : 0;
            creditBalance = balance > 0 ? balance : 0;
            break;
          case 'equity':
            accountType = 'Equity';
            debitBalance = balance < 0 ? Math.abs(balance) : 0;
            creditBalance = balance > 0 ? balance : 0;
            break;
          default:
            accountType = 'Asset';
            debitBalance = balance > 0 ? balance : 0;
            creditBalance = balance < 0 ? Math.abs(balance) : 0;
        }

        trialBalanceAccounts.push({
          accountName: account.name || 'Unnamed Account',
          accountType,
          debitBalance,
          creditBalance
        });
      });

      // Add revenue account
      const totalRevenue = invoices?.reduce((sum, invoice) => sum + (invoice.total || 0), 0) || 0;
      if (totalRevenue > 0) {
        trialBalanceAccounts.push({
          accountName: 'Sales Revenue',
          accountType: 'Revenue',
          debitBalance: 0,
          creditBalance: totalRevenue
        });
      }

      // Add expense accounts by category
      const expenseCategories = new Map<string, number>();
      expenses?.forEach(expense => {
        const category = expense.expense_categories?.name || 'General Expense';
        expenseCategories.set(category, (expenseCategories.get(category) || 0) + (expense.amount || 0));
      });

      expenseCategories.forEach((amount, category) => {
        trialBalanceAccounts.push({
          accountName: category,
          accountType: 'Expense',
          debitBalance: amount,
          creditBalance: 0
        });
      });

      // Calculate totals
      const totalDebits = trialBalanceAccounts.reduce((sum, account) => sum + account.debitBalance, 0);
      const totalCredits = trialBalanceAccounts.reduce((sum, account) => sum + account.creditBalance, 0);
      
      const balanceStatus = Math.abs(totalDebits - totalCredits) < 0.01 ? 'balanced' : 'unbalanced';

      return {
        totalDebits,
        totalCredits,
        accountCount: trialBalanceAccounts.length,
        balanceStatus,
        accounts: trialBalanceAccounts
      };
    } catch (error) {
      console.error('Error generating trial balance report:', error);
      throw error;
    }
  }

  async generateReportSummary(period: string, customStartDate?: Date, customEndDate?: Date): Promise<ReportSummary> {
    try {
      const profitLoss = await this.generateProfitLossReport(period, customStartDate, customEndDate);
      const balanceSheet = await this.generateBalanceSheetReport(new Date());
      const cashFlow = await this.generateCashFlowReport(period, customStartDate, customEndDate);

      return {
        totalRevenue: profitLoss.totalRevenue,
        totalExpenses: profitLoss.operatingExpenses + profitLoss.costOfGoodsSold,
        netIncome: profitLoss.netIncome,
        grossMargin: profitLoss.totalRevenue > 0 ? (profitLoss.grossProfit / profitLoss.totalRevenue) * 100 : 0,
        totalAssets: balanceSheet.totalAssets,
        totalLiabilities: balanceSheet.totalLiabilities,
        cashFlow: cashFlow.netCashFlow,
        periodsCompared: 1
      };
    } catch (error) {
      console.error('Error generating report summary:', error);
      throw error;
    }
  }

  async generateReport(
    type: 'profit_loss' | 'balance_sheet' | 'cash_flow' | 'trial_balance',
    period: string,
    customStartDate?: Date,
    customEndDate?: Date
  ): Promise<FinancialReport> {
    try {
      const { startDate, endDate } = this.getPeriodDates(period, customStartDate, customEndDate);
      let data: any;
      let name: string;

      switch (type) {
        case 'profit_loss':
          data = await this.generateProfitLossReport(period, customStartDate, customEndDate);
          name = `${format(startDate, 'MMMM yyyy')} Profit & Loss`;
          break;
        case 'balance_sheet':
          data = await this.generateBalanceSheetReport(endDate);
          name = `${format(endDate, 'MMMM yyyy')} Balance Sheet`;
          break;
        case 'cash_flow':
          data = await this.generateCashFlowReport(period, customStartDate, customEndDate);
          name = `${format(startDate, 'MMMM yyyy')} Cash Flow Statement`;
          break;
        case 'trial_balance':
          data = await this.generateTrialBalanceReport(endDate);
          name = `${format(endDate, 'MMMM yyyy')} Trial Balance`;
          break;
        default:
          throw new Error(`Unsupported report type: ${type}`);
      }

      return {
        id: `report-${Date.now()}`,
        name,
        type,
        period: {
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0]
        },
        data,
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error generating financial report:', error);
      throw error;
    }
  }
}

export const financialReportsService = FinancialReportsService.getInstance();