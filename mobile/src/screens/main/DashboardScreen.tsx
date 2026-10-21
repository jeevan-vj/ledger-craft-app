import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, LayoutAnimation, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { CompositeNavigationProp, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { NativeBottomTabNavigationProp } from '@bottom-tabs/react-navigation';
import { useAuth } from '@/store';
import { invoiceService } from '@/services/invoiceService';
import { quotesApi } from '@/features/quotes/api/quotesApi';
import { summarizeQuotes } from '@/features/quotes/quoteModel';
import type { Quote } from '@/types/quote';
import type { Invoice } from '@/types/invoice';
import type { HomeStackParamList, MainTabParamList } from '@/navigation/types';
import { homeQuickActionLink, invoiceTabParams, moreTabParams, type HomeQuickActionId } from '@/navigation/links';
import { Card, AppPressable, CircleIconButton, DashedSetupCard, EmptyState, PillButton, QuickAction } from '@/components/ui';
import { formatMoney } from '@/utils/money';
import { getStatusIcon, getStatusLabel } from '@/utils/statusUtils';
import { useTheme } from '@/theme';
import { useTabScreenInsets } from '@/hooks/useTabScreenInsets';
import { homeTaskStorage } from './homeTaskStorage';

type DashboardNavigation = CompositeNavigationProp<NativeStackNavigationProp<HomeStackParamList, 'DashboardHome'>, NativeBottomTabNavigationProp<MainTabParamList>>;

type HomeQuickActionTile = {
  id: HomeQuickActionId;
  label: string;
  hint: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  primary?: boolean;
};

const quickActions: readonly HomeQuickActionTile[] = [
  { id: 'newInvoice', label: 'New invoice', hint: 'Creates a new invoice', icon: 'plus', primary: true },
  { id: 'newQuote', label: 'New quote', hint: 'Creates a quote or estimate', icon: 'file-text' },
  { id: 'recordPayment', label: 'Record payment', hint: 'Opens invoices to record a payment', icon: 'check' },
  { id: 'addExpense', label: 'Add expense', hint: 'Creates a new expense', icon: 'file-plus' },
  { id: 'addCustomer', label: 'Add customer', hint: 'Creates a new customer', icon: 'user-plus' },
];

export default function DashboardScreen() {
  const theme = useTheme();
  const { safeArea: insets, bottomPadding } = useTabScreenInsets();
  const navigation = useNavigation<DashboardNavigation>();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const cardWidth = Math.max(280, width - 40);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summaryPage, setSummaryPage] = useState(0);
  const [tasksDismissed, setTasksDismissed] = useState<boolean | null>(null);
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setInvoices(await invoiceService.fetchInvoices());
      setError(null);
    } catch (loadError) {
      console.error('Error loading dashboard data:', loadError);
      setError('Invoices could not be loaded.');
    }
    try {
      setQuotes((await quotesApi.list()).quotes);
      setQuoteError(null);
    } catch (loadError) {
      console.error('Error loading quotes:', loadError);
      setQuoteError('Quotes could not be loaded.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    let active = true;
    homeTaskStorage.isDismissed()
      .then((dismissed) => {
        if (active) setTasksDismissed(dismissed);
      })
      .catch(() => {
        if (active) setTasksDismissed(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const paid = useMemo(() => invoices.filter((item) => item.status === 'paid'), [invoices]);
  const outstanding = useMemo(() => invoices.filter((item) => item.status === 'sent' || item.status === 'overdue'), [invoices]);
  const totalPaid = paid.reduce((sum, item) => sum + item.total, 0);
  const totalOutstanding = outstanding.reduce((sum, item) => sum + item.total, 0);
  const overdue = invoices.filter((item) => item.status === 'overdue');
  const quoteSummary = useMemo(() => summarizeQuotes(quotes), [quotes]);
  const workItems = useMemo(() => {
    const rank: Record<string, number> = { overdue: 0, draft: 1, sent: 2 };
    return [...invoices]
      .filter((invoice) => invoice.status === 'overdue' || invoice.status === 'draft' || invoice.status === 'sent')
      .sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9))
      .slice(0, 6);
  }, [invoices]);
  const statusColor = (status: string) => {
    if (status === 'overdue') return theme.colors.danger;
    if (status === 'paid') return theme.colors.success;
    if (status === 'sent') return theme.colors.accentText;
    return theme.colors.textSecondary;
  };
  const formatDate = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' });
  };
  const name = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'there';
  const firstName = name.split(' ')[0];

  const openQuickAction = (action: HomeQuickActionId) => {
    const link = homeQuickActionLink(action);
    navigation.navigate(link.tab, link.params);
  };
  const openInvoices = () => navigation.navigate('Invoices', invoiceTabParams({ name: 'InvoiceList' }));
  const openQuotes = () => navigation.navigate('Invoices', invoiceTabParams({ name: 'QuoteList' }));
  const openBusiness = () => navigation.navigate('More', moreTabParams({ name: 'BusinessSettings' }));
  const dismissTasks = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setTasksDismissed(true);
    homeTaskStorage.dismiss().catch((storageError) => {
      console.error('Error saving home task dismissal:', storageError);
      setTasksDismissed(false);
    });
  };
  const retry = () => { setLoading(true); load(); };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.accent} accessibilityLabel="Loading home" />
      </View>
    );
  }

  if (error && invoices.length === 0) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}>
        <EmptyState title="Couldn't load home" description={error} actionLabel="Try again" onAction={retry} />
      </View>
    );
  }

  return <ScrollView
    style={{ backgroundColor: theme.colors.background }}
    contentContainerStyle={[styles.content, { paddingTop: 20 + insets.top, paddingBottom: bottomPadding }]}
    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.colors.accent} />}
    showsVerticalScrollIndicator={false}
  >
    <View style={styles.topRow}>
      <View><Text style={theme.type.subhead}>Good to see you</Text><Text style={[theme.type.title, { marginTop: 2 }]}>{firstName}</Text></View>
      <View style={[styles.avatar, { backgroundColor: theme.colors.accent }]}><Text style={[styles.avatarText, { color: theme.colors.accentForeground }]}>{name.slice(0, 1).toUpperCase()}</Text></View>
    </View>

    <View style={styles.balanceRow}>
      <View style={{ flex: 1 }}><Text style={theme.type.subhead}>Total balance</Text><Text style={[theme.type.money, styles.money]} accessibilityLabel={balanceVisible ? `Total balance ${formatMoney(totalOutstanding || totalPaid, 'NZD')}` : 'Total balance hidden'}>{balanceVisible ? formatMoney(totalOutstanding || totalPaid, 'NZD') : '••••••'}</Text></View>
      <View style={styles.balanceActions}><CircleIconButton icon={balanceVisible ? 'eye-off' : 'eye'} label={balanceVisible ? 'Hide balance' : 'Show balance'} onPress={() => setBalanceVisible((visible) => !visible)} /><CircleIconButton icon="bar-chart-2" label="View invoices" onPress={openInvoices} /></View>
    </View>

    <View style={styles.actions}>
      {quickActions.map((action) => (
        <QuickAction
          key={action.id}
          primary={action.primary}
          label={action.label}
          accessibilityHint={action.hint}
          onPress={() => openQuickAction(action.id)}
          icon={<Feather name={action.icon} size={22} color={action.primary ? theme.colors.accentForeground : theme.colors.accentText} />}
        />
      ))}
    </View>

    {error ? (
      <AppPressable onPress={retry} accessibilityRole="button" accessibilityLabel="Retry loading invoices" style={[styles.errorBanner, { backgroundColor: theme.colors.dangerFill }]}>
        <Text style={[theme.type.subhead, { color: theme.colors.danger }]}>{error} Tap to retry.</Text>
      </AppPressable>
    ) : null}

    <Text style={[theme.type.headline, styles.sectionTitle]}>Business summary</Text>
    <ScrollView horizontal pagingEnabled snapToInterval={cardWidth + 12} decelerationRate="fast" showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }} accessibilityLabel={`Business summary, card ${summaryPage + 1} of 2`} onMomentumScrollEnd={(event) => setSummaryPage(Math.round(event.nativeEvent.contentOffset.x / (cardWidth + 12)))}>
      <Card elevated style={{ width: cardWidth }}>
        <Text style={[theme.type.subhead, { color: theme.colors.textSecondary }]}>Money coming in</Text>
        <Text style={[theme.type.display, { marginTop: 8 }]}>{formatMoney(totalOutstanding, 'NZD')}</Text>
        <View style={styles.summaryFooter}><Text style={theme.type.footnote}>{outstanding.length} outstanding invoices</Text><Feather name="trending-up" size={20} color={theme.colors.accent} /></View>
      </Card>
      <Card elevated style={{ width: cardWidth }}>
        <Text style={[theme.type.subhead, { color: theme.colors.textSecondary }]}>Paid this period</Text>
        <Text style={[theme.type.display, { marginTop: 8 }]}>{formatMoney(totalPaid, 'NZD')}</Text>
        <View style={styles.summaryFooter}><Text style={theme.type.footnote}>{paid.length} paid invoices</Text><Feather name="check-circle" size={20} color={theme.colors.accent} /></View>
      </Card>
    </ScrollView>
    <View style={styles.dots}>{[0, 1].map((page) => <View key={page} style={{ width: page === summaryPage ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: page === summaryPage ? theme.colors.accent : theme.colors.border }} />)}</View>

    <Text style={[theme.type.headline, styles.sectionTitle]}>Quotes</Text>
    <AppPressable onPress={openQuotes} accessibilityRole="button" accessibilityLabel="Open quotes" style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
      <Card>
        <Text style={[theme.type.subhead, { color: theme.colors.textSecondary }]}>Open quotes</Text>
        <Text style={[theme.type.display, { marginTop: 8 }]}>{quoteSummary.openCount}</Text>
        <Text style={[theme.type.footnote, { marginTop: 4 }]}>{formatMoney(quoteSummary.openValue, quoteSummary.currency)} still open</Text>
        <View style={styles.summaryFooter}>
          <Text style={theme.type.footnote}>{quoteSummary.acceptedCount} accepted, not invoiced</Text>
          <Feather name="file-text" size={20} color={theme.colors.accent} />
        </View>
        {quoteError ? <Text style={[theme.type.footnote, { color: theme.colors.danger, marginTop: 8 }]}>{quoteError}</Text> : null}
      </Card>
    </AppPressable>

    {tasksDismissed === false ? <>
      <Text style={[theme.type.headline, styles.sectionTitle]}>Tasks</Text>
      <Card>
        <View style={styles.taskHeader}><View style={[styles.taskIcon, { backgroundColor: theme.colors.accentFill }]}><Feather name={overdue.length ? 'clock' : 'zap'} size={20} color={theme.colors.accentText} /></View><View style={{ flex: 1 }}><Text style={theme.type.headline}>{overdue.length ? `${overdue.length} overdue invoice${overdue.length === 1 ? '' : 's'}` : 'Finish setting up'}</Text><Text style={[theme.type.subhead, { marginTop: 3 }]}>{overdue.length ? 'Follow up and keep cash flow moving.' : 'Add your business details before sending an invoice.'}</Text></View></View>
        <View style={styles.taskActions}><PillButton label={overdue.length ? 'Review' : 'Continue'} onPress={overdue.length ? openInvoices : openBusiness} style={{ flex: 1 }} /><PillButton label="Dismiss" variant="ghost" onPress={dismissTasks} /></View>
      </Card>
    </> : tasksDismissed ? <DashedSetupCard title="You're all caught up" description="New tasks and overdue invoices will show here." icon="check" /> : null}

    <View style={styles.sectionHead}>
      <Text style={theme.type.headline}>Needs action</Text>
      <AppPressable onPress={openInvoices} accessibilityRole="button" accessibilityLabel="See all invoices" style={styles.seeAll}>
        <Text style={[theme.type.callout, { color: theme.colors.accentText }]}>See all</Text>
      </AppPressable>
    </View>
    <Card style={styles.invoiceCard}>
      {workItems.length === 0 ? (
        <Text style={[theme.type.subhead, styles.emptyInvoices]}>No invoices need action.</Text>
      ) : workItems.map((invoice, index) => (
        <AppPressable
          key={invoice.id}
          onPress={() => navigation.navigate('Invoices', invoiceTabParams({ name: 'InvoiceDetail', params: { invoiceId: invoice.id } }))}
          accessibilityRole="button"
          accessibilityLabel={`Invoice ${invoice.invoiceNumber}`}
          style={({ pressed }) => [
            styles.invoiceRow,
            index !== workItems.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.separator },
            pressed && { backgroundColor: theme.colors.fillMuted },
          ]}
        >
          <View style={[styles.taskIcon, { backgroundColor: theme.colors.accentFill }]}>
            <Feather name={getStatusIcon(invoice.status)} size={16} color={statusColor(invoice.status)} />
          </View>
          <View style={styles.invoiceCopy}>
            <Text style={theme.type.callout} numberOfLines={1}>{invoice.customer?.name || invoice.invoiceNumber}</Text>
            <Text style={theme.type.footnote}>{invoice.invoiceNumber} · {formatDate(invoice.date)}</Text>
          </View>
          <View style={styles.invoiceAmount}>
            <Text style={[theme.type.callout, styles.tabular]}>{formatMoney(invoice.total, invoice.currency || 'NZD')}</Text>
            <Text style={[theme.type.footnote, { color: statusColor(invoice.status) }]}>{getStatusLabel(invoice.status)}</Text>
          </View>
        </AppPressable>
      ))}
    </Card>
  </ScrollView>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 48 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 36 },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 19, fontWeight: '900' },
  balanceRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  balanceActions: { flexDirection: 'row', gap: 8 }, money: { marginTop: 2, fontVariant: ['tabular-nums'] },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 34, rowGap: 16 }, sectionTitle: { marginBottom: 14, marginTop: 4 },
  summaryFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 26 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 12, marginBottom: 28 },
  taskHeader: { flexDirection: 'row', gap: 14, alignItems: 'center' }, taskIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  taskActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, marginTop: 28 },
  seeAll: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  errorBanner: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 16, minHeight: 44, justifyContent: 'center' },
  invoiceCard: { padding: 0, overflow: 'hidden' },
  emptyInvoices: { padding: 16 },
  invoiceRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  invoiceCopy: { flex: 1, minWidth: 0 },
  invoiceAmount: { alignItems: 'flex-end' },
  tabular: { fontVariant: ['tabular-nums'] },
});
