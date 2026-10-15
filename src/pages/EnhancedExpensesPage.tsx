import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Receipt,
  Plus,
  Upload,
  Search,
  Filter,
  Download,
  Calculator,
  PiggyBank,
  FileText,
  Zap,
  BarChart3,
  Calendar,
  DollarSign,
  Settings,
  CheckCircle,
  AlertTriangle,
  Eye,
  Edit,
  Trash2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from "@/context/StableAuthContext";
import { ExpenseTaxInterface } from '@/components/expense/ExpenseTaxInterface';
import { ExpenseGSTSummary } from '@/components/expense/ExpenseGSTSummary';
import { BulkExpenseProcessor } from '@/components/expense/BulkExpenseProcessor';
import { supabaseDataService } from '@/services/supabaseDataService';

interface Expense {
  id: string;
  description: string;
  amount: number;
  category: string;
  subcategory?: string;
  date: string;
  supplier?: string;
  receiptNumber?: string;
  isCapitalExpense: boolean;
  isGstClaimable: boolean;
  gstAmount: number;
  netAmount: number;
  notes?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  updatedAt: string;
}

interface ExpenseFormData {
  description: string;
  amount: number;
  category: string;
  subcategory: string;
  date: string;
  isCapitalExpense: boolean;
  isGstClaimable: boolean;
  gstAmount: number;
  netAmount: number;
  receiptNumber?: string;
  notes?: string;
  supplier?: string;
}

export default function EnhancedExpensesPage() {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [showExpenseDetails, setShowExpenseDetails] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [activeTab, setActiveTab] = useState('list');

  useEffect(() => {
    loadExpenses();
  }, [user?.id]);

  const loadExpenses = async () => {
    if (!user?.id) return;
    
    setLoading(true);
    try {
      // Get current year expenses
      const startDate = new Date(new Date().getFullYear(), 0, 1).toISOString();
      const endDate = new Date(new Date().getFullYear(), 11, 31).toISOString();
      
      const expenseData = await supabaseDataService.getExpensesByPeriod(
        user.id,
        startDate,
        endDate
      );

      // Transform data to match our interface
      const transformedExpenses: Expense[] = expenseData.map(expense => ({
        id: expense.id,
        description: expense.description,
        amount: Number(expense.amount) || 0,
        category: expense.category_id || expense.categoryId || expense.category || 'general',
        subcategory: expense.subcategory,
        date: expense.expense_date || expense.expenseDate || expense.date,
        supplier: expense.vendor_name || expense.vendorName || expense.supplier,
        receiptNumber: expense.receiptNumber,
        isCapitalExpense: Boolean(expense.is_capital_expense ?? expense.isCapitalExpense),
        isGstClaimable: expense.is_claimable !== false,
        gstAmount: Number(expense.tax_amount ?? expense.taxAmount ?? expense.gstAmount ?? 0),
        netAmount: Number(expense.amount || 0) - Number(expense.tax_amount ?? expense.taxAmount ?? expense.gstAmount ?? 0),
        notes: expense.notes,
        status: 'approved',
        createdAt: expense.createdAt || expense.date,
        updatedAt: expense.updatedAt || expense.date,
      }));

      setExpenses(transformedExpenses);
    } catch (error) {
      console.error('Error loading expenses:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddExpense = async (expenseData: ExpenseFormData) => {
    if (!user?.id) return;

    try {
      // Create expense in database
      const newExpense = {
        ...expenseData,
        userId: user.id,
        status: 'approved' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Add to local state (in real app, would save to database first)
      const expense: Expense = {
        id: `exp-${Date.now()}`,
        ...newExpense
      };

      setExpenses(prev => [expense, ...prev]);
      setShowAddExpense(false);
    } catch (error) {
      console.error('Error adding expense:', error);
    }
  };

  const handleBulkImport = async (bulkExpenses: any[]) => {
    if (!user?.id) return;

    try {
      const newExpenses: Expense[] = bulkExpenses.map(exp => ({
        id: `bulk-${Date.now()}-${Math.random()}`,
        ...exp,
        userId: user.id,
        status: 'approved' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        netAmount: exp.amount - exp.gstAmount
      }));

      setExpenses(prev => [...newExpenses, ...prev]);
      setShowBulkImport(false);
    } catch (error) {
      console.error('Error importing expenses:', error);
    }
  };

  const handleEditExpense = async (expenseData: ExpenseFormData) => {
    if (!editingExpense || !user?.id) return;

    try {
      const updatedExpense: Expense = {
        ...editingExpense,
        ...expenseData,
        updatedAt: new Date().toISOString()
      };

      setExpenses(prev => prev.map(exp => 
        exp.id === editingExpense.id ? updatedExpense : exp
      ));
      
      setEditingExpense(null);
      setShowAddExpense(false);
    } catch (error) {
      console.error('Error updating expense:', error);
    }
  };

  const handleDeleteExpense = async (expenseId: string) => {
    try {
      setExpenses(prev => prev.filter(exp => exp.id !== expenseId));
    } catch (error) {
      console.error('Error deleting expense:', error);
    }
  };

  const filteredExpenses = expenses.filter(expense => {
    const matchesSearch = expense.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         expense.supplier?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         expense.category.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = selectedCategory === 'all' || expense.category === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  const categories = [...new Set(expenses.map(exp => exp.category))];
  
  const totalExpenses = filteredExpenses.reduce((sum, exp) => sum + exp.amount, 0);
  const totalGSTClaimable = filteredExpenses
    .filter(exp => exp.isGstClaimable)
    .reduce((sum, exp) => sum + exp.gstAmount, 0);
  const capitalExpenses = filteredExpenses
    .filter(exp => exp.isCapitalExpense)
    .reduce((sum, exp) => sum + exp.amount, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Calculator className="h-8 w-8 text-muted-foreground mx-auto mb-2 animate-spin" />
          <p className="text-sm text-muted-foreground">Loading expenses...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Expense Management</h1>
          <p className="text-muted-foreground">
            Manage expenses with automatic GST calculations and tax compliance
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowBulkImport(true)}
            className="flex items-center gap-2"
          >
            <Upload className="h-4 w-4" />
            Bulk Import
          </Button>
          <Button
            onClick={() => setShowAddExpense(true)}
            className="flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Expense
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Expenses</p>
                <p className="text-2xl font-bold">${totalExpenses.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {filteredExpenses.length} transactions
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
                <p className="text-2xl font-bold text-green-600">${totalGSTClaimable.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Refundable amount
                </p>
              </div>
              <PiggyBank className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Capital Expenses</p>
                <p className="text-2xl font-bold text-purple-600">${capitalExpenses.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Asset purchases
                </p>
              </div>
              <BarChart3 className="h-8 w-8 text-purple-600" />
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
              <Calculator className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="list" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Expense List
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            GST Analytics
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Tax Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <Label htmlFor="search">Search expenses</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="search"
                      placeholder="Search by description, supplier, or category..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                
                <div className="sm:w-48">
                  <Label htmlFor="category">Category filter</Label>
                  <select
                    id="category"
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background"
                  >
                    <option value="all">All Categories</option>
                    {categories.map(category => (
                      <option key={category} value={category}>
                        {category.charAt(0).toUpperCase() + category.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Expense Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Expenses ({filteredExpenses.length})</span>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-1" />
                  Export
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>GST</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredExpenses.map((expense) => (
                      <TableRow key={expense.id}>
                        <TableCell>
                          {new Date(expense.date).toLocaleDateString('en-NZ')}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{expense.description}</p>
                            {expense.supplier && (
                              <p className="text-xs text-muted-foreground">{expense.supplier}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {expense.category}
                          </Badge>
                        </TableCell>
                        <TableCell>${expense.amount.toFixed(2)}</TableCell>
                        <TableCell>
                          <span className={cn(
                            "font-medium",
                            expense.isGstClaimable ? "text-green-600" : "text-gray-500"
                          )}>
                            ${expense.gstAmount.toFixed(2)}
                            {!expense.isGstClaimable && (
                              <span className="text-xs ml-1">(Not claimable)</span>
                            )}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={expense.isCapitalExpense ? 'secondary' : 'default'}>
                            {expense.isCapitalExpense ? 'Capital' : 'Operating'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={
                            expense.status === 'approved' ? 'default' :
                            expense.status === 'rejected' ? 'destructive' : 'secondary'
                          }>
                            {expense.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedExpense(expense);
                                setShowExpenseDetails(true);
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditingExpense(expense);
                                setShowAddExpense(true);
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteExpense(expense.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {filteredExpenses.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Receipt className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No expenses found</p>
                  <p className="text-xs mt-1">
                    {searchTerm || selectedCategory !== 'all' 
                      ? 'Try adjusting your filters'
                      : 'Start by adding your first expense'
                    }
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics">
          {user?.id && <ExpenseGSTSummary userId={user.id} />}
        </TabsContent>

        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>Tax Configuration</CardTitle>
            </CardHeader>
            <CardContent>
              <Alert>
                <Settings className="h-4 w-4" />
                <AlertDescription>
                  Tax settings are managed in the Tax Configuration page. 
                  <Button variant="link" className="p-0 h-auto font-medium">
                    Go to Tax Settings
                  </Button>
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add/Edit Expense Dialog */}
      <Dialog open={showAddExpense} onOpenChange={setShowAddExpense}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingExpense ? 'Edit Expense' : 'Add New Expense'}
            </DialogTitle>
          </DialogHeader>
          <ExpenseTaxInterface
            expense={editingExpense ? {
              description: editingExpense.description,
              amount: editingExpense.amount,
              category: editingExpense.category,
              subcategory: editingExpense.subcategory || '',
              date: editingExpense.date,
              isCapitalExpense: editingExpense.isCapitalExpense,
              isGstClaimable: editingExpense.isGstClaimable,
              gstAmount: editingExpense.gstAmount,
              netAmount: editingExpense.netAmount,
              receiptNumber: editingExpense.receiptNumber,
              notes: editingExpense.notes,
              supplier: editingExpense.supplier
            } : undefined}
            onSave={editingExpense ? handleEditExpense : handleAddExpense}
            onCancel={() => {
              setShowAddExpense(false);
              setEditingExpense(null);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Bulk Import Dialog */}
      <Dialog open={showBulkImport} onOpenChange={setShowBulkImport}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bulk Import Expenses</DialogTitle>
          </DialogHeader>
          <BulkExpenseProcessor
            onProcessComplete={handleBulkImport}
            onCancel={() => setShowBulkImport(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Expense Details Dialog */}
      <Dialog open={showExpenseDetails} onOpenChange={setShowExpenseDetails}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Expense Details</DialogTitle>
          </DialogHeader>
          {selectedExpense && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Description</Label>
                  <p className="font-medium">{selectedExpense.description}</p>
                </div>
                <div>
                  <Label>Amount</Label>
                  <p className="font-medium">${selectedExpense.amount.toFixed(2)}</p>
                </div>
                <div>
                  <Label>Category</Label>
                  <Badge variant="outline" className="capitalize">
                    {selectedExpense.category}
                  </Badge>
                </div>
                <div>
                  <Label>Date</Label>
                  <p className="font-medium">
                    {new Date(selectedExpense.date).toLocaleDateString('en-NZ')}
                  </p>
                </div>
                <div>
                  <Label>GST Amount</Label>
                  <p className={cn(
                    "font-medium",
                    selectedExpense.isGstClaimable ? "text-green-600" : "text-gray-500"
                  )}>
                    ${selectedExpense.gstAmount.toFixed(2)}
                    {!selectedExpense.isGstClaimable && " (Not claimable)"}
                  </p>
                </div>
                <div>
                  <Label>Type</Label>
                  <Badge variant={selectedExpense.isCapitalExpense ? 'secondary' : 'default'}>
                    {selectedExpense.isCapitalExpense ? 'Capital' : 'Operating'}
                  </Badge>
                </div>
              </div>

              {selectedExpense.supplier && (
                <div>
                  <Label>Supplier</Label>
                  <p className="font-medium">{selectedExpense.supplier}</p>
                </div>
              )}

              {selectedExpense.receiptNumber && (
                <div>
                  <Label>Receipt Number</Label>
                  <p className="font-medium">{selectedExpense.receiptNumber}</p>
                </div>
              )}

              {selectedExpense.notes && (
                <div>
                  <Label>Notes</Label>
                  <p className="text-sm text-muted-foreground">{selectedExpense.notes}</p>
                </div>
              )}

              <Separator />

              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Created: {new Date(selectedExpense.createdAt).toLocaleDateString('en-NZ')}</span>
                <span>Updated: {new Date(selectedExpense.updatedAt).toLocaleDateString('en-NZ')}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}