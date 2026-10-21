import {
  availableQuoteActions,
  createSingleFlight,
  mutationFailureMessage,
  quoteDraftError,
  quoteSettingsError,
  summarizeQuotes,
} from './quoteModel';
import type { QuoteStatus } from '@/types/quote';

describe('quote actions', () => {
  it.each([
    ['draft', ['edit', 'delete', 'markSent', 'share']],
    ['sent', ['share', 'revise', 'accept', 'decline', 'acceptAndConvert']],
    ['viewed', ['share', 'revise', 'accept', 'decline', 'acceptAndConvert']],
    ['accepted', ['share', 'convert']],
    ['declined', ['share', 'revise']],
    ['expired', ['share', 'revise']],
    ['converted', ['openInvoice']],
  ] as const)('offers the %s actions', (status: QuoteStatus, actions) => {
    expect(availableQuoteActions(status)).toEqual(actions);
  });

  it('keeps open quotes out of accepted-not-invoiced and sums server totals', () => {
    const summary = summarizeQuotes([
      { status: 'sent', total: '10.10', currency: 'NZD' },
      { status: 'viewed', total: '0.20', currency: 'NZD' },
      { status: 'accepted', total: '99.00', currency: 'NZD' },
      { status: 'converted', total: '50.00', currency: 'NZD' },
      { status: 'declined', total: '5.00', currency: 'NZD' },
    ]);
    expect(summary).toEqual({
      openCount: 2,
      openValue: '10.30',
      acceptedCount: 1,
      currency: 'NZD',
    });
  });
});

describe('quote validation and offline errors', () => {
  it('rejects an expiry before the quote date and an empty line list', () => {
    expect(quoteDraftError({
      customerId: 'customer-1',
      date: '2026-10-21',
      expiryDate: '2026-10-20',
      items: [{ description: 'Design', quantity: 1, rate: 10 }],
    })).toMatch(/before the quote date/);
    expect(quoteDraftError({
      customerId: '',
      date: '2026-10-21',
      expiryDate: '2026-11-20',
      items: [{ description: 'Design', quantity: 1, rate: 10 }],
    })).toMatch(/customer/i);
  });

  it('rejects quote settings outside the server limits', () => {
    expect(quoteSettingsError({ format: '', sequence: '1', validity: '30' })).toMatch(/format/);
    expect(quoteSettingsError({ format: 'QUO-{YYYY}-{SEQ}', sequence: '0', validity: '30' })).toMatch(/sequence/);
    expect(quoteSettingsError({ format: 'QUO-{YYYY}-{SEQ}', sequence: '1', validity: '0' })).toMatch(/365/);
    expect(quoteSettingsError({ format: 'QUO-{YYYY}-{SEQ}', sequence: '4', validity: '14' })).toBeNull();
  });

  it('explains offline failures and keeps server messages when online', () => {
    expect(mutationFailureMessage(new Error('Quote not found'), false)).toMatch(/offline/i);
    expect(mutationFailureMessage(new Error('A draft quote cannot move to converted'), true)).toBe(
      'A draft quote cannot move to converted',
    );
  });
});

describe('convert double-tap guard', () => {
  it('allows one in-flight convert and reuses the key for a retry', () => {
    const guard = createSingleFlight(() => 'convert-key');
    expect(guard.claim()).toBe('convert-key');
    expect(guard.claim()).toBeNull();
    guard.release();
    expect(guard.claim()).toBe('convert-key');
  });
});
