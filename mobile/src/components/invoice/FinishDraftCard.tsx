import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SmartDatePicker } from '@/components/ui/SmartDatePicker';
import { ModernInput } from '@/components/ui/ModernInput';
import { PillButton } from '@/components/ui/PillButton';
import { parseLocalDate } from '@/components/ui/datePickerModel';
import {
  addedLineError,
  lineTotal,
  preservedTaxRate,
  type AddedLineInput,
} from '@/features/invoices/finishDraftModel';
import type { Invoice } from '@/types/invoice';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme';
import { formatMoney } from '@/utils/money';

interface FinishDraftCardProps {
  invoice: Invoice;
  saving: boolean;
  saveError?: string;
  onDueDate: (dueDate: string) => void;
  onAddLine: (line: AddedLineInput) => void;
  onPreview: () => void;
}

export function FinishDraftCard({
  invoice,
  saving,
  saveError,
  onDueDate,
  onAddLine,
  onPreview,
}: FinishDraftCardProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [amount, setAmount] = useState('');
  const [localError, setLocalError] = useState<string>();
  const [hideSaveError, setHideSaveError] = useState(false);
  const itemCount = invoice.items.length;
  const previousCount = useRef(itemCount);
  useEffect(() => {
    if (itemCount > previousCount.current) {
      setDescription('');
      setQuantity('1');
      setAmount('');
      setLocalError(undefined);
      setHideSaveError(true);
    }
    previousCount.current = itemCount;
  }, [itemCount]);
  const total = lineTotal(quantity, amount);
  const taxRate = preservedTaxRate(invoice);
  const error = localError ?? (hideSaveError ? undefined : saveError);

  const change = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setLocalError(undefined);
    setHideSaveError(true);
  };

  const addLine = () => {
    const validation = addedLineError(description, quantity, amount);
    if (validation) {
      setLocalError(validation);
      setHideSaveError(true);
      return;
    }
    setLocalError(undefined);
    setHideSaveError(false);
    onAddLine({ description, quantity, amount });
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Finish this draft</Text>
      <Text style={styles.body}>Change the due date or add another line. Then preview or send it.</Text>
      <SmartDatePicker
        label="Due date"
        value={invoice.dueDate}
        presetBaseDate={invoice.date}
        minimumDate={parseLocalDate(invoice.date)}
        onChangeDate={(dueDate) => {
          setLocalError(undefined);
          setHideSaveError(false);
          onDueDate(dueDate);
        }}
      />
      <Text style={styles.fieldLabel}>Add a line</Text>
      <ModernInput
        label="Description"
        value={description}
        onChangeText={change(setDescription)}
        placeholder="Hosting"
        autoCapitalize="sentences"
        editable={!saving}
      />
      <ModernInput
        label="Quantity"
        value={quantity}
        onChangeText={change(setQuantity)}
        placeholder="1"
        keyboardType="decimal-pad"
        editable={!saving}
      />
      <ModernInput
        label="Amount each"
        value={amount}
        onChangeText={change(setAmount)}
        placeholder="0.00"
        keyboardType="decimal-pad"
        editable={!saving}
      />
      <Text style={styles.note}>
        {total == null
          ? 'Enter a quantity and an amount.'
          : `Line total ${formatMoney(total, invoice.currency || 'NZD')}.`}
      </Text>
      <Text style={styles.note}>
        {taxRate === '0' ? 'No GST will be added.' : `GST stays at ${taxRate}%.`}
      </Text>
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite" testID="finish-draft-error">
          {error}
        </Text>
      ) : null}
      <PillButton label="Add line" variant="secondary" loading={saving} onPress={addLine} />
      <PillButton label="Preview invoice" onPress={onPreview} disabled={saving} />
    </View>
  );
}

const createStyles = ({ colors: palette, type }: ReturnType<typeof useTheme>) => StyleSheet.create({
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.group,
    padding: space.lg,
    marginBottom: space.lg,
    gap: space.md,
  },
  title: { ...type.headline },
  body: { ...type.subhead, color: palette.textSecondary },
  fieldLabel: { ...type.caption, marginTop: space.sm },
  note: { ...type.footnote, color: palette.textSecondary },
  error: { ...type.footnote, color: palette.danger },
});
