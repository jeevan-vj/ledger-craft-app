import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { EmptyState, FilterPills, ListRow } from '@/components/ui';
import { NativeHeaderButton } from '@/components/ui/NativeHeaderButton';
import type { MoreStackParamList } from '@/navigation/types';
import { itemService, type Item } from '@/services/itemService';
import { useTheme } from '@/theme';
import { formatMoney } from '@/utils/money';

type Navigation = NativeStackNavigationProp<MoreStackParamList, 'ItemList'>;
type Filter = 'all' | 'product' | 'service' | 'inactive';

export default function ItemListScreen() {
  const theme = useTheme();
  const navigation = useNavigation<Navigation>();
  const [items, setItems] = useState<Item[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setItems(await itemService.fetchItems()); setError(null); }
    catch { setError('Items could not be loaded.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useLayoutEffect(() => navigation.setOptions({
    headerRight: () => <NativeHeaderButton label="New" primary accessibilityHint="Creates an item" onPress={() => navigation.navigate('ItemCreate')} />,
  }), [navigation]);
  const visible = useMemo(() => items.filter((item) => {
    if (filter === 'inactive') return item.isActive === false;
    if (item.isActive === false) return false;
    return filter === 'all' || item.type === filter;
  }), [filter, items]);

  if (loading) return <View style={[styles.center, { backgroundColor: theme.colors.background }]}><ActivityIndicator color={theme.colors.accent} accessibilityLabel="Loading items" /></View>;
  return <FlatList
    style={{ backgroundColor: theme.colors.background }}
    contentContainerStyle={styles.content}
    data={visible}
    keyExtractor={(item) => item.id}
    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.colors.accent} />}
    ListHeaderComponent={<View><FilterPills options={['all', 'product', 'service', 'inactive'] as const} value={filter} onChange={setFilter} />{error && items.length ? <Pressable onPress={load} accessibilityRole="button" style={styles.retry}><Text style={[theme.type.subhead, { color: theme.colors.danger }]}>{error} Tap to retry.</Text></Pressable> : null}</View>}
    renderItem={({ item, index }) => <View style={{ borderBottomWidth: index === visible.length - 1 ? 0 : StyleSheet.hairlineWidth, borderBottomColor: theme.colors.separator }}>
      <ListRow
        label={item.name}
        subtitle={`${item.type === 'product' ? 'Product' : 'Service'} · ${item.category?.name || 'Uncategorised'}${item.isActive === false ? ' · Inactive' : ''}`}
        value={item.salePrice == null ? undefined : formatMoney(item.salePrice)}
        icon={<Feather name={item.type === 'product' ? 'box' : 'tool'} size={18} color={theme.colors.accentText} />}
        onPress={() => navigation.navigate('ItemDetail', { itemId: item.id })}
        accessibilityHint="Opens item details"
      />
    </View>}
    ListEmptyComponent={<EmptyState title={error ? 'Unable to load items' : filter === 'all' ? 'No items yet' : `No ${filter} items`} description={error || 'Add products and services to reuse on invoices.'} actionLabel={error ? 'Try again' : 'Add item'} onAction={error ? load : () => navigation.navigate('ItemCreate')} />}
  />;
}

const styles = StyleSheet.create({ center: { flex: 1, alignItems: 'center', justifyContent: 'center' }, content: { paddingBottom: 40, flexGrow: 1 }, retry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 20 } });
