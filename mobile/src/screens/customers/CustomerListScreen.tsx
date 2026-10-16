import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { customerService, type Customer } from '@/services/customerService';
import { DashedSetupCard, ListRow } from '@/components/ui';
import { useTheme } from '@/theme';

export default function CustomerListScreen() {
  const theme = useTheme();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setCustomers(await customerService.fetchCustomers()); setError(null); }
    catch { setError('Customers could not be loaded. Pull to retry.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <View style={[styles.center, { backgroundColor: theme.colors.background }]}><ActivityIndicator color={theme.colors.accent} /></View>;
  return <FlatList
    style={{ backgroundColor: theme.colors.background }}
    contentContainerStyle={styles.content}
    data={customers}
    keyExtractor={(item) => item.id}
    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.colors.accent} />}
    renderItem={({ item, index }) => <View style={{ borderBottomWidth: index === customers.length - 1 ? 0 : StyleSheet.hairlineWidth, borderBottomColor: theme.colors.separator }}><ListRow label={item.name} subtitle={[item.email, item.phone].filter(Boolean).join(' · ') || 'No contact details'} icon={<Text style={{ color: theme.colors.accentText, fontWeight: '800' }}>{item.name.slice(0, 1).toUpperCase()}</Text>} showChevron={false} /></View>}
    ListHeaderComponent={customers.length ? <Text style={[theme.type.subhead, { marginBottom: 12 }]}>People and businesses you invoice</Text> : null}
    ListEmptyComponent={<DashedSetupCard icon={error ? 'wifi-off' : 'users'} title={error ? 'Unable to load customers' : 'No customers yet'} description={error || 'Customers you add while creating invoices will appear here.'} />}
  />;
}

const styles = StyleSheet.create({ center: { flex: 1, alignItems: 'center', justifyContent: 'center' }, content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 } });
