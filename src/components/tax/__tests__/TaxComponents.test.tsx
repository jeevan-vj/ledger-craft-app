import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExpenseTaxInterface } from '../../expense/ExpenseTaxInterface';
import { ExpenseGSTSummary } from '../../expense/ExpenseGSTSummary';
import { BulkExpenseProcessor } from '../../expense/BulkExpenseProcessor';
import { GSTReturnWizard } from '../GSTReturnWizard';

// Mock the router
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

vi.mock('@/context/StableAuthContext', () => ({
  useAuth: () => ({ user: { id: 'test-user' } }),
}));

vi.mock('@/services/gstReconciliationService', () => ({
  gstReconciliationService: {
    getPeriodReconciliation: vi.fn().mockResolvedValue({
      period: { startDate: '2024-01-01', endDate: '2024-03-31' },
      readiness: 'not_applicable',
      accounts: [],
      unreconciledTransactionCount: 0,
      unreconciledSamples: [],
      figures: [],
      figuresMatch: true,
      issues: [],
    }),
  },
}));

// Mock the auth hook
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'test-user' } }),
}));

// Mock the recharts components
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
  BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
  PieChart: ({ children }: any) => <div data-testid="pie-chart">{children}</div>,
  Bar: () => <div data-testid="bar" />,
  Pie: () => <div data-testid="pie" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Cell: () => <div data-testid="cell" />,
}));

// Mock the supabase service
vi.mock('@/services/supabaseDataService', () => ({
  supabaseDataService: {
    getTaxConfiguration: vi.fn().mockResolvedValue({
      id: 'test-config',
      taxRate: 0.15,
      taxType: 'GST',
      isActive: true
    }),
    getInvoicesByPeriod: vi.fn().mockResolvedValue([
      {
        id: 'inv-1',
        total: 1150,
        gstAmount: 150,
        date: '2024-01-15'
      },
      {
        id: 'inv-2',
        total: 2300,
        gstAmount: 300,
        date: '2024-02-20'
      }
    ]),
    getExpensesByPeriod: vi.fn().mockResolvedValue([
      {
        id: 'exp-1',
        amount: 575,
        gstAmount: 75,
        category: 'office',
        isCapitalExpense: false,
        isGstClaimable: true,
        date: '2024-01-10'
      },
      {
        id: 'exp-2',
        amount: 2300,
        gstAmount: 300,
        category: 'equipment',
        isCapitalExpense: true,
        isGstClaimable: true,
        date: '2024-01-25'
      }
    ]),
    getTaxReturnsByUser: vi.fn().mockResolvedValue([]),
  },
}));

describe('Tax Components', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ExpenseTaxInterface', () => {
    const mockOnSave = vi.fn();
    const mockOnCancel = vi.fn();

    beforeEach(() => {
      mockOnSave.mockClear();
      mockOnCancel.mockClear();
    });

    it('should render expense form with GST calculator', () => {
      render(
        <ExpenseTaxInterface 
          onSave={mockOnSave}
          onCancel={mockOnCancel}
        />
      );

      expect(screen.getByText('Add New Expense')).toBeInTheDocument();
      expect(screen.getByText('GST Smart Calculator')).toBeInTheDocument();
      expect(screen.getByText('Basic Information')).toBeInTheDocument();
      expect(screen.getByText('Tax Classification')).toBeInTheDocument();
      expect(screen.getByText('GST Calculator')).toBeInTheDocument();
    });

    it('should calculate GST automatically when amount is entered', async () => {
      const user = userEvent.setup();
      
      render(
        <ExpenseTaxInterface 
          onSave={mockOnSave}
          onCancel={mockOnCancel}
        />
      );

      const amountInput = screen.getByLabelText(/Amount/);
      await user.type(amountInput, '115');

      // Should show GST breakdown
      await waitFor(() => {
        expect(screen.getByText('GST Breakdown')).toBeInTheDocument();
      });
    });

    it('should handle category selection and auto-set defaults', async () => {
      const user = userEvent.setup();
      
      render(
        <ExpenseTaxInterface 
          onSave={mockOnSave}
          onCancel={mockOnCancel}
        />
      );

      const categorySelect = screen.getAllByRole('combobox')[0];
      await user.click(categorySelect);
      
      await waitFor(() => {
        expect(screen.getByText('Office & Administration')).toBeInTheDocument();
      });
    });

    it('should validate required fields', async () => {
      const user = userEvent.setup();
      
      render(
        <ExpenseTaxInterface 
          onSave={mockOnSave}
          onCancel={mockOnCancel}
        />
      );

      const saveButton = screen.getByText('Save Expense');
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText('Description is required')).toBeInTheDocument();
        expect(screen.getByText('Amount must be greater than zero')).toBeInTheDocument();
      });

      expect(mockOnSave).not.toHaveBeenCalled();
    });

    it('should call onCancel when cancel button is clicked', async () => {
      const user = userEvent.setup();
      
      render(
        <ExpenseTaxInterface 
          onSave={mockOnSave}
          onCancel={mockOnCancel}
        />
      );

      const cancelButton = screen.getByText('Cancel');
      await user.click(cancelButton);

      expect(mockOnCancel).toHaveBeenCalled();
    });
  });

  describe('ExpenseGSTSummary', () => {
    it('should render GST summary with period selector', async () => {
      render(<ExpenseGSTSummary userId="test-user" />);

      await waitFor(() => {
        expect(screen.getByText('GST Claimable Summary')).toBeInTheDocument();
      });
      expect(screen.getByRole('combobox')).toBeInTheDocument();
      expect(screen.getByText('Export')).toBeInTheDocument();
    });

    it('should show loading state initially', () => {
      render(<ExpenseGSTSummary userId="test-user" />);

      expect(screen.getByText('Calculating GST summary...')).toBeInTheDocument();
    });

    it('should display summary cards when data loads', async () => {
      render(<ExpenseGSTSummary userId="test-user" />);

      await waitFor(() => {
        expect(screen.getByText('Total Expenses')).toBeInTheDocument();
        expect(screen.getByText('GST Claimable')).toBeInTheDocument();
        expect(screen.getByText('Capital Expenses')).toBeInTheDocument();
      });
    });

    it('should render charts when data is available', async () => {
      render(<ExpenseGSTSummary userId="test-user" />);

      await waitFor(() => {
        expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
        expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
      });
    });

    it('should show tax tips section', async () => {
      render(<ExpenseGSTSummary userId="test-user" />);

      await waitFor(() => {
        expect(screen.getByText('Tax Tips & Compliance')).toBeInTheDocument();
        expect(screen.getByText(/Keep receipts/)).toBeInTheDocument();
        expect(screen.getByText(/Quarterly returns/)).toBeInTheDocument();
      });
    });
  });

  describe('BulkExpenseProcessor', () => {
    const mockOnProcessComplete = vi.fn();
    const mockOnCancel = vi.fn();

    beforeEach(() => {
      mockOnProcessComplete.mockClear();
      mockOnCancel.mockClear();
    });

    it('should render upload area initially', () => {
      render(
        <BulkExpenseProcessor 
          onProcessComplete={mockOnProcessComplete}
          onCancel={mockOnCancel}
        />
      );

      expect(screen.getByText('Bulk Expense Import')).toBeInTheDocument();
      expect(screen.getByText('Upload Expense CSV')).toBeInTheDocument();
      expect(screen.getByText('Choose CSV File')).toBeInTheDocument();
      expect(screen.getByText('Download Template')).toBeInTheDocument();
    });

    it('should show file requirements', () => {
      render(
        <BulkExpenseProcessor 
          onProcessComplete={mockOnProcessComplete}
          onCancel={mockOnCancel}
        />
      );

      expect(screen.getByText(/Required columns: description, amount, category, date/)).toBeInTheDocument();
      expect(screen.getByText(/Optional columns: supplier/)).toBeInTheDocument();
    });

    it('should handle template download', async () => {
      const user = userEvent.setup();
      
      // Mock URL.createObjectURL and related methods
      const mockCreateObjectURL = vi.fn(() => 'mock-url');
      const mockRevokeObjectURL = vi.fn();
      global.URL.createObjectURL = mockCreateObjectURL;
      global.URL.revokeObjectURL = mockRevokeObjectURL;

      render(
        <BulkExpenseProcessor 
          onProcessComplete={mockOnProcessComplete}
          onCancel={mockOnCancel}
        />
      );

      const originalCreateElement = document.createElement.bind(document);
      const mockAnchor = originalCreateElement('a');
      const clickSpy = vi.spyOn(mockAnchor, 'click').mockImplementation(() => {});
      const mockCreateElement = vi.spyOn(document, 'createElement').mockImplementation((tagName, options) =>
        tagName === 'a' ? mockAnchor : originalCreateElement(tagName, options)
      );

      const downloadButton = screen.getByText('Download Template');
      await user.click(downloadButton);

      expect(mockCreateElement).toHaveBeenCalledWith('a');
      expect(mockAnchor.download).toBe('expense-template.csv');
      expect(clickSpy).toHaveBeenCalled();
      mockCreateElement.mockRestore();
    });
  });

  describe('GSTReturnWizard', () => {
    const mockOnComplete = vi.fn();
    const mockOnCancel = vi.fn();

    beforeEach(() => {
      mockOnComplete.mockClear();
      mockOnCancel.mockClear();
    });

    it('should render wizard with step progress', () => {
      render(
        <GSTReturnWizard 
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />
      );

      expect(screen.getByText('GST Return Wizard')).toBeInTheDocument();
      expect(screen.getByText('Step 1 of 6')).toBeInTheDocument();
      expect(screen.getAllByText('Return Period').length).toBeGreaterThan(0);
    });

    it('should show all wizard steps in progress bar', () => {
      render(
        <GSTReturnWizard 
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />
      );

      expect(screen.getAllByText('Return Period').length).toBeGreaterThan(0);
      expect(screen.getByText('Sales & Output')).toBeInTheDocument();
      expect(screen.getByText('Purchases & Input')).toBeInTheDocument();
      expect(screen.getByText('Adjustments')).toBeInTheDocument();
      expect(screen.getByText('Reconciliation')).toBeInTheDocument();
      expect(screen.getByText('Review & Save')).toBeInTheDocument();
    });

    it('should handle quarter selection in step 1', async () => {
      const user = userEvent.setup();
      
      render(
        <GSTReturnWizard 
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />
      );

      const quarterSelect = screen.getAllByRole('combobox')[1]; // Second combobox is quarter
      await user.click(quarterSelect);

      await waitFor(() => {
        expect(screen.getByText('Q1 (Jan-Mar)')).toBeInTheDocument();
      });
    });

    it('should navigate between steps', async () => {
      const user = userEvent.setup();
      
      render(
        <GSTReturnWizard 
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />
      );

      // First select a quarter to enable navigation
      const quarterSelect = screen.getAllByRole('combobox')[1];
      await user.click(quarterSelect);
      
      await waitFor(async () => {
        const q1Option = screen.getByText('Q1 (Jan-Mar)');
        await user.click(q1Option);
      });

      // Now try to go to next step
      const nextButton = screen.getByText('Next');
      await user.click(nextButton);

      await waitFor(() => {
        expect(screen.getByText('Step 2 of 6')).toBeInTheDocument();
      });
    });

    it('should validate step before proceeding', async () => {
      const user = userEvent.setup();
      
      render(
        <GSTReturnWizard 
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />
      );

      const nextButton = screen.getByText('Next');
      await user.click(nextButton);

      // Should show validation error
      await waitFor(() => {
        expect(screen.getByText('Please select a quarter')).toBeInTheDocument();
      });
    });

    it('should call onCancel when cancel button is clicked', async () => {
      const user = userEvent.setup();
      
      render(
        <GSTReturnWizard 
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />
      );

      const cancelButton = screen.getByText('Cancel');
      await user.click(cancelButton);

      expect(mockOnCancel).toHaveBeenCalled();
    });
  });

  describe('Integration Tests', () => {
    it('should integrate ExpenseTaxInterface with real form submission', async () => {
      const user = userEvent.setup();
      const mockOnSave = vi.fn();
      
      render(
        <ExpenseTaxInterface 
          onSave={mockOnSave}
          onCancel={vi.fn()}
        />
      );

      // Fill out the form
      await user.type(screen.getByLabelText(/Description/), 'Test expense');
      await user.type(screen.getByLabelText(/Amount/), '115');
      
      // Select category
      const categorySelect = screen.getAllByRole('combobox')[0];
      await user.click(categorySelect);
      
      await waitFor(async () => {
        const officeOption = screen.getByText('Office & Administration');
        await user.click(officeOption);
      });

      // Submit form
      const saveButton = screen.getByText('Save Expense');
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalledWith(
          expect.objectContaining({
            description: 'Test expense',
            amount: 115,
            category: 'office'
          })
        );
      });
    });

    it('should load data automatically in ExpenseGSTSummary when component mounts', async () => {
      render(<ExpenseGSTSummary userId="test-user" />);

      await waitFor(() => {
        // Should show calculated totals from mocked data
        expect(screen.getByText('Total Expenses')).toBeInTheDocument();
        expect(screen.getByText('GST Claimable')).toBeInTheDocument();
      });
    });
  });
});
