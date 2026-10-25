import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { AppPressable } from '@/components/ui/AppPressable';
import { formatPaymentHistory } from '@/features/payments/paymentModel';
import type { Payment } from '@/types/payment';
import { space } from '@/theme/tokens';
import { useTheme } from '@/theme';

interface PaymentHistoryListProps {
  payments: Payment[];
  currency: string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export function PaymentHistoryList({ payments, currency, loading, error, onRetry }: PaymentHistoryListProps) {
  const theme = useTheme();
  const styles = createStyles(theme);

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Payments</Text>
      {loading ? (
        <View style={styles.statusRow}>
          <ActivityIndicator color={theme.colors.accent} accessibilityLabel="Loading payments" />
          <Text style={styles.meta}>Loading payments</Text>
        </View>
      ) : null}
      {error ? (
        <AppPressable
          accessibilityRole="button"
          accessibilityLabel="Retry loading payments"
          onPress={onRetry}
          style={({ pressed }) => [styles.retry, pressed && { opacity: 0.7 }]}
        >
          <Text style={styles.error}>{error} Tap to retry.</Text>
        </AppPressable>
      ) : null}
      {!loading && !error && payments.length === 0 ? (
        <Text style={styles.meta}>No payments recorded</Text>
      ) : null}
      {payments.map((payment) => {
        const row = formatPaymentHistory(payment, currency);
        const label = `${row.method}, ${row.amount}, ${row.date}${row.reference ? `, reference ${row.reference}` : ''}, ${row.status}`;
        return (
          <View key={payment.id} accessible accessibilityLabel={label} style={styles.row}>
            <View style={styles.copy}>
              <Text style={styles.method}>{row.method}</Text>
              <Text style={styles.meta}>
                {row.date}
                {row.reference ? ` · ${row.reference}` : ''}
                {` · ${row.status}`}
              </Text>
            </View>
            <Text style={styles.amount}>{row.amount}</Text>
          </View>
        );
      })}
    </View>
  );
}

const createStyles = ({ colors: palette }: ReturnType<typeof useTheme>) => StyleSheet.create({
  card: {
    backgroundColor: palette.surfaceRaised,
    borderRadius: 16,
    padding: space.lg,
    marginBottom: space.lg,
    borderWidth: 1,
    borderColor: palette.border,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: palette.textSecondary,
    letterSpacing: -0.08,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
  },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.separator,
  },
  copy: { flex: 1, minWidth: 0 },
  method: { fontSize: 16, fontWeight: '600', color: palette.text },
  meta: { marginTop: 2, fontSize: 13, color: palette.textSecondary },
  amount: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.text,
    fontVariant: ['tabular-nums'],
  },
  error: { fontSize: 14, fontWeight: '600', color: palette.danger },
  retry: { minHeight: 44, justifyContent: 'center' },
});
