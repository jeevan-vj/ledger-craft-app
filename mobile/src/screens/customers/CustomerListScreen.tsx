import React, { useCallback, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { CompositeNavigationProp, useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { NativeBottomTabNavigationProp } from '@bottom-tabs/react-navigation';
import { customerService, type Customer } from '@/services/customerService';
import { EmptyState, ListRow } from '@/components/ui';
import { NativeHeaderButton } from '@/components/ui/NativeHeaderButton';
import type { CustomerStackParamList, MainTabParamList } from '@/navigation/types';
import { useTheme } from '@/theme';
import { useTabScreenInsets } from '@/hooks/useTabScreenInsets';

type CustomerNavigation = CompositeNavigationProp<
  NativeStackNavigationProp<CustomerStackParamList, 'CustomerList'>,
  NativeBottomTabNavigationProp<MainTabParamList>
>;

export default function CustomerListScreen() {
  const theme = useTheme();
  const { bottomPadding } = useTabScreenInsets();
  const navigation = useNavigation<CustomerNavigation>();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openCustomer = useCallback(() => navigation.navigate('CustomerCreate'), [navigation]);
  const load = useCallback(async () => {
    try { setCustomers(await customerService.fetchCustomers()); setError(null); }
    catch { setError('Customers could not be loaded.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <NativeHeaderButton
          label="New"
          primary
          accessibilityHint="Creates a customer"
          onPress={openCustomer}
        />
      ),
    });
  }, [navigation, openCustomer]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator color={theme.colors.accent} accessibilityLabel="Loading customers" />
      </View>
    );
  }
  return <FlatList
    style={{ backgroundColor: theme.colors.background }}
    contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}
    contentInsetAdjustmentBehavior="automatic"
    data={customers}
    keyExtractor={(item) => item.id}
    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.colors.accent} />}
    renderItem={({ item, index }) => (
      <View
        accessible
        accessibilityLabel={`${item.name}${item.email ? `, ${item.email}` : ''}`}
        style={{ borderBottomWidth: index === customers.length - 1 ? 0 : StyleSheet.hairlineWidth, borderBottomColor: theme.colors.separator }}
      >
        <ListRow label={item.name} subtitle={[item.email, item.phone].filter(Boolean).join(' · ') || 'No contact details'} icon={<Text style={{ color: theme.colors.accentText, fontWeight: '800' }}>{item.name.slice(0, 1).toUpperCase()}</Text>} accessibilityHint="Opens customer details" onPress={() => navigation.navigate('CustomerDetail', { customerId: item.id })} />
      </View>
    )}
    ListHeaderComponent={
      error && customers.length ? (
        <Pressable onPress={() => { setRefreshing(true); load(); }} accessibilityRole="button" accessibilityLabel="Try again" style={styles.retry}>
          <Text style={[theme.type.subhead, { color: theme.colors.danger, fontWeight: '700' }]}>{error} Tap to retry.</Text>
        </Pressable>
      ) : customers.length ? <Text style={[theme.type.subhead, { marginBottom: 12 }]}>People and businesses you invoice</Text> : null
    }
    ListEmptyComponent={
      <EmptyState
        title={error ? 'Unable to load customers' : 'No customers yet'}
        description={error || 'Add a customer, then create their first invoice.'}
        actionLabel={error ? 'Try again' : 'Add customer'}
        onAction={error ? () => { setRefreshing(true); load(); } : openCustomer}
      />
    }
  />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40, flexGrow: 1 },
  retry: { minHeight: 44, justifyContent: 'center', marginBottom: 12 },
});
