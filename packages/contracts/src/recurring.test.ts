import { describe, expect, it } from 'vitest';
import { createRecurringTemplateRequestSchema } from './recurring';

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
});
