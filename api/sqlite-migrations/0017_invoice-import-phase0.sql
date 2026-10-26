ALTER TABLE `invoices` ADD COLUMN `external_number` text;
ALTER TABLE `invoice_attachments` ADD COLUMN `role` text NOT NULL DEFAULT 'attachment' CHECK (`role` IN ('attachment','source_document'));
ALTER TABLE `invoice_attachments` ADD COLUMN `locked` integer NOT NULL DEFAULT 0 CHECK (`locked` IN (0,1));
ALTER TABLE `bill_attachments` ADD COLUMN `role` text NOT NULL DEFAULT 'attachment' CHECK (`role` IN ('attachment','source_document'));
ALTER TABLE `bill_attachments` ADD COLUMN `locked` integer NOT NULL DEFAULT 0 CHECK (`locked` IN (0,1));
