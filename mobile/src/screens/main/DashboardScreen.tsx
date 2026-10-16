import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, LayoutAnimation, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { CompositeNavigationProp, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { NativeBottomTabNavigationProp } from '@bottom-tabs/react-navigation';
import { useAuth } from '@/store';
import { invoiceService } from '@/services/invoiceService';
import type { Invoice } from '@/types/invoice';
import type { HomeStackParamList, MainTabParamList } from '@/navigation/types';
import { Card, CircleIconButton, DashedSetupCard, PillButton } from '@/components/ui';
import { formatMoney } from '@/utils/money';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type DashboardNavigation = CompositeNavigationProp<NativeStackNavigationProp<HomeStackParamList, 'DashboardHome'>, NativeBottomTabNavigationProp<MainTabParamList>>;

export default function DashboardScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<DashboardNavigation>();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const cardWidth = Math.max(280, width - 40);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summaryPage, setSummaryPage] = useState(0);
  const [tasksDismissed, setTasksDismissed] = useState(false);
  const [balanceVisible, setBalanceVisible] = useState(true);

  const load = useCallback(async () => {
    try { setInvoices(await invoiceService.fetchInvoices()); }
    catch (error) { console.error('Error loading dashboard data:', error); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const paid = useMemo(() => invoices.filter((item) => item.status === 'paid'), [invoices]);
  const outstanding = useMemo(() => invoices.filter((item) => item.status === 'sent' || item.status === 'overdue'), [invoices]);
  const totalPaid = paid.reduce((sum, item) => sum + item.total, 0);
  const totalOutstanding = outstanding.reduce((sum, item) => sum + item.total, 0);
  const overdue = invoices.filter((item) => item.status === 'overdue');
  const name = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'there';
  const firstName = name.split(' ')[0];

  const openInvoice = () => navigation.navigate('Invoices', { screen: 'InvoiceCreate' });
  const openInvoices = () => navigation.navigate('Invoices', { screen: 'InvoiceList' });
  const openExpense = () => navigation.navigate('More', { screen: 'ExpenseCreate' });

  if (loading) return <View style={[styles.center, { backgroundColor: theme.colors.background }]}><ActivityIndicator size="large" color={theme.colors.accent} /></View>;

  return <ScrollView
    style={{ backgroundColor: theme.colors.background }}
    contentContainerStyle={[styles.content, { paddingTop: 20 + insets.top }]}
    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.colors.accent} />}
    showsVerticalScrollIndicator={false}
  >
    <View style={styles.topRow}>
      <View><Text style={theme.type.subhead}>Good to see you</Text><Text style={[theme.type.title, { marginTop: 2 }]}>{firstName}</Text></View>
      <View style={[styles.avatar, { backgroundColor: theme.colors.accent }]}><Text style={styles.avatarText}>{name.slice(0, 1).toUpperCase()}</Text></View>
    </View>

    <View style={styles.balanceRow}>
      <View style={{ flex: 1 }}><Text style={theme.type.subhead}>Total balance</Text><Text style={[theme.type.money, styles.money]} accessibilityLabel={balanceVisible ? `Total balance ${formatMoney(totalOutstanding || totalPaid, 'NZD')}` : 'Total balance hidden'}>{balanceVisible ? formatMoney(totalOutstanding || totalPaid, 'NZD') : '••••••'}</Text></View>
      <View style={styles.balanceActions}><CircleIconButton icon={balanceVisible ? 'eye-off' : 'eye'} label={balanceVisible ? 'Hide balance' : 'Show balance'} onPress={() => setBalanceVisible((visible) => !visible)} /><CircleIconButton icon="bar-chart-2" label="View invoices" onPress={openInvoices} /></View>
    </View>

    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.actions}>
      <PillButton label="New invoice" icon={<Feather name="plus" size={17} color={theme.colors.accentForeground} />} onPress={openInvoice} />
      <PillButton label="Record payment" variant="secondary" icon={<Feather name="check" size={17} color={theme.colors.accentText} />} onPress={openInvoices} />
      <PillButton label="Request" variant="secondary" icon={<Feather name="send" size={17} color={theme.colors.accentText} />} onPress={openInvoice} />
      <PillButton label="Scan receipt" variant="ghost" icon={<Feather name="camera" size={17} color={theme.colors.text} />} onPress={openExpense} />
    </ScrollView>

    <Text style={[theme.type.headline, styles.sectionTitle]}>Business summary</Text>
    <ScrollView horizontal pagingEnabled snapToInterval={cardWidth + 12} decelerationRate="fast" showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }} onMomentumScrollEnd={(event) => setSummaryPage(Math.round(event.nativeEvent.contentOffset.x / (cardWidth + 12)))}>
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

    {!tasksDismissed ? <>
      <Text style={[theme.type.headline, styles.sectionTitle]}>Tasks</Text>
      <Card>
        <View style={styles.taskHeader}><View style={[styles.taskIcon, { backgroundColor: theme.colors.accentFill }]}><Feather name={overdue.length ? 'clock' : 'zap'} size={20} color={theme.colors.accentText} /></View><View style={{ flex: 1 }}><Text style={theme.type.headline}>{overdue.length ? `${overdue.length} overdue invoice${overdue.length === 1 ? '' : 's'}` : 'Finish setting up'}</Text><Text style={[theme.type.subhead, { marginTop: 3 }]}>{overdue.length ? 'Follow up and keep cash flow moving.' : 'Add your business details before sending an invoice.'}</Text></View></View>
        <View style={styles.taskActions}><PillButton label={overdue.length ? 'Review' : 'Continue'} onPress={overdue.length ? openInvoices : () => navigation.navigate('More', { screen: 'BusinessSettings' })} style={{ flex: 1 }} /><PillButton label="Dismiss" variant="ghost" onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setTasksDismissed(true); }} /></View>
      </Card>
    </> : <DashedSetupCard title="You're all caught up" description="New tasks and overdue invoices will show here." icon="check" />}
  </ScrollView>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 48 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 36 },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#163300', fontSize: 19, fontWeight: '900' },
  balanceRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  balanceActions: { flexDirection: 'row', gap: 8 }, money: { marginTop: 2, fontVariant: ['tabular-nums'] },
  actions: { gap: 10, paddingRight: 20, marginBottom: 34 }, sectionTitle: { marginBottom: 14, marginTop: 4 },
  summaryFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 26 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 12, marginBottom: 28 },
  taskHeader: { flexDirection: 'row', gap: 14, alignItems: 'center' }, taskIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  taskActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
});
