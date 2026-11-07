import { createRecurringTemplateRequestSchema, type CreateRecurringTemplateRequest, type RecurringTemplateDto } from '@ledgercraft/contracts';

export interface RecurringDraft {
  kind: 'invoice' | 'bill' | 'income' | 'expense'; name: string; partyId: string; accountId: string;
  description: string; amount: string; quantity: string; taxRate: string; taxInclusive: boolean;
  currency: string; dueDate: string; startDate: string; endDate: string; occurrenceLimit: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'annual' | 'custom'; interval: string;
  customUnit: 'day' | 'week' | 'month' | 'year'; timezone: string; localTime: string; dayOfMonth: string;
  additionalLines?: { description: string; quantity: string; unitPrice: string; taxRate: string; accountId: string; originalIndex?: number }[];
  autoSend: boolean; original?: CreateRecurringTemplateRequest;
}
export const emptyRecurringDraft = (date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())): RecurringDraft => ({
  kind: 'expense', name: '', partyId: '', accountId: '', description: '', amount: '', quantity: '1', taxRate: '15', taxInclusive: true,
  currency: 'NZD', dueDate: date, startDate: date, endDate: '', occurrenceLimit: '', frequency: 'monthly', interval: '1', customUnit: 'month', timezone: 'Pacific/Auckland', localTime: '09:00', dayOfMonth: '', autoSend: false,
});
export function recurringPayloadFromDraft(draft: RecurringDraft, emailAvailable: boolean): CreateRecurringTemplateRequest {
  if (draft.kind === 'invoice' && draft.autoSend && !emailAvailable) throw new Error('Configure email delivery before selecting automatic sending.');
  const original = draft.original?.payload.kind === draft.kind ? draft.original.payload : undefined;
  let payload: CreateRecurringTemplateRequest['payload'];
  if (draft.kind === 'invoice') {
    const previous = original?.kind === 'invoice' ? original.input : undefined;
    const [first, ...rest] = previous?.items ?? [];
    const taxAssignments = (taxes: typeof first.taxes, rate: string) => {
      if (taxes && taxes.length > 1) {
        if (taxes[0].rate !== rate) throw new Error('Review stacked tax assignments on the original document before changing this rate.');
        return taxes;
      }
      return [{ ...taxes?.[0], id: taxes?.[0]?.id ?? 'gst', name: taxes?.[0]?.name ?? 'GST', rate }];
    };
    const additional = draft.additionalLines?.map(line => {
      const source = line.originalIndex === undefined ? undefined : rest[line.originalIndex];
      return { ...source, description: line.description, quantity: line.quantity, rate: line.unitPrice, taxes: taxAssignments(source?.taxes, line.taxRate) };
    }) ?? rest;
    payload = { kind: 'invoice', input: { ...previous, customerId: draft.partyId, date: draft.startDate, dueDate: draft.dueDate, currency: draft.currency, taxInclusive: draft.taxInclusive, taxRate: draft.taxRate, items: [{ ...first, description: draft.description, quantity: draft.quantity, rate: draft.amount, ...(first?.taxes ? { taxes: taxAssignments(first.taxes, draft.taxRate) } : {}) }, ...additional] }, send: { mode: draft.autoSend ? 'auto' : 'draft', ...(draft.autoSend ? { whenEmailUnavailable: 'draft' as const } : {}) } };
  } else if (draft.kind === 'bill') {
    const previous = original?.kind === 'bill' ? original.input : undefined;
    const [first, ...rest] = previous?.lines ?? [];
    payload = { kind: 'bill', input: { ...previous, vendorId: draft.partyId, issueDate: draft.startDate, dueDate: draft.dueDate, currency: draft.currency, taxInclusive: draft.taxInclusive, lines: [{ ...first, description: draft.description, quantity: draft.quantity, unitPrice: draft.amount, taxRate: draft.taxRate, accountId: draft.accountId || null }, ...(draft.additionalLines ? draft.additionalLines.map(line => ({ ...(line.originalIndex === undefined ? {} : rest[line.originalIndex]), description: line.description, quantity: line.quantity, unitPrice: line.unitPrice, taxRate: line.taxRate, accountId: line.accountId || null })) : rest)] } };
  } else if (draft.kind === 'income') {
    payload = { kind: 'income', input: { ...(original?.kind === 'income' ? original.input : {}), bankAccountId: draft.accountId, description: draft.description, amount: draft.amount, transactionDate: draft.startDate, type: 'credit' } };
  } else {
    payload = { kind: 'expense', input: { ...(original?.kind === 'expense' ? original.input : {}), description: draft.description, amount: draft.amount, expenseDate: draft.startDate, currency: draft.currency } };
  }
  return createRecurringTemplateRequestSchema.parse({ name: draft.name, payload, schedule: { frequency: draft.frequency, interval: Number(draft.interval), ...(draft.frequency === 'custom' ? { customUnit: draft.customUnit } : {}), startDate: draft.startDate, ...(draft.endDate ? { endDate: draft.endDate } : {}), ...(draft.occurrenceLimit ? { occurrenceLimit: Number(draft.occurrenceLimit) } : {}), timezone: draft.timezone, localTime: draft.localTime, ...(draft.dayOfMonth ? { dayOfMonth: draft.dayOfMonth === 'last' ? 'last' : Number(draft.dayOfMonth) } : {}) } });
}
export function recurringDraftFromTemplate(template: RecurringTemplateDto): RecurringDraft {
  const { payload, schedule } = template; const draft = emptyRecurringDraft(schedule.startDate);
  Object.assign(draft, { kind: payload.kind, name: template.name, frequency: schedule.frequency, interval: String(schedule.interval), customUnit: schedule.customUnit ?? 'month', startDate: schedule.startDate, endDate: schedule.endDate ?? '', occurrenceLimit: schedule.occurrenceLimit === null || schedule.occurrenceLimit === undefined ? '' : String(schedule.occurrenceLimit), timezone: schedule.timezone, localTime: schedule.localTime, dayOfMonth: schedule.dayOfMonth === undefined ? '' : String(schedule.dayOfMonth), original: { name: template.name, payload, schedule } });
  if (payload.kind === 'invoice') Object.assign(draft, { partyId: payload.input.customerId, description: payload.input.items[0].description, quantity: payload.input.items[0].quantity, amount: payload.input.items[0].rate, taxRate: payload.input.items[0].taxes?.[0]?.rate ?? payload.input.taxRate ?? '0', taxInclusive: payload.input.taxInclusive ?? true, currency: payload.input.currency ?? 'NZD', dueDate: payload.input.dueDate ?? schedule.startDate, autoSend: payload.send?.mode === 'auto', additionalLines: payload.input.items.slice(1).map((line, originalIndex) => ({ originalIndex, description: line.description, quantity: line.quantity, unitPrice: line.rate, taxRate: line.taxes?.[0]?.rate ?? payload.input.taxRate ?? '0', accountId: '' })) });
  else if (payload.kind === 'bill') Object.assign(draft, { partyId: payload.input.vendorId, accountId: payload.input.lines[0].accountId ?? '', description: payload.input.lines[0].description, quantity: payload.input.lines[0].quantity, amount: payload.input.lines[0].unitPrice, taxRate: payload.input.lines[0].taxRate, taxInclusive: payload.input.taxInclusive ?? true, currency: payload.input.currency ?? 'NZD', dueDate: payload.input.dueDate, additionalLines: payload.input.lines.slice(1).map((line, originalIndex) => ({ originalIndex, description: line.description, quantity: line.quantity, unitPrice: line.unitPrice, taxRate: line.taxRate, accountId: line.accountId ?? '' })) });
  else Object.assign(draft, { description: payload.input.description, amount: payload.input.amount, ...(payload.kind === 'income' ? { accountId: payload.input.bankAccountId } : { currency: payload.input.currency ?? 'NZD' }) });
  return draft;
}
