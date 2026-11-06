import React from 'react';
import { usePermissions, Permission } from '@/hooks/usePermissions';

interface NavigationGuardProps {
  children: React.ReactNode;
  permission?: Permission;
  permissions?: Permission[];
  requireAll?: boolean;
  hideWhenNoAccess?: boolean;
}

export const NavigationGuard: React.FC<NavigationGuardProps> = ({
  children,
  permission,
  permissions = [],
  requireAll = false,
  hideWhenNoAccess = true
}) => {
  const { hasPermission, hasAllPermissions, hasAnyPermission, isAuthenticated } = usePermissions();

  // If not authenticated, hide navigation items
  if (!isAuthenticated) {
    return hideWhenNoAccess ? null : <>{children}</>;
  }

  // Determine required permissions
  const requiredPermissions = permission ? [permission] : permissions;
  
  // Check permissions
  const hasAccess = requireAll 
    ? hasAllPermissions(requiredPermissions)
    : hasAnyPermission(requiredPermissions);

  // Show or hide based on access
  if (!hasAccess && hideWhenNoAccess) {
    return null;
  }

  // If we're showing regardless of access, we might want to disable the element
  if (!hasAccess && !hideWhenNoAccess) {
    // Clone children and add disabled properties if possible
    return React.cloneElement(children as React.ReactElement, {
      disabled: true,
      className: `${(children as React.ReactElement).props.className} opacity-50 cursor-not-allowed`
    });
  }

  return <>{children}</>;
};

// Hook for navigation item filtering
export const useNavigationFilter = () => {
  const { hasPermission, canAccessRoute } = usePermissions();

  const filterNavigationItems = <Item extends { path: string; permission?: Permission },>(items: Item[]) => {
    return items.filter(item => {
      if (item.permission) {
        return hasPermission(item.permission);
      }
      return canAccessRoute(item.path);
    });
  };

  return { filterNavigationItems };
};