import React, { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { companyIncomeTaxPreparationRequestSchema, companyTaxAdjustmentSchema, type CompanyIncomeTaxPreparationResponse, type CompanyIncomeTaxPreparationRequest, type TaxReturnDto } from '@ledgercraft/contracts';
import { ModernInput } from '@/components/ui/ModernInput';
import { ModernButton } from '@/components/ui/ModernButton';
import { gstPreparationApi } from '@/features/reports/api/gstPreparationApi';
import { useTheme, space } from '@/theme';
import { formatMoney } from '@/utils/money';

type Adjustment = CompanyIncomeTaxPreparationRequest['adjustments'][number];
export function CompanyTaxPanel() {
  const theme = useTheme();
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(`${today.slice(0, 4)}-01-01`);
  const [to, setTo] = useState(today);
  const [confirmed, setConfirmed] = useState(false);
  const [losses, setLosses] = useState('0.00');
  const [credits, setCredits] = useState('0.00');
  const [kind, setKind] = useState<Adjustment['kind']>('add_back');
  const [amount, setAmount] = useState('0.00');
  const [reason, setReason] = useState('');
  const [reference, setReference] = useState('');
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [figures, setFigures] = useState<CompanyIncomeTaxPreparationResponse>();
  const [saved, setSaved] = useState('');
  const [savedId, setSavedId] = useState<string>();
  const [drafts, setDrafts] = useState<TaxReturnDto[]>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const invalidate = (newPeriod = false) => { setFigures(undefined); setSaved(''); if (newPeriod) setSavedId(undefined); setError(''); };
  const change = (setter: (value: string) => void, value: string, newPeriod = false) => { setter(value); invalidate(newPeriod); };
  async function loadDrafts() { setBusy(true); setError(''); try { const all = await gstPreparationApi.companyDrafts(); const latest = new Map<string, TaxReturnDto>(); for (const draft of [...all].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) { const key = `${draft.periodStart}:${draft.periodEnd}`; if (!latest.has(key)) latest.set(key, draft); } setDrafts([...latest.values()]); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Company tax drafts unavailable.'); } finally { setBusy(false); } }
  function restoreDraft(draft: TaxReturnDto) { const value = draft.returnData?.companyIncomeTax; if (!value) return; setFrom(value.from); setTo(value.to); setLosses(value.lossesBroughtForward); setCredits(value.taxCredits); setAdjustments(value.adjustments); setFigures(value); setSavedId(draft.id); setSaved(draft.status); setConfirmed(false); setError(''); }
  const add = () => {
    const parsed = companyTaxAdjustmentSchema.safeParse({ kind, amount, reason, sourceReference: reference });
    if (!parsed.success) { setError('Enter a nonnegative two-decimal amount, source reference and reason of at least eight characters.'); return; }
    setAdjustments([...adjustments, parsed.data]); setAmount('0.00'); setReason(''); setReference(''); invalidate();
  };
  const input = () => companyIncomeTaxPreparationRequestSchema.safeParse({ from, to, entityType: 'nz_company', taxRate: '28', rateConfirmed: confirmed, adjustments, lossesBroughtForward: losses, taxCredits: credits });
  async function prepare() {
    const parsed = input();
    if (!parsed.success) { setError('Confirm the company and rate, valid dates, and amounts with two decimal places.'); return; }
    setBusy(true); setError(''); setSaved(''); setFigures(undefined);
    try { setFigures(await gstPreparationApi.company(parsed.data)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Company tax preparation unavailable.'); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!figures) return;
    const parsed = input(); if (!parsed.success) return;
    setBusy(true); setError('');
    try {
      const current = await gstPreparationApi.company(parsed.data);
      if (current.accountingProfit !== figures.accountingProfit || current.incomeTaxPayable !== figures.incomeTaxPayable) { setFigures(current); setError('Books changed. Review the refreshed company tax figures before saving.'); return; }
      const draft = await gstPreparationApi.saveCompany(current, savedId);
      setSavedId(draft.id);
      const reloaded = await gstPreparationApi.get(draft.id);
      setSaved(reloaded.status);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Company tax draft unavailable.'); }
    finally { setBusy(false); }
  }
  return <View style={{ gap: space.md }}>
    <Text style={theme.type.headline}>Company income-tax preparation</Text>
    <Text style={theme.type.subhead}>NZ company worksheet using posted profit and your reviewed tax adjustments. Confirm the applicable rate and loss eligibility with your accountant. This does not complete or submit an IR4.</Text>
    <ModernButton variant="secondary" disabled={busy} onPress={() => void loadDrafts()}>Load saved company tax drafts</ModernButton>
    {drafts?.length === 0 ? <Text style={theme.type.body}>No saved company tax worksheets</Text> : null}
    {drafts?.map((draft) => <ModernButton key={draft.id} variant="secondary" disabled={busy} onPress={() => restoreDraft(draft)}>Load company tax draft {draft.periodStart} to {draft.periodEnd}</ModernButton>)}
    <ModernInput label="Company tax period start" value={from} editable={!busy} onChangeText={(value) => change(setFrom, value, true)} />
    <ModernInput label="Company tax period end" value={to} editable={!busy} onChangeText={(value) => change(setTo, value, true)} />
    <Text style={theme.type.body}>This is a NZ company eligible for the 28% rate</Text>
    <Switch accessibilityLabel="Confirm NZ company and 28% tax rate" disabled={busy} value={confirmed} onValueChange={(value) => { setConfirmed(value); invalidate(); }} />
    <ModernInput label="Tax losses brought forward" value={losses} keyboardType="decimal-pad" onChangeText={(value) => change(setLosses, value)} editable={!busy} />
    <ModernInput label="Company tax credits" value={credits} keyboardType="decimal-pad" onChangeText={(value) => change(setCredits, value)} editable={!busy} />
    <Text style={theme.type.headline}>Tax adjustments</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>{(['add_back', 'deduction'] as const).map((value) => <ModernButton key={value} variant={kind === value ? 'primary' : 'secondary'} disabled={busy} onPress={() => setKind(value)}>{value === 'add_back' ? 'Add back' : 'Deduction'}</ModernButton>)}</View>
    <ModernInput label="Company tax adjustment amount" value={amount} onChangeText={setAmount} editable={!busy} keyboardType="decimal-pad" />
    <ModernInput label="Company tax adjustment reason" value={reason} onChangeText={setReason} editable={!busy} />
    <ModernInput label="Company tax source reference" value={reference} onChangeText={setReference} editable={!busy} />
    <ModernButton variant="secondary" disabled={busy} onPress={add}>Add company tax adjustment</ModernButton>
    {adjustments.map((row, index) => <View key={index}><Text style={theme.type.body}>{row.kind === 'add_back' ? 'Add back' : 'Deduction'}: {formatMoney(row.amount)} · {row.sourceReference}</Text><ModernButton variant="ghost" disabled={busy} onPress={() => { setAdjustments(adjustments.filter((_, position) => position !== index)); invalidate(); }}>Remove tax adjustment {index + 1}</ModernButton></View>)}
    <ModernButton disabled={busy || !confirmed} loading={busy} onPress={() => void prepare()}>Prepare company income tax</ModernButton>
    {error ? <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{error}</Text> : null}
    {figures ? <>
      {[
        ['Accounting profit', figures.accountingProfit], ['Taxable income', figures.taxableIncome],
        ['Income tax before credits', figures.incomeTax], ['Income tax payable', figures.incomeTaxPayable],
        ['Excess tax credits', figures.excessCredits], ['Losses carried forward', figures.lossesCarriedForward],
      ].map(([label, value]) => <Text key={label} style={theme.type.body}>{label}: {formatMoney(value)}</Text>)}
      {figures.warnings.map((warning) => <Text key={warning} style={theme.type.caption}>{warning}</Text>)}
      <ModernButton disabled={busy || !confirmed} onPress={() => void save()}>Save company tax draft</ModernButton>
    </> : null}
    {saved ? <Text style={theme.type.body}>Saved company tax return: {saved}</Text> : null}
  </View>;
}
