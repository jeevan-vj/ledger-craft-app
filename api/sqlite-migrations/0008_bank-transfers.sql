CREATE TABLE `bank_transfers` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`source_account_id` text NOT NULL,
	`destination_account_id` text NOT NULL,
	`transaction_date` text NOT NULL,
	`amount` text NOT NULL,
	`currency` text NOT NULL,
	`description` text NOT NULL,
	`reference` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organisation_id`,`source_account_id`) REFERENCES `bank_accounts`(`organisation_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`organisation_id`,`destination_account_id`) REFERENCES `bank_accounts`(`organisation_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "bank_transfers_distinct_accounts_check" CHECK(source_account_id <> destination_account_id),
	CONSTRAINT "bank_transfers_amount_check" CHECK(amount <> '' AND amount NOT GLOB '*[^0-9.]*' AND amount GLOB '[0-9]*' AND amount NOT LIKE '%.' AND length(amount) - length(replace(amount, '.', '')) <= 1 AND trim(amount, '0.') <> '')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_transfers_org_id_uidx` ON `bank_transfers` (`organisation_id`,`id`);
--> statement-breakpoint
CREATE INDEX `bank_transfers_org_idx` ON `bank_transfers` (`organisation_id`);
--> statement-breakpoint
ALTER TABLE `bank_transactions` ADD `source` text DEFAULT 'import' NOT NULL;
--> statement-breakpoint
ALTER TABLE `bank_transactions` ADD `payment_method` text;
--> statement-breakpoint
ALTER TABLE `bank_transactions` ADD `counterparty` text;
--> statement-breakpoint
ALTER TABLE `bank_transactions` ADD `transfer_id` text;
--> statement-breakpoint
CREATE INDEX `bank_transactions_transfer_idx` ON `bank_transactions` (`organisation_id`,`transfer_id`);
--> statement-breakpoint
CREATE TRIGGER `bank_transactions_source_insert_check` BEFORE INSERT ON `bank_transactions`
WHEN NEW.source NOT IN ('import', 'manual', 'transfer')
BEGIN SELECT RAISE(ABORT, 'invalid bank transaction source'); END;
--> statement-breakpoint
CREATE TRIGGER `bank_transactions_source_update_check` BEFORE UPDATE OF `source` ON `bank_transactions`
WHEN NEW.source NOT IN ('import', 'manual', 'transfer')
BEGIN SELECT RAISE(ABORT, 'invalid bank transaction source'); END;
--> statement-breakpoint
CREATE TRIGGER `bank_transactions_payment_method_insert_check` BEFORE INSERT ON `bank_transactions`
WHEN NEW.payment_method IS NOT NULL AND NEW.payment_method NOT IN ('bank_transfer', 'cash', 'card', 'cheque', 'other')
BEGIN SELECT RAISE(ABORT, 'invalid bank transaction payment method'); END;
--> statement-breakpoint
CREATE TRIGGER `bank_transactions_payment_method_update_check` BEFORE UPDATE OF `payment_method` ON `bank_transactions`
WHEN NEW.payment_method IS NOT NULL AND NEW.payment_method NOT IN ('bank_transfer', 'cash', 'card', 'cheque', 'other')
BEGIN SELECT RAISE(ABORT, 'invalid bank transaction payment method'); END;
--> statement-breakpoint
CREATE TRIGGER `bank_transactions_transfer_insert_check` BEFORE INSERT ON `bank_transactions`
WHEN NEW.transfer_id IS NOT NULL AND NOT EXISTS (
	SELECT 1 FROM `bank_transfers` WHERE `id` = NEW.transfer_id AND `organisation_id` = NEW.organisation_id
)
BEGIN SELECT RAISE(ABORT, 'invalid bank transaction transfer'); END;
