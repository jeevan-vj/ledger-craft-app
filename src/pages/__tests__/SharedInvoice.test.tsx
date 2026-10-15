import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import SharedInvoice from '../SharedInvoice';
import { invoicesApi } from '@/features/invoices/api/invoicesApi';
import { generateInvoicePdf } from '@/utils/pdfUtils';

vi.mock('@/features/invoices/api/invoicesApi', () => ({ invoicesApi: { getShared: vi.fn() } }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/utils/pdfUtils', () => ({ generateInvoicePdf: vi.fn().mockResolvedValue(undefined) }));
const snapshot = {
  invoiceData: {
    id: 'invoice-1', invoiceNumber: 'INV-SHARE-1', date: '2026-09-15', dueDate: '2026-10-15',
    customer: { name: 'Recipient Ltd' }, items: [{ id: 'line-1', description: 'Design', quantity: 1, rate: 100, total: 100 }],
    subtotal: 100, taxAmount: 15, taxRate: 15, total: 115, currency: 'NZD', status: 'draft',
    notes: 'Thank you', terms: 'Due in 30 days',
  },
  templateData: { templateName: 'classic', businessProfile: { name: 'Sender Ltd', bankAccountName: 'Sender Account', bankAccountNumber: '12-3456-7890123-00' } },
};
function mount() {
  return render(<MemoryRouter initialEntries={['/shared/invoice/token']}><Routes><Route path="/shared/invoice/:shareToken" element={<SharedInvoice />} /></Routes></MemoryRouter>);
}
beforeEach(() => { vi.clearAllMocks(); vi.mocked(invoicesApi.getShared).mockResolvedValue(snapshot as never); });
it('shows the recipient invoice with its bank details and actual tax rate', async () => {
  mount();
  expect(await screen.findByText('Recipient Ltd')).toBeInTheDocument();
  expect(screen.getByText('Sender Account')).toBeInTheDocument();
  expect(screen.getByText('12-3456-7890123-00')).toBeInTheDocument();
  expect(screen.getByText(/15\.00%/)).toBeInTheDocument();
});
it('downloads the rendered invoice, excluding page controls', async () => {
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Download PDF' }));
  await waitFor(() => expect(generateInvoicePdf).toHaveBeenCalled());
  const element = vi.mocked(generateInvoicePdf).mock.calls[0][1];
  expect(element).toBeInstanceOf(HTMLElement);
  expect(element.textContent).toContain('Recipient Ltd');
  expect(element.textContent).not.toContain('Download PDF');
});
it('explains an invalid or expired link without offering a download', async () => {
  vi.mocked(invoicesApi.getShared).mockResolvedValue(null);
  mount();
  expect(await screen.findByText('Invoice Not Found')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Download PDF' })).not.toBeInTheDocument();
});
