import React, { useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { AppPressable, Card, EmptyState } from '@/components/ui';
import { reportsApi, type ReportBasis } from '@/features/reports/api/reportsApi';
import { useTabScreenInsets } from '@/hooks/useTabScreenInsets';
import { radius, space, useTheme } from '@/theme';
import { formatMoney } from '@/utils/money';

type Period = 'month' | 'year';
const iso = (date: Date) => date.toISOString().slice(0, 10);
function periodDates(period: Period) {
  const now = new Date();
  return { from: period === 'month' ? iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))) : `${now.getUTCFullYear()}-01-01`, to: iso(now) };
}

function gstPositionCopy(position: 'payable' | 'refundable' | 'nil') {
  if (position === 'payable') return 'Net GST payable to IRD';
  if (position === 'refundable') return 'Net GST refundable from IRD';
  return 'No GST payable or refundable';
}

function gstDisplayAmount(value: string, position: 'payable' | 'refundable' | 'nil') {
  return position === 'refundable' && value.startsWith('-') ? value.slice(1) : value;
}

export default function ReportsScreen() {
  const theme = useTheme(); const { bottomPadding } = useTabScreenInsets();
  const [period, setPeriod] = useState<Period>('year'); const [basis, setBasis] = useState<ReportBasis>('accrual');
  const dates = useMemo(() => periodDates(period), [period]);
  const report = useQuery({ queryKey: ['reports', dates, basis], queryFn: () => reportsApi.financial({ ...dates, basis, baseCurrency: 'NZD' }) });
  const money = (value: string) => formatMoney(value, 'NZD');
  const data = report.data;
  const empty = data && !data.trialBalance.rows.length && !data.receivablesAging.items.length && !data.payablesAging.items.length;
  const choices = <View style={[styles.segment, { backgroundColor: theme.colors.fill }]}>{(['accrual', 'cash'] as const).map((value) => <AppPressable key={value} accessibilityRole="button" accessibilityState={{ selected: basis === value }} onPress={() => setBasis(value)} style={[styles.segmentButton, basis === value && { backgroundColor: theme.colors.accent }]}><Text style={[theme.type.callout, { color: basis === value ? theme.colors.accentForeground : theme.colors.text }]}>{value === 'accrual' ? 'Accrual' : 'Cash'}</Text></AppPressable>)}</View>;
  return <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: theme.colors.background }} contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]} refreshControl={<RefreshControl refreshing={report.isFetching} onRefresh={() => report.refetch()} tintColor={theme.colors.accentText} />}>
    <View style={styles.header}><View><Text style={theme.type.title}>Financial reports</Text><Text style={theme.type.subhead}>Server-calculated from posted journals</Text></View><Feather name="bar-chart-2" size={28} color={theme.colors.accentText} /></View>
    <View style={styles.controls}><View style={[styles.segment, { backgroundColor: theme.colors.fill }]}>{(['month', 'year'] as const).map((value) => <AppPressable key={value} accessibilityRole="button" accessibilityState={{ selected: period === value }} onPress={() => setPeriod(value)} style={[styles.segmentButton, period === value && { backgroundColor: theme.colors.accent }]}><Text style={[theme.type.callout, { color: period === value ? theme.colors.accentForeground : theme.colors.text }]}>{value === 'month' ? 'This month' : 'This year'}</Text></AppPressable>)}</View>{choices}</View>
    {report.isLoading ? <View style={styles.state}><ActivityIndicator color={theme.colors.accentText} /><Text style={[theme.type.subhead, styles.stateText]}>Calculating reports…</Text></View> : null}
    {report.isError ? <EmptyState title="Reports unavailable" description={report.error instanceof Error ? report.error.message : 'Check your connection and try again.'} actionLabel="Try again" onAction={() => report.refetch()} /> : null}
    {empty ? <EmptyState title="No posted activity" description="Draft documents stay out of reports. Post an invoice, bill, expense, or transaction to see it here." /> : null}
    {data && !empty ? <>
      <View style={styles.metrics}>{[
        ['Revenue', data.profitLoss.revenue], ['Expenses', data.profitLoss.expenses], ['Net income', data.profitLoss.netIncome], ['Closing cash', data.cashFlow.closingCash],
      ].map(([label, value]) => <Card key={label} style={styles.metric}><Text style={theme.type.caption}>{label}</Text><Text style={[theme.type.headline, styles.money]}>{money(value)}</Text></Card>)}</View>
      <Text style={[theme.type.headline, styles.sectionTitle]}>Financial position</Text>
      <Card style={styles.list}>{[
        ['Assets', data.balanceSheet.assets], ['Liabilities', data.balanceSheet.liabilities], ['Equity', data.balanceSheet.equity], ['Trial balance', data.trialBalance.balanced ? 'Balanced' : 'Review required'],
      ].map(([label, value], index) => <View key={label} style={[styles.row, index > 0 && { borderTopColor: theme.colors.separator, borderTopWidth: StyleSheet.hairlineWidth }]}><Text style={theme.type.body}>{label}</Text><Text style={[theme.type.callout, { color: label === 'Trial balance' ? (data.trialBalance.balanced ? theme.colors.success : theme.colors.danger) : theme.colors.text }]}>{label === 'Trial balance' ? value : money(value)}</Text></View>)}</Card>
      <Text style={[theme.type.headline, styles.sectionTitle]}>What is owed</Text>
      <Card style={styles.list}>{[['Receivables', data.receivablesAging.total], ['Payables', data.payablesAging.total]].map(([label, value], index) => <View key={label} style={[styles.row, index > 0 && { borderTopColor: theme.colors.separator, borderTopWidth: StyleSheet.hairlineWidth }]}><Text style={theme.type.body}>{label}</Text><Text style={[theme.type.callout, styles.tabular]}>{money(value)}</Text></View>)}</Card>
      <Text style={[theme.type.headline, styles.sectionTitle]}>GST return (IRD)</Text>
      <Card style={styles.list}>
        <View style={styles.row}><Text style={theme.type.body}>Output GST (sales)</Text><Text selectable style={[theme.type.callout, styles.tabular]}>{money(data.taxSummary.outputGst)}</Text></View>
        <View style={[styles.row, { borderTopColor: theme.colors.separator, borderTopWidth: StyleSheet.hairlineWidth }]}><Text style={theme.type.body}>Input GST (purchases &amp; expenses)</Text><Text selectable style={[theme.type.callout, styles.tabular]}>{money(data.taxSummary.inputGst)}</Text></View>
        <View style={[styles.row, styles.gstNetRow, { backgroundColor: theme.colors.fillMuted, borderTopColor: theme.colors.separator, borderTopWidth: StyleSheet.hairlineWidth }]}>
          <Text style={theme.type.callout}>{gstPositionCopy(data.taxSummary.position)}</Text>
          <Text selectable style={[theme.type.headline, styles.tabular, { color: data.taxSummary.position === 'payable' ? theme.colors.warning : data.taxSummary.position === 'refundable' ? theme.colors.success : theme.colors.text }]}>{money(gstDisplayAmount(data.taxSummary.netGst, data.taxSummary.position))}</Text>
        </View>
      </Card>
      <Text testID="gst-basis" style={[theme.type.caption, styles.footnote]}>GST calculated on the invoice basis{basis === 'cash' ? ' (the cash-basis selection applies to the other reports, not GST)' : ''}</Text>
      {(data.taxSummary.warnings ?? []).map((warning) => <Text key={warning} accessibilityRole="alert" style={[theme.type.caption, styles.footnote, { color: theme.colors.warning }]}>{warning}</Text>)}
      <Text style={[theme.type.caption, styles.footnote]}>Generated {new Date(data.meta.generatedAt).toLocaleString()} · NZD · Draft documents excluded</Text>
    </> : null}
  </ScrollView>;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.screen, paddingTop: space.lg, gap: space.lg }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, controls: { gap: space.sm }, segment: { flexDirection: 'row', borderRadius: radius.pill, padding: 4 }, segmentButton: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, paddingHorizontal: 12 },
  state: { alignItems: 'center', paddingVertical: 48 }, stateText: { marginTop: 12 }, metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md }, metric: { width: '47%', minHeight: 96, justifyContent: 'center' }, money: { marginTop: 8, fontVariant: ['tabular-nums'] }, tabular: { fontVariant: ['tabular-nums'] }, sectionTitle: { marginTop: space.md }, list: { padding: 0, overflow: 'hidden' }, row: { minHeight: 56, paddingHorizontal: space.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md }, gstNetRow: { minHeight: 64 }, footnote: { textAlign: 'center', marginTop: space.md },
});
