import { bankFeedSummarySchema } from '@ledgercraft/contracts';
import { apiRequest } from '@/features/auth/api/http';
export const bankFeedsApi={summary:async()=>bankFeedSummarySchema.parse(await apiRequest('/api/bank-feeds/akahu',{method:'GET'}))};
