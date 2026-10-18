import DecimalJs from 'decimal.js';
import type { Item } from '@/services/itemService';

export interface ItemDraft {
  name: string;
  description: string;
  type: 'product' | 'service';
  categoryId: string;
  salePrice: string;
  purchasePrice: string;
  taxRate: string;
  enableSaleInfo: boolean;
  enablePurchaseInfo: boolean;
  unit: string;
  isActive: boolean;
}

export const emptyItemDraft = (): ItemDraft => ({
  name: '', description: '', type: 'product', categoryId: '', salePrice: '', purchasePrice: '',
  taxRate: '15', enableSaleInfo: true, enablePurchaseInfo: false, unit: 'unit', isActive: true,
});

function validDecimal(value: string) {
  return /^\d+(\.\d+)?$/.test(value.trim());
}

export function validateItemDraft(draft: ItemDraft) {
  const errors: Partial<Record<keyof ItemDraft, string>> = {};
  if (!draft.name.trim()) errors.name = 'Enter an item name';
  if (!draft.unit.trim()) errors.unit = 'Enter a unit';
  if (draft.enableSaleInfo && !draft.salePrice.trim()) errors.salePrice = 'Enter a sale price';
  else if (draft.salePrice && !validDecimal(draft.salePrice)) errors.salePrice = 'Enter a non-negative amount';
  if (draft.enablePurchaseInfo && !draft.purchasePrice.trim()) errors.purchasePrice = 'Enter a purchase price';
  else if (draft.purchasePrice && !validDecimal(draft.purchasePrice)) errors.purchasePrice = 'Enter a non-negative amount';
  if (draft.taxRate && (!validDecimal(draft.taxRate) || new DecimalJs(draft.taxRate).greaterThan(100))) {
    errors.taxRate = 'Enter a percentage from 0 to 100';
  }
  return errors;
}

export function itemPayloadFromDraft(draft: ItemDraft) {
  return {
    name: draft.name.trim(), description: draft.description.trim() || null, type: draft.type,
    categoryId: draft.categoryId || null, salePrice: draft.salePrice.trim() || null,
    purchasePrice: draft.purchasePrice.trim() || null, taxRate: draft.taxRate.trim() || null,
    enableSaleInfo: draft.enableSaleInfo, enablePurchaseInfo: draft.enablePurchaseInfo,
    unit: draft.unit.trim(), isActive: draft.isActive,
  };
}

export function itemDraftFromRecord(item: Item): ItemDraft {
  return {
    name: item.name, description: item.description || '', type: item.type,
    categoryId: item.categoryId || '', salePrice: item.salePrice == null ? '' : String(item.salePrice),
    purchasePrice: item.purchasePrice == null ? '' : String(item.purchasePrice),
    taxRate: item.taxRate == null ? '' : String(item.taxRate), enableSaleInfo: item.enableSaleInfo,
    enablePurchaseInfo: item.enablePurchaseInfo, unit: item.unit, isActive: item.isActive !== false,
  };
}

export function hasItemFormChanged(current: ItemDraft, initial: ItemDraft) {
  return JSON.stringify(itemPayloadFromDraft(current)) !== JSON.stringify(itemPayloadFromDraft(initial));
}
