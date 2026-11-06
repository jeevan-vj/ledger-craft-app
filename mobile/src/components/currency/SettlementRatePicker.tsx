import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { currencyApi, type MobileCurrencySettings } from '@/features/currency/currencyApi';
import { ModernButton } from '@/components/ui/ModernButton';
import { useTheme, space } from '@/theme';

export function SettlementRatePicker({ currency, paymentDate, value, disabled, onChange }: { currency: string; paymentDate: string; value?: string; disabled?: boolean; onChange: (id: string) => void }) {
  const theme = useTheme();
  const [rates, setRates] = useState<MobileCurrencySettings['rates']>([]);
  const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const load = useCallback(async () => { setLoading(true); setError(''); try { setRates((await currencyApi.get()).rates); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Exchange rates unavailable.'); } finally { setLoading(false); } }, []);
  useEffect(() => { if (currency !== 'NZD') void load(); }, [currency, load]);
  if (currency === 'NZD') return null;
  const eligible = rates.filter((rate) => rate.currencyCode === currency && rate.baseCurrency === 'NZD' && rate.effectiveDate <= paymentDate);
  return <View style={{ gap: space.sm }}>
    <Text style={theme.type.headline}>Reviewed settlement exchange rate</Text>
    <Text style={theme.type.subhead}>Enter the payment amount in {currency}. Select a reviewed rate dated on or before payment. The server posts the NZD settlement and exchange difference; use a NZD bank account.</Text>
    {loading ? <ActivityIndicator /> : null}
    {error ? <><Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{error}</Text><ModernButton variant="secondary" disabled={disabled} onPress={() => void load()}>Retry exchange rates</ModernButton></> : null}
    {!loading && !error && !eligible.length ? <Text style={theme.type.body}>No eligible reviewed rate. Add a dated {currency}/NZD rate in Business currency settings before recording payment.</Text> : null}
    {eligible.map((rate) => <ModernButton key={rate.id} variant={value === rate.id ? 'primary' : 'secondary'} disabled={disabled} onPress={() => onChange(rate.id)}>1 {currency} = {rate.rate} NZD · {rate.effectiveDate}</ModernButton>)}
  </View>;
}
