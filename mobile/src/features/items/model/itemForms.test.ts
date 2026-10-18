import {
  hasItemFormChanged,
  itemDraftFromRecord,
  itemPayloadFromDraft,
  validateItemDraft,
} from './itemForms';

const draft = {
  name: 'Advisory',
  description: '',
  type: 'service' as const,
  categoryId: '',
  salePrice: '150.00000001',
  purchasePrice: '',
  taxRate: '15',
  enableSaleInfo: true,
  enablePurchaseInfo: false,
  unit: 'hour',
  isActive: true,
};

describe('item form state', () => {
  it('requires the enabled prices and validates canonical non-negative decimals', () => {
    expect(validateItemDraft({ ...draft, name: ' ', salePrice: '' })).toEqual({
      name: 'Enter an item name',
      salePrice: 'Enter a sale price',
    });
    expect(validateItemDraft({ ...draft, salePrice: '-1', taxRate: '100.01' })).toEqual({
      salePrice: 'Enter a non-negative amount',
      taxRate: 'Enter a percentage from 0 to 100',
    });
    expect(validateItemDraft(draft)).toEqual({});
  });

  it('keeps exact decimal text in the API payload', () => {
    expect(itemPayloadFromDraft(draft)).toEqual({
      name: 'Advisory',
      description: null,
      type: 'service',
      categoryId: null,
      salePrice: '150.00000001',
      purchasePrice: null,
      taxRate: '15',
      enableSaleInfo: true,
      enablePurchaseInfo: false,
      unit: 'hour',
      isActive: true,
    });
  });

  it('hydrates exact server values and detects meaningful edits', () => {
    const hydrated = itemDraftFromRecord({ ...draft, id: 'item-1', description: null, categoryId: null });
    expect(hydrated.salePrice).toBe('150.00000001');
    expect(hasItemFormChanged(hydrated, hydrated)).toBe(false);
    expect(hasItemFormChanged({ ...hydrated, unit: 'day' }, hydrated)).toBe(true);
  });
});
