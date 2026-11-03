import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { businessProfileService } from '@/services/businessProfileService';
import { mockBusinessTheme, mockOnboardingData } from '@/__tests__/fixtures/onboarding.fixtures';
import { PRESET_THEMES } from '@/features/business-profile/theme';

jest.mock('expo-file-system/legacy', () => ({
  getInfoAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  EncodingType: { Base64: 'base64' },
}));

jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
  manipulateAsync: jest.fn(),
}));

const getInfoAsync = FileSystem.getInfoAsync as jest.Mock;
const readAsStringAsync = FileSystem.readAsStringAsync as jest.Mock;
const manipulateAsync = ImageManipulator.manipulateAsync as jest.Mock;

const dto = {
  id: 'profile-1', name: 'LedgerCraft Studio', email: 'owner@example.com', phone: null,
  address: null, city: null, state: null, zip: null, country: 'NZ', taxId: null,
  logoUrl: null, website: null, defaultTaxRate: '15', defaultTerms: null,
  gstRegistrationStatus: 'registered' as const,
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
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body as string);
    expect(body).toEqual(expect.objectContaining({
      name: dto.name,
      email: dto.email,
      gstRegistrationStatus: 'registered',
      defaultTaxRate: '15',
      theme: {
        primary: '#163300',
        secondary: '#3B4DE6',
        accent: '#4F63D7',
        text: '#1E293B',
        textLight: '#64748B',
        background: '#F5F6F3',
        surface: '#FFFFFF',
      },
    }));
    expect(body.theme).not.toHaveProperty('name');
  });

  it('sends a not-registered GST choice as a zero tax rate string', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ ...dto, gstRegistrationStatus: 'not_registered', defaultTaxRate: '0' }));
    await businessProfileService.createBusinessProfile({
      ...mockOnboardingData,
      businessName: dto.name,
      businessEmail: dto.email,
      gstRegistrationStatus: 'not_registered',
      defaultTaxRate: 0,
      logoUri: undefined,
    });
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body as string);
    expect(body.gstRegistrationStatus).toBe('not_registered');
    expect(body.defaultTaxRate).toBe('0');
    expect(body.theme.background).toBe('#F5F6F3');
  });

  it('gets the current profile and maps 404 to null', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse(dto))
      .mockResolvedValueOnce(jsonResponse({ message: 'Not found' }, 404));
    await expect(businessProfileService.getBusinessProfile()).resolves.toEqual(expect.objectContaining({ id: dto.id }));
    await expect(businessProfileService.getBusinessProfile()).resolves.toBeNull();
  });

  it('saves a theme with contract colours only', async () => {
    const theme = { ...PRESET_THEMES.slate, name: 'Slate' };
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse(dto))
      .mockResolvedValueOnce(jsonResponse({ ...dto, theme: PRESET_THEMES.slate }));
    await businessProfileService.updateBusinessProfile({ theme });
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[1][1].body as string);
    expect(body.theme).toEqual(PRESET_THEMES.slate);
    expect(body.theme).not.toHaveProperty('name');
  });

  it('updates the profile without losing existing required fields', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse(dto))
      .mockResolvedValueOnce(jsonResponse({ ...dto, name: 'Updated Studio' }));
    await expect(businessProfileService.updateBusinessProfile({ businessName: 'Updated Studio' }))
      .resolves.toEqual(expect.objectContaining({ name: 'Updated Studio' }));
  });

  it('clears a phone number when the form sends null', async () => {
    const current = { ...dto, phone: '555-0100' };
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse(current))
      .mockResolvedValueOnce(jsonResponse({ ...current, phone: null }));
    await businessProfileService.updateBusinessProfile({ phone: null });
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[1][1].body as string);
    expect(body.phone).toBeNull();
  });

  it('uploads a content URI with the picker mime type when the storage flag is off', async () => {
    delete process.env.EXPO_PUBLIC_STORAGE_API;
    const png = 'iVBORw0KGgo=';
    getInfoAsync.mockResolvedValue({ exists: true, size: 120, isDirectory: false, uri: 'file:///cache/logo.png' });
    readAsStringAsync.mockResolvedValue(png);
    manipulateAsync.mockResolvedValue({ uri: 'file:///cache/logo.png', width: 1024, height: 683 });
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse(dto))
      .mockResolvedValueOnce(jsonResponse({
        key: 'org/logos/logo.png',
        url: '/api/objects?key=org%2Flogos%2Flogo.png',
        contentType: 'image/png',
        size: 8,
        kind: 'logo',
      }, 201))
      .mockResolvedValueOnce(jsonResponse({ ...dto, logoUrl: `data:image/png;base64,${png}` }));

    const saved = await businessProfileService.updateBusinessProfile({
      logo: {
        uri: 'content://media/external/images/media/42',
        mimeType: 'image/png',
        fileName: null,
        width: 1200,
        height: 800,
      },
    });

    expect(saved.logoUrl).toBe(`data:image/png;base64,${png}`);
    const post = (global.fetch as jest.Mock).mock.calls.find((call) => String(call[0]).endsWith('/api/objects'));
    expect(post?.[1].method).toBe('POST');
    expect(JSON.parse(post[1].body as string)).toEqual({
      kind: 'logo',
      filename: 'logo.png',
      contentType: 'image/png',
      contentBase64: png,
    });
    const put = JSON.parse((global.fetch as jest.Mock).mock.calls[2][1].body as string);
    expect(put.logoUrl).toBe(`data:image/png;base64,${png}`);
    expect(manipulateAsync).toHaveBeenCalledWith(
      'content://media/external/images/media/42',
      [{ resize: { width: 1024 } }],
      expect.objectContaining({ format: 'png', base64: false }),
    );
  });

  it('stores a JPEG when the picker mime is HEIC and the URI has no extension', async () => {
    delete process.env.EXPO_PUBLIC_STORAGE_API;
    const jpeg = 'c21hbGw=';
    getInfoAsync.mockResolvedValue({ exists: true, size: 80, isDirectory: false, uri: 'file:///cache/logo.jpg' });
    readAsStringAsync.mockResolvedValue(jpeg);
    manipulateAsync.mockResolvedValue({ uri: 'file:///cache/logo.jpg', width: 1024, height: 768 });
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse(dto))
      .mockResolvedValueOnce(jsonResponse({
        key: 'org/logos/logo.jpg',
        url: '/api/objects?key=org%2Flogos%2Flogo.jpg',
        contentType: 'image/jpeg',
        size: 6,
        kind: 'logo',
      }, 201))
      .mockResolvedValueOnce(jsonResponse({ ...dto, logoUrl: `data:image/jpeg;base64,${jpeg}` }));

    await businessProfileService.updateBusinessProfile({
      logo: {
        uri: 'content://media/external/images/media/99',
        mimeType: 'image/heic',
        width: 800,
        height: 800,
      },
    });

    const post = (global.fetch as jest.Mock).mock.calls.find((call) => String(call[0]).endsWith('/api/objects'));
    const body = JSON.parse(post[1].body as string);
    expect(body.contentType).toBe('image/jpeg');
    expect(body.filename).toBe('logo.jpg');
    expect(body.contentType).not.toContain('content://');
    expect(body.filename).not.toContain('session');
  });

  it('refuses to save the profile when the logo upload is rejected', async () => {
    getInfoAsync.mockResolvedValue({ exists: true, size: 120, isDirectory: false, uri: 'file:///cache/logo.png' });
    readAsStringAsync.mockResolvedValue('iVBORw0KGgo=');
    manipulateAsync.mockResolvedValue({ uri: 'file:///cache/logo.png', width: 512, height: 512 });
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse(dto))
      .mockResolvedValueOnce(jsonResponse({
        error: { code: 'VALIDATION_ERROR', message: 'Unsupported content type', requestId: 'req-1' },
      }, 400));

    await expect(businessProfileService.updateBusinessProfile({
      logo: { uri: 'file:///logo.png', mimeType: 'image/png', width: 400, height: 400 },
    })).rejects.toThrow('The logo could not be uploaded. Use a JPG, PNG, or WebP image under 1 MB.');

    const puts = (global.fetch as jest.Mock).mock.calls.filter((call) => (
      String(call[0]).includes('/api/business-profile') && call[1]?.method === 'PUT'
    ));
    expect(puts).toHaveLength(0);
  });

  it('reports a connection failure instead of saving the profile without the logo', async () => {
    getInfoAsync.mockResolvedValue({ exists: true, size: 120, isDirectory: false, uri: 'file:///cache/logo.png' });
    readAsStringAsync.mockResolvedValue('iVBORw0KGgo=');
    manipulateAsync.mockResolvedValue({ uri: 'file:///cache/logo.png', width: 400, height: 400 });
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse(dto))
      .mockRejectedValueOnce(new Error('network down'));

    await expect(businessProfileService.updateBusinessProfile({
      logo: { uri: 'file:///logo.png', mimeType: 'image/png', width: 400, height: 400 },
    })).rejects.toThrow('Check your connection and try again.');

    const puts = (global.fetch as jest.Mock).mock.calls.filter((call) => (
      String(call[0]).includes('/api/business-profile') && call[1]?.method === 'PUT'
    ));
    expect(puts).toHaveLength(0);
  });

  it('refuses to save when the resized logo is still too large', async () => {
    getInfoAsync.mockResolvedValue({ exists: true, size: 2_000_000, isDirectory: false, uri: 'file:///cache/logo.jpg' });
    manipulateAsync.mockResolvedValue({ uri: 'file:///cache/logo.jpg', width: 512, height: 512 });
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse(dto));

    await expect(businessProfileService.updateBusinessProfile({
      logo: { uri: 'content://media/external/images/media/7', mimeType: 'image/jpeg', width: 4000, height: 3000 },
    })).rejects.toThrow('The logo is still too large after resizing. Choose a smaller image.');

    expect((global.fetch as jest.Mock).mock.calls.some((call) => String(call[0]).endsWith('/api/objects'))).toBe(false);
  });
});
