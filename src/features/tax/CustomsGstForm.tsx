import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { exactMoney, PreparationField } from '@/components/accounting/PreparationFields';
import { createCustomsGst } from './customsGstApi';

export function CustomsGstForm({ disabled = false, onCreated }: { disabled?: boolean; onCreated?: () => void }) {
  const [invoiceDate, setInvoiceDate] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  async function submit() {
    setBusy(true); setError(''); setSaved('');
    try {
      const entry = await createCustomsGst({ invoiceDate, ...(paymentDate ? { paymentDate } : {}), amount: exactMoney(amount), reference, description });
      setSaved(entry.claimDate ? `Customs GST ${entry.amount} recorded. Claim date ${entry.claimDate}.` : `Customs GST ${entry.amount} recorded. It is claimed when paid.`);
      setAmount(''); setReference(''); setDescription('');
      onCreated?.();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Customs GST could not be recorded.'); }
    finally { setBusy(false); }
  }
  return <fieldset className="space-y-3 rounded-xl border border-border p-4"><legend className="px-1 font-medium">Customs GST</legend>
    <p className="text-sm text-muted-foreground">Record the GST on an import assessment. It posts GST only, goes to Box 13, and is not added to Box 11. Invoice basis claims the earlier of the assessment and the payment. Payments and hybrid basis claim it when paid.</p>
    <PreparationField label="Customs invoice date" type="date" value={invoiceDate} disabled={busy || disabled} onChange={setInvoiceDate} />
    <PreparationField label="Customs payment date" type="date" value={paymentDate} disabled={busy || disabled} onChange={setPaymentDate} />
    <PreparationField label="Customs GST amount" value={amount} disabled={busy || disabled} onChange={setAmount} />
    <PreparationField label="Customs reference" value={reference} disabled={busy || disabled} onChange={setReference} />
    <PreparationField label="Customs description" value={description} disabled={busy || disabled} onChange={setDescription} />
    <Button type="button" variant="outline" disabled={busy || disabled || !invoiceDate || !amount || !reference || !description} onClick={() => void submit()}>Record Customs GST</Button>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {saved && <p role="status" className="text-sm">{saved}</p>}
  </fieldset>;
}
