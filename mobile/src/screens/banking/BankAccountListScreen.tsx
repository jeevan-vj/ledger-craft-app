import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { EmptyState, FilterPills, ListRow } from '@/components/ui';
import { NativeHeaderButton } from '@/components/ui/NativeHeaderButton';
import { bankingApi } from '@/features/banking/api/bankingApi';
import type { MoreStackParamList } from '@/navigation/types';
import { useTheme } from '@/theme';
import { formatMoney } from '@/utils/money';
import { useTabScreenInsets } from '@/hooks/useTabScreenInsets';

type Navigation = NativeStackNavigationProp<MoreStackParamList, 'BankAccountList'>;
type Filter = 'active' | 'all' | 'inactive';

export default function BankAccountListScreen() {
  const theme = useTheme();
  const { bottomPadding } = useTabScreenInsets();
  const navigation = useNavigation<Navigation>();
  const [filter, setFilter] = useState<Filter>('active');
  const query = useQuery({ queryKey: ['banking', 'accounts'], queryFn: bankingApi.listAccounts });
  const { isFetched, refetch } = query;
  useFocusEffect(useCallback(() => { if (isFetched) void refetch(); }, [isFetched, refetch]));
  useLayoutEffect(() => navigation.setOptions({
    headerRight: () => <NativeHeaderButton label="New" primary accessibilityHint="Creates a bank account" onPress={() => navigation.navigate('BankAccountCreate')} />,
  }), [navigation]);
  const accounts = useMemo(() => (query.data ?? []).filter((account) => filter === 'all' || (filter === 'active' ? account.isActive : !account.isActive)), [filter, query.data]);

  if (query.isLoading) return <View style={[styles.center, { backgroundColor: theme.colors.background }]}><ActivityIndicator color={theme.colors.accent} accessibilityLabel="Loading bank accounts" /></View>;
  return <FlatList
    style={{ backgroundColor: theme.colors.background }}
    contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}
    contentInsetAdjustmentBehavior="automatic"
    data={accounts}
    keyExtractor={(account) => account.id}
    refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={query.refetch} tintColor={theme.colors.accent} />}
    ListHeaderComponent={<View><FilterPills options={['active', 'all', 'inactive'] as const} value={filter} onChange={setFilter} />{query.error && query.data?.length ? <Text style={[theme.type.footnote, styles.error, { color: theme.colors.danger }]}>Bank accounts could not be refreshed.</Text> : null}</View>}
    renderItem={({ item, index }) => <View style={{ borderBottomWidth: index === accounts.length - 1 ? 0 : StyleSheet.hairlineWidth, borderBottomColor: theme.colors.separator }}>
      <ListRow
        label={item.accountName}
        subtitle={`${item.bankName} · ${item.accountNumber}${item.isActive ? '' : ' · Inactive'}`}
        value={formatMoney(item.currentBalance, item.currency)}
        icon={<Feather name="briefcase" size={18} color={theme.colors.accentText} />}
        onPress={() => navigation.navigate('BankAccountDetail', { bankAccountId: item.id })}
        accessibilityHint="Opens bank account details and transactions"
      />
    </View>}
    ListEmptyComponent={<EmptyState title={query.error ? 'Unable to load bank accounts' : 'No bank accounts yet'} description={query.error instanceof Error ? query.error.message : 'Add an account to track balances and imported transactions.'} actionLabel={query.error ? 'Try again' : 'Add bank account'} onAction={query.error ? query.refetch : () => navigation.navigate('BankAccountCreate')} />}
  />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' }, content: { paddingBottom: 40, flexGrow: 1 },
  error: { minHeight: 44, textAlignVertical: 'center', paddingHorizontal: 20 },
});
