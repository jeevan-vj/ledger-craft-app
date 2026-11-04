import type { Invoice, LineItem } from '@/types/invoice';
import { parseMoneyInput } from '@/features/invoices/firstInvoiceModel';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const QUANTITY_PATTERN = /^\d+(\.\d{1,4})?$/;

export interface DraftTax {
  id: string;
  name: string;
  rate: string;
}

export interface DraftItemUpdate {
  description: string;
  quantity: string;
  unit: string;
  rate: string;
  rateUnit: string;
  discountType?: 'fixed' | 'percent';
  discountValue?: string;
  taxes?: DraftTax[];
}

export interface DraftUpdate {
  dueDate?: string;
  taxInclusive?: boolean;
  taxRate?: string;
  expectedUpdatedAt?: string;
  items?: DraftItemUpdate[];
}

export interface AddedLineInput {
  description: string;
  quantity: string;
  amount: string;
}

export function showFinishDraft(status: string, canWrite: boolean): boolean {
  return status === 'draft' && canWrite;
}

export function dueDateError(issueDate: string, dueDate: string): string | null {
  if (!ISO_DATE.test(dueDate)) return 'Choose a due date.';
  if (dueDate < issueDate) return "Due date can't be before the invoice date.";
  return null;
}

export function parseQuantity(value: string): number | null {
  const trimmed = value.trim().replace(/,/g, '');
  if (!QUANTITY_PATTERN.test(trimmed)) return null;
  const quantity = Number(trimmed);
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  return quantity;
}

export function addedLineError(description: string, quantity: string, amount: string): string | null {
  if (description.trim().length < 2) return 'Describe what you are charging for.';
  if (parseQuantity(quantity) == null) return 'Enter a quantity greater than zero.';
  if (parseMoneyInput(amount) == null) return 'Enter an amount greater than zero.';
  return null;
}

function decimalText(value: number): string {
  return String(Math.round(value * 10000) / 10000);
}

function taxAssignments(item: LineItem): DraftTax[] {
  return (item.taxes ?? []).map((tax) => ({
    id: tax.id,
    name: tax.name,
    rate: decimalText(tax.rate),
  }));
}

function sameTaxes(left: DraftTax[], right: DraftTax[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((tax, index) => tax.id === right[index]?.id && tax.rate === right[index]?.rate);
}

/**
 * The rate already stored on this draft. A new line must keep it.
 * Profile defaults are not used, so a non-registered business does not gain GST.
 */
export function preservedTaxRate(invoice: Pick<Invoice, 'subtotal' | 'taxAmount' | 'items'>): string {
  const groups = invoice.items.map(taxAssignments).filter((taxes) => taxes.length > 0);
  if (groups.length > 0 && groups.every((taxes) => sameTaxes(taxes, groups[0]!))) {
    const combined = groups[0]!.reduce((sum, tax) => sum + Number(tax.rate), 0);
    return decimalText(combined);
  }
  if (groups.length === 0 && invoice.subtotal > 0 && invoice.taxAmount > 0) {
    return decimalText(Math.round((invoice.taxAmount / invoice.subtotal) * 10000) / 100);
  }
  return '0';
}

function taxesForExistingLine(item: LineItem, headerRate: string): DraftTax[] | undefined {
  if (item.taxes) return taxAssignments(item);
  if (headerRate === '0') return [];
  return undefined;
}

function taxesForNewLine(headerRate: string, sample: DraftTax[] | null): DraftTax[] | undefined {
  if (sample && sample.length > 0) return sample;
  if (headerRate === '0') return [];
  return undefined;
}

function toItemUpdate(item: LineItem, taxes: DraftTax[] | undefined): DraftItemUpdate {
  return {
    description: item.description,
    quantity: decimalText(item.quantity),
    unit: item.unit || 'each',
    rate: decimalText(item.rate),
    rateUnit: item.unit || 'each',
    ...(item.discountType ? { discountType: item.discountType } : {}),
    ...(item.discountValue != null ? { discountValue: decimalText(item.discountValue) } : {}),
    ...(taxes ? { taxes } : {}),
  };
}

export function buildDraftLineUpdate(invoice: Invoice, input: AddedLineInput): DraftUpdate | null {
  const validation = addedLineError(input.description, input.quantity, input.amount);
  const quantity = parseQuantity(input.quantity);
  const rate = parseMoneyInput(input.amount);
  if (validation || quantity == null || rate == null) return null;

  const headerRate = preservedTaxRate(invoice);
  const sample = invoice.items.map(taxAssignments).find((taxes) => taxes.length > 0) ?? null;
  const existing = invoice.items.map((item) => toItemUpdate(item, taxesForExistingLine(item, headerRate)));
  const added = toItemUpdate(
    {
      id: 'new',
      description: input.description.trim(),
      quantity,
      unit: 'each',
      rate,
      total: Math.round(quantity * rate * 100) / 100,
    },
    taxesForNewLine(headerRate, sample),
  );

  return {
    ...(invoice.updatedAt ? { expectedUpdatedAt: invoice.updatedAt } : {}),
    taxInclusive: invoice.taxInclusive,
    taxRate: headerRate,
    items: [...existing, added],
  };
}

export function lineTotal(quantity: string, amount: string): number | null {
  const parsedQuantity = parseQuantity(quantity);
  const parsedAmount = parseMoneyInput(amount);
  if (parsedQuantity == null || parsedAmount == null) return null;
  return Math.round(parsedQuantity * parsedAmount * 100) / 100;
}
