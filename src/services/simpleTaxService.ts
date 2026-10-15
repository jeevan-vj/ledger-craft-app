import { supabase } from '@/integrations/supabase/client';
import { inInclusiveDateRange, ledgerSnapshotEnabled, loadLedgerSnapshot } from '@/features/ledger/api/ledgerSnapshot';

interface SimpleTaxData {
  currentGSTPosition: number;
  nextPaymentDue: {
    date: string;
    amount: number;
    type: 'GST';
  } | null;
  complianceScore: number;
  quarterlyTrend: {
    current: number;
    previous: number;
    change: number;
  };
  recentActivity: Array<{
    id: string;
    type: 'invoice' | 'expense' | 'payment';
    description: string;
    amount: number;
    date: string;
  }>;
}

export class SimpleTaxService {
  private readonly GST_RATE = 0.15; // 15% GST for NZ

  async getTaxOverview(userId: string): Promise<SimpleTaxData> {
    try {
      // Get current quarter dates
      const now = new Date();
      const currentQuarter = Math.floor(now.getMonth() / 3);
      const quarterStart = new Date(now.getFullYear(), currentQuarter * 3, 1);
      const quarterEnd = new Date(now.getFullYear(), (currentQuarter + 1) * 3, 0);
      
      // Get previous quarter for trend calculation
      const prevQuarterStart = new Date(quarterStart);
      prevQuarterStart.setMonth(prevQuarterStart.getMonth() - 3);
      const prevQuarterEnd = new Date(quarterEnd);
      prevQuarterEnd.setMonth(prevQuarterEnd.getMonth() - 3);

      // Fetch data from existing tables (invoices for now, expenses if they exist)
      const [invoicesResult, expensesResult] = await Promise.allSettled([
        this.getInvoiceData(userId, quarterStart, quarterEnd),
        this.getExpenseData(userId, quarterStart, quarterEnd)
      ]);

      const [prevInvoicesResult, prevExpensesResult] = await Promise.allSettled([
        this.getInvoiceData(userId, prevQuarterStart, prevQuarterEnd),
        this.getExpenseData(userId, prevQuarterStart, prevQuarterEnd)
      ]);

      // Calculate current quarter GST
      const currentInvoices = invoicesResult.status === 'fulfilled' ? invoicesResult.value : [];
      const currentExpenses = expensesResult.status === 'fulfilled' ? expensesResult.value : [];
      
      const currentGSTCharged = currentInvoices.reduce((sum, inv) => {
        const gstAmount = inv.total * this.GST_RATE / (1 + this.GST_RATE);
        return sum + gstAmount;
      }, 0);

      const currentGSTClaimable = currentExpenses.reduce((sum, exp) => {
        const gstAmount = exp.amount * this.GST_RATE / (1 + this.GST_RATE);
        return sum + gstAmount;
      }, 0);

      const currentGSTPosition = currentGSTCharged - currentGSTClaimable;

      // Calculate previous quarter GST for trend
      const prevInvoices = prevInvoicesResult.status === 'fulfilled' ? prevInvoicesResult.value : [];
      const prevExpenses = prevExpensesResult.status === 'fulfilled' ? prevExpensesResult.value : [];
      
      const prevGSTCharged = prevInvoices.reduce((sum, inv) => {
        const gstAmount = inv.total * this.GST_RATE / (1 + this.GST_RATE);
        return sum + gstAmount;
      }, 0);

      const prevGSTClaimable = prevExpenses.reduce((sum, exp) => {
        const gstAmount = exp.amount * this.GST_RATE / (1 + this.GST_RATE);
        return sum + gstAmount;
      }, 0);

      const prevGSTPosition = prevGSTCharged - prevGSTClaimable;

      // Calculate next payment due date (28th of month following quarter end)
      const nextDueDate = new Date(quarterEnd);
      nextDueDate.setMonth(nextDueDate.getMonth() + 1);
      nextDueDate.setDate(28);

      // Create recent activity from invoices and expenses
      const recentActivity = [
        ...currentInvoices.slice(0, 3).map(inv => ({
          id: inv.id,
          type: 'invoice' as const,
          description: `Invoice #${inv.invoice_number || inv.id.slice(0, 8)}`,
          amount: inv.total * this.GST_RATE / (1 + this.GST_RATE),
          date: inv.date
        })),
        ...currentExpenses.slice(0, 3).map(exp => ({
          id: exp.id,
          type: 'expense' as const,
          description: exp.description || 'Expense',
          amount: exp.amount * this.GST_RATE / (1 + this.GST_RATE),
          date: exp.date
        }))
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5);

      // Simple compliance score based on data availability
      const complianceScore = this.calculateComplianceScore(currentInvoices.length, currentExpenses.length);

      return {
        currentGSTPosition,
        nextPaymentDue: currentGSTPosition > 0 ? {
          date: nextDueDate.toISOString().split('T')[0],
          amount: currentGSTPosition,
          type: 'GST'
        } : null,
        complianceScore,
        quarterlyTrend: {
          current: currentGSTPosition,
          previous: prevGSTPosition,
          change: currentGSTPosition - prevGSTPosition
        },
        recentActivity
      };

    } catch (error) {
      console.error('Error in getTaxOverview:', error);
      throw new Error('Failed to load tax overview data');
    }
  }

  private async getInvoiceData(userId: string, startDate: Date, endDate: Date) {
    if (ledgerSnapshotEnabled()) {
      return (await loadLedgerSnapshot()).invoices
        .filter((invoice) => inInclusiveDateRange(invoice.date, startDate, endDate))
        .map((invoice) => ({
          id: invoice.id,
          invoice_number: invoice.invoiceNumber,
          total: invoice.total,
          date: invoice.date,
        }));
    }
    const { data, error } = await supabase
      .from('invoices')
      .select('id, invoice_number, total, date')
      .eq('user_id', userId)
      .gte('date', startDate.toISOString().split('T')[0])
      .lte('date', endDate.toISOString().split('T')[0])
      .order('date', { ascending: false });

    if (error) {
      console.warn('Could not fetch invoices:', error);
      return [];
    }

    return data || [];
  }

  private async getExpenseData(userId: string, startDate: Date, endDate: Date) {
    if (ledgerSnapshotEnabled()) {
      return (await loadLedgerSnapshot()).expenses
        .filter((expense) => inInclusiveDateRange(expense.expenseDate, startDate, endDate))
        .map((expense) => ({
          id: expense.id,
          description: expense.description,
          amount: expense.amount,
          date: expense.expenseDate,
        }));
    }
    // Try to get expenses from expenses table first, fallback to other approaches
    try {
      const { data, error } = await supabase
        .from('expenses')
        .select('id, description, amount, date')
        .eq('user_id', userId)
        .gte('date', startDate.toISOString().split('T')[0])
        .lte('date', endDate.toISOString().split('T')[0])
        .order('date', { ascending: false });

      if (error) {
        console.warn('Expenses table not available:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.warn('Could not fetch expenses:', error);
      return [];
    }
  }

  private calculateComplianceScore(invoiceCount: number, expenseCount: number): number {
    // Simple scoring based on data availability
    let score = 60; // Base score

    if (invoiceCount > 0) score += 20;
    if (expenseCount > 0) score += 20;
    if (invoiceCount > 5) score += 5;
    if (expenseCount > 5) score += 5;

    return Math.min(score, 100);
  }
}

export const simpleTaxService = new SimpleTaxService();