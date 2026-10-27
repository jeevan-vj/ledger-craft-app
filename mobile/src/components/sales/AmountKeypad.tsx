import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppPressable } from '@/components/ui/AppPressable';
import { pushKeypadKey } from '@/features/sales/saleCart';
import { control, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme';
import { formatMoney } from '@/utils/money';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'backspace'] as const;

interface AmountKeypadProps {
  value: string;
  onChange: (next: string) => void;
  label: string;
  currency?: string;
}

export function AmountKeypad({ value, onChange, label, currency = 'NZD' }: AmountKeypadProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const shown = value ? formatMoney(value.endsWith('.') ? `${value}0` : value || '0', currency) : formatMoney('0.00', currency);
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.amount} accessibilityLabel={`${label} ${value || '0'}`}>{shown}</Text>
      <View style={styles.grid}>
        {KEYS.map((key) => {
          const name = key === 'backspace' ? 'Delete' : key === '.' ? 'Decimal point' : `Key ${key}`;
          return (
            <AppPressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={name}
              onPress={() => onChange(pushKeypadKey(value, key))}
              style={({ pressed }) => [styles.key, pressed && styles.pressed]}
            >
              <Text style={styles.keyText}>{key === 'backspace' ? '⌫' : key}</Text>
            </AppPressable>
          );
        })}
      </View>
    </View>
  );
}

const createStyles = ({ colors, type }: ReturnType<typeof useTheme>) => StyleSheet.create({
  label: { ...type.footnote, marginBottom: space.xs },
  amount: { ...type.money, fontSize: 36, lineHeight: 42, marginBottom: space.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  key: {
    width: '31%',
    minHeight: control.default,
    borderRadius: radius.md,
    backgroundColor: colors.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyText: { ...type.title, fontSize: 22 },
  pressed: { opacity: 0.7 },
});
