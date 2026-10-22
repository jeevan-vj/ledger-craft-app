import React, { useState, useEffect, useLayoutEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Pressable,
  Modal,
} from 'react-native';
import { CompositeNavigationProp, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { NativeBottomTabNavigationProp } from '@bottom-tabs/react-navigation';
import { Feather } from '@expo/vector-icons';
import { InvoiceStackParamList, MainTabParamList } from '@/navigation/types';
import { invoiceService } from '@/services/invoiceService';
import { paymentService } from '@/services/paymentService';
import type { BusinessProfile, Invoice } from '@/types/invoice';
import type { CreatePaymentRequest } from '@/types/payment';
import type { InvoiceTemplateId } from '@/types/invoiceTemplates';
import InvoicePreviewWithTemplates from '@/components/invoice/InvoicePreviewWithTemplates';
import { businessProfileService } from '@/services/businessProfileService';
import StatusPicker from '@/components/invoice/StatusPicker';
import PaymentCaptureModal from '@/components/invoice/PaymentCaptureModal';
import { getStatusLabel, statusInk } from '@/utils/statusUtils';
import { AppPressable } from '@/components/ui/AppPressable';
import { EmptyState } from '@/components/ui/EmptyState';
import { ProfileCompletenessBanner } from '@/components/invoice/ProfileCompletenessBanner';
import { radius, space } from '@/theme/tokens';
import { formatMoney } from '@/utils/money';
import { formatInvoiceDate, invoiceAmountDue } from '@/utils/invoiceTemplates';
import { NativeHeaderButton } from '@/components/ui/NativeHeaderButton';
import { useTheme } from '@/theme';
import InvoiceShareActions from '@/components/invoice/InvoiceShareActions';
import { InvoiceDetailActions } from '@/components/invoice/InvoiceDetailActions';
import { useTabScreenInsets } from '@/hooks/useTabScreenInsets';
import * as ImagePicker from 'expo-image-picker';
import { objectsApi } from '@/features/storage/api/objectsApi';

type InvoiceDetailNavigationProp = CompositeNavigationProp<
  NativeStackNavigationProp<InvoiceStackParamList, 'InvoiceDetail'>,
  NativeBottomTabNavigationProp<MainTabParamList>
>;
type InvoiceDetailRouteProp = RouteProp<InvoiceStackParamList, 'InvoiceDetail'>;

export default function InvoiceDetailScreen() {
  const theme = useTheme();
  const { colors: palette, type } = theme;
  const styles = createStyles(theme);
  const navigation = useNavigation<InvoiceDetailNavigationProp>();
  const route = useRoute<InvoiceDetailRouteProp>();
  const { invoiceId } = route.params;
  const { tabBarClearance } = useTabScreenInsets();

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [shareActionsVisible, setShareActionsVisible] = useState(false);
  const [statusPickerVisible, setStatusPickerVisible] = useState(false);
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [bottomBarHeight, setBottomBarHeight] = useState(0);
  const [history, setHistory] = useState<{ id: string; action: string; createdAt: string }[]>([]);
  const [attachments, setAttachments] = useState<{ id: string; filename: string; size: number }[]>([]);

  useEffect(() => {
    loadData();
  }, [invoiceId]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: invoice?.invoiceNumber || 'Invoice',
      headerRight: invoice
        ? () => (
            <NativeHeaderButton
              label="Preview"
              primary
              onPress={() => setShowPreview(true)}
            />
          )
        : undefined,
    });
  }, [navigation, invoice]);

  const loadData = async () => {
    try {
      setLoadError(null);
      const [invoiceData, profileData] = await Promise.all([
        invoiceService.fetchInvoiceById(invoiceId),
        businessProfileService.getBusinessProfile().catch((error) => {
          console.warn('Business profile unavailable:', error);
          return null;
        }),
      ]);
      setInvoice(invoiceData);
      const [events, files] = await Promise.all([
        invoiceService.getInvoiceHistory(invoiceId),
        invoiceService.getInvoiceAttachments(invoiceId),
      ]);
      setHistory(events);
      setAttachments(files);
      setBusinessProfile(profileData);
      if (!invoiceData) setLoadError(null);
    } catch (error) {
      console.error('Error loading data:', error);
      setLoadError('This invoice could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  const loadInvoice = async () => {
    try {
      const data = await invoiceService.fetchInvoiceById(invoiceId);
      setInvoice(data);
    } catch (error) {
      console.error('Error loading invoice:', error);
      Alert.alert('Error', 'Failed to refresh this invoice.');
    }
  };

  const formatCurrency = (amount: number, currency: string) => formatMoney(amount, currency);

  const handleEdit = () => {
    navigation.navigate('InvoiceEdit', { invoiceId });
  };

  const handleStatusChange = async (newStatus: string) => {
    // If changing to "paid", open payment capture modal
    if (newStatus === 'paid') {
      setPaymentModalVisible(true);
      return;
    }

    // For other statuses, update directly
    setUpdatingStatus(true);

    try {
      await invoiceService.updateInvoiceStatus(invoiceId, newStatus as any);
      
      // Reload invoice data
      await loadInvoice();
      
      Alert.alert('Success', `Invoice status changed to ${newStatus}`);
    } catch (error) {
      console.error('Error updating status:', error);
      Alert.alert('Error', 'Failed to update invoice status. Please try again.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handlePaymentSubmit = async (paymentData: CreatePaymentRequest) => {
    try {
      await paymentService.createPayment(paymentData);
      
      // Reload invoice data
      await loadInvoice();
      
      // Close modal
      setPaymentModalVisible(false);
      
      Alert.alert('Success', 'Payment recorded successfully');
    } catch (error) {
      console.error('Error recording payment:', error);
      throw error; // Let the modal handle the error
    }
  };

  const handleMarkAsPaid = () => {
    setPaymentModalVisible(true);
  };

  const handleDuplicate = async () => {
    try {
      const duplicate = await invoiceService.duplicateInvoice(invoiceId);
      navigation.push('InvoiceDetail', { invoiceId: duplicate.id });
    } catch { Alert.alert('Could not duplicate invoice', 'Please try again.'); }
  };

  const handleRestore = async () => {
    try { setInvoice(await invoiceService.restoreInvoice(invoiceId)); await loadData(); }
    catch { Alert.alert('Could not restore invoice', 'Please try again.'); }
  };

  const handleArchive = () => Alert.alert('Archive invoice?', 'Draft and cancelled invoices can be restored later.', [
    { text: 'Keep invoice', style: 'cancel' },
    { text: 'Archive', style: 'destructive', onPress: async () => {
      try { await invoiceService.archiveInvoice(invoiceId); navigation.goBack(); }
      catch { Alert.alert('Could not archive invoice', 'Cancel an issued invoice before archiving it.'); }
    } },
  ]);

  const handleAttachImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.8 });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset?.base64) throw new Error('The selected image could not be read');
      const filename = asset.fileName ?? `invoice-${invoiceId}.jpg`;
      const uploaded = await objectsApi.upload({
        kind: 'invoice',
        filename,
        contentType: asset.mimeType ?? 'image/jpeg',
        contentBase64: asset.base64,
      });
      await invoiceService.attachInvoiceFile(invoiceId, { objectKey: uploaded.key, filename });
      await loadData();
    } catch (error) {
      console.error('Error attaching invoice image:', error);
      Alert.alert('Could not attach image', 'Use a JPG, PNG or WebP image smaller than 1 MB.');
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={palette.accent} accessibilityLabel="Loading invoice" />
        <Text style={styles.loadingText}>Loading invoice</Text>
      </View>
    );
  }

  if (loadError || !invoice) {
    return (
      <View style={styles.centerContainer}>
        <EmptyState
          title={loadError ? "Couldn't open this invoice" : 'Invoice not found'}
          description={loadError ?? 'It may have been deleted.'}
          actionLabel={loadError ? 'Try again' : 'Go back'}
          onAction={loadError ? () => { setLoading(true); loadData(); } : () => navigation.goBack()}
        />
      </View>
    );
  }

  const ink = statusInk(invoice.status, palette);

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomBarHeight + space.lg }]}
        contentInsetAdjustmentBehavior="automatic"
      >
        <View style={styles.hero}>
          <Text style={styles.customerName}>{invoice.customer?.name || 'No customer'}</Text>
          <Text style={styles.amountValue}>
            {formatCurrency(invoice.total || 0, invoice.currency || 'NZD')}
          </Text>
          <Text style={styles.heroMeta}>
            {invoice.invoiceNumber}
            {' · '}
            <Text style={{ color: ink }}>
              {getStatusLabel(invoice.status)}
            </Text>
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Invoice lifecycle</Text>
          <AppPressable accessibilityRole="button" accessibilityLabel="Duplicate invoice" onPress={handleDuplicate} style={({ pressed }) => [styles.lifecycleAction, pressed && { opacity: 0.7 }]}>
            <Text style={styles.lifecycleLabel}>Duplicate as new draft</Text><Feather name="copy" size={18} color={palette.accentText} />
          </AppPressable>
          {invoice.status === 'cancelled' ? (
            <AppPressable accessibilityRole="button" accessibilityLabel="Restore invoice" onPress={handleRestore} style={({ pressed }) => [styles.lifecycleAction, pressed && { opacity: 0.7 }]}>
              <Text style={styles.lifecycleLabel}>Restore invoice</Text><Feather name="rotate-ccw" size={18} color={palette.accentText} />
            </AppPressable>
          ) : (
            <AppPressable accessibilityRole="button" accessibilityLabel="Cancel invoice" onPress={() => handleStatusChange('cancelled')} style={({ pressed }) => [styles.lifecycleAction, pressed && { opacity: 0.7 }]}>
              <Text style={styles.lifecycleLabel}>Cancel invoice</Text><Feather name="x-circle" size={18} color={palette.danger} />
            </AppPressable>
          )}
          <AppPressable accessibilityRole="button" accessibilityLabel="Archive invoice" onPress={handleArchive} style={({ pressed }) => [styles.lifecycleAction, pressed && { opacity: 0.7 }]}>
            <Text style={styles.lifecycleLabel}>Archive invoice</Text><Feather name="archive" size={18} color={palette.textSecondary} />
          </AppPressable>
          <AppPressable accessibilityRole="button" accessibilityLabel="Attach invoice image" onPress={handleAttachImage} style={({ pressed }) => [styles.lifecycleAction, pressed && { opacity: 0.7 }]}>
            <Text style={styles.lifecycleLabel}>Attach image</Text><Feather name="paperclip" size={18} color={palette.accentText} />
          </AppPressable>
          {attachments.length ? <Text style={styles.lifecycleMeta}>{attachments.length} private attachment{attachments.length === 1 ? '' : 's'} · {attachments.map((file) => file.filename).join(', ')}</Text> : null}
          {history.length ? <Text style={styles.lifecycleMeta}>Latest: {history[0]!.action.replace('_', ' ')}</Text> : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Status</Text>
          <Pressable
            style={styles.statusButton}
            onPress={() => setStatusPickerVisible(true)}
            disabled={updatingStatus}
            accessibilityRole="button"
            accessibilityLabel="Change invoice status"
          >
            <View style={[styles.statusDot, { backgroundColor: ink }]} />
            <Text style={styles.statusButtonValue}>{getStatusLabel(invoice.status)}</Text>
            <Feather name="chevron-right" size={18} color={palette.textTertiary} />
          </Pressable>
          {updatingStatus ? (
            <View style={styles.statusLoading}>
              <ActivityIndicator size="small" color={palette.accent} />
              <Text style={styles.statusLoadingText}>Updating status</Text>
            </View>
          ) : null}
        </View>

        {/* Customer Details Card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Customer Details</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Name</Text>
            <Text style={styles.detailValue}>{invoice.customer?.name || 'N/A'}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Email</Text>
            <Text style={styles.detailValue}>{invoice.customer?.email || 'N/A'}</Text>
          </View>
          {invoice.customer?.phone && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Phone</Text>
              <Text style={styles.detailValue}>{invoice.customer.phone}</Text>
            </View>
          )}
          {invoice.customer?.address && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Address</Text>
              <Text style={styles.detailValue}>
                {[
                  invoice.customer.address,
                  invoice.customer.city,
                  invoice.customer.state,
                  invoice.customer.zip,
                  invoice.customer.country,
                ]
                  .filter(Boolean)
                  .join(', ') || 'N/A'}
              </Text>
            </View>
          )}
        </View>

        {/* Invoice Details Card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Invoice Details</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Date</Text>
            <Text style={styles.detailValue}>{invoice.date ? formatInvoiceDate(invoice.date) : 'N/A'}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Due</Text>
            <Text style={styles.detailValue}>{invoice.dueDate ? formatInvoiceDate(invoice.dueDate) : 'N/A'}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Currency</Text>
            <Text style={styles.detailValue}>{invoice.currency || 'NZD'}</Text>
          </View>
          {invoice.sourceQuoteId && invoice.sourceQuoteNumber ? (
            <AppPressable
              accessibilityRole="button"
              accessibilityLabel={`Converted from ${invoice.sourceQuoteNumber}`}
              onPress={() => navigation.navigate('QuoteDetail', { quoteId: invoice.sourceQuoteId! })}
              style={({ pressed }) => [styles.detailRow, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.detailLabel}>Source</Text>
              <Text style={[styles.detailValue, { color: palette.accentText }]}>Converted from {invoice.sourceQuoteNumber}</Text>
            </AppPressable>
          ) : null}
        </View>

        {/* Line Items Card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Line Items</Text>
          {invoice.items.map((item, index) => (
            <View key={item.id || index} style={styles.lineItem}>
              <View style={styles.lineItemHeader}>
                <Text style={styles.lineItemDescription}>{item.description || 'Item'}</Text>
                <Text style={styles.lineItemTotal}>{formatCurrency(item.total || 0, invoice.currency || 'NZD')}</Text>
              </View>
              <Text style={styles.lineItemDetails}>
                {item.quantity || 0} {item.unit || 'unit'} × {formatCurrency(item.rate || 0, invoice.currency || 'NZD')}
              </Text>
            </View>
          ))}
        </View>

        {/* Summary Card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Summary</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal</Text>
            <Text style={styles.summaryValue}>{formatCurrency(invoice.subtotal || 0, invoice.currency)}</Text>
          </View>
          {(invoice.taxAmount || 0) > 0 && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>
                {invoice.currency?.toUpperCase() === 'NZD' ? 'GST' : 'Tax'}
              </Text>
              <Text style={styles.summaryValue}>{formatCurrency(invoice.taxAmount || 0, invoice.currency)}</Text>
            </View>
          )}
          {(invoice.discount || 0) > 0 && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Discount</Text>
              <Text style={styles.summaryValue}>-{formatCurrency(invoice.discount || 0, invoice.currency)}</Text>
            </View>
          )}
          {(invoice.additionalCharges || 0) > 0 && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Additional</Text>
              <Text style={styles.summaryValue}>
                {formatCurrency(invoice.additionalCharges || 0, invoice.currency)}
              </Text>
            </View>
          )}
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total</Text>
            <Text style={styles.summaryValue}>{formatCurrency(invoice.total || 0, invoice.currency)}</Text>
          </View>
          <View style={[styles.summaryRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Amount due</Text>
            <Text style={styles.totalValue}>
              {formatCurrency(invoiceAmountDue(invoice), invoice.currency || 'NZD')}
            </Text>
          </View>
        </View>

        {/* Notes Card */}
        {(invoice.notes || invoice.terms) && (
          <View style={styles.card}>
            {invoice.notes && (
              <>
                <Text style={styles.sectionTitle}>Notes</Text>
                <Text style={styles.notesText}>{invoice.notes}</Text>
              </>
            )}
            {invoice.terms && (
              <>
                <Text style={[styles.sectionTitle, invoice.notes && { marginTop: 16 }]}>Terms</Text>
                <Text style={styles.notesText}>{invoice.terms}</Text>
              </>
            )}
          </View>
        )}

        <View style={{ paddingBottom: 8 }}>
          <ProfileCompletenessBanner
            profile={businessProfile}
            onCompleteProfile={() => navigation.navigate('BusinessSettings')}
          />
        </View>
      </ScrollView>

      <InvoiceDetailActions
        isPaid={invoice.status === 'paid'}
        bottomInset={tabBarClearance}
        onPreview={() => setShowPreview(true)}
        onRecordPayment={handleMarkAsPaid}
        onShare={() => setShareActionsVisible(true)}
        onEdit={handleEdit}
        onHeightChange={setBottomBarHeight}
      />

      {/* Preview Modal */}
      <Modal
        visible={showPreview}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowPreview(false)}
      >
        {invoice && (
          <InvoicePreviewWithTemplates
            invoice={invoice}
            businessProfile={businessProfile || undefined}
            initialTemplate={(invoice.templateName as InvoiceTemplateId | undefined) || 'classic'}
            onClose={() => setShowPreview(false)}
            onCompleteProfile={() => {
              setShowPreview(false);
              navigation.navigate('BusinessSettings');
            }}
          />
        )}
      </Modal>

      {/* Status Picker Modal */}
      <StatusPicker
        visible={statusPickerVisible}
        currentStatus={invoice.status}
        onSelect={handleStatusChange}
        onClose={() => setStatusPickerVisible(false)}
      />

      {/* Payment Capture Modal */}
      <PaymentCaptureModal
        visible={paymentModalVisible}
        invoice={invoice}
        onSubmit={handlePaymentSubmit}
        onClose={() => setPaymentModalVisible(false)}
      />

      <InvoiceShareActions
        visible={shareActionsVisible}
        invoice={invoice}
        businessProfile={businessProfile || undefined}
        onClose={() => setShareActionsVisible(false)}
      />
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
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: palette.textSecondary,
  },
  errorText: {
    fontSize: 17,
    color: palette.danger,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: space.screen,
    paddingTop: 8,
  },
  hero: {
    marginBottom: 24,
  },
  customerName: {
    fontSize: 15,
    color: palette.textSecondary,
    marginBottom: 4,
  },
  amountValue: {
    fontSize: 44,
    fontWeight: '900',
    color: palette.text,
    letterSpacing: -1.4,
    fontVariant: ['tabular-nums'],
  },
  heroMeta: {
    fontSize: 15,
    color: palette.textSecondary,
    marginTop: 6,
  },
  card: {
    backgroundColor: palette.surfaceRaised,
    borderRadius: radius.group,
    padding: space.lg,
    marginBottom: space.lg,
    borderWidth: 1,
    borderColor: palette.border,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: palette.textSecondary,
    letterSpacing: -0.08,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.separator,
  },
  detailLabel: {
    fontSize: 15,
    color: palette.textSecondary,
  },
  detailValue: {
    fontSize: 15,
    color: palette.text,
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
    marginLeft: 16,
  },
  lineItem: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.separator,
  },
  lineItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  lineItemDescription: {
    fontSize: 16,
    fontWeight: '500',
    color: palette.text,
    flex: 1,
  },
  lineItemTotal: {
    fontSize: 16,
    fontWeight: '600',
    color: palette.text,
    fontVariant: ['tabular-nums'],
  },
  lineItemDetails: {
    fontSize: 13,
    color: palette.textSecondary,
  },
  lifecycleAction: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.separator,
  },
  lifecycleLabel: { fontSize: 16, fontWeight: '600', color: palette.text },
  lifecycleMeta: { marginTop: space.sm, fontSize: 13, color: palette.textSecondary },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  summaryLabel: {
    fontSize: 15,
    color: palette.textSecondary,
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: '500',
    color: palette.text,
    fontVariant: ['tabular-nums'],
  },
  totalRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.separator,
    marginTop: 8,
    paddingTop: 12,
  },
  totalLabel: {
    fontSize: 17,
    fontWeight: '600',
    color: palette.text,
  },
  totalValue: {
    fontSize: 20,
    fontWeight: '700',
    color: palette.text,
    fontVariant: ['tabular-nums'],
  },
  notesText: {
    fontSize: 15,
    color: palette.text,
    lineHeight: 22,
  },
  statusButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusButtonValue: {
    flex: 1,
    fontSize: 17,
    fontWeight: '500',
    color: palette.text,
  },
  statusLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  statusLoadingText: {
    fontSize: 14,
    color: palette.textSecondary,
  },
});
