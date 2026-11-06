import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle,
  AlertTriangle,
  X,
  Download,
  Calculator,
  Zap
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface BulkExpenseData {
  id: string;
  description: string;
  amount: number;
  category: string;
  date: string;
  supplier?: string;
  isCapitalExpense: boolean;
  isGstClaimable: boolean;
  gstAmount: number;
  status: 'pending' | 'valid' | 'error';
  errors: string[];
}

interface BulkExpenseProcessorProps {
  onProcessComplete: (expenses: BulkExpenseData[]) => void;
  onCancel: () => void;
  className?: string;
}

export const BulkExpenseProcessor: React.FC<BulkExpenseProcessorProps> = ({
  onProcessComplete,
  onCancel,
  className
}) => {
  const [dragOver, setDragOver] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [expenses, setExpenses] = useState<BulkExpenseData[]>([]);
  const [validExpenses, setValidExpenses] = useState(0);
  const [invalidExpenses, setInvalidExpenses] = useState(0);

  const handleFileUpload = async (file: File) => {
    if (!file.name.endsWith('.csv')) {
      alert('Please upload a CSV file');
      return;
    }

    setProcessing(true);
    setProgress(0);

    try {
      const text = await file.text();
      const lines = text.split('\n');
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      
      const processedExpenses: BulkExpenseData[] = [];
      
      for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === '') continue;
        
        setProgress((i / lines.length) * 100);
        
        const values = lines[i].split(',').map(v => v.trim());
        const expense = parseExpenseRow(headers, values, i);
        processedExpenses.push(expense);
        
        // Simulate processing delay
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      setExpenses(processedExpenses);
      
      const valid = processedExpenses.filter(e => e.status === 'valid').length;
      const invalid = processedExpenses.filter(e => e.status === 'error').length;
      
      setValidExpenses(valid);
      setInvalidExpenses(invalid);
      
    } catch (error) {
      console.error('Error processing file:', error);
      alert('Error processing file. Please check the format.');
    } finally {
      setProcessing(false);
      setProgress(100);
    }
  };

  const parseExpenseRow = (headers: string[], values: string[], rowIndex: number): BulkExpenseData => {
    const expense: Partial<BulkExpenseData> = {
      id: `bulk-${rowIndex}`,
      status: 'pending',
      errors: []
    };

    // Map CSV columns to expense fields
    const fieldMapping = {
      'description': 'description' as const,
      'amount': 'amount' as const,
      'category': 'category' as const,
      'date': 'date' as const,
      'supplier': 'supplier' as const
    };

    headers.forEach((header, index) => {
      const field = fieldMapping[header as keyof typeof fieldMapping];
      if (field && values[index]) {
        if (field === 'amount') {
          expense[field] = parseFloat(values[index]) || 0;
        } else {
          expense[field] = values[index];
        }
      }
    });

    // Validate required fields
    const errors: string[] = [];
    
    if (!expense.description) {
      errors.push('Description is required');
    }
    if (!expense.amount || expense.amount <= 0) {
      errors.push('Valid amount is required');
    }
    if (!expense.category) {
      errors.push('Category is required');
    }
    if (!expense.date) {
      errors.push('Date is required');
    }

    // Auto-determine capital expense (simple heuristic)
    const isCapitalExpense = (expense.amount || 0) > 1000 && 
      (expense.category?.toLowerCase().includes('equipment') || 
       expense.category?.toLowerCase().includes('asset'));

    // Calculate GST (assuming 15% rate and amount includes GST)
    const gstAmount = (expense.amount || 0) * 0.15 / 1.15;

    return {
      ...expense,
      isCapitalExpense,
      isGstClaimable: true, // Default to claimable
      gstAmount: Math.round(gstAmount * 100) / 100,
      status: errors.length > 0 ? 'error' : 'valid',
      errors
    } as BulkExpenseData;
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  const downloadTemplate = () => {
    const template = 'description,amount,category,date,supplier\n' +
      'Office supplies,125.50,office,2024-01-15,Warehouse Stationery\n' +
      'Laptop purchase,2300.00,equipment,2024-01-16,PB Technologies\n' +
      'Fuel,89.75,travel,2024-01-17,Z Energy';
    
    const blob = new Blob([template], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'expense-template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const processExpenses = () => {
    const validExpensesToProcess = expenses.filter(e => e.status === 'valid');
    onProcessComplete(validExpensesToProcess);
  };

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-blue-600" />
            Bulk Expense Import
            <Badge variant="outline" className="ml-auto">
              CSV Upload
            </Badge>
          </CardTitle>
        </CardHeader>
      </Card>

      {expenses.length === 0 ? (
        // Upload Area
        <Card>
          <CardContent className="p-8">
            <div
              className={cn(
                "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
                dragOver ? "border-blue-500 bg-blue-50" : "border-gray-300"
              )}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">Upload Expense CSV</h3>
              <p className="text-gray-600 mb-4">
                Drag and drop your CSV file here, or click to browse
              </p>
              
              <div className="space-y-3">
                <label className="inline-block">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileInput}
                    className="hidden"
                    disabled={processing}
                  />
                  <Button variant="outline" disabled={processing}>
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Choose CSV File
                  </Button>
                </label>
                
                <div className="text-sm text-gray-500">
                  <p>Required columns: description, amount, category, date</p>
                  <p>Optional columns: supplier</p>
                </div>
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={downloadTemplate}
                  className="text-blue-600"
                >
                  <Download className="h-4 w-4 mr-1" />
                  Download Template
                </Button>
              </div>
            </div>

            {processing && (
              <div className="mt-6">
                <div className="flex items-center gap-3 mb-2">
                  <Calculator className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Processing expenses...</span>
                  <span className="text-sm text-gray-500">{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} className="w-full" />
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        // Results Area
        <div className="space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-8 w-8 text-green-600" />
                  <div>
                    <p className="font-semibold text-2xl">{validExpenses}</p>
                    <p className="text-sm text-gray-600">Valid Expenses</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-8 w-8 text-red-600" />
                  <div>
                    <p className="font-semibold text-2xl">{invalidExpenses}</p>
                    <p className="text-sm text-gray-600">Errors Found</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Calculator className="h-8 w-8 text-blue-600" />
                  <div>
                    <p className="font-semibold text-2xl">
                      ${expenses.filter(e => e.status === 'valid').reduce((sum, e) => sum + e.gstAmount, 0).toFixed(2)}
                    </p>
                    <p className="text-sm text-gray-600">Total GST Claimable</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Expense List */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Processed Expenses</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>GST</TableHead>
                      <TableHead>Type</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenses.map((expense) => (
                      <TableRow key={expense.id}>
                        <TableCell>
                          {expense.status === 'valid' ? (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          ) : (
                            <X className="h-4 w-4 text-red-600" />
                          )}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{expense.description}</p>
                            {expense.errors.length > 0 && (
                              <p className="text-xs text-red-600">
                                {expense.errors.join(', ')}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>${expense.amount?.toFixed(2) || '0.00'}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{expense.category}</Badge>
                        </TableCell>
                        <TableCell className="text-green-600">
                          ${expense.gstAmount?.toFixed(2) || '0.00'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={expense.isCapitalExpense ? 'secondary' : 'default'}>
                            {expense.isCapitalExpense ? 'Capital' : 'Operating'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              onClick={processExpenses}
              disabled={validExpenses === 0}
              className="flex items-center gap-2"
            >
              <CheckCircle className="h-4 w-4" />
              Import {validExpenses} Valid Expenses
            </Button>
          </div>

          {validExpenses > 0 && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                Ready to import {validExpenses} valid expenses with automatic GST calculations.
                {invalidExpenses > 0 && ` ${invalidExpenses} expenses with errors will be skipped.`}
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}
    </div>
  );
};