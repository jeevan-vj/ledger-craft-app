export const DATABASE_ROLES = {
  migrator: 'ledgercraft_migrator',
  app: 'ledgercraft_app',
  readonly: 'ledgercraft_readonly',
} as const;

export type DatabaseRole = (typeof DATABASE_ROLES)[keyof typeof DATABASE_ROLES];
