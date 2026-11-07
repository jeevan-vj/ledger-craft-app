import { foreignKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { organisations } from './identity';
import { bankAccounts } from './bank';
export const bankPreferences = sqliteTable('bank_preferences', {
  organisationId: text('organisation_id').primaryKey().references(() => organisations.id),
  defaultAccountId: text('default_account_id'),
}, table => [foreignKey({ columns: [table.organisationId, table.defaultAccountId], foreignColumns: [bankAccounts.organisationId, bankAccounts.id] }).onDelete('restrict')]);
