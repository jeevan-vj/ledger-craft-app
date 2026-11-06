ALTER TABLE `reconciliation_matches` ADD `bill_id` text;
--> statement-breakpoint
CREATE INDEX `reconciliation_matches_org_bill_idx` ON `reconciliation_matches` (`organisation_id`,`bill_id`);
--> statement-breakpoint
ALTER TABLE `bill_payments` ADD `status` text DEFAULT 'completed' NOT NULL;
--> statement-breakpoint
ALTER TABLE `bill_payments` ADD `reversal_reason` text;
--> statement-breakpoint
ALTER TABLE `bill_payments` ADD `reversal_date` text;
--> statement-breakpoint
ALTER TABLE `bill_payments` ADD `reversed_at` integer;
--> statement-breakpoint
ALTER TABLE `bill_payments` ADD `reversed_by_user_id` text REFERENCES `users`(`id`);
--> statement-breakpoint
CREATE TRIGGER `bill_payments_status_insert_check`
BEFORE INSERT ON `bill_payments`
WHEN NEW.`status` NOT IN ('completed','reversed')
BEGIN
  SELECT RAISE(ABORT, 'invalid bill payment status');
END;
--> statement-breakpoint
CREATE TRIGGER `bill_payments_status_update_check`
BEFORE UPDATE OF `status` ON `bill_payments`
WHEN NEW.`status` NOT IN ('completed','reversed')
BEGIN
  SELECT RAISE(ABORT, 'invalid bill payment status');
END;
--> statement-breakpoint
CREATE TABLE `bank_matching_rules` (
  `id` text PRIMARY KEY NOT NULL,
  `organisation_id` text NOT NULL REFERENCES `organisations`(`id`),
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `description_contains` text NOT NULL,
  `amount_min` text,
  `amount_max` text,
  `direction` text DEFAULT 'any' NOT NULL,
  `target_account_id` text NOT NULL,
  `contact_id` text,
  `enabled` integer DEFAULT true NOT NULL,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`organisation_id`,`target_account_id`) REFERENCES `accounts`(`organisation_id`,`id`) ON DELETE restrict,
  CONSTRAINT `bank_matching_rules_description_check` CHECK (length(trim(`description_contains`)) > 0),
  CONSTRAINT `bank_matching_rules_direction_check` CHECK (`direction` IN ('debit','credit','any')),
  CONSTRAINT `bank_matching_rules_amount_min_check` CHECK (`amount_min` IS NULL OR (`amount_min` <> '' AND `amount_min` NOT GLOB '*[^0-9.]*' AND `amount_min` GLOB '[0-9]*' AND `amount_min` NOT LIKE '%.' AND length(`amount_min`) - length(replace(`amount_min`, '.', '')) <= 1)),
  CONSTRAINT `bank_matching_rules_amount_max_check` CHECK (`amount_max` IS NULL OR (`amount_max` <> '' AND `amount_max` NOT GLOB '*[^0-9.]*' AND `amount_max` GLOB '[0-9]*' AND `amount_max` NOT LIKE '%.' AND length(`amount_max`) - length(replace(`amount_max`, '.', '')) <= 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_matching_rules_org_id_uidx` ON `bank_matching_rules` (`organisation_id`,`id`);
--> statement-breakpoint
CREATE INDEX `bank_matching_rules_org_enabled_idx` ON `bank_matching_rules` (`organisation_id`,`enabled`);
--> statement-breakpoint
CREATE TABLE `bank_reconciliation_actions` (
  `id` text PRIMARY KEY NOT NULL,
  `organisation_id` text NOT NULL REFERENCES `organisations`(`id`),
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `transaction_id` text NOT NULL,
  `action_type` text NOT NULL,
  `journal_entry_id` text NOT NULL,
  `status` text DEFAULT 'active' NOT NULL,
  `reversal_reason` text,
  `reversed_at` integer,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`organisation_id`,`transaction_id`) REFERENCES `bank_transactions`(`organisation_id`,`id`) ON DELETE restrict,
  FOREIGN KEY (`organisation_id`,`journal_entry_id`) REFERENCES `journal_entries`(`organisation_id`,`id`) ON DELETE restrict,
  CONSTRAINT `bank_reconciliation_actions_type_check` CHECK (`action_type` IN ('accept','personal')),
  CONSTRAINT `bank_reconciliation_actions_status_check` CHECK (`status` IN ('active','reversed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_reconciliation_actions_org_id_uidx` ON `bank_reconciliation_actions` (`organisation_id`,`id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_reconciliation_actions_active_tx_uidx` ON `bank_reconciliation_actions` (`organisation_id`,`transaction_id`) WHERE `status` = 'active';
--> statement-breakpoint
CREATE TABLE `bank_reconciliation_action_items` (
  `id` text PRIMARY KEY NOT NULL,
  `organisation_id` text NOT NULL REFERENCES `organisations`(`id`),
  `action_id` text NOT NULL,
  `document_type` text NOT NULL,
  `document_id` text NOT NULL,
  `payment_id` text,
  `bill_payment_id` text,
  `amount` text NOT NULL,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`organisation_id`,`action_id`) REFERENCES `bank_reconciliation_actions`(`organisation_id`,`id`) ON DELETE cascade,
  FOREIGN KEY (`organisation_id`,`payment_id`) REFERENCES `payments`(`organisation_id`,`id`) ON DELETE restrict,
  FOREIGN KEY (`organisation_id`,`bill_payment_id`) REFERENCES `bill_payments`(`organisation_id`,`id`) ON DELETE restrict,
  CONSTRAINT `bank_reconciliation_action_items_type_check` CHECK (`document_type` IN ('invoice','bill')),
  CONSTRAINT `bank_reconciliation_action_items_amount_check` CHECK (`amount` <> '' AND `amount` NOT GLOB '*[^0-9.]*' AND `amount` GLOB '[0-9]*' AND `amount` NOT LIKE '%.' AND length(`amount`) - length(replace(`amount`, '.', '')) <= 1),
  CONSTRAINT `bank_reconciliation_action_items_payment_check` CHECK ((`document_type` = 'invoice' AND `payment_id` IS NOT NULL AND `bill_payment_id` IS NULL) OR (`document_type` = 'bill' AND `payment_id` IS NULL AND `bill_payment_id` IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_reconciliation_action_items_org_id_uidx` ON `bank_reconciliation_action_items` (`organisation_id`,`id`);
--> statement-breakpoint
CREATE INDEX `bank_reconciliation_action_items_action_idx` ON `bank_reconciliation_action_items` (`organisation_id`,`action_id`);
