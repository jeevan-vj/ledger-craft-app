import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import GuidedInvoiceCreate from './GuidedInvoiceCreate';
import { businessProfileService } from '@/services/businessProfileService';
import { customerService } from '@/services/customerService';
import { invoiceService } from '@/services/invoiceService';

const mockReplace = jest.fn();
const mockGoBack = jest.fn();

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({
      replace: mockReplace,
      goBack: mockGoBack,
      setOptions: jest.fn(),
      navigate: jest.fn(),
    }),
  };
});

jest.mock('@/hooks/useTabScreenInsets', () => ({
  useTabScreenInsets: () => ({
    safeArea: { top: 0, bottom: 0, left: 0, right: 0 },
    tabBarClearance: 0,
    bottomPadding: 24,
  }),
}));

jest.mock('@/services/invoiceService', () => ({
  invoiceService: {
    generateInvoiceNumber: jest.fn(),
    fetchCustomers: jest.fn(),
    createInvoice: jest.fn(),
  },
}));

jest.mock('@/services/customerService', () => ({
  customerService: {
    createCustomer: jest.fn(),
  },
}));

jest.mock('@/services/businessProfileService', () => ({
  businessProfileService: {
    getBusinessProfile: jest.fn(),
  },
}));

const profile = {
  id: 'biz',
  userId: 'user-1',
  name: 'Kauri Studio',
  email: 'owner@example.com',
  country: 'Australia',
  invoiceNumberFormat: 'INV-{YYYY}-{SEQ}',
  invoiceNumberSequence: 4,
  gstRegistrationStatus: 'registered' as const,
  defaultTaxRate: 10,
  defaultNotes: 'Thanks',
  defaultTerms: 'Due on receipt',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const existingCustomer = { id: 'c-old', name: 'Old Client', email: 'old@example.com' };

function renderCreate(requestedCustomerId?: string) {
  return render(<GuidedInvoiceCreate requestedCustomerId={requestedCustomerId} />);
}

async function fillLine(screen: ReturnType<typeof renderCreate>) {
  fireEvent.changeText(await screen.findByLabelText('Description'), 'Logo design');
  fireEvent.changeText(screen.getByLabelText('Amount'), '80');
  fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  expect(await screen.findByText('Review and save')).toBeTruthy();
}

describe('GuidedInvoiceCreate', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockGoBack.mockClear();
    (invoiceService.generateInvoiceNumber as jest.Mock).mockResolvedValue('INV-2026-0004');
    (invoiceService.fetchCustomers as jest.Mock).mockResolvedValue([existingCustomer]);
    (invoiceService.createInvoice as jest.Mock).mockResolvedValue({ id: 'inv-1' });
    (customerService.createCustomer as jest.Mock).mockResolvedValue({
      id: 'c-new',
      name: 'Harbour Cafe',
      email: 'hi@harbour.test',
      phone: null,
      address: null,
      city: null,
      state: null,
      zip: null,
      country: 'Australia',
    });
    (businessProfileService.getBusinessProfile as jest.Mock).mockResolvedValue(profile);
  });

  it('does not preselect a customer and keeps GST in the country currency', async () => {
    const screen = renderCreate();

    const existing = await screen.findByLabelText('Old Client');
    expect(existing).toHaveProp('accessibilityRole', 'radio');
    expect(existing).toHaveProp('accessibilityState', { selected: false });
    expect(screen.getByLabelText('Add someone new')).toHaveProp(
      'accessibilityState',
      { selected: false },
    );
    expect(screen.queryByLabelText('Customer name')).toBeNull();
    expect(screen.queryByTestId('profile-completeness-banner')).toBeNull();
    expect(screen.queryByText(/before you send/i)).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByTestId('first-invoice-error')).toHaveTextContent('Choose a customer or add someone new.');

    fireEvent.press(existing);
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('GST at 10% will be added.')).toBeTruthy();
    expect(screen.getByText('Amounts are in AUD.')).toBeTruthy();

    await fillLine(screen);
    expect(screen.getByText('A$80.00')).toBeTruthy();
    expect(screen.getByText('A$8.00')).toBeTruthy();
    expect(screen.getByText('A$88.00')).toBeTruthy();
    expect(screen.getByText('INV-2026-0004')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Create draft' }));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('InvoiceDetail', {
      invoiceId: 'inv-1',
      entry: 'create',
    }));
    expect(customerService.createCustomer).not.toHaveBeenCalled();
    expect(invoiceService.createInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'c-old',
        currency: 'AUD',
        taxAmount: 8,
        total: 88,
        status: 'draft',
        invoiceNumber: 'INV-2026-0004',
        notes: 'Thanks',
        terms: 'Due on receipt',
      }),
      [expect.objectContaining({ description: 'Logo design', quantity: 1, rate: 80, total: 80 })],
    );
  });

  it('creates a customer from a name and optional email', async () => {
    (invoiceService.fetchCustomers as jest.Mock).mockResolvedValue([]);
    const screen = renderCreate();

    expect(await screen.findByText('Who is this invoice for?')).toBeTruthy();
    expect(screen.queryByRole('radio')).toBeNull();
    fireEvent.changeText(screen.getByLabelText('Customer name'), 'Harbour Cafe');
    fireEvent.changeText(screen.getByLabelText('Email'), 'hi@harbour.test');
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await fillLine(screen);
    fireEvent.press(screen.getByRole('button', { name: 'Create draft' }));

    await waitFor(() => expect(customerService.createCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Harbour Cafe', email: 'hi@harbour.test', country: 'Australia' }),
    ));
    expect(invoiceService.createInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'c-new', currency: 'AUD' }),
      expect.any(Array),
    );
  });

  it('preselects only a requested customer', async () => {
    const screen = renderCreate('c-old');
    const existing = await screen.findByRole('radio', { name: 'Old Client' });
    expect(existing).toHaveProp('accessibilityState', { selected: true });
  });

  it('retries when the invoice number cannot be prepared', async () => {
    (invoiceService.generateInvoiceNumber as jest.Mock)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce('INV-2026-0004');
    const screen = renderCreate();

    expect(await screen.findByText('Invoice not ready')).toBeTruthy();
    expect(screen.queryByText(/INV-/)).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Who is this invoice for?')).toBeTruthy();
  });
});

it('blocks an NZ tax invoice over1000 when the selected buyer lacks every identifier', async () => {
 (invoiceService.createInvoice as jest.Mock).mockClear();
 (invoiceService.fetchCustomers as jest.Mock).mockResolvedValue([{ id: 'no-id', name: 'Buyer without identifier', email: '' }]);
 (businessProfileService.getBusinessProfile as jest.Mock).mockResolvedValue({ ...profile, country: 'New Zealand', gstRegistrationStatus: 'registered', defaultTaxRate: 15 });
 const screen = renderCreate('no-id'); await screen.findByText('Who is this invoice for?'); fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
 fireEvent.changeText(await screen.findByLabelText('Description'), 'Consulting'); fireEvent.changeText(screen.getByLabelText('Amount'), '1001'); fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
 await screen.findByText('Review and save'); fireEvent.press(screen.getByRole('button', { name: 'Create draft' }));
 expect(await screen.findByTestId('first-invoice-error')).toHaveTextContent(/buyer identifier/i); expect(invoiceService.createInvoice).not.toHaveBeenCalled();
});
