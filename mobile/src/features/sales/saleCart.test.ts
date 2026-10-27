import { readFileSync } from 'node:fs';
import path from 'node:path';
import { roundMoney } from '../../../../api/src/modules/invoices/money';
import type { CatalogItem } from '@/features/items/api/itemsApi';
import {
  addCatalogItem,
  addCustomAmount,
  cartTotal,
  cashChange,
  emptySaleDraft,
  groupSaleTiles,
  isSellableItem,
  keypadAmountError,
  normalizeSaleAmount,
  pushKeypadKey,
  saleFingerprint,
  saleRequestBody,
  setLineQuantity,
} from './saleCart';

const bakery = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Bakery', color: '#C47B4A' };

function item(overrides: Partial<CatalogItem> & Pick<CatalogItem, 'id' | 'name'>): CatalogItem {
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

const pie = item({ id: '11111111-1111-4111-8111-111111111111', name: 'Pie', salePrice: '4.50' });
const roll = item({ id: '22222222-2222-4222-8222-222222222222', name: 'Roll', salePrice: '9.00' });
const bag = item({
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Bag',
  salePrice: '2.00',
  categoryId: null,
  category: null,
});

describe('quick sale cart', () => {
  it('sums tile prices with the shared decimal helper', () => {
    const first = addCatalogItem(emptySaleDraft(), pie).draft;
    const second = addCatalogItem(first, pie).draft;
    const third = addCatalogItem(second, pie).draft;
    expect(cartTotal(third.lines)).toBe(roundMoney('13.50'));
    expect(cartTotal(third.lines)).toBe('13.50');

    const mixed = addCatalogItem(addCatalogItem(emptySaleDraft(), roll).draft, pie).draft;
    const mixedAgain = addCatalogItem(mixed, pie).draft;
    expect(cartTotal(mixedAgain.lines)).toBe('18.00');
  });

  it('does not lose cents the way binary floats do', () => {
    const ten = addCustomAmount(emptySaleDraft(), '0.10', '', 'custom-1').draft;
    const thirty = addCustomAmount(ten, '0.20', '', 'custom-2').draft;
    expect(cartTotal(thirty.lines)).toBe('0.30');
    const wide = addCustomAmount(emptySaleDraft(), '9007199254740993.00', '', 'custom-wide').draft;
    expect(cartTotal(wide.lines)).toBe('9007199254740993.00');
  });

  it('gives exact cash change and withholds it when tendered is short', () => {
    expect(cashChange('13.50', '20')).toBe('6.50');
    expect(cashChange('13.50', '20.00')).toBe('6.50');
    expect(cashChange('13.50', '13.50')).toBe('0.00');
    expect(cashChange('13.50', '13.49')).toBeNull();
    expect(cashChange('13.50', '10')).toBeNull();
    expect(cashChange('13.50', '0')).toBeNull();
    expect(cashChange('13.50', '-1')).toBeNull();
  });

  it('accepts up to 2 decimal places and rejects 0, negatives, and longer fractions', () => {
    expect(keypadAmountError('0')).toMatch(/greater than 0/i);
    expect(keypadAmountError('0.00')).toMatch(/greater than 0/i);
    expect(keypadAmountError('-1')).toMatch(/greater than 0/i);
    expect(keypadAmountError('1.234')).toMatch(/2 decimal places/i);
    expect(keypadAmountError('1.2')).toBeNull();
    expect(keypadAmountError('10')).toBeNull();
    expect(keypadAmountError('0.10')).toBeNull();
    expect(normalizeSaleAmount('1.2')).toBe('1.20');
    expect(normalizeSaleAmount('10')).toBe('10.00');
    expect(normalizeSaleAmount('1.234')).toBeNull();
    expect(normalizeSaleAmount('-5')).toBeNull();
    expect(pushKeypadKey('1.2', '3')).toBe('1.23');
    expect(pushKeypadKey('1.23', '4')).toBe('1.23');
    expect(pushKeypadKey('1.2', 'backspace')).toBe('1.');
    expect(pushKeypadKey('0', '5')).toBe('5');
    expect(pushKeypadKey('', '.')).toBe('0.');
    expect(pushKeypadKey('12.', '.')).toBe('12.');
  });

  it('shows only active items with a positive sale price of at most 2 decimals', () => {
    const hidden = item({ id: '44444444-4444-4444-8444-444444444444', name: 'Hidden', isActive: false });
    const display = item({ id: '55555555-5555-4555-8555-555555555555', name: 'Display', salePrice: null });
    const crumb = item({ id: '66666666-6666-4666-8666-666666666666', name: 'Crumb', salePrice: '1.005' });
    const free = item({ id: '77777777-7777-4777-8777-777777777777', name: 'Free', salePrice: '0.00' });
    const loose = item({ id: '88888888-8888-4888-8888-888888888888', name: 'Loose', salePrice: '4.5' });
    expect(isSellableItem(pie)).toBe(true);
    expect(isSellableItem(loose)).toBe(true);
    expect(isSellableItem(hidden)).toBe(false);
    expect(isSellableItem(display)).toBe(false);
    expect(isSellableItem(crumb)).toBe(false);
    expect(isSellableItem(free)).toBe(false);

    const sections = groupSaleTiles([roll, hidden, bag, pie, display, crumb, free], '');
    expect(sections.map((section) => section.name)).toEqual(['Bakery', 'Other']);
    expect(sections[0]?.color).toBe('#C47B4A');
    expect(sections[0]?.items.map((entry) => entry.name)).toEqual(['Pie', 'Roll']);
    expect(sections[1]?.items.map((entry) => entry.name)).toEqual(['Bag']);
    expect(groupSaleTiles([pie, roll, bag], 'ba').map((section) => section.items.map((entry) => entry.name))).toEqual([['Bag']]);
  });

  it('builds a tax-inclusive sale body and stops at 100 lines', () => {
    let draft = addCatalogItem(emptySaleDraft(), pie).draft;
    draft = addCatalogItem(draft, pie).draft;
    const custom = addCustomAmount(draft, '0.10', '  ', 'custom-1');
    expect(custom.error).toBeNull();
    const labelled = addCustomAmount(custom.draft, '1.50', 'Coffee', 'custom-2');
    const body = saleRequestBody(labelled.draft, { paymentMethod: 'cash', referenceNumber: 'ignored' });
    expect(body).toEqual({
      lines: [
        { itemId: pie.id, quantity: '2.00', price: '4.50' },
        { quantity: '1.00', price: '0.10' },
        { label: 'Coffee', quantity: '1.00', price: '1.50' },
      ],
      paymentMethod: 'cash',
    });
    expect(body).not.toHaveProperty('customerId');
    expect(saleFingerprint(body)).toBe(saleFingerprint(saleRequestBody(labelled.draft, { paymentMethod: 'cash', referenceNumber: '' })));

    const card = saleRequestBody(
      { ...labelled.draft, customerId: '99999999-9999-4999-8999-999999999999', customerName: 'Ada' },
      { paymentMethod: 'credit_card', referenceNumber: ' EFT-1 ' },
    );
    expect(card.customerId).toBe('99999999-9999-4999-8999-999999999999');
    expect(card.referenceNumber).toBe('EFT-1');

    let full = emptySaleDraft();
    for (let index = 0; index < 100; index += 1) {
      full = addCustomAmount(full, '0.10', '', `custom-${index}`).draft;
    }
    expect(full.lines).toHaveLength(100);
    expect(addCustomAmount(full, '0.10', '', 'overflow').error).toMatch(/100/);
    expect(setLineQuantity(labelled.draft, pie.id, '0').error).toMatch(/greater than 0/i);
    expect(setLineQuantity(labelled.draft, pie.id, '3').draft.lines[0]?.quantity).toBe('3.00');
  });

  it('keeps money math off parseFloat and Number', () => {
    const files = [
      'saleCart.ts',
      'saleAttempt.ts',
      'saleSession.ts',
      'salesApi.ts',
      '../../components/sales/AmountKeypad.tsx',
      '../../components/sales/ChargeSheet.tsx',
      '../../components/sales/CartDrawer.tsx',
      '../../screens/sales/SellScreen.tsx',
      '../../screens/sales/SaleSuccessState.tsx',
    ];
    for (const file of files) {
      const source = readFileSync(path.join(__dirname, file), 'utf8');
      expect(source).not.toMatch(/parseFloat|\bNumber\(/);
    }
  });
});
