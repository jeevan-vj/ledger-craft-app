import React, { useCallback, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { CompositeNavigationProp, useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { NativeBottomTabNavigationProp } from '@bottom-tabs/react-navigation';
import { customerService, type Customer } from '@/services/customerService';
import { EmptyState, ListRow } from '@/components/ui';
import { NativeHeaderButton } from '@/components/ui/NativeHeaderButton';
import type { CustomerStackParamList, MainTabParamList } from '@/navigation/types';
import { useTheme } from '@/theme';
import { Feather } from '@expo/vector-icons';
import { control, radius, space } from '@/theme/tokens';
import { filterCustomers } from '@/features/customers/model/filterCustomers';
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
  const [searchQuery, setSearchQuery] = useState('');
  const filteredCustomers = filterCustomers(customers, searchQuery);
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
      headerSearchBarOptions: Platform.OS === 'ios' && customers.length > 0 ? {
        placeholder: 'Search customers',
        hideWhenScrolling: true,
        onChangeText: event => setSearchQuery(event.nativeEvent.text),
        onCancelButtonPress: () => setSearchQuery(''),
      } : undefined,
      headerRight: () => (
        <NativeHeaderButton
          label="New"
          primary
          accessibilityHint="Creates a customer"
          onPress={openCustomer}
        />
      ),
    });
  }, [navigation, openCustomer, customers.length]);

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
    keyboardDismissMode="on-drag"
    keyboardShouldPersistTaps="handled"
    data={filteredCustomers}
    keyExtractor={(item) => item.id}
    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.colors.accent} />}
    renderItem={({ item, index }) => (
      <View
        style={[styles.row, index === 0 && styles.first, index === filteredCustomers.length - 1 && styles.last, { borderBottomWidth: index === filteredCustomers.length - 1 ? 0 : StyleSheet.hairlineWidth, borderBottomColor: theme.colors.separator }]}
      >
        <ListRow label={item.name} subtitle={[item.email, item.phone].filter(Boolean).join(' · ') || 'No contact details'} icon={<Text style={{ color: theme.colors.accentText, fontWeight: '800' }}>{item.name.slice(0, 1).toUpperCase()}</Text>} accessibilityHint="Opens customer details" onPress={() => navigation.navigate('CustomerDetail', { customerId: item.id })} />
      </View>
    )}
    ListHeaderComponent={
      <>
        {Platform.OS !== 'ios' && customers.length > 0 && (
          <View style={[styles.search, { backgroundColor: theme.colors.fill }]}>
            <Feather name="search" size={18} color={theme.colors.textSecondary} />
            <TextInput
              style={[theme.type.body, styles.searchInput]}
              placeholder="Search customers"
              placeholderTextColor={theme.colors.textTertiary}
              accessibilityLabel="Search customers"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
            />
          </View>
        )}
        {error && customers.length > 0 && (
          <Pressable onPress={() => { setRefreshing(true); load(); }} accessibilityRole="button" accessibilityLabel="Try again" style={styles.retry}>
            <Text style={[theme.type.subhead, { color: theme.colors.danger, fontWeight: '700' }]}>{error} Tap to retry.</Text>
          </Pressable>
        )}
      </>
    }
    ListEmptyComponent={customers.length > 0 ? (
      <EmptyState title="No customers match" description="Try a different name, email, or phone number." />
    ) : (
      <EmptyState
        title={error ? 'Unable to load customers' : 'No customers yet'}
        description={error || 'Add a customer, then create their first invoice.'}
        actionLabel={error ? 'Try again' : 'Add customer'}
        onAction={error ? () => { setRefreshing(true); load(); } : openCustomer}
      />
    )}
  />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: space.screen, paddingTop: space.sm, flexGrow: 1 },
  row: { overflow: 'hidden' },
  first: { borderTopLeftRadius: radius.group, borderTopRightRadius: radius.group },
  last: { borderBottomLeftRadius: radius.group, borderBottomRightRadius: radius.group },
  search: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.pill, paddingHorizontal: space.md, minHeight: control.default, gap: space.sm, marginBottom: space.xxl },
  searchInput: { flex: 1, minWidth: 0, paddingVertical: space.sm },
  retry: { minHeight: 44, justifyContent: 'center', marginBottom: 12 },
});
