import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Expenses from '../Expenses';
import { useAppData } from '@/hooks/useAppData';
import { mockExpense } from '@/test/fixtures/expenseFixtures';

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

// Mock the components
vi.mock('@/components/expense/ExpenseTable', () => ({
  default: ({ expenses, onEdit, onDelete }: any) => (
    <div data-testid="expense-table">
      {expenses.map((expense: any) => (
        <div key={expense.id} data-testid={`expense-${expense.id}`}>
          {expense.description}
          <button onClick={() => onEdit(expense)}>Edit</button>
          <button onClick={() => onDelete(expense.id)}>Delete</button>
        </div>
      ))}
    </div>
  ),
}));

vi.mock('@/components/expense/ExpenseFormDrawer', () => ({
  default: ({ open, onSubmit, initialValues }: any) => (
    <div data-testid="expense-form-drawer" style={{ display: open ? 'block' : 'none' }}>
      <button onClick={() => onSubmit({
        description: 'Test',
        amount: 100,
        currency: 'NZD',
        categoryId: 'no-category',
        accountId: 'no-account',
        customerId: 'no-customer',
        gstTreatment: 'partial',
        gstExemptionReason: 'entertainment_50',
        gstClaimablePercentage: 50,
        privateUsePercentage: 0,
      })}>
        Submit
      </button>
      {initialValues && <div data-testid="edit-mode">Edit Mode</div>}
    </div>
  ),
}));

const mockContextValue = {
  expenses: [
    { ...mockExpense, id: '1' },
    { ...mockExpense, id: '2', description: 'Second expense' },
  ],
  isLoadingExpenses: false,
  createExpense: vi.fn(),
  updateExpense: vi.fn(),
  deleteExpense: vi.fn(),
  expenseCategories: [],
  accounts: [],
  customers: [],
  isLoadingExpenseCategories: false,
  isLoadingAccounts: false,
  isLoadingCustomers: false,
};

describe('Expenses Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAppData).mockReturnValue(mockContextValue as ReturnType<typeof useAppData>);
  });

  const renderComponent = () => {
    return render(
      <MemoryRouter>
        <Expenses />
      </MemoryRouter>
    );
  };

  it('renders page title and primary action', () => {
    renderComponent();
    
    expect(screen.getByText('Expenses')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /new expense/i })).toBeInTheDocument();
  });

  it('shows loading skeletons when loading', () => {
    vi.mocked(useAppData).mockReturnValue({
      ...mockContextValue,
      expenses: [],
      isLoadingExpenses: true,
    } as ReturnType<typeof useAppData>);

    renderComponent();
    
    // Just check that loading state is shown
    expect(screen.getAllByRole('generic').some(el => 
      el.className.includes('animate-pulse')
    )).toBeTruthy();
  });

  it('shows expense table when expenses exist', () => {
    renderComponent();
    
    expect(screen.getByTestId('expense-table')).toBeInTheDocument();
    expect(screen.getByTestId('expense-1')).toBeInTheDocument();
    expect(screen.getByTestId('expense-2')).toBeInTheDocument();
  });

  it('shows empty state when no expenses', () => {
    vi.mocked(useAppData).mockReturnValue({
      ...mockContextValue,
      expenses: [],
    } as ReturnType<typeof useAppData>);

    renderComponent();
    
    expect(screen.getByText(/track every dollar out/i)).toBeInTheDocument();
    expect(screen.getByText(/log costs as they happen/i)).toBeInTheDocument();
  });

  it('opens form drawer when New Expense button clicked', () => {
    renderComponent();
    
    const newButton = screen.getByRole('button', { name: /new expense/i });
    fireEvent.click(newButton);

    expect(screen.getByTestId('expense-form-drawer')).toBeVisible();
  });

  it('opens form drawer in edit mode when edit button clicked', () => {
    renderComponent();
    
    const editButton = screen.getAllByText('Edit')[0];
    fireEvent.click(editButton);

    expect(screen.getByTestId('expense-form-drawer')).toBeVisible();
    expect(screen.getByTestId('edit-mode')).toBeInTheDocument();
  });

  it('calls createExpense when form submitted for new expense', async () => {
    renderComponent();
    
    const newButton = screen.getByRole('button', { name: /new expense/i });
    fireEvent.click(newButton);

    const submitButton = screen.getByText('Submit');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockContextValue.createExpense).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Test',
          amount: 100,
        })
      );
    });
  });

  it('calls updateExpense when form submitted for existing expense', async () => {
    renderComponent();
    
    const editButton = screen.getAllByText('Edit')[0];
    fireEvent.click(editButton);

    const submitButton = screen.getByText('Submit');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockContextValue.updateExpense).toHaveBeenCalledWith(
        '1',
        expect.objectContaining({
          description: 'Test',
          amount: 100,
        })
      );
    });
  });

  it('calls deleteExpense when delete button clicked', async () => {
    renderComponent();
    
    const deleteButton = screen.getAllByText('Delete')[0];
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(mockContextValue.deleteExpense).toHaveBeenCalledWith('1');
    });
  });

  it('handles placeholder values correctly in form submission', async () => {
    renderComponent();
    
    const newButton = screen.getByRole('button', { name: /new expense/i });
    fireEvent.click(newButton);

    const submitButton = screen.getByText('Submit');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockContextValue.createExpense).toHaveBeenCalledWith(
        expect.objectContaining({
          categoryId: null,
          accountId: null,
          customerId: null,
          currency: 'NZD',
          gstTreatment: 'partial',
          gstExemptionReason: 'entertainment_50',
          gstClaimablePercentage: 50,
          privateUsePercentage: 0,
        })
      );
    });
  });
});
