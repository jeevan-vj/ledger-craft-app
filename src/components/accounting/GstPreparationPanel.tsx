import { preparationError } from '@/features/accounting-completion/preparationError';
import { useState } from 'react';
import type { GstAdjustment, GstPreparationResponse } from '@ledgercraft/contracts';
import { Button } from '@/components/ui/button';
import { ContentPanel } from '@/components/ui/ContentPanel';
import { usePreparedDraft } from '@/features/accounting-completion/usePreparedDraft';
import { accountingCompletionApi } from '@/features/accounting-completion/api';
import { exactMoney, PreparationCheck, PreparationField, PreparationValue, today } from './PreparationFields';

const negativeComponents = (value: GstPreparationResponse) => [value.totalSales, value.totalPurchases, value.gstOnSales, value.gstOnPurchases].some((amount) => amount.startsWith('-') && /[1-9]/.test(amount));
const needsReview = (value: GstPreparationResponse) => negativeComponents(value) || value.requiresReview === true;
const signature = (value: GstPreparationResponse) => JSON.stringify([value.basis, value.from, value.to, value.totalSales, value.totalPurchases, value.gstOnSales, value.gstOnPurchases, value.netGstPosition, value.review?.adjustments, value.requiresReview, value.warnings]);

export function GstPreparationPanel({ onSaved }: { onSaved?: () => void } = {}) {
  const draftSave = usePreparedDraft();
  const [from, setFrom] = useState(`${today().slice(0, 7)}-01`);
  const [to, setTo] = useState(today());
  const [dueDate, setDueDate] = useState('');
  const [basis, setBasis] = useState<'invoice' | 'payments'>('invoice');
  const [adjustments, setAdjustments] = useState<GstAdjustment[]>([]);
  const [adjustmentReview, setAdjustmentReview] = useState(false);
  const [bookReview, setBookReview] = useState(false);
  const [figures, setFigures] = useState<GstPreparationResponse>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  function invalidate() { draftSave.clear(); setFigures(undefined); setBookReview(false); setSaved(false); setError(''); }
  function updateAdjustment(index: number, field: keyof GstAdjustment, value: string) {
    setAdjustments((rows) => rows.map((row, i) => i === index ? { ...row, [field]: value } : row));
    setAdjustmentReview(false); invalidate();
  }
  async function load() {
    const period = { from, to, basis };
    return adjustmentReview ? accountingCompletionApi.reviewedGst({ ...period, reviewConfirmed: true, adjustments: adjustments.map(({ grossAdjustment, ...row }) => ({ ...row, amount: exactMoney(row.amount), ...(grossAdjustment?.trim() ? { grossAdjustment: exactMoney(grossAdjustment) } : {}) })) }) : accountingCompletionApi.gst(period);
  }
  async function prepare() {
    setBusy(true); setError(''); setFigures(undefined); setSaved(false); setBookReview(false);
    try { setFigures(await load()); } catch (caught) { setError(preparationError(caught, 'GST worksheet unavailable. Try again.')); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!figures || !bookReview || !dueDate || (needsReview(figures) && !figures.review)) return;
    setBusy(true); setError('');
    try {
      const current = await load();
      if (signature(current) !== signature(figures)) { setFigures(current); setBookReview(false); setError('The books changed. Review the refreshed worksheet before saving.'); return; }
      await draftSave.save({ periodStart: current.from, periodEnd: current.to, returnType: 'GST', status: 'draft', totalSales: current.totalSales, totalPurchases: current.totalPurchases, gstOnSales: current.gstOnSales, gstOnPurchases: current.gstOnPurchases, netGst: current.netGstPosition, returnData: { preparation: { basis: current.basis, baseCurrency: 'NZD', dueDate }, ...(current.review ? { gstReview: current.review } : {}) } }, JSON.stringify([signature(current), dueDate]));
      setSaved(true); onSaved?.();
    } catch (caught) { setError(preparationError(caught, 'GST draft could not be saved.')); }
    finally { setBusy(false); }
  }
  return <ContentPanel><section aria-label="GST worksheet" className="space-y-5">
    <div><h2 className="text-xl font-semibold">GST worksheet</h2><p className="mt-1 max-w-prose text-sm text-muted-foreground">Choose your registered accounting basis. Figures use posted records and reviewed exchange rates. Confirm adjustments and bank reconciliation before saving a draft.</p></div>
    <div className="grid gap-4 sm:grid-cols-2">
      <PreparationField label="GST period start" type="date" value={from} disabled={busy} onChange={(value) => { setFrom(value); invalidate(); }} />
      <PreparationField label="GST period end" type="date" value={to} disabled={busy} onChange={(value) => { setTo(value); invalidate(); }} />
      <label className="space-y-2 text-sm font-medium">Registered GST basis<select className="flex h-11 w-full rounded-xl border border-input bg-background px-3" value={basis} disabled={busy} onChange={(event) => { setBasis(event.target.value as 'invoice' | 'payments'); invalidate(); }}><option value="invoice">Invoice basis</option><option value="payments">Payments basis</option></select></label>
      <PreparationField label="GST due date (confirm in myIR)" type="date" value={dueDate} disabled={busy} onChange={(value) => { setDueDate(value); draftSave.clear(); setSaved(false); }} />
    </div>
    <div className="space-y-4">{adjustments.map((row, index) => <fieldset key={index} className="space-y-3 rounded-xl border border-border p-4"><legend className="px-1 font-medium">GST adjustment {index + 1}</legend>
      <label className="space-y-2 text-sm">Adjustment affects<select aria-label={`GST adjustment kind ${index + 1}`} className="flex h-11 w-full rounded-xl border border-input bg-background px-3" value={row.kind} disabled={busy} onChange={(event) => updateAdjustment(index, 'kind', event.target.value)}><option value="output">Output GST (sales)</option><option value="input">Input GST (purchases)</option></select></label>
      <PreparationField label={`GST adjustment amount ${index + 1}`} value={row.amount} disabled={busy} onChange={(value) => updateAdjustment(index, 'amount', value)} />
      <PreparationField label={`GST gross adjustment ${index + 1} (optional)`} value={row.grossAdjustment ?? ''} disabled={busy} onChange={(value) => updateAdjustment(index, 'grossAdjustment', value)} />
      <p className="text-xs text-muted-foreground">If the adjustment changes gross sales or purchases, enter that signed gross amount too. Leave it blank for a GST-only correction.</p>
      <p className="text-xs text-muted-foreground">Enter the signed GST adjustment, for example −15.00 to reduce the chosen GST component. Do not repeat a credit already posted in the ledger.</p>
      <PreparationField label={`GST adjustment reason ${index + 1}`} value={row.reason} disabled={busy} onChange={(value) => updateAdjustment(index, 'reason', value)} />
      <PreparationField label={`GST adjustment source ${index + 1}`} value={row.sourceReference} disabled={busy} onChange={(value) => updateAdjustment(index, 'sourceReference', value)} />
      <Button type="button" variant="ghost" disabled={busy} onClick={() => { setAdjustments((rows) => rows.filter((_, i) => i !== index)); setAdjustmentReview(false); invalidate(); }}>Remove adjustment {index + 1}</Button>
    </fieldset>)}</div>
    <Button type="button" variant="outline" disabled={busy} onClick={() => { setAdjustments((rows) => [...rows, { kind: 'output', amount: '0.00', reason: '', sourceReference: '' }]); invalidate(); setAdjustmentReview(false); }}>Add GST adjustment</Button>
    {(adjustments.length > 0 || adjustmentReview || (figures && needsReview(figures))) && <PreparationCheck checked={adjustmentReview} disabled={busy} onChange={(value) => { setAdjustmentReview(value); setSaved(false); }}>I have reviewed the adjustment sources and tax treatment</PreparationCheck>}
    <div><Button disabled={busy || (adjustments.length > 0 && !adjustmentReview)} onClick={() => void prepare()}>{busy ? 'Working…' : 'Prepare GST worksheet'}</Button></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {figures && <div className="space-y-4"><p className="font-medium">{figures.basis === 'payments' ? 'Payments' : 'Invoice'} basis · NZD</p><dl><PreparationValue label="Total sales including GST" value={figures.totalSales} /><PreparationValue label="Total purchases including GST" value={figures.totalPurchases} /><PreparationValue label="Output GST" value={figures.gstOnSales} /><PreparationValue label="Input GST" value={figures.gstOnPurchases} /><PreparationValue label="Net GST position (negative is refundable)" value={figures.netGstPosition} /></dl>
      {figures.warnings.map((warning) => <p key={warning} className="text-sm text-muted-foreground">{warning}</p>)}
      {needsReview(figures) && !figures.review && <p role="alert" className="text-sm text-destructive">These signed movements require source review. Confirm the adjustment review and prepare again.</p>}
      <PreparationCheck checked={bookReview} disabled={busy} onChange={setBookReview}>I have reviewed the worksheet and bank reconciliation</PreparationCheck>
      <Button disabled={busy || saved || !bookReview || !dueDate || (needsReview(figures) && !figures.review)} onClick={() => void save()}>Save GST worksheet draft</Button>
      {saved && <p role="status">GST draft saved and reloaded</p>}
    </div>}
    <p className="text-xs text-muted-foreground">Draft preparation does not submit a return to IRD. Confirm your registered period and due date in myIR.</p>
  </section></ContentPanel>;
}
