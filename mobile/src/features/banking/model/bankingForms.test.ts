import { emptyTransactionDraft, emptyTransferDraft, transactionPayload, transferPayload, validateTransactionDraft, validateTransferDraft } from './bankingForms';

describe('banking forms', () => {
  it('keeps exact transaction amount text in the API payload', () => {
    const draft = { ...emptyTransactionDraft(), description: 'Capital', amount: '9007199254740993.01', type: 'credit' as const };
    expect(validateTransactionDraft(draft)).toEqual({});
    expect(transactionPayload(draft, 'bank-1').amount).toBe('9007199254740993.01');
  });

  it('requires a different destination and keeps transfer decimals exact', () => {
    const draft = { ...emptyTransferDraft(), destinationAccountId: 'bank-1', amount: '10.01' };
    expect(validateTransferDraft(draft, 'bank-1').destinationAccountId).toBeTruthy();
    const valid = { ...draft, destinationAccountId: 'bank-2' };
    expect(validateTransferDraft(valid, 'bank-1')).toEqual({});
    expect(transferPayload(valid, 'bank-1').amount).toBe('10.01');
  });
});
