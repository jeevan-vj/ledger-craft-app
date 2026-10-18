import { emptyBankAccountDraft, bankAccountDraftFromRecord, bankAccountPayloadFromDraft, hasBankAccountFormChanged, validateBankAccountDraft } from './bankAccountForms';

describe('bank account forms', () => {
  it('requires account identity and canonical currency', () => {
    expect(validateBankAccountDraft(emptyBankAccountDraft())).toEqual(expect.objectContaining({
      accountName: expect.any(String), accountNumber: expect.any(String), bankName: expect.any(String),
    }));
    expect(validateBankAccountDraft({ ...emptyBankAccountDraft(), accountName: 'Operating', accountNumber: '123', bankName: 'Bank', currency: 'nz' })).toEqual(expect.objectContaining({ currency: expect.any(String) }));
  });

  it('preserves signed decimal text in the API payload', () => {
    const payload = bankAccountPayloadFromDraft({
      ...emptyBankAccountDraft(), accountName: '  Card  ', accountNumber: '  987  ', bankName: '  Example  ',
      accountType: 'credit_card', openingBalance: '-000.1250', currentBalance: '-40.500',
    });
    expect(payload).toEqual(expect.objectContaining({
      accountName: 'Card', accountNumber: '987', bankName: 'Example',
      openingBalance: '-000.1250', currentBalance: '-40.500',
    }));
  });

  it('hydrates records and compares drafts', () => {
    const draft = bankAccountDraftFromRecord({
      id: 'bank-1', accountName: 'Savings', accountNumber: '001', bankName: 'Bank', accountType: 'savings',
      currency: 'AUD', openingBalance: '12.30', currentBalance: '14.40', isActive: false,
      createdAt: '2026-10-19', updatedAt: '2026-10-19',
    });
    expect(draft).toEqual(expect.objectContaining({ accountType: 'savings', openingBalance: '12.30', isActive: false }));
    expect(hasBankAccountFormChanged(draft, draft)).toBe(false);
    expect(hasBankAccountFormChanged({ ...draft, accountName: 'New' }, draft)).toBe(true);
  });
});
