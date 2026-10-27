import type { CreateSaleRequest, SalePaymentMethod } from '@ledgercraft/contracts';
import { decimal, roundMoney } from '../../../../api/src/modules/invoices/money';
import type { CatalogItem } from '@/features/items/api/itemsApi';

export const MAX_SALE_LINES = 100;
export const CUSTOM_AMOUNT_LABEL = 'Custom amount';

const AT_MOST_TWO_DECIMALS = /^\d+(?:\.\d{1,2})?$/;
const MORE_THAN_TWO_DECIMALS = /^\d+\.\d{3,}$/;
const KEYPAD_DIGITS = new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
const CATEGORY_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export interface SaleCatalogLine {
  kind: 'catalog';
  itemId: string;
  name: string;
  quantity: string;
  price: string;
}

export interface SaleCustomLine {
  kind: 'custom';
  id: string;
  label: string;
  quantity: string;
  price: string;
}

export type SaleLine = SaleCatalogLine | SaleCustomLine;

export interface SaleDraft {
  lines: SaleLine[];
  customerId: string | null;
  customerName: string | null;
}

export interface SaleTileSection {
  id: string;
  name: string;
  color: string | null;
  items: CatalogItem[];
}

export interface SaleChargeInput {
  paymentMethod: SalePaymentMethod;
  referenceNumber: string;
}

export function emptySaleDraft(): SaleDraft {
  return { lines: [], customerId: null, customerName: null };
}

export function keypadAmountError(amount: string): string | null {
  const trimmed = amount.trim();
  if (!trimmed || trimmed === '.') return 'Enter an amount.';
  if (trimmed.startsWith('-')) return 'Enter an amount greater than 0.';
  if (MORE_THAN_TWO_DECIMALS.test(trimmed)) return 'Enter an amount with at most 2 decimal places.';
  if (!AT_MOST_TWO_DECIMALS.test(trimmed)) return 'Enter an amount greater than 0.';
  if (decimal(trimmed).compare(0) <= 0) return 'Enter an amount greater than 0.';
  return null;
}

export function normalizeSaleAmount(amount: string): string | null {
  if (keypadAmountError(amount)) return null;
  return roundMoney(amount.trim());
}

export function pushKeypadKey(current: string, key: string): string {
  if (key === 'clear') return '';
  if (key === 'backspace') return current.slice(0, -1);
  if (key === '.') {
    if (current.includes('.')) return current;
    return `${current === '' ? '0' : current}.`;
  }
  if (!KEYPAD_DIGITS.has(key)) return current;
  if (current === '0') return key;
  const next = `${current}${key}`;
  const [whole = '', fraction] = next.split('.');
  if (fraction && fraction.length > 2) return current;
  if (whole.length > 10) return current;
  return next;
}

export function isSellableItem(item: CatalogItem): boolean {
  return item.isActive === true && typeof item.salePrice === 'string' && keypadAmountError(item.salePrice) === null;
}

export function sellableItems(items: CatalogItem[]): CatalogItem[] {
  return items.filter(isSellableItem);
}

export function categoryColor(color: string | null | undefined): string | null {
  return color && CATEGORY_COLOR.test(color) ? color : null;
}

export function groupSaleTiles(items: CatalogItem[], search: string): SaleTileSection[] {
  const query = search.trim().toLowerCase();
  const groups = new Map<string, SaleTileSection>();
  for (const item of sellableItems(items)) {
    if (query && !item.name.toLowerCase().includes(query)) continue;
    const id = item.category?.id ?? 'uncategorised';
    let section = groups.get(id);
    if (!section) {
      section = {
        id,
        name: id === 'uncategorised' ? 'Other' : item.category?.name?.trim() || 'Other',
        color: categoryColor(item.category?.color),
        items: [],
      };
      groups.set(id, section);
    }
    section.items.push(item);
  }
  const sections = [...groups.values()];
  for (const section of sections) section.items.sort((left, right) => left.name.localeCompare(right.name));
  sections.sort((left, right) => {
    if (left.id === 'uncategorised') return 1;
    if (right.id === 'uncategorised') return -1;
    return left.name.localeCompare(right.name);
  });
  return sections;
}

export function lineKey(line: SaleLine): string {
  return line.kind === 'catalog' ? line.itemId : line.id;
}

export function lineLabel(line: SaleLine): string {
  if (line.kind === 'catalog') return line.name;
  const label = line.label.trim();
  return label || CUSTOM_AMOUNT_LABEL;
}

export function displayQuantity(quantity: string): string {
  return quantity.endsWith('.00') ? quantity.slice(0, -3) : quantity;
}

/** Display only. A line can round a cent away from the charged total. */
export function lineTotal(line: SaleLine): string {
  return roundMoney(decimal(line.quantity).mul(line.price));
}

/** Buyer-pays total. Sum the raw line amounts, then round once. This is the total the server charges. */
export function cartTotal(lines: SaleLine[]): string {
  const sum = lines.reduce((total, line) => total.add(decimal(line.quantity).mul(line.price)), decimal(0));
  return roundMoney(sum);
}

export function cashChange(total: string, tendered: string): string | null {
  const due = normalizeSaleAmount(total);
  const paid = normalizeSaleAmount(tendered);
  if (!due || !paid) return null;
  const delta = decimal(paid).sub(due);
  if (delta.compare(0) < 0) return null;
  return roundMoney(delta);
}

function withLines(draft: SaleDraft, lines: SaleLine[]): SaleDraft {
  return { ...draft, lines };
}

export function addCatalogItem(draft: SaleDraft, item: CatalogItem): { draft: SaleDraft; error: string | null } {
  if (!isSellableItem(item) || typeof item.salePrice !== 'string') {
    return { draft, error: 'This item cannot be sold.' };
  }
  const price = normalizeSaleAmount(item.salePrice);
  if (!price) return { draft, error: 'This item cannot be sold.' };
  const existing = draft.lines.find((line): line is SaleCatalogLine => line.kind === 'catalog' && line.itemId === item.id);
  if (existing) {
    const quantity = roundMoney(decimal(existing.quantity).add(1));
    return {
      draft: withLines(draft, draft.lines.map((line) => lineKey(line) === item.id ? { ...existing, quantity } : line)),
      error: null,
    };
  }
  if (draft.lines.length >= MAX_SALE_LINES) {
    return { draft, error: 'A sale can include at most 100 lines.' };
  }
  const line: SaleCatalogLine = { kind: 'catalog', itemId: item.id, name: item.name, quantity: roundMoney('1'), price };
  return { draft: withLines(draft, [...draft.lines, line]), error: null };
}

export function setLineQuantity(draft: SaleDraft, key: string, quantity: string): { draft: SaleDraft; error: string | null } {
  if (!draft.lines.some((line) => lineKey(line) === key)) return { draft, error: 'That item is not in the cart.' };
  const amount = normalizeSaleAmount(quantity);
  if (!amount) return { draft, error: keypadAmountError(quantity) ?? 'Enter a quantity greater than 0.' };
  return {
    draft: withLines(draft, draft.lines.map((line) => lineKey(line) === key ? { ...line, quantity: amount } : line)),
    error: null,
  };
}

export function setLinePrice(draft: SaleDraft, key: string, price: string): { draft: SaleDraft; error: string | null } {
  if (!draft.lines.some((line) => lineKey(line) === key)) return { draft, error: 'That item is not in the cart.' };
  const amount = normalizeSaleAmount(price);
  if (!amount) return { draft, error: keypadAmountError(price) ?? 'Enter an amount greater than 0.' };
  return {
    draft: withLines(draft, draft.lines.map((line) => lineKey(line) === key ? { ...line, price: amount } : line)),
    error: null,
  };
}

export function removeLine(draft: SaleDraft, key: string): SaleDraft {
  return withLines(draft, draft.lines.filter((line) => lineKey(line) !== key));
}

export function addCustomAmount(
  draft: SaleDraft,
  amount: string,
  label: string,
  id: string,
): { draft: SaleDraft; error: string | null } {
  const price = normalizeSaleAmount(amount);
  if (!price) return { draft, error: keypadAmountError(amount) ?? 'Enter an amount greater than 0.' };
  const trimmed = label.trim();
  if (trimmed.length > 200) return { draft, error: 'Label must be 200 characters or less.' };
  if (draft.lines.length >= MAX_SALE_LINES) return { draft, error: 'A sale can include at most 100 lines.' };
  const line: SaleCustomLine = { kind: 'custom', id, label: trimmed, quantity: roundMoney('1'), price };
  return { draft: withLines(draft, [...draft.lines, line]), error: null };
}

export function saleRequestBody(draft: SaleDraft, charge: SaleChargeInput): CreateSaleRequest {
  const lines = draft.lines.map((line) => {
    if (line.kind === 'catalog') return { itemId: line.itemId, quantity: line.quantity, price: line.price };
    const label = line.label.trim();
    return label
      ? { label, quantity: line.quantity, price: line.price }
      : { quantity: line.quantity, price: line.price };
  });
  const body: CreateSaleRequest = { lines, paymentMethod: charge.paymentMethod };
  if (draft.customerId) body.customerId = draft.customerId;
  const reference = charge.referenceNumber.trim();
  if (charge.paymentMethod !== 'cash' && reference) body.referenceNumber = reference;
  return body;
}

export function saleFingerprint(body: CreateSaleRequest): string {
  return JSON.stringify(body);
}

export function quantityForItem(draft: SaleDraft, itemId: string): string | null {
  const line = draft.lines.find((entry) => entry.kind === 'catalog' && entry.itemId === itemId);
  return line?.quantity ?? null;
}
