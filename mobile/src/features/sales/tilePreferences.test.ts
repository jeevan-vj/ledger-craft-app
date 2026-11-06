import * as SecureStore from 'expo-secure-store';
import { loadTilePreferences, saveTilePreferences, orderTileSections } from './tilePreferences';

const memory = new Map<string, string>();
beforeEach(() => {
  memory.clear();
  jest.mocked(SecureStore.getItemAsync).mockImplementation(async (key) => memory.get(key) ?? null);
  jest.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => { memory.set(key, value); });
});

it('persists favourites and order on the device and removes invalid duplicate ids', async () => {
  await saveTilePreferences({ favourites: ['pie', 'pie'], order: ['roll', 'pie', 'roll'] });
  expect(await loadTilePreferences()).toEqual({ favourites: ['pie'], order: ['roll', 'pie'] });
});

it('keeps categories and saved order while putting favourites first', () => {
  const item = (id: string) => ({ id, name: id, type: 'product' as const, unit: 'ea', enableSaleInfo: true, enablePurchaseInfo: false });
  const sections = [{ id: 'bakery', name: 'Bakery', color: '#123456', items: [item('pie'), item('roll'), item('bun')] }];
  expect(orderTileSections(sections, { favourites: ['roll'], order: ['bun', 'roll', 'pie'] }).map((s) => [s.name, s.items.map((i) => i.id)])).toEqual([
    ['Favourites', ['roll']], ['Bakery', ['bun', 'pie']],
  ]);
});

it('reports unavailable storage instead of silently overwriting saved preferences', async () => {
  jest.mocked(SecureStore.getItemAsync).mockRejectedValueOnce(new Error('locked'));
  await expect(loadTilePreferences()).rejects.toThrow('locked');
});
