import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { AppPressable } from '@/components/ui/AppPressable';
import type { CatalogItem } from '@/features/items/api/itemsApi';
import { displayQuantity, type SaleTileSection } from '@/features/sales/saleCart';
import { emptyTilePreferences, loadTilePreferences, orderTileSections, saveTilePreferences, type TilePreferences } from '@/features/sales/tilePreferences';
import { useTheme } from '@/theme';
import { control, radius, space } from '@/theme/tokens';
import { formatMoney } from '@/utils/money';

type Props = {
  sections: SaleTileSection[];
  tileWidth: number;
  quantityForItem: (id: string) => string | null;
  onAdd: (item: CatalogItem) => void;
  onQuantity: (item: CatalogItem) => void;
};

export function SaleTileGrid({ sections, tileWidth, quantityForItem, onAdd, onQuantity }: Props) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const [preferences, setPreferences] = useState(emptyTilePreferences);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [arranging, setArranging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    try { setPreferences(await loadTilePreferences()); setReady(true); setError(null); }
    catch { setError("Couldn't load tile preferences. Try again."); }
  };
  useEffect(() => { void load(); }, []);
  const save = async (next: TilePreferences) => {
    if (saving || !ready) return;
    setSaving(true);
    try { await saveTilePreferences(next); setPreferences(next); setError(null); }
    catch { setError("Couldn't save tile preferences. Try again."); }
    finally { setSaving(false); }
  };
  const orderedSections = orderTileSections(sections, preferences);
  const move = (items: CatalogItem[], index: number, delta: number) => {
    const moved = items.map((item) => item.id);
    [moved[index], moved[index + delta]] = [moved[index + delta], moved[index]];
    const ids = new Set(moved);
    void save({ ...preferences, order: [...moved, ...preferences.order.filter((id) => !ids.has(id))] });
  };

  return <View>
    {sections.length > 0 ? <View style={styles.toolbar}>
      <AppPressable accessibilityRole="button" accessibilityLabel={arranging ? 'Done arranging' : 'Arrange tiles'} disabled={!ready || saving} accessibilityState={{ disabled: !ready || saving }} onPress={() => setArranging(!arranging)} style={styles.action}>
        <Text style={styles.actionText}>{arranging ? 'Done arranging' : 'Arrange tiles'}</Text>
      </AppPressable>
      {saving ? <ActivityIndicator accessibilityLabel="Saving tile preferences" color={theme.colors.accent} /> : null}
    </View> : null}
    {error ? <View style={styles.errorWrap}>
      <Text style={styles.error} accessibilityRole="alert">{error}</Text>
      {!ready ? <AppPressable accessibilityRole="button" accessibilityLabel="Retry tile preferences" onPress={() => { void load(); }} style={styles.action}><Text style={styles.actionText}>Try again</Text></AppPressable> : null}
    </View> : null}
    {orderedSections.map((section) => <View key={section.id} style={styles.section}>
      <View style={styles.sectionHeader} accessibilityLabel={`Category ${section.name}`}>
        <View style={[styles.swatch, { backgroundColor: section.color ?? theme.colors.accent }]} />
        <Text style={styles.sectionTitle}>{section.name}</Text>
      </View>
      <View style={styles.grid}>{section.items.map((item, index) => {
        const quantity = quantityForItem(item.id);
        const price = typeof item.salePrice === 'string' ? formatMoney(item.salePrice) : '';
        const label = `${item.name}, ${price} including GST${quantity ? `, ${displayQuantity(quantity)} in cart` : ''}`;
        const favourite = preferences.favourites.includes(item.id);
        return <View key={item.id} style={{ width: tileWidth }}>
          <AppPressable accessibilityRole="button" accessibilityLabel={label}
            onPress={() => onAdd(item)}
            onLongPress={() => onQuantity(item)}
            style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
            <Text style={styles.tileName}>{item.name}</Text>
            <Text style={styles.tilePrice}>{price}</Text>
            {quantity ? <Text style={styles.badge}>{displayQuantity(quantity)}</Text> : null}
          </AppPressable>
          {arranging ? <View style={styles.controls}>
            <AppPressable accessibilityRole="button" accessibilityLabel={`${favourite ? 'Remove' : 'Add'} ${item.name} ${favourite ? 'from' : 'to'} favourites`} disabled={saving} accessibilityState={{ disabled: saving, selected: favourite }} onPress={() => { void save({ ...preferences, favourites: favourite ? preferences.favourites.filter((id) => id !== item.id) : [...preferences.favourites, item.id] }); }} style={styles.iconAction}>
              <Feather name="star" size={20} color={favourite ? theme.colors.accentText : theme.colors.textSecondary} />
            </AppPressable>
            <AppPressable accessibilityRole="button" accessibilityLabel={`Move ${item.name} earlier`} disabled={saving || index === 0} accessibilityState={{ disabled: saving || index === 0 }} onPress={() => move(section.items, index, -1)} style={[styles.iconAction, index === 0 && styles.disabled]}><Feather name="arrow-up" size={20} color={theme.colors.text} /></AppPressable>
            <AppPressable accessibilityRole="button" accessibilityLabel={`Move ${item.name} later`} disabled={saving || index === section.items.length - 1} accessibilityState={{ disabled: saving || index === section.items.length - 1 }} onPress={() => move(section.items, index, 1)} style={[styles.iconAction, index === section.items.length - 1 && styles.disabled]}><Feather name="arrow-down" size={20} color={theme.colors.text} /></AppPressable>
          </View> : null}
        </View>;
      })}</View>
    </View>)}
  </View>;
}

const createStyles = ({ colors, type }: ReturnType<typeof useTheme>) => StyleSheet.create({
  toolbar: { marginHorizontal: space.screen, flexDirection: 'row', alignItems: 'center' },
  action: { minHeight: control.touchTarget, justifyContent: 'center', paddingHorizontal: space.sm },
  actionText: { ...type.callout, color: colors.accentText },
  errorWrap: { marginHorizontal: space.screen },
  error: { ...type.footnote, color: colors.danger },
  section: { marginTop: space.lg, paddingHorizontal: space.screen },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm },
  swatch: { width: space.md, height: space.md, borderRadius: radius.pill },
  sectionTitle: { ...type.section },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: { minHeight: control.default * 2, borderRadius: radius.md, backgroundColor: colors.surface, padding: space.md, justifyContent: 'space-between' },
  tileName: { ...type.headline, paddingRight: space.xxl },
  tilePrice: { ...type.callout, color: colors.textSecondary },
  badge: { position: 'absolute', top: space.sm, right: space.sm, minWidth: space.xxl + space.xs, minHeight: space.xxl + space.xs, borderRadius: radius.pill, backgroundColor: colors.accent, color: colors.accentForeground, textAlign: 'center', lineHeight: space.xxl + space.xs, fontWeight: '700', overflow: 'hidden' },
  controls: { flexDirection: 'row', justifyContent: 'space-between' },
  iconAction: { minWidth: control.touchTarget, minHeight: control.touchTarget, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.35 },
  pressed: { opacity: 0.78 },
});
