import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { reconciliationService } from '@/services/reconciliationService';
import { moneyToCents } from '../../../api/src/modules/invoices/money';

interface AdjustmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  onAdjustmentCreated: () => void;
}
const ADJUSTMENT_TYPES = [
  { value: 'outstanding_check', label: 'Outstanding Check', description: 'A payment already posted in the books that has not cleared the bank.' },
  { value: 'deposit_in_transit', label: 'Deposit in Transit', description: 'A receipt already posted in the books that has not reached the statement.' },
  { value: 'bank_error', label: 'Bank Error', description: 'A supported bank statement correction. Positive adds to the statement; negative subtracts.' },
] as const;
type StatementAdjustmentType = typeof ADJUSTMENT_TYPES[number]['value'];

export function AdjustmentDialog({ open, onOpenChange, sessionId, onAdjustmentCreated }: AdjustmentDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adjustmentType, setAdjustmentType] = useState<StatementAdjustmentType>('outstanding_check');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  useEffect(() => {
    if (open) { setAdjustmentType('outstanding_check'); setDescription(''); setAmount(''); setReferenceNumber(''); setError(null); }
  }, [open]);
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(null);
    if (!description.trim()) { setError('Please enter a description'); return; }
    if (!/^-?\d+(?:\.\d{1,2})?$/.test(amount.trim())) { setError('Enter an amount with at most 2 decimal places'); return; }
    const cents = moneyToCents(amount.trim());
    if (cents === 0n || (adjustmentType !== 'bank_error' && cents < 0n)) {
      setError(adjustmentType === 'bank_error' ? 'Enter a non-zero bank correction amount' : 'Enter a positive amount for an outstanding payment or deposit'); return;
    }
    setLoading(true);
    try {
      await reconciliationService.createAdjustment(sessionId, { adjustmentType, description: description.trim(), amount: amount.trim(), affectsBank: true, affectsBook: false, referenceNumber: referenceNumber.trim() || undefined });
      onAdjustmentCreated(); onOpenChange(false); toast.success('Statement adjustment added');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Failed to create adjustment'); }
    finally { setLoading(false); }
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-[500px]"><form onSubmit={handleSubmit}>
    <DialogHeader><DialogTitle>Add Reconciliation Adjustment</DialogTitle><DialogDescription>Explain statement differences without changing the posted books.</DialogDescription></DialogHeader>
    <div className="space-y-4 py-4">
      <Alert><AlertDescription>Record bank fees, interest, returned payments and book corrections as actual bank transactions, expenses or balanced journals first. This form only adjusts the statement side.</AlertDescription></Alert>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <div className="space-y-2"><Label htmlFor="adjustment-type">Adjustment Type</Label><Select value={adjustmentType} onValueChange={value => setAdjustmentType(value as StatementAdjustmentType)} disabled={loading}><SelectTrigger id="adjustment-type"><SelectValue /></SelectTrigger><SelectContent>{ADJUSTMENT_TYPES.map(type => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}</SelectContent></Select><p className="text-xs text-muted-foreground">{ADJUSTMENT_TYPES.find(type => type.value === adjustmentType)?.description}</p></div>
      <div className="space-y-2"><Label htmlFor="adjustment-description">Description</Label><Textarea id="adjustment-description" value={description} onChange={event => setDescription(event.target.value)} disabled={loading} rows={2} required /></div>
      <div className="space-y-2"><Label htmlFor="adjustment-amount">Amount</Label><Input id="adjustment-amount" type="text" inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} disabled={loading} placeholder={adjustmentType === 'bank_error' ? 'For example, -0.03' : '0.00'} required /></div>
      <div className="space-y-2"><Label htmlFor="adjustment-reference">Reference Number (Optional)</Label><Input id="adjustment-reference" value={referenceNumber} onChange={event => setReferenceNumber(event.target.value)} disabled={loading} /></div>
      <p className="text-sm text-muted-foreground">Book balances continue to come from posted ledger entries.</p>
    </div>
    <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancel</Button><Button type="submit" disabled={loading}>{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Add Adjustment</Button></DialogFooter>
  </form></DialogContent></Dialog>;
}
