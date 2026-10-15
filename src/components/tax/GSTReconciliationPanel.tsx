import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Clock, ListChecks } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  BankAccountCoverage,
  BankCoverageStatus,
  GstPeriodReconciliation,
} from '@/utils/gstReconciliation';

interface GSTReconciliationPanelProps {
  reconciliation: GstPeriodReconciliation | null;
  loading: boolean;
  acknowledged: boolean;
  onAcknowledgedChange: (value: boolean) => void;
}

const currency = (amount: number) =>
  new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' }).format(amount);

function coverageLabel(status: BankCoverageStatus): string {
  switch (status) {
    case 'complete':
      return 'Reconciled';
    case 'partial':
      return 'Partial';
    case 'in_progress':
      return 'In progress';
    case 'missing':
      return 'Missing';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function CoverageBadge({ status }: { status: BankCoverageStatus }) {
  const styles: Record<BankCoverageStatus, string> = {
    complete: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    partial: 'bg-amber-50 text-amber-700 border-amber-200',
    in_progress: 'bg-blue-50 text-blue-700 border-blue-200',
    missing: 'bg-rose-50 text-rose-700 border-rose-200',
  };

  return (
    <Badge variant="outline" className={cn('rounded-full', styles[status])}>
      {coverageLabel(status)}
    </Badge>
  );
}

function AccountRow({ account }: { account: BankAccountCoverage }) {
  const reconHref = account.sessionId
    ? `/reconciliation?session=${account.sessionId}`
    : '/reconciliation';

  return (
    <Link
      to={reconHref}
      className="flex items-center gap-4 rounded-2xl border border-border bg-card px-4 py-4 transition-colors hover:bg-muted/60"
    >
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-foreground">{account.accountName}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{account.bankName}</p>
      </div>
      <CoverageBadge status={account.status} />
    </Link>
  );
}

export function GSTReconciliationPanel({
  reconciliation,
  loading,
  acknowledged,
  onAcknowledgedChange,
}: GSTReconciliationPanelProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-24 animate-pulse rounded-2xl bg-muted" />
        <div className="h-24 animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  if (!reconciliation) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>Select a GST period first so we can check bank reconciliations.</AlertDescription>
      </Alert>
    );
  }

  const needsAcknowledgement = reconciliation.readiness === 'warning';

  return (
    <div className="space-y-6">
      {reconciliation.readiness === 'ready' && (
        <Alert className="border-emerald-200 bg-emerald-50 text-emerald-900">
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>
            Bank reconciliations cover this period and GST figures match the books.
          </AlertDescription>
        </Alert>
      )}

      {reconciliation.readiness === 'not_applicable' && (
        <Alert>
          <ListChecks className="h-4 w-4" />
          <AlertDescription>
            No bank accounts are set up, so GST will be filed from invoices and expenses only. Add a bank
            account later if you want statement matching.
          </AlertDescription>
        </Alert>
      )}

      {reconciliation.readiness === 'warning' && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-950">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Finish bank recs before filing if you can. You can still save a draft after confirming the
            outstanding items below.
          </AlertDescription>
        </Alert>
      )}

      {reconciliation.accounts.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h4 className="font-semibold">Bank reconciliations</h4>
            <Button asChild variant="outline" size="sm">
              <Link to="/reconciliation">Open recs</Link>
            </Button>
          </div>
          <div className="space-y-2">
            {reconciliation.accounts.map((account) => (
              <AccountRow key={account.accountId} account={account} />
            ))}
          </div>
        </div>
      )}

      {reconciliation.unreconciledTransactionCount > 0 && (
        <div className="space-y-3">
          <h4 className="font-semibold">Unmatched bank transactions</h4>
          <p className="text-sm text-muted-foreground">
            {reconciliation.unreconciledTransactionCount} transaction
            {reconciliation.unreconciledTransactionCount === 1 ? '' : 's'} in this period are still unmatched.
          </p>
          <div className="divide-y divide-border rounded-2xl border border-border">
            {reconciliation.unreconciledSamples.map((sample) => (
              <div key={sample.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{sample.description}</p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(sample.date).toLocaleDateString('en-NZ')}
                  </p>
                </div>
                <p className="shrink-0 font-semibold tabular-nums">{currency(sample.amount)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        <h4 className="font-semibold">GST figures vs books</h4>
        <div className="overflow-hidden rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Box</th>
                <th className="px-4 py-3 text-right font-medium">Books</th>
                <th className="px-4 py-3 text-right font-medium">Return</th>
                <th className="px-4 py-3 text-right font-medium">Difference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {reconciliation.figures.map((line) => (
                <tr key={line.id}>
                  <td className="px-4 py-3">{line.label}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{currency(line.books)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{currency(line.returnValue)}</td>
                  <td
                    className={cn(
                      'px-4 py-3 text-right tabular-nums',
                      Math.abs(line.difference) >= 0.01 ? 'text-rose-600 font-semibold' : 'text-muted-foreground'
                    )}
                  >
                    {currency(line.difference)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {reconciliation.issues.length > 0 && (
        <ul className="space-y-2 text-sm text-muted-foreground">
          {reconciliation.issues.map((issue) => (
            <li key={issue} className="flex items-start gap-2">
              <Clock className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{issue}</span>
            </li>
          ))}
        </ul>
      )}

      {needsAcknowledgement && (
        <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/40 px-4 py-4">
          <Checkbox
            id="ack-gst-recon"
            checked={acknowledged}
            onCheckedChange={(checked) => onAcknowledgedChange(checked === true)}
          />
          <Label htmlFor="ack-gst-recon" className="text-sm font-normal leading-relaxed">
            I have reviewed unmatched items and GST differences, and I still want to save this return.
          </Label>
        </div>
      )}
    </div>
  );
}
