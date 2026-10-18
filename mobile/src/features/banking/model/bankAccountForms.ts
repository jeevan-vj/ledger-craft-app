import type { BankAccountDto, BankAccountType, BankAccountWriteRequest } from '@/features/banking/api/bankingApi';

export interface BankAccountDraft {
  accountName: string;
  accountNumber: string;
  bankName: string;
  accountType: BankAccountType;
  currency: string;
  openingBalance: string;
  currentBalance: string;
  isActive: boolean;
}

export const emptyBankAccountDraft = (): BankAccountDraft => ({
  accountName: '', accountNumber: '', bankName: '', accountType: 'business', currency: 'NZD',
  openingBalance: '0', currentBalance: '0', isActive: true,
});

const signedDecimal = /^-?\d+(\.\d+)?$/;

export function validateBankAccountDraft(draft: BankAccountDraft): Partial<Record<keyof BankAccountDraft, string>> {
  const errors: Partial<Record<keyof BankAccountDraft, string>> = {};
  if (!draft.accountName.trim()) errors.accountName = 'Account name is required.';
  if (!draft.accountNumber.trim()) errors.accountNumber = 'Account number is required.';
  if (!draft.bankName.trim()) errors.bankName = 'Bank name is required.';
  if (!/^[A-Z]{3}$/.test(draft.currency.trim())) errors.currency = 'Use a three-letter currency code.';
  if (!signedDecimal.test(draft.openingBalance.trim())) errors.openingBalance = 'Enter a valid decimal amount.';
  if (!signedDecimal.test(draft.currentBalance.trim())) errors.currentBalance = 'Enter a valid decimal amount.';
  return errors;
}

export function bankAccountPayloadFromDraft(draft: BankAccountDraft): BankAccountWriteRequest {
  return {
    ...draft,
    accountName: draft.accountName.trim(), accountNumber: draft.accountNumber.trim(), bankName: draft.bankName.trim(),
    currency: draft.currency.trim(), openingBalance: draft.openingBalance.trim(), currentBalance: draft.currentBalance.trim(),
  };
}

export function bankAccountDraftFromRecord(account: BankAccountDto): BankAccountDraft {
  return {
    accountName: account.accountName, accountNumber: account.accountNumber, bankName: account.bankName,
    accountType: account.accountType, currency: account.currency, openingBalance: account.openingBalance,
    currentBalance: account.currentBalance, isActive: account.isActive,
  };
}

export function hasBankAccountFormChanged(draft: BankAccountDraft, initial: BankAccountDraft): boolean {
  return JSON.stringify(draft) !== JSON.stringify(initial);
}
