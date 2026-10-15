import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { ModernInput } from '@/components/ui/ModernInput';
import { palette, radius, space } from '@/theme/tokens';

interface TaxConfigCardProps {
  taxEnabled: boolean;
  taxRate: number;
  subtotal: number;
  taxAmount: number;
  total: number;
  onTaxEnabledChange: (enabled: boolean) => void;
  onTaxRateChange: (rate: number) => void;
  formatCurrency: (amount: number) => string;
}

type TaxOption = 'none' | 'gst' | 'custom';

export function TaxConfigCard({
  taxEnabled,
  taxRate,
  subtotal,
  taxAmount,
  total,
  onTaxEnabledChange,
  onTaxRateChange,
  formatCurrency,
}: TaxConfigCardProps) {
  const [taxOption, setTaxOption] = useState<TaxOption>(
    !taxEnabled ? 'none' : taxRate === 15 ? 'gst' : 'custom'
  );
  const [customRate, setCustomRate] = useState(String(taxRate));

  const handleOptionSelect = (option: TaxOption) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTaxOption(option);

    switch (option) {
      case 'none':
        onTaxEnabledChange(false);
        break;
      case 'gst':
        onTaxEnabledChange(true);
        onTaxRateChange(15);
        break;
      case 'custom':
        onTaxEnabledChange(true);
        onTaxRateChange(parseFloat(customRate) || 0);
        break;
      default: {
        const _exhaustive: never = option;
        return _exhaustive;
      }
    }
  };

  const handleCustomRateChange = (text: string) => {
    setCustomRate(text);
    const rate = parseFloat(text) || 0;
    if (taxOption === 'custom') {
      onTaxRateChange(rate);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Tax</Text>
      <View style={styles.segment}>
        {(
          [
            { id: 'none', label: 'None' },
            { id: 'gst', label: 'GST 15%' },
            { id: 'custom', label: 'Custom' },
          ] as const
        ).map((option) => {
          const selected = taxOption === option.id;
          return (
            <Pressable
              key={option.id}
              onPress={() => handleOptionSelect(option.id)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={[styles.segmentItem, selected && styles.segmentItemSelected]}
            >
              <Text style={[styles.segmentLabel, selected && styles.segmentLabelSelected]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {taxOption === 'custom' ? (
        <View style={styles.customRow}>
          <View style={styles.customInput}>
            <ModernInput
              label="Rate"
              value={customRate}
              onChangeText={handleCustomRateChange}
              keyboardType="decimal-pad"
              placeholder="0"
            />
          </View>
          <Text style={styles.percent}>%</Text>
        </View>
      ) : null}

      <View style={styles.summary}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Subtotal</Text>
          <Text style={styles.summaryValue}>{formatCurrency(subtotal)}</Text>
        </View>
        {taxEnabled ? (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>
              {taxOption === 'gst' ? 'GST' : 'Tax'} ({taxRate}%)
            </Text>
            <Text style={styles.summaryValue}>{formatCurrency(taxAmount)}</Text>
          </View>
        ) : null}
        <View style={[styles.summaryRow, styles.summaryRowTotal]}>
          <Text style={styles.summaryLabelTotal}>Total</Text>
          <Text style={styles.summaryValueTotal}>{formatCurrency(total)}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.group,
    padding: space.lg,
    marginBottom: space.lg,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: palette.textSecondary,
    letterSpacing: -0.08,
    textTransform: 'uppercase',
    marginBottom: space.md,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: palette.fill,
    borderRadius: 10,
    padding: 2,
  },
  segmentItem: {
    flex: 1,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  segmentItemSelected: {
    backgroundColor: palette.surface,
  },
  segmentLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.textSecondary,
  },
  segmentLabelSelected: {
    color: palette.text,
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: space.md,
    gap: space.sm,
  },
  customInput: {
    flex: 1,
  },
  percent: {
    fontSize: 17,
    fontWeight: '600',
    color: palette.textSecondary,
    marginBottom: 28,
  },
  summary: {
    marginTop: space.lg,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.separator,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
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
  summaryRowTotal: {
    marginTop: 4,
    paddingTop: 10,
  },
  summaryLabelTotal: {
    fontSize: 17,
    fontWeight: '600',
    color: palette.text,
  },
  summaryValueTotal: {
    fontSize: 22,
    fontWeight: '700',
    color: palette.text,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.4,
  },
});
