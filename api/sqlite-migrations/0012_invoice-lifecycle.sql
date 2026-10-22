ALTER TABLE `invoices` ADD `lifecycle_status` text DEFAULT 'active' NOT NULL CHECK (`lifecycle_status` IN ('active', 'cancelled'));
--> statement-breakpoint
ALTER TABLE `invoices` ADD `external_id` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_org_external_id_uidx` ON `invoices` (`organisation_id`,`external_id`);
--> statement-breakpoint
ALTER TABLE `invoices` ADD `pre_cancel_status` text;
--> statement-breakpoint
ALTER TABLE `invoices` ADD `archived_at` integer;
--> statement-breakpoint
ALTER TABLE `line_items` ADD `discount_type` text DEFAULT 'fixed' NOT NULL CHECK (`discount_type` IN ('fixed', 'percent'));
--> statement-breakpoint
ALTER TABLE `line_items` ADD `discount_value` text;
--> statement-breakpoint
ALTER TABLE `line_items` ADD `discount_amount` text DEFAULT '0' NOT NULL;
--> statement-breakpoint
ALTER TABLE `line_items` ADD `taxes` text;
--> statement-breakpoint
ALTER TABLE `shared_invoices` ADD `attachment_ids` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
CREATE TABLE `invoice_history` (
  `id` text PRIMARY KEY NOT NULL,
  `organisation_id` text NOT NULL,
  `invoice_id` text NOT NULL,
  `actor_user_id` text NOT NULL,
  `action` text NOT NULL,
  `from_status` text,
  `to_status` text,
  `reason` text,
  `metadata` text,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`),
  FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`),
  FOREIGN KEY (`organisation_id`,`invoice_id`) REFERENCES `invoices`(`organisation_id`,`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `invoice_history_org_invoice_idx` ON `invoice_history` (`organisation_id`,`invoice_id`);
--> statement-breakpoint
CREATE TRIGGER `invoice_history_no_update`
BEFORE UPDATE ON `invoice_history`
BEGIN
  SELECT RAISE(ABORT, 'invoice history is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `invoice_history_no_delete`
BEFORE DELETE ON `invoice_history`
BEGIN
  SELECT RAISE(ABORT, 'invoice history is immutable');
END;
--> statement-breakpoint
CREATE TABLE `invoice_attachments` (
  `id` text PRIMARY KEY NOT NULL,
  `organisation_id` text NOT NULL,
  `invoice_id` text NOT NULL,
  `object_key` text NOT NULL,
  `filename` text NOT NULL,
  `content_type` text NOT NULL,
  `size` integer NOT NULL CHECK (`size` > 0 AND `size` <= 1048576),
  `created_by` text NOT NULL,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`),
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`),
  FOREIGN KEY (`organisation_id`,`invoice_id`) REFERENCES `invoices`(`organisation_id`,`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoice_attachments_org_id_uidx` ON `invoice_attachments` (`organisation_id`,`id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoice_attachments_org_key_uidx` ON `invoice_attachments` (`organisation_id`,`object_key`);
--> statement-breakpoint
CREATE INDEX `invoice_attachments_org_invoice_idx` ON `invoice_attachments` (`organisation_id`,`invoice_id`);
