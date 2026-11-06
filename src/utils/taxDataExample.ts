/**
 * Tax Data Integration Examples
 * Demonstrates how to use the real Supabase data integration for tax calculations
 */

import { supabaseDataService } from '@/services/supabaseDataService';
import { taxCalculationService } from '@/services/taxCalculationService';
import { irdReportingService } from '@/services/irdReportingService';

export class TaxDataExample {
  /**
   * Example: Create sample data for testing tax calculations
   */
  static async createSampleTaxData(userId: string) {
    try {
      // 1. Ensure user has tax configuration
      let taxConfig = await supabaseDataService.getTaxConfiguration(userId);
      if (!taxConfig) {
        taxConfig = await supabaseDataService.createDefaultTaxConfiguration(userId);
        console.log('✅ Created default NZ GST configuration');
      }

      // 2. Create sample expenses for GST input credits
      const sampleExpenses = [
        {
          user_id: userId,
          date: '2024-01-15',
          description: 'Office rent - January',
          amount: 2300.00, // Tax-inclusive
          category: 'RENT',
          supplier_name: 'Property Management Ltd',
          tax_amount: 300.00, // GST included
          tax_rate: 0.15,
          tax_inclusive: true,
          is_claimable: true,
          is_capital_expense: false
        },
        {
          user_id: userId,
          date: '2024-01-20',
          description: 'Computer equipment',
          amount: 3450.00, // Tax-inclusive
          category: 'EQUIPMENT',
          supplier_name: 'Tech Store NZ',
          tax_amount: 450.00,
          tax_rate: 0.15,
          tax_inclusive: true,
          is_claimable: true,
          is_capital_expense: true // Capital goods for GST return
        },
        {
          user_id: userId,
          date: '2024-02-01',
          description: 'Professional development course',
          amount: 575.00,
          category: 'TRAINING',
          supplier_name: 'Training Institute',
          tax_amount: 75.00,
          tax_rate: 0.15,
          tax_inclusive: true,
          is_claimable: true,
          is_capital_expense: false
        },
        {
          user_id: userId,
          date: '2024-02-10',
          description: 'Business meals (50% claimable)',
          amount: 115.00,
          category: 'MEALS_ENTERTAINMENT',
          supplier_name: 'Restaurant Ltd',
          tax_amount: 7.50, // Only 50% of GST claimable
          tax_rate: 0.15,
          tax_inclusive: true,
          is_claimable: true, // Note: Business rule for 50% applies elsewhere
          is_capital_expense: false
        }
      ];

      // Create expenses in Supabase
      for (const expense of sampleExpenses) {
        await supabaseDataService.createExpense(expense);
      }
      console.log('✅ Created sample business expenses');

      // 3. Note: Invoices would be created through the invoice creation flow
      // This example shows how the tax system would work with existing invoice data

      return {
        message: 'Sample tax data created successfully',
        taxConfigId: taxConfig.id,
        expensesCreated: sampleExpenses.length
      };

    } catch (error) {
      console.error('Error creating sample data:', error);
      throw error;
    }
  }

  /**
   * Example: Calculate quarterly GST return using real data
   */
  static async calculateQuarterlyGST(userId: string, quarter: '1' | '2' | '3' | '4', year: number = 2024) {
    try {
      // Define quarter periods
      const quarters = {
        '1': { start: `${year}-01-01`, end: `${year}-03-31` },
        '2': { start: `${year}-04-01`, end: `${year}-06-30` },
        '3': { start: `${year}-07-01`, end: `${year}-09-30` },
        '4': { start: `${year}-10-01`, end: `${year}-12-31` }
      };

      const period = quarters[quarter];
      
      console.log(`\n📊 Calculating Q${quarter} ${year} GST Return for user ${userId}`);
      console.log(`Period: ${period.start} to ${period.end}\n`);

      // 1. Generate comprehensive GST return data
      const gstReturn = await irdReportingService.generateGSTReturn(
        userId,
        period.start,
        period.end
      );

      console.log('📈 GST Return Summary:');
      console.log(`├── Total Sales: $${gstReturn.totalSales.toFixed(2)}`);
      console.log(`├── GST on Sales: $${gstReturn.gstOnSales.toFixed(2)}`);
      console.log(`├── Total Purchases: $${gstReturn.totalPurchases.toFixed(2)}`);
      console.log(`├── GST on Purchases: $${gstReturn.gstOnPurchases.toFixed(2)}`);
      console.log(`└── Net GST Position: $${gstReturn.netGst.toFixed(2)} ${gstReturn.netGst > 0 ? '(To Pay)' : '(Refund)'}\n`);

      // 2. Get detailed breakdown
      const breakdown = await supabaseDataService.getGSTReturnSummary(
        userId,
        period.start,
        period.end
      );

      console.log('🔍 Detailed Breakdown:');
      console.log(`├── Sales Analysis:`);
      console.log(`│   ├── Total Revenue: $${breakdown.totalSales.toFixed(2)}`);
      console.log(`│   └── GST Collected: $${breakdown.gstOnSales.toFixed(2)}`);
      console.log(`├── Purchase Analysis:`);
      console.log(`│   ├── Total Expenses: $${breakdown.totalPurchases.toFixed(2)}`);
      console.log(`│   └── GST Claimable: $${breakdown.gstOnPurchases.toFixed(2)}`);
      console.log(`└── Net Position: $${breakdown.netGstPosition.toFixed(2)}\n`);

      // 3. Return structured data for frontend use
      return {
        quarter,
        year,
        period,
        gstReturn,
        breakdown,
        dueDate: this.calculateGSTDueDate(period.end),
        compliance: {
          isComplete: true,
          warnings: this.validateGSTReturn(gstReturn),
          readyForSubmission: gstReturn.status === 'draft'
        }
      };

    } catch (error) {
      console.error('Error calculating quarterly GST:', error);
      throw error;
    }
  }

  /**
   * Example: Get tax insights for business planning
   */
  static async getTaxInsights(userId: string, periodStart: string, periodEnd: string) {
    try {
      console.log(`\n🎯 Tax Insights for ${periodStart} to ${periodEnd}\n`);

      // 1. Get raw data
      const [invoices, expenses, payments] = await Promise.all([
        supabaseDataService.getInvoicesByPeriod(userId, periodStart, periodEnd),
        supabaseDataService.getExpensesByPeriod(userId, periodStart, periodEnd),
        supabaseDataService.getPaymentsByPeriod(userId, periodStart, periodEnd)
      ]);

      // 2. Calculate key metrics
      const totalRevenue = invoices.reduce((sum, inv) => sum + inv.total, 0);
      const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);
      const grossProfit = totalRevenue - totalExpenses;
      
      const gstCollected = invoices.reduce((sum, inv) => sum + inv.taxAmount, 0);
      const gstPaid = expenses.reduce((sum, exp) => sum + exp.tax_amount, 0);
      const netGstPosition = gstCollected - gstPaid;

      const capitalExpenses = expenses
        .filter(exp => exp.is_capital_expense)
        .reduce((sum, exp) => sum + exp.amount, 0);

      const cashReceived = payments
        .filter(pay => pay.status === 'completed')
        .reduce((sum, pay) => sum + pay.amount, 0);

      const outstandingInvoices = invoices
        .filter(inv => inv.paymentStatus !== 'paid')
        .reduce((sum, inv) => sum + inv.balanceDue, 0);

      // 3. Generate insights
      const insights = {
        financialSummary: {
          totalRevenue: totalRevenue,
          totalExpenses: totalExpenses,
          grossProfit: grossProfit,
          grossMargin: totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0
        },
        gstSummary: {
          gstCollected: gstCollected,
          gstPaid: gstPaid,
          netPosition: netGstPosition,
          effectiveGstRate: totalRevenue > 0 ? (gstCollected / totalRevenue) * 100 : 0
        },
        cashFlow: {
          cashReceived: cashReceived,
          outstandingInvoices: outstandingInvoices,
          collectionRate: totalRevenue > 0 ? (cashReceived / totalRevenue) * 100 : 0
        },
        investments: {
          capitalExpenses: capitalExpenses,
          operatingExpenses: totalExpenses - capitalExpenses,
          capitalIntensity: totalExpenses > 0 ? (capitalExpenses / totalExpenses) * 100 : 0
        },
        recommendations: this.generateRecommendations({
          grossMargin: (grossProfit / totalRevenue) * 100,
          gstPosition: netGstPosition,
          collectionRate: (cashReceived / totalRevenue) * 100,
          capitalIntensity: (capitalExpenses / totalExpenses) * 100
        })
      };

      // 4. Display insights
      console.log('💰 Financial Summary:');
      console.log(`├── Revenue: $${insights.financialSummary.totalRevenue.toFixed(2)}`);
      console.log(`├── Expenses: $${insights.financialSummary.totalExpenses.toFixed(2)}`);
      console.log(`├── Gross Profit: $${insights.financialSummary.grossProfit.toFixed(2)}`);
      console.log(`└── Gross Margin: ${insights.financialSummary.grossMargin.toFixed(1)}%\n`);

      console.log('🏛️ GST Summary:');
      console.log(`├── GST Collected: $${insights.gstSummary.gstCollected.toFixed(2)}`);
      console.log(`├── GST Paid: $${insights.gstSummary.gstPaid.toFixed(2)}`);
      console.log(`├── Net Position: $${insights.gstSummary.netPosition.toFixed(2)}`);
      console.log(`└── Effective Rate: ${insights.gstSummary.effectiveGstRate.toFixed(1)}%\n`);

      console.log('💸 Cash Flow:');
      console.log(`├── Cash Received: $${insights.cashFlow.cashReceived.toFixed(2)}`);
      console.log(`├── Outstanding: $${insights.cashFlow.outstandingInvoices.toFixed(2)}`);
      console.log(`└── Collection Rate: ${insights.cashFlow.collectionRate.toFixed(1)}%\n`);

      console.log('🏗️ Investment Analysis:');
      console.log(`├── Capital Expenses: $${insights.investments.capitalExpenses.toFixed(2)}`);
      console.log(`├── Operating Expenses: $${insights.investments.operatingExpenses.toFixed(2)}`);
      console.log(`└── Capital Intensity: ${insights.investments.capitalIntensity.toFixed(1)}%\n`);

      console.log('💡 Recommendations:');
      insights.recommendations.forEach((rec, i) => {
        console.log(`${i + 1}. ${rec}`);
      });
      console.log('');

      return insights;

    } catch (error) {
      console.error('Error generating tax insights:', error);
      throw error;
    }
  }

  /**
   * Helper: Calculate GST due date (28th of month following quarter end)
   */
  private static calculateGSTDueDate(quarterEndDate: string): string {
    const date = new Date(quarterEndDate);
    const dueDate = new Date(date.getFullYear(), date.getMonth() + 1, 28);
    return dueDate.toISOString().split('T')[0];
  }

  /**
   * Helper: Validate GST return for common issues
   */
  private static validateGSTReturn(gstReturn: Pick<import('@/types/payment').TaxReturn, 'totalSales' | 'gstOnSales' | 'netGst'>): string[] {
    const warnings: string[] = [];

    if (gstReturn.totalSales === 0) {
      warnings.push('No sales recorded for this period');
    }

    if (gstReturn.gstOnSales === 0 && gstReturn.totalSales > 0) {
      warnings.push('Sales recorded but no GST calculated - check if business is GST registered');
    }

    if (gstReturn.netGst < 0 && Math.abs(gstReturn.netGst) > 10000) {
      warnings.push('Large GST refund detected - verify purchase calculations');
    }

    return warnings;
  }

  /**
   * Helper: Generate business recommendations based on metrics
   */
  private static generateRecommendations(metrics: {
    grossMargin: number;
    gstPosition: number;
    collectionRate: number;
    capitalIntensity: number;
  }): string[] {
    const recommendations: string[] = [];

    if (metrics.grossMargin < 20) {
      recommendations.push('Consider reviewing pricing strategy - gross margin below 20%');
    }

    if (metrics.collectionRate < 80) {
      recommendations.push('Improve invoice collection processes - collection rate below 80%');
    }

    if (metrics.gstPosition > 5000) {
      recommendations.push('Plan for GST payment - consider setting aside funds monthly');
    }

    if (metrics.capitalIntensity > 40) {
      recommendations.push('High capital investment period - monitor cash flow carefully');
    }

    if (metrics.gstPosition < -2000) {
      recommendations.push('GST refund due - submit return promptly to improve cash flow');
    }

    if (recommendations.length === 0) {
      recommendations.push('Financial metrics look healthy - maintain current practices');
    }

    return recommendations;
  }
}

// Export convenience functions for direct use
export const createSampleTaxData = TaxDataExample.createSampleTaxData;
export const calculateQuarterlyGST = TaxDataExample.calculateQuarterlyGST;
export const getTaxInsights = TaxDataExample.getTaxInsights;