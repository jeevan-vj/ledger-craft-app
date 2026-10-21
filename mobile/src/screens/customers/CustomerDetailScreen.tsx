import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppPressable } from '@/components/ui/AppPressable';
import { EmptyState, GroupedSection, ListRow, ModernButton } from '@/components/ui';
import { NativeHeaderButton } from '@/components/ui/NativeHeaderButton';
import { summarizeCustomerInvoices } from '@/features/customers/model/customerForms';
import type { CustomerStackParamList } from '@/navigation/types';
import { quotesApi } from '@/features/quotes/api/quotesApi';
import { quoteStatusLabel } from '@/features/quotes/quoteModel';
import { invoiceTabParams } from '@/navigation/links';
import { customerService, type Customer } from '@/services/customerService';
import type { Quote } from '@/types/quote';
import type { Invoice } from '@/types/invoice';
import { formatMoney } from '@/utils/money';
import { getStatusLabel } from '@/utils/statusUtils';
import { space } from '@/theme/tokens';
import { useTheme } from '@/theme';

type Navigation = NativeStackNavigationProp<CustomerStackParamList, 'CustomerDetail'>;
type Route = RouteProp<CustomerStackParamList, 'CustomerDetail'>;

export default function CustomerDetailScreen() {
  const theme = useTheme();
  const navigation = useNavigation<Navigation>();
  const { customerId } = useRoute<Route>().params;
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [nextCustomer, nextInvoices] = await Promise.all([
        customerService.fetchCustomerById(customerId),
        customerService.fetchCustomerInvoices(customerId),
      ]);
      setCustomer(nextCustomer); setInvoices(nextInvoices); setRefreshError(null);
    } catch (error) { setRefreshError(error instanceof Error ? error.message : 'Customer could not be loaded.'); }
    try {
      const nextQuotes = await quotesApi.list({ customerId });
      setQuotes(nextQuotes.quotes);
      setQuoteError(null);
    } catch (error) {
      setQuoteError(error instanceof Error ? error.message : 'Quotes could not be loaded.');
    } finally { setLoading(false); }
  }, [customerId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  useLayoutEffect(() => {
    navigation.setOptions({
      title: customer?.name || 'Customer',
      headerRight: customer ? () => <NativeHeaderButton label="Edit" primary onPress={() => navigation.navigate('CustomerEdit', { customerId })} /> : undefined,
    });
  }, [customer, customerId, navigation]);

  const summary = useMemo(() => summarizeCustomerInvoices(invoices), [invoices]);
  const remove = () => Alert.alert('Delete customer?', 'This only works when no protected accounting records reference the customer.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => {
      setDeleting(true);
      try { await customerService.deleteCustomer(customerId); navigation.goBack(); }
      catch (error) { Alert.alert('Couldn’t delete customer', error instanceof Error ? error.message : 'Try again.'); }
      finally { setDeleting(false); }
    } },
  ]);

  if (loading) return <View style={[styles.center, { backgroundColor: theme.colors.background }]}><ActivityIndicator size="large" color={theme.colors.accent} accessibilityLabel="Loading customer details" /></View>;
  if (!customer) return <View style={[styles.center, { backgroundColor: theme.colors.background }]}><EmptyState title="Customer not found" description={refreshError || 'This customer may no longer exist.'} actionLabel="Try again" onAction={() => { setLoading(true); load(); }} /></View>;

  return <ScrollView style={{ backgroundColor: theme.colors.background }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
    <View style={styles.hero}><View style={[styles.avatar, { backgroundColor: theme.colors.accentFill }]}><Text style={[theme.type.display, { color: theme.colors.accentText }]}>{customer.name.slice(0, 1).toUpperCase()}</Text></View><Text style={[theme.type.title, styles.centerText]}>{customer.name}</Text>{customer.isVip ? <Text style={[theme.type.caption, { color: theme.colors.accentText }]}>VIP CUSTOMER</Text> : null}</View>
    {refreshError ? <Pressable onPress={load} accessibilityRole="button" accessibilityLabel="Retry refreshing customer" style={[styles.banner, { backgroundColor: theme.colors.warningFill }]}><Text style={[theme.type.footnote, { color: theme.colors.warning }]}>{refreshError} Tap to retry.</Text></Pressable> : null}
    <View style={styles.stats}>
      <View style={styles.stat}><Text style={theme.type.caption}>OUTSTANDING</Text><Text style={theme.type.headline}>{formatMoney(summary.outstanding, summary.currency)}</Text></View>
      <View style={styles.stat}><Text style={theme.type.caption}>PAID</Text><Text style={theme.type.headline}>{formatMoney(summary.paid, summary.currency)}</Text></View>
      <View style={styles.stat}><Text style={theme.type.caption}>INVOICES</Text><Text style={theme.type.headline}>{summary.invoiceCount}</Text></View>
    </View>
    <GroupedSection title="Contact">
      <ListRow label="Email" value={customer.email || undefined} placeholder="Not provided" icon={<Feather name="mail" size={18} color={theme.colors.accentText} />} showChevron={Boolean(customer.email)} onPress={customer.email ? () => Linking.openURL(`mailto:${customer.email}`) : undefined} />
      <ListRow label="Phone" value={customer.phone || undefined} placeholder="Not provided" icon={<Feather name="phone" size={18} color={theme.colors.accentText} />} showChevron={Boolean(customer.phone)} onPress={customer.phone ? () => Linking.openURL(`tel:${customer.phone}`) : undefined} />
      <ListRow label="Address" subtitle={[customer.address, customer.city, customer.state, customer.zip, customer.country].filter(Boolean).join(', ') || 'Not provided'} icon={<Feather name="map-pin" size={18} color={theme.colors.accentText} />} showChevron={false} />
    </GroupedSection>
    <ModernButton onPress={() => navigation.getParent()?.navigate('Invoices', { screen: 'InvoiceCreate', params: { customerId } })} fullWidth size="lg" icon={<Feather name="plus" size={18} color={theme.colors.accentForeground} />}>New invoice</ModernButton>
    <Text style={[theme.type.headline, styles.sectionTitle]}>Invoices</Text>
    {invoices.length ? <GroupedSection>{invoices.map((invoice) => <ListRow key={invoice.id} label={invoice.invoiceNumber} subtitle={`${getStatusLabel(invoice.status)} · ${invoice.dueDate}`} value={formatMoney(invoice.balanceDue ?? invoice.total, invoice.currency)} onPress={() => navigation.getParent()?.navigate('Invoices', { screen: 'InvoiceDetail', params: { invoiceId: invoice.id } })} accessibilityHint="Opens invoice details" />)}</GroupedSection> : <EmptyState title="No invoices yet" description="Create this customer’s first invoice." />}
    <View style={styles.sectionHead}><Text style={[theme.type.headline, styles.sectionTitle]}>Quotes</Text><ModernButton onPress={() => navigation.getParent()?.navigate('Invoices', invoiceTabParams({ name: 'QuoteCreate', params: { customerId } }))} size="sm">New quote</ModernButton></View>
    {quoteError ? <AppPressable onPress={load} accessibilityRole="button" accessibilityLabel="Retry loading quotes" style={[styles.banner, { backgroundColor: theme.colors.warningFill }]}><Text style={[theme.type.footnote, { color: theme.colors.warning }]}>{quoteError} Tap to retry.</Text></AppPressable> : null}
    {quotes.length ? <GroupedSection>{quotes.map((quote) => <ListRow key={quote.id} label={quote.quoteNumber} subtitle={`${quoteStatusLabel(quote.status)} · valid ${quote.expiryDate}`} value={formatMoney(quote.total, quote.currency)} onPress={() => navigation.getParent()?.navigate('Invoices', invoiceTabParams({ name: 'QuoteDetail', params: { quoteId: quote.id } }))} accessibilityHint="Opens quote details" />)}</GroupedSection> : quoteError ? null : <EmptyState title="No quotes yet" description="Create a quote or estimate for this customer." />}
    <Pressable onPress={remove} disabled={deleting} accessibilityRole="button" accessibilityLabel="Delete customer" accessibilityState={{ disabled: deleting, busy: deleting }} style={styles.delete}><Text style={[theme.type.callout, { color: theme.colors.danger }]}>{deleting ? 'Deleting…' : 'Delete customer'}</Text></Pressable>
  </ScrollView>;
}

const styles = StyleSheet.create({ center: { flex: 1, alignItems: 'center', justifyContent: 'center' }, content: { padding: space.screen, paddingBottom: 48 }, hero: { alignItems: 'center', marginBottom: space.xxl }, avatar: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', marginBottom: space.md }, centerText: { textAlign: 'center', marginBottom: space.xs }, banner: { padding: space.md, borderRadius: 16, marginBottom: space.lg }, stats: { flexDirection: 'row', gap: space.sm, marginBottom: space.xxl }, stat: { flex: 1, gap: space.xs }, sectionTitle: { marginTop: space.section, marginBottom: space.md }, sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, delete: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: space.lg } });
