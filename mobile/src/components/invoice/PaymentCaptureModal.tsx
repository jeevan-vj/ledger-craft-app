import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { onlineManager } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { AppPressable } from '@/components/ui/AppPressable';
import { AuthApiError } from '@/features/auth/api/http';
import {
  createPaymentAttempt,
  formatPaymentAmount,
  mapPaymentError,
  paymentAmountError,
  paymentFingerprint,
  remainingAfterPayment,
} from '@/features/payments/paymentModel';
import type { Invoice } from '@/types/invoice';
import type { CreatePaymentRequest } from '@/types/payment';
import { localIsoDate } from '@/components/ui/datePickerModel';
import { PAYMENT_METHOD_OPTIONS } from '@/utils/statusUtils';
import { control, hairline, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme';

interface PaymentCaptureModalProps {
  visible: boolean;
  invoice: Invoice;
  onSubmit: (paymentData: CreatePaymentRequest, idempotencyKey: string) => Promise<void>;
  onClose: () => void;
}

export default function PaymentCaptureModal({ visible, invoice, onSubmit, onClose }: PaymentCaptureModalProps) {
  const theme = useTheme();
  const { colors: palette } = theme;
  const styles = createStyles(theme);
  const insets = useSafeAreaInsets();
  const attempt = useRef(createPaymentAttempt());
  const balanceDue = invoice.balanceDueText?.trim() ?? '';
  const currency = invoice.currency || 'NZD';
  const [paymentMethod, setPaymentMethod] = useState<CreatePaymentRequest['paymentMethod']>('bank_transfer');
  const [amount, setAmount] = useState(balanceDue);
  const [paymentDate, setPaymentDate] = useState(localIsoDate(new Date()));
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [amountError, setAmountError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setPaymentMethod('bank_transfer');
    setAmount(invoice.balanceDueText?.trim() ?? '');
    setPaymentDate(localIsoDate(new Date()));
    setReferenceNumber('');
    setNotes('');
    setAmountError(null);
    setFormError(null);
    attempt.current.succeed();
  }, [visible, invoice.id, invoice.balanceDueText]);

  const remaining = remainingAfterPayment(balanceDue, amount);
  const selectedMethod = PAYMENT_METHOD_OPTIONS.find((method) => method.value === paymentMethod);

  const submit = async () => {
    if (!balanceDue) {
      setFormError('The balance due is unavailable. Refresh the invoice before recording a payment.');
      return;
    }
    const validation = paymentAmountError(amount, balanceDue);
    if (validation || !/^\d{4}-\d{2}-\d{2}$/.test(paymentDate.trim())) {
      setAmountError(validation);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate.trim())) setFormError('Enter the payment date as YYYY-MM-DD.');
      return;
    }
    const payload: CreatePaymentRequest = {
      invoiceId: invoice.id,
      paymentMethod,
      amount: amount.trim(),
      paymentDate: paymentDate.trim(),
      referenceNumber: referenceNumber.trim() || null,
      notes: notes.trim() || null,
    };
    const key = attempt.current.claim(paymentFingerprint({
      invoiceId: payload.invoiceId,
      amount: payload.amount,
      paymentMethod: payload.paymentMethod,
      paymentDate: payload.paymentDate,
      referenceNumber: payload.referenceNumber ?? '',
      notes: payload.notes ?? '',
    }));
    if (!key) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await onSubmit(payload, key);
      attempt.current.succeed();
    } catch (error) {
      const failure = mapPaymentError(error, onlineManager.isOnline());
      if (failure.resetKey) attempt.current.resetKey();
      else attempt.current.release();
      setFormError(failure.message);
      if (error instanceof AuthApiError) {
        console.error('Payment was not recorded', { code: error.code, requestId: error.requestId, status: error.status });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.header, { paddingTop: insets.top || 16 }]}>
          <AppPressable
            onPress={onClose}
            disabled={submitting}
            accessibilityRole="button"
            accessibilityLabel="Close payment form"
            style={styles.headerButton}
          >
            <Feather name="x" size={22} color={palette.textSecondary} />
          </AppPressable>
          <Text style={styles.headerTitle}>Record payment</Text>
          <View style={styles.headerButton} />
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.kicker}>{invoice.invoiceNumber}</Text>
          <Text style={styles.balanceLabel}>Balance due</Text>
          <Text style={styles.balance}>{balanceDue ? formatPaymentAmount(balanceDue, currency) : 'Unavailable'}</Text>
          <Text style={styles.fieldLabel}>Payment method</Text>
          <View style={styles.methods}>
            {PAYMENT_METHOD_OPTIONS.map((method) => {
              const selected = paymentMethod === method.value;
              return (
                <AppPressable
                  key={method.value}
                  accessibilityRole="button"
                  accessibilityLabel={method.label}
                  accessibilityState={{ selected, disabled: submitting }}
                  disabled={submitting}
                  onPress={() => setPaymentMethod(method.value)}
                  style={({ pressed }) => [styles.method, selected && styles.methodSelected, pressed && styles.pressed]}
                >
                  <Text style={[styles.methodText, selected && styles.methodTextSelected]}>{method.label}</Text>
                </AppPressable>
              );
            })}
          </View>
          {selectedMethod ? <Text style={styles.helper}>{selectedMethod.description}</Text> : null}
          <Text style={styles.fieldLabel}>Amount</Text>
          <TextInput
            accessibilityLabel="Payment amount"
            value={amount}
            onChangeText={(value) => {
              setAmount(value);
              setAmountError(null);
            }}
            keyboardType="decimal-pad"
            editable={!submitting}
            placeholder="0.00"
            placeholderTextColor={palette.textTertiary}
            style={[styles.input, amountError ? styles.inputError : null]}
          />
          {amountError ? <Text style={styles.error}>{amountError}</Text> : null}
          {remaining ? (
            <Text style={styles.helper}>Remaining after this payment: {formatPaymentAmount(remaining, currency)}</Text>
          ) : null}
          <Text style={styles.fieldLabel}>Payment date</Text>
          <TextInput
            accessibilityLabel="Payment date"
            value={paymentDate}
            onChangeText={setPaymentDate}
            editable={!submitting}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={palette.textTertiary}
            style={styles.input}
          />
          <Text style={styles.fieldLabel}>Reference</Text>
          <TextInput
            accessibilityLabel="Payment reference"
            value={referenceNumber}
            onChangeText={setReferenceNumber}
            editable={!submitting}
            placeholder="Optional"
            placeholderTextColor={palette.textTertiary}
            style={styles.input}
          />
          <Text style={styles.fieldLabel}>Notes</Text>
          <TextInput
            accessibilityLabel="Payment notes"
            value={notes}
            onChangeText={setNotes}
            editable={!submitting}
            placeholder="Optional"
            placeholderTextColor={palette.textTertiary}
            multiline
            style={[styles.input, styles.notes]}
          />
          {formError ? <Text style={styles.error}>{formError}</Text> : null}
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <AppPressable
            accessibilityRole="button"
            accessibilityLabel="Record payment"
            accessibilityState={{ disabled: submitting, busy: submitting }}
            disabled={submitting}
            onPress={() => { void submit(); }}
            style={({ pressed }) => [styles.submit, submitting && styles.submitDisabled, pressed && !submitting && styles.pressed]}
          >
            {submitting ? (
              <ActivityIndicator color={palette.accentForeground} />
            ) : (
              <Text style={styles.submitText}>Record payment</Text>
            )}
          </AppPressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = ({ colors: palette, type }: ReturnType<typeof useTheme>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background },
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
  headerButton: { width: control.touchTarget, height: control.touchTarget, justifyContent: 'center' },
  headerTitle: { ...type.headline, fontSize: 20 },
  content: { padding: space.screen, paddingBottom: 32 },
  kicker: { ...type.footnote, color: palette.textSecondary },
  balanceLabel: { ...type.subhead, marginTop: space.sm, color: palette.textSecondary },
  balance: { fontSize: 32, fontWeight: '700', color: palette.text, fontVariant: ['tabular-nums'], marginBottom: space.xl },
  fieldLabel: { ...type.subhead, color: palette.text, fontWeight: '600', marginTop: space.lg, marginBottom: space.sm },
  methods: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  method: {
    minHeight: control.touchTarget,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    backgroundColor: palette.fillMuted,
  },
  methodSelected: { backgroundColor: palette.accent },
  methodText: { fontSize: 15, fontWeight: '600', color: palette.textSecondary },
  methodTextSelected: { color: palette.accentForeground },
  helper: { ...type.footnote, marginTop: space.sm },
  input: {
    minHeight: control.prominent,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.separator,
    backgroundColor: palette.surface,
    paddingHorizontal: space.lg,
    fontSize: 16,
    color: palette.text,
  },
  inputError: { borderColor: palette.danger },
  notes: { minHeight: 96, paddingTop: space.md, textAlignVertical: 'top' },
  error: { color: palette.danger, fontSize: 14, fontWeight: '600', marginTop: space.sm },
  footer: {
    paddingHorizontal: space.screen,
    paddingTop: space.md,
    backgroundColor: palette.surface,
    borderTopWidth: hairline,
    borderTopColor: palette.separator,
  },
  submit: {
    minHeight: control.prominent,
    borderRadius: radius.pill,
    backgroundColor: palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitDisabled: { opacity: 0.5 },
  submitText: { color: palette.accentForeground, fontSize: 17, fontWeight: '700' },
  pressed: { opacity: 0.7 },
});
