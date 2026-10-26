import React, { useState, useCallback, useLayoutEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
  Pressable,
} from 'react-native';
import { useFocusEffect, useNavigation, type NavigationProp } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { InvoiceStackParamList, type RootStackParamList } from '@/navigation/types';
import { NativeHeaderButton } from '@/components/ui/NativeHeaderButton';
import { invoiceService } from '@/services/invoiceService';
import { submitInvoicePayment } from '@/features/payments/paymentQueries';
import type { Invoice } from '@/types/invoice';
import type { CreatePaymentRequest } from '@/types/payment';
import SwipeableInvoiceCard from '@/components/invoice/SwipeableInvoiceCard';
import PaymentCaptureModal from '@/components/invoice/PaymentCaptureModal';
import { FilterPills } from '@/components/ui/FilterPills';
import { EmptyState } from '@/components/ui/EmptyState';
import { space } from '@/theme/tokens';
import { formatMoney } from '@/utils/money';
import { useTheme } from '@/theme';
import { useTabScreenInsets } from '@/hooks/useTabScreenInsets';
import { SalesDocumentSwitch } from '@/components/quotes/SalesDocumentSwitch';
import { canImportInvoices } from '@/features/auth/invoiceAccess';
import { useStore } from '@/store';

type InvoiceListNavigationProp = NativeStackNavigationProp<InvoiceStackParamList, 'InvoiceList'>;

export default function InvoiceListScreen() {
  const theme = useTheme();
  const { colors: palette, type } = theme;
  const styles = createStyles(theme);
  const { bottomPadding } = useTabScreenInsets();
  const navigation = useNavigation<InvoiceListNavigationProp>();
  const canImport = useStore((state) => canImportInvoices(state.permissions));
  const queryClient = useQueryClient();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [filteredInvoices, setFilteredInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'draft' | 'sent' | 'paid' | 'overdue'>('all');
  const [updatingStatus, setUpdatingStatus] = useState<Record<string, boolean>>({});
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState<Invoice | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const clearFilters = () => {
    setSearchQuery('');
    setFilter('all');
    applyFilters(invoices, '', 'all');
  };

  const loadInvoices = async () => {
    try {
      const data = await invoiceService.fetchInvoices();
      setInvoices(data);
      setLoadError(null);
      applyFilters(data, searchQuery, filter);
    } catch (error) {
      console.error('Error loading invoices:', error);
      setLoadError('Could not load invoices. Pull to retry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadInvoices();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadInvoices();
  };

  const applyFilters = (data: Invoice[], search: string, statusFilter: typeof filter) => {
    let filtered = data;

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter((inv) => inv.status === statusFilter);
    }

    // Apply search filter
    if (search) {
      const lowerSearch = search.toLowerCase();
      filtered = filtered.filter(
        (inv) =>
          inv.invoiceNumber.toLowerCase().includes(lowerSearch) ||
          inv.customer?.name.toLowerCase().includes(lowerSearch) ||
          inv.customer?.email.toLowerCase().includes(lowerSearch)
      );
    }

    setFilteredInvoices(filtered);
  };

  const handleSearch = (text: string) => {
    setSearchQuery(text);
    applyFilters(invoices, text, filter);
  };

  const handleFilterChange = (newFilter: typeof filter) => {
    setFilter(newFilter);
    applyFilters(invoices, searchQuery, newFilter);
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      headerSearchBarOptions:
        invoices.length > 0
          ? {
              placeholder: 'Search invoices',
              hideWhenScrolling: true,
              onChangeText: (event) => handleSearch(event.nativeEvent.text),
            }
          : undefined,
      headerRight: () => <View style={styles.headerActions}>
        {canImport ? <NativeHeaderButton label="Import" accessibilityHint="Imports a PDF or photo as a draft" onPress={() => (navigation.getParent()?.getParent() as NavigationProp<RootStackParamList> | undefined)?.navigate('ImportCapture', { entry: 'invoices' })} /> : null}
        <NativeHeaderButton label="New" primary onPress={() => navigation.navigate('InvoiceCreate')} />
      </View>,
    });
  }, [canImport, filter, invoices, navigation]);

  const handleStatusChange = async (invoiceId: string, newStatus: string) => {
    // If changing to "paid", open payment capture modal
    if (newStatus === 'paid') {
      const invoice = invoices.find((i) => i.id === invoiceId);
      if (invoice && invoice.status !== 'paid') {
        setSelectedInvoiceForPayment(invoice);
        setPaymentModalVisible(true);
      }
      return;
    }

    // For other statuses, update directly
    setUpdatingStatus((prev) => ({ ...prev, [invoiceId]: true }));

    try {
      await invoiceService.updateInvoiceStatus(invoiceId, newStatus as any);
      
      // Refresh the list
      await loadInvoices();
      
      Alert.alert('Success', `Invoice status changed to ${newStatus}`);
    } catch (error) {
      console.error('Error updating status:', error);
      Alert.alert('Error', 'Failed to update invoice status. Please try again.');
    } finally {
      setUpdatingStatus((prev) => ({ ...prev, [invoiceId]: false }));
    }
  };

  const handlePaymentSubmit = async (paymentData: CreatePaymentRequest, idempotencyKey: string) => {
    await submitInvoicePayment(queryClient, paymentData, idempotencyKey, (fresh) => {
      setSelectedInvoiceForPayment(fresh);
      setInvoices((current) => current.map((item) => (item.id === fresh.id ? fresh : item)));
      setFilteredInvoices((current) => current.map((item) => (item.id === fresh.id ? fresh : item)));
    });
    await loadInvoices();
    setPaymentModalVisible(false);
    setSelectedInvoiceForPayment(null);
    Alert.alert('Payment recorded', 'The invoice balance has been updated.');
  };

  const formatCurrency = (amount: number, currency: string) => formatMoney(amount, currency);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-NZ', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };


  const renderInvoiceCard = ({ item, index }: { item: Invoice; index: number }) => (
    <SwipeableInvoiceCard
      invoice={item}
      onPress={() => {
        navigation.navigate('InvoiceDetail', { invoiceId: item.id });
      }}
      onStatusChange={handleStatusChange}
      disabled={updatingStatus[item.id]}
      formatCurrency={formatCurrency}
      formatDate={formatDate}
      isFirst={index === 0}
      isLast={index === filteredInvoices.length - 1}
    />
  );

  const renderFilterButtons = () => {
    if (invoices.length === 0) return null;
    return (
      <FilterPills
        options={['all', 'draft', 'sent', 'paid', 'overdue'] as const}
        value={filter}
        onChange={handleFilterChange}
      />
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <SalesDocumentSwitch value="invoices" />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={palette.accent} accessibilityLabel="Loading invoices" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SalesDocumentSwitch value="invoices" />
      {Platform.OS === 'android' && invoices.length > 0 && (
        <View style={styles.androidSearch}>
          <Feather name="search" size={18} color={palette.textSecondary} />
          <TextInput
            style={styles.androidSearchInput}
            placeholder="Search invoices"
            value={searchQuery}
            onChangeText={handleSearch}
            placeholderTextColor={palette.textTertiary}
            accessibilityLabel="Search invoices"
          />
        </View>
      )}
      {loadError && invoices.length > 0 ? (
        <Pressable onPress={onRefresh} accessibilityRole="button" accessibilityLabel="Retry loading invoices" style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{loadError} Tap to retry.</Text>
        </Pressable>
      ) : null}
      {renderFilterButtons()}
      <FlatList
        data={filteredInvoices}
        keyExtractor={(item) => item.id}
        renderItem={renderInvoiceCard}
        contentContainerStyle={[styles.listContent, { paddingBottom: bottomPadding }]}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.accent} colors={[palette.accent]} />
        }
        ListEmptyComponent={
          loadError ? (
            <EmptyState
              title="Couldn't load invoices"
              description={loadError}
              actionLabel="Try again"
              onAction={onRefresh}
            />
          ) : invoices.length === 0 ? (
            <EmptyState
              title="Create your first invoice"
              description="Send it, get paid, GST-ready."
              actionLabel="Create invoice"
              onAction={() => navigation.navigate('InvoiceCreate')}
            />
          ) : (
            <EmptyState
              title="No invoices match"
              description="Try a different search or status."
              actionLabel="Show all"
              onAction={clearFilters}
            />
          )
        }
      />

      {/* Payment Capture Modal */}
      {selectedInvoiceForPayment && (
        <PaymentCaptureModal
          visible={paymentModalVisible}
          invoice={selectedInvoiceForPayment}
          onSubmit={handlePaymentSubmit}
          onClose={() => {
            setPaymentModalVisible(false);
            setSelectedInvoiceForPayment(null);
          }}
        />
      )}
    </View>
  );
}

const createStyles = ({ colors: palette, type }: ReturnType<typeof useTheme>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: palette.background,
  },
  androidSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: space.screen,
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: palette.fill,
    borderRadius: 20,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
  },
  androidSearchInput: {
    flex: 1,
    fontSize: 16,
    color: palette.text,
  },
  listContent: {
    paddingHorizontal: space.screen,
    paddingTop: 8,
    paddingBottom: 32,
  },
  emptyContainer: {
    padding: 48,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 17,
    fontWeight: '600',
    color: palette.text,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 15,
    color: palette.textSecondary,
    textAlign: 'center',
  },
  errorBanner: {
    marginHorizontal: space.screen,
    marginTop: 8,
    minHeight: 44,
    borderRadius: 16,
    backgroundColor: palette.dangerFill,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  errorBannerText: {
    color: palette.danger,
    fontSize: 14,
    fontWeight: '600',
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
