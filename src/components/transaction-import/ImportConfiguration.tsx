import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Settings, 
  FileText, 
  AlertCircle, 
  ArrowLeft, 
  ArrowRight,
  Calendar,
  Type,
  DollarSign,
  CheckCircle
} from 'lucide-react';
import { BankAccount, CSVColumnMapping } from '@/types/bankTransaction';
import { parseCSVTransactions } from '@/services/csvTransactionParser';
import { toast } from 'sonner';

interface ImportConfigurationProps {
  file: File;
  bankAccount: BankAccount;
  onConfigurationComplete: (parseResult: import('@/services/csvTransactionParser').CSVParseResult) => void;
  onBack: () => void;
}

export function ImportConfiguration({
  file,
  bankAccount,
  onConfigurationComplete,
  onBack
}: ImportConfigurationProps) {
  const [csvData, setCsvData] = useState<string>('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<string[][]>([]);
  const [columnMapping, setColumnMapping] = useState<CSVColumnMapping>({
    date: '',
    description: '',
    amount: '',
    balance: undefined,
    reference: undefined,
  });
  const [dateFormat, setDateFormat] = useState<string>('DD/MM/YYYY');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<import('@/services/csvTransactionParser').CSVParseResult | null>(null);

  useEffect(() => {
    if (file && file.type === 'text/csv') {
      loadCSVFile();
    } else {
      setError('PDF import is not yet supported. Please upload a CSV file.');
    }
  }, [file]);

  useEffect(() => {
    if (csvData && headers.length > 0) {
      // Auto-detect column mappings
      autoDetectColumns();
    }
  }, [csvData, headers]);

  const loadCSVFile = async () => {
    try {
      const text = await file.text();
      setCsvData(text);
      
      // Parse headers and sample rows
      const lines = text.split('\n').filter(line => line.trim());
      if (lines.length > 0) {
        const headerLine = lines[0];
        const parsedHeaders = headerLine.split(',').map(h => h.trim().replace(/"/g, ''));
        setHeaders(parsedHeaders);
        
        // Get first 3 rows as sample
        const sampleLines = lines.slice(1, 4);
        const parsedSamples = sampleLines.map(line => 
          line.split(',').map(cell => cell.trim().replace(/"/g, ''))
        );
        setSampleRows(parsedSamples);
      }
    } catch (error) {
      console.error('Failed to load CSV file:', error);
      setError('Failed to read CSV file. Please check the file format.');
    }
  };

  const autoDetectColumns = () => {
    const mapping: CSVColumnMapping = {
      date: '',
      description: '',
      amount: '',
      balance: undefined,
      reference: undefined,
    };

    headers.forEach((header, index) => {
      const lowerHeader = header.toLowerCase();
      
      // Date column detection
      if ((lowerHeader.includes('date') || lowerHeader.includes('transaction date')) && !mapping.date) {
        mapping.date = header;
      }
      
      // Description column detection
      if ((lowerHeader.includes('description') || lowerHeader.includes('narrative') || lowerHeader.includes('details') || lowerHeader.includes('memo')) && !mapping.description) {
        mapping.description = header;
      }
      
      // Amount column detection
      if ((lowerHeader.includes('amount') || lowerHeader.includes('credit') || lowerHeader.includes('debit')) && !mapping.amount) {
        mapping.amount = header;
      }
      
      // Balance column detection (optional)
      if (lowerHeader.includes('balance') && !mapping.balance) {
        mapping.balance = header;
      }
      
      // Reference column detection (optional)
      if ((lowerHeader.includes('reference') || lowerHeader.includes('ref') || lowerHeader.includes('cheque')) && !mapping.reference) {
        mapping.reference = header;
      }
    });

    setColumnMapping(mapping);
  };

  const handleColumnMappingChange = (field: keyof CSVColumnMapping, value: string) => {
    setColumnMapping(prev => ({
      ...prev,
      [field]: value === 'none' ? undefined : value,
    }));
  };

  const handlePreview = async () => {
    if (!columnMapping.date || !columnMapping.description || !columnMapping.amount) {
      setError('Please select columns for Date, Description, and Amount.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await parseCSVTransactions(csvData, columnMapping, dateFormat);
      
      if (!result.success) {
        setError(result.errors.join('; ') || 'Failed to parse CSV file');
        return;
      }

      setPreviewData(result);
      toast.success(`Successfully parsed ${result.transactions.length} transactions`);
    } catch (error) {
      console.error('Failed to parse CSV:', error);
      setError(error instanceof Error ? error.message : 'Failed to parse CSV file');
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = () => {
    if (previewData) {
      onConfigurationComplete(previewData);
    }
  };

  const isRequiredMappingComplete = () => {
    return columnMapping.date && columnMapping.description && columnMapping.amount;
  };

  const renderColumnMapping = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="w-5 h-5" />
          Column Mapping
        </CardTitle>
        <CardDescription>
          Map the columns in your CSV file to the required fields
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          {/* Required Fields */}
          <div className="space-y-4">
            <h4 className="font-medium text-sm flex items-center gap-2">
              Required Fields
              <Badge variant="destructive" className="text-xs">Required</Badge>
            </h4>
            
            <div className="space-y-2">
              <Label htmlFor="date-column" className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Date Column
              </Label>
              <Select
                value={columnMapping.date}
                onValueChange={(value) => handleColumnMappingChange('date', value)}
              >
                <SelectTrigger id="date-column">
                  <SelectValue placeholder="Select date column" />
                </SelectTrigger>
                <SelectContent>
                  {headers.map((header) => (
                    <SelectItem key={header} value={header}>
                      {header}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description-column" className="flex items-center gap-2">
                <Type className="w-4 h-4" />
                Description Column
              </Label>
              <Select
                value={columnMapping.description}
                onValueChange={(value) => handleColumnMappingChange('description', value)}
              >
                <SelectTrigger id="description-column">
                  <SelectValue placeholder="Select description column" />
                </SelectTrigger>
                <SelectContent>
                  {headers.map((header) => (
                    <SelectItem key={header} value={header}>
                      {header}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount-column" className="flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Amount Column
              </Label>
              <Select
                value={columnMapping.amount}
                onValueChange={(value) => handleColumnMappingChange('amount', value)}
              >
                <SelectTrigger id="amount-column">
                  <SelectValue placeholder="Select amount column" />
                </SelectTrigger>
                <SelectContent>
                  {headers.map((header) => (
                    <SelectItem key={header} value={header}>
                      {header}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Optional Fields */}
          <div className="space-y-4">
            <h4 className="font-medium text-sm flex items-center gap-2">
              Optional Fields
              <Badge variant="secondary" className="text-xs">Optional</Badge>
            </h4>
            
            <div className="space-y-2">
              <Label htmlFor="balance-column">Balance Column</Label>
              <Select
                value={columnMapping.balance || 'none'}
                onValueChange={(value) => handleColumnMappingChange('balance', value)}
              >
                <SelectTrigger id="balance-column">
                  <SelectValue placeholder="Select balance column (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {headers.map((header) => (
                    <SelectItem key={header} value={header}>
                      {header}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reference-column">Reference Column</Label>
              <Select
                value={columnMapping.reference || 'none'}
                onValueChange={(value) => handleColumnMappingChange('reference', value)}
              >
                <SelectTrigger id="reference-column">
                  <SelectValue placeholder="Select reference column (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {headers.map((header) => (
                    <SelectItem key={header} value={header}>
                      {header}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="date-format">Date Format</Label>
              <Select value={dateFormat} onValueChange={setDateFormat}>
                <SelectTrigger id="date-format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                  <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                  <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <Button 
            onClick={handlePreview} 
            disabled={!isRequiredMappingComplete() || loading}
            className="flex items-center gap-2"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                Parsing...
              </>
            ) : (
              <>
                <FileText className="w-4 h-4" />
                Preview Data
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const renderDataPreview = () => (
    <Card>
      <CardHeader>
        <CardTitle>CSV Data Preview</CardTitle>
        <CardDescription>
          Preview of your CSV file with the current column mapping
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b">
                  {headers.map((header, index) => (
                    <th key={index} className="text-left p-3 font-medium bg-muted/50">
                      <div className="space-y-1">
                        <span className="text-sm">{header}</span>
                        {columnMapping.date === header && (
                          <Badge variant="default" className="text-xs">Date</Badge>
                        )}
                        {columnMapping.description === header && (
                          <Badge variant="default" className="text-xs">Description</Badge>
                        )}
                        {columnMapping.amount === header && (
                          <Badge variant="default" className="text-xs">Amount</Badge>
                        )}
                        {columnMapping.balance === header && (
                          <Badge variant="secondary" className="text-xs">Balance</Badge>
                        )}
                        {columnMapping.reference === header && (
                          <Badge variant="secondary" className="text-xs">Reference</Badge>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sampleRows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-b">
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} className="p-3 text-sm">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {sampleRows.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No sample data available
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );

  const renderParseResults = () => {
    if (!previewData) return null;

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            Parse Results
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">
                {previewData.transactions.length}
              </div>
              <div className="text-sm text-green-700">
                Transactions Found
              </div>
            </div>
            
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">
                {previewData.duplicates?.length ?? 0}
              </div>
              <div className="text-sm text-blue-700">
                Duplicate groups
              </div>
            </div>
            
            <div className="text-center p-4 bg-yellow-50 rounded-lg">
              <div className="text-2xl font-bold text-yellow-600">
                {previewData.errors?.length || 0}
              </div>
              <div className="text-sm text-yellow-700">
                Parse Errors
              </div>
            </div>
          </div>

          {previewData.errors && previewData.errors.length > 0 && (
            <Alert className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {previewData.errors.length} rows had parsing errors and will be skipped during import.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            File Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">File Name:</span>
              <span className="font-medium">{file.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">File Size:</span>
              <span className="font-medium">{(file.size / 1024).toFixed(1)} KB</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Bank Account:</span>
              <span className="font-medium">{bankAccount.accountName}</span>
            </div>
            {headers.length > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Columns Found:</span>
                <span className="font-medium">{headers.length}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {headers.length > 0 && (
        <>
          {renderDataPreview()}
          {renderColumnMapping()}
          {renderParseResults()}
        </>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} className="flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>
        
        <Button 
          onClick={handleContinue} 
          disabled={!previewData || loading}
          className="flex items-center gap-2"
        >
          Continue
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}