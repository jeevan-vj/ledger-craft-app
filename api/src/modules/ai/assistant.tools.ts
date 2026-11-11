import { assistantProposalSchema, type AssistantPart, type AssistantProposal } from '@ledgercraft/contracts';
import { z } from 'zod';
import type { Database } from '../../db/client';
import { organisationLocalizationSettings } from '../../db/schema/currency';
import { eq } from 'drizzle-orm';
import { DEFAULT_ORGANISATION_TIMEZONE, localDateIn } from '../accounting/organisation-date';
import * as customersRepo from '../customers/customers.repository';
import * as itemsRepo from '../items/items.repository';
import * as invoicesRepo from '../invoices/invoices.repository';
import * as profileRepo from '../business-profile/business-profile.repository';
import { decimal, roundMoney } from '../invoices/money';
import { resolveDocumentCurrency } from '../currency/currency.service';
import type { AssistantToolCall, AssistantToolDefinition } from './assistant.config';
import { resolveRelativeDate } from './assistant.dates';
import { pricedTotals } from './assistant.proposal';

const decimalText = z.preprocess((value) => (
  typeof value === 'number' && Number.isFinite(value) ? String(value) : value
), z.string().regex(/^\d+(\.\d+)?$/));
const taxFlag = z.preprocess((value) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}, z.boolean());
const querySchema = z.object({ query: z.string().trim().min(1).max(80) });
const lineSchema = z.object({
  description: z.string().trim().min(1).max(200),
  quantity: decimalText,
  itemId: z.string().uuid().optional(),
  itemQuery: z.string().trim().min(1).max(80).optional(),
  rate: decimalText.optional(),
});
const prepareSchema = z.object({
  customerId: z.string().uuid().optional(),
  customerQuery: z.string().trim().min(1).max(80).optional(),
  dueDate: z.string().trim().min(1).max(40).optional(),
  taxInclusive: taxFlag.optional(),
  notes: z.string().max(1000).optional(),
  lines: z.array(lineSchema).min(1).max(20),
});
const invoiceLineParameters = {
  type: 'object',
  properties: {
    description: { type: 'string' },
    quantity: { type: 'string', description: 'Decimal text, for example 3 or 1.5.' },
    rate: { type: 'string', description: 'Unit price as decimal text. Omit when the price is unknown.' },
    itemQuery: { type: 'string' },
    itemId: { type: 'string' },
  },
  required: ['description', 'quantity'],
  additionalProperties: false,
};

export const ASSISTANT_TOOL_DEFINITIONS: readonly AssistantToolDefinition[] = [
  { name: 'search_customers', description: 'Find customers in this business by name.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false } },
  { name: 'search_catalogue', description: 'Find catalogue items and their saved prices. Do not invent a price.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false } },
  {
    name: 'prepare_invoice_proposal',
    description: 'Call this to prepare an invoice. Include every line the user stated. Quantity and rate are decimal strings. taxInclusive is false for plus GST and true when the price includes GST. This does not save or send.',
    parameters: {
      type: 'object',
      properties: {
        customerQuery: { type: 'string', description: 'Customer name when the id is not known.' },
        customerId: { type: 'string', description: 'Customer id from an earlier search or quick pick.' },
        dueDate: { type: 'string', description: 'Due date as YYYY-MM-DD or a phrase such as Friday.' },
        taxInclusive: { type: 'boolean', description: 'True when the price includes GST. False when the price is plus GST.' },
        notes: { type: 'string' },
        lines: { type: 'array', description: 'One entry for each line the user asked for.', items: invoiceLineParameters },
      },
      required: ['lines'],
      additionalProperties: false,
    },
  },
  { name: 'list_outstanding', description: 'Read outstanding invoice balances for this business. This does not change records.', parameters: { type: 'object', properties: {}, additionalProperties: false } },
];

const ALLOWED = new Set(ASSISTANT_TOOL_DEFINITIONS.map((tool) => tool.name));

export function isAllowedTool(name: string): boolean {
  return ALLOWED.has(name);
}

export type ToolResult = {
  modelContent: unknown;
  parts: AssistantPart[];
  proposal?: AssistantProposal;
};

function clip(value: string): string {
  const trimmed = value.trim().slice(0, 200);
  return trimmed || 'Item';
}

function matches(query: string, name: string): boolean {
  return name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
}

async function clock(tx: Database, organisationId: string, now: Date) {
  const [settings] = await tx.select({
    timezone: organisationLocalizationSettings.timezone,
    baseCurrency: organisationLocalizationSettings.baseCurrency,
  }).from(organisationLocalizationSettings)
    .where(eq(organisationLocalizationSettings.organisationId, organisationId))
    .limit(1);
  const timeZone = settings?.timezone ?? DEFAULT_ORGANISATION_TIMEZONE;
  return { timeZone, today: localDateIn(now, timeZone), currency: settings?.baseCurrency ?? 'NZD' };
}

export async function executeAssistantTool(
  tx: Database,
  organisationId: string,
  call: AssistantToolCall,
  now: Date,
): Promise<ToolResult> {
  if (call.name === 'search_customers') {
    const parsed = querySchema.safeParse(call.arguments);
    if (!parsed.success) return { modelContent: { error: 'invalid_arguments' }, parts: [] };
    const matchesFound = (await customersRepo.listCustomers(tx, organisationId))
      .filter((customer) => matches(parsed.data.query, customer.name))
      .slice(0, 8);
    const options = matchesFound.map((customer) => ({ id: customer.id, label: clip(customer.name) }));
    return {
      modelContent: { matches: options },
      parts: options.length > 1 ? [{ type: 'quick_picks', field: 'customerId', prompt: 'Which customer?', options }] : [],
    };
  }

  if (call.name === 'search_catalogue') {
    const parsed = querySchema.safeParse(call.arguments);
    if (!parsed.success) return { modelContent: { error: 'invalid_arguments' }, parts: [] };
    const matchesFound = (await itemsRepo.listItems(tx, organisationId))
      .filter((item) => item.isActive && matches(parsed.data.query, item.name))
      .slice(0, 8);
    const options = matchesFound.map((item) => ({ id: item.id, name: clip(item.name), salePrice: item.salePrice, unit: item.unit }));
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

  if (call.name === 'prepare_invoice_proposal') return prepareProposal(tx, organisationId, call.arguments, now);
  return { modelContent: { error: 'unknown_tool' }, parts: [] };
}

async function prepareProposal(tx: Database, organisationId: string, args: unknown, now: Date): Promise<ToolResult> {
  const parsed = prepareSchema.safeParse(args);
  if (!parsed.success) return { modelContent: { error: 'invalid_arguments' }, parts: [] };
  const input = parsed.data;
  const { timeZone, today, currency } = await clock(tx, organisationId, now);
  const profile = await profileRepo.getBusinessProfile(tx, organisationId);
  const taxRate = profile?.defaultTaxRate && /^\d+(\.\d+)?$/.test(profile.defaultTaxRate) ? profile.defaultTaxRate : '0';
  const taxSpecified = input.taxInclusive !== undefined;
  const customers = await customersRepo.listCustomers(tx, organisationId);
  const items = await itemsRepo.listItems(tx, organisationId);
  const parts: AssistantPart[] = [];

  let customerId: string | null = null;
  let customerName: string | null = null;
  if (input.customerId) {
    const customer = customers.find((row) => row.id === input.customerId);
    if (!customer) {
      return { modelContent: { error: 'not_found' }, parts: [{ type: 'text', text: 'That customer is not in this business.' }] };
    }
    customerId = customer.id;
    customerName = clip(customer.name);
  } else if (input.customerQuery) {
    const found = customers.filter((row) => matches(input.customerQuery!, row.name)).slice(0, 8);
    if (found.length === 1) {
      customerId = found[0].id;
      customerName = clip(found[0].name);
    } else if (found.length > 1) {
      parts.push({ type: 'quick_picks', field: 'customerId', prompt: 'Which customer?', options: found.map((row) => ({ id: row.id, label: clip(row.name) })) });
    }
  }

  const missing: string[] = [];
  if (!taxSpecified) missing.push('taxInclusive');
  if (!customerId) missing.push('customer');
  const dueDate = input.dueDate ? resolveRelativeDate(input.dueDate, now, timeZone) : null;
  if (!dueDate || dueDate < today) missing.push('dueDate');

  const lines = input.lines.map((line, index) => {
    let item = line.itemId ? items.find((row) => row.id === line.itemId && row.isActive) : undefined;
    let ambiguous = false;
    if (!line.itemId && line.itemQuery) {
      const found = items.filter((row) => row.isActive && matches(line.itemQuery!, row.name)).slice(0, 8);
      if (found.length === 1) item = found[0];
      else if (found.length > 1) {
        ambiguous = true;
        parts.push({ type: 'quick_picks', field: 'itemId', prompt: 'Which item?', options: found.map((row) => ({ id: row.id, label: clip(row.name) })) });
      }
    }
    const lineMissing: string[] = [];
    let rate: string | null = null;
    if (line.itemId && !item) lineMissing.push('item');
    else if (item?.salePrice) rate = item.salePrice;
    else if (!ambiguous && line.rate) rate = line.rate;
    else lineMissing.push('rate');
    if (lineMissing.length) missing.push(`lines.${index}.${lineMissing[0]}`);
    return {
      description: line.description,
      quantity: line.quantity,
      rate,
      unit: item?.unit ?? null,
      itemId: item?.id ?? null,
      missing: lineMissing,
      ...(decimal(taxRate).compare('15') === 0 ? { taxCode: 'standard_15' as const } : {}),
    };
  });

  const status = missing.length === 0 ? 'ready' as const : 'needs_input' as const;
  const precision = status === 'ready'
    ? (await resolveDocumentCurrency(tx, organisationId, currency, today)).currency.precision
    : 2;
  const totals = status === 'ready' && taxSpecified
    ? pricedTotals({
      taxInclusive: input.taxInclusive === true,
      taxRate,
      precision,
      lines: lines.flatMap((line) => line.rate ? [{ description: line.description, quantity: line.quantity, rate: line.rate }] : []),
    })
    : null;
  const proposal = assistantProposalSchema.parse({
    id: crypto.randomUUID(),
    kind: 'invoice',
    status,
    customerId,
    customerName,
    date: today,
    dueDate: dueDate && dueDate >= today ? dueDate : null,
    taxInclusive: taxSpecified ? input.taxInclusive === true : null,
    taxRate,
    currency,
    notes: input.notes?.trim() ? input.notes.trim() : null,
    lines,
    missing,
    totals,
    actions: { saveDraft: true, send: false },
  });
  parts.push({ type: 'text', text: status === 'ready' ? 'Review this invoice. Nothing is saved until you tap Save draft.' : 'Some invoice details are still missing.' });
  parts.push({ type: 'proposal', proposal });
  return {
    modelContent: {
      status,
      customerId,
      dueDate: proposal.dueDate,
      taxInclusive: proposal.taxInclusive,
      taxRate,
      currency,
      lines: lines.map((line) => ({ description: line.description, quantity: line.quantity, rate: line.rate, missing: line.missing })),
      totals,
    },
    parts,
    proposal,
  };
}
