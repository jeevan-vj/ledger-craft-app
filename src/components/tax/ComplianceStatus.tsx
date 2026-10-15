import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  Shield, 
  ShieldCheck, 
  ShieldAlert, 
  ShieldX, 
  AlertTriangle, 
  CheckCircle2, 
  Info,
  ExternalLink 
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabaseDataService } from '@/services/supabaseDataService';
import { readMoney } from '@/features/tax/api/periodRows';

interface ComplianceStatusProps {
  score: number;
  userId: string;
  className?: string;
}

interface ComplianceIssue {
  type: 'error' | 'warning' | 'info';
  title: string;
  description: string;
  action?: string;
}

export const ComplianceStatus: React.FC<ComplianceStatusProps> = ({
  score,
  userId,
  className
}) => {
  const [issues, setIssues] = useState<ComplianceIssue[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (userId) {
      checkComplianceIssues();
    }
  }, [userId, score]);

  const checkComplianceIssues = async () => {
    setLoading(true);
    try {
      const detectedIssues: ComplianceIssue[] = [];

      // Get current quarter data for analysis
      const now = new Date();
      const quarter = Math.floor(now.getMonth() / 3) + 1;
      const year = now.getFullYear();
      const startMonth = (quarter - 1) * 3;
      const endMonth = startMonth + 2;
      
      const periodStart = new Date(year, startMonth, 1).toISOString().split('T')[0];
      const periodEnd = new Date(year, endMonth + 1, 0).toISOString().split('T')[0];

      // Fetch data for compliance checking
      const [invoices, expenses, taxConfig] = await Promise.all([
        supabaseDataService.getInvoicesByPeriod(userId, periodStart, periodEnd),
        supabaseDataService.getExpensesByPeriod(userId, periodStart, periodEnd),
        supabaseDataService.getTaxConfiguration(userId)
      ]);

      // Check for missing tax configuration
      if (!taxConfig) {
        detectedIssues.push({
          type: 'error',
          title: 'No Tax Configuration',
          description: 'Set up your GST configuration to ensure accurate tax calculations.',
          action: 'Configure Tax Settings'
        });
      }

      // Check for invoices without tax calculations
      const invoicesWithoutTax = invoices.filter(inv =>
        inv.total > 0 && readMoney(inv, 'taxAmount', 'tax_amount') === 0
      );
      
      if (invoicesWithoutTax.length > 0) {
        detectedIssues.push({
          type: 'warning',
          title: `${invoicesWithoutTax.length} Invoices Missing GST`,
          description: 'Some invoices may not have GST calculations applied.',
          action: 'Review Invoices'
        });
      }

      // Check for expenses without tax information
      const expensesWithoutTax = expenses.filter(exp =>
        exp.amount > 0 && exp.is_claimable && readMoney(exp, 'taxAmount', 'tax_amount') === 0
      );
      
      if (expensesWithoutTax.length > 0) {
        detectedIssues.push({
          type: 'warning',
          title: `${expensesWithoutTax.length} Expenses Missing GST`,
          description: 'Some claimable expenses are missing GST information.',
          action: 'Review Expenses'
        });
      }

      // Check for GST registration threshold
      const annualRevenue = await calculateAnnualRevenue(userId);
      if (annualRevenue > 60000 && !taxConfig?.isActive) {
        detectedIssues.push({
          type: 'error',
          title: 'GST Registration Required',
          description: 'Your annual turnover exceeds $60,000. GST registration is mandatory.',
          action: 'Register for GST'
        });
      }

      // Check for approaching GST registration threshold
      if (annualRevenue > 50000 && annualRevenue <= 60000) {
        detectedIssues.push({
          type: 'info',
          title: 'Approaching GST Threshold',
          description: 'Monitor your turnover. GST registration becomes mandatory at $60k annually.',
          action: 'Monitor Turnover'
        });
      }

      // Check for overdue returns
      const lastReturnDate = await getLastGSTReturnDate(userId);
      const daysSinceLastReturn = lastReturnDate ? 
        Math.floor((now.getTime() - new Date(lastReturnDate).getTime()) / (1000 * 60 * 60 * 24)) : 
        null;

      if (daysSinceLastReturn && daysSinceLastReturn > 90) {
        detectedIssues.push({
          type: 'error',
          title: 'Overdue GST Return',
          description: 'Your GST return appears to be overdue. Submit immediately to avoid penalties.',
          action: 'Submit GST Return'
        });
      }

      // Check for large cash transactions (AML compliance)
      const largeCashTransactions = invoices.filter(inv => 
        inv.total > 10000 && inv.paymentStatus === 'paid'
      ).length;

      if (largeCashTransactions > 0) {
        detectedIssues.push({
          type: 'info',
          title: 'Large Transactions Detected',
          description: 'Large transactions may require additional reporting for AML compliance.',
          action: 'Review AML Requirements'
        });
      }

      setIssues(detectedIssues);
    } catch (error) {
      console.error('Error checking compliance:', error);
    } finally {
      setLoading(false);
    }
  };

  const getScoreLevel = () => {
    if (score >= 90) return 'excellent';
    if (score >= 75) return 'good';
    if (score >= 60) return 'fair';
    return 'poor';
  };

  const getScoreColor = () => {
    const level = getScoreLevel();
    switch (level) {
      case 'excellent': return 'text-green-600';
      case 'good': return 'text-blue-600';
      case 'fair': return 'text-amber-600';
      default: return 'text-red-600';
    }
  };

  const getScoreIcon = () => {
    const level = getScoreLevel();
    switch (level) {
      case 'excellent': return <ShieldCheck className="h-5 w-5 text-green-600" />;
      case 'good': return <Shield className="h-5 w-5 text-blue-600" />;
      case 'fair': return <ShieldAlert className="h-5 w-5 text-amber-600" />;
      default: return <ShieldX className="h-5 w-5 text-red-600" />;
    }
  };

  const getScoreBadge = () => {
    const level = getScoreLevel();
    switch (level) {
      case 'excellent': return { variant: 'success' as const, text: 'EXCELLENT' };
      case 'good': return { variant: 'default' as const, text: 'GOOD' };
      case 'fair': return { variant: 'warning' as const, text: 'NEEDS ATTENTION' };
      default: return { variant: 'destructive' as const, text: 'ACTION REQUIRED' };
    }
  };

  const badge = getScoreBadge();
  const criticalIssues = issues.filter(issue => issue.type === 'error').length;
  const warnings = issues.filter(issue => issue.type === 'warning').length;

  return (
    <Card className={cn('compliance-status-card', className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Compliance Status</CardTitle>
        {getScoreIcon()}
      </CardHeader>
      
      <CardContent>
        <div className="space-y-3">
          {/* Score Display */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className={cn("text-2xl font-bold", getScoreColor())}>
                {score}%
              </span>
              <Badge variant={badge.variant} className="text-xs">
                {badge.text}
              </Badge>
            </div>
            
            <Progress value={score} className="h-2" />
            
            <div className="text-xs text-muted-foreground">
              Compliance Score
            </div>
          </div>

          {/* Issues Summary */}
          <div className="space-y-2">
            {criticalIssues > 0 && (
              <div className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm font-medium">
                  {criticalIssues} Critical Issue{criticalIssues > 1 ? 's' : ''}
                </span>
              </div>
            )}
            
            {warnings > 0 && (
              <div className="flex items-center gap-2 text-amber-600">
                <Info className="h-4 w-4" />
                <span className="text-sm font-medium">
                  {warnings} Warning{warnings > 1 ? 's' : ''}
                </span>
              </div>
            )}
            
            {issues.length === 0 && (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-sm font-medium">
                  No Issues Detected
                </span>
              </div>
            )}
          </div>

          {/* Top Issues */}
          {issues.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground uppercase">
                Top Issues:
              </div>
              {issues.slice(0, 2).map((issue, index) => (
                <div key={index} className="text-xs space-y-1">
                  <div className="flex items-center gap-1">
                    {issue.type === 'error' && <AlertTriangle className="h-3 w-3 text-red-500" />}
                    {issue.type === 'warning' && <Info className="h-3 w-3 text-amber-500" />}
                    {issue.type === 'info' && <Info className="h-3 w-3 text-blue-500" />}
                    <span className="font-medium">{issue.title}</span>
                  </div>
                  <p className="text-muted-foreground pl-4">
                    {issue.description}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Action Button */}
          <div className="pt-2">
            {issues.length > 0 ? (
              <Button size="sm" variant="outline" className="w-full">
                Fix Issues ({issues.length})
              </Button>
            ) : (
              <Button size="sm" variant="outline" className="w-full">
                View Full Report
                <ExternalLink className="h-3 w-3 ml-1" />
              </Button>
            )}
          </div>

          {/* Last Updated */}
          <div className="text-xs text-muted-foreground text-center border-t pt-2">
            Last checked: {new Date().toLocaleTimeString('en-NZ', { 
              hour: '2-digit', 
              minute: '2-digit' 
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// Helper functions
async function calculateAnnualRevenue(userId: string): Promise<number> {
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
  const yearEnd = new Date(now.getFullYear(), 11, 31).toISOString().split('T')[0];
  
  try {
    const invoices = await supabaseDataService.getInvoicesByPeriod(userId, yearStart, yearEnd);
    return invoices.reduce((sum, inv) => sum + inv.total, 0);
  } catch (error) {
    console.error('Error calculating annual revenue:', error);
    return 0;
  }
}

async function getLastGSTReturnDate(userId: string): Promise<string | null> {
  try {
    const taxReturns = await supabaseDataService.getTaxReturnsByUser(userId, 'GST', 1, 0);
    return taxReturns.length > 0 ? taxReturns[0].periodEnd : null;
  } catch (error) {
    console.error('Error getting last GST return date:', error);
    return null;
  }
}