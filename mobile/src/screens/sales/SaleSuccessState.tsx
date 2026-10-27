import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppPressable } from '@/components/ui/AppPressable';
import type { SaleReceiptHandoff } from '@/features/sales/salesApi';
import { control, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme';

/**
 * Receipt-sheet hook for PR D.
 * Replace this view with the QR code and native share sheet. The handoff
 * already has the invoice, payment, and receipt ids. Create the share link
 * only when that sheet opens.
 */
export function SaleSuccessState({ sale, onDone }: { sale: SaleReceiptHandoff; onDone: () => void }) {
  const theme = useTheme();
  const styles = createStyles(theme);
  return (
    <View style={styles.wrap}>
      <Text style={styles.kicker}>Sale saved</Text>
      <Text style={styles.number} accessibilityRole="header">{sale.invoiceNumber}</Text>
      <Text style={styles.copy}>The invoice is paid and will show in Invoices.</Text>
      <AppPressable
        accessibilityRole="button"
        accessibilityLabel="Done"
        onPress={onDone}
        style={({ pressed }) => [styles.done, pressed && styles.pressed]}
      >
        <Text style={styles.doneText}>Done</Text>
      </AppPressable>
    </View>
  );
}

const createStyles = ({ colors, type }: ReturnType<typeof useTheme>) => StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: space.screen, gap: space.md },
  kicker: { ...type.footnote },
  number: { ...type.display, textAlign: 'center' },
  copy: { ...type.subhead, textAlign: 'center' },
  done: {
    minHeight: control.prominent,
    minWidth: 180,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.lg,
  },
  doneText: { ...type.headline, color: colors.accentForeground },
  pressed: { opacity: 0.78 },
});
