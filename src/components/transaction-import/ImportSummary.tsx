import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  CheckCircle, 
  AlertCircle, 
  RotateCcw,
  Eye,
  TrendingUp,
  TrendingDown,
  CreditCard,
  BarChart3,
  FileText
} from 'lucide-react';
import { BankAccount, TransactionImportResult } from '@/types/bankTransaction';

interface ImportSummaryProps {
  importResult: TransactionImportResult;
  bankAccount: BankAccount;
  onStartOver: () => void;
  onViewTransactions: () => void;
}

export function ImportSummary({
  importResult,
  bankAccount,
  onStartOver,
  onViewTransactions
}: ImportSummaryProps) {
  const formatAmount = (amount: number, currency: string = bankAccount.currency) => {
    return new Intl.NumberFormat('en-NZ', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  };

  const getSuccessRate = () => {
    if (importResult.total === 0) return 0;
    return Math.round((importResult.imported / importResult.total) * 100);
  };

  const renderSummaryCards = () => (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card className="bg-success/10 shadow-none">
        <CardContent className="pt-6">
          <div className="flex items-center">
            <CheckCircle className="h-8 w-8 text-success" aria-hidden="true" />
            <div className="ml-4">
              <p className="text-2xl font-bold text-success tabular-nums">
                {importResult.imported}
              </p>
              <p className="text-foreground text-sm font-medium">
                Successfully Imported
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-warning/10 shadow-none">
        <CardContent className="pt-6">
          <div className="flex items-center">
            <AlertCircle className="h-8 w-8 text-warning" aria-hidden="true" />
            <div className="ml-4">
              <p className="text-2xl font-bold text-warning tabular-nums">
                {importResult.skipped}
              </p>
              <p className="text-foreground text-sm font-medium">
                Skipped (Duplicates)
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-destructive/10 shadow-none">
        <CardContent className="pt-6">
          <div className="flex items-center">
            <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
            <div className="ml-4">
              <p className="text-2xl font-bold text-destructive tabular-nums">
                {importResult.errors}
              </p>
              <p className="text-foreground text-sm font-medium">
                Failed to Import
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-info/10 shadow-none">
        <CardContent className="pt-6">
          <div className="flex items-center">
            <BarChart3 className="h-8 w-8 text-info" aria-hidden="true" />
            <div className="ml-4">
              <p className="text-2xl font-bold text-info tabular-nums">
                {getSuccessRate()}%
              </p>
              <p className="text-foreground text-sm font-medium">
                Success Rate
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderFinancialSummary = () => {
    if (!importResult.summary) return null;

    const { totalCredits, totalDebits, netAmount, categoryCounts } = importResult.summary;

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Financial Summary
          </CardTitle>
          <CardDescription>
            Overview of imported transaction amounts and categories
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <h4 className="font-medium">Transaction Amounts</h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-xl bg-success/10 p-3">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-success" aria-hidden="true" />
                    <span className="font-medium">Total Credits</span>
                  </div>
                  <span className="font-semibold text-success tabular-nums">
                    {formatAmount(totalCredits)}
                  </span>
                </div>
                
                <div className="flex items-center justify-between rounded-xl bg-destructive/10 p-3">
                  <div className="flex items-center gap-2">
                    <TrendingDown className="w-4 h-4 text-destructive" aria-hidden="true" />
                    <span className="font-medium">Total Debits</span>
                  </div>
                  <span className="font-semibold text-destructive tabular-nums">
                    {formatAmount(totalDebits)}
                  </span>
                </div>
                
                <div className="flex items-center justify-between rounded-xl bg-muted p-3">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                    <span className="font-medium">Net Amount</span>
                  </div>
                  <span className={`font-semibold tabular-nums ${netAmount >= 0 ? 'text-success' : 'text-destructive'}`}>
                    {formatAmount(netAmount)}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="font-medium">Categories</h4>
              <div className="space-y-2">
                {Object.entries(categoryCounts).map(([category, count]) => (
                  <div key={category} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                    <span className="text-sm font-medium">{category}</span>
                    <Badge variant="secondary">
                      {count as number} transaction{(count as number) !== 1 ? 's' : ''}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderNextSteps = () => (
    <Card>
      <CardHeader>
        <CardTitle>What's Next?</CardTitle>
        <CardDescription>
          Your transactions have been successfully imported. Here's what you can do next:
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <Eye className="w-5 h-5 text-info mt-0.5" aria-hidden="true" />
            <div>
              <h4 className="font-medium">Review Transactions</h4>
              <p className="text-sm text-muted-foreground">
                View and edit your imported transactions in the Bank Accounts section.
              </p>
            </div>
          </div>
          
          <div className="flex items-start gap-3">
            <FileText className="w-5 h-5 text-success mt-0.5" aria-hidden="true" />
            <div>
              <h4 className="font-medium">Categorize & Tag</h4>
              <p className="text-sm text-muted-foreground">
                Transactions have been automatically categorized, but you can refine them for better reporting.
              </p>
            </div>
          </div>
          
          <div className="flex items-start gap-3">
            <BarChart3 className="w-5 h-5 text-primary mt-0.5" aria-hidden="true" />
            <div>
              <h4 className="font-medium">Generate Reports</h4>
              <p className="text-sm text-muted-foreground">
                Use the reporting tools to analyze your spending patterns and create financial reports.
              </p>
            </div>
          </div>
          
          <div className="flex items-start gap-3">
            <CreditCard className="w-5 h-5 text-warning mt-0.5" aria-hidden="true" />
            <div>
              <h4 className="font-medium">Reconcile Account</h4>
              <p className="text-sm text-muted-foreground">
                Compare imported transactions with your bank statement to ensure accuracy.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-8">
      {/* Success Header */}
      <Card className="bg-success/10 shadow-none">
        <CardContent className="pt-6">
          <div className="text-center">
            <CheckCircle className="w-14 h-14 text-success mx-auto mb-4" aria-hidden="true" />
            <h2 className="text-2xl font-bold text-foreground mb-2">
              Import complete
            </h2>
            <p className="text-muted-foreground">
              {importResult.imported} transactions have been imported into{' '}
              <strong>{bankAccount.accountName}</strong>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      {renderSummaryCards()}

      {/* Financial Summary */}
      {renderFinancialSummary()}

      {/* Alerts for issues */}
      {importResult.skipped > 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {importResult.skipped} duplicate transactions were automatically skipped to prevent 
            double entries in your account.
          </AlertDescription>
        </Alert>
      )}

      {importResult.errors > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {importResult.errors} transactions failed to import due to validation errors. 
            Please check your CSV file format and try again.
          </AlertDescription>
        </Alert>
      )}

      {/* Next Steps */}
      {renderNextSteps()}

      {/* Action Buttons */}
      <div className="flex flex-col-reverse justify-center gap-3 sm:flex-row">
        <Button 
          onClick={onViewTransactions}
          size="lg"
          className="flex items-center gap-2"
        >
          <Eye className="w-4 h-4" />
          View Transactions
        </Button>
        
        <Button 
          variant="outline" 
          onClick={onStartOver}
          size="lg"
          className="flex items-center gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          Import More Files
        </Button>
      </div>

      {/* Account Info */}
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-sm text-muted-foreground">
            <p>
              Transactions imported to: <strong>{bankAccount.accountName}</strong>
            </p>
            <p>
              Bank: {bankAccount.bankName} | Account: {bankAccount.accountNumber}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
