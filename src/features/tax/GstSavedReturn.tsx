import { useEffect, useState } from 'react';
import type { GstReturnRecalculationResponse, TaxReturnDto } from '@ledgercraft/contracts';
import { Button } from '@/components/ui/button';
import { ContentPanel } from '@/components/ui/ContentPanel';
import { PreparationCheck, PreparationField, PreparationValue } from '@/components/accounting/PreparationFields';
import { gstSettingsApi } from './gstSettingsApi';
import { downloadGstReturnPdf } from './export/gstReturnPdf';

export function GstSavedReturn({ value, onFiled, onPrepareNew, canWrite = true }: { value: TaxReturnDto; onFiled: () => void; onPrepareNew?: () => void; canWrite?: boolean }) {
  const [record, setRecord] = useState(value); const [reference, setReference] = useState(''); const [confirmed, setConfirmed] = useState(false);
  const [preview, setPreview] = useState<GstReturnRecalculationResponse>();
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [saved, setSaved] = useState(false);
  useEffect(() => { setRecord(value); setReference(''); setConfirmed(false); setSaved(false); setError(''); setPreview(undefined); }, [value]);
  async function file() {
    if (!confirmed || !reference.trim() || !canWrite || !record.returnData?.gstCalculation) return;
    setBusy(true); setError('');
    try { const current = await gstSettingsApi.file(record.id, reference.trim()); setRecord(current); setConfirmed(false); setSaved(true); onFiled(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Filing record could not be saved.'); }
    finally { setBusy(false); }
  }
  async function recalculate() { setBusy(true); setError(''); setPreview(undefined); try { setPreview(await gstSettingsApi.recalculation(record.id)); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Current books could not be previewed.'); } finally { setBusy(false); } }
  async function download() { setError(''); try { await downloadGstReturnPdf(record); } catch (caught) { setError(caught instanceof Error ? caught.message : 'PDF could not be downloaded.'); } }
  const basis = record.returnData?.preparation?.basis;
  const calculation = record.returnData?.gstCalculation;
  return <ContentPanel><section aria-label="Saved GST return" className="space-y-4">
    <div><h2 className="text-xl font-semibold">Saved GST return</h2><p className="text-sm text-muted-foreground">{record.periodStart} to {record.periodEnd} · {record.status === 'submitted' ? 'Recorded as filed' : record.status}</p><p className="text-sm">{basis === 'hybrid' ? 'Hybrid basis' : basis === 'payments' ? 'Payments basis' : basis === 'invoice' ? 'Invoice basis' : 'Original GST basis not recorded'}</p></div>
    <dl><PreparationValue label="Saved total sales" value={record.totalSales} /><PreparationValue label="Saved total purchases" value={record.totalPurchases} /><PreparationValue label="Saved output GST" value={record.gstOnSales} /><PreparationValue label="Saved input GST" value={record.gstOnPurchases} /><PreparationValue label="Saved net GST" value={record.netGst} /></dl>
    {record.returnData?.preparation?.dueDate && <p>Confirmed due date: {record.returnData.preparation.dueDate}</p>}
    {record.irdReference && <p>myIR confirmation reference: <strong>{record.irdReference}</strong></p>}
    {calculation?.warnings.map(warning => <p key={warning} role="alert" className="text-sm text-muted-foreground">{warning}</p>)}
    {calculation && <details className="rounded-xl border border-border p-4"><summary className="cursor-pointer font-medium">Calculation and source audit</summary><div className="mt-4 space-y-3"><p>Calculation version: {calculation.version}</p><p className="break-all text-xs">Source fingerprint: {calculation.fingerprint}</p><dl>{Object.entries(calculation.myIrBoxes).map(([box, amount]) => <PreparationValue key={box} label={`myIR ${box}`} value={String(amount)} />)}</dl><ul className="text-sm text-muted-foreground">{Object.entries(calculation.sourceCounts).map(([kind, count]) => <li key={kind}>{kind}: {String(count)}</li>)}</ul><p className="text-xs">The saved snapshot retains its original registration settings and included source records.</p></div></details>}
    <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={busy} onClick={() => void download()}>Download GST record PDF</Button><Button className="h-auto min-h-11 max-w-full whitespace-normal py-3 text-left" variant="outline" disabled={busy || !calculation} onClick={() => void recalculate()}>Preview current books using original settings</Button></div>
    {preview && <section aria-label="Current books preview" className="space-y-3 border-t border-border pt-4"><h3 className="font-semibold">Current books preview</h3><p className="text-sm text-muted-foreground">This preview uses the original return settings. It does not change the saved figures or submit a correction.</p>{preview.settingsChanged && <p role="alert" className="text-sm text-muted-foreground">Your registered choices have changed since this record. This preview retains the original settings.</p>}<dl><PreparationValue label="Current total sales" value={preview.current.totalSales} /><PreparationValue label="Current total purchases" value={preview.current.totalPurchases} /><PreparationValue label="Current output GST" value={preview.current.gstOnSales} /><PreparationValue label="Current input GST" value={preview.current.gstOnPurchases} /><PreparationValue label="Current net GST" value={preview.current.netGstPosition} /><PreparationValue label="Change from recorded net GST" value={preview.difference.netGst} /></dl>{preview.current.warnings.map(warning => <p key={warning} role="alert" className="text-sm text-muted-foreground">{warning}</p>)}<p className="text-xs text-muted-foreground">Ask your accountant how to correct an already filed return. The retained filing reference and original snapshot remain unchanged.</p></section>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {!calculation && <p role="alert" className="text-sm text-muted-foreground">This legacy record has no verified source snapshot. Prepare a new draft from the current books before recording a filing; the original record remains unchanged.</p>}
    {record.status === 'draft' && canWrite && onPrepareNew && <Button className="h-auto min-h-11 max-w-full whitespace-normal py-3 text-left" variant="outline" onClick={onPrepareNew}>Prepare a new draft from current books</Button>}
    {record.status === 'draft' && calculation && canWrite ? <div className="space-y-4 border-t border-border pt-4"><h3 className="font-semibold">Record an existing myIR filing</h3><p className="text-sm text-muted-foreground">File separately in myIR first. This action only retains your confirmation reference and makes this saved record read-only.</p><PreparationField label="myIR confirmation reference" value={reference} disabled={busy} onChange={setReference} /><PreparationCheck checked={confirmed} disabled={busy} onChange={setConfirmed}>I have already filed this return separately in myIR</PreparationCheck><Button disabled={busy || !confirmed || !reference.trim()} onClick={() => void file()}>Record existing myIR filing</Button></div> : <p className="text-sm text-muted-foreground">This retained record is read-only in this view. Preparing a replacement draft or recording a filing requires the appropriate permission and a verified source snapshot.</p>}
    {saved && <p role="status">Existing myIR filing recorded</p>}
  </section></ContentPanel>;
}
