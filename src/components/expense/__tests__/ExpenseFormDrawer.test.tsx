import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ExpenseFormDrawer from '../ExpenseFormDrawer';
import { useAppData } from '@/hooks/useAppData';
import { mockExpenseCategory } from '@/test/fixtures/expenseFixtures';

// Mock the context
vi.mock('@/hooks/useAppData', () => ({
  useAppData: vi.fn(),
}));

// Mock the toast hook
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

const mockContextValue = {
  expenseCategories: [mockExpenseCategory],
  accounts: [{
    id: 'acc-1',
    name: 'Business account',
    type: 'bank' as const,
    currency: 'NZD',
    openingBalance: 0,
    currentBalance: 0,
  }],
  customers: [{
    id: 'cust-1',
    name: 'Test customer',
    email: 'customer@example.com',
    address: null,
    city: null,
    state: null,
    zip: null,
    country: 'NZ',
    phone: null,
    isVip: false,
    tags: [],
  }],
  isLoadingExpenseCategories: false,
  isLoadingAccounts: false,
  isLoadingCustomers: false,
};

describe('ExpenseFormDrawer', () => {
  const mockOnSubmit = vi.fn();
  const mockOnOpenChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAppData).mockReturnValue(mockContextValue as ReturnType<typeof useAppData>);
  });

  const defaultProps = {
    open: true,
    onOpenChange: mockOnOpenChange,
    onSubmit: mockOnSubmit,
  };

  it('renders the form when open', () => {
    render(<ExpenseFormDrawer {...defaultProps} />);
    
    expect(screen.getByRole('heading', { name: 'Create Expense' })).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^amount \*$/i)).toBeInTheDocument();
  });

  it('shows edit title when editing existing expense', () => {
    const initialValues = {
      id: '1',
      description: 'Test expense',
      amount: 100,
      categoryId: 'cat-1',
      accountId: 'acc-1',
      expenseDate: '2024-01-01',
      status: 'pending' as const,
      isBillable: false,
      taxAmount: 0,
      currency: 'USD',
      userId: 'user-1',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };

    render(<ExpenseFormDrawer {...defaultProps} initialValues={initialValues} />);
    
    expect(screen.getByText('Edit Expense')).toBeInTheDocument();
  });

  it('submits form with correct data', async () => {
    render(<ExpenseFormDrawer {...defaultProps} />);
    
    const descriptionInput = screen.getByLabelText(/description/i);
    const amountInput = screen.getByLabelText(/^amount \*$/i);
    const submitButton = screen.getByRole('button', { name: /create expense/i });

    fireEvent.change(descriptionInput, { target: { value: 'Test expense' } });
    fireEvent.change(amountInput, { target: { value: '150.50' } });
    
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Test expense',
          amount: 150.50,
          currency: 'NZD',
          gstTreatment: 'standard',
          gstExemptionReason: 'none',
          gstClaimablePercentage: 100,
          privateUsePercentage: 0,
        })
      );
    });
  });

  it('populates form fields when initialValues provided', () => {
    const initialValues = {
      id: '1',
      description: 'Existing expense',
      amount: 75.25,
      categoryId: 'cat-1',
      accountId: 'acc-1',
      vendorName: 'Test Vendor',
      expenseDate: '2024-01-15',
      status: 'approved' as const,
      isBillable: true,
      customerId: 'cust-1',
      taxAmount: 7.53,
      currency: 'USD',
      notes: 'Test notes',
      userId: 'user-1',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };

    render(<ExpenseFormDrawer {...defaultProps} initialValues={initialValues} />);
    
    expect(screen.getByDisplayValue('Existing expense')).toBeInTheDocument();
    expect(screen.getByDisplayValue('75.25')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Test Vendor')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2024-01-15')).toBeInTheDocument();
    expect(screen.getByDisplayValue('7.53')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Test notes')).toBeInTheDocument();
  });

  it('shows customer field when isBillable is true', async () => {
    render(<ExpenseFormDrawer {...defaultProps} />);
    
    fireEvent.click(screen.getByRole('button', { name: /client billing/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/^customer \*$/i)).toBeInTheDocument();
    });
  });

  it('closes drawer when cancel button clicked', () => {
    render(<ExpenseFormDrawer {...defaultProps} />);
    
    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelButton);

    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it('validates required fields', async () => {
    render(<ExpenseFormDrawer {...defaultProps} />);
    
    const submitButton = screen.getByRole('button', { name: /create expense/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/description is required/i)).toBeInTheDocument();
    });
  });

  it('validates amount field', async () => {
    render(<ExpenseFormDrawer {...defaultProps} />);
    
    const descriptionInput = screen.getByLabelText(/description/i);
    const amountInput = screen.getByLabelText(/^amount \*$/i);
    const submitButton = screen.getByRole('button', { name: /create expense/i });

    fireEvent.change(descriptionInput, { target: { value: 'Test' } });
    fireEvent.change(amountInput, { target: { value: '0' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/amount must be greater than 0/i)).toBeInTheDocument();
    });
  });
});
