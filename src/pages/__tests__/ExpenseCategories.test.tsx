import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ExpenseCategories from '../ExpenseCategories';
import { mockExpenseCategory } from '@/test/fixtures/expenseFixtures';

const mockExpenseCategories = [
  mockExpenseCategory,
  { ...mockExpenseCategory, id: 'cat-2', name: 'Travel' },
];

const { mockUseAppData } = vi.hoisted(() => ({ mockUseAppData: vi.fn() }));

vi.mock('@/hooks/useAppData', () => ({
  useAppData: () => mockUseAppData(),
}));

// Mock the toast hook
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

// Mock the components
vi.mock('@/components/expense/ExpenseCategoryTable', () => ({
  default: ({ categories, onEdit, onDelete }: any) => (
    <div data-testid="category-table">
      {categories.map((category: any) => (
        <div key={category.id} data-testid={`category-${category.id}`}>
          {category.name}
          <button onClick={() => onEdit(category)}>Edit</button>
          <button onClick={() => onDelete(category.id)}>Delete</button>
        </div>
      ))}
    </div>
  ),
}));

vi.mock('@/components/expense/ExpenseCategoryFormDrawer', () => ({
  default: ({ open, onSubmit, initialValues }: any) => (
    <div data-testid="category-form-drawer" style={{ display: open ? 'block' : 'none' }}>
      <button onClick={() => onSubmit({ name: 'Test Category', description: 'Test', color: '#FF6B35' })}>
        Submit
      </button>
      {initialValues && <div data-testid="edit-mode">Edit Mode</div>}
    </div>
  ),
}));

const mockContextValue = {
  expenseCategories: mockExpenseCategories,
  isLoadingExpenseCategories: false,
  createExpenseCategory: vi.fn(),
  updateExpenseCategory: vi.fn(),
  deleteExpenseCategory: vi.fn(),
  expenses: [],
  accounts: [],
  customers: [],
  isLoadingExpenses: false,
  isLoadingAccounts: false,
  isLoadingCustomers: false,
};

describe('ExpenseCategories Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAppData.mockReturnValue({
      ...mockContextValue,
      expenseCategories: mockExpenseCategories,
      isLoadingExpenseCategories: false,
    });
  });

  const renderComponent = () => {
    return render(
      <MemoryRouter>
        <ExpenseCategories />
      </MemoryRouter>
    );
  };

  it('renders page title and description', () => {
    renderComponent();
    
    expect(screen.getByText('Expense Categories')).toBeInTheDocument();
    expect(screen.getByText(/organize your expenses/i)).toBeInTheDocument();
  });

  it('shows loading skeletons when loading', () => {
    mockUseAppData.mockReturnValue({
      ...mockContextValue,
      expenseCategories: [],
      isLoadingExpenseCategories: true,
    });

    renderComponent();
    
    // Just check that loading state is shown
    expect(screen.getAllByRole('generic').some(el => 
      el.className.includes('animate-pulse')
    )).toBeTruthy();
  });

  it('shows category table when categories exist', () => {
    renderComponent();
    
    expect(screen.getByTestId('category-table')).toBeInTheDocument();
    expect(screen.getByTestId('category-cat-1')).toBeInTheDocument();
    expect(screen.getByTestId('category-cat-2')).toBeInTheDocument();
  });

  it('shows empty state when no categories', () => {
    mockUseAppData.mockReturnValue({
      ...mockContextValue,
      expenseCategories: [],
      isLoadingExpenseCategories: false,
    });

    renderComponent();
    
    expect(screen.getByText('No expense categories yet')).toBeInTheDocument();
    expect(screen.getByText(/create categories to organize/i)).toBeInTheDocument();
  });

  it('opens form drawer when New Category button clicked', () => {
    renderComponent();
    
    const newButton = screen.getByRole('button', { name: /new category/i });
    fireEvent.click(newButton);

    expect(screen.getByTestId('category-form-drawer')).toBeVisible();
  });

  it('opens form drawer in edit mode when edit button clicked', () => {
    renderComponent();
    
    const editButton = screen.getAllByText('Edit')[0];
    fireEvent.click(editButton);

    expect(screen.getByTestId('category-form-drawer')).toBeVisible();
    expect(screen.getByTestId('edit-mode')).toBeInTheDocument();
  });

  it('calls createExpenseCategory when form submitted for new category', async () => {
    renderComponent();
    
    const newButton = screen.getByRole('button', { name: /new category/i });
    fireEvent.click(newButton);

    const submitButton = screen.getByText('Submit');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockContextValue.createExpenseCategory).toHaveBeenCalledWith({
        name: 'Test Category',
        description: 'Test',
        color: '#FF6B35',
      });
    });
  });

  it('calls updateExpenseCategory when form submitted for existing category', async () => {
    renderComponent();
    
    const editButton = screen.getAllByText('Edit')[0];
    fireEvent.click(editButton);

    const submitButton = screen.getByText('Submit');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockContextValue.updateExpenseCategory).toHaveBeenCalledWith(
        'cat-1',
        {
          name: 'Test Category',
          description: 'Test',
          color: '#FF6B35',
        }
      );
    });
  });

  it('calls deleteExpenseCategory when delete button clicked', async () => {
    renderComponent();
    
    const deleteButton = screen.getAllByText('Delete')[0];
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(mockContextValue.deleteExpenseCategory).toHaveBeenCalledWith('cat-1');
    });
  });
});