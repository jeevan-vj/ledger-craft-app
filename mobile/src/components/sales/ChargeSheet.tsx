import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SalePaymentMethod } from '@ledgercraft/contracts';
import { AppPressable } from '@/components/ui/AppPressable';
import { AmountKeypad } from '@/components/sales/AmountKeypad';
import { cashChange, normalizeSaleAmount } from '@/features/sales/saleCart';
import { OFFLINE_SALE_MESSAGE } from '@/features/sales/saleAttempt';
import { control, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme';
import { formatMoney } from '@/utils/money';

const METHODS: { value: SalePaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'credit_card', label: 'Card/EFTPOS' },
  { value: 'bank_transfer', label: 'Bank transfer' },
];

const QUICK_TENDER = [
  { label: '$5', amount: '5.00' },
  { label: '$10', amount: '10.00' },
  { label: '$20', amount: '20.00' },
  { label: '$50', amount: '50.00' },
] as const;

interface ChargeSheetProps {
  visible: boolean;
  total: string;
  paymentMethod: SalePaymentMethod;
  referenceNumber: string;
  tendered: string;
  submitting: boolean;
  online: boolean;
  formError: string | null;
  onMethod: (method: SalePaymentMethod) => void;
  onReference: (value: string) => void;
  onTendered: (value: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export function ChargeSheet({
  visible,
  total,
  paymentMethod,
  referenceNumber,
  tendered,
  submitting,
  online,
  formError,
  onMethod,
  onReference,
  onTendered,
  onConfirm,
  onClose,
}: ChargeSheetProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const insets = useSafeAreaInsets();
  const change = paymentMethod === 'cash' ? cashChange(total, tendered) : null;
  const confirmDisabled = !online || submitting || (paymentMethod === 'cash' && change === null);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      allowSwipeDismissal={!submitting}
      onRequestClose={() => {
        if (submitting) return;
        onClose();
      }}
      onDismiss={() => {
        if (submitting) return;
        onClose();
      }}
    >
      <ScrollView
        style={styles.sheet}
        contentContainerStyle={[styles.content, { paddingTop: insets.top || space.lg, paddingBottom: insets.bottom + space.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">Charge</Text>
          <AppPressable accessibilityRole="button" accessibilityLabel="Close charge" onPress={onClose} disabled={submitting} style={styles.close}>
            <Text style={styles.closeText}>Close</Text>
          </AppPressable>
        </View>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.total}>{formatMoney(total)}</Text>
        <View style={styles.methods}>
          {METHODS.map((method) => {
            const selected = paymentMethod === method.value;
            return (
              <AppPressable
                key={method.value}
                accessibilityRole="button"
                accessibilityLabel={method.label}
                accessibilityState={{ selected, disabled: submitting }}
                disabled={submitting}
                onPress={() => onMethod(method.value)}
                style={({ pressed }) => [styles.method, selected && styles.methodSelected, pressed && styles.pressed]}
              >
                <Text style={[styles.methodText, selected && styles.methodTextSelected]}>{method.label}</Text>
              </AppPressable>
            );
          })}
        </View>
        {paymentMethod === 'cash' ? (
          <View>
            <View style={styles.quick}>
              {QUICK_TENDER.map((tender) => (
                <AppPressable
                  key={tender.amount}
                  accessibilityRole="button"
                  accessibilityLabel={tender.label}
                  disabled={submitting}
                  onPress={() => onTendered(tender.amount)}
                  style={({ pressed }) => [styles.quickButton, pressed && styles.pressed]}
                >
                  <Text style={styles.quickText}>{tender.label}</Text>
                </AppPressable>
              ))}
              <AppPressable
                accessibilityRole="button"
                accessibilityLabel="Exact"
                disabled={submitting}
                onPress={() => onTendered(normalizeSaleAmount(total) ?? total)}
                style={({ pressed }) => [styles.quickButton, pressed && styles.pressed]}
              >
                <Text style={styles.quickText}>Exact</Text>
              </AppPressable>
            </View>
            <AmountKeypad label="Tendered amount" value={tendered} onChange={onTendered} />
            <Text style={styles.change}>{change ? `Change ${formatMoney(change)}` : 'Enter at least the total.'}</Text>
          </View>
        ) : (
          <View>
            <Text style={styles.totalLabel}>Reference</Text>
            <TextInput
              accessibilityLabel="Payment reference"
              value={referenceNumber}
              onChangeText={onReference}
              editable={!submitting}
              placeholder="Optional"
              placeholderTextColor={theme.colors.textTertiary}
              style={styles.input}
            />
          </View>
        )}
        {!online ? <Text style={styles.offline}>{OFFLINE_SALE_MESSAGE}</Text> : null}
        {formError ? <Text style={styles.error}>{formError}</Text> : null}
        <AppPressable
          accessibilityRole="button"
          accessibilityLabel="Confirm sale"
          accessibilityState={{ disabled: confirmDisabled, busy: submitting }}
          disabled={confirmDisabled}
          onPress={onConfirm}
          style={({ pressed }) => [styles.confirm, confirmDisabled && styles.disabled, pressed && !confirmDisabled && styles.pressed]}
        >
          <Text style={styles.confirmText}>{submitting ? 'Saving…' : 'Confirm'}</Text>
        </AppPressable>
      </ScrollView>
    </Modal>
  );
}

const createStyles = ({ colors, type }: ReturnType<typeof useTheme>) => StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: space.screen, gap: space.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...type.title },
  close: { minHeight: control.touchTarget, justifyContent: 'center', paddingHorizontal: space.sm },
  closeText: { ...type.callout, color: colors.accentText },
  totalLabel: { ...type.footnote },
  total: { ...type.money, fontSize: 40, lineHeight: 46 },
  methods: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  method: {
    minHeight: control.default,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodSelected: { backgroundColor: colors.accent },
  methodText: { ...type.callout },
  methodTextSelected: { color: colors.accentForeground },
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md },
  quickButton: {
    minHeight: control.default,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.accentFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickText: { ...type.callout, color: colors.accentText },
  change: { ...type.headline, marginTop: space.md },
  input: {
    minHeight: control.default,
    borderRadius: radius.md,
    backgroundColor: colors.fill,
    color: colors.text,
    paddingHorizontal: space.lg,
    fontSize: 17,
  },
  offline: { ...type.subhead, color: colors.warning },
  error: { ...type.subhead, color: colors.danger },
  confirm: {
    minHeight: control.prominent,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.sm,
  },
  confirmText: { ...type.headline, color: colors.accentForeground },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.78 },
});
