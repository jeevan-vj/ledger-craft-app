import React from 'react';
import { Modal } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import type { CatalogItem } from '@/features/items/api/itemsApi';
import { itemsApi } from '@/features/items/api/itemsApi';
import { customersApi } from '@/features/customers/api/customersApi';
import { OFFLINE_SALE_MESSAGE } from '@/features/sales/saleAttempt';
import { resetSaleSessionForTests } from '@/features/sales/saleSession';
import { createSale } from '@/features/sales/salesApi';
import SellScreen from './SellScreen';

jest.mock('@/features/items/api/itemsApi', () => ({
  itemsApi: { list: jest.fn() },
}));

jest.mock('@/features/customers/api/customersApi', () => ({
  customersApi: { list: jest.fn() },
}));

jest.mock('@/features/sales/salesApi', () => ({
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

jest.mock('@/hooks/useTabScreenInsets', () => ({
  useTabScreenInsets: () => ({
    safeArea: { top: 47, bottom: 34, left: 0, right: 0 },
    tabBarClearance: 80,
    bottomPadding: 120,
  }),
}));

jest.mock('react-native-safe-area-context', () => {
  const ReactLib = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    useSafeAreaInsets: () => ({ top: 0, bottom: 20, left: 0, right: 0 }),
    SafeAreaView: ({ children }: { children: React.ReactNode }) => ReactLib.createElement(View, null, children),
  };
});

const memory = new Map<string, string>();
const bakery = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Bakery', color: '#C47B4A', isActive: true };

function catalogItem(overrides: Partial<CatalogItem> & Pick<CatalogItem, 'id' | 'name'>): CatalogItem {
  return {
    type: 'product',
    enableSaleInfo: true,
    enablePurchaseInfo: false,
    unit: 'ea',
    isActive: true,
    salePrice: '4.50',
    categoryId: bakery.id,
    category: bakery,
    ...overrides,
  };
}

const pie = catalogItem({ id: '11111111-1111-4111-8111-111111111111', name: 'Pie', salePrice: '4.50' });
const roll = catalogItem({ id: '22222222-2222-4222-8222-222222222222', name: 'Roll', salePrice: '9.00' });
const bag = catalogItem({
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Bag',
  salePrice: '2.00',
  categoryId: null,
  category: null,
});
const hidden = catalogItem({ id: '44444444-4444-4444-8444-444444444444', name: 'Hidden', isActive: false });
const displayOnly = catalogItem({ id: '55555555-5555-4555-8555-555555555555', name: 'Display', salePrice: null });
const crumb = catalogItem({ id: '66666666-6666-4666-8666-666666666666', name: 'Crumb', salePrice: '1.005' });

const sale = {
  invoice: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab', invoiceNumber: 'INV-2041', total: '13.50', status: 'paid' },
  payment: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', amount: '13.50', paymentMethod: 'cash', status: 'completed' },
  receipt: { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' },
};

function renderSell() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return render(
    <QueryClientProvider client={client}>
      <SellScreen />
    </QueryClientProvider>,
  );
}

describe('SellScreen', () => {
  beforeEach(() => {
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
    jest.mocked(itemsApi.list).mockResolvedValue({
      items: [pie, roll, bag, hidden, displayOnly, crumb],
      categories: [bakery],
    });
    jest.mocked(customersApi.list).mockResolvedValue([]);
    jest.mocked(createSale).mockReset();
  });

  it('shows active priced tiles, grouped, and hides the rest', async () => {
    const screen = renderSell();
    expect(await screen.findByLabelText('Pie, $4.50 including GST')).toBeTruthy();
    expect(screen.getByLabelText('Roll, $9.00 including GST')).toBeTruthy();
    expect(screen.getByLabelText('Category Bakery')).toBeTruthy();
    expect(screen.getByLabelText('Category Other')).toBeTruthy();
    expect(screen.queryByLabelText(/Hidden/)).toBeNull();
    expect(screen.queryByLabelText(/Display/)).toBeNull();
    expect(screen.queryByLabelText(/Crumb/)).toBeNull();

    fireEvent.changeText(screen.getByLabelText('Search items'), 'bag');
    expect(screen.queryByLabelText(/Pie/)).toBeNull();
    expect(screen.getByLabelText('Bag, $2.00 including GST')).toBeTruthy();
  });

  it('finishes a two-item cash sale in five taps and shows the invoice number', async () => {
    jest.mocked(createSale).mockResolvedValue(sale);
    const screen = renderSell();
    fireEvent.press(await screen.findByLabelText('Pie, $4.50 including GST'));
    fireEvent.press(screen.getByLabelText('Roll, $9.00 including GST'));
    expect(screen.getByLabelText('Cart, $13.50')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Charge'));
    fireEvent.press(screen.getByLabelText('$10'));
    expect(screen.getByLabelText('Confirm sale').props.accessibilityState.disabled).toBe(true);
    expect(screen.queryByText('Change $6.50')).toBeNull();

    fireEvent.press(screen.getByLabelText('$20'));
    expect(screen.getByText('Change $6.50')).toBeTruthy();
    expect(screen.getByLabelText('Confirm sale').props.accessibilityState.disabled).toBe(false);
    fireEvent.press(screen.getByLabelText('Confirm sale'));

    expect(await screen.findByText('INV-2041')).toBeTruthy();
    expect(jest.mocked(createSale).mock.calls[0]?.[0]).toEqual({
      lines: [
        { itemId: pie.id, quantity: '1.00', price: '4.50' },
        { itemId: roll.id, quantity: '1.00', price: '9.00' },
      ],
      paymentMethod: 'cash',
    });
    expect(jest.mocked(createSale).mock.calls[0]?.[1]).toEqual(expect.any(String));

    fireEvent.press(screen.getByLabelText('Done'));
    expect(screen.queryByText('INV-2041')).toBeNull();
    expect(await screen.findByLabelText('Cart, $0.00')).toBeTruthy();
  });

  it('rejects a zero custom amount and a third decimal place', async () => {
    const screen = renderSell();
    fireEvent.press(await screen.findByLabelText('Custom amount'));
    fireEvent.press(screen.getByLabelText('Key 0'));
    expect(screen.getByText(/greater than 0/i)).toBeTruthy();
    expect(screen.getByLabelText('Add custom amount').props.accessibilityState.disabled).toBe(true);

    fireEvent.press(screen.getByLabelText('Delete'));
    fireEvent.press(screen.getByLabelText('Key 1'));
    fireEvent.press(screen.getByLabelText('Decimal point'));
    fireEvent.press(screen.getByLabelText('Key 2'));
    fireEvent.press(screen.getByLabelText('Key 3'));
    fireEvent.press(screen.getByLabelText('Key 4'));
    expect(screen.getByLabelText('Custom amount value 1.23')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Add custom amount'));
    expect(await screen.findByLabelText('Cart, $1.23')).toBeTruthy();
  });

  it('sets a quantity from a long press and can remove the item', async () => {
    const screen = renderSell();
    fireEvent.press(await screen.findByLabelText('Pie, $4.50 including GST'));
    fireEvent(screen.getByLabelText('Pie, $4.50 including GST, 1 in cart'), 'longPress');
    fireEvent.press(await screen.findByLabelText('Delete'));
    fireEvent.press(screen.getByLabelText('Key 3'));
    fireEvent.press(screen.getByLabelText('Update quantity'));
    expect(await screen.findByLabelText('Pie, $4.50 including GST, 3 in cart')).toBeTruthy();
    expect(screen.getByLabelText('Cart, $13.50')).toBeTruthy();

    fireEvent(screen.getByLabelText('Pie, $4.50 including GST, 3 in cart'), 'longPress');
    fireEvent.press(await screen.findByLabelText('Remove item'));
    expect(await screen.findByLabelText('Pie, $4.50 including GST')).toBeTruthy();
    expect(screen.getByLabelText('Cart, $0.00')).toBeTruthy();
  });

  it('disables Charge while offline and does not send the sale', async () => {
    const screen = renderSell();
    fireEvent.press(await screen.findByLabelText('Pie, $4.50 including GST'));
    await act(async () => {
      onlineManager.setOnline(false);
    });
    expect(screen.getByText(OFFLINE_SALE_MESSAGE)).toBeTruthy();
    expect(screen.getByLabelText('Charge').props.accessibilityState.disabled).toBe(true);
    fireEvent.press(screen.getByLabelText('Charge'));
    expect(createSale).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Pie, $4.50 including GST, 1 in cart')).toBeTruthy();
  });

  it('keeps the cart when the screen is reopened after backgrounding', async () => {
    const screen = renderSell();
    fireEvent.press(await screen.findByLabelText('Pie, $4.50 including GST'));
    await waitFor(() => expect(memory.get('ledgercraft.quickSale.draft')).toContain('Pie'));
    screen.unmount();
    resetSaleSessionForTests();

    const reopened = renderSell();
    expect(await reopened.findByLabelText('Pie, $4.50 including GST, 1 in cart')).toBeTruthy();
    expect(reopened.getByLabelText('Cart, $4.50')).toBeTruthy();
  });

  it('reuses the idempotency key after a timeout', async () => {
    jest.mocked(createSale)
      .mockRejectedValueOnce(new Error('The request timed out'))
      .mockResolvedValueOnce(sale);
    const screen = renderSell();
    fireEvent.press(await screen.findByLabelText('Pie, $4.50 including GST'));
    fireEvent.press(screen.getByLabelText('Charge'));
    fireEvent.press(screen.getByLabelText('Exact'));
    fireEvent.press(screen.getByLabelText('Confirm sale'));
    expect(await screen.findByText(/timed out/i)).toBeTruthy();
    const key = jest.mocked(createSale).mock.calls[0]?.[1];

    fireEvent.press(screen.getByLabelText('Confirm sale'));
    await waitFor(() => expect(createSale).toHaveBeenCalledTimes(2));
    expect(jest.mocked(createSale).mock.calls[1]?.[1]).toBe(key);
    expect(jest.mocked(createSale).mock.calls[1]?.[0]).toEqual(jest.mocked(createSale).mock.calls[0]?.[0]);
  });

  it('shows the charge error after an iOS swipe dismisses a failed attempt', async () => {
    jest.mocked(createSale).mockRejectedValueOnce(new Error('The request timed out'));
    const screen = renderSell();
    fireEvent.press(await screen.findByLabelText('Pie, $4.50 including GST'));
    fireEvent.press(screen.getByLabelText('Charge'));
    fireEvent.press(screen.getByLabelText('Exact'));
    fireEvent.press(screen.getByLabelText('Confirm sale'));
    expect(await screen.findByText(/timed out/i)).toBeTruthy();
    const modal = screen.UNSAFE_getByType(Modal);
    expect(modal.props.allowSwipeDismissal).toBe(true);
    modal.props.onDismiss();
    expect(await screen.findByText(/timed out/i)).toBeTruthy();
    expect(screen.queryByLabelText('Confirm sale')).toBeNull();
  });

  it('keeps the in-flight lock when Android back asks to close the charge sheet', async () => {
    let resolveSale: ((value: typeof sale) => void) | undefined;
    jest.mocked(createSale).mockImplementationOnce(() => new Promise((resolve) => {
      resolveSale = resolve;
    }));
    const screen = renderSell();
    fireEvent.press(await screen.findByLabelText('Pie, $4.50 including GST'));
    fireEvent.press(screen.getByLabelText('Charge'));
    fireEvent.press(screen.getByLabelText('$5'));
    fireEvent.press(screen.getByLabelText('Confirm sale'));
    await waitFor(() => expect(createSale).toHaveBeenCalledTimes(1));

    const modal = screen.UNSAFE_getByType(Modal);
    expect(modal.props.allowSwipeDismissal).toBe(false);
    expect(screen.getByLabelText('Confirm sale').props.accessibilityState.disabled).toBe(true);
    modal.props.onRequestClose();
    modal.props.onDismiss();
    expect(screen.getByLabelText('Confirm sale').props.accessibilityState.disabled).toBe(true);
    fireEvent.press(screen.getByLabelText('Confirm sale'));
    expect(createSale).toHaveBeenCalledTimes(1);

    screen.unmount();
    const reopened = renderSell();
    expect((await reopened.findByLabelText('Confirm sale')).props.accessibilityState.disabled).toBe(true);
    fireEvent.press(reopened.getByLabelText('Confirm sale'));
    expect(createSale).toHaveBeenCalledTimes(1);

    resolveSale?.(sale);
    await waitFor(() => expect(reopened.getByText('INV-2041')).toBeTruthy());
  });

  it('attaches an existing customer and sends card with an optional reference', async () => {
    jest.mocked(customersApi.list).mockResolvedValue([{
      id: '99999999-9999-4999-8999-999999999999',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      address: null,
      city: null,
      state: null,
      zip: null,
      country: 'NZ',
      phone: null,
      isVip: false,
      tags: [],
      createdAt: '2026-10-27T00:00:00.000Z',
      updatedAt: '2026-10-27T00:00:00.000Z',
    }]);
    jest.mocked(createSale).mockResolvedValue(sale);
    const screen = renderSell();
    fireEvent.press(await screen.findByLabelText('Pie, $4.50 including GST'));
    fireEvent.press(screen.getByLabelText('Cart, $4.50'));
    fireEvent.press(screen.getByLabelText('Add customer'));
    fireEvent.press(await screen.findByText('Ada Lovelace'));
    fireEvent.press(screen.getByLabelText('Close cart'));
    fireEvent.press(screen.getByLabelText('Charge'));
    fireEvent.press(screen.getByLabelText('Card/EFTPOS'));
    fireEvent.changeText(screen.getByLabelText('Payment reference'), 'EFT-9');
    fireEvent.press(screen.getByLabelText('Confirm sale'));
    await waitFor(() => expect(createSale).toHaveBeenCalledTimes(1));
    expect(jest.mocked(createSale).mock.calls[0]?.[0]).toEqual({
      lines: [{ itemId: pie.id, quantity: '1.00', price: '4.50' }],
      paymentMethod: 'credit_card',
      customerId: '99999999-9999-4999-8999-999999999999',
      referenceNumber: 'EFT-9',
    });
  });
});
