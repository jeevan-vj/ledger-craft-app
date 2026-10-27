import * as SecureStore from 'expo-secure-store';
import { waitFor } from '@testing-library/react-native';
import { onlineManager } from '@tanstack/react-query';
import type { CatalogItem } from '@/features/items/api/itemsApi';
import { OFFLINE_SALE_MESSAGE, saleAttemptInFlight } from './saleAttempt';
import {
  addCatalogItemToDraft,
  confirmSale,
  dismissChargeSheet,
  getSaleUiState,
  hydrateSaleSession,
  openChargeSheet,
  resetSaleSessionForTests,
  setSaleTendered,
} from './saleSession';
import { createSale } from './salesApi';

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
