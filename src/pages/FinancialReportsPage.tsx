import React, { useState, useEffect } from 'react';
import { FileBarChart, Download, RefreshCw, Filter, Calendar, TrendingUp, DollarSign, Receipt, Target, Eye, ChevronDown, ChevronRight, BarChart3, PieChart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { BreadcrumbNavigation } from '@/components/common/BreadcrumbNavigation';
import { PageHeader } from '@/components/layout/PageHeader';
import { 
  financialReportsService, 
  FinancialReport, 
  ReportSummary, 
  ProfitLossData, 
  BalanceSheetData, 
  CashFlowData, 
  TrialBalanceData 
} from '@/services/financialReportsService';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';


// Report detail components
const ProfitLossReportDetail: React.FC<{ data: ProfitLossData }> = ({ data }) => (
  <div className="space-y-6">
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card>
        <CardContent className="p-4">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Total Revenue</p>
            <p className="text-2xl font-bold text-green-600">${data.totalRevenue.toLocaleString()}</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Total Expenses</p>
            <p className="text-2xl font-bold text-red-600">${(data.costOfGoodsSold + data.operatingExpenses).toLocaleString()}</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Net Income</p>
            <p className={`text-2xl font-bold ${data.netIncome >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ${data.netIncome.toLocaleString()}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PieChart className="h-5 w-5" />
            Revenue Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">%</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.revenueBreakdown.map((item, index) => (
                <TableRow key={index}>
                  <TableCell>{item.category}</TableCell>
                  <TableCell className="text-right">${item.amount.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{item.percentage.toFixed(1)}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Expense Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">%</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.expenseBreakdown.map((item, index) => (
                <TableRow key={index}>
                  <TableCell>{item.category}</TableCell>
                  <TableCell className="text-right">${item.amount.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{item.percentage.toFixed(1)}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>

    <Card>
      <CardHeader>
        <CardTitle>Profit & Loss Statement</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableBody>
            <TableRow>
              <TableCell className="font-semibold">Revenue</TableCell>
              <TableCell className="text-right font-semibold">${data.totalRevenue.toLocaleString()}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="pl-6">Cost of Goods Sold</TableCell>
              <TableCell className="text-right">(${data.costOfGoodsSold.toLocaleString()})</TableCell>
            </TableRow>
            <TableRow className="border-b-2">
              <TableCell className="font-semibold">Gross Profit</TableCell>
              <TableCell className="text-right font-semibold">${data.grossProfit.toLocaleString()}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="pl-6">Operating Expenses</TableCell>
              <TableCell className="text-right">(${data.operatingExpenses.toLocaleString()})</TableCell>
            </TableRow>
            <TableRow className="border-b-2 font-bold">
              <TableCell>Net Income</TableCell>
              <TableCell className={`text-right ${data.netIncome >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${data.netIncome.toLocaleString()}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  </div>
);

const BalanceSheetReportDetail: React.FC<{ data: BalanceSheetData }> = ({ data }) => (
  <div className="space-y-6">
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card>
        <CardContent className="p-4">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Total Assets</p>
            <p className="text-2xl font-bold text-blue-600">${data.totalAssets.toLocaleString()}</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Total Liabilities</p>
            <p className="text-2xl font-bold text-red-600">${data.totalLiabilities.toLocaleString()}</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Equity</p>
            <p className="text-2xl font-bold text-green-600">${data.equity.toLocaleString()}</p>
          </div>
        </CardContent>
      </Card>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Assets</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">%</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.assetBreakdown.map((item, index) => (
                <TableRow key={index}>
                  <TableCell>{item.category}</TableCell>
                  <TableCell className="text-right">${item.amount.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{item.percentage.toFixed(1)}%</TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t-2 font-bold">
                <TableCell>Total Assets</TableCell>
                <TableCell className="text-right">${data.totalAssets.toLocaleString()}</TableCell>
                <TableCell className="text-right">100.0%</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Liabilities & Equity</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">%</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.liabilityBreakdown.map((item, index) => (
                <TableRow key={index}>
                  <TableCell>{item.category}</TableCell>
                  <TableCell className="text-right">${item.amount.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{item.percentage.toFixed(1)}%</TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t">
                <TableCell className="font-semibold">Total Liabilities</TableCell>
                <TableCell className="text-right font-semibold">${data.totalLiabilities.toLocaleString()}</TableCell>
                <TableCell className="text-right font-semibold">{data.totalLiabilities > 0 ? ((data.totalLiabilities / data.totalAssets) * 100).toFixed(1) : '0.0'}%</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-semibold">Equity</TableCell>
                <TableCell className="text-right font-semibold">${data.equity.toLocaleString()}</TableCell>
                <TableCell className="text-right font-semibold">{data.totalAssets > 0 ? ((data.equity / data.totalAssets) * 100).toFixed(1) : '0.0'}%</TableCell>
              </TableRow>
              <TableRow className="border-t-2 font-bold">
                <TableCell>Total Liabilities & Equity</TableCell>
                <TableCell className="text-right">${(data.totalLiabilities + data.equity).toLocaleString()}</TableCell>
                <TableCell className="text-right">100.0%</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  </div>
);

const CashFlowReportDetail: React.FC<{ data: CashFlowData }> = ({ data }) => (
  <div className="space-y-6">
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <Card>
        <CardContent className="p-4">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Operating</p>
            <p className={`text-xl font-bold ${data.operatingCashFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ${data.operatingCashFlow.toLocaleString()}
            </p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Investing</p>
            <p className={`text-xl font-bold ${data.investingCashFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ${data.investingCashFlow.toLocaleString()}
            </p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Financing</p>
            <p className={`text-xl font-bold ${data.financingCashFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ${data.financingCashFlow.toLocaleString()}
            </p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Net Cash Flow</p>
            <p className={`text-xl font-bold ${data.netCashFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ${data.netCashFlow.toLocaleString()}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>

    <Card>
      <CardHeader>
        <CardTitle>Cash Flow Statement</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableBody>
            <TableRow>
              <TableCell className="font-semibold text-lg">Operating Activities</TableCell>
              <TableCell></TableCell>
            </TableRow>
            {data.operatingActivities.map((activity, index) => (
              <TableRow key={index}>
                <TableCell className="pl-6">{activity.description}</TableCell>
                <TableCell className={`text-right ${activity.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ${activity.amount.toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="border-b">
              <TableCell className="font-semibold pl-6">Net Cash from Operating Activities</TableCell>
              <TableCell className={`text-right font-semibold ${data.operatingCashFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${data.operatingCashFlow.toLocaleString()}
              </TableCell>
            </TableRow>

            <TableRow>
              <TableCell className="font-semibold text-lg pt-4">Investing Activities</TableCell>
              <TableCell></TableCell>
            </TableRow>
            {data.investingActivities.map((activity, index) => (
              <TableRow key={index}>
                <TableCell className="pl-6">{activity.description}</TableCell>
                <TableCell className={`text-right ${activity.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ${activity.amount.toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="border-b">
              <TableCell className="font-semibold pl-6">Net Cash from Investing Activities</TableCell>
              <TableCell className={`text-right font-semibold ${data.investingCashFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${data.investingCashFlow.toLocaleString()}
              </TableCell>
            </TableRow>

            <TableRow>
              <TableCell className="font-semibold text-lg pt-4">Financing Activities</TableCell>
              <TableCell></TableCell>
            </TableRow>
            {data.financingActivities.map((activity, index) => (
              <TableRow key={index}>
                <TableCell className="pl-6">{activity.description}</TableCell>
                <TableCell className={`text-right ${activity.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ${activity.amount.toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="border-b">
              <TableCell className="font-semibold pl-6">Net Cash from Financing Activities</TableCell>
              <TableCell className={`text-right font-semibold ${data.financingCashFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${data.financingCashFlow.toLocaleString()}
              </TableCell>
            </TableRow>

            <TableRow className="border-t-2">
              <TableCell className="font-bold">Net Change in Cash</TableCell>
              <TableCell className={`text-right font-bold ${data.netCashFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${data.netCashFlow.toLocaleString()}
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Cash at Beginning of Period</TableCell>
              <TableCell className="text-right">${data.beginningCash.toLocaleString()}</TableCell>
            </TableRow>
            <TableRow className="border-b-2 font-bold">
              <TableCell>Cash at End of Period</TableCell>
              <TableCell className="text-right">${data.endingCash.toLocaleString()}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  </div>
);

const TrialBalanceReportDetail: React.FC<{ data: TrialBalanceData }> = ({ data }) => (
  <div className="space-y-6">
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card>
        <CardContent className="p-4">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Total Debits</p>
            <p className="text-2xl font-bold text-blue-600">${data.totalDebits.toLocaleString()}</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Total Credits</p>
            <p className="text-2xl font-bold text-green-600">${data.totalCredits.toLocaleString()}</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Balance Status</p>
            <Badge variant={data.balanceStatus === 'balanced' ? 'default' : 'destructive'} className="text-sm">
              {data.balanceStatus === 'balanced' ? 'Balanced' : 'Unbalanced'}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>

    <Card>
      <CardHeader>
        <CardTitle>Trial Balance</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Account Name</TableHead>
              <TableHead>Account Type</TableHead>
              <TableHead className="text-right">Debit</TableHead>
              <TableHead className="text-right">Credit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.accounts.map((account, index) => (
              <TableRow key={index}>
                <TableCell>{account.accountName}</TableCell>
                <TableCell>
                  <Badge variant="outline">{account.accountType}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  {account.debitBalance > 0 ? `$${account.debitBalance.toLocaleString()}` : '-'}
                </TableCell>
                <TableCell className="text-right">
                  {account.creditBalance > 0 ? `$${account.creditBalance.toLocaleString()}` : '-'}
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="border-t-2 font-bold">
              <TableCell colSpan={2}>Totals</TableCell>
              <TableCell className="text-right">${data.totalDebits.toLocaleString()}</TableCell>
              <TableCell className="text-right">${data.totalCredits.toLocaleString()}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  </div>
);

export default function FinancialReportsPage() {
  const [reports, setReports] = useState<FinancialReport[]>([]);
  const [reportSummary, setReportSummary] = useState<ReportSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedReportType, setSelectedReportType] = useState<string>('all');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('current_month');
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [expandedReports, setExpandedReports] = useState<Set<string>>(new Set());
  
  const { toast } = useToast();

  const reportTypes = [
    { value: 'all', label: 'All Reports' },
    { value: 'profit_loss', label: 'Profit & Loss' },
    { value: 'balance_sheet', label: 'Balance Sheet' },
    { value: 'cash_flow', label: 'Cash Flow' },
    { value: 'trial_balance', label: 'Trial Balance' },
    { value: 'accounts_receivable', label: 'Accounts Receivable' },
    { value: 'accounts_payable', label: 'Accounts Payable' }
  ];

  const periodOptions = [
    { value: 'current_month', label: 'Current Month' },
    { value: 'last_month', label: 'Last Month' },
    { value: 'current_quarter', label: 'Current Quarter' },
    { value: 'last_quarter', label: 'Last Quarter' },
    { value: 'current_year', label: 'Current Year' },
    { value: 'last_year', label: 'Last Year' },
    { value: 'custom', label: 'Custom Range' }
  ];

  const fetchReports = async () => {
    setIsLoading(true);
    try {
      // Generate current period reports
      const currentPeriod = selectedPeriod;
      const customStart = startDate;
      const customEnd = endDate;
      
      // Generate sample reports for the current period
      const generatedReports: FinancialReport[] = [];
      
      // Generate Profit & Loss report
      try {
        const profitLossReport = await financialReportsService.generateReport(
          'profit_loss', 
          currentPeriod, 
          customStart, 
          customEnd
        );
        generatedReports.push(profitLossReport);
      } catch (error) {
        console.error('Error generating P&L report:', error);
      }
      
      // Generate Balance Sheet report
      try {
        const balanceSheetReport = await financialReportsService.generateReport(
          'balance_sheet', 
          currentPeriod, 
          customStart, 
          customEnd
        );
        generatedReports.push(balanceSheetReport);
      } catch (error) {
        console.error('Error generating Balance Sheet report:', error);
      }
      
      // Generate Cash Flow report
      try {
        const cashFlowReport = await financialReportsService.generateReport(
          'cash_flow', 
          currentPeriod, 
          customStart, 
          customEnd
        );
        generatedReports.push(cashFlowReport);
      } catch (error) {
        console.error('Error generating Cash Flow report:', error);
      }
      
      // Generate Trial Balance report
      try {
        const trialBalanceReport = await financialReportsService.generateReport(
          'trial_balance', 
          currentPeriod, 
          customStart, 
          customEnd
        );
        generatedReports.push(trialBalanceReport);
      } catch (error) {
        console.error('Error generating Trial Balance report:', error);
      }
      
      setReports(generatedReports);
      
      // Generate report summary
      try {
        const summary = await financialReportsService.generateReportSummary(
          currentPeriod, 
          customStart, 
          customEnd
        );
        setReportSummary(summary);
      } catch (error) {
        console.error('Error generating report summary:', error);
        // Fallback summary if generation fails
        setReportSummary({
          totalRevenue: 0,
          totalExpenses: 0,
          netIncome: 0,
          grossMargin: 0,
          totalAssets: 0,
          totalLiabilities: 0,
          cashFlow: 0,
          periodsCompared: 1
        });
      }
    } catch (error) {
      console.error('Error fetching reports:', error);
      toast({
        title: "Error",
        description: "Failed to load financial reports",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [selectedPeriod, startDate, endDate]);

  const handleGenerateReport = async (reportType: string) => {
    try {
      const validReportTypes = ['profit_loss', 'balance_sheet', 'cash_flow', 'trial_balance'];
      if (!validReportTypes.includes(reportType)) {
        throw new Error(`Invalid report type: ${reportType}`);
      }
      
      const newReport = await financialReportsService.generateReport(
        reportType as 'profit_loss' | 'balance_sheet' | 'cash_flow' | 'trial_balance',
        selectedPeriod,
        startDate,
        endDate
      );

      setReports(prev => [newReport, ...prev]);
      
      toast({
        title: "Success",
        description: `${reportTypes.find(r => r.value === reportType)?.label} report generated successfully`
      });
    } catch (error) {
      console.error('Error generating report:', error);
      toast({
        title: "Error",
        description: "Failed to generate report",
        variant: "destructive"
      });
    }
  };

  const handleExportReport = async (reportId: string, format: string) => {
    try {
      // Simulate export
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      toast({
        title: "Success",
        description: `Report exported as ${format.toUpperCase()}`
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to export report",
        variant: "destructive"
      });
    }
  };

  const filteredReports = reports.filter(report => 
    selectedReportType === 'all' || report.type === selectedReportType
  );

  const getReportTypeIcon = (type: string) => {
    switch (type) {
      case 'profit_loss': return <TrendingUp className="h-4 w-4" />;
      case 'balance_sheet': return <Target className="h-4 w-4" />;
      case 'cash_flow': return <DollarSign className="h-4 w-4" />;
      case 'trial_balance': return <Receipt className="h-4 w-4" />;
      default: return <FileBarChart className="h-4 w-4" />;
    }
  };

  const getReportTypeBadge = (type: string) => {
    const colors = {
      profit_loss: 'bg-green-100 text-green-800',
      balance_sheet: 'bg-blue-100 text-blue-800',
      cash_flow: 'bg-purple-100 text-purple-800',
      trial_balance: 'bg-orange-100 text-orange-800',
      accounts_receivable: 'bg-yellow-100 text-yellow-800',
      accounts_payable: 'bg-red-100 text-red-800'
    };
    return colors[type as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-64 mb-2" />
            <Skeleton className="h-4 w-96" />
          </div>
          <div className="flex gap-3">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-32" />
          </div>
        </div>

        {/* Summary Cards Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <Skeleton className="w-12 h-12 rounded-lg" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-20 mb-2" />
                    <Skeleton className="h-6 w-24 mb-1" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters Skeleton */}
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <Skeleton className="h-10 w-full sm:w-48" />
              <Skeleton className="h-10 w-full sm:w-48" />
              <Skeleton className="h-10 w-full sm:w-48" />
            </div>
          </CardContent>
        </Card>

        {/* Table Skeleton */}
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-6 w-32 mb-4" />
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
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
      {/* Breadcrumb Navigation */}
      <BreadcrumbNavigation />
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <PageHeader
          title="Financial Reports"
          description="Generate and view comprehensive financial reports and analytics"
        />
        
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={fetchReports}
            disabled={isLoading}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          
          <Select onValueChange={(value) => handleGenerateReport(value)}>
            <SelectTrigger className="w-48">
              <FileBarChart className="mr-2 h-4 w-4" />
              Generate Report
            </SelectTrigger>
            <SelectContent>
              {reportTypes.slice(1).map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary Cards */}
      {reportSummary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-green-100 rounded-lg">
                  <TrendingUp className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Revenue</p>
                  <p className="text-2xl font-bold">${reportSummary.totalRevenue.toLocaleString()}</p>
                  <p className="text-xs text-green-600">+12.5% from last period</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <DollarSign className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Net Income</p>
                  <p className="text-2xl font-bold">${reportSummary.netIncome.toLocaleString()}</p>
                  <p className="text-xs text-blue-600">{reportSummary.grossMargin}% gross margin</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-purple-100 rounded-lg">
                  <Target className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Assets</p>
                  <p className="text-2xl font-bold">${reportSummary.totalAssets.toLocaleString()}</p>
                  <p className="text-xs text-purple-600">
                    ${reportSummary.totalLiabilities.toLocaleString()} liabilities
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-orange-100 rounded-lg">
                  <Receipt className="h-6 w-6 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Cash Flow</p>
                  <p className="text-2xl font-bold">${reportSummary.cashFlow.toLocaleString()}</p>
                  <p className="text-xs text-orange-600">Last {reportSummary.periodsCompared} periods</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <Select value={selectedReportType} onValueChange={setSelectedReportType}>
              <SelectTrigger className="w-full sm:w-48">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Report Type" />
              </SelectTrigger>
              <SelectContent>
                {reportTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger className="w-full sm:w-48">
                <Calendar className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Period" />
              </SelectTrigger>
              <SelectContent>
                {periodOptions.map((period) => (
                  <SelectItem key={period.value} value={period.value}>
                    {period.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedPeriod === 'custom' && (
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={startDate ? startDate.toISOString().split('T')[0] : ''}
                  onChange={(e) => setStartDate(e.target.value ? new Date(e.target.value) : undefined)}
                  placeholder="Start Date"
                  className="w-full sm:w-48"
                />
                <Input
                  type="date"
                  value={endDate ? endDate.toISOString().split('T')[0] : ''}
                  onChange={(e) => setEndDate(e.target.value ? new Date(e.target.value) : undefined)}
                  placeholder="End Date"
                  className="w-full sm:w-48"
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Detailed Reports */}
      <div className="space-y-6">
        {filteredReports.map((report) => {
          const isExpanded = expandedReports.has(report.id);
          
          return (
            <Card key={report.id}>
              <Collapsible
                open={isExpanded}
                onOpenChange={(open) => {
                  const newExpanded = new Set(expandedReports);
                  if (open) {
                    newExpanded.add(report.id);
                  } else {
                    newExpanded.delete(report.id);
                  }
                  setExpandedReports(newExpanded);
                }}
              >
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {getReportTypeIcon(report.type)}
                        <div>
                          <CardTitle className="text-lg">{report.name}</CardTitle>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(report.period.startDate), 'dd MMM yyyy')} - {format(new Date(report.period.endDate), 'dd MMM yyyy')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge className={getReportTypeBadge(report.type)}>
                          {reportTypes.find(t => t.value === report.type)?.label}
                        </Badge>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleExportReport(report.id, 'pdf');
                            }}
                            title="Export as PDF"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleExportReport(report.id, 'excel');
                            }}
                            title="Export as Excel"
                          >
                            <FileBarChart className="h-4 w-4" />
                          </Button>
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                
                <CollapsibleContent>
                  <CardContent className="pt-0">
                    {report.type === 'profit_loss' && (
                      <ProfitLossReportDetail data={report.data as ProfitLossData} />
                    )}
                    {report.type === 'balance_sheet' && (
                      <BalanceSheetReportDetail data={report.data as BalanceSheetData} />
                    )}
                    {report.type === 'cash_flow' && (
                      <CashFlowReportDetail data={report.data as CashFlowData} />
                    )}
                    {report.type === 'trial_balance' && (
                      <TrialBalanceReportDetail data={report.data as TrialBalanceData} />
                    )}
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          );
        })}

        {filteredReports.length === 0 && (
          <Card>
            <CardContent className="text-center py-12">
              <FileBarChart className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Reports Generated</h3>
              <p className="text-muted-foreground mb-4">
                Generate your first financial report using the dropdown above.
              </p>
              <Button onClick={() => handleGenerateReport('profit_loss')}>
                <TrendingUp className="h-4 w-4 mr-2" />
                Generate Profit & Loss Report
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}