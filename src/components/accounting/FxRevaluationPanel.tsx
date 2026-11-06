import { useState } from 'react';
import { fxRevaluationPreviewRequestSchema, fxRevaluationResponseSchema, type CurrencySettingsDto, type FxRevaluationPreviewRequest, type FxRevaluationResponse } from '@ledgercraft/contracts';
import { Button } from '@/components/ui/button';
import { ContentPanel } from '@/components/ui/ContentPanel';
import { readApiFailure } from '@/lib/api/readApiError';
import { PreparationCheck, PreparationField, PreparationValue, today } from './PreparationFields';

async function request(path: string, input: FxRevaluationPreviewRequest & { reviewed?: true }): Promise<FxRevaluationResponse> {
  const response = await fetch(path, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  if (!response.ok) throw new Error((await readApiFailure(response)).message);
  return fxRevaluationResponseSchema.parse(await response.json());
}
function previewSignature(value: FxRevaluationResponse) {
  return JSON.stringify({ asOfDate: value.asOfDate, reversalDate: value.reversalDate, baseCurrency: value.baseCurrency,
    positions: [...value.positions].sort((a, b) => `${a.documentType}:${a.documentId}`.localeCompare(`${b.documentType}:${b.documentId}`)),
    unrealizedGain: value.unrealizedGain, unrealizedLoss: value.unrealizedLoss, warnings: value.warnings });
}

export function FxRevaluationPanel({ settings }: { settings: CurrencySettingsDto }) {
  const [date, setDate] = useState(today());
  const [reason, setReason] = useState('');
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<FxRevaluationResponse>();
  const [posted, setPosted] = useState<FxRevaluationResponse>();
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState<'preview' | 'post'>();
  const [error, setError] = useState('');
  const eligible = settings.rates.filter((rate) => rate.baseCurrency === 'NZD' && rate.effectiveDate <= date);
  const currencies = [...new Set(settings.rates.filter((rate) => rate.baseCurrency === 'NZD').map((rate) => rate.currencyCode))].sort();
  const input = { asOfDate: date, exchangeRateIds: currencies.map((currency) => selected[currency]).filter((id): id is string => Boolean(id)), reason };
  const valid = settings.localization.baseCurrency === 'NZD' && fxRevaluationPreviewRequestSchema.safeParse(input).success;
  function reset() { setPreview(undefined); setPosted(undefined); setReviewed(false); setError(''); }
  async function prepare() {
    if (busy || !valid) return;
    setBusy('preview'); reset();
    try { setPreview(await request('/api/fx-revaluations/preview', input)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'FX revaluation could not be prepared. Try again.'); }
    finally { setBusy(undefined); }
  }
  async function post() {
    if (busy || !valid || !preview || !reviewed || posted) return;
    setBusy('post'); setError('');
    try {
      const refreshed = await request('/api/fx-revaluations/preview', input);
      if (previewSignature(refreshed) !== previewSignature(preview)) {
        setPreview(refreshed); setReviewed(false);
        setError('Open balances or rates changed. Review the refreshed preview before posting.');
        return;
      }
      const result = await request('/api/fx-revaluations', { ...input, reviewed: true });
      setPosted(result); setPreview(result);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'FX revaluation could not be posted. Retry the same reviewed request.'); }
    finally { setBusy(undefined); }
  }
  return <ContentPanel><section aria-labelledby="fx-revaluation-heading" className="space-y-5">
    <div className="space-y-2"><h2 id="fx-revaluation-heading" className="text-xl font-semibold">Period-end FX revaluation</h2>
      <p className="max-w-prose text-sm text-muted-foreground">Review open foreign receivables and payables at a dated closing rate. Posting records the unrealized movement and a reversing journal dated the following day.</p></div>
    {settings.localization.baseCurrency !== 'NZD' && <p role="alert" className="text-sm text-destructive">FX revaluation currently requires NZD as the base currency.</p>}
    <div className="grid gap-4 sm:grid-cols-2">
      <PreparationField label="FX valuation date" type="date" value={date} disabled={Boolean(busy)} onChange={(value) => { reset(); setSelected({}); setDate(value); }} />
      <PreparationField label="FX revaluation reason" value={reason} disabled={Boolean(busy)} onChange={(value) => { reset(); setReason(value); }} />
    </div>
    <fieldset className="grid gap-4 sm:grid-cols-2" disabled={Boolean(busy)}><legend className="mb-3 text-sm font-medium">Choose reviewed closing rates</legend>
      {currencies.map((currency) => <label key={currency} className="space-y-2 text-sm font-medium">Reviewed closing rate for {currency}
        <select className="flex h-11 w-full rounded-xl border border-input bg-background px-3" value={selected[currency] ?? ''} onChange={(event) => { reset(); setSelected((current) => ({ ...current, [currency]: event.target.value })); }}>
          <option value="">Choose a reviewed rate</option>
          {eligible.filter((rate) => rate.currencyCode === currency).map((rate) => <option key={rate.id} value={rate.id}>{rate.effectiveDate} · 1 {currency} = NZD {rate.rate}</option>)}
        </select>
      </label>)}
    </fieldset>
    {eligible.length === 0 && <p className="text-sm text-muted-foreground">Add a reviewed dated exchange rate on or before the valuation date above before preparing a revaluation.</p>}
    <Button type="button" variant={preview ? 'outline' : 'default'} disabled={Boolean(busy) || !valid} onClick={() => void prepare()}>{busy === 'preview' ? 'Preparing FX preview…' : 'Preview FX revaluation'}</Button>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {preview && <div className="space-y-4" aria-live="polite">
      <p className="text-sm font-medium">Valuation date: {preview.asOfDate}</p><p className="text-sm font-medium">Next-day reversal: {preview.reversalDate}</p>
      {preview.warnings.map((warning) => <p key={warning} className="border-l-2 border-warning pl-3 text-sm text-foreground">{warning}</p>)}
      {preview.positions.length === 0 ? <p className="text-sm text-muted-foreground">No foreign receivables or payables are open at this date.</p> : <>
        <ul className="divide-y divide-border">{preview.positions.map((position) => <li key={`${position.documentType}:${position.documentId}`} className="space-y-2 py-4">
          <p className="break-words font-medium">{position.documentType === 'invoice' ? 'Receivable' : 'Payable'} · {position.documentNumber}</p>
          <p className="text-sm text-muted-foreground tabular-nums">Open {position.currency} {position.foreignOutstanding} · reviewed rate {position.exchangeRate}</p>
          <dl className="grid gap-x-5 sm:grid-cols-3"><PreparationValue label="Carrying amount" value={position.bookBaseAmount} /><PreparationValue label="Revalued amount" value={position.revaluedBaseAmount} /><PreparationValue label="Signed movement" value={position.exchangeDifference} /></dl>
        </li>)}</ul>
        <dl className="grid gap-x-6 sm:grid-cols-2"><PreparationValue label="Unrealized gain" value={preview.unrealizedGain} /><PreparationValue label="Unrealized loss" value={preview.unrealizedLoss} /></dl>
        <PreparationCheck checked={reviewed} disabled={Boolean(busy) || Boolean(posted)} onChange={setReviewed}>I have reviewed the rates, open balances and next-day reversals</PreparationCheck>
        <Button type="button" disabled={Boolean(busy) || !reviewed || Boolean(posted)} onClick={() => void post()}>{busy === 'post' ? 'Posting FX revaluation…' : 'Post reviewed FX revaluation'}</Button>
      </>}
      {posted && <div className="space-y-2"><p role="status" className="font-medium text-success">FX revaluation posted</p>
        <p className="text-sm text-muted-foreground">{posted.replayed ? 'The same reviewed posting already exists. No duplicate journals were created.' : `Reversing journals are dated ${posted.reversalDate}.`}</p>
        <details><summary className="cursor-pointer text-sm font-medium">Posting audit trail</summary><div className="mt-3 space-y-3 break-all text-xs"><p>Revaluation journal IDs</p><ul>{posted.journalEntryIds.map((id) => <li key={id} className="font-mono">{id}</li>)}</ul><p>Next-day reversal journal IDs</p><ul>{posted.reversalJournalEntryIds.map((id) => <li key={id} className="font-mono">{id}</li>)}</ul></div></details>
      </div>}
    </div>}
  </section></ContentPanel>;
}
