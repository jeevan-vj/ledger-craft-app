CREATE TABLE `bank_transaction_attachments` (
  `id` text PRIMARY KEY NOT NULL,
  `organisation_id` text NOT NULL REFERENCES `organisations`(`id`),
  `transaction_id` text NOT NULL,
  `object_key` text NOT NULL,
  `filename` text NOT NULL,
  `content_type` text NOT NULL,
  `size` integer NOT NULL,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`organisation_id`,`transaction_id`) REFERENCES `bank_transactions`(`organisation_id`,`id`) ON DELETE cascade,
  CONSTRAINT `bank_transaction_attachments_size_check` CHECK (`size` > 0 AND `size` <= 1048576)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_transaction_attachments_org_id_uidx` ON `bank_transaction_attachments` (`organisation_id`,`id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_transaction_attachments_object_uidx` ON `bank_transaction_attachments` (`organisation_id`,`object_key`);
--> statement-breakpoint
CREATE INDEX `bank_transaction_attachments_tx_idx` ON `bank_transaction_attachments` (`organisation_id`,`transaction_id`);
--> statement-breakpoint
CREATE TABLE `bank_transaction_document_connections` (
  `id` text PRIMARY KEY NOT NULL,
  `organisation_id` text NOT NULL REFERENCES `organisations`(`id`),
  `transaction_id` text NOT NULL,
  `document_type` text NOT NULL,
  `document_id` text NOT NULL,
  `document_number` text NOT NULL,
  `amount` text NOT NULL,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`organisation_id`,`transaction_id`) REFERENCES `bank_transactions`(`organisation_id`,`id`) ON DELETE restrict,
  CONSTRAINT `bank_transaction_connections_type_check` CHECK (`document_type` IN ('invoice', 'bill')),
  CONSTRAINT `bank_transaction_connections_amount_check` CHECK (`amount` <> '' AND `amount` NOT GLOB '*[^0-9.]*' AND `amount` GLOB '[0-9]*' AND `amount` NOT LIKE '%.' AND trim(`amount`, '0.') <> '')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_transaction_connections_org_id_uidx` ON `bank_transaction_document_connections` (`organisation_id`,`id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_transaction_connections_doc_uidx` ON `bank_transaction_document_connections` (`organisation_id`,`transaction_id`,`document_type`,`document_id`);
--> statement-breakpoint
CREATE INDEX `bank_transaction_connections_tx_idx` ON `bank_transaction_document_connections` (`organisation_id`,`transaction_id`);
--> statement-breakpoint
CREATE TABLE `bank_transaction_splits` (
  `id` text PRIMARY KEY NOT NULL,
  `organisation_id` text NOT NULL REFERENCES `organisations`(`id`),
  `transaction_id` text NOT NULL,
  `category` text NOT NULL,
  `description` text,
  `amount` text NOT NULL,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`organisation_id`,`transaction_id`) REFERENCES `bank_transactions`(`organisation_id`,`id`) ON DELETE cascade,
  CONSTRAINT `bank_transaction_splits_amount_check` CHECK (`amount` <> '' AND `amount` NOT GLOB '*[^0-9.]*' AND `amount` GLOB '[0-9]*' AND `amount` NOT LIKE '%.' AND trim(`amount`, '0.') <> '')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_transaction_splits_org_id_uidx` ON `bank_transaction_splits` (`organisation_id`,`id`);
--> statement-breakpoint
CREATE INDEX `bank_transaction_splits_tx_idx` ON `bank_transaction_splits` (`organisation_id`,`transaction_id`);
