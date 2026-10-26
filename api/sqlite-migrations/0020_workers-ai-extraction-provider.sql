-- Allow 'workers-ai' as an invoice-import extraction provider.
-- SQLite cannot alter a column CHECK in place, so copy into a new column,
-- drop the old one and rename. Existing values are preserved.
ALTER TABLE `import_documents` ADD COLUMN `extraction_provider_next` text CHECK (`extraction_provider_next` IS NULL OR `extraction_provider_next` IN ('openai','xai','workers-ai','mock'));
UPDATE `import_documents` SET `extraction_provider_next` = `extraction_provider`;
ALTER TABLE `import_documents` DROP COLUMN `extraction_provider`;
ALTER TABLE `import_documents` RENAME COLUMN `extraction_provider_next` TO `extraction_provider`;
