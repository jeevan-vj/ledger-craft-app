CREATE TABLE `bank_preferences` (
	`organisation_id` text PRIMARY KEY NOT NULL,
	`default_account_id` text,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organisation_id`,`default_account_id`) REFERENCES `bank_accounts`(`organisation_id`,`id`) ON UPDATE no action ON DELETE restrict
);
