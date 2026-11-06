import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { onlineManager, useQuery } from '@tanstack/react-query';
import { AppPressable } from '@/components/ui/AppPressable';
import { EmptyState } from '@/components/ui/EmptyState';
import { SelectionRow, SelectionSheet } from '@/components/ui/SelectionSheet';
import { SaleTileGrid } from '@/components/sales/SaleTileGrid';
import { CartDrawer } from '@/components/sales/CartDrawer';
import { ChargeSheet } from '@/components/sales/ChargeSheet';
import { CustomAmountSheet, QuantitySheet } from '@/components/sales/SaleLineSheets';
import { customersApi, type MobileCustomerDto } from '@/features/customers/api/customersApi';
import { itemsApi } from '@/features/items/api/itemsApi';
import { OFFLINE_SALE_MESSAGE } from '@/features/sales/saleAttempt';
import {
  cartTotal,
  groupSaleTiles,
  lineKey,
  quantityForItem,
} from '@/features/sales/saleCart';
import {
  addCatalogItemToDraft,
  addCustomAmountToDraft,
  confirmSale,
  dismissChargeSheet,
  dismissSaleSuccess,
  hydrateSaleSession,
  retrySaleHydrate,
  openChargeSheet,
  removeSaleLine,
  setCartOpen,
  setCustomOpen,
  setCustomerOpen,
  setQuantityKey,
  setSaleCustomer,
  setSalePaymentMethod,
  setSaleReference,
  setSaleTendered,
  updateSaleLinePrice,
  updateSaleLineQuantity,
  useSaleUi,
} from '@/features/sales/saleSession';
import { SaleSuccessState } from '@/screens/sales/SaleSuccessState';
import { control, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme';
import { useTabScreenInsets } from '@/hooks/useTabScreenInsets';
import { formatMoney } from '@/utils/money';

export default function SellScreen() {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { tabBarClearance } = useTabScreenInsets();
  const { width } = useWindowDimensions();
  const ui = useSaleUi();
  const [search, setSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [online, setOnline] = useState(onlineManager.isOnline());
  const [barHeight, setBarHeight] = useState(0);
  const itemsQuery = useQuery({ queryKey: ['items', 'sell'], queryFn: () => itemsApi.list() });
  const customersQuery = useQuery({
    queryKey: ['customers', 'sell'],
    queryFn: () => customersApi.list(),
    enabled: ui.customerOpen,
  });

  useEffect(() => {
    void hydrateSaleSession();
  }, []);
  useEffect(() => onlineManager.subscribe(setOnline), []);

  if (ui.completed) return <SaleSuccessState sale={ui.completed} onDone={dismissSaleSuccess} />;
  if (ui.hydrateError) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>{ui.hydrateError}</Text>
        <AppPressable accessibilityRole="button" accessibilityLabel="Try again" onPress={() => { void retrySaleHydrate(); }} style={styles.charge}>
          <Text style={styles.chargeText}>Try again</Text>
        </AppPressable>
      </View>
    );
  }
  if (!ui.ready) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={theme.colors.accent} />
        <Text style={styles.loadingText}>Loading sell</Text>
      </View>
    );
  }

  const sections = groupSaleTiles(itemsQuery.data?.items ?? [], search);
  const total = cartTotal(ui.draft.lines);
  const chargeDisabled = !online || ui.draft.lines.length === 0 || ui.submitting;
  const quantityLine = ui.draft.lines.find((line) => lineKey(line) === ui.quantityKey) ?? null;
  const customers = (customersQuery.data ?? []).filter((customer) => {
    const query = customerSearch.trim().toLowerCase();
    return !query || customer.name.toLowerCase().includes(query);
  });
  const tileWidth = Math.max(140, (width - space.screen * 2 - space.sm) / 2);

  const chooseCustomer = (customer: MobileCustomerDto | null) => {
    setSaleCustomer(customer);
    setCustomerSearch('');
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: barHeight + space.lg }}
      >
        <TextInput
          accessibilityLabel="Search items"
          value={search}
          onChangeText={setSearch}
          placeholder="Search items"
          placeholderTextColor={theme.colors.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.search}
        />
        <AppPressable accessibilityRole="button" accessibilityLabel="Custom amount" onPress={() => setCustomOpen(true)} style={({ pressed }) => [styles.custom, pressed && styles.pressed]}>
          <Text style={styles.customText}>Custom amount</Text>
        </AppPressable>
        {itemsQuery.isLoading ? <ActivityIndicator color={theme.colors.accent} accessibilityLabel="Loading items" /> : null}
        {itemsQuery.isError ? (
          <EmptyState title="Couldn't load items" description="Pull to retry once you're back online." actionLabel="Try again" onAction={() => { void itemsQuery.refetch(); }} />
        ) : null}
        {!itemsQuery.isLoading && !itemsQuery.isError && sections.length === 0 ? (
          <EmptyState title="No items with a sale price" description="Add a sale price to an item to sell it here." />
        ) : null}
        <SaleTileGrid
          sections={sections}
          tileWidth={tileWidth}
          quantityForItem={(id) => quantityForItem(ui.draft, id)}
          onAdd={addCatalogItemToDraft}
          onQuantity={(item) => {
            if (!quantityForItem(ui.draft, item.id)) addCatalogItemToDraft(item);
            setQuantityKey(item.id);
          }}
        />
      </ScrollView>
      <View
        onLayout={(event) => setBarHeight(event.nativeEvent.layout.height)}
        style={[styles.bar, { paddingBottom: tabBarClearance + space.sm }]}
      >
        {!online ? <Text style={styles.offline}>{OFFLINE_SALE_MESSAGE}</Text> : null}
        {ui.actionError ? <Text style={styles.actionError}>{ui.actionError}</Text> : null}
        {ui.formError && !ui.chargeOpen ? <Text style={styles.actionError}>{ui.formError}</Text> : null}
        <View style={styles.barRow}>
          <AppPressable accessibilityRole="button" accessibilityLabel={`Cart, ${formatMoney(total)}`} onPress={() => setCartOpen(true)} style={({ pressed }) => [styles.cartButton, pressed && styles.pressed]}>
            <Text style={styles.cartText}>Cart</Text>
            <Text style={styles.cartTotal}>{formatMoney(total)}</Text>
          </AppPressable>
          <AppPressable
            accessibilityRole="button"
            accessibilityLabel="Charge"
            accessibilityState={{ disabled: chargeDisabled }}
            disabled={chargeDisabled}
            onPress={openChargeSheet}
            style={({ pressed }) => [styles.charge, chargeDisabled && styles.disabled, pressed && !chargeDisabled && styles.pressed]}
          >
            <Text style={styles.chargeText}>Charge</Text>
          </AppPressable>
        </View>
      </View>
      {ui.cartOpen ? (
        <CartDrawer
          visible
          draft={ui.draft}
          onClose={() => setCartOpen(false)}
          onRemove={removeSaleLine}
          onAddCustomer={() => setCustomerOpen(true)}
          onClearCustomer={() => setSaleCustomer(null)}
        />
      ) : null}
      {ui.customerOpen ? (
        <SelectionSheet
          visible
          title="Choose customer"
          searchPlaceholder="Search customers"
          searchQuery={customerSearch}
          onSearchChange={setCustomerSearch}
          onClose={() => { setCustomerOpen(false); setCustomerSearch(''); }}
          loading={customersQuery.isLoading}
          empty={!customersQuery.isLoading && customers.length === 0}
          emptyTitle="No customers"
          emptyDescription="The sale stays on the walk-in customer."
        >
          <SelectionRow title="Walk-in customer" selected={!ui.draft.customerId} onPress={() => chooseCustomer(null)} />
          {customers.map((customer) => (
            <SelectionRow
              key={customer.id}
              title={customer.name}
              subtitle={customer.email || undefined}
              selected={customer.id === ui.draft.customerId}
              onPress={() => chooseCustomer(customer)}
            />
          ))}
        </SelectionSheet>
      ) : null}
      {ui.customOpen ? (
        <CustomAmountSheet visible onClose={() => setCustomOpen(false)} onAdd={addCustomAmountToDraft} />
      ) : null}
      {quantityLine ? (
        <QuantitySheet
          line={quantityLine}
          onClose={() => setQuantityKey(null)}
          onSave={quantityLine.kind === 'custom' ? updateSaleLinePrice : updateSaleLineQuantity}
          onRemove={(key) => { removeSaleLine(key); setQuantityKey(null); }}
        />
      ) : null}
      {ui.chargeOpen ? (
        <ChargeSheet
          visible
          total={total}
          paymentMethod={ui.paymentMethod}
          referenceNumber={ui.referenceNumber}
          tendered={ui.tendered}
          submitting={ui.submitting}
          online={online}
          formError={ui.formError}
          onMethod={setSalePaymentMethod}
          onReference={setSaleReference}
          onTendered={setSaleTendered}
          onConfirm={() => { void confirmSale(); }}
          onClose={() => { dismissChargeSheet(); }}
        />
      ) : null}
    </View>
  );
}

const createStyles = ({ colors, type }: ReturnType<typeof useTheme>) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, backgroundColor: colors.background },
  loadingText: { ...type.subhead },
  search: {
    minHeight: control.default,
    marginHorizontal: space.screen,
    marginTop: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.fill,
    color: colors.text,
    paddingHorizontal: space.lg,
    fontSize: 17,
  },
  custom: {
    minHeight: control.default,
    marginHorizontal: space.screen,
    marginTop: space.sm,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.fill,
  },
  customText: { ...type.callout },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.screen,
    paddingTop: space.sm,
    backgroundColor: colors.background,
    gap: space.xs,
  },
  barRow: { flexDirection: 'row', gap: space.sm },
  offline: { ...type.footnote, color: colors.warning },
  actionError: { ...type.footnote, color: colors.danger },
  cartButton: {
    flex: 1,
    minHeight: control.prominent,
    borderRadius: radius.pill,
    backgroundColor: colors.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartText: { ...type.footnote },
  cartTotal: { ...type.headline },
  charge: {
    flex: 1,
    minHeight: control.prominent,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chargeText: { ...type.headline, color: colors.accentForeground },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.78 },
});
