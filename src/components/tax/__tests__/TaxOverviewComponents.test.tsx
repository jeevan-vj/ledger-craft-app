import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TaxPositionCard } from '../TaxPositionCard';
import { NextPaymentDue } from '../NextPaymentDue';
import { ComplianceStatus } from '../ComplianceStatus';
import { QuickActions } from '../QuickActions';

// Mock the router
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

// Mock the auth hook
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'test-user' } }),
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
    getInvoicesByPeriod: vi.fn().mockResolvedValue([]),
    getExpensesByPeriod: vi.fn().mockResolvedValue([]),
    getTaxReturnsByUser: vi.fn().mockResolvedValue([]),
  },
}));

describe('Tax Overview Components', () => {
  describe('TaxPositionCard', () => {
    it('should render tax position with amount owed', () => {
      render(
        <TaxPositionCard 
          amount={1500.50} 
          quarter={{ quarter: 'Q1', year: 2024 }} 
        />
      );
      
      expect(screen.getByText('$1500.50')).toBeInTheDocument();
      expect(screen.getByText('Payment Required')).toBeInTheDocument();
      expect(screen.getByText('Q1 2024')).toBeInTheDocument();
    });

    it('should render tax position with refund due', () => {
      render(
        <TaxPositionCard 
          amount={-750.25} 
          quarter={{ quarter: 'Q2', year: 2024 }} 
        />
      );
      
      expect(screen.getByText('-$750.25')).toBeInTheDocument();
      expect(screen.getByText('Refund Expected')).toBeInTheDocument();
      expect(screen.getByText("You're entitled to a GST refund from IRD")).toBeInTheDocument();
    });

    it('should render zero GST position', () => {
      render(
        <TaxPositionCard 
          amount={0} 
          quarter={{ quarter: 'Q3', year: 2024 }} 
        />
      );
      
      expect(screen.getByText('$0.00')).toBeInTheDocument();
      expect(screen.getByText('No GST Due')).toBeInTheDocument();
    });
  });

  describe('NextPaymentDue', () => {
    it('should render payment due information', () => {
      const paymentDue = {
        date: '2024-04-28',
        amount: 2500.00,
        type: 'GST' as const
      };

      render(<NextPaymentDue paymentDue={paymentDue} />);
      
      expect(screen.getByText(/28 Apr 2024/)).toBeInTheDocument();
      expect(screen.getByText('$2500.00')).toBeInTheDocument();
      expect(screen.getByText('GST Return')).toBeInTheDocument();
    });

    it('should render no payments due state', () => {
      render(<NextPaymentDue paymentDue={null} />);
      
      expect(screen.getByText('No Payments Due')).toBeInTheDocument();
      expect(screen.getByText("You're all caught up with tax payments")).toBeInTheDocument();
      expect(screen.getByText('Up to Date')).toBeInTheDocument();
    });

    it('should show overdue warning for past due dates', () => {
      const overduePayment = {
        date: '2024-01-28', // Past date
        amount: 1000.00,
        type: 'GST' as const
      };

      render(<NextPaymentDue paymentDue={overduePayment} />);
      
      expect(screen.getByText('OVERDUE')).toBeInTheDocument();
      expect(screen.getAllByText(/overdue/i).length).toBeGreaterThan(0);
    });
  });

  describe('ComplianceStatus', () => {
    it('should render excellent compliance score', () => {
      render(<ComplianceStatus score={95} userId="test-user" />);
      
      expect(screen.getByText('95%')).toBeInTheDocument();
      expect(screen.getByText('EXCELLENT')).toBeInTheDocument();
    });

    it('should render poor compliance score', () => {
      render(<ComplianceStatus score={45} userId="test-user" />);
      
      expect(screen.getByText('45%')).toBeInTheDocument();
      expect(screen.getByText('ACTION REQUIRED')).toBeInTheDocument();
    });
  });

  describe('QuickActions', () => {
    it('should render quick action buttons', () => {
      render(<QuickActions userId="test-user" />);
      
      expect(screen.getByText('Quick Actions')).toBeInTheDocument();
      expect(screen.getByText('Create GST Return')).toBeInTheDocument();
      expect(screen.getAllByText('Add Expense').length).toBeGreaterThan(0);
      expect(screen.getByText('Tax Calculator')).toBeInTheDocument();
      expect(screen.getByText('Tax Settings')).toBeInTheDocument();
    });

    it('should render keyboard shortcuts', () => {
      render(<QuickActions userId="test-user" />);
      
      expect(screen.getByText('Keyboard Shortcuts:')).toBeInTheDocument();
      expect(screen.getByText('Create Invoice')).toBeInTheDocument();
      expect(screen.getAllByText('Add Expense').length).toBeGreaterThan(0);
      expect(screen.getByText('GST Return')).toBeInTheDocument();
    });
  });
});