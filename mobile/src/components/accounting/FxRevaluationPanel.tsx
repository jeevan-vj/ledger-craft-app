import React, { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { fxRevaluationPreviewRequestSchema, type FxRevaluationResponse } from '@ledgercraft/contracts';
import { fxRevaluationApi } from '@/features/accounting/fxRevaluationApi';
import type { MobileCurrencySettings } from '@/features/currency/currencyApi';
import { ModernButton } from '@/components/ui/ModernButton';
import { ModernInput } from '@/components/ui/ModernInput';
import { formatMoney } from '@/utils/money';
import { useTheme, space } from '@/theme';

export function FxRevaluationPanel() {
  const theme = useTheme();
  const [open, setOpen] = useState(false); const [rates, setRates] = useState<MobileCurrencySettings['rates']>([]); const [ids, setIds] = useState<string[]>([]);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10)); const [reason, setReason] = useState(''); const [confirmed, setConfirmed] = useState(false);
  const [preview, setPreview] = useState<FxRevaluationResponse>(); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [success, setSuccess] = useState('');
  const invalidate = () => { setPreview(undefined); setConfirmed(false); setSuccess(''); setError(''); };
  async function load() { setOpen(true); setBusy(true); setError(''); try { setRates(await fxRevaluationApi.rates()); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Reviewed exchange rates unavailable.'); } finally { setBusy(false); } }
  const input = () => fxRevaluationPreviewRequestSchema.safeParse({ asOfDate: date, exchangeRateIds: ids, reason });
  async function prepare() {
    const parsed = input(); if (!parsed.success) { setError('Choose a valid valuation date, one reviewed rate for each currency and a reason.'); return; }
    setBusy(true); invalidate();
    try { setPreview(await fxRevaluationApi.preview(parsed.data)); } catch (caught) { setError(caught instanceof Error ? caught.message : 'FX preview unavailable.'); } finally { setBusy(false); }
  }
  async function post() {
    const parsed = input(); if (!parsed.success || !preview || !confirmed || busy) return;
    setBusy(true); setError('');
    try {
      const current = await fxRevaluationApi.preview(parsed.data);
      if (JSON.stringify(current.positions) !== JSON.stringify(preview.positions) || current.unrealizedGain !== preview.unrealizedGain || current.unrealizedLoss !== preview.unrealizedLoss) { setPreview(current); setConfirmed(false); setError('Balances changed. Review the refreshed revaluation before posting.'); return; }
      const result = await fxRevaluationApi.post({ ...parsed.data, reviewed: true });
      setPreview(result); setConfirmed(false); setSuccess(`Revaluation ${result.replayed ? 'already posted' : 'posted'}: ${result.journalEntryIds.length} journal, ${result.reversalJournalEntryIds.length} reversal`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'FX revaluation unavailable.'); }
    finally { setBusy(false); }
  }
  return <View style={{ gap: space.md }}>
    <Text style={theme.type.headline}>Period-end foreign currency</Text>
    <ModernButton variant="secondary" disabled={busy} loading={busy} onPress={() => { if (open) setOpen(false); else void load(); }}>{open ? 'Hide period-end FX' : 'Review period-end FX'}</ModernButton>
    {open ? <>
      <Text style={theme.type.subhead}>Review outstanding foreign receivables and payables using dated rates you entered. The server records unrealized exchange differences and an equal next-day reversal. No market rate is fetched automatically.</Text>
      <ModernInput label="FX valuation date" value={date} editable={!busy} onChangeText={(value) => { setDate(value); setIds([]); invalidate(); }} />
      <ModernInput label="FX valuation reason" value={reason} editable={!busy} onChangeText={(value) => { setReason(value); invalidate(); }} />
      {!rates.filter((rate) => rate.effectiveDate <= date).length ? <Text style={theme.type.body}>No eligible reviewed exchange rates. Add rates in Business currency settings first.</Text> : null}
      {rates.filter((rate) => rate.effectiveDate <= date).map((rate) => <ModernButton key={rate.id} disabled={busy} variant={ids.includes(rate.id) ? 'primary' : 'secondary'} onPress={() => { setIds(ids.includes(rate.id) ? ids.filter((id) => id !== rate.id) : [...ids.filter((id) => rates.find((row) => row.id === id)?.currencyCode !== rate.currencyCode), rate.id]); invalidate(); }}>{rate.currencyCode} · {rate.rate} NZD · {rate.effectiveDate}</ModernButton>)}
      <ModernButton disabled={busy || !ids.length} onPress={() => void prepare()}>Preview FX revaluation</ModernButton>
      {preview ? <>
        <Text style={theme.type.body}>Unrealized gain: {formatMoney(preview.unrealizedGain)}</Text>
        <Text style={theme.type.body}>Unrealized loss: {formatMoney(preview.unrealizedLoss)}</Text>
        <Text style={theme.type.body}>Automatic reversal date: {preview.reversalDate}</Text>
        {!preview.positions.length ? <Text style={theme.type.body}>No outstanding foreign balances to revalue</Text> : null}
        {preview.positions.map((position) => <View key={`${position.documentType}:${position.documentId}`}><Text style={theme.type.body}>{position.documentNumber}: {position.foreignOutstanding} {position.currency}</Text><Text style={theme.type.caption}>Book {formatMoney(position.bookBaseAmount)} → revalued {formatMoney(position.revaluedBaseAmount)} · difference {formatMoney(position.exchangeDifference)}</Text></View>)}
        {preview.warnings.map((warning) => <Text key={warning} style={theme.type.caption}>{warning}</Text>)}
        <Text style={theme.type.body}>I have reviewed the outstanding balances, selected rates and next-day reversal</Text>
        <Switch accessibilityLabel="Confirm FX revaluation review" value={confirmed} disabled={busy} onValueChange={setConfirmed} />
        <ModernButton disabled={busy || !confirmed || !preview.positions.length} onPress={() => void post()}>Post reviewed FX revaluation</ModernButton>
      </> : null}
    </> : null}
    {error ? <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{error}</Text> : null}
    {success ? <Text style={theme.type.body}>{success}</Text> : null}
  </View>;
}
