import type { AssistantPart } from '@ledgercraft/contracts';
import { z } from 'zod';
import type { Database } from '../../db/client';
import * as customersRepo from '../customers/customers.repository';
import * as itemsRepo from '../items/items.repository';
import * as invoicesRepo from '../invoices/invoices.repository';
import { decimal, roundMoney } from '../invoices/money';
import type { AssistantToolCall, AssistantToolDefinition } from './assistant.config';

const querySchema = z.object({ query: z.string().trim().min(1).max(80) });

export const ASSISTANT_TOOL_DEFINITIONS: readonly AssistantToolDefinition[] = [
  { name: 'search_customers', description: 'Find customers in this business by name.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false } },
  { name: 'search_catalogue', description: 'Find catalogue items and their saved prices. Do not invent a price.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false } },
  { name: 'list_outstanding', description: 'Read outstanding invoice balances for this business. This does not change records.', parameters: { type: 'object', properties: {}, additionalProperties: false } },
];

const ALLOWED = new Set(ASSISTANT_TOOL_DEFINITIONS.map((tool) => tool.name));

export function isAllowedTool(name: string): boolean {
  return ALLOWED.has(name);
}

export type ToolResult = {
  modelContent: unknown;
  parts: AssistantPart[];
};

function clip(value: string): string {
  const trimmed = value.trim().slice(0, 200);
  return trimmed || 'Item';
}

function matches(query: string, name: string): boolean {
  return name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
}

export async function executeAssistantTool(
  tx: Database,
  organisationId: string,
  call: AssistantToolCall,
): Promise<ToolResult> {
  if (call.name === 'search_customers') {
    const parsed = querySchema.safeParse(call.arguments);
    if (!parsed.success) return { modelContent: { error: 'invalid_arguments' }, parts: [] };
    const found = (await customersRepo.listCustomers(tx, organisationId))
      .filter((customer) => matches(parsed.data.query, customer.name))
      .slice(0, 8);
    const options = found.map((customer) => ({ id: customer.id, label: clip(customer.name) }));
    return {
      modelContent: { matches: options },
      parts: options.length > 1 ? [{ type: 'quick_picks', field: 'customerId', prompt: 'Which customer?', options }] : [],
    };
  }

  if (call.name === 'search_catalogue') {
    const parsed = querySchema.safeParse(call.arguments);
    if (!parsed.success) return { modelContent: { error: 'invalid_arguments' }, parts: [] };
    const found = (await itemsRepo.listItems(tx, organisationId))
      .filter((item) => item.isActive && matches(parsed.data.query, item.name))
      .slice(0, 8);
    const options = found.map((item) => ({ id: item.id, name: clip(item.name), salePrice: item.salePrice, unit: item.unit }));
    return {
      modelContent: { matches: options },
      parts: options.length > 1 ? [{ type: 'quick_picks', field: 'itemId', prompt: 'Which item?', options: options.map((item) => ({ id: item.id, label: item.name })) }] : [],
    };
  }

  if (call.name === 'list_outstanding') {
    const invoices = await invoicesRepo.listInvoices(tx, organisationId);
    const open = invoices.filter((invoice) => invoice.status !== 'draft' && invoice.status !== 'cancelled' && decimal(invoice.balanceDue).compare(0) > 0);
    const currencies = [...new Set(open.map((invoice) => invoice.currency))];
    const total = currencies.length === 1 ? roundMoney(open.reduce((sum, invoice) => sum.add(invoice.balanceDue), decimal(0))) : null;
    const text = open.length === 0
      ? 'No outstanding invoices.'
      : total ? `${open.length} outstanding ${open.length === 1 ? 'invoice' : 'invoices'}, ${total} ${currencies[0]}.` : `${open.length} outstanding invoices in more than one currency.`;
    return {
      modelContent: { count: open.length, total, currency: currencies.length === 1 ? currencies[0] : null },
      parts: [
        { type: 'text', text },
        ...(open.length ? open.slice(0, 8).map((invoice) => ({ type: 'link' as const, href: `/invoices/${invoice.id}`, label: `Invoice ${invoice.invoiceNumber}`.slice(0, 80) })) : [{ type: 'link' as const, href: '/invoices', label: 'Invoices' }]),
      ],
    };
  }

  return { modelContent: { error: 'unknown_tool' }, parts: [] };
}
