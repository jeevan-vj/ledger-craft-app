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

    expect(share.shareToken).toBe('org-1_token-1');
    expect(snapshot?.invoice.invoiceNumber).toBe('INV-2026-0001');
    expect(snapshot?.businessProfile.bankAccountNumber).toBe('12-3456-7890123-00');
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

  it('returns null for an invalid or expired public share token', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse({ error: { message: 'Invoice not found' } }, 404),
    );

    await expect(invoiceService.fetchSharedInvoice('expired-token')).resolves.toBeNull();
  });
});
