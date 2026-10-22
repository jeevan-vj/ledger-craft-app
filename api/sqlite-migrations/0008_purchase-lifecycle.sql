ALTER TABLE `vendors` ADD `contact_name` text;
--> statement-breakpoint
ALTER TABLE `vendors` ADD `default_account_id` text;
--> statement-breakpoint
ALTER TABLE `vendors` ADD `default_tax_rate` text DEFAULT '15' NOT NULL;
--> statement-breakpoint
ALTER TABLE `vendors` ADD `import_identifier` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `vendors_org_import_identifier_uidx` ON `vendors` (`organisation_id`,`import_identifier`);
--> statement-breakpoint
CREATE TABLE `bill_attachments` (
  `id` text PRIMARY KEY NOT NULL,
  `organisation_id` text NOT NULL,
  `bill_id` text NOT NULL,
  `object_key` text NOT NULL,
  `filename` text NOT NULL,
  `content_type` text NOT NULL,
  `size` integer NOT NULL,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`),
  FOREIGN KEY (`organisation_id`,`bill_id`) REFERENCES `bills`(`organisation_id`,`id`) ON DELETE cascade,
  CONSTRAINT `bill_attachments_size_check` CHECK (`size` >= 0 AND `size` <= 1048576)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bill_attachments_org_id_uidx` ON `bill_attachments` (`organisation_id`,`id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `bill_attachments_org_object_uidx` ON `bill_attachments` (`organisation_id`,`object_key`);
--> statement-breakpoint
CREATE TABLE `bill_history` (
  `id` text PRIMARY KEY NOT NULL,
  `organisation_id` text NOT NULL,
  `user_id` text NOT NULL,
  `bill_id` text NOT NULL,
  `event` text NOT NULL,
  `summary` text NOT NULL,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`),
  FOREIGN KEY (`organisation_id`,`bill_id`) REFERENCES `bills`(`organisation_id`,`id`) ON DELETE cascade,
  CONSTRAINT `bill_history_event_check` CHECK (`event` IN ('created','updated','received','cancelled','restored','payment_recorded','attachment_added','attachment_removed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bill_history_org_id_uidx` ON `bill_history` (`organisation_id`,`id`);
--> statement-breakpoint
CREATE INDEX `bill_history_org_bill_idx` ON `bill_history` (`organisation_id`,`bill_id`,`created_at`);
--> statement-breakpoint
INSERT INTO `bill_history` (`id`,`organisation_id`,`user_id`,`bill_id`,`event`,`summary`,`created_at`)
SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-a' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))),
       `organisation_id`,`user_id`,`id`,'created','Bill created',`created_at`
FROM `bills`;
