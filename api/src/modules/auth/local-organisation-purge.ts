import { sql } from 'drizzle-orm';
import type { Database } from '../../db/client';
import type { FileStorage } from '../storage/file-storage';
import type { ObjectStore } from '../storage/object-store';

type LocalOrganisationStores = {
  objectStore?: ObjectStore;
  fileStorage?: FileStorage;
};

/** Purge both filesystem-backed stores and the tenant rows held in the shared local SQLite database. */
export async function purgeLocalOrganisationData(
  db: Database,
  stores: LocalOrganisationStores,
  organisationId: string,
): Promise<void> {
  await stores.objectStore?.purgePrefix?.(`${organisationId}/`);
  await stores.fileStorage?.purgePrefix?.(`${organisationId}/`);
  await purgeLocalOrganisationRows(db, organisationId);
}

/** Local Node keeps all tenants in one SQLite file, so remove every tenant-scoped row before deleting the Identity organisation. */
export async function purgeLocalOrganisationRows(db: Database, organisationId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw('PRAGMA defer_foreign_keys = ON'));
    const triggers = await tx.execute<{ name: string; sql: string }>(sql.raw(`
      SELECT name, sql FROM sqlite_schema
      WHERE type = 'trigger' AND sql IS NOT NULL
      ORDER BY name
    `));
    for (const trigger of triggers) {
      const identifier = `"${trigger.name.replaceAll('"', '""')}"`;
      await tx.execute(sql.raw(`DROP TRIGGER ${identifier}`));
    }
    const tables = await tx.execute<{ name: string }>(sql.raw(`
      SELECT schema.name AS name
      FROM sqlite_schema AS schema
      WHERE schema.type = 'table'
        AND schema.name NOT LIKE 'sqlite_%'
        AND schema.name NOT IN ('organisation_memberships', 'organisation_invitations', 'active_organisation_selections')
        AND EXISTS (
          SELECT 1 FROM pragma_table_info(schema.name) AS column_info
          WHERE column_info.name = 'organisation_id'
        )
      ORDER BY schema.name
    `));
    for (const table of tables) {
      const identifier = `"${table.name.replaceAll('"', '""')}"`;
      await tx.execute(sql.raw(`DELETE FROM ${identifier} WHERE organisation_id = '${organisationId.replaceAll("'", "''")}'`));
    }
    for (const trigger of triggers) await tx.execute(sql.raw(trigger.sql));
  });
}
