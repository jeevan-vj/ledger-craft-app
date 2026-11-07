import { describe, expect, it } from 'vitest';
import { customerStatementQuerySchema, bulkStatementRequestSchema } from './customer-statements';
import { reminderSettingsRequestSchema } from './payment-reminders';
describe('customer statement and reminder boundaries', () => {
    it('requires real calendar dates in order, canonical queries and bounded selections', () => {
        expect(customerStatementQuerySchema.parse({ type: 'activity', from: '2026-10-01', to: '2026-10-31' }).type).toBe('activity');
        expect(customerStatementQuerySchema.safeParse({ from: '2026-02-30', to: '2026-10-31' }).success).toBe(false);
        expect(customerStatementQuerySchema.safeParse({ from: '2026-11-01', to: '2026-10-31' }).success).toBe(false);
        expect(bulkStatementRequestSchema.safeParse({ customerIds: [], from: '2026-10-01', to: '2026-10-31' }).success).toBe(false);
    });
    it('requires unique finite reminder steps and valid IANA timezone/local time', () => {
        expect(reminderSettingsRequestSchema.parse({ enabled: true, timeZone: 'Pacific/Auckland', localTime: '09:00', steps: [{ id: 'due', offsetDays: 0, reminderType: 'gentle' }] }).enabled).toBe(true);
        expect(reminderSettingsRequestSchema.safeParse({ enabled: true, timeZone: 'Bad/Zone', localTime: '25:10', steps: [] }).success).toBe(false);
        expect(reminderSettingsRequestSchema.safeParse({ enabled: true, timeZone: 'Pacific/Auckland', localTime: '09:00', steps: [{ id: 'a', offsetDays: 0, reminderType: 'gentle' }, { id: 'a', offsetDays: 7, reminderType: 'firm' }] }).success).toBe(false);
    });
});
