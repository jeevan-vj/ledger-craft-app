import { z } from 'zod';
import { createCreditNoteRequestSchema, refundCreditNoteRequestSchema } from '@ledgercraft/contracts';
import { pendingMutation } from '@/features/accounting/pendingMutation';
const operationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('issue'), payload: createCreditNoteRequestSchema }),
  z.object({ kind: z.literal('refund'), creditNoteId: z.string().min(1), payload: refundCreditNoteRequestSchema }),
]);
export type CreditOperation = z.infer<typeof operationSchema>;
const target = (invoiceId: string) => `credit-operation.${invoiceId}`;
function parse(value: unknown, invoiceId: string) { const operation = operationSchema.parse(value); if (operation.kind === 'issue' && operation.payload.invoiceId !== invoiceId) throw new Error('Saved credit operation belongs to a different invoice.'); return operation; }
export const pendingCreditOperation = {
  load: (ownerId: string, invoiceId: string) => pendingMutation.load(ownerId, target(invoiceId), (value) => parse(value, invoiceId)),
  claim: (ownerId: string, invoiceId: string, input: CreditOperation) => pendingMutation.claim(ownerId, target(invoiceId), input, (value) => parse(value, invoiceId)),
  fail: (ownerId: string, invoiceId: string, status: number) => pendingMutation.fail(ownerId, target(invoiceId), status),
  clear: (ownerId: string, invoiceId: string) => pendingMutation.clear(ownerId, target(invoiceId)),
};
