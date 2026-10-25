import * as SecureStore from 'expo-secure-store';
import { clearCookies, rememberSessionToken } from '@/features/auth/api/cookieJar';
import { invoiceService } from '@/services/invoiceService';

const invoiceDto = {
  id: '11111111-1111-1111-1111-111111111111',
  invoiceNumber: 'INV-2026-0001',
  customerId: '22222222-2222-2222-2222-222222222222',
  date: '2026-09-08',
  dueDate: '2026-10-08',
  paymentTermDays: 30,
  subtotal: '100.00',
  taxAmount: '15.00',
  discountType: 'fixed',
  discountPercent: null,
  discount: '0',
  additionalCharges: null,
  total: '115.00',
  totalPaid: '0',
  balanceDue: '115.00',
  paymentStatus: 'unpaid',
  taxInclusive: false,
  status: 'draft',
  notes: null,
  terms: null,
  currency: 'NZD',
  customerName: 'Acme Ltd',
  items: [
    {
      id: '33333333-3333-3333-3333-333333333333',
      description: 'Work',
      quantity: '1',
      unit: 'ea',
      rate: '100',
      rateUnit: 'ea',
      tax: '15',
      total: '115',
    },
  ],
  createdAt: '2026-09-08T00:00:00.000Z',
  updatedAt: '2026-09-08T00:00:00.000Z',
};

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe('InvoiceService (Hono)', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_INVOICES_API = 'true';
    process.env.EXPO_PUBLIC_CUSTOMERS_API = 'true';
    process.env.EXPO_PUBLIC_API_URL = 'http://127.0.0.1:3001';
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('lists invoices through /api/invoices without Supabase auth', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ invoices: [invoiceDto] }));

    const invoices = await invoiceService.fetchInvoices();

    expect(invoices).toHaveLength(1);
    expect(invoices[0].invoiceNumber).toBe('INV-2026-0001');
    expect(invoices[0].customer?.name).toBe('Acme Ltd');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:3001/api/invoices',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('loads an invoice through GET /api/invoices/:id', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse(invoiceDto));

    const invoice = await invoiceService.fetchInvoiceById(invoiceDto.id);

    expect(invoice.items).toHaveLength(1);
    expect(invoice.items[0].description).toBe('Work');
    expect(global.fetch).toHaveBeenCalledWith(
      `http://127.0.0.1:3001/api/invoices/${invoiceDto.id}`,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('creates an invoice through POST /api/invoices', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse(invoiceDto, 201));

    const created = await invoiceService.createInvoice(
      {
        customerId: invoiceDto.customerId,
        date: invoiceDto.date,
        dueDate: invoiceDto.dueDate,
        currency: 'NZD',
        subtotal: 100,
        taxAmount: 15,
        total: 115,
        status: 'draft',
      },
      [{ id: 'tmp', description: 'Work', quantity: 1, unit: 'ea', rate: 100, total: 100 }],
    );

    expect(created.id).toBe(invoiceDto.id);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:3001/api/invoices',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('asks Hono for the next invoice number', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse({ invoiceNumber: 'INV-2026-0002' }),
    );

    await expect(invoiceService.generateInvoiceNumber()).resolves.toBe('INV-2026-0002');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:3001/api/invoices/next-number',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('creates a public share snapshot and maps the unauthenticated snapshot', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(
        jsonResponse({ shareToken: 'org-1_token-1', expiresAt: null, isActive: true }, 201),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          invoice: invoiceDto,
          templateName: 'classic',
          businessProfile: {
            id: '44444444-4444-4444-4444-444444444444',
            name: 'LedgerCraft Studio',
            email: 'hello@example.com',
            phone: null,
            address: null,
            city: null,
            state: null,
            zip: null,
            country: 'NZ',
            taxId: null,
            logoUrl: null,
            website: null,
            defaultTaxRate: '15',
            defaultTerms: null,
            paymentTermDays: 30,
            defaultNotes: null,
            bankInfo: null,
            bankAccountName: 'LedgerCraft Studio',
            bankAccountNumber: '12-3456-7890123-00',
            theme: null,
            invoiceNumberFormat: 'INV-{YYYY}-{SEQ}',
            invoiceNumberSequence: 2,
            createdAt: '2026-10-01T00:00:00.000Z',
            updatedAt: '2026-10-01T00:00:00.000Z',
          },
        }),
      );

    const share = await invoiceService.createShareLink(invoiceDto.id, 'classic');
    const snapshot = await invoiceService.fetchSharedInvoice(share.shareToken);
    if (snapshot === 'inactive' || snapshot === null) throw new Error('expected a shared invoice');

    expect(share.shareToken).toBe('org-1_token-1');
    expect(snapshot.invoice.invoiceNumber).toBe('INV-2026-0001');
    expect(snapshot.businessProfile.bankAccountNumber).toBe('12-3456-7890123-00');
    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      `http://127.0.0.1:3001/api/invoices/${invoiceDto.id}/share`,
      expect.objectContaining({ method: 'POST' }),
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:3001/api/public/invoices/org-1_token-1',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('uses dedicated lifecycle endpoints for cancel, restore and duplicate', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse({ ...invoiceDto, status: 'cancelled' }))
      .mockResolvedValueOnce(jsonResponse(invoiceDto))
      .mockResolvedValueOnce(jsonResponse({ ...invoiceDto, id: '99999999-9999-9999-9999-999999999999', invoiceNumber: 'INV-2026-0002' }, 201));

    await invoiceService.updateInvoiceStatus(invoiceDto.id, 'cancelled');
    await invoiceService.restoreInvoice(invoiceDto.id);
    const copy = await invoiceService.duplicateInvoice(invoiceDto.id);

    expect(copy.invoiceNumber).toBe('INV-2026-0002');
    expect(global.fetch).toHaveBeenNthCalledWith(1, expect.stringContaining(`/invoices/${invoiceDto.id}/cancel`), expect.objectContaining({ method: 'POST' }));
    expect(global.fetch).toHaveBeenNthCalledWith(2, expect.stringContaining(`/invoices/${invoiceDto.id}/restore`), expect.objectContaining({ method: 'POST' }));
    expect(global.fetch).toHaveBeenNthCalledWith(3, expect.stringContaining(`/invoices/${invoiceDto.id}/duplicate`), expect.objectContaining({ method: 'POST' }));
  });

  it('returns null for an invalid or expired public share token', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse({ error: { message: 'Invoice not found' } }, 404),
    );

    await expect(invoiceService.fetchSharedInvoice('expired-token')).resolves.toBeNull();
  });

  it('treats a revoked or expired public share as inactive', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse({
        error: { code: 'SHARE_INACTIVE', message: 'This link is no longer active' },
      }, 410),
    );

    await expect(invoiceService.fetchSharedInvoice('revoked-token')).resolves.toBe('inactive');
  });

  it('reads a public invoice with the token only and does not send or store a session', async () => {
    await clearCookies();
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('better-auth.session_token=secret-session');
    await rememberSessionToken('secret-session');
    (SecureStore.setItemAsync as jest.Mock).mockClear();
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse({
        error: { code: 'SHARE_INACTIVE', message: 'This link is no longer active' },
      }, 410),
    );

    await expect(invoiceService.fetchSharedInvoice('org_secret-token')).resolves.toBe('inactive');

    const init = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(init.credentials).toBe('omit');
    expect(headers.Cookie).toBeUndefined();
    expect(headers.Authorization).toBeUndefined();
    expect(JSON.stringify(headers)).not.toContain('secret-session');
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(
      'http://127.0.0.1:3001/api/public/invoices/org_secret-token',
    );
  });

  it('treats a SHARE_INACTIVE code as inactive even when the status is unexpected', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse({
        error: { code: 'SHARE_INACTIVE', message: 'This link is no longer active' },
      }, 409),
    );

    await expect(invoiceService.fetchSharedInvoice('revoked-token')).resolves.toBe('inactive');
  });
});

// Transport assertions complement the component confirmation/cancellation coverage.
describe('invoice sharing controls transport', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_API_URL = 'http://127.0.0.1:3001';
    global.fetch = jest.fn();
  });

  it('lists server status, opts into replacement explicitly, and revokes invoice-wide', async () => {
    const share = { shareToken: 'private-token', templateName: 'modern', isActive: true, expiresAt: '2099-10-26T00:00:00Z', accessCount: 0, createdAt: '2026-10-25T00:00:00Z' };
    jest.mocked(global.fetch)
      .mockResolvedValueOnce(jsonResponse({ shares: [share] }) as Response)
      .mockResolvedValueOnce(jsonResponse(share) as Response)
      .mockResolvedValueOnce(jsonResponse({ revoked: 2 }) as Response);
    await expect(invoiceService.listShareLinks('invoice/id')).resolves.toEqual([share]);
    await expect(invoiceService.createShareLink('invoice/id', 'modern', { replace: true, expiresAt: null })).resolves.toEqual(share);
    await expect(invoiceService.revokeShareLinks('invoice/id')).resolves.toEqual({ revoked: 2 });
    expect(global.fetch).toHaveBeenNthCalledWith(1, 'http://127.0.0.1:3001/api/invoices/invoice%2Fid/shares', expect.objectContaining({ method: 'GET' }));
    expect(global.fetch).toHaveBeenNthCalledWith(2, 'http://127.0.0.1:3001/api/invoices/invoice%2Fid/share', expect.objectContaining({ method: 'POST', body: JSON.stringify({ templateName: 'modern', replace: true, expiresAt: null }) }));
    expect(global.fetch).toHaveBeenNthCalledWith(3, 'http://127.0.0.1:3001/api/invoices/invoice%2Fid/shares/revoke', expect.objectContaining({ method: 'POST', body: '{}' }));
  });

  it('posts send and remind and keeps the EMAIL_UNAVAILABLE message', async () => {
    const unavailable = {
      error: {
        code: 'EMAIL_UNAVAILABLE',
        message: 'Email delivery is unavailable. Download or share the invoice instead.',
      },
    };
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse(unavailable, 503))
      .mockResolvedValueOnce(jsonResponse(unavailable, 503));

    await expect(invoiceService.sendInvoice(invoiceDto.id)).rejects.toMatchObject({
      status: 503,
      code: 'EMAIL_UNAVAILABLE',
      message: 'Email delivery is unavailable. Download or share the invoice instead.',
    });
    await expect(invoiceService.remindInvoice(invoiceDto.id, {
      subject: 'Payment reminder for invoice INV-2026-0001',
      html: '<p>Please pay invoice INV-2026-0001.</p>',
      reminderType: 'gentle',
    })).rejects.toMatchObject({ code: 'EMAIL_UNAVAILABLE' });

    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      `http://127.0.0.1:3001/api/invoices/${invoiceDto.id}/send`,
      expect.objectContaining({ method: 'POST', body: '{}' }),
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      `http://127.0.0.1:3001/api/invoices/${invoiceDto.id}/remind`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          subject: 'Payment reminder for invoice INV-2026-0001',
          html: '<p>Please pay invoice INV-2026-0001.</p>',
          reminderType: 'gentle',
        }),
      }),
    );
  });
});
