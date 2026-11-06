-- Reviewed additive subset of drizzle-kit generate --name credit_notes.
-- Generator metadata predates later migrations; unrelated generated changes are excluded.
CREATE TABLE `credit_note_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`credit_note_id` text NOT NULL,
	`line_order` integer NOT NULL,
	`data` text NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organisation_id`,`credit_note_id`) REFERENCES `credit_notes`(`organisation_id`,`id`) ON UPDATE no action ON DELETE restrict
);
CREATE INDEX `credit_note_lines_source_idx` ON `credit_note_lines` (`organisation_id`,`credit_note_id`);
CREATE TABLE `credit_note_refunds` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`credit_note_id` text NOT NULL,
	`bank_account_id` text NOT NULL,
	`amount` text NOT NULL,
	`refund_date` text NOT NULL,
	`currency` text NOT NULL,
	`base_currency` text NOT NULL,
	`exchange_rate` text NOT NULL,
	`exchange_rate_id` text,
	`base_amount` text NOT NULL,
	`book_base_amount` text NOT NULL,
	`exchange_difference` text NOT NULL,
	`reference` text,
	`status` text DEFAULT 'completed' NOT NULL,
	`reversal_date` text,
	`reversal_reason` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organisation_id`,`credit_note_id`) REFERENCES `credit_notes`(`organisation_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`organisation_id`,`bank_account_id`) REFERENCES `bank_accounts`(`organisation_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "credit_note_refunds_status_check" CHECK("credit_note_refunds"."status" IN ('completed','reversed'))
);
CREATE UNIQUE INDEX `credit_note_refunds_org_id_uidx` ON `credit_note_refunds` (`organisation_id`,`id`);
CREATE INDEX `credit_note_refunds_source_idx` ON `credit_note_refunds` (`organisation_id`,`credit_note_id`);
CREATE TABLE `credit_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`invoice_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`credit_note_number` text NOT NULL,
	`issue_date` text NOT NULL,
	`reason` text NOT NULL,
	`status` text DEFAULT 'issued' NOT NULL,
	`reversal_date` text,
	`reversal_reason` text,
	`currency` text NOT NULL,
	`exchange_rate` text NOT NULL,
	`exchange_rate_id` text,
	`base_currency` text NOT NULL,
	`subtotal` text NOT NULL,
	`tax_amount` text NOT NULL,
	`total` text NOT NULL,
	`base_total` text NOT NULL,
	`base_tax_amount` text NOT NULL,
	`receivable_amount` text NOT NULL,
	`base_receivable_amount` text NOT NULL,
	`customer_credit_amount` text NOT NULL,
	`base_customer_credit_amount` text NOT NULL,
	`base_customer_credit_tax_amount` text NOT NULL,
	`refunded_amount` text DEFAULT '0.00' NOT NULL,
	`base_refunded_amount` text DEFAULT '0.00' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organisation_id`,`invoice_id`) REFERENCES `invoices`(`organisation_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "credit_notes_status_check" CHECK("credit_notes"."status" IN ('issued','reversed'))
);
CREATE UNIQUE INDEX `credit_notes_org_id_uidx` ON `credit_notes` (`organisation_id`,`id`);
CREATE UNIQUE INDEX `credit_notes_org_number_uidx` ON `credit_notes` (`organisation_id`,`credit_note_number`);
CREATE INDEX `credit_notes_invoice_idx` ON `credit_notes` (`organisation_id`,`invoice_id`);

-- Four generated invoice columns applied additively; no table rebuild.
ALTER TABLE `invoices` ADD `total_credited` text DEFAULT '0.00' NOT NULL;
ALTER TABLE `invoices` ADD `tax_credited` text DEFAULT '0.00' NOT NULL;
ALTER TABLE `invoices` ADD `base_credited` text DEFAULT '0.00' NOT NULL;
ALTER TABLE `invoices` ADD `base_tax_credited` text DEFAULT '0.00' NOT NULL;
