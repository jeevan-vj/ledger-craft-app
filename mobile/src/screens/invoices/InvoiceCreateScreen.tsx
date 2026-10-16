import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import { InvoiceStackParamList } from '@/navigation/types';
import { invoiceService } from '@/services/invoiceService';
import type { LineItem, Invoice, Customer } from '@/types/invoice';
import { ModernInput } from '@/components/ui/ModernInput';
import InvoicePreviewWithTemplates from '@/components/invoice/InvoicePreviewWithTemplates';
import { CustomerPicker } from '@/components/customers/CustomerPicker';
import { Customer as CustomerType } from '@/services/customerService';
import { ItemPicker } from '@/components/items/ItemPicker';
import { Item } from '@/services/itemService';
import { businessProfileService } from '@/services/businessProfileService';
import type { InvoiceTemplateId } from '@/types/invoiceTemplates';
import { NativeHeaderButton } from '@/components/ui/NativeHeaderButton';
import { SmartDatePicker } from '@/components/ui/SmartDatePicker';
import { CompactLineItem } from '@/components/invoice/CompactLineItem';
import { TaxConfigCard } from '@/components/invoice/TaxConfigCard';
import { ProgressIndicator } from '@/components/invoice/ProgressIndicator';
import { ProfileCompletenessBanner } from '@/components/invoice/ProfileCompletenessBanner';
import { Feather } from '@expo/vector-icons';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme';

type InvoiceCreateNavigationProp = NativeStackNavigationProp<InvoiceStackParamList, 'InvoiceCreate'>;
type InvoiceEditRouteProp = RouteProp<{ InvoiceEdit: { invoiceId?: string } }, 'InvoiceEdit'>;

export default function InvoiceCreateScreen() {
  const theme = useTheme();
  const { colors: palette, type } = theme;
  const styles = createStyles(theme);
  const navigation = useNavigation<InvoiceCreateNavigationProp>();
  const route = useRoute<InvoiceEditRouteProp>();
  
  // Check if editing existing invoice
  const invoiceId = route.params?.invoiceId;
  const isEditMode = !!invoiceId;

  // Form state
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerType | null>(null);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [currency, setCurrency] = useState('NZD');
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('');
  const [templateName, setTemplateName] = useState<InvoiceTemplateId>('classic');
  
  // Line items
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { id: '1', description: '', quantity: 1, unit: 'each', rate: 0, total: 0 },
  ]);

  // Calculations
  const [subtotal, setSubtotal] = useState(0);
  const [taxAmount, setTaxAmount] = useState(0);
  const [total, setTotal] = useState(0);
  const [taxEnabled, setTaxEnabled] = useState(false);
  const [taxRate, setTaxRate] = useState(15);

  // Loading states
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [showItemPicker, setShowItemPicker] = useState(false);
  const [currentLineItemIndex, setCurrentLineItemIndex] = useState<number | null>(null);
  const [businessProfile, setBusinessProfile] = useState<Awaited<ReturnType<typeof businessProfileService.getBusinessProfile>>>(null);

  // Load initial data
  useEffect(() => {
    loadInitialData();
  }, [invoiceId]);

  const loadInitialData = async () => {
    try {
      const fallbackNumber = () => {
        const now = new Date();
        const year = now.getFullYear();
        return `INV-${year}-0001`;
      };

      const [number, customerList, profile] = await Promise.all([
        invoiceService.generateInvoiceNumber().catch((error) => {
          console.warn('Invoice number unavailable:', error);
          return fallbackNumber();
        }),
        invoiceService.fetchCustomers().catch((error) => {
          console.warn('Customers unavailable:', error);
          return [];
        }),
        businessProfileService.getBusinessProfile().catch((error) => {
          console.warn('Business profile unavailable:', error);
          return null;
        }),
      ]);
      
      setCustomers(customerList);
      setBusinessProfile(profile);
      
      // If editing, load existing invoice data
      if (isEditMode && invoiceId) {
        const existingInvoice = await invoiceService.fetchInvoiceById(invoiceId);
        if (existingInvoice) {
          setInvoiceNumber(existingInvoice.invoiceNumber);
          setCustomerId(existingInvoice.customerId || '');
          setDate(existingInvoice.date);
          setDueDate(existingInvoice.dueDate);
          setCurrency(existingInvoice.currency);
          setNotes(existingInvoice.notes || '');
          setTerms(existingInvoice.terms || '');
          setTemplateName((existingInvoice.templateName as InvoiceTemplateId) || 'classic');
          setSubtotal(existingInvoice.subtotal);
          setTaxAmount(existingInvoice.taxAmount);
          setTotal(existingInvoice.total);
          setTaxEnabled(existingInvoice.taxAmount > 0);
          setTaxRate(
            existingInvoice.taxAmount > 0 && existingInvoice.subtotal > 0
              ? Math.round((existingInvoice.taxAmount / existingInvoice.subtotal) * 100)
              : 15
          );
          
          // Load line items
          if (existingInvoice.items && existingInvoice.items.length > 0) {
            setLineItems(existingInvoice.items.map((item, index) => ({
              id: item.id || String(index + 1),
              description: item.description,
              quantity: item.quantity,
              unit: item.unit || 'each',
              rate: item.rate,
              total: item.total,
            })));
          }
          
          // Find and set customer
          const customer = customerList.find(c => c.id === existingInvoice.customerId);
          if (customer) {
            setSelectedCustomer(customer as CustomerType);
          }
        }
      } else {
        setInvoiceNumber(number);
        
        // Only set defaults for new invoices
        if (profile) {
          if (profile.defaultTerms) setTerms(profile.defaultTerms);
          if (profile.defaultNotes) setNotes(profile.defaultNotes);
          if (profile.defaultTaxRate) setTaxRate(profile.defaultTaxRate);
        }
        
        if (customerList.length > 0) {
          setCustomerId(customerList[0].id);
        }
      }
    } catch (error) {
      console.error('Error loading initial data:', error);
      Alert.alert('Error', 'Failed to load initial data');
    } finally {
      setLoadingCustomers(false);
    }
  };

  // Calculate totals
  useEffect(() => {
    const newSubtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
    setSubtotal(newSubtotal);

    const newTaxAmount = taxEnabled ? (newSubtotal * taxRate) / 100 : 0;
    setTaxAmount(newTaxAmount);

    setTotal(newSubtotal + newTaxAmount);
  }, [lineItems, taxEnabled, taxRate]);

  const updateLineItem = (index: number, field: keyof LineItem, value: any) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };

    if (field === 'quantity' || field === 'rate') {
      updated[index].total = updated[index].quantity * updated[index].rate;
    }

    setLineItems(updated);
  };

  const addLineItem = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newItem: LineItem = {
      id: String(lineItems.length + 1),
      description: '',
      quantity: 1,
      unit: 'each',
      rate: 0,
      total: 0,
    };
    setLineItems([...lineItems, newItem]);
  };

  const addCustomLineItem = () => {
    addLineItem();
  };

  const duplicateLastItem = () => {
    if (lineItems.length > 0) {
      const lastItem = lineItems[lineItems.length - 1];
      const newItem: LineItem = {
        ...lastItem,
        id: String(lineItems.length + 1),
      };
      setLineItems([...lineItems, newItem]);
    }
  };

  const removeLineItem = (index: number) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter((_, i) => i !== index));
    }
  };

  const handleSelectItem = (item: Item) => {
    if (currentLineItemIndex !== null) {
      const updated = [...lineItems];
      const currentItem = updated[currentLineItemIndex];
      
      updated[currentLineItemIndex] = {
        ...currentItem,
        description: item.name,
        rate: item.salePrice || 0,
        unit: item.unit || 'each',
        total: currentItem.quantity * (item.salePrice || 0),
      };
      
      setLineItems(updated);
    }
  };

  const openItemPicker = (index: number) => {
    setCurrentLineItemIndex(index);
    setShowItemPicker(true);
  };

  const formatCurrency = (amount: number) => {
    return `$${amount.toFixed(2)}`;
  };

  const isFormValid = (): boolean => {
    if (!invoiceNumber) return false;
    if (!customerId) return false;
    
    const validItems = lineItems.filter(
      (item) => item.description && item.quantity > 0 && item.rate >= 0
    );
    
    if (validItems.length === 0) return false;
    
    return true;
  };

  const validateForm = (): boolean => {
    if (!invoiceNumber) {
      Alert.alert('Validation Error', 'Invoice number is required');
      return false;
    }

    if (!customerId) {
      Alert.alert('Validation Error', 'Please select a customer');
      return false;
    }

    const validItems = lineItems.filter(
      (item) => item.description && item.quantity > 0 && item.rate >= 0
    );

    if (validItems.length === 0) {
      Alert.alert('Validation Error', 'Please add at least one line item');
      return false;
    }

    return true;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    try {
      const invoiceData: Partial<Invoice> = {
        invoiceNumber,
        customerId,
        date,
        dueDate,
        subtotal,
        taxAmount,
        total,
        notes,
        terms,
        currency,
        templateName,
      };

      if (isEditMode && invoiceId) {
        // Update existing invoice
        await invoiceService.updateInvoice(invoiceId, invoiceData, lineItems);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Success', 'Invoice updated successfully', [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ]);
      } else {
        // Create new invoice
        invoiceData.status = 'draft';
        await invoiceService.createInvoice(invoiceData, lineItems);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Success', 'Invoice created successfully', [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ]);
      }
    } catch (error) {
      console.error('Error saving invoice:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', `Failed to ${isEditMode ? 'update' : 'create'} invoice. Please try again.`);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert('Discard Changes?', 'Are you sure you want to discard this invoice?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => navigation.goBack() },
    ]);
  };

  const handlePreview = () => {
    if (loadingCustomers) return;
    if (!validateForm()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowPreview(true);
  };

  const handleCancelRef = useRef(handleCancel);
  const handleSaveRef = useRef(handleSave);
  const handlePreviewRef = useRef(handlePreview);
  handleCancelRef.current = handleCancel;
  handleSaveRef.current = handleSave;
  handlePreviewRef.current = handlePreview;

  useLayoutEffect(() => {
    navigation.setOptions({
      title: isEditMode ? 'Edit invoice' : 'New invoice',
      headerLeft: () => (
        <NativeHeaderButton
          label="Cancel"
          onPress={() => handleCancelRef.current()}
        />
      ),
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <NativeHeaderButton
            label="Preview"
            onPress={() => handlePreviewRef.current()}
          />
          <NativeHeaderButton
            label={isEditMode ? 'Update' : 'Save'}
            primary
            onPress={() => handleSaveRef.current()}
            disabled={loading}
          />
        </View>
      ),
    });
  }, [navigation, isEditMode, loading]);

  const getPreviewInvoice = (): Invoice => {
    const customer = customers.find((c) => c.id === customerId);
    return {
      id: 'preview',
      invoiceNumber,
      customerId,
      customer,
      date,
      dueDate,
      items: lineItems,
      subtotal,
      taxAmount,
      total,
      status: 'draft',
      notes,
      terms,
      currency,
      templateName,
    };
  };

  // Progress calculation (use silent validation)
  const progressSteps = [
    { label: 'Customer', completed: !!customerId },
    { label: 'Items', completed: lineItems.some(item => item.description && item.total > 0) },
    { label: 'Review', completed: isFormValid() },
  ];

  if (loadingCustomers) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={palette.accent} />
        <Text style={styles.loadingText}>Loading invoice</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView 
        style={styles.scrollView} 
        contentContainerStyle={styles.scrollContent}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        {/* Progress Indicator */}
        <ProgressIndicator steps={progressSteps} />
        <ProfileCompletenessBanner
          profile={businessProfile}
          onCompleteProfile={() => {
            (navigation.getParent() as any)?.navigate('More', { screen: 'BusinessSettings' });
          }}
        />

        {/* Invoice Details Card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Invoice Details</Text>

          <ModernInput
            label="Invoice Number"
            value={invoiceNumber}
            onChangeText={setInvoiceNumber}
            placeholder="INV-0001"
          />

          {/* Customer Picker */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>
              Customer <Text style={styles.required}>*</Text>
            </Text>
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowCustomerPicker(true);
              }}
              style={styles.customerButton}
              activeOpacity={0.7}
            >
              {selectedCustomer ? (
                <View style={styles.selectedCustomerContainer}>
                  <View style={styles.customerAvatar}>
                    <Text style={styles.customerAvatarText}>
                      {selectedCustomer.name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .toUpperCase()
                        .slice(0, 2)}
                    </Text>
                  </View>
                  <View style={styles.customerInfo}>
                    <Text style={styles.customerName}>{selectedCustomer.name}</Text>
                    {selectedCustomer.email && (
                      <Text style={styles.customerEmail}>{selectedCustomer.email}</Text>
                    )}
                  </View>
                  <Feather name="chevron-right" size={18} color={palette.textTertiary} />
                </View>
              ) : (
                <Text style={styles.placeholderText}>Tap to select customer</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Smart Date Pickers */}
          <View style={styles.row}>
            <View style={styles.halfWidth}>
              <SmartDatePicker
                label="Invoice Date"
                value={date}
                onChangeDate={setDate}
              />
            </View>
            <View style={styles.halfWidth}>
              <SmartDatePicker
                label="Due Date"
                value={dueDate}
                onChangeDate={setDueDate}
                minimumDate={new Date(date)}
              />
            </View>
          </View>
        </View>

        {/* Line Items Card */}
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Line Items</Text>
            <Text style={styles.itemCount}>{lineItems.length}</Text>
          </View>

          {lineItems.map((item, index) => (
            <CompactLineItem
              key={item.id}
              item={item}
              index={index}
              onUpdate={updateLineItem}
              onRemove={removeLineItem}
              onSelectItem={openItemPicker}
              canRemove={lineItems.length > 1}
              formatCurrency={formatCurrency}
            />
          ))}

          <View style={styles.lineItemActions}>
            <TouchableOpacity
              onPress={addCustomLineItem}
              style={styles.lineItemAction}
              accessibilityRole="button"
              accessibilityLabel="Add line"
            >
              <Text style={styles.lineItemActionText}>Add line</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                addLineItem();
                setTimeout(() => openItemPicker(lineItems.length), 100);
              }}
              style={styles.lineItemAction}
              accessibilityRole="button"
              accessibilityLabel="Add from catalog"
            >
              <Text style={styles.lineItemActionText}>From catalog</Text>
            </TouchableOpacity>
            {lineItems.length > 0 && (
              <TouchableOpacity
                onPress={duplicateLastItem}
                style={styles.lineItemAction}
                accessibilityRole="button"
                accessibilityLabel="Duplicate last line"
              >
                <Text style={styles.lineItemActionText}>Duplicate last</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Tax Configuration */}
        <TaxConfigCard
          taxEnabled={taxEnabled}
          taxRate={taxRate}
          subtotal={subtotal}
          taxAmount={taxAmount}
          total={total}
          onTaxEnabledChange={setTaxEnabled}
          onTaxRateChange={setTaxRate}
          formatCurrency={formatCurrency}
        />

        {/* Notes Card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Additional Information</Text>

          <ModernInput
            label="Notes"
            value={notes}
            onChangeText={setNotes}
            placeholder="Add any notes..."
            multiline
          />

          <ModernInput
            label="Payment Terms"
            value={terms}
            onChangeText={setTerms}
            placeholder="Payment terms..."
            multiline
          />
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* Modals */}
      <ItemPicker
        visible={showItemPicker}
        onSelect={handleSelectItem}
        onClose={() => {
          setShowItemPicker(false);
          setCurrentLineItemIndex(null);
        }}
      />

      <CustomerPicker
        visible={showCustomerPicker}
        onSelect={(customer) => {
          setSelectedCustomer(customer);
          setCustomerId(customer.id);
        }}
        onClose={() => setShowCustomerPicker(false)}
        selectedCustomerId={selectedCustomer?.id}
      />

      <Modal
        visible={showPreview}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowPreview(false)}
      >
        <InvoicePreviewWithTemplates
          invoice={getPreviewInvoice()}
          businessProfile={businessProfile || undefined}
          initialTemplate={templateName}
          onClose={() => setShowPreview(false)}
          onCompleteProfile={() => {
            (navigation.getParent() as any)?.navigate('More', { screen: 'BusinessSettings' });
          }}
        />
      </Modal>
    </KeyboardAvoidingView>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: space.screen,
  },
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.group,
    padding: space.lg,
    marginBottom: space.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: palette.textSecondary,
    letterSpacing: -0.08,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  itemCount: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.textSecondary,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfWidth: {
    flex: 1,
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: palette.textSecondary,
    marginBottom: 6,
  },
  required: {
    color: palette.danger,
  },
  customerButton: {
    backgroundColor: palette.fillMuted,
    borderRadius: radius.md,
    padding: 14,
    minHeight: 52,
    justifyContent: 'center',
  },
  selectedCustomerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  customerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.accentFill,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  customerAvatarText: {
    fontSize: 13,
    fontWeight: '700',
    color: palette.accent,
  },
  customerInfo: {
    flex: 1,
  },
  customerName: {
    fontSize: 17,
    fontWeight: '600',
    color: palette.text,
    marginBottom: 2,
  },
  customerEmail: {
    fontSize: 13,
    color: palette.textSecondary,
  },
  placeholderText: {
    fontSize: 17,
    color: palette.textTertiary,
  },
  lineItemActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  lineItemAction: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: palette.accentFill,
  },
  lineItemActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.accent,
  },
});
