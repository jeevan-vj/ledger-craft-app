import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Switch,
  Modal,
  TextInput,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { AppTabParamList } from '@/navigation/types';
import { expenseService } from '@/services/expenseService';
import type { ExpenseCategory, Account, PaymentMethod } from '@/types/expense';
import { ModernInput } from '@/components/ui/ModernInput';
import { ModernButton } from '@/components/ui/ModernButton';
import { CategoryPicker } from '@/components/expense/CategoryPicker';
import { AccountPicker } from '@/components/expense/AccountPicker';
import { CustomerPicker } from '@/components/customers/CustomerPicker';
import { ReceiptScanner } from '@/components/expense/ReceiptScanner';
import { Customer } from '@/services/customerService';
import { ReceiptScanResult } from '@/types/receipt';
import { palette, radius, space } from '@/theme/tokens';

type ExpenseCreateNavigationProp = NativeStackNavigationProp<AppTabParamList, 'ExpenseCreate'>;

const PAYMENT_METHODS: { label: string; value: PaymentMethod }[] = [
  { label: 'Cash', value: 'cash' },
  { label: 'Card', value: 'card' },
  { label: 'Bank Transfer', value: 'bank_transfer' },
  { label: 'Check', value: 'check' },
  { label: 'Other', value: 'other' },
];

export default function ExpenseCreateScreen() {
  const navigation = useNavigation<ExpenseCreateNavigationProp>();
  
  // Form state
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);
  const [vendorName, setVendorName] = useState('');
  const [notes, setNotes] = useState('');
  const [currency, setCurrency] = useState('NZD');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [isBillable, setIsBillable] = useState(false);
  const [taxEnabled, setTaxEnabled] = useState(false);
  const [taxRate, setTaxRate] = useState(15); // Default GST rate for NZ
  
  // Selected items
  const [selectedCategory, setSelectedCategory] = useState<ExpenseCategory | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  
  // Picker visibility
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [showPaymentMethodPicker, setShowPaymentMethodPicker] = useState(false);
  const [showReceiptScanner, setShowReceiptScanner] = useState(false);
  
  // Receipt state
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  
  // Loading state
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  // Calculated tax
  const amountNum = parseFloat(amount) || 0;
  const taxAmount = taxEnabled ? (amountNum * taxRate) / 100 : 0;
  const totalAmount = amountNum + taxAmount;

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (!description.trim()) {
      newErrors.description = 'Description is required';
    }
    
    if (!amount || parseFloat(amount) <= 0) {
      newErrors.amount = 'Amount must be greater than 0';
    }
    
    if (!expenseDate) {
      newErrors.expenseDate = 'Date is required';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) {
      Alert.alert('Validation Error', 'Please fix the errors in the form');
      return;
    }

    try {
      setLoading(true);
      
      const expenseData = {
        description: description.trim(),
        amount: parseFloat(amount),
        expenseDate,
        categoryId: selectedCategory?.id || null,
        accountId: selectedAccount?.id || null,
        vendorName: vendorName.trim() || null,
        receiptUrl,
        status: 'pending' as const,
        isBillable,
        customerId: isBillable && selectedCustomer ? selectedCustomer.id : null,
        taxAmount,
        currency,
        paymentMethod,
        notes: notes.trim() || null,
      };

      await expenseService.createExpense(expenseData);
      
      Alert.alert('Success', 'Expense created successfully', [
        {
          text: 'OK',
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (error) {
      console.error('Error creating expense:', error);
      Alert.alert('Error', 'Failed to create expense. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getCategoryDisplay = () => {
    if (selectedCategory) {
      return (
        <View style={styles.selectedItemContainer}>
          <View
            style={[
              styles.colorIndicator,
              { backgroundColor: selectedCategory.color || '#94a3b8' },
            ]}
          />
          <Text style={styles.selectedItemText}>{selectedCategory.name}</Text>
        </View>
      );
    }
    return <Text style={styles.placeholderText}>Tap to select category</Text>;
  };

  const getAccountDisplay = () => {
    if (selectedAccount) {
      return (
        <View style={styles.selectedItemContainer}>
          <Text style={styles.selectedItemText}>{selectedAccount.name}</Text>
        </View>
      );
    }
    return <Text style={styles.placeholderText}>Tap to select account</Text>;
  };

  const getCustomerDisplay = () => {
    if (selectedCustomer) {
      return (
        <View style={styles.selectedItemContainer}>
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
            <Text style={styles.selectedItemText}>{selectedCustomer.name}</Text>
            {selectedCustomer.email && (
              <Text style={styles.customerEmail}>{selectedCustomer.email}</Text>
            )}
          </View>
        </View>
      );
    }
    return <Text style={styles.placeholderText}>Tap to select customer</Text>;
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        {/* Basic Info Card */}
        <View style={styles.card}>
          <Text style={styles.amountLabel}>Amount</Text>
          <View style={styles.amountRow}>
            <Text style={styles.currencyMark}>$</Text>
            <TextInput
              value={amount}
              onChangeText={(text) => {
                setAmount(text);
                if (errors.amount) setErrors({ ...errors, amount: '' });
              }}
              placeholder="0.00"
              placeholderTextColor={palette.textTertiary}
              keyboardType="decimal-pad"
              style={styles.amountInput}
              accessibilityLabel="Expense amount"
            />
            <Text style={styles.currencyCode}>{currency}</Text>
          </View>
          {errors.amount ? <Text style={styles.amountError}>{errors.amount}</Text> : null}

          <ModernInput
            label="Description"
            value={description}
            onChangeText={(text) => {
              setDescription(text);
              if (errors.description) setErrors({ ...errors, description: '' });
            }}
            placeholder="What was this for"
            error={errors.description}
          />

          <ModernInput
            label="Date"
            value={expenseDate}
            onChangeText={(text) => {
              setExpenseDate(text);
              if (errors.expenseDate) setErrors({ ...errors, expenseDate: '' });
            }}
            placeholder="YYYY-MM-DD"
            error={errors.expenseDate}
          />

          <ModernInput
            label="Vendor"
            value={vendorName}
            onChangeText={setVendorName}
            placeholder="Who you paid"
          />
        </View>

        {/* Category & Account Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Categorization</Text>

          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>
              Category <Text style={styles.required}>*</Text>
            </Text>
            <TouchableOpacity
              onPress={() => setShowCategoryPicker(true)}
              style={styles.pickerButton}
              activeOpacity={0.7}
            >
              {getCategoryDisplay()}
              <Feather name="chevron-right" size={18} color={palette.textTertiary} />
            </TouchableOpacity>
          </View>

          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>Account</Text>
            <TouchableOpacity
              onPress={() => setShowAccountPicker(true)}
              style={styles.pickerButton}
              activeOpacity={0.7}
            >
              {getAccountDisplay()}
              <Feather name="chevron-right" size={18} color={palette.textTertiary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Payment & Tax Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Payment & Tax</Text>

          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>Payment Method</Text>
            <TouchableOpacity
              onPress={() => setShowPaymentMethodPicker(true)}
              style={styles.pickerButton}
              activeOpacity={0.7}
            >
              {paymentMethod ? (
                <Text style={styles.selectedItemText}>
                  {PAYMENT_METHODS.find((m) => m.value === paymentMethod)?.label}
                </Text>
              ) : (
                <Text style={styles.placeholderText}>Select payment method</Text>
              )}
              <Feather name="chevron-right" size={18} color={palette.textTertiary} />
            </TouchableOpacity>
          </View>

          <View style={styles.switchRow}>
            <View style={styles.switchLabelContainer}>
              <Text style={styles.switchLabel}>Include Tax (GST)</Text>
              <Text style={styles.switchSubtext}>{taxRate}%</Text>
            </View>
            <Switch
              value={taxEnabled}
              onValueChange={setTaxEnabled}
              trackColor={{ false: palette.fill, true: palette.accent }}
              thumbColor={taxEnabled ? palette.accentForeground : palette.surface}
            />
          </View>

          {taxEnabled && (
            <View style={styles.taxInfo}>
              <View style={styles.taxRow}>
                <Text style={styles.taxLabel}>Subtotal:</Text>
                <Text style={styles.taxValue}>${amountNum.toFixed(2)}</Text>
              </View>
              <View style={styles.taxRow}>
                <Text style={styles.taxLabel}>Tax ({taxRate}%):</Text>
                <Text style={styles.taxValue}>${taxAmount.toFixed(2)}</Text>
              </View>
              <View style={[styles.taxRow, styles.taxTotal]}>
                <Text style={styles.taxTotalLabel}>Total:</Text>
                <Text style={styles.taxTotalValue}>${totalAmount.toFixed(2)}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Billable Expense Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Billable</Text>

          <View style={styles.switchRow}>
            <View style={styles.switchLabelContainer}>
              <Text style={styles.switchLabel}>Mark as Billable</Text>
              <Text style={styles.switchSubtext}>Charge to a customer</Text>
            </View>
            <Switch
              value={isBillable}
              onValueChange={setIsBillable}
              trackColor={{ false: palette.fill, true: palette.accent }}
              thumbColor={isBillable ? palette.accentForeground : palette.surface}
            />
          </View>

          {isBillable && (
            <View style={styles.fieldContainer}>
              <Text style={styles.fieldLabel}>
                Customer <Text style={styles.required}>*</Text>
              </Text>
              <TouchableOpacity
                onPress={() => setShowCustomerPicker(true)}
                style={styles.pickerButton}
                activeOpacity={0.7}
              >
                {getCustomerDisplay()}
                <Feather name="chevron-right" size={18} color={palette.textTertiary} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Receipt Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Receipt</Text>
          {receiptUrl ? (
            <View style={styles.receiptContainer}>
              <View style={styles.receiptInfo}>
                <Feather name="paperclip" size={18} color={palette.accent} />
                <Text style={styles.receiptText}>Receipt attached</Text>
              </View>
              <TouchableOpacity
                onPress={() => setReceiptUrl(null)}
                style={styles.removeReceiptButton}
              >
                <Text style={styles.removeReceiptText}>Remove</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ModernButton
              onPress={() => setShowReceiptScanner(true)}
              variant="outline"
              fullWidth
              icon={<Feather name="camera" size={18} color={palette.text} />}
            >
              Scan Receipt with AI
            </ModernButton>
          )}
        </View>

        {/* Notes Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Additional Information</Text>
          <ModernInput
            label="Notes"
            value={notes}
            onChangeText={setNotes}
            placeholder="Additional notes (optional)"
            multiline
            numberOfLines={4}
          />
        </View>

        {/* Submit Button */}
        <ModernButton
          onPress={handleSubmit}
          loading={loading}
          fullWidth
          size="lg"
          style={styles.submitButton}
        >
          Create Expense
        </ModernButton>
      </ScrollView>

      {/* Category Picker */}
      <CategoryPicker
        visible={showCategoryPicker}
        onSelect={(category) => {
          setSelectedCategory(category);
          setShowCategoryPicker(false);
        }}
        onClose={() => setShowCategoryPicker(false)}
        selectedCategoryId={selectedCategory?.id || null}
      />

      {/* Account Picker */}
      <AccountPicker
        visible={showAccountPicker}
        onSelect={(account) => {
          setSelectedAccount(account);
          setShowAccountPicker(false);
        }}
        onClose={() => setShowAccountPicker(false)}
        selectedAccountId={selectedAccount?.id || null}
      />

      {/* Customer Picker */}
      <CustomerPicker
        visible={showCustomerPicker}
        onSelect={(customer) => {
          setSelectedCustomer(customer);
          setShowCustomerPicker(false);
        }}
        onClose={() => setShowCustomerPicker(false)}
        selectedCustomerId={selectedCustomer?.id}
      />

      {/* Payment Method Picker Modal */}
      <Modal
        visible={showPaymentMethodPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowPaymentMethodPicker(false)}
      >
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Payment Method</Text>
            <TouchableOpacity
              onPress={() => setShowPaymentMethodPicker(false)}
              style={styles.modalCloseButton}
            >
              <Text style={styles.modalCloseText}>Done</Text>
            </TouchableOpacity>
          </View>
          <ScrollView>
            <TouchableOpacity
              onPress={() => {
                setPaymentMethod(null);
                setShowPaymentMethodPicker(false);
              }}
              style={[
                styles.methodOption,
                paymentMethod === null && styles.methodOptionSelected,
              ]}
            >
              <Text style={styles.methodOptionText}>None</Text>
              {paymentMethod === null && (
                <Feather name="check" size={18} color={palette.accent} />
              )}
            </TouchableOpacity>
            {PAYMENT_METHODS.map((method) => (
              <TouchableOpacity
                key={method.value}
                onPress={() => {
                  setPaymentMethod(method.value);
                  setShowPaymentMethodPicker(false);
                }}
                style={[
                  styles.methodOption,
                  paymentMethod === method.value && styles.methodOptionSelected,
                ]}
              >
                <Text style={styles.methodOptionText}>{method.label}</Text>
                {paymentMethod === method.value && (
                  <Feather name="check" size={18} color={palette.accent} />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>

      {/* Receipt Scanner */}
      <ReceiptScanner
        visible={showReceiptScanner}
        onScanComplete={(result: ReceiptScanResult, receiptUrl?: string) => {
          // Auto-fill form with scanned data
          if (result.merchantName && !vendorName) {
            setVendorName(result.merchantName);
          }
          if (result.total !== null && !amount) {
            setAmount(result.total.toString());
          }
          if (result.date && !expenseDate) {
            setExpenseDate(result.date);
          }
          if (result.tax !== null && result.tax > 0 && !taxEnabled) {
            setTaxEnabled(true);
          }
          if (result.paymentMethod) {
            // Map receipt payment method to form payment method
            const paymentMap: Record<string, PaymentMethod> = {
              'cash': 'cash',
              'card': 'card',
              'other': 'other',
            };
            const mappedMethod = paymentMap[result.paymentMethod];
            if (mappedMethod) {
              setPaymentMethod(mappedMethod);
            }
          }
          if (result.notes && !notes) {
            setNotes(result.notes);
          }
          if (receiptUrl) {
            setReceiptUrl(receiptUrl);
          }
          setShowReceiptScanner(false);
          Alert.alert(
            'Receipt Scanned',
            'Form fields have been auto-filled with the scanned receipt data. Please review and adjust as needed.',
            [{ text: 'OK' }]
          );
        }}
        onClose={() => setShowReceiptScanner(false)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: space.screen,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.group,
    padding: space.lg,
    marginBottom: space.lg,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: palette.textSecondary,
    letterSpacing: -0.08,
    textTransform: 'uppercase',
    marginBottom: 16,
  },
  amountLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: palette.textSecondary,
    marginBottom: 4,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 20,
  },
  currencyMark: {
    fontSize: 34,
    fontWeight: '600',
    color: palette.textTertiary,
    marginRight: 4,
    marginBottom: 4,
  },
  amountInput: {
    flex: 1,
    fontSize: 40,
    fontWeight: '700',
    color: palette.text,
    letterSpacing: -1.2,
    paddingVertical: 0,
    fontVariant: ['tabular-nums'],
  },
  currencyCode: {
    fontSize: 15,
    fontWeight: '600',
    color: palette.textSecondary,
    marginBottom: 10,
  },
  amountError: {
    color: palette.danger,
    fontSize: 13,
    marginTop: -12,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfWidth: {
    flex: 1,
  },
  fieldContainer: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: palette.textSecondary,
    marginBottom: 8,
  },
  required: {
    color: palette.danger,
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: palette.fillMuted,
    borderRadius: radius.md,
    padding: 14,
    minHeight: 52,
  },
  selectedItemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  colorIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  selectedItemText: {
    fontSize: 17,
    fontWeight: '500',
    color: palette.text,
  },
  placeholderText: {
    fontSize: 17,
    color: palette.textTertiary,
  },
  customerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  customerAvatarText: {
    color: palette.surface,
    fontSize: 13,
    fontWeight: '700',
  },
  customerInfo: {
    flex: 1,
  },
  customerEmail: {
    fontSize: 12,
    color: palette.textSecondary,
    marginTop: 2,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  switchLabelContainer: {
    flex: 1,
  },
  switchLabel: {
    fontSize: 17,
    fontWeight: '500',
    color: palette.text,
    marginBottom: 2,
  },
  switchSubtext: {
    fontSize: 13,
    color: palette.textSecondary,
  },
  taxInfo: {
    backgroundColor: palette.fillMuted,
    borderRadius: radius.md,
    padding: 16,
    marginTop: 8,
  },
  taxRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  taxLabel: {
    fontSize: 14,
    color: palette.textSecondary,
  },
  taxValue: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.text,
    fontVariant: ['tabular-nums'],
  },
  taxTotal: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.separator,
    paddingTop: 8,
    marginTop: 8,
    marginBottom: 0,
  },
  taxTotalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.text,
  },
  taxTotalValue: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.text,
    fontVariant: ['tabular-nums'],
  },
  submitButton: {
    marginTop: 8,
    marginBottom: 24,
  },
  modalContent: {
    flex: 1,
    backgroundColor: palette.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.separator,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: palette.text,
  },
  modalCloseButton: {
    padding: 8,
  },
  modalCloseText: {
    fontSize: 17,
    fontWeight: '500',
    color: palette.accent,
  },
  methodOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.separator,
  },
  methodOptionSelected: {
    backgroundColor: palette.fillMuted,
  },
  methodOptionText: {
    fontSize: 17,
    color: palette.text,
  },
  receiptContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: palette.fillMuted,
    borderRadius: radius.md,
    padding: 16,
  },
  receiptInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  receiptText: {
    fontSize: 16,
    fontWeight: '500',
    color: palette.text,
  },
  removeReceiptButton: {
    padding: 8,
  },
  removeReceiptText: {
    fontSize: 14,
    color: palette.danger,
    fontWeight: '600',
  },
});

