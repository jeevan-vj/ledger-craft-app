import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppPressable } from '@/components/ui/AppPressable';
import { cartTotal, displayQuantity, lineKey, lineLabel, lineTotal, type SaleDraft } from '@/features/sales/saleCart';
import { control, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme';
import { formatMoney } from '@/utils/money';

interface CartDrawerProps {
  visible: boolean;
  draft: SaleDraft;
  onClose: () => void;
  onRemove: (key: string) => void;
  onAddCustomer: () => void;
  onClearCustomer: () => void;
}

export function CartDrawer({ visible, draft, onClose, onRemove, onAddCustomer, onClearCustomer }: CartDrawerProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const insets = useSafeAreaInsets();
  const total = cartTotal(draft.lines);
  const customer = draft.customerName || 'Walk-in';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView
        style={styles.sheet}
        contentContainerStyle={[styles.content, { paddingTop: insets.top || space.lg, paddingBottom: insets.bottom + space.xl }]}
      >
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">Cart</Text>
          <AppPressable accessibilityRole="button" accessibilityLabel="Close cart" onPress={onClose} style={styles.close}>
            <Text style={styles.closeText}>Close</Text>
          </AppPressable>
        </View>
        <View style={styles.customer}>
          <View style={styles.customerCopy}>
            <Text style={styles.customerLabel}>Customer</Text>
            <Text style={styles.customerName}>{customer}</Text>
          </View>
          <AppPressable accessibilityRole="button" accessibilityLabel="Add customer" onPress={onAddCustomer} style={styles.link}>
            <Text style={styles.linkText}>{draft.customerId ? 'Change' : 'Add customer'}</Text>
          </AppPressable>
        </View>
        {draft.customerId ? (
          <AppPressable accessibilityRole="button" accessibilityLabel="Use walk-in customer" onPress={onClearCustomer} style={styles.link}>
            <Text style={styles.linkText}>Use walk-in customer</Text>
          </AppPressable>
        ) : null}
        {draft.lines.length === 0 ? <Text style={styles.empty}>The cart is empty.</Text> : null}
        {draft.lines.map((line) => {
          const key = lineKey(line);
          const name = lineLabel(line);
          return (
            <View key={key} style={styles.line}>
              <View style={styles.lineCopy}>
                <Text style={styles.lineName}>{name}</Text>
                <Text style={styles.lineMeta}>{displayQuantity(line.quantity)} × {formatMoney(line.price)}</Text>
              </View>
              <Text style={styles.lineTotal}>{formatMoney(lineTotal(line))}</Text>
              <AppPressable accessibilityRole="button" accessibilityLabel={`Remove ${name}`} onPress={() => onRemove(key)} style={styles.remove}>
                <Text style={styles.removeText}>Remove</Text>
              </AppPressable>
            </View>
          );
        })}
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.total}>{formatMoney(total)}</Text>
      </ScrollView>
    </Modal>
  );
}

const createStyles = ({ colors, type }: ReturnType<typeof useTheme>) => StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: space.screen, gap: space.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...type.title },
  close: { minHeight: control.touchTarget, justifyContent: 'center' },
  closeText: { ...type.callout, color: colors.accentText },
  customer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  customerCopy: { flex: 1 },
  customerLabel: { ...type.footnote },
  customerName: { ...type.headline },
  link: { minHeight: control.touchTarget, justifyContent: 'center' },
  linkText: { ...type.callout, color: colors.accentText },
  empty: { ...type.subhead },
  line: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: space.lg,
    gap: space.xs,
  },
  lineCopy: { gap: 2 },
  lineName: { ...type.headline },
  lineMeta: { ...type.footnote },
  lineTotal: { ...type.title, fontSize: 22 },
  remove: { minHeight: control.touchTarget, justifyContent: 'center' },
  removeText: { ...type.callout, color: colors.danger },
  totalLabel: { ...type.footnote, marginTop: space.sm },
  total: { ...type.money, fontSize: 40, lineHeight: 46 },
});
