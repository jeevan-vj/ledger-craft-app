import { useEffect, useRef, useState } from 'react';
import type { ExchangeRateDto } from '@ledgercraft/contracts';
import { currencyApi } from '@/features/currency/api/currencyApi';

export function foreignCurrency(currency?: string) { return Boolean(currency && !['NZD', '$', 'NZ$', ''].includes(currency)); }
export function SettlementRatePicker({ currency, date, value, onChange, disabled = false }: { disabled?: boolean; currency: string; date: string; value: string; onChange: (value: string) => void }) {
  const [rates, setRates] = useState<ExchangeRateDto[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const change = useRef(onChange); change.current = onChange;
  useEffect(() => {
    let current = true;
    setLoading(true); setError(''); if (!disabled) change.current('');
    void currencyApi.get().then((settings) => { if (current) setRates(settings.rates.filter((rate) => rate.currencyCode === currency && rate.baseCurrency === 'NZD' && rate.effectiveDate <= date)); })
      .catch((caught: unknown) => { if (current) setError(caught instanceof Error ? caught.message : 'Exchange rates could not be loaded.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [currency, date, disabled]);
  return <div className="space-y-2"><label className="space-y-2 text-sm font-medium">Settlement exchange rate<select className="flex h-11 w-full rounded-xl border border-input bg-background px-3" value={value} disabled={loading || disabled} onChange={(event) => onChange(event.target.value)}><option value="">{loading ? 'Loading reviewed rates…' : 'Choose a reviewed rate'}</option>{rates.map((rate) => <option key={rate.id} value={rate.id}>{rate.effectiveDate} · 1 {currency} = {rate.rate} NZD</option>)}</select></label><p className="text-xs text-muted-foreground">The payment amount is in {currency}. Select a saved rate valid on the settlement date; the ledger records NZD cash and the realised exchange difference. Add reviewed rates in currency settings.</p>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}{!loading && !error && rates.length === 0 && <p role="status" className="text-sm text-muted-foreground">No reviewed {currency}/NZD rate is available for this date.</p>}</div>;
}
