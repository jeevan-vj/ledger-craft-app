import React, { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation, type NavigationProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { salesSummaryDateSchema, type SalesSummary } from '@ledgercraft/contracts';
import { AppPressable } from '@/components/ui/AppPressable';
import { EmptyState } from '@/components/ui/EmptyState';
import { GroupedSection } from '@/components/ui/GroupedSection';
import { currencyApi } from '@/features/currency/currencyApi';
import { businessSalesDate, salesSummaryApi } from '@/features/sales/salesSummaryApi';
import { useTabScreenInsets } from '@/hooks/useTabScreenInsets';
import type { MainTabParamList, SellStackParamList } from '@/navigation/types';
import { invoiceTabParams } from '@/navigation/links';
import { control, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme';
import { formatMoney } from '@/utils/money';

const METHODS: Record<string, string> = { cash: 'Cash', credit_card: 'Card / EFTPOS', bank_transfer: 'Bank transfer' };

export default function SalesSummaryScreen() {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { bottomPadding } = useTabScreenInsets();
  const navigation = useNavigation<NavigationProp<SellStackParamList>>();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dateInput, setDateInput] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const settings = useQuery({ queryKey: ['currency-settings'], queryFn: currencyApi.get });
  const timezone = settings.data?.localization.timezone;
  const date = selectedDate ?? (timezone ? businessSalesDate(timezone) : null);
  const summary = useQuery({
    queryKey: ['sales', 'summary', date],
    queryFn: () => salesSummaryApi.get(date!),
    enabled: date !== null,
  });
  const refetchSummary = summary.refetch;
  useFocusEffect(useCallback(() => {
    // A sale may have been completed since the last visit to this screen.
    if (date) void refetchSummary();
  }, [date, refetchSummary]));

  const showDay = () => {
    const parsed = salesSummaryDateSchema.safeParse(dateInput ?? date);
    if (!parsed.success) {
      setDateError('Enter a real date as YYYY-MM-DD.');
      return;
    }
    setDateError(null);
    if (parsed.data === date) void summary.refetch();
    setSelectedDate(parsed.data);
  };
  const retry = () => {
    if (settings.isError) void settings.refetch();
    else void summary.refetch();
  };
  const money = (value: string) => formatMoney(value, settings.data?.localization.baseCurrency ?? 'NZD');
  const data = summary.data;
  const row = (label: string, value: string) => <View key={label} style={styles.row}><Text style={[theme.type.body, styles.label]}>{label}</Text><Text selectable style={[theme.type.headline, styles.money]}>{value}</Text></View>;
  const ranking = (title: string, items: SalesSummary['topItemsByQuantity']) => (
    <GroupedSection title={title}>
      {items.map((item) => <View key={item.description} style={styles.row}>
        <View style={styles.label}><Text style={theme.type.body}>{item.description}</Text><Text style={theme.type.footnote}>{item.quantity} sold</Text></View>
        <Text style={[theme.type.headline, styles.money]}>{money(item.amount)}</Text>
      </View>)}
    </GroupedSection>
  );

  return (
    <ScrollView
      style={styles.screen}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}
      refreshControl={<RefreshControl refreshing={summary.isFetching && !summary.isLoading} onRefresh={retry} tintColor={theme.colors.accent} />}
    >
      <Text style={theme.type.subhead}>Sales recorded on the business calendar day.</Text>
      {timezone ? <Text style={theme.type.footnote}>{timezone}</Text> : null}
      <View style={styles.controls}>
        <TextInput
          accessibilityLabel="Sales date"
          placeholder="YYYY-MM-DD"
          placeholderTextColor={theme.colors.textTertiary}
          value={dateInput ?? date ?? ''}
          onChangeText={(value) => { setDateInput(value); setDateError(null); }}
          autoCorrect={false}
          autoCapitalize="none"
          keyboardType="numbers-and-punctuation"
          maxLength={10}
          style={styles.date}
        />
        <AppPressable accessibilityRole="button" accessibilityLabel="Show sales" onPress={showDay} disabled={!timezone} style={styles.show}>
          <Text style={styles.showText}>Show</Text>
        </AppPressable>
      </View>
      {dateError ? <Text style={styles.error} accessibilityRole="alert">{dateError}</Text> : null}
      <AppPressable accessibilityRole="button" accessibilityLabel="Today's sales" onPress={() => { if (selectedDate === null) void summary.refetch(); setSelectedDate(null); setDateInput(null); setDateError(null); }} style={styles.today}>
        <Text style={styles.todayText}>Today</Text>
      </AppPressable>
      {settings.isLoading || (date && summary.isLoading) ? <View style={styles.state}><ActivityIndicator color={theme.colors.accent} /><Text style={theme.type.subhead}>Loading sales summary</Text></View> : null}
      {settings.isError ? <EmptyState title="Business settings unavailable" description="Check your connection and try again to load the business timezone." actionLabel="Try again" onAction={retry} /> : null}
      {summary.isError ? <EmptyState title="Sales summary unavailable" description="Check your connection and try again. Your sales remain saved." actionLabel="Try again" onAction={retry} /> : null}
      {data && !summary.isError ? <>
        <Text style={theme.type.footnote}>{data.date}</Text>
        <GroupedSection title="Day totals">
          {row('Sales', String(data.count))}
          {row('Gross total', money(data.grossTotal))}
          {row('GST included', money(data.gstTotal))}
        </GroupedSection>
        {data.count === 0 ? <EmptyState title="No sales on this day" description="Choose another date or return to Sell to record a sale." /> : <>
          <GroupedSection title="Payment methods">{data.paymentMethods.map((method) => row(METHODS[method.paymentMethod] ?? method.paymentMethod, money(method.total)))}</GroupedSection>
          {ranking('Top items by quantity', data.topItemsByQuantity)}
          {ranking('Top items by amount', data.topItemsByAmount)}
          <GroupedSection title="Sales">
            {data.sales.map((sale) => <AppPressable key={sale.invoiceId} accessibilityRole="button" accessibilityLabel={`Open sale ${sale.invoiceNumber}`} onPress={() => navigation.getParent<NavigationProp<MainTabParamList>>()?.navigate('Invoices', invoiceTabParams({ name: 'InvoiceDetail', params: { invoiceId: sale.invoiceId } }))} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <Text style={[theme.type.body, styles.label]}>{sale.invoiceNumber}</Text><Text style={[theme.type.headline, styles.money]}>{money(sale.total)}</Text>
            </AppPressable>)}
          </GroupedSection>
        </>}
      </> : null}
    </ScrollView>
  );
}

const createStyles = ({ colors, type }: ReturnType<typeof useTheme>) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: space.screen, gap: space.sm },
  controls: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  date: { flex: 1, minHeight: control.default, borderRadius: radius.md, paddingHorizontal: space.lg, backgroundColor: colors.fill, color: colors.text, fontSize: 17 },
  show: { minHeight: control.default, minWidth: control.prominent, borderRadius: radius.pill, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg },
  showText: { ...type.callout, color: colors.accentForeground },
  today: { minHeight: control.touchTarget, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: space.sm },
  todayText: { ...type.callout, color: colors.accentText },
  state: { padding: space.section, alignItems: 'center', gap: space.md },
  row: { minHeight: control.prominent, flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  label: { flex: 1 },
  money: { fontVariant: ['tabular-nums'] },
  error: { ...type.footnote, color: colors.danger },
  pressed: { opacity: 0.75 },
});
