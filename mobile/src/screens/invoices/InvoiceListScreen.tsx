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
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { InvoiceStackParamList } from '@/navigation/types';
import { NativeHeaderButton } from '@/components/ui/NativeHeaderButton';
import { invoiceService } from '@/services/invoiceService';
import { paymentService } from '@/services/paymentService';
import type { Invoice } from '@/types/invoice';
import type { CreatePaymentRequest } from '@/types/payment';
import { useFocusEffect } from '@react-navigation/native';
import SwipeableInvoiceCard from '@/components/invoice/SwipeableInvoiceCard';
import PaymentCaptureModal from '@/components/invoice/PaymentCaptureModal';
import { FilterPills } from '@/components/ui/FilterPills';
import { EmptyState } from '@/components/ui/EmptyState';
import { palette, space } from '@/theme/tokens';
import { formatMoney } from '@/utils/money';

type InvoiceListNavigationProp = NativeStackNavigationProp<InvoiceStackParamList, 'InvoiceList'>;

export default function InvoiceListScreen() {
  const navigation = useNavigation<InvoiceListNavigationProp>();
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
      headerRight: () => (
        <NativeHeaderButton
          label="New"
          primary
          onPress={() => navigation.navigate('InvoiceCreate')}
        />
      ),
    });
  }, [navigation, invoices, filter]);

  const handleStatusChange = async (invoiceId: string, newStatus: string) => {
    // If changing to "paid", open payment capture modal
    if (newStatus === 'paid') {
      const invoice = invoices.find((i) => i.id === invoiceId);
      if (invoice) {
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

  const handlePaymentSubmit = async (paymentData: CreatePaymentRequest) => {
    try {
      await paymentService.createPayment(paymentData);
      
      // Refresh the invoice list
      await loadInvoices();
      
      // Close modal
      setPaymentModalVisible(false);
      setSelectedInvoiceForPayment(null);
      
      Alert.alert('Success', 'Payment recorded successfully');
    } catch (error) {
      console.error('Error recording payment:', error);
      throw error; // Let the modal handle the error
    }
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
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={palette.accentForeground} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {Platform.OS === 'android' && invoices.length > 0 && (
        <View style={styles.androidSearch}>
          <Feather name="search" size={18} color={palette.textSecondary} />
          <TextInput
            style={styles.androidSearchInput}
            placeholder="Search invoices"
            value={searchQuery}
            onChangeText={handleSearch}
            placeholderTextColor={palette.textTertiary}
          />
        </View>
      )}
      {renderFilterButtons()}
      <FlatList
        data={filteredInvoices}
        keyExtractor={(item) => item.id}
        renderItem={renderInvoiceCard}
        contentContainerStyle={styles.listContent}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.accentForeground} />
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
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No invoices match your filters</Text>
              <Text style={styles.emptySubtext}>Try a different search or status</Text>
            </View>
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

const styles = StyleSheet.create({
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
});
