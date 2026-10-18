import { businessProfileService } from '@/services/businessProfileService';
import { mockBusinessTheme, mockOnboardingData } from '@/__tests__/fixtures/onboarding.fixtures';

const dto = {
  id: 'profile-1', name: 'LedgerCraft Studio', email: 'owner@example.com', phone: null,
  address: null, city: null, state: null, zip: null, country: 'NZ', taxId: null,
  logoUrl: null, website: null, defaultTaxRate: '15', defaultTerms: null,
  paymentTermDays: 20, defaultNotes: null, bankInfo: null, theme: mockBusinessTheme,
  invoiceNumberFormat: 'INV-{YYYY}-{SEQ}', invoiceNumberSequence: 1,
  createdAt: '2026-10-18T00:00:00.000Z', updatedAt: '2026-10-18T00:00:00.000Z',
};

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, headers: { get: () => null }, json: async () => body };
}

describe('BusinessProfileService (Hono)', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_BUSINESS_API = 'true';
    process.env.EXPO_PUBLIC_API_URL = 'http://127.0.0.1:3001';
    global.fetch = jest.fn();
  });
  afterEach(() => jest.resetAllMocks());

  it('creates a profile through PUT /api/business-profile', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse(dto));
    const profile = await businessProfileService.createBusinessProfile({ ...mockOnboardingData, businessName: dto.name, businessEmail: dto.email, logoUri: undefined });
    expect(profile).toEqual(expect.objectContaining({ name: dto.name, defaultTaxRate: 15, theme: mockBusinessTheme }));
    expect(global.fetch).toHaveBeenCalledWith('http://127.0.0.1:3001/api/business-profile', expect.objectContaining({ method: 'PUT' }));
  });

  it('gets the current profile and maps 404 to null', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse(dto))
      .mockResolvedValueOnce(jsonResponse({ message: 'Not found' }, 404));
    await expect(businessProfileService.getBusinessProfile()).resolves.toEqual(expect.objectContaining({ id: dto.id }));
    await expect(businessProfileService.getBusinessProfile()).resolves.toBeNull();
  });

  it('updates the profile without losing existing required fields', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse(dto))
      .mockResolvedValueOnce(jsonResponse({ ...dto, name: 'Updated Studio' }));
    await expect(businessProfileService.updateBusinessProfile({ businessName: 'Updated Studio' }))
      .resolves.toEqual(expect.objectContaining({ name: 'Updated Studio' }));
  });
});
