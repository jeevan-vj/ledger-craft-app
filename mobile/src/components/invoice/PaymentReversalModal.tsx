import React, { useEffect, useState } from 'react';
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
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppPressable } from '@/components/ui/AppPressable';
import { SmartDatePicker } from '@/components/ui/SmartDatePicker';
import type { Payment } from '@/types/payment';
import { control, hairline, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme';

interface PaymentReversalModalProps {
  visible: boolean;
  payment: Payment | null;
  onClose: () => void;
  onSubmit: (input: { reason: string; reversalDate: string }) => Promise<void>;
}

function localIsoDate(date = new Date()): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function PaymentReversalModal({ visible, payment, onClose, onSubmit }: Readonly<PaymentReversalModalProps>) {
  const theme = useTheme();
  const { colors: palette } = theme;
  const styles = createStyles(theme);
  const insets = useSafeAreaInsets();
  const [reason, setReason] = useState('');
  const [reversalDate, setReversalDate] = useState(localIsoDate());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setReason('');
    setReversalDate(localIsoDate());
    setError(null);
  }, [visible, payment?.id]);

  const submit = async () => {
    const trimmedReason = reason.trim();
    if (trimmedReason.length < 3) {
      setError('Enter a reason for reversing this payment.');
      return;
    }
    if (!payment || !/^\d{4}-\d{2}-\d{2}$/.test(reversalDate) || reversalDate < payment.paymentDate) {
      setError('Reversal date cannot be before the payment date.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ reason: trimmedReason, reversalDate });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'The payment could not be reversed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => { if (!submitting) onClose(); }}
    >
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.header, { paddingTop: insets.top || space.lg }]}>
          <AppPressable
            accessibilityRole="button"
            accessibilityLabel="Close payment reversal"
            disabled={submitting}
            onPress={onClose}
            style={styles.headerButton}
          >
            <Feather name="x" size={22} color={palette.textSecondary} />
          </AppPressable>
          <Text style={styles.headerTitle}>Reverse payment</Text>
          <View style={styles.headerButton} />
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.explainer}>
            The original payment and receipt stay in the audit trail. LedgerCraft posts an equal reversal and reopens the invoice balance.
          </Text>
          <SmartDatePicker
            label="Reversal date"
            value={reversalDate}
            minimumDate={payment ? new Date(`${payment.paymentDate}T12:00:00`) : undefined}
            showPresets={false}
            onChangeDate={setReversalDate}
          />
          <Text style={styles.label}>Reason</Text>
          <TextInput
            accessibilityLabel="Reversal reason"
            value={reason}
            onChangeText={setReason}
            editable={!submitting}
            placeholder="For example, entered against the wrong invoice"
            placeholderTextColor={palette.textTertiary}
            maxLength={500}
            multiline
            style={[styles.input, styles.notes]}
          />
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space.lg) }]}>
          <AppPressable
            accessibilityRole="button"
            accessibilityLabel="Confirm payment reversal"
            accessibilityState={{ disabled: submitting, busy: submitting }}
            disabled={submitting || !payment}
            onPress={() => { void submit(); }}
            style={({ pressed }) => [styles.submit, submitting && styles.disabled, pressed && { opacity: 0.75 }]}
          >
            {submitting ? <ActivityIndicator color={palette.text} /> : <Text style={styles.submitText}>Reverse payment</Text>}
          </AppPressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = ({ colors: palette, type }: ReturnType<typeof useTheme>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.screen, paddingBottom: space.md, backgroundColor: palette.surface, borderBottomWidth: hairline, borderBottomColor: palette.separator },
  headerButton: { width: control.touchTarget, height: control.touchTarget, justifyContent: 'center' },
  headerTitle: { ...type.headline, fontSize: 20 },
  content: { padding: space.screen, paddingBottom: space.section },
  explainer: { ...type.body, color: palette.textSecondary, marginBottom: space.xl },
  label: { ...type.subhead, color: palette.text, fontWeight: '600', marginTop: space.lg, marginBottom: space.sm },
  input: { minHeight: control.prominent, borderRadius: radius.md, borderWidth: 1, borderColor: palette.separator, backgroundColor: palette.surface, paddingHorizontal: space.lg, fontSize: 16, color: palette.text },
  notes: { minHeight: 112, paddingTop: space.md, textAlignVertical: 'top' },
  error: { color: palette.danger, fontSize: 14, fontWeight: '600', marginTop: space.md },
  footer: { paddingHorizontal: space.screen, paddingTop: space.md, backgroundColor: palette.surface, borderTopWidth: hairline, borderTopColor: palette.separator },
  submit: { minHeight: control.prominent, borderRadius: radius.pill, backgroundColor: palette.danger, alignItems: 'center', justifyContent: 'center' },
  submitText: { color: palette.surface, fontSize: 17, fontWeight: '700' },
  disabled: { opacity: 0.5 },
});
