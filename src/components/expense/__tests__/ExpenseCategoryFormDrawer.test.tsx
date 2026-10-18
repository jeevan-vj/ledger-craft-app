import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ExpenseCategoryFormDrawer from '../ExpenseCategoryFormDrawer';

// Mock the toast hook
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

describe('ExpenseCategoryFormDrawer', () => {
  const mockOnSubmit = vi.fn();
  const mockOnOpenChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const defaultProps = {
    open: true,
    onOpenChange: mockOnOpenChange,
    onSubmit: mockOnSubmit,
  };

  it('renders the form when open', () => {
    render(<ExpenseCategoryFormDrawer {...defaultProps} />);
    
    expect(screen.getByText('Create Expense Category')).toBeInTheDocument();
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
    expect(screen.getByText(/color/i)).toBeInTheDocument();
  });

  it('shows edit title when editing existing category', () => {
    const initialValues = {
      id: '1',
      name: 'Test Category',
      description: 'Test description',
      color: '#FF6B35',
      userId: 'user-1',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };

    render(<ExpenseCategoryFormDrawer {...defaultProps} initialValues={initialValues} />);
    
    expect(screen.getByText('Edit Expense Category')).toBeInTheDocument();
  });

  it('submits form with correct data', async () => {
    render(<ExpenseCategoryFormDrawer {...defaultProps} />);
    
    const nameInput = screen.getByLabelText(/name/i);
    const descriptionInput = screen.getByLabelText(/description/i);
    const colorInput = screen.getByPlaceholderText('#FF6B35');
    const submitButton = screen.getByRole('button', { name: /create category/i });

    fireEvent.change(nameInput, { target: { value: 'Office Supplies' } });
    fireEvent.change(descriptionInput, { target: { value: 'Office equipment and supplies' } });
    fireEvent.change(colorInput, { target: { value: '#FF6B35' } });
    
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith({
        name: 'Office Supplies',
        description: 'Office equipment and supplies',
        color: '#FF6B35',
      });
    });
  });

  it('populates form fields when initialValues provided', () => {
    const initialValues = {
      id: '1',
      name: 'Travel',
      description: 'Travel expenses',
      color: '#20B2AA',
      userId: 'user-1',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };

    render(<ExpenseCategoryFormDrawer {...defaultProps} initialValues={initialValues} />);
    
    expect(screen.getByDisplayValue('Travel')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Travel expenses')).toBeInTheDocument();
    expect(screen.getByDisplayValue('#20B2AA')).toBeInTheDocument();
  });

  it('shows predefined color palette', () => {
    render(<ExpenseCategoryFormDrawer {...defaultProps} />);
    
    // Should have 15 predefined color buttons
    const colorButtons = screen.getAllByRole('button').filter(button => 
      button.style.backgroundColor && button.title?.startsWith('#')
    );
    expect(colorButtons).toHaveLength(15);
  });

  it('selects predefined color when clicked', async () => {
    render(<ExpenseCategoryFormDrawer {...defaultProps} />);
    
    const colorInput = screen.getByPlaceholderText('#FF6B35') as HTMLInputElement;
    const firstColorButton = screen.getAllByRole('button').find(button =>
      button.title === '#FF6B35'
    );

    if (firstColorButton) {
      fireEvent.click(firstColorButton);
      
      await waitFor(() => {
        expect(colorInput.value).toBe('#FF6B35');
      });
    }
  });

  it('shows color preview when color is selected', () => {
    const initialValues = {
      id: '1',
      name: 'Test',
      description: 'Test',
      color: '#FF6B35',
      userId: 'user-1',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };

    render(<ExpenseCategoryFormDrawer {...defaultProps} initialValues={initialValues} />);
    
    const colorPreview = document.querySelector('.w-8.h-8.rounded.border');
    expect(colorPreview).toHaveStyle({ backgroundColor: 'rgb(255, 107, 53)' });
  });

  it('closes drawer when cancel button clicked', () => {
    render(<ExpenseCategoryFormDrawer {...defaultProps} />);
    
    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelButton);

    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it('validates required name field', async () => {
    render(<ExpenseCategoryFormDrawer {...defaultProps} />);
    
    const submitButton = screen.getByRole('button', { name: /create category/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/name is required/i)).toBeInTheDocument();
    });
  });

  it('validates color format', async () => {
    render(<ExpenseCategoryFormDrawer {...defaultProps} />);
    
    const nameInput = screen.getByLabelText(/name/i);
    const colorInput = screen.getByPlaceholderText('#FF6B35');
    const submitButton = screen.getByRole('button', { name: /create category/i });

    fireEvent.change(nameInput, { target: { value: 'Test Category' } });
    fireEvent.change(colorInput, { target: { value: 'invalid-color' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/must be a valid hex color/i)).toBeInTheDocument();
    });
  });
});