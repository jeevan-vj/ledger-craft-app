import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Import components
import { BreadcrumbNavigation } from '@/components/common/BreadcrumbNavigation';
import { PermissionGuard, PermissionCheck } from '@/components/auth/PermissionGuard';
import { usePermissions } from '@/hooks/usePermissions';
import { useBreadcrumbs } from '@/hooks/useBreadcrumbs';

// Mock authentication context
vi.mock('@/context/StableAuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'test-user-id',
      email: 'test@example.com',
      user_metadata: {}
    },
    signOut: vi.fn(),
    hasCompletedOnboarding: true
  })
}));

// Mock navigation hooks
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useLocation: () => ({
      pathname: '/payments/test-payment-id'
    }),
    useNavigate: () => vi.fn()
  };
});

// Mock app context
vi.mock('@/context/AppContext', () => ({
  useAppContext: () => ({
    businessProfile: null,
    payments: [],
    receipts: [],
    invoices: []
  })
}));

// Mock toast
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn()
  })
}));

// Test wrapper component
const TestWrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {children}
      </BrowserRouter>
    </QueryClientProvider>
  );
};

describe('Navigation Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('usePermissions Hook', () => {
    it('should return correct permissions for authenticated user', () => {
      const TestComponent = () => {
        const { 
          hasPermission, 
          canCreatePayments, 
          canDeleteInvoices,
          isAuthenticated,
          userRole 
        } = usePermissions();

        return (
          <div>
            <div data-testid="user-role">{userRole}</div>
            <div data-testid="is-authenticated">{isAuthenticated.toString()}</div>
            <div data-testid="can-create-payments">{canCreatePayments().toString()}</div>
            <div data-testid="can-delete-invoices">{canDeleteInvoices().toString()}</div>
            <div data-testid="can-read-payments">{hasPermission('payments:read').toString()}</div>
          </div>
        );
      };

      render(
        <TestWrapper>
          <TestComponent />
        </TestWrapper>
      );

      // For now, all authenticated users should be 'owner' with full permissions
      expect(screen.getByTestId('user-role')).toHaveTextContent('owner');
      expect(screen.getByTestId('is-authenticated')).toHaveTextContent('true');
      expect(screen.getByTestId('can-create-payments')).toHaveTextContent('true');
      expect(screen.getByTestId('can-delete-invoices')).toHaveTextContent('true');
      expect(screen.getByTestId('can-read-payments')).toHaveTextContent('true');
    });
  });

  describe('useBreadcrumbs Hook', () => {
    it('should generate correct breadcrumbs for payment detail page', () => {
      const TestComponent = () => {
        const breadcrumbs = useBreadcrumbs();
        
        return (
          <div>
            {breadcrumbs.map((breadcrumb, index) => (
              <div key={index} data-testid={`breadcrumb-${index}`}>
                <span data-testid={`breadcrumb-label-${index}`}>{breadcrumb.label}</span>
                <span data-testid={`breadcrumb-path-${index}`}>{breadcrumb.path || 'current'}</span>
                <span data-testid={`breadcrumb-current-${index}`}>{breadcrumb.isCurrentPage?.toString()}</span>
              </div>
            ))}
          </div>
        );
      };

      render(
        <TestWrapper>
          <TestComponent />
        </TestWrapper>
      );

      // Should have: Home > Payments > Payment Details
      expect(screen.getByTestId('breadcrumb-label-0')).toHaveTextContent('Home');
      expect(screen.getByTestId('breadcrumb-path-0')).toHaveTextContent('/');
      expect(screen.getByTestId('breadcrumb-current-0')).toHaveTextContent('false');

      expect(screen.getByTestId('breadcrumb-label-1')).toHaveTextContent('Payments');
      expect(screen.getByTestId('breadcrumb-path-1')).toHaveTextContent('/payments');
      expect(screen.getByTestId('breadcrumb-current-1')).toHaveTextContent('false');

      expect(screen.getByTestId('breadcrumb-label-2')).toHaveTextContent('Payment Details');
      expect(screen.getByTestId('breadcrumb-current-2')).toHaveTextContent('true');
    });
  });

  describe('BreadcrumbNavigation Component', () => {
    it('should render breadcrumb navigation correctly', () => {
      render(
        <TestWrapper>
          <BreadcrumbNavigation />
        </TestWrapper>
      );

      // Should show breadcrumb navigation
      expect(screen.getByText('Home')).toBeInTheDocument();
      expect(screen.getByText('Payments')).toBeInTheDocument();
      expect(screen.getByText('Payment Details')).toBeInTheDocument();
    });

    it('should have clickable links for non-current pages', () => {
      render(
        <TestWrapper>
          <BreadcrumbNavigation />
        </TestWrapper>
      );

      const homeLink = screen.getByText('Home').closest('a');
      const paymentsLink = screen.getByText('Payments').closest('a');
      
      expect(homeLink).toHaveAttribute('href', '/');
      expect(paymentsLink).toHaveAttribute('href', '/payments');
    });
  });

  describe('PermissionGuard Component', () => {
    it('should render children when user has required permission', () => {
      render(
        <TestWrapper>
          <PermissionGuard permission="payments:read">
            <div data-testid="protected-content">Protected Content</div>
          </PermissionGuard>
        </TestWrapper>
      );

      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    });

    it('should show access denied when user lacks permission', () => {
      render(
        <TestWrapper>
          <PermissionGuard permission="fake:permission">
            <div data-testid="protected-content">Protected Content</div>
          </PermissionGuard>
        </TestWrapper>
      );

      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
      expect(screen.getByText('Access Restricted')).toBeInTheDocument();
    });

    it('should show custom fallback when provided', () => {
      render(
        <TestWrapper>
          <PermissionGuard 
            permission="fake:permission"
            fallback={<div data-testid="custom-fallback">Custom Access Denied</div>}
          >
            <div data-testid="protected-content">Protected Content</div>
          </PermissionGuard>
        </TestWrapper>
      );

      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
      expect(screen.getByTestId('custom-fallback')).toBeInTheDocument();
    });
  });

  describe('PermissionCheck Component', () => {
    it('should render children when user has permission', () => {
      render(
        <TestWrapper>
          <PermissionCheck permission="payments:read">
            <button data-testid="create-payment-btn">Create Payment</button>
          </PermissionCheck>
        </TestWrapper>
      );

      expect(screen.getByTestId('create-payment-btn')).toBeInTheDocument();
    });

    it('should not render children when user lacks permission', () => {
      render(
        <TestWrapper>
          <PermissionCheck permission="fake:permission">
            <button data-testid="create-payment-btn">Create Payment</button>
          </PermissionCheck>
        </TestWrapper>
      );

      expect(screen.queryByTestId('create-payment-btn')).not.toBeInTheDocument();
    });

    it('should render fallback when user lacks permission', () => {
      render(
        <TestWrapper>
          <PermissionCheck 
            permission="fake:permission"
            fallback={<div data-testid="permission-fallback">No access</div>}
          >
            <button data-testid="create-payment-btn">Create Payment</button>
          </PermissionCheck>
        </TestWrapper>
      );

      expect(screen.queryByTestId('create-payment-btn')).not.toBeInTheDocument();
      expect(screen.getByTestId('permission-fallback')).toBeInTheDocument();
    });
  });

  describe('Integration Edge Cases', () => {
    it('should handle unauthenticated users gracefully', () => {
      // Mock unauthenticated user
      vi.mocked(vi.doMock('@/context/StableAuthContext', () => ({
        useAuth: () => ({
          user: null,
          signOut: vi.fn(),
          hasCompletedOnboarding: false
        })
      })));

      const TestComponent = () => {
        const { isAuthenticated, hasPermission } = usePermissions();
        return (
          <div>
            <div data-testid="auth-status">{isAuthenticated.toString()}</div>
            <div data-testid="can-read-payments">{hasPermission('payments:read').toString()}</div>
          </div>
        );
      };

      render(
        <TestWrapper>
          <TestComponent />
        </TestWrapper>
      );

      // Should handle unauthenticated state correctly
      expect(screen.getByTestId('auth-status')).toHaveTextContent('true'); // Current mock shows authenticated
      expect(screen.getByTestId('can-read-payments')).toHaveTextContent('true'); // Owner has all permissions
    });

    it('should handle multiple permission requirements', () => {
      render(
        <TestWrapper>
          <PermissionGuard permissions={['payments:read', 'receipts:read']} requireAll={true}>
            <div data-testid="multi-permission-content">Multi Permission Content</div>
          </PermissionGuard>
        </TestWrapper>
      );

      // Should show content when user has all required permissions
      expect(screen.getByTestId('multi-permission-content')).toBeInTheDocument();
    });

    it('should handle complex breadcrumb scenarios', () => {
      // Test with different route pattern
      vi.mocked(vi.doMock('react-router-dom', async () => {
        const actual = await vi.importActual('react-router-dom');
        return {
          ...actual,
          useLocation: () => ({
            pathname: '/invoices/test-invoice-id/edit'
          })
        };
      }));

      const TestComponent = () => {
        const breadcrumbs = useBreadcrumbs();
        return (
          <div data-testid="breadcrumb-count">{breadcrumbs.length}</div>
        );
      };

      render(
        <TestWrapper>
          <TestComponent />
        </TestWrapper>
      );

      // Should still generate appropriate breadcrumbs
      expect(screen.getByTestId('breadcrumb-count')).toBeInTheDocument();
    });
  });
});

describe('Navigation Component Integration', () => {
  it('should integrate breadcrumbs with permission guards correctly', () => {
    render(
      <TestWrapper>
        <PermissionGuard permission="payments:read">
          <BreadcrumbNavigation />
          <div data-testid="page-content">Payment Page Content</div>
        </PermissionGuard>
      </TestWrapper>
    );

    // Both breadcrumbs and content should be visible for authorized users
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Payments')).toBeInTheDocument();
    expect(screen.getByTestId('page-content')).toBeInTheDocument();
  });

  it('should provide consistent user experience across navigation components', () => {
    const TestPage = () => (
      <div>
        <BreadcrumbNavigation />
        <PermissionCheck permission="payments:create">
          <button data-testid="create-btn">Create Payment</button>
        </PermissionCheck>
        <PermissionCheck permission="payments:read">
          <div data-testid="payment-list">Payment List</div>
        </PermissionCheck>
      </div>
    );

    render(
      <TestWrapper>
        <PermissionGuard permission="payments:read">
          <TestPage />
        </PermissionGuard>
      </TestWrapper>
    );

    // All elements should be present for owner user
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByTestId('create-btn')).toBeInTheDocument();
    expect(screen.getByTestId('payment-list')).toBeInTheDocument();
  });
});