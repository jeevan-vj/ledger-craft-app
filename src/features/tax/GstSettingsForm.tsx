import { useEffect, useState } from 'react';
import type { GstSettingsDto, UpdateGstSettingsRequest } from '@ledgercraft/contracts';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ContentPanel } from '@/components/ui/ContentPanel';
import { PreparationCheck, PreparationField } from '@/components/accounting/PreparationFields';
import { gstSettingsApi } from './gstSettingsApi';

const selectClass = 'flex h-11 w-full rounded-xl border border-input bg-background px-3';
function editable(value: GstSettingsDto): UpdateGstSettingsRequest {
  return { gstRegistrationStatus: value.gstRegistrationStatus, taxId: value.taxId, gstRegisteredFrom: value.gstRegisteredFrom, gstAccountingBasis: value.gstAccountingBasis, gstFilingFrequency: value.gstFilingFrequency, gstPeriodAnchor: value.gstPeriodAnchor };
}
export function GstSettingsForm({ onSaved, canWrite = true }: { onSaved?: (settings: GstSettingsDto) => void; canWrite?: boolean } = {}) {
  const [settings, setSettings] = useState<GstSettingsDto>(); const [draft, setDraft] = useState<UpdateGstSettingsRequest>();
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [reviewed, setReviewed] = useState(false); const [saved, setSaved] = useState(false);
  async function load() {
    setBusy(true); setError('');
    try { const value = await gstSettingsApi.settings(); setSettings(value); setDraft(editable(value)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'GST settings unavailable.'); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);
  function change<K extends keyof UpdateGstSettingsRequest>(key: K, value: UpdateGstSettingsRequest[K]) {
    setDraft(current => current ? { ...current, [key]: value } : current); setReviewed(false); setSaved(false); setError('');
  }
  async function save() {
    if (!draft || !reviewed || !canWrite) return;
    setBusy(true); setError(''); setSaved(false);
    try { const current = await gstSettingsApi.save(draft); setSettings(current); setDraft(editable(current)); setReviewed(false); setSaved(true); onSaved?.(current); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'GST settings could not be saved.'); }
    finally { setBusy(false); }
  }
  return <ContentPanel><section aria-label="Registered GST settings" className="space-y-5">
    <div><h2 className="text-xl font-semibold">Registered GST settings</h2><p className="mt-2 max-w-prose text-sm text-muted-foreground">Use the accounting basis, filing frequency and taxable-period ending month confirmed by IRD. Saving a choice does not change your registration with IRD or rewrite saved returns.</p></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {!settings ? busy ? <p role="status">Loading GST settings…</p> : <Button onClick={() => void load()}>Retry GST settings</Button> : draft && <>
      {!canWrite && <p className="text-sm text-muted-foreground">You can view these registered settings. An owner or administrator must make changes.</p>}
      {settings.warnings.map(warning => <p key={warning} role="alert" className="text-sm text-muted-foreground">{warning}</p>)}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm font-medium">GST registration status<select className={selectClass} value={draft.gstRegistrationStatus} disabled={busy || !canWrite} onChange={event => change('gstRegistrationStatus', event.target.value as UpdateGstSettingsRequest['gstRegistrationStatus'])}><option value="unknown">Not confirmed</option><option value="registered">Registered</option><option value="not_registered">Not registered</option></select></label>
        <PreparationField label="IRD GST number" value={draft.taxId ?? ''} disabled={busy || !canWrite} onChange={value => change('taxId', value || null)} />
        <PreparationField label="GST registration date" type="date" value={draft.gstRegisteredFrom ?? ''} disabled={busy || !canWrite} onChange={value => change('gstRegisteredFrom', value || null)} />
        <label className="space-y-2 text-sm font-medium">Registered GST basis<select className={selectClass} value={draft.gstAccountingBasis ?? ''} disabled={busy || !canWrite} onChange={event => change('gstAccountingBasis', (event.target.value || null) as UpdateGstSettingsRequest['gstAccountingBasis'])}><option value="">Choose the registered basis</option><option value="invoice">Invoice basis</option><option value="payments">Payments basis</option><option value="hybrid">Hybrid: invoice sales, payments purchases</option></select></label>
        <label className="space-y-2 text-sm font-medium">GST filing frequency<select className={selectClass} value={draft.gstFilingFrequency ?? ''} disabled={busy || !canWrite} onChange={event => change('gstFilingFrequency', (event.target.value || null) as UpdateGstSettingsRequest['gstFilingFrequency'])}><option value="">Choose the registered frequency</option><option value="monthly">Monthly</option><option value="two_monthly">Two-monthly</option><option value="six_monthly">Six-monthly</option></select></label>
        <label className="space-y-2 text-sm font-medium">IRD taxable-period ending month<select className={selectClass} value={draft.gstPeriodAnchor ?? ''} disabled={busy || !canWrite} onChange={event => change('gstPeriodAnchor', event.target.value ? Number(event.target.value) : null)}><option value="">Choose an ending month</option>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{new Intl.DateTimeFormat('en-NZ', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, index, 1)))}</option>)}</select></label>
      </div>
      <p className="text-sm text-muted-foreground">Payments basis follows money received and paid. Invoice basis follows taxable invoices and purchases. Hybrid uses invoice sales and payments purchases. Confirm eligibility and any basis change with IRD or your accountant first.</p>
      <PreparationCheck checked={reviewed} disabled={busy || !canWrite} onChange={setReviewed}>I have checked these settings against my IRD registration</PreparationCheck>
      {canWrite && <Button disabled={busy || !reviewed} onClick={() => void save()}>{busy ? 'Saving…' : 'Save registered GST settings'}</Button>}
      {saved && <p role="status">GST settings saved and reloaded</p>}
      <p><Link className="text-sm font-medium text-primary underline" to="/ird-reports">View GST periods and preparation</Link></p>
    </>}
  </section></ContentPanel>;
}
