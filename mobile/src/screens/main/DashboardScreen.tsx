import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, LayoutAnimation, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { CompositeNavigationProp, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { NativeBottomTabNavigationProp } from '@bottom-tabs/react-navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/store';
import { dashboardQueryKey } from '@/features/payments/paymentQueries';
import { invoiceService } from '@/services/invoiceService';
import { quotesApi } from '@/features/quotes/api/quotesApi';
import { summarizeQuotes } from '@/features/quotes/quoteModel';
import type { Quote } from '@/types/quote';
import type { Invoice } from '@/types/invoice';
import type { DashboardResponse, ReportFilters, SavedReportDefinitionDto } from '@ledgercraft/contracts';
import type { HomeStackParamList, MainTabParamList } from '@/navigation/types';
import { homeQuickActionLink, invoiceTabParams, moreTabParams, type HomeQuickActionId } from '@/navigation/links';
import { Card, AppPressable, CircleIconButton, DashedSetupCard, EmptyState, PillButton, QuickAction } from '@/components/ui';
import { formatMoney } from '@/utils/money';
import { getStatusIcon, getStatusLabel } from '@/utils/statusUtils';
import { useTheme, type AppTheme } from '@/theme';
import { useTabScreenInsets } from '@/hooks/useTabScreenInsets';
import { homeTaskStorage } from './homeTaskStorage';
import { dashboardApi } from '@/features/dashboard/api/dashboardApi';
import { businessProfileApi } from '@/features/business-profile/api/businessProfileApi';
import { GstFilingSettingsBanner } from '@/components/reports/GstFilingSettingsBanner';
import { needsGstFilingSettings } from '@/features/reports/gstFilingSettings';
import { reportsApi } from '@/features/reports/api/reportsApi';
import { getServerCapabilities } from '@/services/capabilitiesService';

type DashboardNavigation = CompositeNavigationProp<NativeStackNavigationProp<HomeStackParamList, 'DashboardHome'>, NativeBottomTabNavigationProp<MainTabParamList>>;

type HomeQuickActionTile = {
  id: HomeQuickActionId;
  label: string;
  hint: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  primary?: boolean;
};

type ReportWidgetData = DashboardResponse['reports'][number];

const emptyInvoices: Invoice[] = [];
const emptyQuotes: Quote[] = [];

const quickActions: readonly HomeQuickActionTile[] = [
  { id: 'newInvoice', label: 'New invoice', hint: 'Creates a new invoice', icon: 'plus', primary: true },
  { id: 'newQuote', label: 'New quote', hint: 'Creates a quote or estimate', icon: 'file-text' },
  { id: 'recordPayment', label: 'Record payment', hint: 'Opens invoices to record a payment', icon: 'check' },
  { id: 'addExpense', label: 'Add expense', hint: 'Creates a new expense', icon: 'file-plus' },
  { id: 'addCustomer', label: 'Add customer', hint: 'Creates a new customer', icon: 'user-plus' },
];

async function loadDashboardHome(filters?: ReportFilters) {
  let invoices: Invoice[] = [];
  let invoiceError: string | null = null;
  try {
    invoices = await invoiceService.fetchInvoices();
  } catch (loadError) {
    console.error('Error loading dashboard data:', loadError);
    invoiceError = 'Invoices could not be loaded.';
  }
  let dashboard: DashboardResponse | null = null;
  let savedReports: SavedReportDefinitionDto[] = [];
  let reportError: string | null = null;
  try {
    const [nextDashboard, nextSavedReports] = await Promise.all([
      dashboardApi.getDashboard(filters),
      dashboardApi.listSavedReports(),
    ]);
    dashboard = nextDashboard;
    savedReports = nextSavedReports;
  } catch (loadError) {
    console.error('Error loading business reports:', loadError);
    reportError = 'Business reports could not be loaded.';
  }
  let quotes: Quote[] = [];
  let quoteError: string | null = null;
  try {
    quotes = (await quotesApi.list()).quotes;
  } catch (loadError) {
    console.error('Error loading quotes:', loadError);
    quoteError = 'Quotes could not be loaded.';
  }
  return { invoices, invoiceError, dashboard, savedReports, reportError, quotes, quoteError };
}

function greetingFrom(user: { user_metadata?: { full_name?: string }; email?: string } | null) {
  const full = user?.user_metadata?.full_name;
  if (full) return { name: full, first: full.split(' ')[0] || full };
  const emailName = user?.email?.split('@')[0];
  if (emailName) return { name: emailName, first: emailName };
  return { name: 'there', first: 'there' };
}

function closingBalance(dashboard: DashboardResponse | null, outstanding: number, paid: number) {
  const cash = dashboard?.reports.find((report) => report.type === 'cash')?.metrics.find((metric) => metric.label === 'Closing cash')?.value;
  if (cash) return cash;
  const receivables = dashboard?.reports.find((report) => report.type === 'receivables')?.metrics[0]?.value;
  if (receivables) return receivables;
  return String(outstanding || paid);
}

function visibleReports(dashboard: DashboardResponse | null): ReportWidgetData[] {
  if (!dashboard) return [];
  return dashboard.layout.widgets
    .filter((item) => item.visible)
    .sort((a, b) => a.order - b.order)
    .flatMap((item) => {
      const report = dashboard.reports.find((candidate) => candidate.type === item.kind);
      return report ? [report] : [];
    });
}

function rankedWork(invoices: Invoice[]) {
  const rank: Record<string, number> = { overdue: 0, draft: 1, sent: 2 };
  return invoices
    .filter((invoice) => rank[invoice.status] !== undefined)
    .sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9))
    .slice(0, 6);
}

function statusColor(status: string, theme: AppTheme) {
  if (status === 'overdue') return theme.colors.danger;
  if (status === 'paid') return theme.colors.success;
  if (status === 'sent') return theme.colors.accentText;
  return theme.colors.textSecondary;
}

function shortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' });
}

function taskPress(action: string, onReview: () => void, onCreate: () => void, onContinue: () => void) {
  if (action === 'Review') return onReview;
  if (action === 'Create invoice') return onCreate;
  return onContinue;
}

function taskCopy(overdueCount: number, firstInvoice: boolean) {
  if (overdueCount > 0) {
    const suffix = overdueCount === 1 ? '' : 's';
    return { title: `${overdueCount} overdue invoice${suffix}`, body: 'Follow up and keep cash flow moving.', action: 'Review', icon: 'clock' as const };
  }
  if (firstInvoice) {
    return { title: 'Create your first invoice', body: 'Add a customer and one line item, then send it when you are ready.', action: 'Create invoice', icon: 'zap' as const };
  }
  return { title: 'Finish setting up', body: 'Add your business details before sending an invoice.', action: 'Continue', icon: 'zap' as const };
}

async function applyDashboardPeriod(days: number | undefined, onFilters: (filters: ReportFilters) => void, setPeriodError: (value: string | null) => void) {
  setPeriodError(null);
  try {
    const { today } = await reportsApi.options();
    const from = days
      ? new Date(Date.parse(`${today}T00:00:00Z`) - (days - 1) * 86_400_000).toISOString().slice(0, 10)
      : `${today.slice(0, 4)}-01-01`;
    onFilters({ from, to: today, comparison: 'previous_period' });
  } catch {
    setPeriodError('Could not check your business date. Try the period again.');
  }
}

function metricValue(report: ReportWidgetData, value: string, currency?: string) {
  if (report.type === 'activity') return Number(value).toFixed(0);
  return formatMoney(value, currency);
}

function sourceRecordLabel(count: number) {
  if (count === 0) return 'No source activity in this period.';
  if (count === 1) return '1 source record';
  return `${count} source records`;
}

function HomeTasks({ dismissed, firstInvoice, overdueCount, onReview, onCreate, onContinue, onDismiss }: Readonly<{
  dismissed: boolean | null;
  firstInvoice: boolean;
  overdueCount: number;
  onReview: () => void;
  onCreate: () => void;
  onContinue: () => void;
  onDismiss: () => void;
}>) {
  const theme = useTheme();
  if (dismissed === null) return null;
  if (dismissed) return <DashedSetupCard title="You're all caught up" description="New tasks and overdue invoices will show here." icon="check" />;
  const copy = taskCopy(overdueCount, firstInvoice);
  const onPress = taskPress(copy.action, onReview, onCreate, onContinue);
  return (
    <>
      {firstInvoice ? null : <Text style={[theme.type.headline, styles.sectionTitle]}>Tasks</Text>}
      <Card style={firstInvoice ? styles.firstInvoiceCard : undefined}>
        <View style={styles.taskHeader}>
          <View style={[styles.taskIcon, { backgroundColor: theme.colors.accentFill }]}><Feather name={copy.icon} size={20} color={theme.colors.accentText} /></View>
          <View style={{ flex: 1 }}>
            <Text style={theme.type.headline}>{copy.title}</Text>
            <Text style={[theme.type.subhead, { marginTop: 3 }]}>{copy.body}</Text>
          </View>
        </View>
        <View style={styles.taskActions}>
          <PillButton label={copy.action} onPress={onPress} style={{ flex: 1 }} />
          <PillButton label="Dismiss" variant="ghost" onPress={onDismiss} />
        </View>
      </Card>
    </>
  );
}

function HomeActions({ onQuickAction }: Readonly<{ onQuickAction: (action: HomeQuickActionId) => void }>) {
  const theme = useTheme();
  const navigation = useNavigation<DashboardNavigation>();
  const capabilities = useQuery({ queryKey: ['server-capabilities'], queryFn: getServerCapabilities, staleTime: Infinity });
  const available = capabilities.data?.assistant === 'available';
  return (
    <>
      <View style={[styles.actions, available ? null : styles.actionsClosed]}>
        {quickActions.map((action) => (
          <QuickAction
            key={action.id}
            primary={action.primary}
            label={action.label}
            accessibilityHint={action.hint}
            onPress={() => onQuickAction(action.id)}
            icon={<Feather name={action.icon} size={22} color={action.primary ? theme.colors.accentForeground : theme.colors.accentText} />}
          />
        ))}
      </View>
      {available ? (
        <AppPressable
          onPress={() => navigation.navigate('Assistant')}
          accessibilityRole="button"
          accessibilityLabel="Ask the assistant"
          accessibilityHint="Opens a typed chat. Nothing is saved until you tap Save draft."
          style={({ pressed }) => [styles.assistantEntry, { backgroundColor: theme.colors.surface, opacity: pressed ? 0.78 : 1 }]}
        >
          <Text style={theme.type.callout}>Ask the assistant</Text>
          <Text style={theme.type.footnote}>Type a request. Invoices stay drafts until you save.</Text>
        </AppPressable>
      ) : null}
    </>
  );
}

function reportWidgets(reports: ReportWidgetData[], reportError: string | null) {
  if (reports.length > 0) {
    return <View style={styles.reportList}>{reports.map((report) => <ReportWidget key={report.type} report={report} />)}</View>;
  }
  if (reportError) return null;
  return <DashedSetupCard title="No dashboard widgets" description="Configure visible widgets on the web; your personal layout syncs here." icon="bar-chart-2" />;
}

function ReportWidget({ report }: Readonly<{ report: ReportWidgetData }>) {
  const theme = useTheme();
  const authority = report.authority.status === 'authoritative' ? 'Server-authoritative · Posted ledger' : 'Operational activity';
  return (
    <Card elevated>
      <Text style={[theme.type.subhead, { color: theme.colors.textSecondary, textTransform: 'capitalize' }]}>{report.type}</Text>
      {report.metrics.map((metric) => (
        <View key={metric.key} style={styles.reportMetric}>
          <Text selectable style={theme.type.footnote}>{metric.label}</Text>
          <Text selectable style={[theme.type.headline, styles.tabular]}>{metricValue(report, metric.value, metric.currency)}</Text>
        </View>
      ))}
      <Text style={[theme.type.footnote, { marginTop: 12 }]}>{sourceRecordLabel(report.rows.length)}</Text>
      <Text style={[theme.type.footnote, { marginTop: 12 }]}>{authority}</Text>
    </Card>
  );
}

function HomeReports({ dashboard, savedReports, reportError, onFilters, onRetry }: Readonly<{
  dashboard: DashboardResponse | null;
  savedReports: SavedReportDefinitionDto[];
  reportError: string | null;
  onFilters: (filters: ReportFilters) => void;
  onRetry: () => void;
}>) {
  const theme = useTheme();
  const [periodError, setPeriodError] = useState<string | null>(null);
  const reports = useMemo(() => visibleReports(dashboard), [dashboard]);
  return (
    <>
      <View style={styles.sectionHead}>
        <Text style={theme.type.headline}>Business reports</Text>
        <Text selectable style={theme.type.footnote}>Posted ledger</Text>
      </View>
      {dashboard ? <Text style={theme.type.footnote}>{dashboard.layout.filters.from} – {dashboard.layout.filters.to}</Text> : null}
      <View style={styles.periods}>
        <PillButton label="30 days" variant="secondary" onPress={() => { void applyDashboardPeriod(30, onFilters, setPeriodError); }} />
        <PillButton label="90 days" variant="secondary" onPress={() => { void applyDashboardPeriod(90, onFilters, setPeriodError); }} />
        <PillButton label="Year" variant="secondary" onPress={() => { void applyDashboardPeriod(undefined, onFilters, setPeriodError); }} />
      </View>
      {periodError ? <Text accessibilityRole="alert" style={[theme.type.footnote, { color: theme.colors.danger }]}>{periodError}</Text> : null}
      {savedReports.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.savedReports} accessibilityLabel="Saved report filters">
          {savedReports.map((report) => <PillButton key={report.id} label={report.name} variant={report.isPinned ? 'primary' : 'ghost'} onPress={() => onFilters(report.filters)} />)}
        </ScrollView>
      ) : null}
      {reportError ? (
        <AppPressable onPress={onRetry} accessibilityRole="button" accessibilityLabel="Retry loading business reports" style={[styles.errorBanner, { backgroundColor: theme.colors.dangerFill }]}>
          <Text selectable style={[theme.type.subhead, { color: theme.colors.danger }]}>{reportError} Tap to retry.</Text>
        </AppPressable>
      ) : null}
      {reportWidgets(reports, reportError)}
    </>
  );
}

function HomeQuotes({ quotes, quoteError, onOpen }: Readonly<{ quotes: Quote[]; quoteError: string | null; onOpen: () => void }>) {
  const theme = useTheme();
  const summary = useMemo(() => summarizeQuotes(quotes), [quotes]);
  return (
    <>
      <Text style={[theme.type.headline, styles.sectionTitle]}>Quotes</Text>
      <AppPressable onPress={onOpen} accessibilityRole="button" accessibilityLabel="Open quotes" style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
        <Card>
          <Text style={[theme.type.subhead, { color: theme.colors.textSecondary }]}>Open quotes</Text>
          <Text style={[theme.type.display, { marginTop: 8 }]}>{summary.openCount}</Text>
          <Text style={[theme.type.footnote, { marginTop: 4 }]}>{formatMoney(summary.openValue, summary.currency)} still open</Text>
          <View style={styles.summaryFooter}>
            <Text style={theme.type.footnote}>{summary.acceptedCount} accepted, not invoiced</Text>
            <Feather name="file-text" size={20} color={theme.colors.accent} />
          </View>
          {quoteError ? <Text style={[theme.type.footnote, { color: theme.colors.danger, marginTop: 8 }]}>{quoteError}</Text> : null}
        </Card>
      </AppPressable>
    </>
  );
}

function WorkRow({ invoice, divider }: Readonly<{ invoice: Invoice; divider: boolean }>) {
  const theme = useTheme();
  const navigation = useNavigation<DashboardNavigation>();
  return (
    <AppPressable
      onPress={() => navigation.navigate('Invoices', invoiceTabParams({ name: 'InvoiceDetail', params: { invoiceId: invoice.id } }))}
      accessibilityRole="button"
      accessibilityLabel={`Invoice ${invoice.invoiceNumber}`}
      style={({ pressed }) => [
        styles.invoiceRow,
        divider ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.separator } : null,
        pressed ? { backgroundColor: theme.colors.fillMuted } : null,
      ]}
    >
      <View style={[styles.taskIcon, { backgroundColor: theme.colors.accentFill }]}>
        <Feather name={getStatusIcon(invoice.status)} size={16} color={statusColor(invoice.status, theme)} />
      </View>
      <View style={styles.invoiceCopy}>
        <Text style={theme.type.callout} numberOfLines={1}>{invoice.customer?.name || invoice.invoiceNumber}</Text>
        <Text style={theme.type.footnote}>{invoice.invoiceNumber} · {shortDate(invoice.date)}</Text>
      </View>
      <View style={styles.invoiceAmount}>
        <Text style={[theme.type.callout, styles.tabular]}>{formatMoney(invoice.total, invoice.currency || 'NZD')}</Text>
        <Text style={[theme.type.footnote, { color: statusColor(invoice.status, theme) }]}>{getStatusLabel(invoice.status)}</Text>
      </View>
    </AppPressable>
  );
}

function HomeWorkList({ invoices, onSeeAll }: Readonly<{ invoices: Invoice[]; onSeeAll: () => void }>) {
  const theme = useTheme();
  const items = useMemo(() => rankedWork(invoices), [invoices]);
  return (
    <>
      <View style={styles.sectionHead}>
        <Text style={theme.type.headline}>Needs action</Text>
        <AppPressable onPress={onSeeAll} accessibilityRole="button" accessibilityLabel="See all invoices" style={styles.seeAll}>
          <Text style={[theme.type.callout, { color: theme.colors.accentText }]}>See all</Text>
        </AppPressable>
      </View>
      <Card style={styles.invoiceCard}>
        {items.length === 0 ? <Text style={[theme.type.subhead, styles.emptyInvoices]}>No invoices need action.</Text> : items.map((invoice, index) => (
          <WorkRow key={invoice.id} invoice={invoice} divider={index < items.length - 1} />
        ))}
      </Card>
    </>
  );
}

export default function DashboardScreen() {
  const theme = useTheme();
  const { safeArea: insets, bottomPadding } = useTabScreenInsets();
  const navigation = useNavigation<DashboardNavigation>();
  const { user } = useAuth();
  const [dashboardFilters, setDashboardFilters] = useState<ReportFilters | undefined>();
  const [tasksDismissed, setTasksDismissed] = useState<boolean | null>(null);
  const [balanceVisible, setBalanceVisible] = useState(true);
  const home = useQuery({
    queryKey: [...dashboardQueryKey, dashboardFilters ?? null],
    queryFn: () => loadDashboardHome(dashboardFilters),
    placeholderData: keepPreviousData,
  });
  const invoices = home.data?.invoices ?? emptyInvoices;
  const quotes = home.data?.quotes ?? emptyQuotes;
  const dashboard = home.data?.dashboard ?? null;
  const error = home.data?.invoiceError ?? null;
  const loading = home.isPending && !home.data;
  const refreshing = home.isRefetching && !home.isPending;
  useEffect(() => {
    let active = true;
    homeTaskStorage.isDismissed()
      .then((dismissed) => { if (active) setTasksDismissed(dismissed); })
      .catch(() => { if (active) setTasksDismissed(false); });
    return () => { active = false; };
  }, []);
  const paid = useMemo(() => invoices.filter((item) => item.status === 'paid'), [invoices]);
  const outstanding = useMemo(() => invoices.filter((item) => item.status === 'sent' || item.status === 'overdue'), [invoices]);
  const totalPaid = paid.reduce((sum, item) => sum + item.total, 0);
  const totalOutstanding = outstanding.reduce((sum, item) => sum + item.total, 0);
  const overdueCount = invoices.filter((item) => item.status === 'overdue').length;
  const balance = closingBalance(dashboard, totalOutstanding, totalPaid);
  const greeting = greetingFrom(user);
  const profile = useQuery({ queryKey: ['business-profile'], queryFn: () => businessProfileApi.get() });
  const openQuickAction = (action: HomeQuickActionId) => {
    const link = homeQuickActionLink(action);
    navigation.navigate(link.tab, link.params);
  };
  const openInvoices = () => navigation.navigate('Invoices', invoiceTabParams({ name: 'InvoiceList' }));
  const openQuotes = () => navigation.navigate('Invoices', invoiceTabParams({ name: 'QuoteList' }));
  const openBusiness = () => navigation.navigate('More', moreTabParams({ name: 'BusinessSettings' }));
  const openGstSettings = () => navigation.navigate('More', moreTabParams({ name: 'Reports' }));
  const openFirstInvoice = useCallback(() => {
    navigation.navigate('Invoices', invoiceTabParams({ name: 'InvoiceCreate' }));
  }, [navigation]);
  const firstInvoice = invoices.length === 0;
  const dismissTasks = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setTasksDismissed(true);
    homeTaskStorage.dismiss().catch((storageError) => {
      console.error('Error saving home task dismissal:', storageError);
      setTasksDismissed(false);
    });
  };
  const retry = () => { void home.refetch(); };
  const tasks = (
    <HomeTasks
      dismissed={tasksDismissed}
      firstInvoice={firstInvoice}
      overdueCount={overdueCount}
      onReview={openInvoices}
      onCreate={openFirstInvoice}
      onContinue={openBusiness}
      onDismiss={dismissTasks}
    />
  );

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

  const balanceLabel = balanceVisible ? `Closing cash ${formatMoney(balance, 'NZD')}` : 'Closing cash hidden';
  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={[styles.content, { paddingTop: 20 + insets.top, paddingBottom: bottomPadding }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={retry} tintColor={theme.colors.accent} />}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.topRow}>
        <View><Text style={theme.type.subhead}>Good to see you</Text><Text style={[theme.type.title, { marginTop: 2 }]}>{greeting.first}</Text></View>
        <View style={[styles.avatar, { backgroundColor: theme.colors.accent }]}><Text style={[styles.avatarText, { color: theme.colors.accentForeground }]}>{greeting.name.slice(0, 1).toUpperCase()}</Text></View>
      </View>
      {needsGstFilingSettings(profile.data) ? <GstFilingSettingsBanner onOpen={openGstSettings} /> : null}
      {firstInvoice ? tasks : null}
      <View style={styles.balanceRow}>
        <View style={{ flex: 1 }}>
          <Text style={theme.type.subhead}>Closing cash</Text>
          <Text selectable style={[theme.type.money, styles.money]} accessibilityLabel={balanceLabel}>{balanceVisible ? formatMoney(balance, 'NZD') : '••••••'}</Text>
        </View>
        <View style={styles.balanceActions}>
          <CircleIconButton icon={balanceVisible ? 'eye-off' : 'eye'} label={balanceVisible ? 'Hide balance' : 'Show balance'} onPress={() => setBalanceVisible((visible) => !visible)} />
          <CircleIconButton icon="bar-chart-2" label="View invoices" onPress={openInvoices} />
        </View>
      </View>
      <HomeActions onQuickAction={openQuickAction} />
      {error ? (
        <AppPressable onPress={retry} accessibilityRole="button" accessibilityLabel="Retry loading invoices" style={[styles.errorBanner, { backgroundColor: theme.colors.dangerFill }]}>
          <Text style={[theme.type.subhead, { color: theme.colors.danger }]}>{error} Tap to retry.</Text>
        </AppPressable>
      ) : null}
      <HomeReports dashboard={dashboard} savedReports={home.data?.savedReports ?? []} reportError={home.data?.reportError ?? null} onFilters={setDashboardFilters} onRetry={retry} />
      <HomeQuotes quotes={quotes} quoteError={home.data?.quoteError ?? null} onOpen={openQuotes} />
      {firstInvoice ? null : tasks}
      <HomeWorkList invoices={invoices} onSeeAll={openInvoices} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 48 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 36 },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 19, fontWeight: '900' },
  balanceRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  balanceActions: { flexDirection: 'row', gap: 8 }, money: { marginTop: 2, fontVariant: ['tabular-nums'] },
  actions: { flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'flex-start', marginBottom: 16 },
  actionsClosed: { marginBottom: 34 }, sectionTitle: { marginBottom: 14, marginTop: 4 },
  assistantEntry: { borderRadius: 20, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 34, gap: 4, minHeight: 48, justifyContent: 'center' },
  summaryFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 26 },
  periods: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  savedReports: { gap: 8, paddingBottom: 16 },
  reportList: { gap: 12, marginBottom: 28 },
  reportMetric: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginTop: 12 },
  firstInvoiceCard: { marginBottom: 28 },
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
