-- Existing source validation is implemented by migration0008 triggers, not a
-- parent-table CHECK. Replace only those triggers; no table rebuild or row deletion.
DROP TRIGGER `bank_transactions_source_insert_check`;
--> statement-breakpoint
DROP TRIGGER `bank_transactions_source_update_check`;
--> statement-breakpoint
CREATE TRIGGER `bank_transactions_source_insert_check` BEFORE INSERT ON `bank_transactions`
WHEN NEW.source NOT IN ('import', 'manual', 'transfer', 'feed')
BEGIN SELECT RAISE(ABORT, 'Invalid bank transaction source'); END;
--> statement-breakpoint
CREATE TRIGGER `bank_transactions_source_update_check` BEFORE UPDATE OF source ON `bank_transactions`
WHEN NEW.source NOT IN ('import', 'manual', 'transfer', 'feed')
BEGIN SELECT RAISE(ABORT, 'Invalid bank transaction source'); END;
--> statement-breakpoint
CREATE TABLE `bank_feed_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`external_id` text NOT NULL,
	`bank_account_id` text NOT NULL,
	`name` text NOT NULL,
	`institution` text NOT NULL,
	`status` text NOT NULL,
	`currency` text NOT NULL,
	`last_synced_at` integer,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organisation_id`,`bank_account_id`) REFERENCES `bank_accounts`(`organisation_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "bank_feed_accounts_status_check" CHECK("bank_feed_accounts"."status" IN ('ACTIVE','INACTIVE'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_feed_accounts_external_uidx` ON `bank_feed_accounts` (`organisation_id`,`external_id`);--> statement-breakpoint
CREATE TABLE `bank_feed_connections` (
	`organisation_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'connected' NOT NULL,
	`last_attempt_at` integer,
	`last_synced_at` integer,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "bank_feed_connection_status_check" CHECK("bank_feed_connections"."status" IN ('connected','revoked','disconnected'))
);
--> statement-breakpoint
CREATE TABLE `bank_feed_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`external_id` text NOT NULL,
	`bank_account_id` text NOT NULL,
	`transaction_id` text NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organisation_id`,`bank_account_id`) REFERENCES `bank_accounts`(`organisation_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`organisation_id`,`transaction_id`) REFERENCES `bank_transactions`(`organisation_id`,`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_feed_transactions_external_uidx` ON `bank_feed_transactions` (`organisation_id`,`external_id`);