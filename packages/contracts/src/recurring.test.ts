import { describe, expect, it } from 'vitest';
import {
  createRecurringTemplateRequestSchema,
  recurringPreviewRequestSchema,
  recurringPreviewResponseSchema,
  recurringRunSchema,
  recurringTemplateSchema,
  updateRecurringTemplateRequestSchema,
} from './recurring';

describe('recurring contracts', () => {
  it('accepts exact-money invoice schedules and all interval families', () => {
    const base = { name: 'Monthly care plan', payload: { kind: 'invoice', input: { customerId: crypto.randomUUID(), date: '2026-01-31', dueDate: '2026-02-28', items: [{ description: 'Care plan', quantity: '1', rate: '19.99' }] } }, schedule: { startDate: '2026-01-31', timezone: 'Pacific/Auckland', localTime: '09:30' } };
    for (const frequency of ['daily', 'weekly', 'monthly', 'annual'] as const) expect(createRecurringTemplateRequestSchema.safeParse({ ...base, schedule: { ...base.schedule, frequency, interval: 1 } }).success).toBe(true);
    expect(createRecurringTemplateRequestSchema.safeParse({ ...base, schedule: { ...base.schedule, frequency: 'custom', interval: 3, customUnit: 'week' } }).success).toBe(true);
  });
  it('rejects missing custom units, invalid timezone, reversed end date and numeric money', () => {
    const value = { name: 'Bad', payload: { kind: 'expense', input: { description: 'Rent', amount: 10, expenseDate: '2026-03-01' } }, schedule: { frequency: 'custom', interval: 2, startDate: '2026-03-02', endDate: '2026-03-01', timezone: 'Mars/Olympus', localTime: '09:00' } };
    expect(createRecurringTemplateRequestSchema.safeParse(value).success).toBe(false);
  });

  it('accepts explicit month anchors, invoice delivery policy and source invoice links', () => {
    const sourceInvoiceId = crypto.randomUUID();
    const request = createRecurringTemplateRequestSchema.parse({
      name: 'Month-end invoice',
      sourceInvoiceId,
      payload: {
        kind: 'invoice',
        input: {
          customerId: crypto.randomUUID(),
          date: '2028-01-31',
          dueDate: '2028-02-29',
          items: [{ description: 'Care plan', quantity: '1', rate: '19.99' }],
        },
        send: { mode: 'auto', whenEmailUnavailable: 'mark_sent' },
      },
      schedule: {
        frequency: 'monthly', interval: 1, dayOfMonth: 'last', startDate: '2028-01-31',
        timezone: 'Pacific/Auckland', localTime: '09:00',
      },
    });
    expect(request.sourceInvoiceId).toBe(sourceInvoiceId);
    expect(request.payload).toMatchObject({ kind: 'invoice', send: { mode: 'auto', whenEmailUnavailable: 'mark_sent' } });
    expect(request.schedule.dayOfMonth).toBe('last');
    expect(createRecurringTemplateRequestSchema.safeParse({ ...request, schedule: { ...request.schedule, dayOfMonth: 31 } }).success).toBe(true);
    expect(createRecurringTemplateRequestSchema.safeParse({ ...request, schedule: { ...request.schedule, dayOfMonth: 32 } }).success).toBe(false);
    expect(updateRecurringTemplateRequestSchema.parse({ sourceInvoiceId: null })).toEqual({ sourceInvoiceId: null });
  });

  it('exposes preview and delivery result contracts without dropping legacy unavailable runs', () => {
    const preview = recurringPreviewRequestSchema.parse({
      schedule: { frequency: 'monthly', interval: 1, dayOfMonth: 31, startDate: '2027-01-31', timezone: 'UTC', localTime: '09:00' },
    });
    expect(preview.count).toBe(5);
    expect(recurringPreviewRequestSchema.safeParse({ schedule: preview.schedule, count: 13 }).success).toBe(false);
    expect(recurringPreviewResponseSchema.parse({ occurrences: [{ runAt: '2027-01-31T09:00:00.000Z', localDate: '2027-01-31' }] }).occurrences).toHaveLength(1);

    const templateBase = {
      id: crypto.randomUUID(), name: 'Linked', kind: 'invoice', status: 'active', sourceInvoiceId: crypto.randomUUID(),
      payload: { kind: 'invoice', input: { customerId: crypto.randomUUID(), date: '2027-01-31', dueDate: '2027-02-28', items: [{ description: 'Plan', quantity: '1', rate: '10.00' }] } },
      schedule: preview.schedule, nextRunAt: '2027-01-31T09:00:00.000Z', lastRunAt: null, occurrencesCreated: 0,
      createdAt: '2027-01-01T00:00:00.000Z', updatedAt: '2027-01-01T00:00:00.000Z',
    };
    expect(recurringTemplateSchema.parse(templateBase).sourceInvoiceId).toBe(templateBase.sourceInvoiceId);
    for (const deliveryStatus of ['not_requested', 'unavailable', 'sent', 'email_not_configured', 'failed'] as const) {
      const run = recurringRunSchema.parse({
        id: crypto.randomUUID(), templateId: templateBase.id, occurrenceKey: 'key', scheduledFor: '2027-01-31T09:00:00.000Z',
        status: 'succeeded', attemptCount: 1, generatedType: 'invoice', generatedId: crypto.randomUUID(), deliveryStatus,
        deliveryMessage: deliveryStatus === 'email_not_configured' ? 'Not emailed: email not configured' : null,
        failureReason: null, nextAttemptAt: null, createdAt: '2027-01-31T09:00:00.000Z', updatedAt: '2027-01-31T09:00:00.000Z',
      });
      expect(run.deliveryStatus).toBe(deliveryStatus);
    }
  });
});
