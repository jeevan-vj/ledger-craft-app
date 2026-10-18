import React, { useCallback, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { EmptyState, GroupedSection, ListRow } from '@/components/ui';
import { NativeHeaderButton } from '@/components/ui/NativeHeaderButton';
import type { MoreStackParamList } from '@/navigation/types';
import { itemService, type Item } from '@/services/itemService';
import { useTheme } from '@/theme';
import { space } from '@/theme/tokens';
import { formatMoney } from '@/utils/money';

type Navigation = NativeStackNavigationProp<MoreStackParamList, 'ItemDetail'>;
type Route = RouteProp<MoreStackParamList, 'ItemDetail'>;
export default function ItemDetailScreen() {
  const theme = useTheme(); const navigation = useNavigation<Navigation>(); const { itemId } = useRoute<Route>().params;
  const [item, setItem] = useState<Item | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null); const [deleting, setDeleting] = useState(false);
  const load = useCallback(async () => { try { setItem(await itemService.fetchItemById(itemId)); setError(null); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Item could not be loaded.'); } finally { setLoading(false); } }, [itemId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useLayoutEffect(() => navigation.setOptions({ title: item?.name || 'Item', headerRight: item ? () => <NativeHeaderButton label="Edit" primary onPress={() => navigation.navigate('ItemEdit', { itemId })} /> : undefined }), [item, itemId, navigation]);
  const remove = () => Alert.alert('Delete item?', 'Existing invoices keep their saved line details. This action cannot be undone.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { setDeleting(true); try { await itemService.deleteItem(itemId); navigation.goBack(); } catch (cause) { Alert.alert('Couldn’t delete item', cause instanceof Error ? cause.message : 'Try again.'); } finally { setDeleting(false); } } }]);
  if (loading) return <View style={[styles.center, { backgroundColor: theme.colors.background }]}><ActivityIndicator color={theme.colors.accent} accessibilityLabel="Loading item details" /></View>;
  if (!item) return <View style={[styles.center, { backgroundColor: theme.colors.background }]}><EmptyState title="Item not found" description={error || 'This item may no longer exist.'} actionLabel="Try again" onAction={() => { setLoading(true); load(); }} /></View>;
  return <ScrollView style={{ backgroundColor: theme.colors.background }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
    <View style={styles.hero}><View style={[styles.icon, { backgroundColor: theme.colors.accentFill }]}><Feather name={item.type === 'product' ? 'box' : 'tool'} size={30} color={theme.colors.accentText} /></View><Text style={[theme.type.title, styles.centerText]}>{item.name}</Text><Text style={[theme.type.caption, { color: item.isActive === false ? theme.colors.textTertiary : theme.colors.accentText }]}>{item.isActive === false ? 'INACTIVE' : 'ACTIVE'} {item.type.toUpperCase()}</Text></View>
    {error ? <Pressable onPress={load} accessibilityRole="button" style={[styles.banner, { backgroundColor: theme.colors.warningFill }]}><Text style={[theme.type.footnote, { color: theme.colors.warning }]}>{error} Tap to retry.</Text></Pressable> : null}
    <GroupedSection title="Details"><ListRow label="Category" value={item.category?.name} placeholder="Uncategorised" showChevron={false} /><ListRow label="Unit" value={item.unit} showChevron={false} />{item.description ? <ListRow label="Description" subtitle={item.description} showChevron={false} /> : null}</GroupedSection>
    <GroupedSection title="Pricing"><ListRow label="Sale price" value={item.salePrice == null ? undefined : formatMoney(item.salePrice)} placeholder="Not enabled" showChevron={false} /><ListRow label="Purchase price" value={item.purchasePrice == null ? undefined : formatMoney(item.purchasePrice)} placeholder="Not enabled" showChevron={false} /><ListRow label="Tax rate" value={item.taxRate == null ? undefined : `${item.taxRate}%`} placeholder="None" showChevron={false} /></GroupedSection>
    <Pressable onPress={remove} disabled={deleting} accessibilityRole="button" accessibilityLabel="Delete item" accessibilityState={{ disabled: deleting, busy: deleting }} style={styles.delete}><Text style={[theme.type.callout, { color: theme.colors.danger }]}>{deleting ? 'Deleting…' : 'Delete item'}</Text></Pressable>
  </ScrollView>;
}
const styles = StyleSheet.create({ center: { flex: 1, alignItems: 'center', justifyContent: 'center' }, content: { padding: space.screen, paddingBottom: 48 }, hero: { alignItems: 'center', marginBottom: space.xxl }, icon: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', marginBottom: space.md }, centerText: { textAlign: 'center', marginBottom: space.xs }, banner: { padding: space.md, borderRadius: 16, marginBottom: space.lg }, delete: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: space.lg } });
