import React, { useState } from 'react';
import { csvRow } from '@/lib/csv';
import type { CSVParseResult } from '@/services/csvTransactionParser';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Eye,
  ArrowLeft,
  Upload,
  AlertCircle,
  CheckCircle,
  Calendar,
  DollarSign,
  FileText,
  TrendingUp,
  TrendingDown,
  AlertTriangle
} from 'lucide-react';
import { BankAccount, ImportedTransaction, TransactionImportConfig, TransactionImportResult } from '@/types/bankTransaction';
import { transactionImportService } from '@/services/transactionImportService';
import { toast } from 'sonner';

interface ImportPreviewProps {
  parseResult: CSVParseResult;
  bankAccount: BankAccount;
  onImportConfirm: (result: TransactionImportResult) => void;
  onBack: () => void;
}

export function ImportPreview({
  parseResult,
  bankAccount,
  onImportConfirm,
  onBack
}: ImportPreviewProps) {
  const [selectedTransactions, setSelectedTransactions] = useState<Set<number>>(
    new Set(parseResult.transactions.map((_, index: number) => index))
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTransactionToggle = (index: number) => {
    const newSelected = new Set(selectedTransactions);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedTransactions(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedTransactions.size === parseResult.transactions.length) {
      setSelectedTransactions(new Set());
    } else {
      setSelectedTransactions(new Set(parseResult.transactions.map((_, index: number) => index)));
    }
  };

  const handleImport = async () => {
    if (selectedTransactions.size === 0) {
      setError('Please select at least one transaction to import.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Prepare selected transactions for import
      const transactionsToImport = parseResult.transactions.filter(
        (_, index: number) => selectedTransactions.has(index)
      );

      const csvData = prepareCsvDataForImport(transactionsToImport);

      const config: TransactionImportConfig = {
        bankAccountId: bankAccount.id,
        fileType: 'csv',
        csvMapping: { date: 'date', description: 'description', amount: 'amount', type: 'type', balance: 'balance', reference: 'reference', merchant: 'merchant' },
        dateFormat: 'YYYY-MM-DD',
        skipDuplicates: true,
      };

      const result = await transactionImportService.importTransactions(csvData, config);

      if (result.success) {
        toast.success(`Successfully imported ${result.importedCount} transactions`);
        onImportConfirm(result);
      } else {
        setError(result.errors.join('; ') || 'Import failed');
      }
    } catch (error) {
      console.error('Import failed:', error);
      setError(error instanceof Error ? error.message : 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  const prepareCsvDataForImport = (transactions: ImportedTransaction[]): string => [
    csvRow(['date', 'description', 'amount', 'type', 'balance', 'reference', 'merchant']),
    ...transactions.map((row) => csvRow([row.date, row.description, String(row.amount), row.type, row.balance, row.reference, row.merchant])),
  ].join('\n');

  const formatAmount = (amount: number, currency: string = bankAccount.currency) => {
    return new Intl.NumberFormat('en-NZ', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-NZ', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getTransactionIcon = (amount: number) => {
    return amount >= 0 ? (
      <TrendingUp className="w-4 h-4 text-green-600" />
    ) : (
      <TrendingDown className="w-4 h-4 text-red-600" />
    );
  };

  const getAmountColor = (amount: number) => {
    return amount >= 0 ? 'text-green-600' : 'text-red-600';
  };

  const calculateSummary = () => {
    const selected = parseResult.transactions.filter(
      (_, index: number) => selectedTransactions.has(index)
    );

    const totalCredit = selected
      .filter((t: ImportedTransaction) => t.amount >= 0)
      .reduce((sum: number, t: ImportedTransaction) => sum + t.amount, 0);

    const totalDebit = selected
      .filter((t: ImportedTransaction) => t.amount < 0)
      .reduce((sum: number, t: ImportedTransaction) => sum + Math.abs(t.amount), 0);

    const netAmount = totalCredit - totalDebit;

    return {
      count: selected.length,
      totalCredit,
      totalDebit,
      netAmount,
    };
  };

  const summary = calculateSummary();

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5" />
            Import Preview
          </CardTitle>
          <CardDescription>
            Review and select transactions to import into {bankAccount.accountName}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">
                {summary.count}
              </div>
              <div className="text-sm text-blue-700">
                Selected Transactions
              </div>
            </div>

            <div className="text-center p-4 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">
                {formatAmount(summary.totalCredit)}
              </div>
              <div className="text-sm text-green-700">
                Total Credits
              </div>
            </div>

            <div className="text-center p-4 bg-red-50 rounded-lg">
              <div className="text-2xl font-bold text-red-600">
                {formatAmount(summary.totalDebit)}
              </div>
              <div className="text-sm text-red-700">
                Total Debits
              </div>
            </div>

            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className={`text-2xl font-bold ${getAmountColor(summary.netAmount)}`}>
                {formatAmount(summary.netAmount)}
              </div>
              <div className="text-sm text-gray-700">
                Net Amount
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transaction List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Transactions ({parseResult.transactions.length})</CardTitle>
            <div className="flex items-center gap-2">
              <Checkbox
                id="select-all"
                checked={selectedTransactions.size === parseResult.transactions.length}
                onCheckedChange={handleSelectAll}
              />
              <label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
                Select All
              </label>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            <div className="space-y-2">
              {parseResult.transactions.map((transaction: ImportedTransaction, index: number) => (
                <div
                  key={index}
                  className={`flex items-center gap-4 p-4 rounded-lg border ${
                    selectedTransactions.has(index)
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-muted/50'
                  } transition-colors`}
                >
                  <Checkbox
                    checked={selectedTransactions.has(index)}
                    onCheckedChange={() => handleTransactionToggle(index)}
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {getTransactionIcon(transaction.amount)}
                          <span className="font-medium truncate">
                            {transaction.description}
                          </span>
                          {transaction.category && (
                            <Badge variant="secondary" className="text-xs">
                              {transaction.category}
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatDate(transaction.date)}
                          </span>

                          {transaction.merchant && (
                            <span className="truncate">
                              {transaction.merchant}
                            </span>
                          )}

                          {transaction.reference && (
                            <span className="text-xs bg-muted px-2 py-1 rounded">
                              Ref: {transaction.reference}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className={`text-lg font-semibold ${getAmountColor(transaction.amount)}`}>
                          {formatAmount(transaction.amount)}
                        </div>

                        {transaction.balance !== undefined && (
                          <div className="text-sm text-muted-foreground">
                            Balance: {formatAmount(transaction.balance)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {parseResult.transactions.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No transactions found in the file</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Warnings and Information */}
      {(parseResult.duplicates?.length ?? 0) > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {parseResult.duplicates?.length ?? 0} potential duplicate transactions were found.
            These will be automatically skipped during import to prevent duplicates.
          </AlertDescription>
        </Alert>
      )}

      {parseResult.errors && parseResult.errors.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {parseResult.errors.length} rows had parsing errors and were excluded from the preview.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="pt-6">
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>• Transactions will be automatically categorized based on merchant and description</p>
            <p>• Duplicate transactions will be skipped to prevent double entries</p>
            <p>• You can review and edit imported transactions later in the Bank Accounts section</p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} className="flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>

        <Button
          onClick={handleImport}
          disabled={selectedTransactions.size === 0 || loading}
          className="flex items-center gap-2"
        >
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
              Importing...
            </>
          ) : (
            <>
              <Upload className="w-4 h-4" />
              Import {selectedTransactions.size} Transactions
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
