import React, { useState, useEffect } from 'react';
import { IRDReportingDashboard } from '@/components/reporting/IRDReportingDashboard';
import { GSTReturnWizard, GSTReturnData } from '@/components/tax/GSTReturnWizard';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from "@/context/StableAuthContext";
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { TaxReturn } from '@/types/payment';
import { supabaseDataService } from '@/services/supabaseDataService';
import { taxCalculationService } from '@/services/taxCalculationService';
import { PageHeader } from '@/components/layout/PageHeader';
import { downloadGstReturnPdf } from '@/features/tax/export/gstReturnPdf';

export default function IRDReportingPage() {
  const [taxReturns, setTaxReturns] = useState<TaxReturn[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [complianceStatus, setComplianceStatus] = useState({
    isCompliant: true,
    issues: [] as string[],
    warnings: [] as string[]
  });
  const [nextGSTDueDate, setNextGSTDueDate] = useState('');
  const [showGSTWizard, setShowGSTWizard] = useState(false);
  
  const { toast } = useToast();
  const { user } = useAuth();

  const fetchTaxReturns = async () => {
    if (!user?.id) return;
    
    setIsLoading(true);
    try {
      // Fetch real tax returns from Supabase
      const returns = await supabaseDataService.getTaxReturnsByUser(user.id);
      setTaxReturns(returns);
      
      // Calculate compliance status based on real data
      const now = new Date();
      const currentQuarter = Math.floor(now.getMonth() / 3);
      const quarterEnd = new Date(now.getFullYear(), (currentQuarter + 1) * 3, 0);
      const nextDueDate = new Date(quarterEnd.getFullYear(), quarterEnd.getMonth() + 1, 28);
      
      setNextGSTDueDate(nextDueDate.toISOString().split('T')[0]);
      
      // Check for overdue returns
      const overdueReturns = returns.filter(r => 
        r.status === 'draft' && new Date(nextDueDate) < now
      );
      
      const warnings = [];
      const issues = [];
      
      if (overdueReturns.length > 0) {
        issues.push(`${overdueReturns.length} overdue tax return(s) require immediate attention`);
      }
      
      const daysUntilDue = Math.ceil((nextDueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysUntilDue <= 15 && daysUntilDue > 0) {
        warnings.push(`Next GST return due in ${daysUntilDue} days`);
      }
      
      // Check if user has transactions but no recent returns
      const lastReturn = returns.find(r => r.returnType === 'GST');
      if (!lastReturn || new Date(lastReturn.periodEnd) < new Date(now.getFullYear(), now.getMonth() - 6, 1)) {
        warnings.push('Consider reviewing expense categorization for tax optimization');
      }
      
      setComplianceStatus({
        isCompliant: issues.length === 0,
        issues,
        warnings
      });
      
    } catch (error) {
      console.error('Error fetching tax returns:', error);
      toast({
        title: "Error",
        description: "Failed to load tax returns",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user?.id) {
      fetchTaxReturns();
    }
  }, [user?.id]);

  const handleCreateGSTReturn = () => {
    setShowGSTWizard(true);
  };

  const handleGSTWizardComplete = async (returnData: GSTReturnData) => {
    if (!user?.id) return;

    try {
      toast({
        title: 'Saving GST Return',
        description: 'Creating a draft from your invoices, expenses, and reconciliations...',
      });

      const irdReturnData = await taxCalculationService.generateIRDGSTReturn(
        user.id,
        returnData.returnPeriod.startDate,
        returnData.returnPeriod.endDate
      );

      const netGst =
        returnData.salesData.gstOnSales -
        (returnData.purchaseData.gstOnPurchases + returnData.purchaseData.gstOnCapitalGoods) -
        (returnData.adjustments.badDebtAdjustments +
          returnData.adjustments.creditNoteAdjustments +
          returnData.adjustments.otherAdjustments);

      const newReturnData: Omit<TaxReturn, 'id' | 'createdAt' | 'updatedAt'> = {
        userId: user.id,
        periodStart: returnData.returnPeriod.startDate,
        periodEnd: returnData.returnPeriod.endDate,
        returnType: 'GST',
        totalSales: returnData.salesData.totalSales,
        totalPurchases: returnData.purchaseData.totalPurchases,
        gstOnSales: returnData.salesData.gstOnSales,
        gstOnPurchases: returnData.purchaseData.gstOnPurchases + returnData.purchaseData.gstOnCapitalGoods,
        netGst: Math.round(netGst * 100) / 100,
        status: 'draft',
        returnData: {
          ...irdReturnData,
          gstReturn: {
            salesDetails: {
              standardRated: irdReturnData.gstReturn?.salesDetails.standardRated ?? returnData.salesData.totalSales,
              zeroRated: returnData.salesData.zeroRatedSales,
              exempt: returnData.salesData.exemptSales,
              totalSales: returnData.salesData.totalSales,
              gstOnSales: returnData.salesData.gstOnSales,
            },
            purchaseDetails: {
              standardRated: irdReturnData.gstReturn?.purchaseDetails.standardRated ?? returnData.purchaseData.totalPurchases,
              capitalGoods: returnData.purchaseData.capitalGoods,
              totalPurchases: returnData.purchaseData.totalPurchases,
              gstOnPurchases: returnData.purchaseData.gstOnPurchases + returnData.purchaseData.gstOnCapitalGoods,
            },
            adjustments: {
              badDebts: returnData.adjustments.badDebtAdjustments,
              otherAdjustments:
                returnData.adjustments.creditNoteAdjustments + returnData.adjustments.otherAdjustments,
            },
          },
          reconciliation: returnData.reconciliation,
        },
      };

      const createdReturn = await supabaseDataService.createTaxReturn(newReturnData);
      setTaxReturns((prev) => [createdReturn, ...prev]);
      setShowGSTWizard(false);

      toast({
        title: 'GST return saved',
        description: `Draft created with $${Math.abs(newReturnData.netGst).toFixed(2)} ${newReturnData.netGst >= 0 ? 'owing' : 'refund'}`,
      });
    } catch (error) {
      console.error('Error creating GST return:', error);
      toast({
        title: 'Error',
        description: 'Failed to save GST return. Please check your transaction data.',
        variant: 'destructive',
      });
    }
  };

  const handleCreateIncomeReturn = async (period: { start: string; end: string }) => {
    if (!user?.id) return;
    
    try {
      toast({
        title: "Creating Income Tax Return",
        description: "Calculating annual income and deductions..."
      });

      // Calculate income tax data from real transactions
      const [invoices, expenses] = await Promise.all([
        supabaseDataService.getInvoicesByPeriod(user.id, period.start, period.end),
        supabaseDataService.getExpensesByPeriod(user.id, period.start, period.end)
      ]);

      const totalSales = invoices.reduce((sum, invoice) => sum + invoice.total, 0);
      const totalPurchases = expenses.reduce((sum, expense) => sum + expense.amount, 0);
      const taxableIncome = Math.max(0, totalSales - totalPurchases);
      
      // Simplified NZ tax calculation (actual rates are progressive)
      const taxDue = taxableIncome > 14000 ? 
        (taxableIncome - 14000) * 0.175 + // 17.5% for income over $14,000
        (taxableIncome > 48000 ? (taxableIncome - 48000) * 0.135 : 0) // Additional 13.5% for income over $48,000
        : 0;

      const newReturnData: Omit<TaxReturn, 'id' | 'createdAt' | 'updatedAt'> = {
        userId: user.id,
        periodStart: period.start,
        periodEnd: period.end,
        returnType: 'Income_Tax',
        totalSales,
        totalPurchases,
        gstOnSales: 0,
        gstOnPurchases: 0,
        netGst: 0,
        status: 'draft',
        returnData: {
          incomeTax: {
            grossIncome: totalSales,
            allowableDeductions: totalPurchases,
            taxableIncome,
            taxDue: Math.round(taxDue * 100) / 100,
            provisionalTax: Math.round(taxDue * 0.333 * 100) / 100 // Roughly 1/3 for provisional tax
          }
        }
      };

      const createdReturn = await supabaseDataService.createTaxReturn(newReturnData);
      setTaxReturns(prev => [createdReturn, ...prev]);
      
      toast({
        title: "Success",
        description: `Income tax return created. Tax due: $${newReturnData.returnData?.incomeTax?.taxDue.toFixed(2)}`
      });
    } catch (error) {
      console.error('Error creating income tax return:', error);
      toast({
        title: "Error",
        description: "Failed to create income tax return",
        variant: "destructive"
      });
    }
  };

  const handleSubmitReturn = async (returnId: string, irdReference: string) => {
    try {
      toast({
        title: 'Recording filed return',
        description: 'Saving your myIR confirmation reference...',
      });

      const updatedReturn = await supabaseDataService.fileTaxReturn(returnId, irdReference);
      
      setTaxReturns(prev => 
        prev.map(ret => ret.id === returnId ? updatedReturn : ret)
      );
      
      toast({
        title: 'GST return recorded as filed',
        description: `IRD confirmation reference: ${irdReference}`,
      });
    } catch (error) {
      console.error('Error recording filed tax return:', error);
      toast({
        title: 'Could not record filed return',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleExportReturn = async (returnId: string, format: string) => {
    try {
      const taxReturn = taxReturns.find((row) => row.id === returnId);
      if (!taxReturn) throw new Error('Tax return not found');
      if (format !== 'pdf') throw new Error(`Unsupported export format: ${format}`);
      await downloadGstReturnPdf(taxReturn);

      toast({
        title: 'GST return downloaded',
        description: 'Your PDF preparation and filing record is ready.',
      });
    } catch (error) {
      toast({
        title: 'Could not download GST return',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="flex gap-3">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-32" />
          </div>
        </div>

        {/* Compliance Status Skeleton */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <Skeleton className="h-6 w-40" />
              <div className="flex items-center gap-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-2 w-24" />
              </div>
            </div>
            <Skeleton className="h-16 w-full" />
          </CardContent>
        </Card>

        {/* Metrics Cards Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-10 h-10 rounded-lg" />
                  <div>
                    <Skeleton className="h-4 w-20 mb-1" />
                    <Skeleton className="h-6 w-12" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Table Skeleton */}
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-6 w-32 mb-4" />
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="IRD Tax Reporting"
        description="Prepare GST returns against bank reconciliations, then file with IRD"
        onBack={showGSTWizard ? () => setShowGSTWizard(false) : undefined}
      />

      {showGSTWizard ? (
        <GSTReturnWizard
          onComplete={handleGSTWizardComplete}
          onCancel={() => setShowGSTWizard(false)}
        />
      ) : (
        <IRDReportingDashboard
          taxReturns={taxReturns}
          nextGSTDueDate={nextGSTDueDate}
          complianceStatus={complianceStatus}
          onCreateGSTReturn={handleCreateGSTReturn}
          onCreateIncomeReturn={handleCreateIncomeReturn}
          onSubmitReturn={handleSubmitReturn}
          onExportReturn={handleExportReturn}
          isLoading={isLoading}
        />
      )}
    </div>
  );
}
