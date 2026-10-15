import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import {
  Receipt,
  PiggyBank,
  TrendingUp,
  Calendar,
  Download,
  FileText,
  AlertTriangle,
  CheckCircle,
  DollarSign,
  Percent,
  Calculator
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from "@/context/StableAuthContext";
import { supabaseDataService } from '@/services/supabaseDataService';

interface ExpenseGSTData {
  id: string;
  description: string;
  amount: number;
  gstAmount: number;
  category: string;
  subcategory: string;
  isCapitalExpense: boolean;
  isGstClaimable: boolean;
  date: string;
  supplier?: string;
}

interface PeriodSummary {
  period: string;
  totalExpenses: number;
  totalGSTClaimable: number;
  totalGSTNonClaimable: number;
  capitalExpenses: number;
  operationalExpenses: number;
  expenseCount: number;
}

interface CategoryBreakdown {
  category: string;
  totalAmount: number;
  gstClaimable: number;
  expenseCount: number;
  percentage: number;
}

interface ExpenseGSTSummaryProps {
  userId: string;
  className?: string;
}

export const ExpenseGSTSummary: React.FC<ExpenseGSTSummaryProps> = ({
  userId,
  className
}) => {
  const [selectedPeriod, setSelectedPeriod] = useState('current-quarter');
  const [expenses, setExpenses] = useState<ExpenseGSTData[]>([]);
  const [periodSummary, setPeriodSummary] = useState<PeriodSummary | null>(null);
  const [categoryBreakdown, setCategoryBreakdown] = useState<CategoryBreakdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const periodOptions = [
    { value: 'current-month', label: 'Current Month' },
    { value: 'current-quarter', label: 'Current Quarter' },
    { value: 'last-quarter', label: 'Last Quarter' },
    { value: 'current-year', label: 'Current Financial Year' },
    { value: 'last-year', label: 'Last Financial Year' }
  ];

  useEffect(() => {
    loadExpenseData();
  }, [userId, selectedPeriod]);

  const loadExpenseData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const dateRange = getDateRangeForPeriod(selectedPeriod);
      
      // Load expenses from Supabase using the existing expenses table
      const expenseData = await supabaseDataService.getExpensesByPeriod(
        userId,
        dateRange.startDate,
        dateRange.endDate
      );

      // Transform data to match our expected format
      const processedExpenses = expenseData.map(expense => ({
        id: expense.id,
        description: expense.description,
        amount: expense.amount,
        category: expense.category_id || expense.categoryId || expense.category || 'general',
        subcategory: 'General',
        date: expense.expense_date || expense.expenseDate || expense.date,
        supplier: expense.vendor_name || expense.vendorName,
        isCapitalExpense: expense.amount > 1000,
        isGstClaimable: expense.is_claimable !== false,
        gstAmount: expense.tax_amount ?? expense.taxAmount ?? expense.gstAmount ?? (expense.amount * 0.15) / 1.15
      }));

      setExpenses(processedExpenses);
      calculateSummaries(processedExpenses, dateRange.label);
    } catch (err) {
      setError('Failed to load expense data');
      console.error('Error loading expenses:', err);
    } finally {
      setLoading(false);
    }
  };

  const getDateRangeForPeriod = (period: string) => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const currentQuarter = Math.floor(currentMonth / 3);

    switch (period) {
      case 'current-month':
        return {
          startDate: new Date(currentYear, currentMonth, 1).toISOString(),
          endDate: new Date(currentYear, currentMonth + 1, 0).toISOString(),
          label: now.toLocaleDateString('en-NZ', { month: 'long', year: 'numeric' })
        };
      
      case 'current-quarter':
        const quarterStart = new Date(currentYear, currentQuarter * 3, 1);
        const quarterEnd = new Date(currentYear, (currentQuarter + 1) * 3, 0);
        return {
          startDate: quarterStart.toISOString(),
          endDate: quarterEnd.toISOString(),
          label: `Q${currentQuarter + 1} ${currentYear}`
        };
      
      case 'last-quarter':
        const lastQuarter = currentQuarter === 0 ? 3 : currentQuarter - 1;
        const lastQuarterYear = currentQuarter === 0 ? currentYear - 1 : currentYear;
        const lastQuarterStart = new Date(lastQuarterYear, lastQuarter * 3, 1);
        const lastQuarterEnd = new Date(lastQuarterYear, (lastQuarter + 1) * 3, 0);
        return {
          startDate: lastQuarterStart.toISOString(),
          endDate: lastQuarterEnd.toISOString(),
          label: `Q${lastQuarter + 1} ${lastQuarterYear}`
        };
      
      case 'current-year':
        // NZ Financial Year: April 1 - March 31
        const fyStart = currentMonth >= 3 ? 
          new Date(currentYear, 3, 1) : 
          new Date(currentYear - 1, 3, 1);
        const fyEnd = currentMonth >= 3 ? 
          new Date(currentYear + 1, 2, 31) : 
          new Date(currentYear, 2, 31);
        return {
          startDate: fyStart.toISOString(),
          endDate: fyEnd.toISOString(),
          label: `FY ${fyStart.getFullYear()}-${fyEnd.getFullYear()}`
        };
      
      case 'last-year':
        const lastFyStart = new Date(currentYear - 1, 3, 1);
        const lastFyEnd = new Date(currentYear, 2, 31);
        return {
          startDate: lastFyStart.toISOString(),
          endDate: lastFyEnd.toISOString(),
          label: `FY ${lastFyStart.getFullYear()}-${lastFyEnd.getFullYear()}`
        };
      
      default:
        return {
          startDate: new Date(currentYear, currentQuarter * 3, 1).toISOString(),
          endDate: new Date(currentYear, (currentQuarter + 1) * 3, 0).toISOString(),
          label: `Q${currentQuarter + 1} ${currentYear}`
        };
    }
  };

  const calculateSummaries = (expenseData: ExpenseGSTData[], periodLabel: string) => {
    const totalExpenses = expenseData.reduce((sum, exp) => sum + exp.amount, 0);
    const totalGSTClaimable = expenseData
      .filter(exp => exp.isGstClaimable)
      .reduce((sum, exp) => sum + exp.gstAmount, 0);
    const totalGSTNonClaimable = expenseData
      .filter(exp => !exp.isGstClaimable)
      .reduce((sum, exp) => sum + exp.gstAmount, 0);
    const capitalExpenses = expenseData
      .filter(exp => exp.isCapitalExpense)
      .reduce((sum, exp) => sum + exp.amount, 0);
    const operationalExpenses = totalExpenses - capitalExpenses;

    setPeriodSummary({
      period: periodLabel,
      totalExpenses,
      totalGSTClaimable,
      totalGSTNonClaimable,
      capitalExpenses,
      operationalExpenses,
      expenseCount: expenseData.length
    });

    // Calculate category breakdown
    const categoryMap = new Map<string, { amount: number; gstClaimable: number; count: number }>();
    
    expenseData.forEach(expense => {
      const existing = categoryMap.get(expense.category) || { amount: 0, gstClaimable: 0, count: 0 };
      categoryMap.set(expense.category, {
        amount: existing.amount + expense.amount,
        gstClaimable: existing.gstClaimable + (expense.isGstClaimable ? expense.gstAmount : 0),
        count: existing.count + 1
      });
    });

    const breakdown = Array.from(categoryMap.entries()).map(([category, data]) => ({
      category,
      totalAmount: data.amount,
      gstClaimable: data.gstClaimable,
      expenseCount: data.count,
      percentage: (data.amount / totalExpenses) * 100
    }));

    setCategoryBreakdown(breakdown.sort((a, b) => b.totalAmount - a.totalAmount));
  };

  const chartData = categoryBreakdown.slice(0, 6).map(item => ({
    name: item.category,
    amount: item.totalAmount,
    gst: item.gstClaimable
  }));

  const pieData = categoryBreakdown.slice(0, 5).map((item, index) => ({
    name: item.category,
    value: item.totalAmount,
    color: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'][index]
  }));

  const RADIAN = Math.PI / 180;
  const renderCustomizedLabel = ({
    cx, cy, midAngle, innerRadius, outerRadius, percent
  }: any) => {
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text 
        x={x} 
        y={y} 
        fill="white" 
        textAnchor={x > cx ? 'start' : 'end'} 
        dominantBaseline="central"
        fontSize={12}
        fontWeight="bold"
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center p-6">
          <div className="text-center">
            <Calculator className="h-8 w-8 text-muted-foreground mx-auto mb-2 animate-spin" />
            <p className="text-sm text-muted-foreground">Calculating GST summary...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2">
            <PiggyBank className="h-5 w-5 text-green-600" />
            GST Claimable Summary
          </CardTitle>
          <div className="flex items-center gap-3">
            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {periodOptions.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline">
              <Download className="h-4 w-4 mr-1" />
              Export
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Summary Cards */}
      {periodSummary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Expenses</p>
                  <p className="text-2xl font-bold">${periodSummary.totalExpenses.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {periodSummary.expenseCount} transactions
                  </p>
                </div>
                <Receipt className="h-8 w-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">GST Claimable</p>
                  <p className="text-2xl font-bold text-green-600">
                    ${periodSummary.totalGSTClaimable.toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Can be claimed back
                  </p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Capital Expenses</p>
                  <p className="text-2xl font-bold text-purple-600">
                    ${periodSummary.capitalExpenses.toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Asset purchases
                  </p>
                </div>
                <TrendingUp className="h-8 w-8 text-purple-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">GST Rate</p>
                  <p className="text-2xl font-bold">15%</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Current NZ rate
                  </p>
                </div>
                <Percent className="h-8 w-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Breakdown Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Expense Categories</CardTitle>
          </CardHeader>
          <CardContent>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="name" 
                    fontSize={12}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis fontSize={12} />
                  <Tooltip 
                    formatter={(value, name) => [
                      `$${(value as number).toFixed(2)}`,
                      name === 'amount' ? 'Total Amount' : 'GST Claimable'
                    ]}
                  />
                  <Bar dataKey="amount" fill="#3B82F6" name="Total Amount" />
                  <Bar dataKey="gst" fill="#10B981" name="GST Claimable" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-64 text-muted-foreground">
                No data available for this period
              </div>
            )}
          </CardContent>
        </Card>

        {/* GST Distribution Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">GST Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={renderCustomizedLabel}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [`$${(value as number).toFixed(2)}`, 'Amount']} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-64 text-muted-foreground">
                No data available for this period
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detailed Category Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Category Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {categoryBreakdown.map((category, index) => (
              <div key={category.category} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full" style={{ 
                    backgroundColor: pieData[index]?.color || '#64748B' 
                  }}></div>
                  <div>
                    <p className="font-medium capitalize">{category.category}</p>
                    <p className="text-xs text-muted-foreground">
                      {category.expenseCount} transactions • {category.percentage.toFixed(1)}% of total
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-medium">${category.totalAmount.toFixed(2)}</p>
                  <p className="text-xs text-green-600">
                    GST: ${category.gstClaimable.toFixed(2)}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {categoryBreakdown.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Receipt className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No expenses found for the selected period</p>
              <p className="text-xs mt-1">Start by adding some expense transactions</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tax Tips */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Tax Tips & Compliance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Keep receipts:</strong> Maintain all receipts for GST claimable expenses. 
                Digital copies are acceptable for IRD.
              </AlertDescription>
            </Alert>

            <Alert>
              <Calendar className="h-4 w-4" />
              <AlertDescription>
                <strong>Quarterly returns:</strong> GST returns are due 28th day of the month 
                following the end of the quarter.
              </AlertDescription>
            </Alert>

            <Alert>
              <DollarSign className="h-4 w-4" />
              <AlertDescription>
                <strong>Capital assets:</strong> GST on capital purchases over $5,000 may need 
                to be claimed over multiple periods.
              </AlertDescription>
            </Alert>

            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>Mixed use:</strong> For personal/business use items, only claim the 
                business portion of GST.
              </AlertDescription>
            </Alert>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};