import React, { useState } from 'react';
import { Modal, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppPressable } from '@/components/ui/AppPressable';
import { AmountKeypad } from '@/components/sales/AmountKeypad';
import { displayQuantity, keypadAmountError, lineKey, type SaleLine } from '@/features/sales/saleCart';
import { control, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme';

export function CustomAmountSheet({
  visible,
  onClose,
  onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (amount: string, label: string) => string | null;
}) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const insets = useSafeAreaInsets();
  const [amount, setAmount] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const amountError = amount ? keypadAmountError(amount) : 'Enter an amount.';
  const add = () => {
    const failure = onAdd(amount, label);
    if (failure) {
      setError(failure);
      return;
    }
    setAmount('');
    setLabel('');
    setError(null);
  };
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.sheet, { paddingTop: insets.top || space.lg, paddingBottom: insets.bottom + space.lg }]}>
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">Custom amount</Text>
          <AppPressable accessibilityRole="button" accessibilityLabel="Close custom amount" onPress={onClose} style={styles.close}>
            <Text style={styles.closeText}>Close</Text>
          </AppPressable>
        </View>
        <Text style={styles.fieldLabel}>Label</Text>
        <TextInput
          accessibilityLabel="Custom amount label"
          value={label}
          onChangeText={setLabel}
          placeholder="Custom amount"
          placeholderTextColor={theme.colors.textTertiary}
          style={styles.input}
        />
        <AmountKeypad label="Custom amount value" value={amount} onChange={(next) => { setAmount(next); setError(null); }} />
        {error || (amount && amountError) ? <Text style={styles.error}>{error || amountError}</Text> : null}
        <AppPressable
          accessibilityRole="button"
          accessibilityLabel="Add custom amount"
          accessibilityState={{ disabled: Boolean(amountError) }}
          disabled={Boolean(amountError)}
          onPress={add}
          style={({ pressed }) => [styles.primary, amountError ? styles.disabled : null, pressed && styles.pressed]}
        >
          <Text style={styles.primaryText}>Add</Text>
        </AppPressable>
      </View>
    </Modal>
  );
}

export function QuantitySheet({
  line,
  onClose,
  onSave,
  onRemove,
}: {
  line: SaleLine;
  onClose: () => void;
  onSave: (key: string, value: string) => string | null;
  onRemove: (key: string) => void;
}) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const insets = useSafeAreaInsets();
  const editingPrice = line.kind === 'custom';
  const [value, setValue] = useState(displayQuantity(editingPrice ? line.price : line.quantity));
  const [error, setError] = useState<string | null>(null);
  const key = lineKey(line);
  const save = () => {
    const failure = onSave(key, value);
    if (failure) setError(failure);
  };
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.sheet, { paddingTop: insets.top || space.lg, paddingBottom: insets.bottom + space.lg }]}>
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">{editingPrice ? 'Amount' : 'Quantity'}</Text>
          <AppPressable accessibilityRole="button" accessibilityLabel="Close quantity" onPress={onClose} style={styles.close}>
            <Text style={styles.closeText}>Close</Text>
          </AppPressable>
        </View>
        <AmountKeypad label={editingPrice ? 'Amount' : 'Quantity'} value={value} onChange={(next) => { setValue(next); setError(null); }} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <AppPressable accessibilityRole="button" accessibilityLabel={editingPrice ? 'Update amount' : 'Update quantity'} onPress={save} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
          <Text style={styles.primaryText}>Update</Text>
        </AppPressable>
        <AppPressable accessibilityRole="button" accessibilityLabel="Remove item" onPress={() => onRemove(key)} style={styles.remove}>
          <Text style={styles.removeText}>Remove</Text>
        </AppPressable>
      </View>
    </Modal>
  );
}

const createStyles = ({ colors, type }: ReturnType<typeof useTheme>) => StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.background, paddingHorizontal: space.screen, gap: space.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...type.title },
  close: { minHeight: control.touchTarget, justifyContent: 'center' },
  closeText: { ...type.callout, color: colors.accentText },
  fieldLabel: { ...type.footnote },
  input: {
    minHeight: control.default,
    borderRadius: radius.md,
    backgroundColor: colors.fill,
    color: colors.text,
    paddingHorizontal: space.lg,
    fontSize: 17,
  },
  error: { ...type.footnote, color: colors.danger },
  primary: {
    minHeight: control.prominent,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { ...type.headline, color: colors.accentForeground },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.78 },
  remove: { minHeight: control.touchTarget, alignItems: 'center', justifyContent: 'center' },
  removeText: { ...type.callout, color: colors.danger },
});
