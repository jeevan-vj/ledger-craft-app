import * as SecureStore from 'expo-secure-store';
import { waitFor } from '@testing-library/react-native';
import { onlineManager } from '@tanstack/react-query';
import type { CatalogItem } from '@/features/items/api/itemsApi';
import { OFFLINE_SALE_MESSAGE, saleAttemptInFlight } from './saleAttempt';
import {
  addCatalogItemToDraft,
  confirmSale,
  dismissChargeSheet,
  dismissSaleSuccess,
  getSaleUiState,
  hydrateSaleSession,
  openChargeSheet,
  resetSaleSessionForTests,
  retrySaleHydrate,
  setSaleTendered,
  updateSaleLineQuantity,
} from './saleSession';
import { createSale } from './salesApi';
import type { SaleLine } from './saleCart';

jest.mock('./salesApi', () => ({
  createSale: jest.fn(),
  saleReceiptHandoff: (result: {
    invoice: { id: string; invoiceNumber: string };
    payment: { id: string };
    receipt: { id: string };
  }) => ({
    invoiceId: result.invoice.id,
    invoiceNumber: result.invoice.invoiceNumber,
    paymentId: result.payment.id,
    receiptId: result.receipt.id,
  }),
}));

const memory = new Map<string, string>();
const pie: CatalogItem = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Pie',
  type: 'product',
  enableSaleInfo: true,
  enablePurchaseInfo: false,
  unit: 'ea',
  isActive: true,
  salePrice: '4.50',
  categoryId: null,
  category: null,
};

const sale = {
  invoice: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', invoiceNumber: 'INV-2041', total: '13.50', status: 'paid' },
  payment: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', amount: '13.50', paymentMethod: 'cash', status: 'completed' },
  receipt: { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' },
};

describe('sale session', () => {
  beforeEach(async () => {
    memory.clear();
    resetSaleSessionForTests();
    onlineManager.setOnline(true);
    (SecureStore.getItemAsync as jest.Mock).mockImplementation(async (key: string) => memory.get(key) ?? null);
    (SecureStore.setItemAsync as jest.Mock).mockImplementation(async (key: string, value: string) => {
      memory.set(key, value);
    });
    (SecureStore.deleteItemAsync as jest.Mock).mockImplementation(async (key: string) => {
      memory.delete(key);
    });
    jest.mocked(createSale).mockReset();
    await hydrateSaleSession();
  });

  function addPies(count: number) {
    for (let index = 0; index < count; index += 1) addCatalogItemToDraft(pie);
  }

  function catalogLineName(line: SaleLine | undefined): string | undefined {
    return line?.kind === 'catalog' ? line.name : undefined;
  }

  it('reuses the idempotency key after a timeout and after a restart', async () => {
    addPies(3);
    setSaleTendered('20.00');
    jest.mocked(createSale).mockRejectedValueOnce(new Error('The request timed out'));
    await confirmSale();
    expect(createSale).toHaveBeenCalledTimes(1);
    const key = jest.mocked(createSale).mock.calls[0]?.[1];
    expect(getSaleUiState().draft.lines).toHaveLength(1);
    expect(getSaleUiState().formError).toMatch(/timed out/i);

    await confirmSale();
    expect(jest.mocked(createSale).mock.calls[1]?.[1]).toBe(key);
    expect(jest.mocked(createSale).mock.calls[1]?.[0]).toEqual(jest.mocked(createSale).mock.calls[0]?.[0]);

    resetSaleSessionForTests();
    await hydrateSaleSession();
    await confirmSale();
    expect(jest.mocked(createSale).mock.calls[2]?.[1]).toBe(key);
  });

  it('does not release the lock when the charge sheet is dismissed mid-request', async () => {
    addPies(1);
    setSaleTendered('5.00');
    let resolveSale: ((value: typeof sale) => void) | undefined;
    jest.mocked(createSale).mockImplementationOnce(() => new Promise((resolve) => {
      resolveSale = resolve;
    }));
    const pending = confirmSale();
    expect(saleAttemptInFlight()).toBe(true);
    expect(dismissChargeSheet()).toBe(false);
    expect(saleAttemptInFlight()).toBe(true);
    await waitFor(() => expect(createSale).toHaveBeenCalledTimes(1));
    await confirmSale();
    expect(createSale).toHaveBeenCalledTimes(1);
    expect(getSaleUiState().formError).toMatch(/already being recorded/i);

    resolveSale?.(sale);
    await pending;
    expect(saleAttemptInFlight()).toBe(false);
    expect(getSaleUiState().draft.lines).toHaveLength(0);
    expect(getSaleUiState().completed?.invoiceNumber).toBe('INV-2041');
  });

  it('does not start a second sale after the server accepts and before the cart clears', async () => {
    addPies(1);
    setSaleTendered('5.00');
    let releaseDraft: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseDraft = resolve;
    });
    (SecureStore.setItemAsync as jest.Mock).mockImplementation(async (key: string, value: string) => {
      if (key === 'ledgercraft.quickSale.draft' && value.includes('"lines":[]')) await gate;
      memory.set(key, value);
    });
    jest.mocked(createSale).mockResolvedValue(sale);
    const pending = confirmSale();
    await waitFor(() => expect(createSale).toHaveBeenCalledTimes(1));
    expect(saleAttemptInFlight()).toBe(true);

    await confirmSale();
    expect(createSale).toHaveBeenCalledTimes(1);
    expect(saleAttemptInFlight()).toBe(true);
    expect(getSaleUiState().draft.lines).toHaveLength(1);
    expect(getSaleUiState().submitting).toBe(true);

    releaseDraft();
    await pending;
    expect(saleAttemptInFlight()).toBe(false);
    expect(getSaleUiState().submitting).toBe(false);
    expect(getSaleUiState().draft.lines).toHaveLength(0);
    expect(getSaleUiState().completed?.invoiceNumber).toBe('INV-2041');
    await confirmSale();
    expect(createSale).toHaveBeenCalledTimes(1);
  });

  it('does not mint a new key when clearing the cart fails after the sale is saved', async () => {
    addPies(1);
    setSaleTendered('5.00');
    (SecureStore.setItemAsync as jest.Mock).mockImplementation(async (key: string, value: string) => {
      if (key === 'ledgercraft.quickSale.draft' && value.includes('"lines":[]')) throw new Error('disk full');
      memory.set(key, value);
    });
    jest.mocked(createSale).mockResolvedValue(sale);
    await confirmSale();
    const key = jest.mocked(createSale).mock.calls[0]?.[1];
    expect(createSale).toHaveBeenCalledTimes(1);
    expect(getSaleUiState().completed?.invoiceNumber).toBe('INV-2041');
    expect(getSaleUiState().draft.lines).toHaveLength(0);

    await confirmSale();
    expect(createSale).toHaveBeenCalledTimes(1);

    dismissSaleSuccess();
    addPies(1);
    setSaleTendered('5.00');
    await confirmSale();
    expect(jest.mocked(createSale).mock.calls[1]?.[1]).toBe(key);
    expect(jest.mocked(createSale).mock.calls[1]?.[0]).toEqual(jest.mocked(createSale).mock.calls[0]?.[0]);
  });

  it('reuses the original key when a timed-out cart is edited and then restored', async () => {
    addPies(1);
    setSaleTendered('20.00');
    jest.mocked(createSale).mockRejectedValue(new Error('The request timed out'));
    await confirmSale();
    const original = jest.mocked(createSale).mock.calls[0]?.[1];
    addPies(1);
    await confirmSale();
    const edited = jest.mocked(createSale).mock.calls[1]?.[1];
    expect(edited).toEqual(expect.any(String));
    expect(edited).not.toBe(original);
    await waitFor(() => expect(memory.get('ledgercraft.quickSale.draft')).toContain('"quantity":"2.00"'));

    resetSaleSessionForTests();
    await hydrateSaleSession();
    updateSaleLineQuantity(pie.id, '1');
    await confirmSale();
    expect(jest.mocked(createSale).mock.calls[2]?.[1]).toBe(original);
    expect(jest.mocked(createSale).mock.calls[2]?.[0]).toEqual(jest.mocked(createSale).mock.calls[0]?.[0]);
  });

  it('retries a failed cart read and shows an error instead of an empty cart', async () => {
    const stored = JSON.stringify({
      lines: [{ kind: 'catalog', itemId: pie.id, name: 'Pie', quantity: '1.00', price: '4.50' }],
      customerId: null,
      customerName: null,
    });
    memory.set('ledgercraft.quickSale.draft', stored);
    let draftReads = 0;
    (SecureStore.getItemAsync as jest.Mock).mockImplementation(async (key: string) => {
      if (key === 'ledgercraft.quickSale.draft') {
        draftReads += 1;
        if (draftReads === 1) throw new Error('locked');
      }
      return memory.get(key) ?? null;
    });
    resetSaleSessionForTests();
    await hydrateSaleSession();
    expect(catalogLineName(getSaleUiState().draft.lines[0])).toBe('Pie');
    expect(getSaleUiState().hydrateError).toBeNull();

    (SecureStore.getItemAsync as jest.Mock).mockImplementation(async () => {
      throw new Error('locked');
    });
    resetSaleSessionForTests();
    await hydrateSaleSession();
    expect(getSaleUiState().ready).toBe(false);
    expect(getSaleUiState().hydrateError).toMatch(/could not be loaded/i);
    expect(getSaleUiState().draft.lines).toHaveLength(0);
    expect(memory.get('ledgercraft.quickSale.draft')).toBe(stored);

    (SecureStore.getItemAsync as jest.Mock).mockImplementation(async (key: string) => memory.get(key) ?? null);
    await retrySaleHydrate();
    expect(getSaleUiState().ready).toBe(true);
    expect(getSaleUiState().hydrateError).toBeNull();
    expect(catalogLineName(getSaleUiState().draft.lines[0])).toBe('Pie');
  });

  it('does not call the sale API while offline and keeps the cart', async () => {
    addPies(2);
    onlineManager.setOnline(false);
    openChargeSheet();
    await confirmSale();
    expect(createSale).not.toHaveBeenCalled();
    expect(getSaleUiState().formError).toBe(OFFLINE_SALE_MESSAGE);
    expect(getSaleUiState().draft.lines).toHaveLength(1);
    expect(getSaleUiState().draft.lines[0]?.quantity).toBe('2.00');
  });
});
