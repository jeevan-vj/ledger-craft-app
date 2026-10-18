import { describe, expect, it } from 'vitest';
import { parseItemsCsv, saleSelectableItems } from './itemCatalog';

describe('item catalogue helpers', () => {
  it('parses the canonical CSV format including quoted commas', () => {
    const csv = 'id,name,description,type,categoryId,salePrice,purchasePrice,taxRate,enableSaleInfo,enablePurchaseInfo,unit,isActive\n,"Consulting, senior","Advice",service,,120,,15,true,false,hour,true';
    expect(parseItemsCsv(csv)).toEqual([{ name: 'Consulting, senior', description: 'Advice', type: 'service', categoryId: null,
      salePrice: '120', purchasePrice: null, taxRate: '15', enableSaleInfo: true,
      enablePurchaseInfo: false, unit: 'hour', isActive: true }]);
  });

  it('only exposes active sale-enabled items to invoices', () => {
    const base = { description: null, type: 'service' as const, categoryId: null, category: null, salePrice: 1,
      purchasePrice: null, taxRate: 15, unit: 'hour', createdAt: '', updatedAt: '' };
    const items = [
      { ...base, id: '1', name: 'Sale', isActive: true, enableSaleInfo: true, enablePurchaseInfo: false },
      { ...base, id: '2', name: 'Inactive', isActive: false, enableSaleInfo: true, enablePurchaseInfo: false },
      { ...base, id: '3', name: 'Purchase', isActive: true, enableSaleInfo: false, enablePurchaseInfo: true },
    ];
    expect(saleSelectableItems(items).map((item) => item.name)).toEqual(['Sale']);
  });
});
