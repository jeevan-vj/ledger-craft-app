import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { palette, space, type } from '@/theme/tokens';
import { formatMoney } from '@/utils/money';

interface BalanceCardProps {
  totalBalance: number;
  paidBalance?: number;
  pendingBalance?: number;
  currency?: string;
  label?: string;
}

export function BalanceCard({
  totalBalance,
  paidBalance = 0,
  pendingBalance = 0,
  currency = 'NZD',
  label = 'You are owed',
}: BalanceCardProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Text
        style={[styles.amount, { fontVariant: ['tabular-nums'] }]}
        accessibilityLabel={`${label} ${formatMoney(totalBalance, currency)}`}
      >
        {formatMoney(totalBalance, currency)}
      </Text>
      <View style={styles.meta}>
        <View style={styles.metaItem}>
          <View style={[styles.dot, { backgroundColor: palette.success }]} />
          <Text style={styles.metaLabel}>Paid</Text>
          <Text style={styles.metaValue}>{formatMoney(paidBalance, currency)}</Text>
        </View>
        <View style={styles.metaItem}>
          <View style={[styles.dot, { backgroundColor: palette.warning }]} />
          <Text style={styles.metaLabel}>Outstanding</Text>
          <Text style={styles.metaValue}>{formatMoney(pendingBalance, currency)}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: space.xxl,
  },
  label: {
    ...type.subhead,
    marginBottom: 4,
  },
  amount: {
    ...type.money,
  },
  meta: {
    flexDirection: 'row',
    gap: space.xl,
    marginTop: space.md,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  metaLabel: {
    ...type.footnote,
  },
  metaValue: {
    ...type.footnote,
    color: palette.text,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
});
