import { useEffect, useState } from 'react';
import type { Payment } from '@/types/payment';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface PaymentReversalDialogProps {
  payment: Payment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (input: { reason: string; reversalDate: string }) => Promise<void>;
  loading?: boolean;
}

function localIsoDate(date = new Date()): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function PaymentReversalDialog({
  payment,
  open,
  onOpenChange,
  onConfirm,
  loading = false,
}: Readonly<PaymentReversalDialogProps>) {
  const [reason, setReason] = useState('');
  const [reversalDate, setReversalDate] = useState(localIsoDate());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setReason('');
    setReversalDate(localIsoDate());
    setError(null);
  }, [open, payment?.id]);

  const submit = async () => {
    const trimmedReason = reason.trim();
    if (trimmedReason.length < 3) {
      setError('Enter a reason for reversing this payment.');
      return;
    }
    if (!payment || reversalDate < payment.paymentDate) {
      setError('Reversal date cannot be before the payment date.');
      return;
    }
    setError(null);
    await onConfirm({ reason: trimmedReason, reversalDate });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!loading) onOpenChange(next); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reverse payment</DialogTitle>
          <DialogDescription>
            The original payment and receipt stay in the audit trail. LedgerCraft will post an equal reversal and reopen the invoice balance.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reversal-date">Reversal date</Label>
            <Input
              id="reversal-date"
              type="date"
              min={payment?.paymentDate}
              value={reversalDate}
              onChange={(event) => setReversalDate(event.target.value)}
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reversal-reason">Reason</Label>
            <Textarea
              id="reversal-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="For example, payment entered against the wrong invoice"
              maxLength={500}
              disabled={loading}
            />
          </div>
          {error ? <p role="alert" className="text-sm font-medium text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancel</Button>
          <Button variant="destructive" onClick={() => { void submit(); }} disabled={loading || !payment}>
            {loading ? 'Reversing…' : 'Reverse payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
