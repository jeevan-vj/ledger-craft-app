import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { gstSalesClassificationReviewSchema, type GstPreparationResponse, type GstAdjustment, type TaxReturnDto } from '@ledgercraft/contracts';
import { ModernInput } from '@/components/ui/ModernInput';
import { ModernButton } from '@/components/ui/ModernButton';
import { gstPreparationApi } from '@/features/reports/api/gstPreparationApi';
import { formatMoney } from '@/utils/money';
import { useTheme } from '@/theme';
import { GstAdjustmentForm } from './GstAdjustmentForm';
import { space } from '@/theme/tokens';

const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const requiresAdjustmentReview = (figures: GstPreparationResponse) => [figures.totalSales, figures.totalPurchases, figures.gstOnSales, figures.gstOnPurchases].some((value) => value.startsWith('-') && /[1-9]/.test(value));

export function GstPreparationPanel({ initialFrom, initialTo, registeredBasis, onSaved }: { initialFrom?: string; initialTo?: string; registeredBasis?: GstPreparationResponse['basis']; onSaved?: () => void } = {}) {
  const theme = useTheme();
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(initialFrom ?? `${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(initialTo ?? today);
  const [basis, setBasis] = useState<GstPreparationResponse['basis']>(registeredBasis ?? 'invoice');
  const [adjustments, setAdjustments] = useState<GstAdjustment[]>([]);
  const [figures, setFigures] = useState<GstPreparationResponse>();
  const [saved, setSaved] = useState<TaxReturnDto>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [classify, setClassify] = useState(false); const [zeroSales, setZeroSales] = useState('0.00'); const [exemptSales, setExemptSales] = useState('0.00'); const [classificationReason, setClassificationReason] = useState(''); const [classificationSource, setClassificationSource] = useState('');
  const change = (setter: (value: string) => void, value: string) => { setter(value); setFigures(undefined); setSaved(undefined); setError(undefined); };
  async function prepare() {
    if (!validDate(from) || !validDate(to) || from > to) { setError('Choose valid dates with the period start on or before its end.'); return; }
    setBusy(true); setError(undefined); setFigures(undefined); setSaved(undefined);
    try {
      const prepared = await gstPreparationApi.prepare(from, to, basis);
      setFigures(prepared);
      const drafts = await gstPreparationApi.listDrafts();
      const draft = drafts.filter((value) => value.periodStart === prepared.from && value.periodEnd === prepared.to && (value.returnData?.preparation?.basis ?? 'invoice') === prepared.basis).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      setSaved(draft);
      if (draft?.returnData?.gstCalculation && prepared.calculation && draft.returnData.gstCalculation.fingerprint !== prepared.calculation.fingerprint) { setFigures({ ...prepared, requiresReview: true }); setError('Books changed since this saved snapshot. Review the refreshed books and save a revised GST draft.'); }
      const review = draft?.returnData?.gstReview;
      if (draft && review) {
        setAdjustments(review.adjustments);
        if (review.salesClassificationReview) { setClassify(true); setZeroSales(review.salesClassificationReview.zeroRatedSales); setExemptSales(review.salesClassificationReview.exemptSales); setClassificationReason(review.salesClassificationReview.reason); setClassificationSource(review.salesClassificationReview.sourceReference); }
        const unchanged = review.unadjustedGstOnSales === prepared.gstOnSales && review.unadjustedGstOnPurchases === prepared.gstOnPurchases && review.unadjustedTotalSales === prepared.totalSales && review.unadjustedTotalPurchases === prepared.totalPurchases;
        if (unchanged) setFigures({ ...prepared, totalSales: draft.totalSales, totalPurchases: draft.totalPurchases, gstOnSales: draft.gstOnSales, gstOnPurchases: draft.gstOnPurchases, netGstPosition: draft.netGst, review });
        else { setFigures({ ...prepared, requiresReview: true }); setError('Books changed or the saved source snapshot is incomplete. Review the saved adjustments against the refreshed figures before updating this draft.'); }
      } else setAdjustments([]);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'GST preparation unavailable. Try again.'); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!figures || ((requiresAdjustmentReview(figures) || figures.requiresReview) && !figures.review?.confirmed)) return;
    setBusy(true); setError(undefined);
    try {
      const current = figures.review ? await gstPreparationApi.review({ from: figures.from, to: figures.to, basis: figures.basis, reviewConfirmed: true, adjustments, ...(figures.review.salesClassificationReview ? { salesClassificationReview: figures.review.salesClassificationReview } : {}) }) : await gstPreparationApi.prepare(figures.from, figures.to, figures.basis);
      if (['totalSales', 'totalPurchases', 'gstOnSales', 'gstOnPurchases', 'netGstPosition'].some((key) => current[key as keyof GstPreparationResponse] !== figures[key as keyof GstPreparationResponse]) || (figures.calculation && current.calculation && figures.calculation.fingerprint !== current.calculation.fingerprint)) {
        setFigures(current);
        setError(figures.calculation && current.calculation ? 'Figures or source books changed. Review the refreshed figures, then save the draft again.' : 'Figures changed. Review the refreshed figures, then save the draft again.');
        return;
      }
      const created = saved && !saved.returnData?.gstCalculation ? await gstPreparationApi.save(current, saved.id) : await gstPreparationApi.save(current);
      setSaved(created);
      setSaved(await gstPreparationApi.get(created.id));
      setFigures(current); onSaved?.();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'GST draft could not be saved. Try again.'); }
    finally { setBusy(false); }
  }
  return <View style={{ gap: space.md }}>
    <Text style={theme.type.headline}>Prepare GST return</Text>
    <Text style={theme.type.subhead}>Choose your registered GST basis · NZD. Review these figures with your accountant before filing with IRD.</Text>
    {registeredBasis ? <Text style={theme.type.callout}>Registered GST basis: {basis === 'hybrid' ? 'Hybrid' : basis === 'payments' ? 'Payments' : 'Invoice'}</Text> : <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>{(['invoice', 'payments', 'hybrid'] as const).map((value) => <ModernButton key={value} variant={basis === value ? 'primary' : 'secondary'} disabled={busy} onPress={() => { setBasis(value); setFigures(undefined); setSaved(undefined); setAdjustments([]); }}>{value === 'invoice' ? 'Invoice basis' : value === 'payments' ? 'Payments basis' : 'Hybrid basis'}</ModernButton>)}</View>}
    <ModernInput label="GST period start" value={from} editable={!busy} onChangeText={(value) => change(setFrom, value)} placeholder="YYYY-MM-DD" />
    <ModernInput label="GST period end" value={to} editable={!busy} onChangeText={(value) => change(setTo, value)} placeholder="YYYY-MM-DD" />
    <ModernButton loading={busy} disabled={busy} onPress={() => void prepare()}>Prepare GST figures</ModernButton>
    {error ? <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{error}</Text> : null}
    {figures ? <>
      <Text style={theme.type.body}>Total sales (including GST): {formatMoney(figures.totalSales)}</Text>
      <Text style={theme.type.body}>Total purchases (including GST): {formatMoney(figures.totalPurchases)}</Text>
      {figures.claimablePurchases != null ? <Text style={theme.type.body}>Claimable GST purchases (Box 11): {formatMoney(figures.claimablePurchases)}</Text> : null}
      <Text style={theme.type.body}>GST on sales: {formatMoney(figures.gstOnSales)}</Text>
      <Text style={theme.type.body}>GST on purchases: {formatMoney(figures.gstOnPurchases)}</Text>
      <Text style={theme.type.headline}>{figures.netGstPosition.startsWith('-') ? `Net GST refundable: ${formatMoney(figures.netGstPosition.slice(1))}` : `Net GST payable: ${formatMoney(figures.netGstPosition)}`}</Text>
      {figures.warnings.map((warning) => <Text key={warning} style={{ color: theme.colors.warning }}>{warning}</Text>)}
      {requiresAdjustmentReview(figures) && !figures.review?.confirmed ? <Text accessibilityRole="alert" style={{ color: theme.colors.warning }}>Net reversals require manual GST adjustment review</Text> : null}
      {saved ? <Text accessibilityLiveRegion="polite" style={theme.type.body}>Saved GST return: {saved.status}</Text> : null}
      {figures.requiresReview && !figures.review?.confirmed ? <Text accessibilityRole="alert" style={{ color: theme.colors.warning }}>GST source figures require accountant review before saving</Text> : null}
      {figures.review ? <Text style={theme.type.caption}>Reviewed adjustments recorded: {figures.review.adjustments.length}</Text> : null}
      {figures.calculation ? <><Text selectable style={theme.type.caption}>Calculation: {figures.calculation.fingerprint}</Text>{Object.entries(figures.calculation.myIrBoxes).map(([box, amount]) => amount != null ? <Text key={box} style={theme.type.body}>myIR Box {box}: {formatMoney(amount)}</Text> : null)}</> : null}
      <GstAdjustmentForm initialRows={adjustments} disabled={busy} onReview={async (rows) => { setBusy(true); setError(undefined); try { const salesClassificationReview = classify ? gstSalesClassificationReviewSchema.parse({ zeroRatedSales: zeroSales, exemptSales, reason: classificationReason, sourceReference: classificationSource }) : undefined; const reviewed = await gstPreparationApi.review({ from, to, basis, reviewConfirmed: true, adjustments: rows, ...(salesClassificationReview ? { salesClassificationReview } : {}) }); setAdjustments(rows); setFigures(reviewed); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Adjustment review unavailable.'); } finally { setBusy(false); } }}>
        <ModernButton disabled={busy} variant="secondary" onPress={() => setClassify(!classify)}>{classify ? 'Hide sales classification review' : 'Review zero-rated and exempt sales'}</ModernButton>
        {classify ? <View style={{ gap: space.sm }}><Text style={theme.type.subhead}>Zero GST alone does not prove exemption or zero-rating. Enter the supported gross sales classification and retain its source evidence.</Text><ModernInput label="Reviewed zero-rated sales" value={zeroSales} onChangeText={setZeroSales} editable={!busy} /><ModernInput label="Reviewed exempt sales" value={exemptSales} onChangeText={setExemptSales} editable={!busy} /><ModernInput label="Sales classification reason" value={classificationReason} onChangeText={setClassificationReason} editable={!busy} /><ModernInput label="Sales classification source reference" value={classificationSource} onChangeText={setClassificationSource} editable={!busy} /></View> : null}
      </GstAdjustmentForm>
      <ModernButton loading={busy} disabled={busy || ((requiresAdjustmentReview(figures) || figures.requiresReview) && !figures.review?.confirmed)} onPress={() => void save()}>{saved ? saved.returnData?.gstCalculation ? 'Save revised GST draft' : 'Update GST draft' : 'Save GST draft'}</ModernButton>
      <Text style={theme.type.caption}>A saved draft does not submit a return to IRD.</Text>
    </> : null}
  </View>;
}
