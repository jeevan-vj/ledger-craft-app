import { emptyRecurringDraft, recurringPayloadFromDraft, recurringDraftFromTemplate } from './recurringForm';
import { createRecurringTemplateRequestSchema } from '@ledgercraft/contracts';

describe('mobile recurring document editor', () => {
  it('builds a real invoice template with exact lines and the full schedule', () => {
    const draft = { ...emptyRecurringDraft('2026-10-31'), kind: 'invoice' as const, name: 'Retainer', partyId: '11111111-1111-4111-8111-111111111111', description: 'Monthly support', amount: '9007199254740993.01', endDate: '2027-03-31', occurrenceLimit: '5', dayOfMonth: 'last', autoSend: true };
    const request = recurringPayloadFromDraft(draft, true);
    expect(request.payload).toMatchObject({ kind: 'invoice', input: { customerId: draft.partyId, items: [{ rate: '9007199254740993.01' }], taxInclusive: true }, send: { mode: 'auto', whenEmailUnavailable: 'draft' } });
    expect(request.schedule).toMatchObject({ startDate: '2026-10-31', endDate: '2027-03-31', occurrenceLimit: 5, timezone: 'Pacific/Auckland', dayOfMonth: 'last' });
    expect(createRecurringTemplateRequestSchema.safeParse(request).success).toBe(true);
  });
  it('builds supplier bills and never enables delivery without configured email', () => {
    const draft = { ...emptyRecurringDraft('2026-10-31'), kind: 'bill' as const, name: 'Rent', partyId: '11111111-1111-4111-8111-111111111111', accountId: '22222222-2222-4222-8222-222222222222', description: 'Premises', amount: '1150.00', autoSend: true };
    const request = recurringPayloadFromDraft(draft, false);
    expect(request.payload).toMatchObject({ kind: 'bill', input: { vendorId: draft.partyId, lines: [{ unitPrice: '1150.00', accountId: draft.accountId }] } });
    expect(createRecurringTemplateRequestSchema.safeParse(request).success).toBe(true);
    expect(() => recurringPayloadFromDraft({ ...draft, kind: 'invoice' }, false)).toThrow(/email/i);
  });
  it('round trips an existing template without losing custom schedule or extra document lines', () => {
    const request = recurringPayloadFromDraft({ ...emptyRecurringDraft('2026-10-31'), name: 'Rent', description: 'Rent', amount: '50.00' }, false);
    const template = { ...request, id: 'id', kind: request.payload.kind, status: 'paused', nextRunAt: null, lastRunAt: null, occurrencesCreated: 1, createdAt: '', updatedAt: '' };
    const draft = recurringDraftFromTemplate(template as never);
    expect(recurringPayloadFromDraft(draft, false)).toEqual(request);
  });
});

it('creates and edits multiple invoice/bill lines without losing line-specific exact taxes', () => {
  const draft = { ...emptyRecurringDraft('2026-10-31'), kind: 'invoice' as const, name: 'Two services', partyId: '11111111-1111-4111-8111-111111111111', description: 'Main service', amount: '115.00', additionalLines: [{ description: 'Exempt service', quantity: '2', unitPrice: '0.01', taxRate: '0', accountId: '' }] };
  const request = recurringPayloadFromDraft(draft, false);
  expect(request.payload.kind === 'invoice' && request.payload.input.items).toEqual([expect.objectContaining({ rate: '115.00' }), expect.objectContaining({ description: 'Exempt service', quantity: '2', rate: '0.01', taxes: [{ id: 'gst', name: 'GST', rate: '0' }] })]);
  const template = { ...request, id: 'id', kind: 'invoice', status: 'active', nextRunAt: null, lastRunAt: null, occurrencesCreated: 0, createdAt: '', updatedAt: '' };
  expect(recurringDraftFromTemplate(template as never).additionalLines).toEqual(draft.additionalLines.map((line, originalIndex) => ({ ...line, originalIndex })));
});

it('retains the correct original discount and tax identity after deleting an earlier additional line', () => {
  const request = recurringPayloadFromDraft({ ...emptyRecurringDraft('2026-10-31'), kind: 'invoice', name: 'Retainer', partyId: '11111111-1111-4111-8111-111111111111', description: 'First', amount: '100.00' }, false);
  if (request.payload.kind !== 'invoice') throw new Error('Expected invoice fixture');
  request.payload.input.items.push({ description: 'Remove me', quantity: '1', rate: '10.00', discountValue: '1.00', discountType: 'fixed', taxes: [{ id: 'removed-tax', name: 'GST', rate: '15' }] }, { description: 'Keep me', quantity: '1', rate: '20.00', discountValue: '2.00', discountType: 'fixed', taxes: [{ id: 'retained-tax', name: 'GST', rate: '15' }] });
  const draft = recurringDraftFromTemplate({ ...request, kind: 'invoice', id: 'id', status: 'active', nextRunAt: null, lastRunAt: null, occurrencesCreated: 0, createdAt: '', updatedAt: '' } as never);
  draft.additionalLines = draft.additionalLines!.slice(1);
  const updated = recurringPayloadFromDraft(draft, false);
  expect(updated.payload.kind === 'invoice' && updated.payload.input.items[1]).toMatchObject({ description: 'Keep me', rate: '20.00', discountValue: '2.00', taxes: [{ id: 'retained-tax', rate: '15' }] });
});
