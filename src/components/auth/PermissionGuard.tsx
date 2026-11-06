import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { usePermissions, Permission } from '@/hooks/usePermissions';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, ArrowLeft, AlertTriangle } from 'lucide-react';

interface PermissionGuardProps {
  children: React.ReactNode;
  permission?: Permission;
  permissions?: Permission[];
  requireAll?: boolean;
  fallback?: React.ReactNode;
  redirectTo?: string;
  showError?: boolean;
}

export const PermissionGuard: React.FC<PermissionGuardProps> = ({
  children,
  permission,
  permissions = [],
  requireAll = false,
  fallback,
  redirectTo,
  showError = true
}) => {
  const { hasPermission, hasAllPermissions, hasAnyPermission, getPermissionError, isAuthenticated } = usePermissions();
  const location = useLocation();

  // If not authenticated, don't show permission error
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Determine required permissions
  const requiredPermissions = permission ? [permission] : permissions;
  
  // Check permissions
  const hasAccess = requireAll 
    ? hasAllPermissions(requiredPermissions)
    : hasAnyPermission(requiredPermissions);

  if (hasAccess) {
    return <>{children}</>;
  }

  // Handle no access
  if (redirectTo) {
    return <Navigate to={redirectTo} replace />;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  if (!showError) {
    return null;
  }

  // Default permission error UI
  const primaryPermission = permission || requiredPermissions[0];
  const errorMessage = primaryPermission ? getPermissionError(primaryPermission) : 'Access denied';

  return (
    <div className="space-y-6">
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          {errorMessage}. Please contact your administrator if you need access.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="p-4 bg-red-100 rounded-full">
              <Shield className="h-8 w-8 text-red-600" />
            </div>
          </div>
          <CardTitle className="text-xl">Access Restricted</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-muted-foreground">
            You don't have the necessary permissions to access this feature.
          </p>
          <div className="space-y-2">
            <p className="text-sm font-medium">Required permissions:</p>
            <ul className="text-sm text-muted-foreground space-y-1">
              {requiredPermissions.map((perm, index) => (
                <li key={index} className="font-mono">
                  {perm}
                </li>
              ))}
            </ul>
          </div>
          <div className="pt-4">
            <Button 
              variant="outline" 
              onClick={() => window.history.back()}
              className="mr-2"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Go Back
            </Button>
            <Button onClick={() => window.location.href = '/'}>
              Go to Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// Higher-order component for route protection
export const withPermissionGuard = <Props extends object,>(
  Component: React.ComponentType<Props>,
  permission: Permission | Permission[],
  options: Partial<PermissionGuardProps> = {}
) => {
  return (props: Props) => {
    const guardProps = Array.isArray(permission) 
      ? { permissions: permission, ...options }
      : { permission, ...options };

    return (
      <PermissionGuard {...guardProps}>
        <Component {...props} />
      </PermissionGuard>
    );
  };
};

// Utility component for conditional rendering based on permissions
interface PermissionCheckProps {
  permission?: Permission;
  permissions?: Permission[];
  requireAll?: boolean;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export const PermissionCheck: React.FC<PermissionCheckProps> = ({
  permission,
  permissions = [],
  requireAll = false,
  children,
  fallback = null
}) => {
  const { hasPermission, hasAllPermissions, hasAnyPermission } = usePermissions();

  const requiredPermissions = permission ? [permission] : permissions;
  const hasAccess = requireAll 
    ? hasAllPermissions(requiredPermissions)
    : hasAnyPermission(requiredPermissions);

  return hasAccess ? <>{children}</> : <>{fallback}</>;
};