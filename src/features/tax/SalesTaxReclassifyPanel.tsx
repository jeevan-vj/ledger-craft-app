import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ContentPanel } from '@/components/ui/ContentPanel';
import { salesTaxReclassifyApi, type SalesTaxReclassificationList, type SalesTaxReclassifyPreview } from './salesTaxReclassifyApi';

function money(value: string | null): string {
  return value ?? 'Not shown until every untaxed sale is classified';
}

export function SalesTaxReclassifyPanel({ canWrite }: { canWrite: boolean }) {
  const [list, setList] = useState<SalesTaxReclassificationList>();
  const [selected, setSelected] = useState<string[]>([]);
  const [taxCode, setTaxCode] = useState<'zero_rated' | 'exempt'>('zero_rated');
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<SalesTaxReclassifyPreview>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load() {
    setBusy(true);
    setError('');
    try {
      const value = await salesTaxReclassifyApi.list();
      setList(value);
      setSelected((current) => current.filter((id) => value.lines.some((line) => line.id === id)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unclassified sales could not be loaded.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function runPreview() {
    if (!selected.length) return;
    setBusy(true);
    setError('');
    setNotice('');
    try { setPreview(await salesTaxReclassifyApi.preview(selected, taxCode)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'The GST preview could not be calculated.'); }
    finally { setBusy(false); }
  }

  async function apply() {
    if (!selected.length || reason.trim().length < 8) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await salesTaxReclassifyApi.apply(selected, taxCode, reason.trim());
      setPreview(undefined);
      setReason('');
      setNotice('Sales tax codes saved. Box 5 and Box 6 now use those codes.');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The sales lines could not be reclassified.');
    } finally {
      setBusy(false);
    }
  }

  async function undo(id: string) {
    const undoReason = window.prompt('Why undo this reclassification?');
    if (!undoReason || undoReason.trim().length < 8) return;
    setBusy(true);
    setError('');
    try {
      await salesTaxReclassifyApi.undo(id, undoReason.trim());
      setNotice('Reclassification undone. Those lines are unclassified again.');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The reclassification could not be undone.');
    } finally {
      setBusy(false);
    }
  }

  const lines = list?.lines ?? [];
  return <ContentPanel><section aria-label="Reclassify unclassified sales" className="space-y-4">
    <div>
      <h2 className="text-xl font-semibold">Unclassified 0% sales</h2>
      <p className="mt-2 max-w-prose text-sm text-muted-foreground">Older sales with no GST and no tax code stay out of Box 6 until you mark them zero-rated or exempt. Lines in a filed GST period are not listed. This does not change posted journals.</p>
    </div>
    {error && <p className="text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
    {!list ? <p>{busy ? 'Loading unclassified sales…' : 'Unclassified sales are unavailable.'}</p> : lines.length === 0 ? <p>No unclassified 0% sales in an open GST period.</p> : (
      <ul className="divide-y rounded-xl border">
        {lines.map((line) => <li key={line.id} className="flex items-center gap-3 px-3 py-2 text-sm">
          <input type="checkbox" aria-label={`${line.invoiceNumber} ${line.description}`} checked={selected.includes(line.id)} disabled={!canWrite || busy} onChange={(event) => {
            setPreview(undefined);
            setSelected((current) => event.target.checked ? [...current, line.id] : current.filter((id) => id !== line.id));
          }} />
          <span className="min-w-0 flex-1">{line.date} · {line.invoiceNumber} · {line.description}</span>
          <span className="tabular-nums">{line.total}</span>
        </li>)}
      </ul>
    )}
    {canWrite && lines.length > 0 && <div className="flex flex-wrap items-end gap-3">
      <label className="space-y-1 text-sm font-medium">Assign<select className="flex h-11 rounded-xl border border-input bg-background px-3" value={taxCode} disabled={busy} onChange={(event) => { setTaxCode(event.target.value as 'zero_rated' | 'exempt'); setPreview(undefined); }}>
        <option value="zero_rated">Zero-rated (Box 5 and Box 6)</option>
        <option value="exempt">Exempt (left out of Box 5)</option>
      </select></label>
      <Button type="button" variant="outline" disabled={busy || selected.length === 0} onClick={() => void runPreview()}>Preview Box 5 and 6</Button>
    </div>}
    {preview && <div className="rounded-xl border p-3 text-sm">
      <p>{preview.lineCount} {preview.lineCount === 1 ? 'line' : 'lines'} as {preview.taxCode === 'zero_rated' ? 'zero-rated' : 'exempt'}.</p>
      <p className="mt-1">Box 5: {money(preview.before.box5)} → {money(preview.after.box5)}</p>
      <p>Box 6: {money(preview.before.box6)} → {money(preview.after.box6)}</p>
      <label className="mt-3 block space-y-1 font-medium">Reason<textarea className="min-h-20 w-full rounded-xl border border-input bg-background px-3 py-2 font-normal" value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)} /></label>
      <Button type="button" className="mt-3" disabled={busy || reason.trim().length < 8} onClick={() => void apply()}>Apply tax codes</Button>
    </div>}
    {list && list.events.length > 0 && <div className="space-y-2">
      <h3 className="text-sm font-semibold">Recent reclassifications</h3>
      <ul className="space-y-2 text-sm">
        {list.events.map((event) => <li key={event.id} className="flex flex-wrap items-center justify-between gap-2">
          <span>{event.action === 'undo' ? 'Undone' : event.taxCode === 'exempt' ? 'Exempt' : 'Zero-rated'} · {event.lineIds.length} lines · Box 6 {money(event.before.box6)} → {money(event.after.box6)}</span>
          {canWrite && event.action === 'apply' && !event.undoneAt && <Button type="button" variant="outline" disabled={busy} onClick={() => void undo(event.id)}>Undo</Button>}
        </li>)}
      </ul>
    </div>}
  </section></ContentPanel>;
}
