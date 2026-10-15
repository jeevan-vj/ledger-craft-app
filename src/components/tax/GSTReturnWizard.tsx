import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FileText,
  Calculator,
  CheckCircle,
  AlertTriangle,
  Info,
  Calendar,
  DollarSign,
  Building2,
  ArrowRight,
  ArrowLeft,
  Send,
  Shield,
  Clock
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from "@/context/StableAuthContext";
import { supabaseDataService } from '@/services/supabaseDataService';
import { gstReconciliationService } from '@/services/gstReconciliationService';
import { readMoney } from '@/features/tax/api/periodRows';
import { GSTReconciliationPanel } from '@/components/tax/GSTReconciliationPanel';
import {
  GstPeriodReconciliation,
  toReconciliationSnapshot,
} from '@/utils/gstReconciliation';
import { GstReconciliationSnapshot } from '@/types/payment';
import { getQuarterPeriod } from '@/features/tax/gstPeriod';

export interface GSTReturnData {
  returnPeriod: {
    startDate: string;
    endDate: string;
    quarter: string;
    year: number;
  };
  salesData: {
    totalSales: number;
    gstOnSales: number;
    zeroRatedSales: number;
    exemptSales: number;
  };
  purchaseData: {
    totalPurchases: number;
    gstOnPurchases: number;
    capitalGoods: number;
    gstOnCapitalGoods: number;
  };
  adjustments: {
    badDebtAdjustments: number;
    creditNoteAdjustments: number;
    otherAdjustments: number;
    adjustmentNotes: string;
  };
  netGST: number;
  paymentDue: number;
  refundDue: number;
  dueDate: string;
  reconciliation?: GstReconciliationSnapshot;
  acknowledgedUnreconciled?: boolean;
}

interface GSTReturnWizardProps {
  initialData?: Partial<GSTReturnData>;
  onComplete: (returnData: GSTReturnData) => void;
  onCancel: () => void;
  className?: string;
}

interface ValidationError {
  field: string;
  message: string;
}

export const GSTReturnWizard: React.FC<GSTReturnWizardProps> = ({
  initialData,
  onComplete,
  onCancel,
  className
}) => {
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [reconLoading, setReconLoading] = useState(false);
  const [reconciliation, setReconciliation] = useState<GstPeriodReconciliation | null>(null);
  const [acknowledgedUnreconciled, setAcknowledgedUnreconciled] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  
  const [returnData, setReturnData] = useState<GSTReturnData>({
    returnPeriod: {
      startDate: '',
      endDate: '',
      quarter: '',
      year: new Date().getFullYear()
    },
    salesData: {
      totalSales: 0,
      gstOnSales: 0,
      zeroRatedSales: 0,
      exemptSales: 0
    },
    purchaseData: {
      totalPurchases: 0,
      gstOnPurchases: 0,
      capitalGoods: 0,
      gstOnCapitalGoods: 0
    },
    adjustments: {
      badDebtAdjustments: 0,
      creditNoteAdjustments: 0,
      otherAdjustments: 0,
      adjustmentNotes: ''
    },
    netGST: 0,
    paymentDue: 0,
    refundDue: 0,
    dueDate: '',
    ...initialData
  });

  const steps = [
    { number: 1, title: 'Return Period', description: 'Select the GST return period' },
    { number: 2, title: 'Sales & Output', description: 'Sales data and GST charged' },
    { number: 3, title: 'Purchases & Input', description: 'Purchase data and GST paid' },
    { number: 4, title: 'Adjustments', description: 'Bad debts and other adjustments' },
    { number: 5, title: 'Reconciliation', description: 'Bank recs and GST figure check' },
    { number: 6, title: 'Review & Save', description: 'Final review and save the draft' }
  ];

  const quarterOptions = [
    { value: 'Q1', label: 'Q1 (Jan-Mar)' },
    { value: 'Q2', label: 'Q2 (Apr-Jun)' },
    { value: 'Q3', label: 'Q3 (Jul-Sep)' },
    { value: 'Q4', label: 'Q4 (Oct-Dec)' }
  ];

  useEffect(() => {
    calculateNetGST();
  }, [returnData.salesData, returnData.purchaseData, returnData.adjustments]);

  useEffect(() => {
    if (currentStep !== 5 || !user?.id || !returnData.returnPeriod.startDate) return;

    let cancelled = false;
    const loadRecon = async () => {
      setReconLoading(true);
      try {
        const result = await gstReconciliationService.getPeriodReconciliation(
          user.id,
          {
            startDate: returnData.returnPeriod.startDate,
            endDate: returnData.returnPeriod.endDate,
          },
          {
            totalSales: returnData.salesData.totalSales,
            gstOnSales: returnData.salesData.gstOnSales,
            totalPurchases: returnData.purchaseData.totalPurchases,
            gstOnPurchases: returnData.purchaseData.gstOnPurchases + returnData.purchaseData.gstOnCapitalGoods,
          }
        );
        if (!cancelled) {
          setReconciliation(result);
        }
      } catch (error) {
        console.error('Error loading GST reconciliation:', error);
        if (!cancelled) {
          setReconciliation(null);
        }
      } finally {
        if (!cancelled) {
          setReconLoading(false);
        }
      }
    };

    loadRecon();
    return () => {
      cancelled = true;
    };
  }, [
    currentStep,
    user?.id,
    returnData.returnPeriod.startDate,
    returnData.returnPeriod.endDate,
    returnData.salesData.totalSales,
    returnData.salesData.gstOnSales,
    returnData.purchaseData.totalPurchases,
    returnData.purchaseData.gstOnPurchases,
    returnData.purchaseData.gstOnCapitalGoods,
  ]);

  const calculateNetGST = () => {
    const totalGSTCharged = returnData.salesData.gstOnSales;
    const totalGSTPaid = returnData.purchaseData.gstOnPurchases + returnData.purchaseData.gstOnCapitalGoods;
    const totalAdjustments = returnData.adjustments.badDebtAdjustments + 
                            returnData.adjustments.creditNoteAdjustments + 
                            returnData.adjustments.otherAdjustments;
    
    const netGST = totalGSTCharged - totalGSTPaid - totalAdjustments;
    
    setReturnData(prev => ({
      ...prev,
      netGST,
      paymentDue: netGST > 0 ? netGST : 0,
      refundDue: netGST < 0 ? Math.abs(netGST) : 0
    }));
  };

  const loadPeriodData = async (startDate: string, endDate: string) => {
    if (!user?.id) return;
    
    setLoading(true);
    try {
      const [invoices, expenses] = await Promise.all([
        supabaseDataService.getInvoicesByPeriod(user.id, startDate, endDate),
        supabaseDataService.getExpensesByPeriod(user.id, startDate, endDate)
      ]);

      const totalSales = invoices.reduce((sum, inv) => sum + readMoney(inv, 'total', 'total_amount'), 0);
      const gstOnSales = invoices.reduce((sum, inv) => sum + readMoney(inv, 'taxAmount', 'tax_amount', 'gstAmount'), 0);
      
      const totalPurchases = expenses.reduce((sum, exp) => sum + readMoney(exp, 'amount'), 0);
      const gstOnPurchases = expenses
        .filter(exp => (exp.is_claimable !== false) && !exp.is_capital_expense)
        .reduce((sum, exp) => sum + readMoney(exp, 'taxAmount', 'tax_amount'), 0);
      
      const capitalGoods = expenses
        .filter(exp => exp.is_capital_expense)
        .reduce((sum, exp) => sum + readMoney(exp, 'amount'), 0);
      const gstOnCapitalGoods = expenses
        .filter(exp => exp.is_capital_expense && (exp.is_claimable !== false))
        .reduce((sum, exp) => sum + readMoney(exp, 'taxAmount', 'tax_amount'), 0);

      setReturnData(prev => ({
        ...prev,
        salesData: {
          ...prev.salesData,
          totalSales,
          gstOnSales
        },
        purchaseData: {
          ...prev.purchaseData,
          totalPurchases,
          gstOnPurchases,
          capitalGoods,
          gstOnCapitalGoods
        }
      }));
    } catch (error) {
      console.error('Error loading period data:', error);
    } finally {
      setLoading(false);
    }
  };

  const updatePeriod = (year: number, quarter: string) => {
    const { startDate, endDate, dueDate } = getQuarterPeriod(year, quarter);
    const updatedPeriod = {
      startDate,
      endDate,
      quarter,
      year
    };

    setReturnData(prev => ({
      ...prev,
      returnPeriod: updatedPeriod,
      dueDate
    }));

    // Auto-load data for this period
    loadPeriodData(updatedPeriod.startDate, updatedPeriod.endDate);
  };

  const handleQuarterChange = (quarter: string) => {
    updatePeriod(returnData.returnPeriod.year, quarter);
  };

  const handleYearChange = (value: string) => {
    const year = Number.parseInt(value, 10);
    if (returnData.returnPeriod.quarter) {
      updatePeriod(year, returnData.returnPeriod.quarter);
      return;
    }
    setReturnData(prev => ({
      ...prev,
      returnPeriod: { ...prev.returnPeriod, year },
    }));
  };

  const validateStep = (step: number): boolean => {
    const errors: ValidationError[] = [];

    switch (step) {
      case 1:
        if (!returnData.returnPeriod.quarter) {
          errors.push({ field: 'quarter', message: 'Please select a quarter' });
        }
        if (!returnData.returnPeriod.year) {
          errors.push({ field: 'year', message: 'Please select a year' });
        }
        break;
      
      case 2:
        if (returnData.salesData.totalSales < 0) {
          errors.push({ field: 'totalSales', message: 'Total sales cannot be negative' });
        }
        if (returnData.salesData.gstOnSales < 0) {
          errors.push({ field: 'gstOnSales', message: 'GST on sales cannot be negative' });
        }
        break;
      
      case 3:
        if (returnData.purchaseData.totalPurchases < 0) {
          errors.push({ field: 'totalPurchases', message: 'Total purchases cannot be negative' });
        }
        if (returnData.purchaseData.gstOnPurchases < 0) {
          errors.push({ field: 'gstOnPurchases', message: 'GST on purchases cannot be negative' });
        }
        break;

      case 5:
        if (!returnData.returnPeriod.startDate) {
          errors.push({ field: 'period', message: 'Select a GST period before reconciling' });
        }
        if (reconciliation?.readiness === 'warning' && !acknowledgedUnreconciled) {
          errors.push({
            field: 'reconciliation',
            message: 'Confirm unmatched items before continuing',
          });
        }
        break;
    }

    setValidationErrors(errors);
    return errors.length === 0;
  };

  const nextStep = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, steps.length));
    }
  };

  const prevStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const handleSubmit = () => {
    if (validateStep(currentStep)) {
      onComplete({
        ...returnData,
        acknowledgedUnreconciled,
        reconciliation: reconciliation
          ? {
              ...toReconciliationSnapshot(reconciliation),
              acknowledgedAt: acknowledgedUnreconciled ? new Date().toISOString() : undefined,
            }
          : undefined,
      });
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label htmlFor="year">Tax Year</Label>
                <Select
                  value={returnData.returnPeriod.year.toString()}
                  onValueChange={handleYearChange}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 5 }, (_, i) => {
                      const year = new Date().getFullYear() - i;
                      return (
                        <SelectItem key={year} value={year.toString()}>
                          {year}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="quarter">Quarter</Label>
                <Select
                  value={returnData.returnPeriod.quarter}
                  onValueChange={handleQuarterChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select quarter" />
                  </SelectTrigger>
                  <SelectContent>
                    {quarterOptions.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {returnData.returnPeriod.startDate && (
              <Alert>
                <Calendar className="h-4 w-4" />
                <AlertDescription>
                  <strong>Return Period:</strong> {new Date(returnData.returnPeriod.startDate).toLocaleDateString('en-NZ')} to {new Date(returnData.returnPeriod.endDate).toLocaleDateString('en-NZ')}
                  <br />
                  <strong>Due Date:</strong> {new Date(returnData.dueDate).toLocaleDateString('en-NZ')}
                </AlertDescription>
              </Alert>
            )}

            {loading && (
              <Alert>
                <Clock className="h-4 w-4" />
                <AlertDescription>
                  Loading transaction data for the selected period...
                </AlertDescription>
              </Alert>
            )}
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label htmlFor="totalSales">Total Sales (including GST)</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="totalSales"
                    type="number"
                    step="0.01"
                    value={returnData.salesData.totalSales}
                    onChange={(e) => setReturnData(prev => ({
                      ...prev,
                      salesData: { ...prev.salesData, totalSales: parseFloat(e.target.value) || 0 }
                    }))}
                    className="pl-10"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="gstOnSales">GST on Sales</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="gstOnSales"
                    type="number"
                    step="0.01"
                    value={returnData.salesData.gstOnSales}
                    onChange={(e) => setReturnData(prev => ({
                      ...prev,
                      salesData: { ...prev.salesData, gstOnSales: parseFloat(e.target.value) || 0 }
                    }))}
                    className="pl-10"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="zeroRatedSales">Zero-rated Sales</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="zeroRatedSales"
                    type="number"
                    step="0.01"
                    value={returnData.salesData.zeroRatedSales}
                    onChange={(e) => setReturnData(prev => ({
                      ...prev,
                      salesData: { ...prev.salesData, zeroRatedSales: parseFloat(e.target.value) || 0 }
                    }))}
                    className="pl-10"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="exemptSales">GST Exempt Sales</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="exemptSales"
                    type="number"
                    step="0.01"
                    value={returnData.salesData.exemptSales}
                    onChange={(e) => setReturnData(prev => ({
                      ...prev,
                      salesData: { ...prev.salesData, exemptSales: parseFloat(e.target.value) || 0 }
                    }))}
                    className="pl-10"
                  />
                </div>
              </div>
            </div>

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                These values have been automatically calculated from your invoices for the selected period. 
                You can adjust them if needed before submitting.
              </AlertDescription>
            </Alert>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label htmlFor="totalPurchases">Total Purchases (including GST)</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="totalPurchases"
                    type="number"
                    step="0.01"
                    value={returnData.purchaseData.totalPurchases}
                    onChange={(e) => setReturnData(prev => ({
                      ...prev,
                      purchaseData: { ...prev.purchaseData, totalPurchases: parseFloat(e.target.value) || 0 }
                    }))}
                    className="pl-10"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="gstOnPurchases">GST on Purchases</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="gstOnPurchases"
                    type="number"
                    step="0.01"
                    value={returnData.purchaseData.gstOnPurchases}
                    onChange={(e) => setReturnData(prev => ({
                      ...prev,
                      purchaseData: { ...prev.purchaseData, gstOnPurchases: parseFloat(e.target.value) || 0 }
                    }))}
                    className="pl-10"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="capitalGoods">Capital Goods Purchases</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="capitalGoods"
                    type="number"
                    step="0.01"
                    value={returnData.purchaseData.capitalGoods}
                    onChange={(e) => setReturnData(prev => ({
                      ...prev,
                      purchaseData: { ...prev.purchaseData, capitalGoods: parseFloat(e.target.value) || 0 }
                    }))}
                    className="pl-10"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="gstOnCapitalGoods">GST on Capital Goods</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="gstOnCapitalGoods"
                    type="number"
                    step="0.01"
                    value={returnData.purchaseData.gstOnCapitalGoods}
                    onChange={(e) => setReturnData(prev => ({
                      ...prev,
                      purchaseData: { ...prev.purchaseData, gstOnCapitalGoods: parseFloat(e.target.value) || 0 }
                    }))}
                    className="pl-10"
                  />
                </div>
              </div>
            </div>

            <Alert>
              <Building2 className="h-4 w-4" />
              <AlertDescription>
                Capital goods are assets like equipment, machinery, or property used in your business.
                GST on capital goods purchases can be claimed separately.
              </AlertDescription>
            </Alert>
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <Label htmlFor="badDebtAdjustments">Bad Debt Adjustments</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="badDebtAdjustments"
                    type="number"
                    step="0.01"
                    value={returnData.adjustments.badDebtAdjustments}
                    onChange={(e) => setReturnData(prev => ({
                      ...prev,
                      adjustments: { ...prev.adjustments, badDebtAdjustments: parseFloat(e.target.value) || 0 }
                    }))}
                    className="pl-10"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="creditNoteAdjustments">Credit Note Adjustments</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="creditNoteAdjustments"
                    type="number"
                    step="0.01"
                    value={returnData.adjustments.creditNoteAdjustments}
                    onChange={(e) => setReturnData(prev => ({
                      ...prev,
                      adjustments: { ...prev.adjustments, creditNoteAdjustments: parseFloat(e.target.value) || 0 }
                    }))}
                    className="pl-10"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="otherAdjustments">Other Adjustments</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="otherAdjustments"
                    type="number"
                    step="0.01"
                    value={returnData.adjustments.otherAdjustments}
                    onChange={(e) => setReturnData(prev => ({
                      ...prev,
                      adjustments: { ...prev.adjustments, otherAdjustments: parseFloat(e.target.value) || 0 }
                    }))}
                    className="pl-10"
                  />
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="adjustmentNotes">Adjustment Notes</Label>
              <Textarea
                id="adjustmentNotes"
                value={returnData.adjustments.adjustmentNotes}
                onChange={(e) => setReturnData(prev => ({
                  ...prev,
                  adjustments: { ...prev.adjustments, adjustmentNotes: e.target.value }
                }))}
                placeholder="Provide details about any adjustments made"
                rows={4}
              />
            </div>

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Adjustments are typically rare. Only include adjustments if you have legitimate
                bad debts, credit notes, or other adjustments that affect your GST position.
              </AlertDescription>
            </Alert>
          </div>
        );

      case 5:
        return (
          <GSTReconciliationPanel
            reconciliation={reconciliation}
            loading={reconLoading}
            acknowledged={acknowledgedUnreconciled}
            onAcknowledgedChange={setAcknowledgedUnreconciled}
          />
        );

      case 6:
        return (
          <div className="space-y-6">
            {/* Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calculator className="h-5 w-5" />
                  GST Return Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <h4 className="font-medium">Sales & Output Tax</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>Total Sales:</span>
                        <span>${returnData.salesData.totalSales.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>GST on Sales:</span>
                        <span>${returnData.salesData.gstOnSales.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Zero-rated Sales:</span>
                        <span>${returnData.salesData.zeroRatedSales.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="font-medium">Purchases & Input Tax</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>Total Purchases:</span>
                        <span>${returnData.purchaseData.totalPurchases.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>GST on Purchases:</span>
                        <span>${returnData.purchaseData.gstOnPurchases.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>GST on Capital Goods:</span>
                        <span>${returnData.purchaseData.gstOnCapitalGoods.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <Separator className="my-4" />

                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Net GST Position:</span>
                    <span className={cn(
                      "text-lg font-bold",
                      returnData.netGST > 0 ? "text-red-600" : returnData.netGST < 0 ? "text-green-600" : "text-gray-600"
                    )}>
                      ${Math.abs(returnData.netGST).toFixed(2)}
                    </span>
                  </div>

                  {returnData.paymentDue > 0 && (
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        <strong>Payment Due:</strong> ${returnData.paymentDue.toFixed(2)}
                        <br />
                        <strong>Due Date:</strong> {new Date(returnData.dueDate).toLocaleDateString('en-NZ')}
                      </AlertDescription>
                    </Alert>
                  )}

                  {returnData.refundDue > 0 && (
                    <Alert>
                      <CheckCircle className="h-4 w-4" />
                      <AlertDescription>
                        <strong>Refund Expected:</strong> ${returnData.refundDue.toFixed(2)}
                        <br />
                        IRD will process your refund within 15 working days.
                      </AlertDescription>
                    </Alert>
                  )}

                  {reconciliation && (
                    <div className="rounded-2xl border border-border px-4 py-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium">Reconciliation</span>
                        <span className="text-muted-foreground">
                          {reconciliation.readiness === 'ready'
                            ? 'Bank recs complete, figures match'
                            : reconciliation.readiness === 'not_applicable'
                              ? 'No bank accounts to reconcile'
                              : `${reconciliation.issues.length} item${reconciliation.issues.length === 1 ? '' : 's'} noted`}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Alert>
              <Shield className="h-4 w-4" />
              <AlertDescription>
                Review these figures carefully, then save the draft. LedgerCraft does not send
                returns to IRD. File through myIR, then record the IRD confirmation reference here.
              </AlertDescription>
            </Alert>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className={cn('max-w-4xl mx-auto space-y-6', className)}>
      {/* Header */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            GST Return Wizard
            <Badge variant="outline" className="ml-auto">
              Step {currentStep} of {steps.length}
            </Badge>
          </CardTitle>
        </CardHeader>
      </Card>

      {/* Progress */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <Progress value={(currentStep / steps.length) * 100} className="w-full" />
            
            <div className="flex justify-between">
              {steps.map((step) => (
                <div
                  key={step.number}
                  className={cn(
                    "flex flex-col items-center text-center",
                    currentStep >= step.number ? "text-blue-600" : "text-gray-400"
                  )}
                >
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium mb-2",
                    currentStep >= step.number ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600"
                  )}>
                    {currentStep > step.number ? <CheckCircle className="h-4 w-4" /> : step.number}
                  </div>
                  <div className="text-xs font-medium">{step.title}</div>
                  <div className="text-xs text-gray-500 hidden md:block">{step.description}</div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <ul className="list-disc list-inside space-y-1">
              {validationErrors.map((error, index) => (
                <li key={index}>{error.message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Step Content */}
      <Card>
        <CardHeader>
          <CardTitle>{steps[currentStep - 1].title}</CardTitle>
        </CardHeader>
        <CardContent>
          {renderStepContent()}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between">
        <div>
          {currentStep > 1 && (
            <Button variant="outline" onClick={prevStep}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Previous
            </Button>
          )}
        </div>

        <div className="flex gap-3">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          
          {currentStep < steps.length ? (
            <Button onClick={nextStep}>
              Next
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} className="flex items-center gap-2">
              <Send className="h-4 w-4" />
              Save GST Return
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
