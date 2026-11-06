-- Reviewed additive subset of drizzle-kit generate --name settlements.
-- Generator metadata predates later hand-reviewed migrations; do not replay its unrelated tables.
-- Legacy settlements intentionally retain NULL snapshots for audit rather than invented rates.
ALTER TABLE `payments` ADD `currency` text;
ALTER TABLE `payments` ADD `base_currency` text;
ALTER TABLE `payments` ADD `exchange_rate` text;
ALTER TABLE `payments` ADD `exchange_rate_id` text;
ALTER TABLE `payments` ADD `base_amount` text;
ALTER TABLE `payments` ADD `book_base_amount` text;
ALTER TABLE `payments` ADD `exchange_difference` text;
ALTER TABLE `bill_payments` ADD `currency` text;
ALTER TABLE `bill_payments` ADD `base_currency` text;
ALTER TABLE `bill_payments` ADD `exchange_rate` text;
ALTER TABLE `bill_payments` ADD `exchange_rate_id` text;
ALTER TABLE `bill_payments` ADD `base_amount` text;
ALTER TABLE `bill_payments` ADD `book_base_amount` text;
ALTER TABLE `bill_payments` ADD `exchange_difference` text;
CREATE TABLE `reconciliation_supplier_payment_links` (
	`organisation_id` text NOT NULL,
	`match_id` text PRIMARY KEY NOT NULL,
	`bill_payment_id` text NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organisation_id`,`match_id`) REFERENCES `reconciliation_matches`(`organisation_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organisation_id`,`bill_payment_id`) REFERENCES `bill_payments`(`organisation_id`,`id`) ON UPDATE no action ON DELETE restrict
);
CREATE INDEX `reconciliation_supplier_payment_links_org_payment_idx` ON `reconciliation_supplier_payment_links` (`organisation_id`,`bill_payment_id`);
