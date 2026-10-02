import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import type { Invoice } from '@/types/invoice';
import type { CreatePaymentRequest } from '@/types/payment';
import { PAYMENT_METHOD_OPTIONS } from '@/utils/statusUtils';
import { formatMoney } from '@/utils/money';
import { control, hairline, palette, radius, space, type } from '@/theme/tokens';

interface PaymentCaptureModalProps {
  visible: boolean;
  invoice: Invoice;
  onSubmit: (paymentData: CreatePaymentRequest) => Promise<void>;
  onClose: () => void;
}

export default function PaymentCaptureModal({
  visible,
  invoice,
  onSubmit,
  onClose,
}: PaymentCaptureModalProps) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);

  // Form state
  const [paymentMethod, setPaymentMethod] = useState<'bank_transfer' | 'cash' | 'cheque' | 'credit_card' | 'online'>('bank_transfer');
  const [amount, setAmount] = useState(invoice.total?.toString() || '0');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const selectedMethod = PAYMENT_METHOD_OPTIONS.find((m) => m.value === paymentMethod);

  // Calculate balance
  const parsedAmount = parseFloat(amount) || 0;
  const isPartialPayment = parsedAmount < invoice.total;
  const isOverpayment = parsedAmount > invoice.total;
  const balanceAfterPayment = invoice.total - parsedAmount;

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!amount || parseFloat(amount) <= 0) {
      newErrors.amount = 'Amount must be greater than 0';
    }

    if (selectedMethod?.requiresReference && !referenceNumber.trim()) {
      newErrors.referenceNumber = 'Reference number is recommended for this payment method';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) {
      if (Platform.OS === 'ios') {
        const { notificationAsync, NotificationFeedbackType } = require('expo-haptics');
        notificationAsync(NotificationFeedbackType.Error);
      }
      return;
    }

    // Show warning for partial payments
    if (isPartialPayment) {
      Alert.alert(
        'Partial Payment',
        `This is a partial payment. The remaining balance will be ${formatMoney(Math.abs(balanceAfterPayment), invoice.currency || 'NZD')}.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Continue', onPress: () => submitPayment() },
        ]
      );
      return;
    }

    // Show alert for overpayments
    if (isOverpayment) {
      Alert.alert(
        'Overpayment',
        `The payment amount exceeds the invoice total by ${formatMoney(Math.abs(balanceAfterPayment), invoice.currency || 'NZD')}.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Continue', onPress: () => submitPayment() },
        ]
      );
      return;
    }

    await submitPayment();
  };

  const submitPayment = async () => {
    try {
      setLoading(true);

      const paymentData: CreatePaymentRequest = {
        invoiceId: invoice.id,
        paymentMethod,
        amount: parseFloat(amount),
        paymentDate,
        referenceNumber: referenceNumber.trim() || undefined,
        notes: notes.trim() || undefined,
        generateReceipt: true,
      };

      await onSubmit(paymentData);

      // Success haptic
      if (Platform.OS === 'ios') {
        const { notificationAsync, NotificationFeedbackType } = require('expo-haptics');
        notificationAsync(NotificationFeedbackType.Success);
      }

      // Reset form
      setPaymentMethod('bank_transfer');
      setAmount(invoice.total?.toString() || '0');
      setReferenceNumber('');
      setNotes('');
      setErrors({});
    } catch (error) {
      console.error('Error recording payment:', error);
      Alert.alert('Error', 'Failed to record payment. Please try again.');

      if (Platform.OS === 'ios') {
        const { notificationAsync, NotificationFeedbackType } = require('expo-haptics');
        notificationAsync(NotificationFeedbackType.Error);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top || 16 }]}>
          <TouchableOpacity
            onPress={onClose}
            disabled={loading}
            style={styles.headerButton}
            accessibilityRole="button"
            accessibilityLabel="Close payment form"
          >
            <Feather name="x" size={22} color={palette.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Record Payment</Text>
          <View style={styles.headerButtonPlaceholder} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Invoice Info Card */}
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Invoice</Text>
            <Text style={styles.infoValue}>{invoice.invoiceNumber}</Text>
            <View style={styles.infoDivider} />
            <Text style={styles.infoLabel}>Amount Due</Text>
            <Text style={styles.infoValueLarge}>
              {formatMoney(invoice.total || 0, invoice.currency || 'NZD')}
            </Text>
          </View>

          {/* Payment Method */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Payment Method *</Text>
            <View style={styles.methodGrid}>
              {PAYMENT_METHOD_OPTIONS.map((method) => (
                <TouchableOpacity
                  key={method.value}
                  style={[
                    styles.methodButton,
                    paymentMethod === method.value && styles.methodButtonActive,
                  ]}
                  onPress={() => setPaymentMethod(method.value)}
                  disabled={loading}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityState={{ selected: paymentMethod === method.value, disabled: loading }}
                >
                  <Text style={[
                    styles.methodButtonText,
                    paymentMethod === method.value && styles.methodButtonTextActive,
                  ]}>
                    {method.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {selectedMethod && (
              <Text style={styles.fieldHelper}>{selectedMethod.description}</Text>
            )}
          </View>

          {/* Amount */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Amount *</Text>
            <View style={[styles.inputContainer, errors.amount && styles.inputError]}>
              <Text style={styles.inputPrefix}>$</Text>
              <TextInput
                style={styles.input}
                value={amount}
                onChangeText={(text) => {
                  setAmount(text);
                  if (errors.amount) setErrors({ ...errors, amount: '' });
                }}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={palette.textTertiary}
                accessibilityLabel="Payment amount"
                editable={!loading}
              />
            </View>
            {errors.amount && <Text style={styles.errorText}>{errors.amount}</Text>}
          </View>

          {/* Payment Date */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Payment Date *</Text>
            <View style={styles.inputContainer}>
              <Text style={styles.inputPrefix}>Date</Text>
              <TextInput
                style={styles.input}
                value={paymentDate}
                onChangeText={setPaymentDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={palette.textTertiary}
                accessibilityLabel="Payment date"
                editable={!loading}
              />
            </View>
            <Text style={styles.fieldHelper}>Format: YYYY-MM-DD</Text>
          </View>

          {/* Reference Number */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>
              Reference Number {selectedMethod?.requiresReference && '(Recommended)'}
            </Text>
            <View style={[styles.inputContainer, errors.referenceNumber && styles.inputError]}>
              <TextInput
                style={[styles.input, { paddingLeft: space.lg }]}
                value={referenceNumber}
                onChangeText={(text) => {
                  setReferenceNumber(text);
                  if (errors.referenceNumber) setErrors({ ...errors, referenceNumber: '' });
                }}
                placeholder="Transaction ID, Check #, etc."
                placeholderTextColor={palette.textTertiary}
                accessibilityLabel="Payment reference number"
                editable={!loading}
              />
            </View>
            {errors.referenceNumber && <Text style={styles.warningText}>{errors.referenceNumber}</Text>}
          </View>

          {/* Notes */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Notes (Optional)</Text>
            <TextInput
              style={styles.textArea}
              value={notes}
              onChangeText={setNotes}
              placeholder="Additional payment details..."
              placeholderTextColor={palette.textTertiary}
              accessibilityLabel="Payment notes"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              editable={!loading}
            />
          </View>

          {/* Summary Card */}
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Payment Summary</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Amount Paid:</Text>
              <Text style={styles.summaryValue}>{formatMoney(parsedAmount, invoice.currency || 'NZD')}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Remaining Balance:</Text>
              <Text style={[
                styles.summaryValue,
                balanceAfterPayment <= 0 && styles.summaryValueSuccess,
              ]}>
                {formatMoney(Math.max(0, balanceAfterPayment), invoice.currency || 'NZD')}
              </Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>Status:</Text>
              <Text style={[
                styles.statusBadge,
                balanceAfterPayment <= 0 ? styles.statusBadgePaid : styles.statusBadgePartial,
              ]}>
                {balanceAfterPayment <= 0 ? 'Paid in full' : 'Partially paid'}
              </Text>
            </View>
          </View>
        </ScrollView>

        {/* Submit Button */}
        <View style={[styles.footer, { paddingBottom: insets.bottom || 16 }]}>
          <TouchableOpacity
            style={[styles.submitButton, loading && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityState={{ disabled: loading, busy: loading }}
          >
            {loading ? (
              <ActivityIndicator color={palette.accentForeground} />
            ) : (
              <Text style={styles.submitButtonText}>Record payment</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.screen,
    paddingBottom: space.md,
    backgroundColor: palette.surface,
    borderBottomWidth: hairline,
    borderBottomColor: palette.separator,
  },
  headerButton: {
    width: control.touchTarget,
    height: control.touchTarget,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerButtonPlaceholder: {
    width: control.touchTarget,
  },
  headerTitle: {
    ...type.headline,
    fontSize: 20,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: space.screen,
  },
  infoCard: {
    backgroundColor: palette.surface,
    borderRadius: radius.group,
    padding: space.xl,
    marginBottom: space.xxl,
  },
  infoLabel: {
    ...type.section,
    marginBottom: space.xs,
  },
  infoValue: {
    ...type.headline,
    marginBottom: space.lg,
  },
  infoDivider: {
    height: hairline,
    backgroundColor: palette.separator,
    marginBottom: space.lg,
  },
  infoValueLarge: {
    fontSize: 32,
    color: palette.text,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  field: {
    marginBottom: space.xxl,
  },
  fieldLabel: {
    ...type.subhead,
    color: palette.text,
    fontWeight: '600',
    marginBottom: space.sm,
  },
  fieldHelper: {
    ...type.footnote,
    marginTop: 6,
  },
  methodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  methodButton: {
    minHeight: control.touchTarget,
    justifyContent: 'center',
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
    backgroundColor: palette.fillMuted,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  methodButtonActive: {
    backgroundColor: palette.accentFill,
    borderColor: palette.focus,
  },
  methodButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: palette.textSecondary,
  },
  methodButtonTextActive: {
    color: palette.accentForeground,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.separator,
    paddingHorizontal: space.lg,
    minHeight: control.prominent,
  },
  inputError: {
    borderColor: palette.danger,
  },
  inputPrefix: {
    fontSize: 16,
    fontWeight: '600',
    color: palette.textSecondary,
    marginRight: space.sm,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: palette.text,
    fontWeight: '500',
  },
  textArea: {
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.separator,
    padding: space.lg,
    fontSize: 16,
    color: palette.text,
    minHeight: 100,
  },
  errorText: {
    fontSize: 13,
    color: palette.danger,
    marginTop: 6,
  },
  warningText: {
    fontSize: 13,
    color: palette.warning,
    marginTop: 6,
  },
  summaryCard: {
    backgroundColor: palette.surface,
    borderRadius: radius.group,
    padding: space.xl,
    marginTop: space.sm,
  },
  summaryTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: palette.text,
    marginBottom: space.lg,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: space.md,
  },
  summaryLabel: {
    fontSize: 15,
    color: palette.textSecondary,
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: '600',
    color: palette.text,
    fontVariant: ['tabular-nums'],
  },
  summaryValueSuccess: {
    color: palette.success,
  },
  summaryDivider: {
    height: hairline,
    backgroundColor: palette.separator,
    marginVertical: space.md,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: palette.text,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    fontSize: 13,
    fontWeight: '700',
  },
  statusBadgePaid: {
    backgroundColor: palette.successFill,
    color: palette.text,
  },
  statusBadgePartial: {
    backgroundColor: palette.warningFill,
    color: palette.text,
  },
  footer: {
    padding: space.screen,
    paddingTop: space.lg,
    backgroundColor: palette.surface,
    borderTopWidth: hairline,
    borderTopColor: palette.separator,
  },
  submitButton: {
    backgroundColor: palette.accent,
    minHeight: control.prominent,
    paddingHorizontal: space.xl,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: palette.accentForeground,
    fontSize: 17,
    fontWeight: '700',
  },
});
