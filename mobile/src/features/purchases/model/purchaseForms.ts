export interface BillPaymentDraft {
  bankAccountId: string;
  amount: string;
  paymentDate: string;
  referenceNumber: string;
}

export function isBillDateRangeValid(issueDate: string, dueDate: string) {
  return Boolean(issueDate && dueDate && dueDate >= issueDate);
}

export function moveDueDateForward(issueDate: string, dueDate: string) {
  return dueDate < issueDate ? issueDate : dueDate;
}

export function createBillPaymentDraft(balanceDue: string, paymentDate: string): BillPaymentDraft {
  return {
    bankAccountId: '',
    amount: balanceDue,
    paymentDate,
    referenceNumber: '',
  };
}
