import {
  TaxReturn,
  IRDReturnData,
  TaxConfiguration,
  EnhancedInvoice,
  Payment,
  FinancialSummary
} from '@/types/payment';
import { supabaseDataService } from './supabaseDataService';
import { taxCalculationService } from './taxCalculationService';
import { readString } from '@/features/tax/api/periodRows';
const expenseCategory = (expense: import('@/features/tax/api/periodRows').PeriodExpense) => readString(expense, 'category_id', 'category') || expense.category?.name || '';

export class IRDReportingService {
  /**
   * Generate GST return for a specific period
   */
  async generateGSTReturn(
    userId: string,
    periodStart: string,
    periodEnd: string
  ): Promise<TaxReturn> {
    // Validate period
    this.validatePeriod(periodStart, periodEnd);

    // Get user's tax configuration
    const taxConfig = await taxCalculationService.getActiveTaxConfiguration(userId);
    if (!taxConfig || taxConfig.taxType !== 'GST') {
      throw new Error('GST configuration not found for user');
    }

    // Fetch all relevant data for the period
    const periodData = await this.fetchPeriodData(userId, periodStart, periodEnd);

    // Calculate GST return data
    const returnData = await this.calculateGSTReturnData(periodData, taxConfig);

    // Create tax return record
    const taxReturn: Omit<TaxReturn, 'id' | 'createdAt' | 'updatedAt'> = {
      userId,
      periodStart,
      periodEnd,
      returnType: 'GST',
      totalSales: returnData.gstReturn!.salesDetails.totalSales,
      totalPurchases: returnData.gstReturn!.purchaseDetails.totalPurchases,
      gstOnSales: returnData.gstReturn!.salesDetails.gstOnSales,
      gstOnPurchases: returnData.gstReturn!.purchaseDetails.gstOnPurchases,
      netGst: returnData.gstReturn!.salesDetails.gstOnSales - returnData.gstReturn!.purchaseDetails.gstOnPurchases,
      status: 'draft',
      returnData
    };

    return await supabaseDataService.createTaxReturn(taxReturn);
  }

  /**
   * Calculate comprehensive GST return data
   */
  private async calculateGSTReturnData(
    periodData: PeriodData,
    taxConfig: TaxConfiguration
  ): Promise<IRDReturnData> {
    // Process sales data
    const salesData = periodData.invoices.map(invoice => ({
      amount: invoice.total,
      taxInclusive: invoice.taxInclusive || true,
      taxable: invoice.total > 0
    }));

    const salesCalculation = await taxCalculationService.calculateGSTReturnSales(
      salesData,
      taxConfig
    );

    // Process purchase data (from expenses)
    const purchaseData = periodData.expenses.map(expense => ({
      amount: expense.amount,
      taxInclusive: true, // Assuming expenses are typically tax-inclusive
      taxable: expenseCategory(expense) !== 'GST_EXEMPT'
    }));

    const purchaseCalculation = await taxCalculationService.calculateGSTReturnPurchases(
      purchaseData,
      taxConfig
    );

    // Calculate adjustments
    const adjustments = this.calculateAdjustments(periodData);

    return {
      gstReturn: {
        salesDetails: {
          standardRated: salesCalculation.standardRated,
          zeroRated: salesCalculation.zeroRated,
          exempt: this.calculateExemptSales(periodData.invoices),
          totalSales: salesCalculation.totalSales,
          gstOnSales: salesCalculation.gstOnSales
        },
        purchaseDetails: {
          standardRated: purchaseCalculation.standardRated,
          capitalGoods: this.calculateCapitalGoods(periodData.expenses),
          totalPurchases: purchaseCalculation.totalPurchases,
          gstOnPurchases: purchaseCalculation.gstOnPurchases
        },
        adjustments: {
          badDebts: adjustments.badDebts,
          otherAdjustments: adjustments.otherAdjustments
        }
      }
    };
  }

  /**
   * Fetch all relevant data for the reporting period using real Supabase data
   */
  private async fetchPeriodData(
    userId: string,
    periodStart: string,
    periodEnd: string
  ): Promise<PeriodData> {
    try {
      // Fetch invoices for the period from Supabase
      const invoices = await supabaseDataService.getInvoicesByPeriod(
        userId,
        periodStart,
        periodEnd
      );

      // Fetch payments for the period from Supabase
      const payments = await supabaseDataService.getPaymentsByPeriod(
        userId,
        periodStart,
        periodEnd
      );

      // Fetch expenses for the period from Supabase
      const expenses = await supabaseDataService.getExpensesByPeriod(
        userId,
        periodStart,
        periodEnd
      );

      return {
        invoices,
        payments,
        expenses
      };
    } catch (error) {
      console.error('Error fetching period data:', error);
      throw new Error(`Failed to fetch data for period ${periodStart} to ${periodEnd}`);
    }
  }

  /**
   * Calculate exempt sales amount
   */
  private calculateExemptSales(invoices: EnhancedInvoice[]): number {
    // In NZ, exempt sales are rare for small businesses
    // Most sales are either standard-rated or zero-rated
    return 0;
  }

  /**
   * Calculate capital goods purchases
   */
  private calculateCapitalGoods(expenses: import('@/features/tax/api/periodRows').PeriodExpense[]): number {
    // Capital goods are typically equipment, vehicles, etc.
    // Filter expenses by category
    return expenses
      .filter(expense =>
        expenseCategory(expense) === 'EQUIPMENT' ||
        expenseCategory(expense) === 'VEHICLES' ||
        expenseCategory(expense) === 'CAPITAL_GOODS'
      )
      .reduce((sum, expense) => sum + expense.amount, 0);
  }

  /**
   * Calculate adjustments for GST return
   */
  private calculateAdjustments(periodData: PeriodData): {
    badDebts: number;
    otherAdjustments: number;
  } {
    // Bad debts: invoices written off as uncollectable
    const badDebts = periodData.invoices
      .filter(invoice => String(invoice.status) === 'written_off')
      .reduce((sum, invoice) => sum + (invoice.taxBreakdown?.taxAmount || 0), 0);

    // Other adjustments would be manual entries
    const otherAdjustments = 0;

    return {
      badDebts: Math.round(badDebts * 100) / 100,
      otherAdjustments
    };
  }

  /**
   * Generate Income Tax return (provisional tax calculations)
   */
  async generateIncomeReturn(
    userId: string,
    periodStart: string,
    periodEnd: string
  ): Promise<TaxReturn> {
    this.validatePeriod(periodStart, periodEnd);

    const periodData = await this.fetchPeriodData(userId, periodStart, periodEnd);

    // Calculate income tax data
    const grossIncome = periodData.invoices
      .reduce((sum, invoice) => sum + invoice.total, 0);

    const allowableDeductions = periodData.expenses
      .filter(expense => expenseCategory(expense) !== 'NON_DEDUCTIBLE')
      .reduce((sum, expense) => sum + expense.amount, 0);

    const taxableIncome = Math.max(0, grossIncome - allowableDeductions);

    // Simplified NZ tax calculation (would need more complex brackets)
    const taxDue = this.calculateIncomeTax(taxableIncome);

    // Provisional tax (1/3 of last year's tax, minimum thresholds apply)
    const provisionalTax = taxDue * 0.105; // 10.5% (rough estimation)

    const returnData: IRDReturnData = {
      incomeTax: {
        grossIncome,
        allowableDeductions,
        taxableIncome,
        taxDue,
        provisionalTax
      }
    };

    const taxReturn: Omit<TaxReturn, 'id' | 'createdAt' | 'updatedAt'> = {
      userId,
      periodStart,
      periodEnd,
      returnType: 'Income_Tax',
      totalSales: grossIncome,
      totalPurchases: allowableDeductions,
      gstOnSales: 0,
      gstOnPurchases: 0,
      netGst: 0,
      status: 'draft',
      returnData
    };

    return await supabaseDataService.createTaxReturn(taxReturn);
  }

  /**
   * Simplified NZ income tax calculation
   */
  private calculateIncomeTax(taxableIncome: number): number {
    // NZ 2024 tax brackets (simplified)
    let tax = 0;

    if (taxableIncome > 180000) {
      tax += (taxableIncome - 180000) * 0.39;
      taxableIncome = 180000;
    }
    if (taxableIncome > 70000) {
      tax += (taxableIncome - 70000) * 0.33;
      taxableIncome = 70000;
    }
    if (taxableIncome > 48000) {
      tax += (taxableIncome - 48000) * 0.30;
      taxableIncome = 48000;
    }
    if (taxableIncome > 14000) {
      tax += (taxableIncome - 14000) * 0.175;
      taxableIncome = 14000;
    }
    if (taxableIncome > 0) {
      tax += taxableIncome * 0.105;
    }

    return Math.round(tax * 100) / 100;
  }

  /**
   * Submit tax return to IRD (simulation - would integrate with IRD API)
   */
  async submitTaxReturn(taxReturnId: string): Promise<{
    success: boolean;
    irdReference?: string;
    submissionDate?: string;
    errors?: string[];
  }> {
    const taxReturn = await supabaseDataService.getTaxReturnById(taxReturnId);
    if (!taxReturn) {
      throw new Error('Tax return not found');
    }

    if (taxReturn.status !== 'draft') {
      throw new Error('Only draft tax returns can be submitted');
    }

    // Validate return data
    const validation = this.validateTaxReturn(taxReturn);
    if (!validation.isValid) {
      return {
        success: false,
        errors: validation.errors
      };
    }

    // Simulate IRD submission
    const irdReference = `IRD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const submissionDate = new Date().toISOString();

    // Update tax return status
    await supabaseDataService.updateTaxReturn(taxReturnId, {
      status: 'submitted',
      submittedAt: submissionDate,
      irdReference
    });

    return {
      success: true,
      irdReference,
      submissionDate
    };
  }

  /**
   * Validate tax return before submission
   */
  private validateTaxReturn(taxReturn: TaxReturn): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (taxReturn.returnType === 'GST') {
      if (!taxReturn.returnData?.gstReturn) {
        errors.push('GST return data is required');
      } else {
        const gst = taxReturn.returnData.gstReturn;

        if (gst.salesDetails.totalSales < 0) {
          errors.push('Total sales cannot be negative');
        }

        if (gst.purchaseDetails.totalPurchases < 0) {
          errors.push('Total purchases cannot be negative');
        }

        if (gst.salesDetails.gstOnSales < 0) {
          errors.push('GST on sales cannot be negative');
        }
      }
    }

    if (taxReturn.returnType === 'Income_Tax') {
      if (!taxReturn.returnData?.incomeTax) {
        errors.push('Income tax return data is required');
      } else {
        const income = taxReturn.returnData.incomeTax;

        if (income.grossIncome < 0) {
          errors.push('Gross income cannot be negative');
        }

        if (income.allowableDeductions < 0) {
          errors.push('Allowable deductions cannot be negative');
        }
      }
    }

    // Validate period
    const start = new Date(taxReturn.periodStart);
    const end = new Date(taxReturn.periodEnd);

    if (start >= end) {
      errors.push('Period start must be before period end');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Generate compliance report for audit purposes
   */
  async generateComplianceReport(
    userId: string,
    periodStart: string,
    periodEnd: string
  ): Promise<ComplianceReport> {
    const periodData = await this.fetchPeriodData(userId, periodStart, periodEnd);

    // Calculate key metrics
    const totalInvoiced = periodData.invoices
      .reduce((sum, inv) => sum + inv.total, 0);

    const totalReceived = periodData.payments
      .filter(p => p.status === 'completed')
      .reduce((sum, p) => sum + p.amount, 0);

    const totalExpenses = periodData.expenses
      .reduce((sum, exp) => sum + exp.amount, 0);

    const outstandingReceivables = periodData.invoices
      .filter(inv => inv.paymentStatus !== 'paid')
      .reduce((sum, inv) => sum + inv.balanceDue, 0);

    // Tax compliance checks
    const taxCompliance = this.checkTaxCompliance(periodData);

    return {
      period: { start: periodStart, end: periodEnd },
      summary: {
        totalInvoiced,
        totalReceived,
        totalExpenses,
        netIncome: totalReceived - totalExpenses,
        outstandingReceivables
      },
      taxCompliance,
      invoiceCount: periodData.invoices.length,
      paymentCount: periodData.payments.length,
      expenseCount: periodData.expenses.length,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Check tax compliance for the period
   */
  private checkTaxCompliance(periodData: PeriodData): TaxComplianceCheck {
    const issues: string[] = [];
    const warnings: string[] = [];

    // Check for missing GST on invoices
    const invoicesWithoutGST = periodData.invoices.filter(
      inv => inv.total > 0 && !inv.taxBreakdown
    );

    if (invoicesWithoutGST.length > 0) {
      warnings.push(`${invoicesWithoutGST.length} invoices may be missing GST calculations`);
    }

    // Check for overdue GST returns (quarterly filing)
    const quarterEnd = this.getQuarterEnd(periodData.invoices[0]?.date || new Date().toISOString());
    const daysSinceQuarter = Math.floor(
      (new Date().getTime() - new Date(quarterEnd).getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceQuarter > 28) { // GST due 28th of month following quarter
      issues.push('GST return may be overdue');
    }

    // Check for high cash transactions (AML compliance)
    const largeCashPayments = periodData.payments.filter(
      p => p.paymentMethod === 'cash' && p.amount > 10000
    );

    if (largeCashPayments.length > 0) {
      warnings.push('Large cash transactions may require additional reporting');
    }

    return {
      isCompliant: issues.length === 0,
      issues,
      warnings,
      checkedAt: new Date().toISOString()
    };
  }

  /**
   * Get quarter end date
   */
  private getQuarterEnd(dateString: string): string {
    const date = new Date(dateString);
    const quarter = Math.floor(date.getMonth() / 3);
    const year = date.getFullYear();

    const quarterEndMonths = [2, 5, 8, 11]; // March, June, September, December
    const endMonth = quarterEndMonths[quarter];

    return new Date(year, endMonth, 31).toISOString();
  }

  /**
   * Validate period dates
   */
  private validatePeriod(periodStart: string, periodEnd: string): void {
    const start = new Date(periodStart);
    const end = new Date(periodEnd);
    const now = new Date();

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new Error('Invalid period dates');
    }

    if (start >= end) {
      throw new Error('Period start must be before period end');
    }

    if (end > now) {
      throw new Error('Period end cannot be in the future');
    }

    // Check period is not too long (max 1 year for most returns)
    const oneYear = 365 * 24 * 60 * 60 * 1000;
    if (end.getTime() - start.getTime() > oneYear) {
      throw new Error('Period cannot exceed one year');
    }
  }

  /**
   * Get tax returns for user with pagination
   */
  async getTaxReturns(
    userId: string,
    returnType?: TaxReturn['returnType'],
    limit: number = 50,
    offset: number = 0
  ): Promise<TaxReturn[]> {
    return await supabaseDataService.getTaxReturnsByUser(userId, returnType, limit, offset);
  }

  /**
   * Get tax return by ID
   */
  async getTaxReturnById(taxReturnId: string): Promise<TaxReturn | null> {
    return await supabaseDataService.getTaxReturnById(taxReturnId);
  }

  /**
   * Update tax return
   */
  async updateTaxReturn(
    taxReturnId: string,
    updates: Partial<TaxReturn>
  ): Promise<TaxReturn> {
    return await supabaseDataService.updateTaxReturn(taxReturnId, updates);
  }

  /**
   * Delete draft tax return
   */
  async deleteTaxReturn(taxReturnId: string): Promise<void> {
    const taxReturn = await this.getTaxReturnById(taxReturnId);
    if (!taxReturn) {
      throw new Error('Tax return not found');
    }

    if (taxReturn.status !== 'draft') {
      throw new Error('Only draft tax returns can be deleted');
    }

    await supabaseDataService.deleteTaxReturn(taxReturnId);
  }
}

// Supporting interfaces
interface PeriodData {
  invoices: EnhancedInvoice[];
  payments: Payment[];
  expenses: import('@/features/tax/api/periodRows').PeriodExpense[];
}

interface ComplianceReport {
  period: { start: string; end: string };
  summary: {
    totalInvoiced: number;
    totalReceived: number;
    totalExpenses: number;
    netIncome: number;
    outstandingReceivables: number;
  };
  taxCompliance: TaxComplianceCheck;
  invoiceCount: number;
  paymentCount: number;
  expenseCount: number;
  generatedAt: string;
}

interface TaxComplianceCheck {
  isCompliant: boolean;
  issues: string[];
  warnings: string[];
  checkedAt: string;
}

export const irdReportingService = new IRDReportingService();
