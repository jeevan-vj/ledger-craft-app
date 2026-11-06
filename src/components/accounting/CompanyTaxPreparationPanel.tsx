import { preparationError } from '@/features/accounting-completion/preparationError';
import { useState } from 'react';
import type { CompanyIncomeTaxPreparationRequest, CompanyIncomeTaxPreparationResponse } from '@ledgercraft/contracts';
import { Button } from '@/components/ui/button';
import { ContentPanel } from '@/components/ui/ContentPanel';
import { downloadCompanyTaxPdf } from '@/features/accounting-completion/companyTaxPdf';
import { usePreparedDraft } from '@/features/accounting-completion/usePreparedDraft';
import { accountingCompletionApi } from '@/features/accounting-completion/api';
import { exactMoney, PreparationCheck, PreparationField, PreparationValue, today } from './PreparationFields';

type Adjustment = CompanyIncomeTaxPreparationRequest['adjustments'][number];
const signature = (figures: CompanyIncomeTaxPreparationResponse) => JSON.stringify([figures.accountingProfit, figures.taxableIncome, figures.incomeTaxPayable, figures.adjustments, figures.lossesApplied, figures.taxCredits]);
export function CompanyTaxPreparationPanel({ onSaved }: { onSaved?: () => void } = {}) {
  const draftSave = usePreparedDraft();
  const [from, setFrom] = useState(`${today().slice(0, 4)}-04-01`);
  const [to, setTo] = useState(today());
  const [confirmed, setConfirmed] = useState(false);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [losses, setLosses] = useState('0.00');
  const [credits, setCredits] = useState('0.00');
  const [figures, setFigures] = useState<CompanyIncomeTaxPreparationResponse>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  function invalidate() { draftSave.clear(); setFigures(undefined); setSaved(false); setError(''); }
  function updateAdjustment(index: number, field: keyof Adjustment, value: string) {
    setAdjustments((rows) => rows.map((row, i) => i === index ? { ...row, [field]: value } : row)); invalidate();
  }
  const load = () => accountingCompletionApi.companyTax({ from, to, entityType: 'nz_company', taxRate: '28', rateConfirmed: true,
    lossesBroughtForward: exactMoney(losses), taxCredits: exactMoney(credits), adjustments: adjustments.map((row) => ({ ...row, amount: exactMoney(row.amount) })) });
  async function prepare() {
    if (!confirmed) return;
    setBusy(true); setError(''); setSaved(false); setFigures(undefined);
    try { setFigures(await load()); } catch (caught) { setError(preparationError(caught, 'Company tax worksheet unavailable.')); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!figures || !confirmed) return;
    setBusy(true); setError('');
    try {
      const current = await load();
      if (signature(current) !== signature(figures)) { setFigures(current); setError('The books changed. Review the refreshed worksheet before saving again.'); return; }
      await draftSave.save({ periodStart: current.from, periodEnd: current.to, returnType: 'Income_Tax', status: 'draft', totalSales: '0.00', totalPurchases: '0.00', gstOnSales: '0.00', gstOnPurchases: '0.00', netGst: '0.00', returnData: { companyIncomeTax: current } }, JSON.stringify([from, to, signature(current)]));
      setSaved(true); onSaved?.();
    } catch (caught) { setError(preparationError(caught, 'Company tax draft could not be saved.')); }
    finally { setBusy(false); }
  }
  return <ContentPanel><section aria-label="Company income tax worksheet" className="space-y-5">
    <div><h2 className="text-xl font-semibold">Company income tax worksheet</h2><p className="mt-1 max-w-prose text-sm text-muted-foreground">Start with posted accounting profit, then enter accountant-reviewed tax adjustments, available losses and credits. This worksheet supports ordinary NZ companies at 28%; it is not an IR4 return or provisional-tax calculation.</p></div>
    <div className="grid gap-4 sm:grid-cols-2"><PreparationField label="Company tax period start" type="date" value={from} disabled={busy} onChange={(value) => { setFrom(value); invalidate(); }} /><PreparationField label="Company tax period end" type="date" value={to} disabled={busy} onChange={(value) => { setTo(value); invalidate(); }} /><PreparationField label="Available losses brought forward (NZD)" value={losses} disabled={busy} onChange={(value) => { setLosses(value); invalidate(); }} /><PreparationField label="Available tax credits (NZD)" value={credits} disabled={busy} onChange={(value) => { setCredits(value); invalidate(); }} /></div>
    {adjustments.map((row, index) => <fieldset key={index} className="space-y-3 rounded-xl border border-border p-4"><legend className="px-1 font-medium">Company tax adjustment {index + 1}</legend>
      <label className="space-y-2 text-sm">Adjustment type<select aria-label={`Company tax adjustment kind ${index + 1}`} className="flex h-11 w-full rounded-xl border border-input bg-background px-3" value={row.kind} disabled={busy} onChange={(event) => updateAdjustment(index, 'kind', event.target.value)}><option value="add_back">Add back to accounting profit</option><option value="deduction">Deduct from accounting profit</option></select></label>
      <PreparationField label={`Company tax adjustment amount ${index + 1}`} value={row.amount} disabled={busy} onChange={(value) => updateAdjustment(index, 'amount', value)} />
      <PreparationField label={`Company tax adjustment reason ${index + 1}`} value={row.reason} disabled={busy} onChange={(value) => updateAdjustment(index, 'reason', value)} />
      <PreparationField label={`Company tax adjustment source ${index + 1}`} value={row.sourceReference} disabled={busy} onChange={(value) => updateAdjustment(index, 'sourceReference', value)} />
      <Button variant="ghost" disabled={busy} onClick={() => { setAdjustments((rows) => rows.filter((_, i) => i !== index)); invalidate(); }}>Remove company adjustment {index + 1}</Button>
    </fieldset>)}
    <Button variant="outline" disabled={busy} onClick={() => { setAdjustments((rows) => [...rows, { kind: 'add_back', amount: '0.00', reason: '', sourceReference: '' }]); invalidate(); }}>Add company tax adjustment</Button>
    <PreparationCheck checked={confirmed} disabled={busy} onChange={(value) => { setConfirmed(value); invalidate(); }}>I confirm this is an ordinary NZ company eligible for the 28% rate</PreparationCheck>
    <div><Button disabled={busy || !confirmed} onClick={() => void prepare()}>{busy ? 'Working…' : 'Prepare company tax worksheet'}</Button></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {figures && <div className="space-y-4"><dl><PreparationValue label="Posted accounting profit" value={figures.accountingProfit} /><PreparationValue label="Tax add-backs" value={figures.addBacks} /><PreparationValue label="Tax deductions" value={figures.deductions} /><PreparationValue label="Losses applied" value={figures.lossesApplied} /><PreparationValue label="Taxable income" value={figures.taxableIncome} /><PreparationValue label="Income tax at 28%" value={figures.incomeTax} /><PreparationValue label="Available tax credits" value={figures.taxCredits} /><PreparationValue label="Income tax payable" value={figures.incomeTaxPayable} /><PreparationValue label="Losses carried forward" value={figures.lossesCarriedForward} /><PreparationValue label="Excess credits for review" value={figures.excessCredits} /></dl>
      {figures.warnings.map((warning) => <p key={warning} className="text-sm text-muted-foreground">{warning}</p>)}
      <Button variant="outline" disabled={busy} onClick={() => { void downloadCompanyTaxPdf(figures).catch(() => setError('The company worksheet PDF could not be downloaded. Try again.')); }}>Download company worksheet</Button>
      <Button disabled={busy || saved} onClick={() => void save()}>Save company tax draft</Button>
      {saved && <p role="status">Company tax draft saved and reloaded</p>}
    </div>}
    <p className="text-xs text-muted-foreground">Have your accountant confirm eligibility, loss continuity and credit availability. Saving a worksheet does not file with IRD or post tax journals.</p>
  </section></ContentPanel>;
}
