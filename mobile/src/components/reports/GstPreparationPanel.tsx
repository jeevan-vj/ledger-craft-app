import React, { useState } from 'react';
import { Text, View } from 'react-native';
import type { GstPreparationResponse, TaxReturnDto } from '@ledgercraft/contracts';
import { ModernInput } from '@/components/ui/ModernInput';
import { ModernButton } from '@/components/ui/ModernButton';
import { gstPreparationApi } from '@/features/reports/api/gstPreparationApi';
import { formatMoney } from '@/utils/money';
import { useTheme } from '@/theme';
import { space } from '@/theme/tokens';

const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const requiresAdjustmentReview = (figures: GstPreparationResponse) => [figures.totalSales, figures.totalPurchases, figures.gstOnSales, figures.gstOnPurchases].some((value) => value.startsWith('-') && /[1-9]/.test(value));

export function GstPreparationPanel() {
  const theme = useTheme();
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const [figures, setFigures] = useState<GstPreparationResponse>();
  const [saved, setSaved] = useState<TaxReturnDto>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const change = (setter: (value: string) => void, value: string) => { setter(value); setFigures(undefined); setSaved(undefined); setError(undefined); };
  async function prepare() {
    if (!validDate(from) || !validDate(to) || from > to) { setError('Choose valid dates with the period start on or before its end.'); return; }
    setBusy(true); setError(undefined); setFigures(undefined); setSaved(undefined);
    try {
      const prepared = await gstPreparationApi.prepare(from, to);
      setFigures(prepared);
      const drafts = await gstPreparationApi.listDrafts();
      setSaved(drafts.find((draft) => draft.periodStart === prepared.from && draft.periodEnd === prepared.to));
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'GST preparation unavailable. Try again.'); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!figures || requiresAdjustmentReview(figures)) return;
    setBusy(true); setError(undefined);
    try {
      const current = await gstPreparationApi.prepare(figures.from, figures.to);
      if (JSON.stringify(current) !== JSON.stringify(figures)) {
        setFigures(current);
        setError('Figures changed. Review the refreshed figures, then save the draft again.');
        return;
      }
      const created = saved ? await gstPreparationApi.save(figures, saved.id) : await gstPreparationApi.save(figures);
      setSaved(await gstPreparationApi.get(created.id));
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'GST draft could not be saved. Try again.'); }
    finally { setBusy(false); }
  }
  return <View style={{ gap: space.md }}>
    <Text style={theme.type.headline}>Prepare GST return</Text>
    <Text style={theme.type.subhead}>Invoice basis · NZD. Review these figures with your accountant before filing with IRD.</Text>
    <ModernInput label="GST period start" value={from} editable={!busy} onChangeText={(value) => change(setFrom, value)} placeholder="YYYY-MM-DD" />
    <ModernInput label="GST period end" value={to} editable={!busy} onChangeText={(value) => change(setTo, value)} placeholder="YYYY-MM-DD" />
    <ModernButton loading={busy} disabled={busy} onPress={() => void prepare()}>Prepare GST figures</ModernButton>
    {error ? <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{error}</Text> : null}
    {figures ? <>
      <Text style={theme.type.body}>Total sales (including GST): {formatMoney(figures.totalSales)}</Text>
      <Text style={theme.type.body}>Total purchases (including GST): {formatMoney(figures.totalPurchases)}</Text>
      <Text style={theme.type.body}>GST on sales: {formatMoney(figures.gstOnSales)}</Text>
      <Text style={theme.type.body}>GST on purchases: {formatMoney(figures.gstOnPurchases)}</Text>
      <Text style={theme.type.headline}>{figures.netGstPosition.startsWith('-') ? `Net GST refundable: ${formatMoney(figures.netGstPosition.slice(1))}` : `Net GST payable: ${formatMoney(figures.netGstPosition)}`}</Text>
      {figures.warnings.map((warning) => <Text key={warning} style={{ color: theme.colors.warning }}>{warning}</Text>)}
      {requiresAdjustmentReview(figures) ? <Text accessibilityRole="alert" style={{ color: theme.colors.warning }}>Net reversals require manual GST adjustment review</Text> : null}
      {saved ? <Text accessibilityLiveRegion="polite" style={theme.type.body}>Saved GST return: {saved.status}</Text> : null}
      <ModernButton loading={busy} disabled={busy || requiresAdjustmentReview(figures)} onPress={() => void save()}>{saved ? 'Update GST draft' : 'Save GST draft'}</ModernButton>
      <Text style={theme.type.caption}>A saved draft does not submit a return to IRD.</Text>
    </> : null}
  </View>;
}
