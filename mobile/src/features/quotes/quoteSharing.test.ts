import { buildPublicQuoteUrl, buildQuoteShareMessage, publicQuotePath } from './quoteSharing';

describe('quote sharing', () => {
  const previous = process.env.EXPO_PUBLIC_WEB_URL;

  afterEach(() => {
    process.env.EXPO_PUBLIC_WEB_URL = previous;
  });

  it('builds the public quote URL from the web origin', () => {
    process.env.EXPO_PUBLIC_WEB_URL = 'https://easybiz.iamjeevan.com/';
    expect(publicQuotePath('org/token with spaces')).toBe('shared/quote/org%2Ftoken%20with%20spaces');
    expect(buildPublicQuoteUrl('org_token')).toBe('https://easybiz.iamjeevan.com/shared/quote/org_token');
  });

  it('reads Quote QUO-… from the business in the native share message', () => {
    expect(buildQuoteShareMessage({
      quoteNumber: 'QUO-2026-0001',
      businessName: 'Harbour Studio',
      url: 'https://easybiz.iamjeevan.com/shared/quote/org_token',
    })).toBe(
      'Quote QUO-2026-0001 from Harbour Studio\nhttps://easybiz.iamjeevan.com/shared/quote/org_token',
    );
    expect(buildQuoteShareMessage({
      kind: 'estimate',
      quoteNumber: 'QUO-2026-0002',
      businessName: 'Harbour Studio',
      url: 'https://easybiz.iamjeevan.com/shared/quote/token',
    })).toMatch(/^Estimate QUO-2026-0002 from Harbour Studio/);
  });
});
