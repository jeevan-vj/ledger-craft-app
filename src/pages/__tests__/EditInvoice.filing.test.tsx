import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { InvoicesApiError } from '@/features/invoices/api/invoicesApi';

const navigate = vi.fn();
const updateInvoice = vi.fn();
const filingMessage = 'Save the IRD accounting basis, filing frequency and period-ending month in GST settings before sending this tax invoice. Drafts can still be edited.';
let submit: (() => Promise<unknown>) | undefined;

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/features/customers/hooks/useCustomerDirectory', () => ({ useCustomerDirectory: () => ({ customers: [], isLoadingCustomers: false, createCustomer: vi.fn() }) }));
vi.mock('@/hooks/useAppData', () => ({
  useAppData: () => ({
    getInvoice: vi.fn().mockResolvedValue({ id: 'inv-1', invoiceNumber: 'INV-1', status: 'draft', date: '2026-10-15', dueDate: '2026-11-15', items: [], customerId: 'cust-1' }),
    updateInvoice,
    businessProfile: { name: 'Kauri Studio', country: 'NZ' },
    items: [],
    isLoadingItems: false,
    refreshInvoices: vi.fn(),
  }),
}));
vi.mock('@/features/invoices/api/invoicesApi', () => ({
  invoicesApi: { send: vi.fn() },
  InvoicesApiError: class InvoicesApiError extends Error {
    constructor(message: string, readonly status: number, readonly code?: string) { super(message); this.name = 'InvoicesApiError'; }
  },
}));
vi.mock('@/components/invoice/InvoiceForm', () => ({
  default: ({ onSubmit }: { onSubmit: (...args: unknown[]) => Promise<unknown> }) => {
    submit = () => onSubmit({ date: new Date('2026-10-15'), dueDate: new Date('2026-11-15'), paymentTermDays: 30, templateName: 'classic' }, [], 115, 100, 15, 0, 0, [], 'send');
    return <button type="button">Edit form</button>;
  },
}));

describe('EditInvoice blocked send', () => {
  it('rethrows a GST filing error so the form does not treat the send as saved', async () => {
    updateInvoice.mockResolvedValue({ id: 'inv-1', invoiceNumber: 'INV-1' });
    const { invoicesApi } = await import('@/features/invoices/api/invoicesApi');
    vi.mocked(invoicesApi.send).mockRejectedValue(new InvoicesApiError(filingMessage, 422, 'GST_FILING_SETTINGS_REQUIRED'));
    const { default: EditInvoice } = await import('../EditInvoice');
    render(<MemoryRouter initialEntries={['/invoices/inv-1/edit']}><Routes><Route path="/invoices/:id/edit" element={<EditInvoice />} /></Routes></MemoryRouter>);
    await screen.findByText('Edit form');
    await expect(submit!()).rejects.toMatchObject({ code: 'GST_FILING_SETTINGS_REQUIRED' });
    await waitFor(() => expect(screen.getByRole('link', { name: 'Open GST settings' })).toHaveAttribute('href', '/tax-config'));
    expect(navigate).not.toHaveBeenCalled();
  });
});
