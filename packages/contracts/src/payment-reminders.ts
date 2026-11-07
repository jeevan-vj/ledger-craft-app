import { z } from 'zod';
const step = z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/), offsetDays: z.number().int().min(-90).max(365), reminderType: z.enum(['gentle', 'firm', 'final']), subject: z.string().trim().min(1).max(200).optional(), message: z.string().trim().min(1).max(4000).optional() });
export const reminderSettingsRequestSchema = z.object({ enabled: z.boolean(), timeZone: z.string().refine(v => { try {
        new Intl.DateTimeFormat('en-NZ', { timeZone: v });
        return true;
    }
    catch {
        return false;
    } }, { message: 'Use a valid timezone' }), localTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/), steps: z.array(step).min(1).max(10) }).refine(v => new Set(v.steps.map(s => s.id)).size === v.steps.length, { message: 'Reminder step IDs must be unique', path: ['steps'] }).refine(v => new Set(v.steps.map(s => s.offsetDays)).size === v.steps.length, { message: 'Reminder offsets must be unique', path: ['steps'] });
export type ReminderSettingsRequest = z.infer<typeof reminderSettingsRequestSchema>;
export const reminderSettingsSchema = reminderSettingsRequestSchema.and(z.object({ emailAvailable: z.boolean(), warnings: z.array(z.string()) }));
export const reminderOptOutRequestSchema = z.object({ optOut: z.boolean() });
export const reminderLogSchema = z.object({ id: z.string(), invoiceId: z.string(), stepId: z.string(), scheduledDate: z.string(), status: z.enum(['sending', 'sent', 'skipped', 'failed']), reason: z.string().nullable(), sentAt: z.string().nullable(), createdAt: z.string() });
