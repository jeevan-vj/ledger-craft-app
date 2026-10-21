import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import InvoiceForm from '../InvoiceForm';
import type { BusinessProfile, Customer } from '@/types';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn(), useBlocker: () => ({ state: 'unblocked' }) };
});
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/utils/pdfUtils', () => ({ generateInvoicePdf: vi.fn() }));
vi.mock('@/hooks/useAppData', () => ({ useAppData: () => ({ units: ['each'], itemCategories: [] }) }));
vi.mock('@/components/ui/form', () => ({
  Form: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FormControl: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FormField: ({ render }: { render?: (props: { field: { value: string; onChange: () => void } }) => React.ReactNode }) => (
    render ? <>{render({ field: { value: '', onChange: vi.fn() } })}</> : null
  ),
  FormItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FormLabel: ({ children }: { children: React.ReactNode }) => <label>{children}</label>,
  FormMessage: () => null,
}));
vi.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children: React.ReactNode }) => <button type="button">{children}</button>,
}));

const customer = {
  id: '1',
  name: 'Test Customer',
  email: 'test@example.com',
  address: null,
  city: null,
  state: null,
  zip: null,
  country: 'NZ',
} satisfies Customer;

const profile = {
  id: 'profile-1',
  name: 'Test Business',
  email: 'business@test.com',
  address: null,
  city: null,
  state: null,
  zip: null,
  country: 'NZ',
  quoteValidityDays: 30,
  defaultQuoteKind: 'quote',
} satisfies BusinessProfile;

function renderForm(documentKind: 'invoice' | 'quote' = 'invoice') {
  return render(
    <BrowserRouter>
      <TooltipProvider>
        <InvoiceForm
          mode="create"
          documentKind={documentKind}
          customers={[customer]}
          businessProfile={profile}
          isLoadingCustomers={false}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
          generatedInvoiceNumber={documentKind === 'quote' ? 'QUO-2026-0001' : 'INV-001'}
        />
      </TooltipProvider>
    </BrowserRouter>,
  );
}

describe('InvoiceForm documentKind', () => {
  it('keeps invoice labels and payment terms by default', () => {
    renderForm('invoice');
    expect(screen.getByText('Invoice Number')).toBeInTheDocument();
    expect(screen.getByText('Due Date')).toBeInTheDocument();
    expect(screen.getByText('Payment terms')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Send invoice' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('tab', { name: 'Estimate' })).not.toBeInTheDocument();
  });

  it('switches to quote wording, a kind toggle, valid until, and save and share', () => {
    renderForm('quote');
    expect(screen.getByRole('heading', { name: 'Create Quote' })).toBeInTheDocument();
    expect(screen.getByText('Quote number')).toBeInTheDocument();
    expect(screen.getByText('Valid until')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Quote' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Estimate' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Save and share' }).length).toBeGreaterThan(0);
    expect(screen.queryByText('Payment terms')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send invoice' })).not.toBeInTheDocument();
  });
});
