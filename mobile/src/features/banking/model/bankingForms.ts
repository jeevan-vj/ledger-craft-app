import type { BankTransactionDto, BankTransactionWriteRequest, BankTransferWriteRequest } from '../api/bankingApi';

const positiveDecimal = /^\d+(?:\.\d+)?$/;
const dateOnly = /^\d{4}-\d{2}-\d{2}$/;

export interface TransactionDraft {
  transactionDate: string;
  description: string;
  amount: string;
  type: 'debit' | 'credit';
  category: string;
  counterparty: string;
  reference: string;
  notes: string;
}

export interface TransferDraft {
  destinationAccountId: string;
  transactionDate: string;
  amount: string;
  description: string;
  reference: string;
}

export const emptyTransactionDraft = (): TransactionDraft => ({
  transactionDate: new Date().toISOString().slice(0, 10), description: '', amount: '', type: 'debit',
  category: '', counterparty: '', reference: '', notes: '',
});

export const emptyTransferDraft = (): TransferDraft => ({
  destinationAccountId: '', transactionDate: new Date().toISOString().slice(0, 10), amount: '',
  description: 'Account transfer', reference: '',
});

export function transactionDraftFromRecord(row: BankTransactionDto): TransactionDraft {
  return {
    transactionDate: row.transactionDate, description: row.description, amount: row.amount, type: row.type,
    category: row.category ?? '', counterparty: row.counterparty ?? '', reference: row.reference ?? '', notes: row.notes ?? '',
  };
}

export function validateTransactionDraft(draft: TransactionDraft): Partial<Record<keyof TransactionDraft, string>> {
  const errors: Partial<Record<keyof TransactionDraft, string>> = {};
  if (!dateOnly.test(draft.transactionDate)) errors.transactionDate = 'Use YYYY-MM-DD.';
  if (!draft.description.trim()) errors.description = 'Description is required.';
  if (!positiveDecimal.test(draft.amount) || Number(draft.amount) <= 0) errors.amount = 'Enter an amount greater than zero.';
  return errors;
}

export function validateTransferDraft(draft: TransferDraft, sourceAccountId: string): Partial<Record<keyof TransferDraft, string>> {
  const errors: Partial<Record<keyof TransferDraft, string>> = {};
  if (!draft.destinationAccountId) errors.destinationAccountId = 'Choose a destination account.';
  if (draft.destinationAccountId === sourceAccountId) errors.destinationAccountId = 'Choose a different account.';
  if (!dateOnly.test(draft.transactionDate)) errors.transactionDate = 'Use YYYY-MM-DD.';
  if (!positiveDecimal.test(draft.amount) || Number(draft.amount) <= 0) errors.amount = 'Enter an amount greater than zero.';
  if (!draft.description.trim()) errors.description = 'Description is required.';
  return errors;
}

const optional = (value: string) => value.trim() || null;

export function transactionPayload(draft: TransactionDraft, bankAccountId: string): BankTransactionWriteRequest {
  return {
    bankAccountId, transactionDate: draft.transactionDate, description: draft.description.trim(), amount: draft.amount.trim(), type: draft.type,
    category: optional(draft.category), counterparty: optional(draft.counterparty), reference: optional(draft.reference), notes: optional(draft.notes),
    paymentMethod: 'bank_transfer',
  };
}

export function transferPayload(draft: TransferDraft, sourceAccountId: string): BankTransferWriteRequest {
  return {
    sourceAccountId, destinationAccountId: draft.destinationAccountId, transactionDate: draft.transactionDate,
    amount: draft.amount.trim(), description: draft.description.trim(), reference: optional(draft.reference),
  };
}
