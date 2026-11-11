import { preparationError } from '@/features/accounting-completion/preparationError';
import { useEffect, useState } from 'react';
import { gstInputAdjustmentTypes, gstOutputAdjustmentTypes, type GstAdjustment, type GstPreparationResponse } from '@ledgercraft/contracts';
import { CustomsGstForm } from '@/features/tax/CustomsGstForm';
import { GstRoundingLine } from '@/features/tax/GstRoundingLine';
import { Button } from '@/components/ui/button';
import { ContentPanel } from '@/components/ui/ContentPanel';
import { usePreparedDraft } from '@/features/accounting-completion/usePreparedDraft';
import { accountingCompletionApi } from '@/features/accounting-completion/api';
import { exactMoney, PreparationCheck, PreparationField, PreparationValue, today } from './PreparationFields';

const adjustmentLabels: Record<string, string> = {
  private_use_output: 'Private use', bad_debt_recovered: 'Bad debt recovered', change_of_use_output: 'Change of use',
  bad_debt_written_off: 'Bad debt written off', customs_gst: 'Customs GST', change_of_use_input: 'Change of use', entertainment: 'Entertainment',
  prior_period_correction: 'Prior period correction', other: 'Other',
};
const typesFor = (kind: GstAdjustment['kind']) => kind === 'output' ? gstOutputAdjustmentTypes : gstInputAdjustmentTypes;
const negativeComponents = (value: GstPreparationResponse) => [value.totalSales, value.totalPurchases, value.gstOnSales, value.gstOnPurchases].some((amount) => amount.startsWith('-') && /[1-9]/.test(amount));
const needsReview = (value: GstPreparationResponse) => negativeComponents(value) || value.requiresReview === true;
const signature = (value: GstPreparationResponse) => JSON.stringify([value.basis, value.from, value.to, value.totalSales, value.totalPurchases, value.gstOnSales, value.gstOnPurchases, value.netGstPosition, value.review?.adjustments, value.requiresReview, value.warnings, value.calculation?.fingerprint]);

type GstBasis = 'invoice' | 'payments' | 'hybrid';
export function GstPreparationPanel({ onSaved, registeredBasis, period, canWrite = true }: { onSaved?: () => void; canWrite?: boolean; registeredBasis?: GstBasis; period?: { periodStart: string; periodEnd: string; dueDate: string } } = {}) {
  const draftSave = usePreparedDraft();
  const [from, setFrom] = useState(period?.periodStart ?? `${today().slice(0, 7)}-01`);
  const [to, setTo] = useState(period?.periodEnd ?? today());
  const [dueDate, setDueDate] = useState(period?.dueDate ?? '');
  const [basis, setBasis] = useState<GstBasis>(registeredBasis ?? 'invoice');
  const [classificationEnabled, setClassificationEnabled] = useState(false);
  const [classification, setClassification] = useState({ zeroRatedSales: '', exemptSales: '', reason: '', sourceReference: '' });
  useEffect(() => { if (registeredBasis) setBasis(registeredBasis); }, [registeredBasis]);
  const [adjustments, setAdjustments] = useState<GstAdjustment[]>([]);
  const [adjustmentReview, setAdjustmentReview] = useState(false);
  const [bookReview, setBookReview] = useState(false);
  const [figures, setFigures] = useState<GstPreparationResponse>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  function invalidate() { draftSave.clear(); setFigures(undefined); setBookReview(false); setSaved(false); setError(''); }
  function updateAdjustment(index: number, field: keyof GstAdjustment, value: string) {
    setAdjustments((rows) => rows.map((row, i) => {
      if (i !== index) return row;
      const next = { ...row, [field]: value };
      if (field === 'kind') {
        const allowed = typesFor(value as GstAdjustment['kind']);
        if (!next.type || !(allowed as readonly string[]).includes(next.type)) next.type = allowed[0];
      }
      return next;
    }));
    setAdjustmentReview(false); invalidate();
  }
  async function load() {
    const period = { from, to, basis };
    return adjustmentReview && canWrite ? accountingCompletionApi.reviewedGst({ ...period, reviewConfirmed: true, ...(classificationEnabled ? { salesClassificationReview: { ...classification, zeroRatedSales: exactMoney(classification.zeroRatedSales), exemptSales: exactMoney(classification.exemptSales) } } : {}), adjustments: adjustments.map(({ grossAdjustment, note, ...row }) => ({ ...row, amount: exactMoney(row.amount), ...(grossAdjustment?.trim() ? { grossAdjustment: exactMoney(grossAdjustment) } : {}), ...(row.type === 'other' && note?.trim() ? { note: note.trim() } : {}) })) }) : accountingCompletionApi.gst(period);
  }
  async function prepare() {
    setBusy(true); setError(''); setFigures(undefined); setSaved(false); setBookReview(false);
    try { setFigures(await load()); } catch (caught) { setError(preparationError(caught, 'GST worksheet unavailable. Try again.')); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!canWrite || !figures || !bookReview || !dueDate || (needsReview(figures) && !figures.review)) return;
    setBusy(true); setError('');
    try {
      const current = await load();
      if (signature(current) !== signature(figures)) { setFigures(current); setBookReview(false); setError('The books changed. Review the refreshed worksheet before saving.'); return; }
      await draftSave.save({ periodStart: current.from, periodEnd: current.to, returnType: 'GST', status: 'draft', totalSales: current.totalSales, totalPurchases: current.totalPurchases, gstOnSales: current.gstOnSales, gstOnPurchases: current.gstOnPurchases, netGst: current.netGstPosition, returnData: { preparation: { basis: current.basis, baseCurrency: 'NZD', dueDate, ...(current.calculation ? { calculationFingerprint: current.calculation.fingerprint } : {}) }, ...(current.review ? { gstReview: current.review } : {}) } }, JSON.stringify([signature(current), dueDate]));
      setSaved(true); onSaved?.();
    } catch (caught) { setError(preparationError(caught, 'GST draft could not be saved.')); }
    finally { setBusy(false); }
  }
  return <ContentPanel><section aria-label="GST worksheet" className="space-y-5">
    <div><h2 className="text-xl font-semibold">GST worksheet</h2><p className="mt-1 max-w-prose text-sm text-muted-foreground">Choose your registered accounting basis. Figures use posted records and reviewed exchange rates. Confirm adjustments and bank reconciliation before saving a draft.</p></div>
    {!canWrite && <p className="text-sm text-muted-foreground">Read-only preview: an owner, administrator or accountant must review sources and save or record a filing.</p>}
    {registeredBasis && <p className="text-sm text-muted-foreground">This worksheet uses the saved registered basis and server-generated period. Change registration choices in GST settings, not in an individual return.</p>}
    <div className="grid gap-4 sm:grid-cols-2">
      <PreparationField label="GST period start" type="date" value={from} disabled={busy || !!period} onChange={(value) => { setFrom(value); invalidate(); }} />
      <PreparationField label="GST period end" type="date" value={to} disabled={busy || !!period} onChange={(value) => { setTo(value); invalidate(); }} />
      <label className="space-y-2 text-sm font-medium">Registered GST basis<select className="flex h-11 w-full rounded-xl border border-input bg-background px-3" value={basis} disabled={busy || !!registeredBasis} onChange={(event) => { setBasis(event.target.value as GstBasis); invalidate(); }}><option value="invoice">Invoice basis</option><option value="payments">Payments basis</option><option value="hybrid">Hybrid basis</option></select></label>
      <PreparationField label="GST due date (confirm in myIR)" type="date" value={dueDate} disabled={busy || !!period} onChange={(value) => { setDueDate(value); draftSave.clear(); setSaved(false); }} />
    </div>
    <div className="space-y-4">{adjustments.map((row, index) => <fieldset key={index} className="space-y-3 rounded-xl border border-border p-4"><legend className="px-1 font-medium">GST adjustment {index + 1}</legend>
      <label className="space-y-2 text-sm">Adjustment affects<select aria-label={`GST adjustment kind ${index + 1}`} className="flex h-11 w-full rounded-xl border border-input bg-background px-3" value={row.kind} disabled={busy} onChange={(event) => updateAdjustment(index, 'kind', event.target.value)}><option value="output">Output GST (Box 9)</option><option value="input">Input GST (Box 13)</option></select></label>
      <label className="space-y-2 text-sm">Adjustment type<select aria-label={`GST adjustment type ${index + 1}`} className="flex h-11 w-full rounded-xl border border-input bg-background px-3" value={row.type ?? typesFor(row.kind)[0]} disabled={busy} onChange={(event) => updateAdjustment(index, 'type', event.target.value)}>{typesFor(row.kind).map((type) => <option key={type} value={type}>{adjustmentLabels[type]}</option>)}</select></label>
      <PreparationField label={`GST adjustment amount ${index + 1}`} value={row.amount} disabled={busy} onChange={(value) => updateAdjustment(index, 'amount', value)} />
      <PreparationField label={`GST gross adjustment ${index + 1} (optional)`} value={row.grossAdjustment ?? ''} disabled={busy} onChange={(value) => updateAdjustment(index, 'grossAdjustment', value)} />
      <p className="text-xs text-muted-foreground">If the adjustment changes gross sales or purchases, enter that signed gross amount too. Leave it blank for a GST-only correction.</p>
      <p className="text-xs text-muted-foreground">Enter the signed GST adjustment, for example −15.00 to reduce the chosen GST component. Do not repeat a credit already posted in the ledger.</p>
      <PreparationField label={`GST adjustment reason ${index + 1}`} value={row.reason} disabled={busy} onChange={(value) => updateAdjustment(index, 'reason', value)} />
      <PreparationField label={`GST adjustment source ${index + 1}`} value={row.sourceReference} disabled={busy} onChange={(value) => updateAdjustment(index, 'sourceReference', value)} />
      {(row.type ?? 'other') === 'other' && <PreparationField label={`GST adjustment note ${index + 1}`} value={row.note ?? ''} disabled={busy} onChange={(value) => updateAdjustment(index, 'note', value)} />}
      <Button type="button" variant="ghost" disabled={busy || !canWrite} onClick={() => { setAdjustments((rows) => rows.filter((_, i) => i !== index)); setAdjustmentReview(false); invalidate(); }}>Remove adjustment {index + 1}</Button>
    </fieldset>)}</div>
    <Button type="button" variant="outline" disabled={busy || !canWrite} onClick={() => { setAdjustments((rows) => [...rows, { kind: 'output', type: 'private_use_output', amount: '0.00', reason: '', sourceReference: '' }]); invalidate(); setAdjustmentReview(false); }}>Add GST adjustment</Button>
    <CustomsGstForm disabled={busy || !canWrite} onCreated={invalidate} />
    <PreparationCheck checked={classificationEnabled} disabled={busy || !canWrite} onChange={(value) => { setClassificationEnabled(value); setAdjustmentReview(false); invalidate(); }}>I need to classify zero-rated or exempt sales</PreparationCheck>
    {classificationEnabled && <fieldset className="space-y-3 rounded-xl border border-border p-4"><legend className="px-1 font-medium">Reviewed sales classification</legend><p className="text-sm text-muted-foreground">A zero tax rate does not establish whether a supply is zero-rated or exempt. Classify the included gross sales using supporting records. Do not include sales outside this worksheet period.</p>{([['zeroRatedSales', 'Reviewed zero-rated sales'], ['exemptSales', 'Reviewed exempt sales'], ['reason', 'Sales classification reason'], ['sourceReference', 'Sales classification source']] as const).map(([key, label]) => <PreparationField key={key} label={label} value={classification[key]} disabled={busy} onChange={value => { setClassification(current => ({ ...current, [key]: value })); setAdjustmentReview(false); invalidate(); }} />)}</fieldset>}
    {(classificationEnabled || adjustments.length > 0 || adjustmentReview || (figures && needsReview(figures))) && <PreparationCheck checked={adjustmentReview} disabled={busy || !canWrite} onChange={(value) => { setAdjustmentReview(value); setSaved(false); }}>I have reviewed the adjustment sources and tax treatment</PreparationCheck>}
    <div><Button disabled={busy || ((adjustments.length > 0 || classificationEnabled) && !adjustmentReview)} onClick={() => void prepare()}>{busy ? 'Working…' : 'Prepare GST worksheet'}</Button></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {figures && <div className="space-y-4"><p className="font-medium">{figures.basis === 'payments' ? 'Payments' : figures.basis === 'hybrid' ? 'Hybrid' : 'Invoice'} basis · NZD</p><dl><PreparationValue label="Total sales including GST" value={figures.totalSales} /><PreparationValue label="Total purchases including GST" value={figures.totalPurchases} /><PreparationValue label="Output GST" value={figures.gstOnSales} /><PreparationValue label="Input GST" value={figures.gstOnPurchases} /><PreparationValue label="Net GST position (negative is refundable)" value={figures.netGstPosition} /></dl>
      <GstRoundingLine calculation={figures.calculation} />
      {figures.warnings.map((warning) => <p key={warning} className="text-sm text-muted-foreground">{warning}</p>)}
      {needsReview(figures) && !figures.review && <p role="alert" className="text-sm text-destructive">These figures require source review. Confirm the adjustment review and prepare again.</p>}
      <PreparationCheck checked={bookReview} disabled={busy || !canWrite} onChange={setBookReview}>I have reviewed the worksheet and bank reconciliation</PreparationCheck>
      <Button disabled={!canWrite || busy || saved || !bookReview || !dueDate || (needsReview(figures) && !figures.review)} onClick={() => void save()}>Save GST worksheet draft</Button>
      {saved && <p role="status">GST draft saved and reloaded</p>}
    </div>}
    <p className="text-xs text-muted-foreground">Draft preparation does not submit a return to IRD. Confirm your registered period and due date in myIR.</p>
  </section></ContentPanel>;
}
