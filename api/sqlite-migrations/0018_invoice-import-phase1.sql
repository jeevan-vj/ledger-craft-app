CREATE TABLE `import_batches` (
  `id` text PRIMARY KEY NOT NULL,
  `organisation_id` text NOT NULL,
  `created_by` text NOT NULL,
  `status` text NOT NULL DEFAULT 'uploaded' CHECK (`status` IN ('uploaded','processing','needs_review','failed','committed','discarded')),
  `file_count` integer NOT NULL CHECK (`file_count` BETWEEN 1 AND 10),
  `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  `updated_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX `import_batches_org_id_uidx` ON `import_batches` (`organisation_id`,`id`);
CREATE INDEX `import_batches_org_created_idx` ON `import_batches` (`organisation_id`,`created_at`);

CREATE TABLE `import_documents` (
  `id` text PRIMARY KEY NOT NULL,
  `organisation_id` text NOT NULL,
  `batch_id` text NOT NULL,
  `status` text NOT NULL DEFAULT 'uploaded' CHECK (`status` IN ('uploaded','processing','needs_review','failed','committed','discarded')),
  `original_filename` text NOT NULL,
  `mime_type` text NOT NULL,
  `size_bytes` integer NOT NULL CHECK (`size_bytes` >= 0),
  `page_count` integer CHECK (`page_count` IS NULL OR `page_count` >= 1),
  `sha256` text NOT NULL CHECK (length(`sha256`) = 64 AND `sha256` NOT GLOB '*[^0-9a-f]*'),
  `storage_key` text NOT NULL,
  `uploaded_by` text NOT NULL,
  `uploaded_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  `extraction_draft_json` text,
  `direction` text CHECK (`direction` IS NULL OR `direction` IN ('sales','purchase')),
  `third_party_issued` integer NOT NULL DEFAULT 0 CHECK (`third_party_issued` IN (0,1)),
  `external_issuer_name` text,
  `external_issuer_gst_number` text,
  `external_number` text,
  `committed_record_type` text CHECK (`committed_record_type` IS NULL OR `committed_record_type` IN ('invoice','bill')),
  `committed_record_id` text,
  `duplicate_of_document_id` text,
  `updated_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`organisation_id`,`batch_id`) REFERENCES `import_batches`(`organisation_id`,`id`) ON DELETE CASCADE,
  FOREIGN KEY (`organisation_id`,`duplicate_of_document_id`) REFERENCES `import_documents`(`organisation_id`,`id`) ON DELETE RESTRICT,
  CHECK ((`committed_record_type` IS NULL AND `committed_record_id` IS NULL) OR (`committed_record_type` IS NOT NULL AND `committed_record_id` IS NOT NULL))
);
CREATE UNIQUE INDEX `import_documents_org_id_uidx` ON `import_documents` (`organisation_id`,`id`);
CREATE UNIQUE INDEX `import_documents_org_storage_key_uidx` ON `import_documents` (`organisation_id`,`storage_key`);
CREATE INDEX `import_documents_org_batch_idx` ON `import_documents` (`organisation_id`,`batch_id`,`uploaded_at`);
CREATE INDEX `import_documents_org_status_idx` ON `import_documents` (`organisation_id`,`status`,`uploaded_at`);
CREATE INDEX `import_documents_org_sha256_idx` ON `import_documents` (`organisation_id`,`sha256`);

CREATE TABLE `import_document_events` (
  `id` text PRIMARY KEY NOT NULL,
  `organisation_id` text NOT NULL,
  `document_id` text NOT NULL,
  `action` text NOT NULL,
  `actor_user_id` text NOT NULL,
  `details_json` text,
  `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`organisation_id`,`document_id`) REFERENCES `import_documents`(`organisation_id`,`id`) ON DELETE CASCADE
);
CREATE UNIQUE INDEX `import_document_events_org_id_uidx` ON `import_document_events` (`organisation_id`,`id`);
CREATE INDEX `import_document_events_org_document_idx` ON `import_document_events` (`organisation_id`,`document_id`,`created_at`);
CREATE TRIGGER `import_document_events_no_update`
BEFORE UPDATE ON `import_document_events`
BEGIN
  SELECT RAISE(ABORT, 'import document events are immutable');
END;
CREATE TRIGGER `import_document_events_no_delete`
BEFORE DELETE ON `import_document_events`
BEGIN
  SELECT RAISE(ABORT, 'import document events are immutable');
END;

ALTER TABLE `invoices` ADD COLUMN `source` text NOT NULL DEFAULT 'manual' CHECK (`source` IN ('manual','import'));
ALTER TABLE `invoices` ADD COLUMN `external_issuer_name` text;
ALTER TABLE `invoices` ADD COLUMN `import_document_id` text;
CREATE INDEX `invoices_org_import_document_idx` ON `invoices` (`organisation_id`,`import_document_id`);
CREATE INDEX `invoices_org_external_number_idx` ON `invoices` (`organisation_id`,`external_issuer_name`,`external_number`);

ALTER TABLE `bills` ADD COLUMN `source` text NOT NULL DEFAULT 'manual' CHECK (`source` IN ('manual','import'));
ALTER TABLE `bills` ADD COLUMN `external_issuer_name` text;
ALTER TABLE `bills` ADD COLUMN `external_number` text;
ALTER TABLE `bills` ADD COLUMN `import_document_id` text;
CREATE INDEX `bills_org_import_document_idx` ON `bills` (`organisation_id`,`import_document_id`);
CREATE INDEX `bills_org_external_number_idx` ON `bills` (`organisation_id`,`external_issuer_name`,`external_number`);
