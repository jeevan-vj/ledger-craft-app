import { beforeEach, describe, expect, it, vi } from 'vitest';
import { recurringApi } from './api';
import { buildRecurringInvoicePayload, upsertRecurringInvoiceTemplate } from './invoiceTemplate';

vi.mock('./api', () => ({
  recurringApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

describe('recurring invoice templates', () => {
  beforeEach(() => vi.clearAllMocks());

  it('builds exact-text invoice input from the editor values', () => {
    expect(buildRecurringInvoicePayload({
      values: {
        customerId: '11111111-1111-4111-8111-111111111111',
        date: new Date('2026-10-27T00:00:00Z'),
        dueDate: new Date('2026-11-26T00:00:00Z'),
        currency: 'NZD',
        notes: 'Thanks',
        terms: 'Net 30',
        paymentTermDays: 30,
        taxInclusive: true,
        taxRate: 15,
      },
      items: [{ id: 'line-1', description: 'Consulting', quantity: 2, unit: 'hour', rate: 125, rateUnit: 'hour', total: 250 }],
      delivery: { mode: 'auto', whenEmailUnavailable: 'draft' },
    })).toEqual({
      kind: 'invoice',
      input: expect.objectContaining({
        customerId: '11111111-1111-4111-8111-111111111111',
        items: [expect.objectContaining({ description: 'Consulting', quantity: '2', rate: '125' })],
        notes: 'Thanks',
        terms: 'Net 30',
      }),
      send: { mode: 'auto', whenEmailUnavailable: 'draft' },
    });
  });

  it('creates exactly one template with the saved invoice as its source', async () => {
    vi.mocked(recurringApi.list).mockResolvedValue({ templates: [] });
    vi.mocked(recurringApi.create).mockResolvedValue({} as never);

    await upsertRecurringInvoiceTemplate({
      sourceInvoiceId: '22222222-2222-4222-8222-222222222222',
      name: 'Monthly consulting',
      payload: { kind: 'invoice', input: {} } as never,
      schedule: {} as never,
    });

    expect(recurringApi.create).toHaveBeenCalledTimes(1);
    expect(recurringApi.create).toHaveBeenCalledWith(expect.objectContaining({
      sourceInvoiceId: '22222222-2222-4222-8222-222222222222',
    }));
    expect(recurringApi.update).not.toHaveBeenCalled();
  });
});
