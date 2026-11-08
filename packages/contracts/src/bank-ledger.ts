import { z } from 'zod';
/** Prepare an owned bank's ledger identity; this never posts opening money. */
export const prepareBankLedgerRequestSchema = z.object({ bankAccountId: z.string().uuid() }).strict();
export type PrepareBankLedgerRequest = z.infer<typeof prepareBankLedgerRequestSchema>;
