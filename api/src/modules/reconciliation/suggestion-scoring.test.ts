import { describe, expect, it } from 'vitest';
import { scoreSuggestion } from './suggestion-scoring';

describe('bank suggestion scoring', () => {
  it('ranks an exact amount and reference match at least 95', () => {
    const result = scoreSuggestion({
      transactionAmount: '100.00',
      transactionDate: '2026-11-06',
      transactionReference: 'INV-1042',
      transactionDescription: 'Payment INV-1042 ACME Limited',
      candidateAmount: '100.00',
      candidateDate: '2026-11-05',
      candidateReference: 'INV-1042',
      candidateDescription: 'Invoice INV-1042',
      candidateCounterparty: 'ACME Limited',
    });
    expect(result?.score).toBeGreaterThanOrEqual(95);
    expect(result?.reasons).toContain('Exact amount match');
    expect(result?.reasons).toContain('Reference match');
  });

  it('returns no suggestion below the 70 threshold', () => {
    expect(scoreSuggestion({
      transactionAmount: '100.00',
      transactionDate: '2026-11-06',
      transactionReference: null,
      transactionDescription: 'Unrelated payment',
      candidateAmount: '250.00',
      candidateDate: '2026-09-01',
      candidateReference: 'BILL-99',
      candidateDescription: 'Different supplier',
      candidateCounterparty: 'Elsewhere Limited',
    })).toBeNull();
  });
});
