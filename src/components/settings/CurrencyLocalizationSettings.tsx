import { useEffect, useMemo, useState } from 'react';
import { formatCanonicalMoney, financialYearForDate, type CurrencySettingsDto } from '@ledgercraft/contracts';
import { AlertCircle, CheckCircle2, Loader2, Plus } from 'lucide-react';
import { currencyApi } from '@/features/currency/api/currencyApi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function CurrencyLocalizationSettings() {
  const [data, setData] = useState<CurrencySettingsDto | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [rate, setRate] = useState({ currencyCode: 'USD', effectiveDate: new Date().toISOString().slice(0, 10), rate: '' });
  useEffect(() => { currencyApi.get().then(setData).catch((value) => setError(value instanceof Error ? value.message : 'Could not load settings')).finally(() => setBusy(false)); }, []);
  const base = data?.currencies.find((item) => item.code === data.localization.baseCurrency);
  const preview = useMemo(() => data && base ? formatCanonicalMoney('1234567.895', base, data.localization.numberFormat) : '', [data, base]);
  const save = async () => {
    if (!data) return;
    setBusy(true); setError(''); setSaved(false);
    try { setData(await currencyApi.update(data.localization)); setSaved(true); } catch (value) { setError(value instanceof Error ? value.message : 'Could not save settings'); } finally { setBusy(false); }
  };
  const addRate = async () => {
    setBusy(true); setError('');
    try { setData(await currencyApi.addRate(rate)); setRate((current) => ({ ...current, rate: '' })); } catch (value) { setError(value instanceof Error ? value.message : 'Could not add rate'); } finally { setBusy(false); }
  };
  if (busy && !data) return <Card><CardContent className="flex min-h-48 items-center justify-center gap-2"><Loader2 className="h-5 w-5 animate-spin" />Loading currency settings…</CardContent></Card>;
  if (!data) return <Card><CardContent className="flex min-h-48 items-center gap-2 text-destructive"><AlertCircle className="h-5 w-5" />{error}</CardContent></Card>;
  const update = <K extends keyof CurrencySettingsDto['localization']>(key: K, value: CurrencySettingsDto['localization'][K]) => setData({ ...data, localization: { ...data.localization, [key]: value } });
  return <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(22rem,.8fr)]" data-testid="currency-localization-settings">
    <div className="space-y-5">
      <Card><CardHeader><CardTitle>Regional & financial year</CardTitle><CardDescription>Canonical API amounts remain decimal strings. These choices control display only.</CardDescription></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2">
        <Field label="Base currency"><select className="h-10 w-full rounded-md border bg-background px-3" value={data.localization.baseCurrency} onChange={(e) => update('baseCurrency', e.target.value)}>{data.currencies.filter((item) => item.enabled).map((item) => <option key={item.code}>{item.code}</option>)}</select></Field>
        <Field label="Timezone"><Input value={data.localization.timezone} onChange={(e) => update('timezone', e.target.value)} /></Field>
        <Field label="Locale"><Input value={data.localization.locale} onChange={(e) => update('locale', e.target.value)} /></Field>
        <Field label="Language"><Input value={data.localization.language} onChange={(e) => update('language', e.target.value)} /></Field>
        <Field label="Date format"><select className="h-10 w-full rounded-md border bg-background px-3" value={data.localization.dateFormat} onChange={(e) => update('dateFormat', e.target.value as typeof data.localization.dateFormat)}>{['DD/MM/YYYY','MM/DD/YYYY','YYYY-MM-DD'].map((item) => <option key={item}>{item}</option>)}</select></Field>
        <Field label="Number format"><select className="h-10 w-full rounded-md border bg-background px-3" value={data.localization.numberFormat} onChange={(e) => update('numberFormat', e.target.value as typeof data.localization.numberFormat)}>{['1,234.56','1.234,56','1 234,56'].map((item) => <option key={item}>{item}</option>)}</select></Field>
        <Field label="Financial year month"><Input type="number" min={1} max={12} value={data.localization.financialYearStartMonth} onChange={(e) => update('financialYearStartMonth', Number(e.target.value))} /></Field>
        <Field label="Financial year day"><Input type="number" min={1} max={31} value={data.localization.financialYearStartDay} onChange={(e) => update('financialYearStartDay', Number(e.target.value))} /></Field>
        <div className="sm:col-span-2 rounded-xl bg-muted p-4 text-sm"><strong>Preview:</strong> {preview} · {financialYearForDate(new Date().toISOString().slice(0,10), data.localization.financialYearStartMonth, data.localization.financialYearStartDay).label}</div>
        <div className="sm:col-span-2 flex items-center gap-3"><Button type="button" onClick={save} disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save regional settings</Button>{saved && <span className="flex items-center gap-1 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" />Saved</span>}</div>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Currency catalogue</CardTitle><CardDescription>Precision is locked once a currency is used. The base currency cannot be disabled.</CardDescription></CardHeader><CardContent className="space-y-2">{data.currencies.map((item) => <div key={item.code} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-xl border p-3"><div><strong>{item.code}</strong><p className="text-sm text-muted-foreground">{item.name} · {item.precision} decimals · {item.symbol} {item.symbolPosition}</p></div><span className="text-xs font-medium">{item.isBase ? 'BASE' : item.enabled ? 'ENABLED' : 'OFF'}</span>{!item.isBase && <Button type="button" variant="outline" size="sm" onClick={async () => setData(await currencyApi.saveCurrency({ ...item, enabled: !item.enabled }))}>{item.enabled ? 'Disable' : 'Enable'}</Button>}</div>)}</CardContent></Card>
    </div>
    <Card className="h-fit"><CardHeader><CardTitle>Dated exchange rates</CardTitle><CardDescription>Rate means base currency per 1 foreign unit. Used rates are immutable audit evidence.</CardDescription></CardHeader><CardContent className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1"><Field label="Currency"><select className="h-10 w-full rounded-md border bg-background px-3" value={rate.currencyCode} onChange={(e) => setRate({ ...rate, currencyCode: e.target.value })}>{data.currencies.filter((item) => item.enabled && !item.isBase).map((item) => <option key={item.code}>{item.code}</option>)}</select></Field><Field label="Effective date"><Input type="date" value={rate.effectiveDate} onChange={(e) => setRate({ ...rate, effectiveDate: e.target.value })} /></Field><Field label={`1 foreign = ${data.localization.baseCurrency}`}><Input inputMode="decimal" placeholder="1.60005" value={rate.rate} onChange={(e) => setRate({ ...rate, rate: e.target.value })} /></Field></div>
      <Button type="button" onClick={addRate} disabled={busy || !rate.rate}><Plus className="mr-2 h-4 w-4" />Add reviewed rate</Button>
      {data.rates.length === 0 ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No rates yet. Foreign documents fail safely until a dated rate exists.</p> : data.rates.map((item) => <div key={item.id} className="rounded-xl border p-3 text-sm"><div className="flex justify-between gap-3"><strong>{item.currencyCode} → {item.baseCurrency}</strong><span>{item.effectiveDate}</span></div><p className="mt-1 text-muted-foreground">{item.rate} · {item.usageCount ? `used by ${item.usageCount} document(s), locked` : 'unused'}</p></div>)}
      {error && <p role="alert" className="flex gap-2 text-sm text-destructive"><AlertCircle className="h-4 w-4" />{error}</p>}
    </CardContent></Card>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>; }
