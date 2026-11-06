import { recordBillPaymentRequestSchema, type RecordBillPaymentRequest } from '@ledgercraft/contracts';
import { pendingMutation, type PendingMutation } from '@/features/accounting/pendingMutation';
export type PendingBillPayment = PendingMutation<RecordBillPaymentRequest>;
const target = (billId: string) => `bill-payment.${billId}`;
export const pendingBillPayment = {
  load: (ownerId: string, billId: string) => pendingMutation.load(ownerId, target(billId), (input) => recordBillPaymentRequestSchema.parse(input)),
  claim: (ownerId: string, billId: string, input: RecordBillPaymentRequest) => pendingMutation.claim(ownerId, target(billId), input, (value) => recordBillPaymentRequestSchema.parse(value)),
  fail: (ownerId: string, billId: string, status: number) => pendingMutation.fail(ownerId, target(billId), status),
  clear: (ownerId: string, billId: string) => pendingMutation.clear(ownerId, target(billId)),
};
