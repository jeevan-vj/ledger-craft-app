import React, { useEffect, useRef, useState } from 'react';
import { createPaymentRequestSchema } from '@ledgercraft/contracts';
import { pendingMutation, type PendingMutation } from '@/features/accounting/pendingMutation';
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
import { SettlementRatePicker } from '@/components/currency/SettlementRatePicker';
import { AppPressable } from '@/components/ui/AppPressable';
import { AuthApiError } from '@/features/auth/api/http';
import {
  createPaymentAttempt,
  formatPaymentAmount,
  mapPaymentError,
  normalizePaymentAmount,
  PaymentExceedsBalanceError,
  paymentAmountError,
  paymentAttemptInFlight,
  paymentFingerprint,
  remainingAfterPayment,
  type PaymentAttemptFields,
} from '@/features/payments/paymentModel';
import type { Invoice } from '@/types/invoice';
import type { CreatePaymentRequest } from '@/types/payment';
import { localIsoDate } from '@/components/ui/datePickerModel';
import { PAYMENT_METHOD_OPTIONS } from '@/utils/statusUtils';
import { control, hairline, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme';

interface PaymentCaptureModalProps {
  visible: boolean;
  ownerId: string;
  invoice: Invoice;
  onSubmit: (paymentData: CreatePaymentRequest, idempotencyKey: string) => Promise<void>;
  onClose: () => void;
  onPendingChange?: (pending: boolean) => void;
}

function storedPayment(input: unknown, invoiceId: string): CreatePaymentRequest {
  const value = createPaymentRequestSchema.parse(input);
  if (value.invoiceId !== invoiceId) throw new Error('The saved payment belongs to another invoice. Review it before continuing.');
  return value;
}

export default function PaymentCaptureModal({ visible, ownerId, invoice, onSubmit, onClose, onPendingChange }: PaymentCaptureModalProps) {
  const theme = useTheme();
  const { colors: palette } = theme;
  const styles = createStyles(theme);
  const insets = useSafeAreaInsets();
  const initialBalance = invoice.balanceDueText?.trim() ?? '';
  const currency = invoice.currency || 'NZD';
  const invoiceBalanceRef = useRef(initialBalance); invoiceBalanceRef.current = initialBalance;
  const [paymentMethod, setPaymentMethod] = useState<CreatePaymentRequest['paymentMethod']>('bank_transfer');
  const [amount, setAmount] = useState(normalizePaymentAmount(initialBalance) ?? initialBalance);
  const [paymentDate, setPaymentDate] = useState(localIsoDate(new Date()));
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [exchangeRateId, setExchangeRateId] = useState<string>();
  const [amountError, setAmountError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [shownBalance, setShownBalance] = useState(initialBalance);
  const [savedPending, setSavedPending] = useState<PendingMutation<CreatePaymentRequest> | null>(null);
  const pendingRef = useRef<PendingMutation<CreatePaymentRequest> | null>(null);
  const loaded = useRef<{ scope: string; promise: Promise<PendingMutation<CreatePaymentRequest> | null> } | undefined>(undefined);
  const loadGeneration = useRef(0);
  const callbackRef = useRef(onPendingChange); callbackRef.current = onPendingChange;
  const scope = `${ownerId}:invoice-payment.${invoice.id}`;
  const currentScope = useRef(scope); currentScope.current = scope;
  const target = `invoice-payment.${invoice.id}`;
  const wasOpen = useRef(false);
  const openScope = useRef('');
  const amountRef = useRef(amount); amountRef.current = amount;
  const balanceDue = shownBalance.trim();

  useEffect(() => {
    let active = true;
    const generation = ++loadGeneration.current;
    const nextBalance = invoiceBalanceRef.current;
    if (visible && (!wasOpen.current || openScope.current !== scope)) {
      setPaymentMethod('bank_transfer'); setExchangeRateId(undefined);
      setAmount(normalizePaymentAmount(nextBalance) ?? nextBalance);
      setPaymentDate(localIsoDate(new Date())); setReferenceNumber(''); setNotes('');
      setAmountError(null); setFormError(null); setSubmitting(false);
    }
    wasOpen.current = visible; openScope.current = scope;
    pendingRef.current = null; setSavedPending(null); callbackRef.current?.(false);
    const promise = ownerId ? pendingMutation.load(ownerId, target, (value) => storedPayment(value, invoice.id)).then(async (stored) => {
      if (stored && !paymentAttemptInFlight(scope)) {
        // A process can die after commit but before catch persisted uncertainty.
        await pendingMutation.fail(ownerId, target, 0);
        stored = { ...stored, uncertain: true };
      }
      if (!active || currentScope.current !== scope || generation !== loadGeneration.current) return stored;
      pendingRef.current = stored; setSavedPending(stored); callbackRef.current?.(Boolean(stored));
      if (stored) {
        setPaymentMethod(stored.input.paymentMethod); setExchangeRateId(stored.input.exchangeRateId);
        setAmount(stored.input.amount); setPaymentDate(stored.input.paymentDate);
        setReferenceNumber(stored.input.referenceNumber ?? ''); setNotes(stored.input.notes ?? '');
        setAmountError(null); setFormError(null);
      }
      return stored;
    }).catch((error: unknown) => {
      if (active && currentScope.current === scope && generation === loadGeneration.current) setFormError(error instanceof Error ? error.message : 'Saved payment could not be checked. Do not record another payment until reviewed.');
      throw error;
    }) : Promise.resolve(null);
    loaded.current = { scope, promise };
    void promise.catch(() => undefined);
    return () => { active = false; };
  }, [ownerId, invoice.id, visible, scope, target]);
  useEffect(() => {
    const value = invoice.balanceDueText?.trim() ?? '';
    setShownBalance(value);
    setAmountError(pendingRef.current ? null : value ? paymentAmountError(amountRef.current, value) : null);
  }, [invoice.balanceDueText]);

  const locked = submitting || Boolean(savedPending);
  const remaining = remainingAfterPayment(balanceDue, amount);
  const selectedMethod = PAYMENT_METHOD_OPTIONS.find((method) => method.value === paymentMethod);
  const submit = async (resumeRequested: boolean) => {
    if (!ownerId) { setFormError('Wait for the current account before recording a payment.'); return; }
    if (!onlineManager.isOnline()) { setFormError('You are offline. This attempt will not be sent later automatically. Reconnect before continuing.'); return; }
    if (!pendingRef.current) {
      if (!balanceDue) { setFormError('The balance due is unavailable. Refresh the invoice before recording a payment.'); return; }
      const validation = paymentAmountError(amount, balanceDue);
      if (validation || !/^\d{4}-\d{2}-\d{2}$/.test(paymentDate.trim())) {
        setAmountError(validation);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate.trim())) setFormError('Enter the payment date as YYYY-MM-DD.');
        return;
      }
      if (currency !== 'NZD' && !exchangeRateId) { setFormError('Select a reviewed settlement exchange rate before recording a foreign payment.'); return; }
    }
    if (submitting) return;
    const operationScope = scope;
    const operationAttempt = createPaymentAttempt();
    let saved: PendingMutation<CreatePaymentRequest> | null = null;
    setSubmitting(true); setFormError(null);
    try {
      const hydrated = loaded.current?.scope === operationScope ? await loaded.current.promise : await pendingMutation.load(ownerId, target, (value) => storedPayment(value, invoice.id));
      if (currentScope.current !== operationScope) return;
      if (hydrated && !resumeRequested) { setFormError('Review the saved payment details, then choose Resume pending payment.'); return; }
      const payload: CreatePaymentRequest = hydrated?.input ?? {
        invoiceId: invoice.id, paymentMethod, amount: normalizePaymentAmount(amount)!, paymentDate: paymentDate.trim(),
        referenceNumber: referenceNumber.trim() || null, notes: notes.trim() || null,
        ...(exchangeRateId ? { exchangeRateId } : {}),
      };
      const fields: PaymentAttemptFields = { ...payload, referenceNumber: payload.referenceNumber ?? '', notes: payload.notes ?? '' };
      if (!operationAttempt.claim(paymentFingerprint(fields), operationScope, fields)) {
        setFormError('A payment for this invoice is already being recorded. Wait until it finishes.'); return;
      }
      saved = hydrated ?? await pendingMutation.claim(ownerId, target, payload, (value) => storedPayment(value, invoice.id));
      pendingRef.current = saved; setSavedPending(saved); callbackRef.current?.(true);
      await onSubmit(saved.input, saved.key);
      await pendingMutation.clear(ownerId, target);
      operationAttempt.succeed();
      if (currentScope.current === operationScope) { loadGeneration.current++; pendingRef.current = null; loaded.current = { scope: operationScope, promise: Promise.resolve(null) }; setSavedPending(null); callbackRef.current?.(false); }
    } catch (error) {
      let retained: PendingMutation<CreatePaymentRequest> | null = null;
      try {
        if (saved) {
          if (error instanceof AuthApiError && error.code === 'IDEMPOTENCY_CONFLICT') await pendingMutation.fail(ownerId, target, 0);
          await pendingMutation.fail(ownerId, target, error instanceof AuthApiError ? error.status : 0);
          retained = await pendingMutation.load(ownerId, target, (value) => storedPayment(value, invoice.id));
        }
      } catch {
        operationAttempt.release();
        if (currentScope.current === operationScope) {
          pendingRef.current = saved; setSavedPending(saved); callbackRef.current?.(Boolean(saved));
          setFormError('The saved payment outcome could not be checked. Do not record another payment; reconnect and review this attempt.');
        }
        return;
      }
      if (retained) operationAttempt.release(); else operationAttempt.resetKey();
      if (currentScope.current !== operationScope) return;
      loadGeneration.current++; pendingRef.current = retained; loaded.current = { scope: operationScope, promise: Promise.resolve(retained) }; setSavedPending(retained); callbackRef.current?.(Boolean(retained));
      const failure = mapPaymentError(error, onlineManager.isOnline());
      if (error instanceof PaymentExceedsBalanceError) {
        const nextBalance = error.invoice.balanceDueText?.trim() ?? '';
        setShownBalance(nextBalance); setAmountError(retained ? null : nextBalance ? paymentAmountError(amount, nextBalance) : null);
      }
      setFormError(failure.kind === 'offline' && retained ? 'You are offline. The payment outcome is unknown; it will not be sent later automatically. Reconnect, then resume this saved attempt.' : failure.message);
      if (error instanceof AuthApiError) console.error('Payment outcome needs review', { code: error.code, requestId: error.requestId, status: error.status });
    } finally { if (currentScope.current === operationScope) setSubmitting(false); }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => {
        if (submitting) return;
        onClose();
      }}
    >
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
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.kicker}>{invoice.invoiceNumber}</Text>
          <Text style={styles.balanceLabel}>Balance due</Text>
          <Text style={styles.balance}>{balanceDue ? formatPaymentAmount(balanceDue, currency) : 'Unavailable'}</Text>
          {savedPending ? <Text accessibilityRole="alert" style={styles.helper}>A payment attempt is saved. Resume it unchanged to confirm its outcome; do not record it again as a new payment.</Text> : null}
          <Text style={styles.fieldLabel}>Payment method</Text>
          <View style={styles.methods}>
            {PAYMENT_METHOD_OPTIONS.map((method) => {
              const selected = paymentMethod === method.value;
              return (
                <AppPressable
                  key={method.value}
                  accessibilityRole="button"
                  accessibilityLabel={method.label}
                  accessibilityState={{ selected, disabled: locked }}
                  disabled={locked}
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
            editable={!locked}
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
            onChangeText={(value) => { setPaymentDate(value); setExchangeRateId(undefined); }}
            editable={!locked}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={palette.textTertiary}
            style={styles.input}
          />
          <SettlementRatePicker currency={currency} paymentDate={paymentDate} value={exchangeRateId} onChange={setExchangeRateId} disabled={locked} />
          <Text style={styles.fieldLabel}>Reference</Text>
          <TextInput
            accessibilityLabel="Payment reference"
            value={referenceNumber}
            onChangeText={setReferenceNumber}
            editable={!locked}
            placeholder="Optional"
            placeholderTextColor={palette.textTertiary}
            style={styles.input}
          />
          <Text style={styles.fieldLabel}>Notes</Text>
          <TextInput
            accessibilityLabel="Payment notes"
            value={notes}
            onChangeText={setNotes}
            editable={!locked}
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
            accessibilityLabel={savedPending ? "Resume pending payment" : "Record payment"}
            accessibilityState={{ disabled: submitting, busy: submitting }}
            disabled={submitting}
            onPress={() => { void submit(Boolean(savedPending)); }}
            style={({ pressed }) => [styles.submit, submitting && styles.submitDisabled, pressed && !submitting && styles.pressed]}
          >
            {submitting ? (
              <ActivityIndicator color={palette.accentForeground} />
            ) : (
              <Text style={styles.submitText}>{savedPending ? "Resume pending payment" : "Record payment"}</Text>
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
