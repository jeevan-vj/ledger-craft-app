import { salesSummaryDateSchema, salesSummarySchema, type SalesSummary } from '@ledgercraft/contracts';
import { apiRequest } from '@/features/auth/api/http';

/** A sale's date is the business calendar day, not the phone's or UTC's day. */
export function businessSalesDate(timezone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return salesSummaryDateSchema.parse(`${value('year')}-${value('month')}-${value('day')}`);
}

export const salesSummaryApi = {
  async get(date: string): Promise<SalesSummary> {
    const params = new URLSearchParams({ date: salesSummaryDateSchema.parse(date) });
    return salesSummarySchema.parse(await apiRequest(`/api/sales/summary?${params}`, { method: 'GET' }));
  },
};
