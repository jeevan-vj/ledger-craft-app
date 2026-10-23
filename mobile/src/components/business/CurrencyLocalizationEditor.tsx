import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FormInput } from '@/components/ui/FormInput';
import { currencyApi, type MobileCurrencySettings } from '@/features/currency/currencyApi';
import { useTheme } from '@/theme';
import { control, radius, space } from '@/theme/tokens';

export function CurrencyLocalizationEditor() {
  const theme = useTheme();
  const styles = createStyles(theme);
  const [data, setData] = useState<MobileCurrencySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  useEffect(() => { currencyApi.get().then(setData).catch(() => Alert.alert('Couldn’t load settings', 'Check your connection and try again.')).finally(() => setLoading(false)); }, []);
  if (loading) return <ActivityIndicator style={styles.loader} color={theme.colors.accent} accessibilityLabel="Loading currency settings" />;
  if (!data) return <View style={styles.empty}><Text style={styles.error}>Currency settings are unavailable.</Text><TouchableOpacity accessibilityRole="button" onPress={() => { setLoading(true); currencyApi.get().then(setData).finally(() => setLoading(false)); }}><Text style={styles.link}>Try again</Text></TouchableOpacity></View>;
  const update = <K extends keyof MobileCurrencySettings['localization']>(key: K, value: MobileCurrencySettings['localization'][K]) => setData({ ...data, localization: { ...data.localization, [key]: value } });
  const save = async () => { setSaving(true); try { setData(await currencyApi.update(data.localization)); Alert.alert('Saved', 'Currency, locale and financial year settings were updated.'); } catch { Alert.alert('Couldn’t save settings', 'Review the values and try again.'); } finally { setSaving(false); } };
  return <View style={styles.content}>
    <Text style={styles.heading}>Currency & locale</Text>
    <Text style={styles.explainer}>Amounts are stored as exact decimal text. Display rounding follows each currency’s declared precision.</Text>
    <Text style={styles.label}>Base currency</Text>
    <View style={styles.options}>{data.currencies.filter((item) => item.enabled).map((item) => <TouchableOpacity key={item.code} accessibilityRole="radio" accessibilityState={{ checked: data.localization.baseCurrency === item.code }} style={[styles.pill, data.localization.baseCurrency === item.code && styles.pillSelected]} onPress={() => update('baseCurrency', item.code)}><Text style={styles.pillText}>{item.code}</Text></TouchableOpacity>)}</View>
    <FormInput label="Locale" value={data.localization.locale} onChangeText={(value) => update('locale', value)} placeholder="en-NZ" autoCapitalize="none" />
    <FormInput label="Language" value={data.localization.language} onChangeText={(value) => update('language', value)} placeholder="en" autoCapitalize="none" />
    <FormInput label="Timezone" value={data.localization.timezone} onChangeText={(value) => update('timezone', value)} placeholder="Pacific/Auckland" autoCapitalize="none" />
    <View style={styles.row}><View style={styles.half}><FormInput label="Financial year month" value={String(data.localization.financialYearStartMonth)} onChangeText={(value) => update('financialYearStartMonth', Number(value))} keyboardType="number-pad" /></View><View style={styles.half}><FormInput label="Start day" value={String(data.localization.financialYearStartDay)} onChangeText={(value) => update('financialYearStartDay', Number(value))} keyboardType="number-pad" /></View></View>
    <Text style={styles.heading}>Enabled catalogue</Text>
    {data.currencies.filter((item) => item.enabled).map((item) => <View key={item.code} style={styles.currencyRow}><Text style={styles.currencyCode}>{item.code}</Text><Text style={styles.meta}>{item.name} · {item.precision} decimals · {item.symbolPosition === 'before' ? `${item.symbol}123` : `123 ${item.symbol}`}</Text></View>)}
    <Text style={styles.heading}>Reviewed rates</Text>
    {data.rates.length ? data.rates.map((item) => <View key={item.id} style={styles.currencyRow}><Text style={styles.currencyCode}>{item.currencyCode} → {item.baseCurrency}</Text><Text style={styles.meta}>{item.effectiveDate} · {item.rate}{item.usageCount ? ' · locked by document use' : ''}</Text></View>) : <Text style={styles.explainer}>No rates yet. Foreign-currency documents fail safely until a dated rate is added on web.</Text>}
    <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: saving, busy: saving }} disabled={saving} onPress={save} style={styles.save}>{saving ? <ActivityIndicator color={theme.colors.accentForeground} /> : <Text style={styles.saveText}>Save currency settings</Text>}</TouchableOpacity>
  </View>;
}

const createStyles = ({ colors, type }: ReturnType<typeof useTheme>) => StyleSheet.create({
  content: { padding: space.screen, paddingBottom: 100, gap: space.md }, loader: { marginTop: 80 }, empty: { padding: space.xl, alignItems: 'center', gap: space.md }, error: { color: colors.danger }, link: { color: colors.accentText, fontWeight: '700' },
  heading: { ...type.title, color: colors.text, marginTop: space.md }, explainer: { ...type.footnote, color: colors.textSecondary, lineHeight: 19 }, label: { ...type.footnote, color: colors.text, fontWeight: '600' }, options: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }, pill: { minHeight: control.compact, paddingHorizontal: space.lg, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.fillMuted }, pillSelected: { backgroundColor: colors.accent }, pillText: { ...type.callout, color: colors.text, fontWeight: '700' }, row: { flexDirection: 'row', gap: space.md }, half: { flex: 1 }, currencyRow: { backgroundColor: colors.surface, borderRadius: radius.md, padding: space.lg, gap: 3 }, currencyCode: { ...type.callout, color: colors.text, fontWeight: '700' }, meta: { ...type.footnote, color: colors.textSecondary }, save: { minHeight: control.prominent, borderRadius: radius.pill, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginTop: space.lg }, saveText: { ...type.headline, color: colors.accentForeground },
});
