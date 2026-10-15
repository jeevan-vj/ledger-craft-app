import { TaxConfiguration, TaxCalculationRequest, TaxCalculationResult, TaxBreakdown, IRDReturnData } from '@/types/payment';
import { supabaseDataService } from './supabaseDataService';
import { expenseService, invoiceService } from './supabaseService';
import { readMoney } from '@/features/tax/api/periodRows';

export class TaxCalculationService {
  /**
   * Calculate tax for invoice items based on tax configuration
   */
  calculateTax(request: TaxCalculationRequest, taxConfig: TaxConfiguration | null): TaxCalculationResult {
    if (!taxConfig) {
      throw new Error('Tax configuration is required');
    }

    if (taxConfig.taxRate < 0 || taxConfig.taxRate > 1) {
      throw new Error('Tax rate must be between 0 and 1');
    }

    const breakdown: TaxBreakdown['breakdown'] = {
      lineItems: []
    };

    let subtotalAmount = 0;
    let totalTaxAmount = 0;

    // Process each line item
    request.items.forEach((item) => {
      const lineTotal = item.quantity * item.unitPrice;
      let lineTaxAmount = 0;
      let lineSubtotal = lineTotal;

      if (item.taxable && taxConfig.taxRate > 0) {
        if (request.taxInclusive) {
          // Tax-inclusive: extract tax from total
          lineSubtotal = lineTotal / (1 + taxConfig.taxRate);
          lineTaxAmount = lineTotal - lineSubtotal;
        } else {
          // Tax-exclusive: add tax to subtotal
          lineSubtotal = lineTotal;
          lineTaxAmount = lineTotal * taxConfig.taxRate;
        }
      }

      // Round to 2 decimal places for currency
      lineSubtotal = Math.round(lineSubtotal * 100) / 100;
      lineTaxAmount = Math.round(lineTaxAmount * 100) / 100;

      subtotalAmount += lineSubtotal;
      totalTaxAmount += lineTaxAmount;

      breakdown.lineItems.push({
        description: item.description,
        amount: lineSubtotal,
        taxable: item.taxable,
        taxAmount: lineTaxAmount
      });
    });

    // Apply additional charges (taxable)
    if (request.additionalCharges && request.additionalCharges > 0) {
      let additionalTax = 0;
      let additionalSubtotal = request.additionalCharges;

      if (taxConfig.taxRate > 0) {
        if (request.taxInclusive) {
          additionalSubtotal = request.additionalCharges / (1 + taxConfig.taxRate);
          additionalTax = request.additionalCharges - additionalSubtotal;
        } else {
          additionalTax = request.additionalCharges * taxConfig.taxRate;
        }
      }

      additionalSubtotal = Math.round(additionalSubtotal * 100) / 100;
      additionalTax = Math.round(additionalTax * 100) / 100;

      subtotalAmount += additionalSubtotal;
      totalTaxAmount += additionalTax;

      breakdown.lineItems.push({
        description: 'Additional Charges',
        amount: additionalSubtotal,
        taxable: true,
        taxAmount: additionalTax
      });
    }

    // Apply discounts (reduce subtotal before tax)
    if (request.discounts && request.discounts > 0) {
      if (request.taxInclusive) {
        // For tax-inclusive, discount includes tax
        const discountSubtotal = request.discounts / (1 + taxConfig.taxRate);
        const discountTax = request.discounts - discountSubtotal;
        
        subtotalAmount -= Math.round(discountSubtotal * 100) / 100;
        totalTaxAmount -= Math.round(discountTax * 100) / 100;
      } else {
        // For tax-exclusive, recalculate tax on discounted amount
        subtotalAmount -= request.discounts;
        totalTaxAmount = subtotalAmount * taxConfig.taxRate;
        totalTaxAmount = Math.round(totalTaxAmount * 100) / 100;
      }

      breakdown.lineItems.push({
        description: 'Discount',
        amount: -request.discounts,
        taxable: true,
        taxAmount: request.taxInclusive ? 
          -Math.round((request.discounts - (request.discounts / (1 + taxConfig.taxRate))) * 100) / 100 :
          -Math.round((request.discounts * taxConfig.taxRate) * 100) / 100
      });
    }

    // Final rounding
    subtotalAmount = Math.round(subtotalAmount * 100) / 100;
    totalTaxAmount = Math.round(totalTaxAmount * 100) / 100;
    const total = Math.round((subtotalAmount + totalTaxAmount) * 100) / 100;

    return {
      subtotal: subtotalAmount,
      taxAmount: totalTaxAmount,
      total: total,
      taxRate: taxConfig.taxRate,
      taxName: taxConfig.taxName,
      breakdown
    };
  }

  /**
   * Calculate GST for New Zealand IRD returns - Sales
   */
  async calculateGSTReturnSales(
    salesData: Array<{ amount: number; taxInclusive: boolean; taxable: boolean }>,
    taxConfig: TaxConfiguration
  ): Promise<{
    totalSales: number;
    gstOnSales: number;
    standardRated: number;
    zeroRated: number;
  }> {
    let totalSales = 0;
    let gstOnSales = 0;
    let standardRated = 0;
    let zeroRated = 0;

    for (const sale of salesData) {
      if (sale.taxable) {
        standardRated += sale.amount;
        
        if (sale.taxInclusive) {
          // Extract GST from tax-inclusive amount
          const gstAmount = sale.amount - (sale.amount / (1 + taxConfig.taxRate));
          gstOnSales += Math.round(gstAmount * 100) / 100;
          totalSales += sale.amount;
        } else {
          // Add GST to tax-exclusive amount
          const gstAmount = sale.amount * taxConfig.taxRate;
          gstOnSales += Math.round(gstAmount * 100) / 100;
          totalSales += sale.amount + gstAmount;
        }
      } else {
        // Zero-rated or exempt
        zeroRated += sale.amount;
        totalSales += sale.amount;
      }
    }

    return {
      totalSales: Math.round(totalSales * 100) / 100,
      gstOnSales: Math.round(gstOnSales * 100) / 100,
      standardRated: Math.round(standardRated * 100) / 100,
      zeroRated: Math.round(zeroRated * 100) / 100
    };
  }

  /**
   * Calculate GST for New Zealand IRD returns - Purchases
   */
  async calculateGSTReturnPurchases(
    purchaseData: Array<{ amount: number; taxInclusive: boolean; taxable: boolean }>,
    taxConfig: TaxConfiguration
  ): Promise<{
    totalPurchases: number;
    gstOnPurchases: number;
    standardRated: number;
  }> {
    let totalPurchases = 0;
    let gstOnPurchases = 0;
    let standardRated = 0;

    for (const purchase of purchaseData) {
      if (purchase.taxable) {
        standardRated += purchase.amount;
        
        if (purchase.taxInclusive) {
          // Extract GST from tax-inclusive amount
          const gstAmount = purchase.amount - (purchase.amount / (1 + taxConfig.taxRate));
          gstOnPurchases += Math.round(gstAmount * 100) / 100;
          totalPurchases += purchase.amount;
        } else {
          // Add GST to tax-exclusive amount
          const gstAmount = purchase.amount * taxConfig.taxRate;
          gstOnPurchases += Math.round(gstAmount * 100) / 100;
          totalPurchases += purchase.amount + gstAmount;
        }
      } else {
        // Non-claimable GST purchases
        totalPurchases += purchase.amount;
      }
    }

    return {
      totalPurchases: Math.round(totalPurchases * 100) / 100,
      gstOnPurchases: Math.round(gstOnPurchases * 100) / 100,
      standardRated: Math.round(standardRated * 100) / 100
    };
  }

  /**
   * Calculate net GST position for IRD return
   */
  calculateNetGST(gstOnSales: number, gstOnPurchases: number): number {
    return Math.round((gstOnSales - gstOnPurchases) * 100) / 100;
  }

  /**
   * Generate comprehensive IRD GST return data from real Supabase data
   */
  async generateIRDGSTReturn(
    userId: string,
    periodStart: string,
    periodEnd: string
  ): Promise<IRDReturnData> {
    try {
      const taxConfig = await this.getActiveTaxConfiguration(userId);
      if (!taxConfig) {
        throw new Error('No active tax configuration found');
      }

      // Fetch real data from Supabase
      const [invoices, expenses] = await Promise.all([
        supabaseDataService.getInvoicesByPeriod(userId, periodStart, periodEnd),
        supabaseDataService.getExpensesByPeriod(userId, periodStart, periodEnd)
      ]);

      // Calculate sales data using real invoice data
      const salesData = invoices.map(invoice => ({
        amount: invoice.total,
        taxInclusive: invoice.taxInclusive || true,
        taxable: invoice.total > 0
      }));

      const salesCalculation = await this.calculateGSTReturnSales(salesData, taxConfig);

      // Calculate purchase data using actual stored tax_amount from expenses
      // Use stored tax_amount directly instead of recalculating from amount
      // Default is_claimable to true if not explicitly set to false
      const claimableExpenses = expenses.filter(expense => 
        expense.is_claimable !== false && !expense.is_capital_expense
      );
      const capitalExpenses = expenses.filter(expense => expense.is_capital_expense);
      
      const totalPurchases = expenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
      const gstOnPurchases = claimableExpenses.reduce((sum, exp) => 
        sum + readMoney(exp, 'taxAmount', 'tax_amount'), 0
      );
      const gstOnCapitalGoods = capitalExpenses.reduce((sum, exp) => 
        sum + readMoney(exp, 'taxAmount', 'tax_amount'), 0
      );
      
      // Calculate capital goods total
      const capitalGoods = capitalExpenses.reduce((sum, expense) => 
        sum + (expense.amount || 0), 0
      );
      
      const purchaseCalculation = {
        totalPurchases: Math.round(totalPurchases * 100) / 100,
        gstOnPurchases: Math.round((gstOnPurchases + gstOnCapitalGoods) * 100) / 100,
        standardRated: Math.round(totalPurchases * 100) / 100
      };

      // Calculate bad debts from written-off invoices
      const badDebts = invoices
        .filter(invoice => invoice.paymentStatus === 'written_off')
        .reduce((sum, invoice) => sum + readMoney(invoice, 'taxAmount', 'tax_amount'), 0);

      return {
        gstReturn: {
          salesDetails: {
            standardRated: salesCalculation.standardRated,
            zeroRated: salesCalculation.zeroRated,
            exempt: 0, // Calculate if needed
            totalSales: salesCalculation.totalSales,
            gstOnSales: salesCalculation.gstOnSales
          },
          purchaseDetails: {
            standardRated: purchaseCalculation.standardRated,
            capitalGoods: capitalGoods,
            totalPurchases: purchaseCalculation.totalPurchases,
            gstOnPurchases: purchaseCalculation.gstOnPurchases
          },
          adjustments: {
            badDebts: badDebts,
            otherAdjustments: 0
          }
        }
      };
    } catch (error) {
      console.error('Error generating IRD GST return:', error);
      throw error;
    }
  }

  /**
   * Validate tax calculation inputs
   */
  validateTaxCalculationRequest(request: TaxCalculationRequest): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!request.items || request.items.length === 0) {
      errors.push('At least one item is required');
    }

    request.items?.forEach((item, index) => {
      if (!item.description || item.description.trim() === '') {
        errors.push(`Item ${index + 1}: Description is required`);
      }
      
      if (item.quantity <= 0) {
        errors.push(`Item ${index + 1}: Quantity must be positive`);
      }
      
      if (item.unitPrice < 0) {
        errors.push(`Item ${index + 1}: Unit price cannot be negative`);
      }
    });

    if (request.additionalCharges && request.additionalCharges < 0) {
      errors.push('Additional charges cannot be negative');
    }

    if (request.discounts && request.discounts < 0) {
      errors.push('Discounts cannot be negative');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Get active tax configuration for user from Supabase
   */
  async getActiveTaxConfiguration(userId: string, countryCode: string = 'NZ'): Promise<TaxConfiguration | null> {
    try {
      let config = await supabaseDataService.getTaxConfiguration(userId, countryCode);
      
      // If no configuration exists, create a default one
      if (!config) {
        config = await supabaseDataService.createDefaultTaxConfiguration(userId);
      }
      
      return config;
    } catch (error) {
      console.error('Error getting tax configuration:', error);
      return null;
    }
  }

  /**
   * Calculate tax breakdown for invoice line items
   */
  calculateInvoiceTaxBreakdown(
    lineItems: Array<{
      description: string;
      quantity: number;
      rate: number;
      tax?: number; // Optional tax rate override
    }>,
    additionalCharges: number = 0,
    discount: number = 0,
    taxConfig: TaxConfiguration,
    taxInclusive: boolean = true
  ): TaxBreakdown {
    const request: TaxCalculationRequest = {
      items: lineItems.map(item => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.rate,
        taxable: true // Assume all invoice items are taxable
      })),
      additionalCharges,
      discounts: discount,
      taxInclusive
    };

    const result = this.calculateTax(request, taxConfig);

    return {
      subtotal: result.subtotal,
      taxAmount: result.taxAmount,
      taxRate: result.taxRate,
      taxName: result.taxName,
      taxInclusive,
      total: result.total
    };
  }

  /**
   * Format tax amount for display
   */
  formatTaxAmount(amount: number, currency: string = 'NZD'): string {
    return new Intl.NumberFormat('en-NZ', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  }

  /**
   * Get tax rate as percentage string
   */
  formatTaxRate(rate: number): string {
    return `${(rate * 100).toFixed(1)}%`;
  }

  /**
   * Calculate GST summary for a period - needed for Tax Overview
   */
  async calculateGSTSummary(
    userId: string,
    periodStart: string,
    periodEnd: string
  ): Promise<{
    totalSales: number;
    totalPurchases: number;
    gstOnSales: number;
    gstOnPurchases: number;
    netGstPosition: number;
  }> {
    try {
      const invoices = await invoiceService.getInvoices();
      const expenses = await expenseService.getExpenses().catch(() => []);
      const invoicesInPeriod = invoices.filter((invoice) => {
        const date = invoice.date.slice(0, 10);
        return date >= periodStart && date <= periodEnd;
      });
      const expensesInPeriod = expenses.filter((expense) => {
        const date = String(expense.expenseDate).slice(0, 10);
        return date >= periodStart && date <= periodEnd;
      });

      let totalSales = 0;
      let gstOnSales = 0;
      for (const invoice of invoicesInPeriod) {
        totalSales += invoice.total || 0;
        gstOnSales += invoice.taxAmount || 0;
      }

      let totalPurchases = 0;
      let gstOnPurchases = 0;
      for (const expense of expensesInPeriod) {
        totalPurchases += expense.amount || 0;
      }

      // Round values
      totalSales = Math.round(totalSales * 100) / 100;
      totalPurchases = Math.round(totalPurchases * 100) / 100;
      gstOnSales = Math.round(gstOnSales * 100) / 100;
      gstOnPurchases = Math.round(gstOnPurchases * 100) / 100;

      const netGstPosition = Math.round((gstOnSales - gstOnPurchases) * 100) / 100;

      return {
        totalSales,
        totalPurchases,
        gstOnSales,
        gstOnPurchases,
        netGstPosition
      };

    } catch (error) {
      console.error('Error calculating GST summary:', error);
      return {
        totalSales: 0,
        totalPurchases: 0,
        gstOnSales: 0,
        gstOnPurchases: 0,
        netGstPosition: 0
      };
    }
  }
}

export const taxCalculationService = new TaxCalculationService();