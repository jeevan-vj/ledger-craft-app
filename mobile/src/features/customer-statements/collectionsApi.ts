import { z } from 'zod';
import { customerListResponseSchema,customerStatementQuerySchema,customerStatementSchema,statementShareSchema,reminderSettingsSchema,reminderSettingsRequestSchema,reminderLogSchema,type CustomerStatementQuery,type ReminderSettingsRequest } from '@ledgercraft/contracts';
import { apiRequest } from '@/features/auth/api/http';
const delivery=z.object({sent:z.literal(true)}).and(statementShareSchema);
const preference=z.object({optOut:z.boolean()});
const counts=z.object({sent:z.number().int().min(0),failed:z.number().int().min(0),skipped:z.number().int().min(0)});
export type MobileReminderSettings=z.infer<typeof reminderSettingsSchema>;
export const collectionsApi={
 async customers(){return customerListResponseSchema.parse(await apiRequest('/api/customers')).customers;},
 async statement(id:string,input:CustomerStatementQuery){const q=customerStatementQuerySchema.parse(input);return customerStatementSchema.parse(await apiRequest(`/api/customers/${encodeURIComponent(id)}/statement?${new URLSearchParams(q)}`));},
 async share(id:string,input:CustomerStatementQuery){const q=customerStatementQuerySchema.parse(input);return statementShareSchema.parse(await apiRequest(`/api/customers/${encodeURIComponent(id)}/statement/share`,{method:'POST',body:JSON.stringify(q)}));},
 async revoke(id:string){return apiRequest(`/api/customers/${encodeURIComponent(id)}/statement/shares`,{method:'DELETE'});},
 async send(id:string,input:CustomerStatementQuery,key:string){const q=customerStatementQuerySchema.parse(input);return delivery.parse(await apiRequest(`/api/customers/${encodeURIComponent(id)}/statement/send`,{method:'POST',headers:{'Idempotency-Key':key},body:JSON.stringify(q)}));},
 async bulk(ids:string[],input:CustomerStatementQuery,key:string){const q=customerStatementQuerySchema.parse(input);return counts.parse(await apiRequest('/api/customer-statements/send-bulk',{method:'POST',headers:{'Idempotency-Key':key},body:JSON.stringify({...q,customerIds:ids})}));},
 async reminders(){return reminderSettingsSchema.parse(await apiRequest('/api/payment-reminders/settings'));},
 async saveReminders(input:ReminderSettingsRequest){const q=reminderSettingsRequestSchema.parse(input);return reminderSettingsSchema.parse(await apiRequest('/api/payment-reminders/settings',{method:'PUT',body:JSON.stringify(q)}));},
 async optOut(kind:'customer'|'invoice',id:string){return preference.parse(await apiRequest(`/api/payment-reminders/${kind==='invoice'?'invoices':'customers'}/${encodeURIComponent(id)}`));},
 async setOptOut(kind:'customer'|'invoice',id:string,optOut:boolean){return preference.parse(await apiRequest(`/api/payment-reminders/${kind==='invoice'?'invoices':'customers'}/${encodeURIComponent(id)}`,{method:'PUT',body:JSON.stringify({optOut})}));},
 async logs(id:string){return z.object({logs:z.array(reminderLogSchema)}).parse(await apiRequest(`/api/invoices/${encodeURIComponent(id)}/reminder-log`));},
};
