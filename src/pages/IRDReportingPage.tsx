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
import { netGstAfterAdjustments } from '@/features/tax/gstPreparation';

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
        description: 'Creating an invoice-basis draft from posted invoices, supplier bills, expenses, and reconciliations...',
      });

      const irdReturnData = await taxCalculationService.generateIRDGSTReturn(
        user.id,
        returnData.returnPeriod.startDate,
        returnData.returnPeriod.endDate
      );

      const netGst = netGstAfterAdjustments(returnData.salesData.gstOnSales,
        returnData.purchaseData.gstOnPurchases,
        returnData.purchaseData.gstOnCapitalGoods,
        returnData.adjustments.badDebtAdjustments,
        returnData.adjustments.creditNoteAdjustments,
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
        netGst,
        status: 'draft',
        returnData: {
          ...irdReturnData,
          preparation: { basis: 'invoice', baseCurrency: 'NZD', dueDate: returnData.dueDate },
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

  const handleCreateIncomeReturn = () => {
    toast({
      title: 'Income tax calculation is not supported',
      description: 'Use the profit and loss report and general ledger to prepare records for your accountant. This app does not determine company or personal income-tax liabilities.',
    });
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
