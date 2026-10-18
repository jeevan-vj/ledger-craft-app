import type { ImportItemRow } from '@ledgercraft/contracts';
import type { Item } from '@/types';

const columns = ['id','name','description','type','categoryId','salePrice','purchasePrice','taxRate','enableSaleInfo','enablePurchaseInfo','unit','isActive'] as const;

function rows(csv: string): string[][] {
  const result: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    if (char === '"' && quoted && csv[index + 1] === '"') { cell += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && csv[index + 1] === '\n') index += 1;
      row.push(cell); if (row.some(Boolean)) result.push(row); row = []; cell = '';
    } else cell += char;
  }
  row.push(cell); if (row.some(Boolean)) result.push(row);
  return result;
}

const optional = (value: string) => value.trim() || undefined;
const nullable = (value: string) => value.trim() || null;
const bool = (value: string, fallback: boolean) => value.trim() ? value.trim().toLowerCase() === 'true' : fallback;

export function parseItemsCsv(csv: string): ImportItemRow[] {
  const [header, ...data] = rows(csv);
  if (!header || columns.some((column, index) => header[index]?.trim() !== column)) {
    throw new Error(`Expected CSV columns: ${columns.join(',')}`);
  }
  return data.map((values) => ({
    ...(optional(values[0] ?? '') ? { id: optional(values[0] ?? '') } : {}),
    name: (values[1] ?? '').trim(), description: nullable(values[2] ?? ''),
    type: (values[3] ?? '').trim() as 'product' | 'service', categoryId: nullable(values[4] ?? ''),
    salePrice: nullable(values[5] ?? ''), purchasePrice: nullable(values[6] ?? ''), taxRate: nullable(values[7] ?? ''),
    enableSaleInfo: bool(values[8] ?? '', true), enablePurchaseInfo: bool(values[9] ?? '', false),
    unit: optional(values[10] ?? '') ?? 'ea', isActive: bool(values[11] ?? '', true),
  }));
}

export function saleSelectableItems(items: Item[]): Item[] {
  return items.filter((item) => item.isActive !== false && item.enableSaleInfo);
}
