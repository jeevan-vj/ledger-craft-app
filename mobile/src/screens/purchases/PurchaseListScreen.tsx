import React, { useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppPressable } from '@/components/ui/AppPressable';
import { EmptyState } from '@/components/ui/EmptyState';
import { FilterPills } from '@/components/ui/FilterPills';
import { NativeHeaderButton } from '@/components/ui/NativeHeaderButton';
import { purchasesApi, type BillDto, type VendorDto } from '@/features/purchases/api/purchasesApi';
import type { PurchaseStackParamList, RootStackParamList } from '@/navigation/types';
import { control, hairline, radius, space } from '@/theme/tokens';
import { formatMoney } from '@/utils/money';
import { useTheme } from '@/theme';
import { useTabScreenInsets } from '@/hooks/useTabScreenInsets';
import { canImportInvoices } from '@/features/auth/invoiceAccess';
import { useStore } from '@/store';

type Navigation = NativeStackNavigationProp<PurchaseStackParamList, 'PurchaseList'>;
type Mode = 'bills' | 'vendors';

export default function PurchaseListScreen() {
  const theme = useTheme();
  const { colors: palette } = theme;
  const styles = createStyles(theme);
  const { bottomPadding } = useTabScreenInsets();
  const navigation = useNavigation<Navigation>();
  const canImport = useStore((state) => canImportInvoices(state.permissions));
  const [mode, setMode] = useState<Mode>('bills');
  const [search, setSearch] = useState('');
  const bills = useQuery({ queryKey: ['purchases', 'bills'], queryFn: purchasesApi.listBills });
  const vendors = useQuery({ queryKey: ['purchases', 'vendors'], queryFn: purchasesApi.listVendors });
  const activeQuery = mode === 'bills' ? bills : vendors;

  useLayoutEffect(() => {
    navigation.setOptions({
      headerSearchBarOptions: Platform.OS === 'ios' ? {
        placeholder: `Search ${mode}`,
        hideWhenScrolling: true,
        onChangeText: (event) => setSearch(event.nativeEvent.text),
      } : undefined,
      headerRight: () => mode === 'bills' ? <View style={styles.headerActions}>
        {canImport ? <NativeHeaderButton label="Import" accessibilityHint="Imports a PDF or photo as a draft" onPress={() => (navigation.getParent()?.getParent() as NavigationProp<RootStackParamList> | undefined)?.navigate('ImportCapture', { entry: 'purchases' })} /> : null}
        <NativeHeaderButton label="New" primary accessibilityHint="Creates a supplier bill" onPress={() => navigation.navigate('BillCreate')} />
      </View> : null,
    });
  }, [canImport, mode, navigation]);

  const billRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (bills.data ?? []).filter((bill) => !needle ||
      [bill.billNumber, bill.vendorName, bill.vendorReference]
        .some((value) => value?.toLowerCase().includes(needle)));
  }, [bills.data, search]);

  const vendorRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (vendors.data ?? []).filter((vendor) => !needle ||
      [vendor.name, vendor.email, vendor.phone]
        .some((value) => value?.toLowerCase().includes(needle)));
  }, [search, vendors.data]);

  if (activeQuery.data === undefined && activeQuery.isLoading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={palette.accent} /></View>;
  }

  const error = activeQuery.error instanceof Error ? activeQuery.error.message : null;
  const rows = mode === 'bills' ? billRows : vendorRows;

  return (
    <View style={styles.container}>
      {Platform.OS === 'android' ? (
        <View style={styles.search}>
          <Feather name="search" size={18} color={palette.textTertiary} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={`Search ${mode}`}
            placeholderTextColor={palette.textTertiary}
            style={styles.searchInput}
            accessibilityLabel={`Search ${mode}`}
          />
        </View>
      ) : null}
      <FilterPills options={['bills', 'vendors'] as const} value={mode} onChange={(next) => { setMode(next); setSearch(''); }} />
      {error && activeQuery.data !== undefined ? (
        <Pressable style={styles.banner} onPress={() => activeQuery.refetch()} accessibilityRole="button" accessibilityLabel="Refresh failed" accessibilityHint="Retries loading purchases">
          <Text style={styles.bannerText}>Couldn’t refresh. Showing saved data. Tap to retry.</Text>
        </Pressable>
      ) : null}
      <FlatList<BillDto | VendorDto>
        data={rows}
        key={`${mode}-${rows.length}`}
        keyExtractor={(item) => item.id}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}
        refreshControl={<RefreshControl refreshing={activeQuery.isRefetching} onRefresh={() => activeQuery.refetch()} tintColor={palette.accent} colors={[palette.accent]} />}
        renderItem={({ item, index }) => mode === 'bills' ? (
          <BillRow
            bill={item as BillDto}
            first={index === 0}
            last={index === rows.length - 1}
            onPress={() => navigation.navigate('BillDetail', { billId: item.id })}
          />
        ) : (
          <VendorRow vendor={item as VendorDto} first={index === 0} last={index === rows.length - 1} />
        )}
        ListEmptyComponent={
          <EmptyState
            title={error ? `Couldn’t load ${mode}` : search ? `No matching ${mode}` : mode === 'bills' ? 'No supplier bills yet' : 'No vendors yet'}
            description={error ?? (search ? 'Try a different search.' : mode === 'bills' ? 'Create a draft, then receive it when it is ready for the ledger.' : 'Add vendors on the web or while creating purchase records.')}
            actionLabel={error ? 'Try again' : mode === 'bills' && !search ? 'Create bill' : undefined}
            onAction={error ? () => activeQuery.refetch() : mode === 'bills' && !search ? () => navigation.navigate('BillCreate') : undefined}
          />
        }
      />
    </View>
  );
}

function BillRow({ bill, first, last, onPress }: { bill: BillDto; first: boolean; last: boolean; onPress: () => void }) {
  const theme = useTheme();
  const { colors: palette } = theme;
  const styles = createStyles(theme);
  const statusColor: Record<BillDto['displayStatus'], string> = {
    draft: palette.textSecondary,
    received: palette.info,
    overdue: palette.danger,
    partial: palette.warning,
    paid: palette.success,
    void: palette.textTertiary,
    cancelled: palette.danger,
  };
  return (
    <AppPressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${bill.vendorName}, ${bill.billNumber}, ${formatMoney(bill.balanceDue, bill.currency)} due`}
      accessibilityHint="Opens bill details"
      style={({ pressed }) => [styles.row, first && styles.first, last && styles.last, pressed && styles.pressed]}
    >
      <View style={[styles.iconWell, { backgroundColor: `${statusColor[bill.displayStatus]}18` }]}>
        <Feather name="file-text" size={18} color={statusColor[bill.displayStatus]} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle} numberOfLines={1}>{bill.vendorName}</Text>
        <Text style={styles.rowSubtitle} numberOfLines={1}>{bill.billNumber} · due {formatDate(bill.dueDate)}</Text>
      </View>
      <View style={styles.amountCopy}>
        <Text style={styles.amount}>{formatMoney(bill.balanceDue, bill.currency)}</Text>
        <Text style={[styles.status, { color: statusColor[bill.displayStatus] }]}>{bill.displayStatus}</Text>
      </View>
      <Feather name="chevron-right" size={18} color={palette.textTertiary} />
    </AppPressable>
  );
}

function VendorRow({ vendor, first, last }: { vendor: VendorDto; first: boolean; last: boolean }) {
  const theme = useTheme();
  const { colors: palette } = theme;
  const styles = createStyles(theme);
  return (
    <View style={[styles.row, first && styles.first, last && styles.last]} accessible accessibilityLabel={`${vendor.name}, ${vendor.isActive ? 'active' : 'inactive'} vendor`}>
      <View style={styles.vendorAvatar}><Text style={styles.vendorInitial}>{vendor.name.slice(0, 1).toUpperCase()}</Text></View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle} numberOfLines={1}>{vendor.name}</Text>
        <Text style={styles.rowSubtitle} numberOfLines={1}>{vendor.email ?? `${vendor.paymentTermDays} day payment terms`}</Text>
      </View>
      <Text style={[styles.status, { color: vendor.isActive ? palette.success : palette.textTertiary }]}>{vendor.isActive ? 'active' : 'inactive'}</Text>
    </View>
  );
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' });
}

const createStyles = ({ colors: palette, type }: ReturnType<typeof useTheme>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.background },
  content: { paddingHorizontal: space.screen, paddingTop: space.sm, paddingBottom: 40, flexGrow: 1 },
  search: { marginHorizontal: space.screen, marginTop: space.sm, minHeight: control.touchTarget, borderRadius: radius.md, backgroundColor: palette.fill, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, gap: space.sm },
  searchInput: { ...type.body, flex: 1 },
  banner: { marginHorizontal: space.screen, marginBottom: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: palette.warningFill },
  bannerText: { ...type.footnote, color: palette.text },
  row: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, backgroundColor: palette.surface, borderBottomWidth: hairline, borderBottomColor: palette.separator },
  first: { borderTopLeftRadius: radius.group, borderTopRightRadius: radius.group },
  last: { borderBottomLeftRadius: radius.group, borderBottomRightRadius: radius.group, borderBottomWidth: 0 },
  pressed: { backgroundColor: palette.fillMuted },
  iconWell: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  vendorAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: palette.accentFill, alignItems: 'center', justifyContent: 'center' },
  vendorInitial: { ...type.headline, color: palette.accentText },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: { ...type.callout, color: palette.text, fontWeight: '600' },
  rowSubtitle: { ...type.footnote, marginTop: 2 },
  amountCopy: { alignItems: 'flex-end' },
  amount: { ...type.callout, color: palette.text, fontVariant: ['tabular-nums'] },
  status: { ...type.caption, marginTop: 2, textTransform: 'capitalize' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
