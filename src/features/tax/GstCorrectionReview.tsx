import { useState } from 'react';
import type { CreateGstCorrectionRequest, GstPeriodCorrection } from '@ledgercraft/contracts';
import { gstCorrectionActions, gstCorrectionSourceTypes } from '@ledgercraft/contracts';
import { exactMoney, PreparationField } from '@/components/accounting/PreparationFields';
import { Button } from '@/components/ui/button';
import { gstCorrectionApi } from './gstCorrectionApi';

const sourceLabels: Record<(typeof gstCorrectionSourceTypes)[number], string> = {
  invoice: 'Invoice', bill: 'Bill', expense: 'Expense', credit_note: 'Credit note', payment: 'Customer payment', bill_payment: 'Supplier payment', customs_gst: 'Customs GST',
};
const actionLabels: Record<(typeof gstCorrectionActions)[number], string> = { added: 'Added', changed: 'Changed', voided: 'Voided' };

const blank = { originalPeriodStart: '', originalPeriodEnd: '', sourceType: 'invoice' as const, sourceId: '', action: 'changed' as const, kind: 'output' as const, amount: '', reason: '' };

export function GstCorrectionReview({ from, to, corrections = [], canWrite = true, onChanged }: {
  from: string; to: string; corrections?: GstPeriodCorrection[]; canWrite?: boolean; onChanged?: () => void;
}) {
  const [form, setForm] = useState(blank);
  const [resolveReason, setResolveReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const pending = corrections.filter((row) => row.status === 'pending' || row.status === 'over_limit');
  function set<K extends keyof typeof blank>(key: K, value: (typeof blank)[K]) { setForm((current) => ({ ...current, [key]: value })); setError(''); }

  async function record() {
    if (!canWrite) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const input: CreateGstCorrectionRequest = { ...form, sourceId: form.sourceId.trim(), amount: exactMoney(form.amount), reason: form.reason.trim() };
      await gstCorrectionApi.create(input);
      setNotice('The correction will be included in this return. The filed snapshot is unchanged.');
      setForm(blank); onChanged?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The correction could not be recorded.');
      onChanged?.();
    } finally { setBusy(false); }
  }

  async function resolve(id: string) {
    if (!canWrite || resolveReason.trim().length < 8) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await gstCorrectionApi.resolve(id, { resolution: 'amend_in_myir', reason: resolveReason.trim() });
      setNotice('This return will not include that correction. Amend the original period in myIR.');
      setResolveReason(''); onChanged?.();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'The correction could not be updated.'); }
    finally { setBusy(false); }
  }

  return <section aria-label="Prior period corrections" className="space-y-4 border-t border-border pt-4">
    <div>
      <h3 className="font-semibold">Prior-period corrections</h3>
      <p className="mt-1 max-w-prose text-sm text-muted-foreground">A change that belongs in an already filed GST period stays out of that snapshot. Record the GST difference here. It is carried into this return only when the net discrepancy is within the IRD limit.</p>
    </div>
    {pending.length === 0 ? <p className="text-sm text-muted-foreground">No pending corrections for {from} to {to}.</p> : <ul className="space-y-3">
      {pending.map((row) => <li key={row.id} className="space-y-2 rounded-xl border border-border p-4">
        <p className="text-sm font-medium tabular-nums">{row.kind === 'output' ? 'Box 9' : 'Box 13'} {row.amount} · {actionLabels[row.action]} {sourceLabels[row.sourceType]}</p>
        <p className="text-sm text-muted-foreground">Original period {row.originalPeriodStart} to {row.originalPeriodEnd}. Source {row.sourceId}.</p>
        <p className="text-sm">{row.reason}</p>
        {row.status === 'over_limit' ? <p role="alert" className="text-sm text-destructive">{row.guidance ?? 'This correction is over the IRD carry-forward limit. Amend the original return in myIR.'} Net discrepancy {row.netDiscrepancy}; limit {row.limit}.</p> : <p className="text-sm text-muted-foreground">Within the IRD limit of {row.limit}. It will be included in this return.</p>}
      </li>)}
    </ul>}
    {canWrite && pending.some((row) => row.status === 'over_limit') && <div className="space-y-3">
      <PreparationField label="Reason for amending in myIR" value={resolveReason} disabled={busy} onChange={setResolveReason} />
      <div className="flex flex-wrap gap-2">{pending.filter((row) => row.status === 'over_limit').map((row) => <Button key={row.id} type="button" variant="outline" disabled={busy || resolveReason.trim().length < 8} onClick={() => void resolve(row.id)}>Amend {row.amount} in myIR</Button>)}</div>
    </div>}
    {canWrite && <details className="rounded-xl border border-border p-4">
      <summary className="cursor-pointer font-medium">Record a prior-period correction</summary>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <PreparationField label="Original filed period start" type="date" value={form.originalPeriodStart} disabled={busy} onChange={(value) => set('originalPeriodStart', value)} />
        <PreparationField label="Original filed period end" type="date" value={form.originalPeriodEnd} disabled={busy} onChange={(value) => set('originalPeriodEnd', value)} />
        <label className="space-y-2 text-sm font-medium">Source transaction<select aria-label="Correction source type" className="flex h-11 w-full rounded-xl border border-input bg-background px-3" value={form.sourceType} disabled={busy} onChange={(event) => set('sourceType', event.target.value as typeof form.sourceType)}>{gstCorrectionSourceTypes.map((type) => <option key={type} value={type}>{sourceLabels[type]}</option>)}</select></label>
        <PreparationField label="Source transaction id" value={form.sourceId} disabled={busy} onChange={(value) => set('sourceId', value)} />
        <label className="space-y-2 text-sm font-medium">What happened<select aria-label="Correction action" className="flex h-11 w-full rounded-xl border border-input bg-background px-3" value={form.action} disabled={busy} onChange={(event) => set('action', event.target.value as typeof form.action)}>{gstCorrectionActions.map((action) => <option key={action} value={action}>{actionLabels[action]}</option>)}</select></label>
        <label className="space-y-2 text-sm font-medium">GST box<select aria-label="Correction GST box" className="flex h-11 w-full rounded-xl border border-input bg-background px-3" value={form.kind} disabled={busy} onChange={(event) => set('kind', event.target.value as typeof form.kind)}><option value="output">Output GST (Box 9)</option><option value="input">Input GST (Box 13)</option></select></label>
        <PreparationField label="GST discrepancy" value={form.amount} disabled={busy} onChange={(value) => set('amount', value)} />
        <PreparationField label="Correction reason" value={form.reason} disabled={busy} onChange={(value) => set('reason', value)} />
      </div>
      <Button className="mt-4" type="button" disabled={busy} onClick={() => void record()}>Record correction</Button>
    </details>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
  </section>;
}
