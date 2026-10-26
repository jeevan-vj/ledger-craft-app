ALTER TABLE `import_documents` ADD COLUMN `extraction_provider` text CHECK (`extraction_provider` IS NULL OR `extraction_provider` IN ('openai','xai','mock'));
ALTER TABLE `import_documents` ADD COLUMN `extraction_mock` integer NOT NULL DEFAULT 0 CHECK (`extraction_mock` IN (0,1));
ALTER TABLE `import_documents` ADD COLUMN `validation_issues_json` text;
ALTER TABLE `import_documents` ADD COLUMN `contact_id` text;
ALTER TABLE `import_documents` ADD COLUMN `extracted_at` integer;
ALTER TABLE `import_documents` ADD COLUMN `reviewed_at` integer;
ALTER TABLE `invoices` ADD COLUMN `third_party_issued` integer NOT NULL DEFAULT 0 CHECK (`third_party_issued` IN (0,1));

