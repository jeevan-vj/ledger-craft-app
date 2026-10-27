import * as SecureStore from 'expo-secure-store';
import { emptySaleDraft } from './saleCart';
import {
  clearSaleAttempt,
  loadQuickSaleEnabled,
  loadSaleAttempt,
  loadSaleDraft,
  saveQuickSaleEnabled,
  saveSaleAttempt,
  saveSaleDraft,
} from './saleStorage';

const memory = new Map<string, string>();

describe('sale storage', () => {
  beforeEach(() => {
    memory.clear();
    (SecureStore.getItemAsync as jest.Mock).mockImplementation(async (key: string) => memory.get(key) ?? null);
    (SecureStore.setItemAsync as jest.Mock).mockImplementation(async (key: string, value: string) => {
      memory.set(key, value);
    });
    (SecureStore.deleteItemAsync as jest.Mock).mockImplementation(async (key: string) => {
      memory.delete(key);
    });
  });

  it('keeps quick sale off until the device switch is turned on', async () => {
    expect(await loadQuickSaleEnabled()).toBe(false);
    await saveQuickSaleEnabled(true);
    expect(await loadQuickSaleEnabled()).toBe(true);
    await saveQuickSaleEnabled(false);
    expect(await loadQuickSaleEnabled()).toBe(false);
    expect(memory.has('ledgercraft.quickSale.enabled')).toBe(false);
  });

  it('round-trips the cart and ignores a corrupt draft', async () => {
    const draft = {
      ...emptySaleDraft(),
      lines: [{ kind: 'catalog' as const, itemId: '11111111-1111-4111-8111-111111111111', name: 'Pie', quantity: '2.00', price: '4.50' }],
      customerId: null,
      customerName: null,
    };
    await saveSaleDraft(draft);
    expect(await loadSaleDraft()).toEqual(draft);
    memory.set('ledgercraft.quickSale.draft', '{');
    expect(await loadSaleDraft()).toEqual(emptySaleDraft());
  });

  it('round-trips the pending charge key and clears it', async () => {
    const attempt = {
      fingerprint: 'body',
      key: 'key-1',
      paymentMethod: 'cash' as const,
      referenceNumber: '',
      tendered: '20.00',
    };
    await saveSaleAttempt(attempt);
    expect(await loadSaleAttempt()).toEqual(attempt);
    await clearSaleAttempt();
    expect(await loadSaleAttempt()).toBeNull();
    memory.set('ledgercraft.quickSale.attempt', 'nope');
    expect(await loadSaleAttempt()).toBeNull();
  });
});
