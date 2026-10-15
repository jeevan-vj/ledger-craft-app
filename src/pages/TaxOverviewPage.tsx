import React, { useState, useEffect } from 'react';
import { TaxPositionCard } from '@/components/tax/TaxPositionCard';
import { NextPaymentDue } from '@/components/tax/NextPaymentDue';
import { ComplianceStatus } from '@/components/tax/ComplianceStatus';
import { QuickActions } from '@/components/tax/QuickActions';
import { QuarterlyTrends } from '@/components/tax/QuarterlyTrends';
import { RecentTaxActivity } from '@/components/tax/RecentTaxActivity';
import { useAuth } from "@/context/StableAuthContext";
import { taxCalculationService } from '@/services/taxCalculationService';
import { invoiceService } from '@/services/supabaseService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertTriangle, TrendingUp, Calendar, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout/PageHeader';

interface TaxOverview {
  currentGSTPosition: number;
  nextPaymentDue: {
    date: string;
    amount: number;
    type: 'GST' | 'Income_Tax';
  } | null;
  complianceScore: number;
  quarterlyTrend: {
    current: number;
    previous: number;
    change: number;
  };
  recentActivity: Array<{
    id: string;
    type: string;
    description: string;
    amount: number;
    date: string;
  }>;
}

const TaxOverviewPage: React.FC = () => {
  const { user } = useAuth();
  const [overview, setOverview] = useState<TaxOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentQuarter = getCurrentQuarter();
  const userId = user?.id || '';

  useEffect(() => {
    if (userId) {
      loadTaxOverview();
    }
  }, [userId]);

  const loadTaxOverview = async () => {
    if (!userId) return;
    
    try {
      setLoading(true);
      setError(null);

      // Get current quarter dates
      const { start, end } = getQuarterDates(currentQuarter.quarter, currentQuarter.year);
      
      // Fetch tax summary for current quarter
      const gstSummary = await taxCalculationService.calculateGSTSummary(
        userId,
        start,
        end
      );
      
      // Get previous quarter for comparison
      const prevQuarter = getPreviousQuarter(currentQuarter);
      const { start: prevStart, end: prevEnd } = getQuarterDates(prevQuarter.quarter, prevQuarter.year);
      const prevGstSummary = await taxCalculationService.calculateGSTSummary(
        userId,
        prevStart,
        prevEnd
      );

      // Calculate next payment due date
      const nextDueDate = calculateNextGSTDueDate(end);
      
      const invoices = await invoiceService.getInvoices();
      const invoicesInPeriod = invoices.filter((invoice) => {
        const date = invoice.date.slice(0, 10);
        return date >= start && date <= end;
      });
      const expenses: Array<{ id: string; description: string; amount: number; taxAmount?: number | null; expenseDate: string }> = [];

      const recentActivity = invoicesInPeriod.slice(0, 5).map((inv) => ({
        id: inv.id,
        type: 'invoice' as const,
        description: `Invoice ${inv.invoiceNumber}`,
        amount: inv.taxAmount || 0,
        date: inv.date,
      }));

      // Calculate compliance score (simplified)
      const complianceScore = calculateComplianceScore(gstSummary, invoicesInPeriod, expenses);

      setOverview({
        currentGSTPosition: gstSummary.netGstPosition,
        nextPaymentDue: gstSummary.netGstPosition > 0 ? {
          date: nextDueDate,
          amount: gstSummary.netGstPosition,
          type: 'GST'
        } : null,
        complianceScore,
        quarterlyTrend: {
          current: gstSummary.netGstPosition,
          previous: prevGstSummary.netGstPosition,
          change: gstSummary.netGstPosition - prevGstSummary.netGstPosition
        },
        recentActivity
      });

    } catch (err) {
      console.error('Error loading tax overview:', err);
      setError('Failed to load tax overview. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading tax overview...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button onClick={loadTaxOverview} className="mt-4">
          Try Again
        </Button>
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="p-6">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            No tax data found. Start by configuring your tax settings and adding some transactions.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tax Overview"
        description={`${currentQuarter.quarter} ${currentQuarter.year} — real-time tax position and compliance status`}
      />

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <TaxPositionCard 
          amount={overview.currentGSTPosition}
          quarter={currentQuarter}
        />
        
        <NextPaymentDue 
          paymentDue={overview.nextPaymentDue}
        />
        
        <ComplianceStatus 
          score={overview.complianceScore}
          userId={userId}
        />
        
        <QuickActions userId={userId} />
      </div>

      {/* Charts and Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <QuarterlyTrends 
          userId={userId}
          currentQuarter={currentQuarter}
          trend={overview.quarterlyTrend}
        />
        
        <RecentTaxActivity 
          activities={overview.recentActivity}
        />
      </div>

      {/* Additional Insights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Tax Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {overview.currentGSTPosition > 0 && (
                <div className="text-sm">
                  <p className="font-medium text-amber-600">
                    💰 GST Payment Due: ${overview.currentGSTPosition.toFixed(2)}
                  </p>
                  <p className="text-muted-foreground">
                    Consider setting aside funds for your next GST payment.
                  </p>
                </div>
              )}
              
              {overview.currentGSTPosition < 0 && (
                <div className="text-sm">
                  <p className="font-medium text-green-600">
                    💸 GST Refund Expected: ${Math.abs(overview.currentGSTPosition).toFixed(2)}
                  </p>
                  <p className="text-muted-foreground">
                    Submit your GST return promptly to receive your refund.
                  </p>
                </div>
              )}

              {overview.quarterlyTrend.change > 0 && (
                <div className="text-sm">
                  <p className="font-medium">
                    📈 GST liability increased by ${overview.quarterlyTrend.change.toFixed(2)} from last quarter
                  </p>
                  <p className="text-muted-foreground">
                    Business growth or reduced deductible expenses may be contributing factors.
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Upcoming Deadlines
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">GST Return Due</span>
                <span className="text-sm text-muted-foreground">
                  {overview.nextPaymentDue?.date ? new Date(overview.nextPaymentDue.date).toLocaleDateString('en-NZ') : 'N/A'}
                </span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Provisional Tax</span>
                <span className="text-sm text-muted-foreground">
                  Aug 28, {currentQuarter.year}
                </span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Income Tax Return</span>
                <span className="text-sm text-muted-foreground">
                  Mar 31, {currentQuarter.year + 1}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

// Helper functions
function getCurrentQuarter() {
  const now = new Date();
  const quarter = Math.floor(now.getMonth() / 3) + 1;
  return { quarter: `Q${quarter}`, year: now.getFullYear() };
}

function getPreviousQuarter(current: { quarter: string; year: number }) {
  const quarterNum = parseInt(current.quarter.substring(1));
  if (quarterNum === 1) {
    return { quarter: 'Q4', year: current.year - 1 };
  }
  return { quarter: `Q${quarterNum - 1}`, year: current.year };
}

function getQuarterDates(quarter: string, year: number) {
  const quarterNum = parseInt(quarter.substring(1));
  const startMonth = (quarterNum - 1) * 3;
  const endMonth = startMonth + 2;
  
  const start = new Date(year, startMonth, 1).toISOString().split('T')[0];
  const end = new Date(year, endMonth + 1, 0).toISOString().split('T')[0];
  
  return { start, end };
}

function calculateNextGSTDueDate(quarterEnd: string): string {
  const date = new Date(quarterEnd);
  const dueDate = new Date(date.getFullYear(), date.getMonth() + 1, 28);
  return dueDate.toISOString().split('T')[0];
}

function calculateComplianceScore(
  gstSummary: any, 
  invoices: any[], 
  expenses: any[]
): number {
  let score = 100;
  
  // Deduct points for missing tax calculations
  const invoicesWithoutTax = invoices.filter(inv => !inv.taxAmount && inv.total > 0);
  score -= invoicesWithoutTax.length * 5;

  const expensesWithoutTax = expenses.filter(exp => !exp.taxAmount && exp.amount > 0);
  score -= expensesWithoutTax.length * 3;
  
  // Deduct points for incomplete data
  if (gstSummary.totalSales === 0) score -= 20;
  if (gstSummary.totalPurchases === 0) score -= 10;
  
  return Math.max(0, Math.min(100, score));
}

export default TaxOverviewPage;