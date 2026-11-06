import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { SaleTileSection } from './saleCart';

const KEY = 'ledgercraft.quickSale.tiles';
export interface TilePreferences { favourites: string[]; order: string[] }
export const emptyTilePreferences = (): TilePreferences => ({ favourites: [], order: [] });

function ids(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string' && id.length > 0))] : [];
}
function clean(value: Partial<TilePreferences> | null): TilePreferences {
  return { favourites: ids(value?.favourites), order: ids(value?.order) };
}
export async function loadTilePreferences(): Promise<TilePreferences> {
  const value = Platform.OS === 'web' ? globalThis.localStorage.getItem(KEY) : await SecureStore.getItemAsync(KEY);
  if (!value) return emptyTilePreferences();
  try { return clean(JSON.parse(value)); } catch { return emptyTilePreferences(); }
}
export async function saveTilePreferences(value: TilePreferences): Promise<void> {
  const encoded = JSON.stringify(clean(value));
  if (Platform.OS === 'web') globalThis.localStorage.setItem(KEY, encoded);
  else await SecureStore.setItemAsync(KEY, encoded);
}

export function orderTileSections(sections: SaleTileSection[], preferences: TilePreferences): SaleTileSection[] {
  const rank = new Map(preferences.order.map((id, index) => [id, index]));
  const sort = (items: SaleTileSection['items']) => [...items].sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity));
  const favourites = new Set(preferences.favourites);
  const favouriteItems = sort(sections.flatMap((section) => section.items).filter((item) => favourites.has(item.id)));
  const remaining = sections.map((section) => ({ ...section, items: sort(section.items.filter((item) => !favourites.has(item.id))) })).filter((section) => section.items.length > 0);
  return favouriteItems.length ? [{ id: 'favourites', name: 'Favourites', color: null, items: favouriteItems }, ...remaining] : remaining;
}
