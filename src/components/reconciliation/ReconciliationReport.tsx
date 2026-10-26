/**
 * Reconciliation Report
 * 
 * Bank reconciliation statement/report showing:
 * - Bank statement balance
 * - Adjustments to bank balance
 * - Book balance
 * - Adjustments to book balance
 * - Final reconciled balances
 */

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Download,
  FileText,
  CheckCircle2,
  XCircle,
  Building2,
  Calendar,
  Printer,
} from 'lucide-react';

import { ReconciliationSummary } from '@/types/reconciliation';
import { csvRow } from '@/lib/csv';

interface ReconciliationReportProps {
  summary: ReconciliationSummary;
}

export function ReconciliationReport({ summary }: ReconciliationReportProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-NZ', {
      style: 'currency',
      currency: 'NZD',
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-NZ', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExport = () => {
    // Create CSV content
    const lines = [
      'BANK RECONCILIATION STATEMENT',
      '',
      csvRow([`Account: ${summary.bankAccountName} - ${summary.bankName}`]),
      csvRow([`Period: ${formatDate(summary.session.statementStartDate)} to ${formatDate(summary.session.statementEndDate)}`]),
      '',
      'BANK SIDE',
      csvRow(['Statement Closing Balance', summary.bankBalance]),
    ];

    if (summary.outstandingDeposits.length > 0) {
      lines.push('Add: Deposits in Transit');
      summary.outstandingDeposits.forEach(d => {
        lines.push(csvRow([`  ${d.description}`, d.amount]));
      });
    }

    if (summary.outstandingChecks.length > 0) {
      lines.push('Less: Outstanding Checks');
      summary.outstandingChecks.forEach(c => {
        lines.push(csvRow([`  ${c.description}`, c.amount]));
      });
    }

    lines.push(csvRow(['Adjusted Bank Balance', summary.adjustedBankBalance]));
    lines.push('');
    lines.push('BOOK SIDE');
    lines.push(csvRow(['Book Balance', summary.bookBalance]));
    
    if (summary.otherAdjustments.length > 0) {
      lines.push('Adjustments');
      summary.otherAdjustments.forEach(a => {
        lines.push(csvRow([`  ${a.description}`, a.affectsBook ? a.amount : -a.amount]));
      });
    }

    lines.push(csvRow(['Adjusted Book Balance', summary.adjustedBookBalance]));
    lines.push('');
    lines.push(csvRow(['DIFFERENCE', summary.finalDifference]));
    lines.push(csvRow(['STATUS', summary.isReconciled ? 'RECONCILED' : 'NOT RECONCILED']));

    // Download
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bank-reconciliation-${summary.session.statementEndDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-blue-100">
                <FileText className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <CardTitle className="text-xl">Bank Reconciliation Statement</CardTitle>
                <CardDescription className="flex items-center gap-4 mt-1">
                  <span className="flex items-center gap-1">
                    <Building2 className="h-4 w-4" />
                    {summary.bankAccountName} - {summary.bankName}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    {formatDate(summary.session.statementStartDate)} to {formatDate(summary.session.statementEndDate)}
                  </span>
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handlePrint} className="gap-2">
                <Printer className="h-4 w-4" />
                Print
              </Button>
              <Button variant="outline" onClick={handleExport} className="gap-2">
                <Download className="h-4 w-4" />
                Export CSV
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Main Report */}
      <div className="grid grid-cols-2 gap-6">
        {/* Bank Side */}
        <Card>
          <CardHeader className="bg-blue-50 border-b">
            <CardTitle className="text-lg text-blue-700">Bank Balance Reconciliation</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            {/* Statement Balance */}
            <div className="flex justify-between items-center">
              <span className="font-medium">Balance per Bank Statement</span>
              <span className="text-lg font-bold">{formatCurrency(summary.bankBalance)}</span>
            </div>

            <Separator />

            {/* Deposits in Transit */}
            {summary.outstandingDeposits.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-green-700">Add: Deposits in Transit</p>
                {summary.outstandingDeposits.map(deposit => (
                  <div key={deposit.id} className="flex justify-between items-center text-sm pl-4">
                    <span className="text-muted-foreground">
                      {deposit.description}
                      {deposit.referenceNumber && ` (${deposit.referenceNumber})`}
                    </span>
                    <span className="text-green-600">+{formatCurrency(deposit.amount)}</span>
                  </div>
                ))}
                <div className="flex justify-between items-center pl-4 font-medium">
                  <span>Total Deposits in Transit</span>
                  <span className="text-green-600">+{formatCurrency(summary.totalOutstandingDeposits)}</span>
                </div>
              </div>
            )}

            {/* Outstanding Checks */}
            {summary.outstandingChecks.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-red-700">Less: Outstanding Checks</p>
                {summary.outstandingChecks.map(check => (
                  <div key={check.id} className="flex justify-between items-center text-sm pl-4">
                    <span className="text-muted-foreground">
                      {check.description}
                      {check.referenceNumber && ` (Check #${check.referenceNumber})`}
                    </span>
                    <span className="text-red-600">-{formatCurrency(check.amount)}</span>
                  </div>
                ))}
                <div className="flex justify-between items-center pl-4 font-medium">
                  <span>Total Outstanding Checks</span>
                  <span className="text-red-600">-{formatCurrency(summary.totalOutstandingChecks)}</span>
                </div>
              </div>
            )}

            <Separator />

            {/* Adjusted Bank Balance */}
            <div className="flex justify-between items-center pt-2">
              <span className="text-lg font-bold">Adjusted Bank Balance</span>
              <span className="text-xl font-bold text-blue-600">
                {formatCurrency(summary.adjustedBankBalance)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Book Side */}
        <Card>
          <CardHeader className="bg-green-50 border-b">
            <CardTitle className="text-lg text-green-700">Book Balance Reconciliation</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            {/* Book Balance */}
            <div className="flex justify-between items-center">
              <span className="font-medium">Balance per Books</span>
              <span className="text-lg font-bold">{formatCurrency(summary.bookBalance)}</span>
            </div>

            <Separator />

            {/* Other Adjustments */}
            {summary.otherAdjustments.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">Adjustments Required</p>
                {summary.otherAdjustments.map(adj => (
                  <div key={adj.id} className="flex justify-between items-center text-sm pl-4">
                    <span className="text-muted-foreground">
                      {adj.description}
                      <Badge variant="outline" className="ml-2 text-xs capitalize">
                        {adj.adjustmentType.replace('_', ' ')}
                      </Badge>
                    </span>
                    <span className={adj.affectsBook ? 'text-green-600' : 'text-red-600'}>
                      {adj.affectsBook ? '+' : '-'}{formatCurrency(adj.amount)}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between items-center pl-4 font-medium">
                  <span>Total Adjustments</span>
                  <span>{formatCurrency(summary.totalOtherAdjustments)}</span>
                </div>
              </div>
            ) : (
              <div className="py-4 text-center text-sm text-muted-foreground">
                No book adjustments required
              </div>
            )}

            <Separator />

            {/* Adjusted Book Balance */}
            <div className="flex justify-between items-center pt-2">
              <span className="text-lg font-bold">Adjusted Book Balance</span>
              <span className="text-xl font-bold text-green-600">
                {formatCurrency(summary.adjustedBookBalance)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Final Status */}
      <Card className={summary.isReconciled ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {summary.isReconciled ? (
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              ) : (
                <XCircle className="h-8 w-8 text-red-600" />
              )}
              <div>
                <h3 className={`text-xl font-bold ${summary.isReconciled ? 'text-green-700' : 'text-red-700'}`}>
                  {summary.isReconciled ? 'Reconciliation Complete' : 'Reconciliation Incomplete'}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {summary.isReconciled 
                    ? 'Bank and book balances are in agreement' 
                    : 'There is still a difference between bank and book balances'}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Difference</p>
              <p className={`text-2xl font-bold ${
                summary.isReconciled ? 'text-green-600' : 'text-red-600'
              }`}>
                {formatCurrency(summary.finalDifference)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reconciliation Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Statement Period</span>
                <span>{formatDate(summary.session.statementStartDate)} - {formatDate(summary.session.statementEndDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Statement Opening</span>
                <span>{formatCurrency(summary.session.statementOpeningBalance)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Statement Closing</span>
                <span>{formatCurrency(summary.session.statementClosingBalance)}</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Transactions Matched</span>
                <span>{summary.session.matchedCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Adjustments</span>
                <span>
                  {summary.outstandingDeposits.length + summary.outstandingChecks.length + summary.otherAdjustments.length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <Badge className={summary.isReconciled ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>
                  {summary.isReconciled ? 'Reconciled' : 'Unreconciled'}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

