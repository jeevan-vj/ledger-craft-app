import { useAuth } from '@/context/StableAuthContext';
import { useMemo } from 'react';

// Define feature permissions
export type Permission = 
  | 'payments:create'
  | 'payments:read'
  | 'payments:update'
  | 'payments:delete'
  | 'receipts:read'
  | 'receipts:email'
  | 'invoices:create'
  | 'invoices:read'
  | 'invoices:update'
  | 'invoices:delete'
  | 'invoices:share'
  | 'invoices:import'
  | 'customers:create'
  | 'customers:read'
  | 'customers:update'
  | 'customers:delete'
  | 'expenses:create'
  | 'expenses:read'
  | 'expenses:update'
  | 'expenses:delete'
  | 'accounts:create'
  | 'accounts:read'
  | 'accounts:update'
  | 'accounts:delete'
  | 'reports:generate'
  | 'reports:view'
  | 'reports:export'
  | 'settings:manage'
  | 'profile:update';

// User roles (for future extensibility)
export type UserRole = 'owner' | 'admin' | 'accountant' | 'member' | 'read_only';

// Permission sets by role
const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  owner: [
    // Full access to everything
    'payments:create', 'payments:read', 'payments:update', 'payments:delete',
    'receipts:read', 'receipts:email',
    'invoices:create', 'invoices:read', 'invoices:update', 'invoices:delete', 'invoices:share', 'invoices:import',
    'customers:create', 'customers:read', 'customers:update', 'customers:delete',
    'expenses:create', 'expenses:read', 'expenses:update', 'expenses:delete',
    'accounts:create', 'accounts:read', 'accounts:update', 'accounts:delete',
    'reports:generate', 'reports:view', 'reports:export',
    'settings:manage', 'profile:update'
  ],
  admin: [
    // All operations except settings management
    'payments:create', 'payments:read', 'payments:update', 'payments:delete',
    'receipts:read', 'receipts:email',
    'invoices:create', 'invoices:read', 'invoices:update', 'invoices:delete', 'invoices:share', 'invoices:import',
    'customers:create', 'customers:read', 'customers:update', 'customers:delete',
    'expenses:create', 'expenses:read', 'expenses:update', 'expenses:delete',
    'accounts:create', 'accounts:read', 'accounts:update', 'accounts:delete',
    'reports:generate', 'reports:view', 'reports:export',
    'profile:update'
  ],
  accountant: [
    // Standard business operations
    'payments:create', 'payments:read', 'payments:update',
    'receipts:read', 'receipts:email',
    'invoices:create', 'invoices:read', 'invoices:update', 'invoices:share', 'invoices:import',
    'customers:create', 'customers:read', 'customers:update',
    'expenses:create', 'expenses:read', 'expenses:update',
    'accounts:read',
    'reports:view',
    'profile:update'
  ],
  member: [
    'payments:create', 'payments:read', 'payments:update',
    'receipts:read',
    'invoices:create', 'invoices:read', 'invoices:update', 'invoices:share',
    'customers:create', 'customers:read', 'customers:update',
    'expenses:create', 'expenses:read', 'expenses:update',
    'accounts:read', 'reports:view', 'profile:update'
  ],
  read_only: [
    // Read-only access
    'payments:read',
    'receipts:read',
    'invoices:read',
    'customers:read',
    'expenses:read',
    'accounts:read',
    'reports:view'
  ]
};

// Feature access requirements
const FEATURE_REQUIREMENTS: Record<string, { permission: Permission; description: string }> = {
  '/payments/create': { permission: 'payments:create', description: 'Create payments' },
  '/receipts': { permission: 'receipts:read', description: 'View receipts' },
  '/invoices/create': { permission: 'invoices:create', description: 'Create invoices' },
  '/invoices/import': { permission: 'invoices:import', description: 'Import invoices' },
  '/customers/create': { permission: 'customers:create', description: 'Create customers' },
  '/expenses/create': { permission: 'expenses:create', description: 'Create expenses' },
  '/accounts/create': { permission: 'accounts:create', description: 'Create accounts' },
  '/financial-reports': { permission: 'reports:view', description: 'View financial reports' },
  '/settings': { permission: 'settings:manage', description: 'Manage settings' }
};

export const usePermissions = () => {
  const { user, me } = useAuth();

  const userRole: UserRole = useMemo(() => {
    if (!user) return 'read_only';
    return me?.membership.role ?? 'owner';
  }, [me?.membership.role, user]);

  const userPermissions = useMemo(() => {
    return ROLE_PERMISSIONS[userRole] || [];
  }, [userRole]);

  const hasPermission = (permission: Permission): boolean => {
    if (!user) return false;
    return userPermissions.includes(permission);
  };

  const hasAnyPermission = (permissions: Permission[]): boolean => {
    return permissions.some(permission => hasPermission(permission));
  };

  const hasAllPermissions = (permissions: Permission[]): boolean => {
    return permissions.every(permission => hasPermission(permission));
  };

  const canAccessRoute = (route: string): boolean => {
    const requirement = FEATURE_REQUIREMENTS[route];
    if (!requirement) return true; // Allow access if no specific requirement
    return hasPermission(requirement.permission);
  };

  const getPermissionError = (permission: Permission): string => {
    const feature = Object.entries(FEATURE_REQUIREMENTS).find(
      ([, req]) => req.permission === permission
    );
    return feature 
      ? `You don't have permission to ${feature[1].description.toLowerCase()}`
      : `You don't have permission for: ${permission}`;
  };

  // Helper functions for common permission checks
  const canCreatePayments = () => hasPermission('payments:create');
  const canDeleteInvoices = () => hasPermission('invoices:delete');
  const canManageSettings = () => hasPermission('settings:manage');
  const canExportReports = () => hasPermission('reports:export');
  const canEmailReceipts = () => hasPermission('receipts:email');

  return {
    userRole,
    userPermissions,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    canAccessRoute,
    getPermissionError,
    // Common permission checks
    canCreatePayments,
    canDeleteInvoices,
    canManageSettings,
    canExportReports,
    canEmailReceipts,
    // User state
    isAuthenticated: !!user,
    user
  };
};
