import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { organisations, users } from './identity';

const timestamp = (name: string) => integer(name, { mode: 'timestamp_ms' });

export const importBatches = sqliteTable('import_batches', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id, { onDelete: 'cascade' }),
  createdBy: text('created_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  status: text('status').notNull().default('uploaded'),
  fileCount: integer('file_count').notNull(),
  createdAt: timestamp('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
  updatedAt: timestamp('updated_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  check('import_batches_status_check', sql`${table.status} IN ('uploaded','processing','needs_review','failed','committed','discarded')`),
  check('import_batches_file_count_check', sql`${table.fileCount} BETWEEN 1 AND 10`),
  uniqueIndex('import_batches_org_id_uidx').on(table.organisationId, table.id),
  index('import_batches_org_created_idx').on(table.organisationId, table.createdAt),
]);

export const importDocuments = sqliteTable('import_documents', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id, { onDelete: 'cascade' }),
  batchId: text('batch_id').notNull(),
  status: text('status').notNull().default('uploaded'),
  originalFilename: text('original_filename').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  pageCount: integer('page_count'),
  sha256: text('sha256').notNull(),
  storageKey: text('storage_key').notNull(),
  uploadedBy: text('uploaded_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  uploadedAt: timestamp('uploaded_at').default(sql`(unixepoch() * 1000)`).notNull(),
  extractionDraftJson: text('extraction_draft_json', { mode: 'json' }),
  direction: text('direction'),
  thirdPartyIssued: integer('third_party_issued', { mode: 'boolean' }).notNull().default(false),
  externalIssuerName: text('external_issuer_name'),
  externalIssuerGstNumber: text('external_issuer_gst_number'),
  externalNumber: text('external_number'),
  committedRecordType: text('committed_record_type'),
  committedRecordId: text('committed_record_id'),
  duplicateOfDocumentId: text('duplicate_of_document_id'),
  updatedAt: timestamp('updated_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  check('import_documents_status_check', sql`${table.status} IN ('uploaded','processing','needs_review','failed','committed','discarded')`),
  check('import_documents_size_check', sql`${table.sizeBytes} >= 0`),
  check('import_documents_page_count_check', sql`${table.pageCount} IS NULL OR ${table.pageCount} >= 1`),
  check('import_documents_sha256_check', sql`length(${table.sha256}) = 64 AND ${table.sha256} NOT GLOB '*[^0-9a-f]*'`),
  check('import_documents_direction_check', sql`${table.direction} IS NULL OR ${table.direction} IN ('sales','purchase')`),
  check('import_documents_third_party_issued_check', sql`${table.thirdPartyIssued} IN (0,1)`),
  check('import_documents_committed_record_type_check', sql`${table.committedRecordType} IS NULL OR ${table.committedRecordType} IN ('invoice','bill')`),
  check('import_documents_committed_record_check', sql`(${table.committedRecordType} IS NULL AND ${table.committedRecordId} IS NULL) OR (${table.committedRecordType} IS NOT NULL AND ${table.committedRecordId} IS NOT NULL)`),
  uniqueIndex('import_documents_org_id_uidx').on(table.organisationId, table.id),
  uniqueIndex('import_documents_org_storage_key_uidx').on(table.organisationId, table.storageKey),
  index('import_documents_org_batch_idx').on(table.organisationId, table.batchId, table.uploadedAt),
  index('import_documents_org_status_idx').on(table.organisationId, table.status, table.uploadedAt),
  index('import_documents_org_sha256_idx').on(table.organisationId, table.sha256),
  foreignKey({
    columns: [table.organisationId, table.batchId],
    foreignColumns: [importBatches.organisationId, importBatches.id],
  }).onDelete('cascade'),
  foreignKey({
    columns: [table.organisationId, table.duplicateOfDocumentId],
    foreignColumns: [table.organisationId, table.id],
  }).onDelete('restrict'),
]);

export const importDocumentEvents = sqliteTable('import_document_events', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id, { onDelete: 'cascade' }),
  documentId: text('document_id').notNull(),
  action: text('action').notNull(),
  actorUserId: text('actor_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  detailsJson: text('details_json', { mode: 'json' }),
  createdAt: timestamp('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  uniqueIndex('import_document_events_org_id_uidx').on(table.organisationId, table.id),
  index('import_document_events_org_document_idx').on(table.organisationId, table.documentId, table.createdAt),
  foreignKey({
    columns: [table.organisationId, table.documentId],
    foreignColumns: [importDocuments.organisationId, importDocuments.id],
  }).onDelete('cascade'),
]);
