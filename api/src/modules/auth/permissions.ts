import type { OrganisationPermission, OrganisationRole } from '@ledgercraft/contracts';

const allPermissions: OrganisationPermission[] = [
  'organisations.create', 'organisations.update', 'organisations.archive', 'organisations.switch',
  'customers.read', 'customers.write', 'invoices.read', 'invoices.write', 'bills.read', 'bills.write',
  'banking.read', 'banking.write', 'reports.read', 'settings.read', 'settings.write',
  'users.read', 'users.manage', 'api.access',
];

export const ROLE_PERMISSIONS: Record<OrganisationRole, readonly OrganisationPermission[]> = {
  owner: allPermissions,
  admin: allPermissions.filter((permission) => permission !== 'organisations.archive'),
  accountant: [
    'organisations.switch', 'customers.read', 'customers.write', 'invoices.read', 'invoices.write',
    'bills.read', 'bills.write', 'banking.read', 'banking.write', 'reports.read', 'settings.read',
    'users.read', 'api.access',
  ],
  member: [
    'organisations.switch', 'customers.read', 'customers.write', 'invoices.read', 'invoices.write',
    'bills.read', 'bills.write', 'reports.read', 'settings.read', 'api.access',
  ],
  read_only: [
    'organisations.switch', 'customers.read', 'invoices.read', 'bills.read', 'banking.read',
    'reports.read', 'settings.read', 'users.read', 'api.access',
  ],
};

export function isOrganisationRole(value: string): value is OrganisationRole {
  return value in ROLE_PERMISSIONS;
}

export function permissionsForRole(role: string): readonly OrganisationPermission[] {
  return isOrganisationRole(role) ? ROLE_PERMISSIONS[role] : [];
}

export function hasPermission(role: string, permission: OrganisationPermission): boolean {
  return permissionsForRole(role).includes(permission);
}
