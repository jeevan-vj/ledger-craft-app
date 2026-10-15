CREATE TABLE `account_contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`organization` text,
	`phone` text,
	`email` text,
	`address` text,
	`notes` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_contacts_org_id_uidx` ON `account_contacts` (`organisation_id`,`id`);--> statement-breakpoint
CREATE INDEX `account_contacts_org_idx` ON `account_contacts` (`organisation_id`);--> statement-breakpoint
CREATE TABLE `account_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`account_number` text NOT NULL,
	`account_class` text NOT NULL,
	`account_type` text NOT NULL,
	`normal_balance` text NOT NULL,
	`description` text,
	`is_system` integer DEFAULT true NOT NULL,
	`country_code` text DEFAULT 'NZ' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "account_templates_normal_balance_check" CHECK(normal_balance IN ('debit', 'credit'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_templates_countryCode_accountNumber_uidx` ON `account_templates` (`country_code`,`account_number`);--> statement-breakpoint
CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`currency` text DEFAULT 'NZD' NOT NULL,
	`opening_balance` text DEFAULT '0' NOT NULL,
	`current_balance` text DEFAULT '0' NOT NULL,
	`account_number` text,
	`account_class` text,
	`normal_balance` text,
	`description` text,
	`is_active` integer DEFAULT true NOT NULL,
	`parent_account_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organisation_id`,`parent_account_id`) REFERENCES `accounts`(`organisation_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "accounts_normal_balance_check" CHECK(normal_balance IN ('debit', 'credit'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_org_id_uidx` ON `accounts` (`organisation_id`,`id`);--> statement-breakpoint
CREATE INDEX `accounts_org_idx` ON `accounts` (`organisation_id`);--> statement-breakpoint
CREATE TABLE `journal_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`entry_number` text NOT NULL,
	`entry_date` text NOT NULL,
	`description` text NOT NULL,
	`reference_type` text,
	`reference_id` text,
	`total_amount` text NOT NULL,
	`status` text DEFAULT 'posted' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "journal_entries_total_amount_check" CHECK(total_amount <> '' AND total_amount NOT GLOB '*[^0-9.]*' AND total_amount GLOB '[0-9]*' AND total_amount NOT LIKE '%.' AND length(total_amount) - length(replace(total_amount, '.', '')) <= 1),
	CONSTRAINT "journal_entries_status_check" CHECK(status IN ('draft', 'posted', 'reversed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `journal_entries_org_id_uidx` ON `journal_entries` (`organisation_id`,`id`);--> statement-breakpoint
CREATE INDEX `journal_entries_org_idx` ON `journal_entries` (`organisation_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `journal_entries_organisationId_entryNumber_uidx` ON `journal_entries` (`organisation_id`,`entry_number`);--> statement-breakpoint
CREATE TABLE `journal_entry_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`journal_entry_id` text NOT NULL,
	`account_id` text NOT NULL,
	`description` text,
	`debit_amount` text DEFAULT '0' NOT NULL,
	`credit_amount` text DEFAULT '0' NOT NULL,
	`line_order` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organisation_id`,`journal_entry_id`) REFERENCES `journal_entries`(`organisation_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organisation_id`,`account_id`) REFERENCES `accounts`(`organisation_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "journal_entry_lines_debit_amount_check" CHECK(debit_amount <> '' AND debit_amount NOT GLOB '*[^0-9.]*' AND debit_amount GLOB '[0-9]*' AND debit_amount NOT LIKE '%.' AND length(debit_amount) - length(replace(debit_amount, '.', '')) <= 1),
	CONSTRAINT "journal_entry_lines_credit_amount_check" CHECK(credit_amount <> '' AND credit_amount NOT GLOB '*[^0-9.]*' AND credit_amount GLOB '[0-9]*' AND credit_amount NOT LIKE '%.' AND length(credit_amount) - length(replace(credit_amount, '.', '')) <= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `journal_entry_lines_org_id_uidx` ON `journal_entry_lines` (`organisation_id`,`id`);--> statement-breakpoint
CREATE INDEX `journal_entry_lines_org_idx` ON `journal_entry_lines` (`organisation_id`);--> statement-breakpoint
CREATE TABLE `bank_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`account_name` text NOT NULL,
	`account_number` text NOT NULL,
	`bank_name` text NOT NULL,
	`account_type` text NOT NULL,
	`currency` text DEFAULT 'NZD' NOT NULL,
	`opening_balance` text DEFAULT '0' NOT NULL,
	`current_balance` text DEFAULT '0' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "bank_accounts_account_type_check" CHECK(account_type IN ('checking', 'savings', 'credit_card', 'business'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_accounts_org_id_uidx` ON `bank_accounts` (`organisation_id`,`id`);--> statement-breakpoint
CREATE INDEX `bank_accounts_org_idx` ON `bank_accounts` (`organisation_id`);--> statement-breakpoint
CREATE TABLE `bank_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`bank_account_id` text NOT NULL,
	`transaction_date` text NOT NULL,
	`description` text NOT NULL,
	`reference` text,
	`amount` text NOT NULL,
	`type` text NOT NULL,
	`balance` text,
	`category` text,
	`merchant` text,
	`is_reconciled` integer DEFAULT false NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organisation_id`,`bank_account_id`) REFERENCES `bank_accounts`(`organisation_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "bank_transactions_type_check" CHECK(type IN ('debit', 'credit'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_transactions_org_id_uidx` ON `bank_transactions` (`organisation_id`,`id`);--> statement-breakpoint
CREATE INDEX `bank_transactions_org_idx` ON `bank_transactions` (`organisation_id`);--> statement-breakpoint
CREATE TABLE `transaction_import_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`bank_account_id` text NOT NULL,
	`file_name` text NOT NULL,
	`file_type` text NOT NULL,
	`file_size` integer,
	`total_rows` integer DEFAULT 0 NOT NULL,
	`imported_count` integer DEFAULT 0 NOT NULL,
	`duplicates_skipped` integer DEFAULT 0 NOT NULL,
	`errors_count` integer DEFAULT 0 NOT NULL,
	`earliest_date` text,
	`latest_date` text,
	`status` text DEFAULT 'completed' NOT NULL,
	`error_message` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organisation_id`,`bank_account_id`) REFERENCES `bank_accounts`(`organisation_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "transaction_import_batches_file_type_check" CHECK(file_type IN ('csv', 'ofx', 'qif', 'pdf')),
	CONSTRAINT "transaction_import_batches_status_check" CHECK(status IN ('processing', 'completed', 'failed', 'partially_failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transaction_import_batches_org_id_uidx` ON `transaction_import_batches` (`organisation_id`,`id`);--> statement-breakpoint
CREATE INDEX `transaction_import_batches_org_idx` ON `transaction_import_batches` (`organisation_id`);--> statement-breakpoint
CREATE TABLE `business_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text,
	`address` text,
	`city` text,
	`state` text,
	`zip` text,
	`country` text DEFAULT 'NZ' NOT NULL,
	`tax_id` text,
	`logo_url` text,
	`website` text,
	`default_tax_rate` text,
	`default_terms` text,
	`payment_term_days` integer DEFAULT 30 NOT NULL,
	`default_notes` text,
	`bank_info` text,
	`theme` text,
	`invoice_number_format` text,
	`invoice_number_sequence` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "business_profiles_payment_term_days_check" CHECK(payment_term_days >= 0 AND payment_term_days <= 365)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `business_profiles_org_id_uidx` ON `business_profiles` (`organisation_id`,`id`);--> statement-breakpoint
CREATE INDEX `business_profiles_org_idx` ON `business_profiles` (`organisation_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `business_profiles_organisationId_uidx` ON `business_profiles` (`organisation_id`);--> statement-breakpoint
CREATE TABLE `conversation_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`metadata` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organisation_id`,`conversation_id`) REFERENCES `conversations`(`organisation_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "conversation_messages_role_check" CHECK(role IN ('user', 'assistant', 'system'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conversation_messages_org_id_uidx` ON `conversation_messages` (`organisation_id`,`id`);--> statement-breakpoint
CREATE INDEX `conversation_messages_org_idx` ON `conversation_messages` (`organisation_id`);--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`title` text,
	`context` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "conversations_status_check" CHECK(status IN ('active', 'completed', 'paused'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conversations_org_id_uidx` ON `conversations` (`organisation_id`,`id`);--> statement-breakpoint
CREATE INDEX `conversations_org_idx` ON `conversations` (`organisation_id`);--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`address` text,
	`city` text,
	`state` text,
	`zip` text,
	`country` text DEFAULT 'NZ' NOT NULL,
	`phone` text,
	`is_vip` integer,
	`tags` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customers_org_id_uidx` ON `customers` (`organisation_id`,`id`);--> statement-breakpoint
CREATE INDEX `customers_org_idx` ON `customers` (`organisation_id`);--> statement-breakpoint
CREATE TABLE `expense_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`color` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `expense_categories_org_id_uidx` ON `expense_categories` (`organisation_id`,`id`);--> statement-breakpoint
CREATE INDEX `expense_categories_org_idx` ON `expense_categories` (`organisation_id`);--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`description` text NOT NULL,
	`amount` text NOT NULL,
	`category_id` text,
	`account_id` text,
	`vendor_name` text,
	`receipt_url` text,
	`expense_date` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`is_billable` integer DEFAULT false NOT NULL,
	`customer_id` text,
	`tax_amount` text DEFAULT '0' NOT NULL,
	`currency` text DEFAULT 'NZD' NOT NULL,
	`payment_method` text,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organisation_id`,`category_id`) REFERENCES `expense_categories`(`organisation_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`organisation_id`,`account_id`) REFERENCES `accounts`(`organisation_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`organisation_id`,`customer_id`) REFERENCES `customers`(`organisation_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "expenses_amount_check" CHECK(amount <> '' AND amount NOT GLOB '*[^0-9.]*' AND amount GLOB '[0-9]*' AND amount NOT LIKE '%.' AND length(amount) - length(replace(amount, '.', '')) <= 1),
	CONSTRAINT "expenses_tax_amount_check" CHECK(tax_amount <> '' AND tax_amount NOT GLOB '*[^0-9.]*' AND tax_amount GLOB '[0-9]*' AND tax_amount NOT LIKE '%.' AND length(tax_amount) - length(replace(tax_amount, '.', '')) <= 1),
	CONSTRAINT "expenses_status_check" CHECK(status IN ('pending', 'approved', 'rejected'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `expenses_org_id_uidx` ON `expenses` (`organisation_id`,`id`);--> statement-breakpoint
CREATE INDEX `expenses_org_idx` ON `expenses` (`organisation_id`);--> statement-breakpoint
CREATE TABLE `idempotency_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`key` text NOT NULL,
	`method` text NOT NULL,
	`path` text NOT NULL,
	`request_hash` text NOT NULL,
	`response_status` integer NOT NULL,
	`response_body` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idempotency_keys_scope` ON `idempotency_keys` (`organisation_id`,`user_id`,`method`,`path`,`key`);--> statement-breakpoint
CREATE TABLE `auth_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`issuer` text DEFAULT 'credential' NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_accounts_provider_account_id_uidx` ON `auth_accounts` (`provider_id`,`account_id`);--> statement-breakpoint
CREATE TABLE `organisation_memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'owner' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organisation_memberships_org_id_uidx` ON `organisation_memberships` (`organisation_id`,`id`);--> statement-breakpoint
CREATE INDEX `organisation_memberships_org_idx` ON `organisation_memberships` (`organisation_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `organisation_memberships_organisationId_userId_uidx` ON `organisation_memberships` (`organisation_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `organisations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_unique` ON `sessions` (`token`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`invoice_number` text NOT NULL,
	`customer_id` text NOT NULL,
	`date` text NOT NULL,
	`due_date` text NOT NULL,
	`payment_term_days` integer,
	`subtotal` text NOT NULL,
	`tax_amount` text NOT NULL,
	`discount_type` text DEFAULT 'fixed' NOT NULL,
	`discount_percent` text,
	`discount` text,
	`additional_charges` text,
	`additional_charges_list` text,
	`additional_charges_total` text,
	`total` text NOT NULL,
	`total_paid` text DEFAULT '0' NOT NULL,
	`balance_due` text DEFAULT '0' NOT NULL,
	`payment_status` text DEFAULT 'unpaid' NOT NULL,
	`tax_inclusive` integer DEFAULT true NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`notes` text,
	`terms` text,
	`currency` text DEFAULT 'NZD' NOT NULL,
	`template_name` text,
	`public_viewed_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organisation_id`,`customer_id`) REFERENCES `customers`(`organisation_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "invoices_subtotal_check" CHECK(subtotal <> '' AND subtotal NOT GLOB '*[^0-9.]*' AND subtotal GLOB '[0-9]*' AND subtotal NOT LIKE '%.' AND length(subtotal) - length(replace(subtotal, '.', '')) <= 1),
	CONSTRAINT "invoices_tax_amount_check" CHECK(tax_amount <> '' AND tax_amount NOT GLOB '*[^0-9.]*' AND tax_amount GLOB '[0-9]*' AND tax_amount NOT LIKE '%.' AND length(tax_amount) - length(replace(tax_amount, '.', '')) <= 1),
	CONSTRAINT "invoices_total_check" CHECK(total <> '' AND total NOT GLOB '*[^0-9.]*' AND total GLOB '[0-9]*' AND total NOT LIKE '%.' AND length(total) - length(replace(total, '.', '')) <= 1),
	CONSTRAINT "invoices_total_paid_check" CHECK(total_paid <> '' AND total_paid NOT GLOB '*[^0-9.]*' AND total_paid GLOB '[0-9]*' AND total_paid NOT LIKE '%.' AND length(total_paid) - length(replace(total_paid, '.', '')) <= 1),
	CONSTRAINT "invoices_payment_status_check" CHECK(payment_status IN ('unpaid', 'partially_paid', 'paid', 'overdue', 'cancelled')),
	CONSTRAINT "invoices_status_check" CHECK(status IN ('draft', 'sent', 'paid', 'overdue')),
	CONSTRAINT "invoices_discount_type_check" CHECK(discount_type IN ('fixed', 'percent')),
	CONSTRAINT "invoices_payment_term_days_check" CHECK(payment_term_days >= 0 AND payment_term_days <= 365)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_org_id_uidx` ON `invoices` (`organisation_id`,`id`);--> statement-breakpoint
CREATE INDEX `invoices_org_idx` ON `invoices` (`organisation_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_organisationId_invoiceNumber_uidx` ON `invoices` (`organisation_id`,`invoice_number`);--> statement-breakpoint
CREATE TABLE `line_items` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`invoice_id` text NOT NULL,
	`description` text NOT NULL,
	`quantity` text NOT NULL,
	`unit` text DEFAULT 'ea' NOT NULL,
	`rate` text NOT NULL,
	`rate_unit` text DEFAULT 'ea' NOT NULL,
	`tax` text,
	`total` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organisation_id`,`invoice_id`) REFERENCES `invoices`(`organisation_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "line_items_quantity_check" CHECK(quantity <> '' AND quantity NOT GLOB '*[^0-9.]*' AND quantity GLOB '[0-9]*' AND quantity NOT LIKE '%.' AND length(quantity) - length(replace(quantity, '.', '')) <= 1 AND trim(quantity, '0.') <> ''),
	CONSTRAINT "line_items_rate_check" CHECK(rate <> '' AND rate NOT GLOB '*[^0-9.]*' AND rate GLOB '[0-9]*' AND rate NOT LIKE '%.' AND length(rate) - length(replace(rate, '.', '')) <= 1),
	CONSTRAINT "line_items_total_check" CHECK(total <> '' AND total NOT GLOB '*[^0-9.]*' AND total GLOB '[0-9]*' AND total NOT LIKE '%.' AND length(total) - length(replace(total, '.', '')) <= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `line_items_org_id_uidx` ON `line_items` (`organisation_id`,`id`);--> statement-breakpoint
CREATE INDEX `line_items_org_idx` ON `line_items` (`organisation_id`);--> statement-breakpoint
CREATE TABLE `item_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `item_categories_org_id_uidx` ON `item_categories` (`organisation_id`,`id`);--> statement-breakpoint
CREATE INDEX `item_categories_org_idx` ON `item_categories` (`organisation_id`);--> statement-breakpoint
CREATE TABLE `items` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`type` text NOT NULL,
	`category_id` text,
	`sale_price` text,
	`purchase_price` text,
	`tax_rate` text,
	`enable_sale_info` integer DEFAULT false NOT NULL,
	`enable_purchase_info` integer DEFAULT false NOT NULL,
	`unit` text DEFAULT 'ea' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organisation_id`,`category_id`) REFERENCES `item_categories`(`organisation_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "items_type_check" CHECK(type IN ('product', 'service'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `items_org_id_uidx` ON `items` (`organisation_id`,`id`);--> statement-breakpoint
CREATE INDEX `items_org_idx` ON `items` (`organisation_id`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`invoice_id` text NOT NULL,
	`payment_method` text NOT NULL,
	`amount` text NOT NULL,
	`payment_date` text NOT NULL,
	`reference_number` text,
	`notes` text,
	`status` text DEFAULT 'completed' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organisation_id`,`invoice_id`) REFERENCES `invoices`(`organisation_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "payments_amount_check" CHECK(amount <> '' AND amount NOT GLOB '*[^0-9.]*' AND amount GLOB '[0-9]*' AND amount NOT LIKE '%.' AND length(amount) - length(replace(amount, '.', '')) <= 1),
	CONSTRAINT "payments_status_check" CHECK(status IN ('pending', 'completed', 'failed', 'cancelled', 'refunded'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payments_org_id_uidx` ON `payments` (`organisation_id`,`id`);--> statement-breakpoint
CREATE INDEX `payments_org_idx` ON `payments` (`organisation_id`);--> statement-breakpoint
CREATE TABLE `rls_probe` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`label` text NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rls_probe_org_id_uidx` ON `rls_probe` (`organisation_id`,`id`);--> statement-breakpoint
CREATE INDEX `rls_probe_org_idx` ON `rls_probe` (`organisation_id`);--> statement-breakpoint
CREATE TABLE `receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`payment_id` text NOT NULL,
	`receipt_number` text NOT NULL,
	`generated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`email_sent_at` integer,
	`is_emailed` integer DEFAULT false NOT NULL,
	`receipt_data` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organisation_id`,`payment_id`) REFERENCES `payments`(`organisation_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `receipts_org_id_uidx` ON `receipts` (`organisation_id`,`id`);--> statement-breakpoint
CREATE INDEX `receipts_org_idx` ON `receipts` (`organisation_id`);--> statement-breakpoint
CREATE TABLE `reconciliation_adjustments` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`reconciliation_id` text NOT NULL,
	`adjustment_type` text NOT NULL,
	`description` text NOT NULL,
	`amount` text NOT NULL,
	`affects_bank` integer DEFAULT false NOT NULL,
	`affects_book` integer DEFAULT false NOT NULL,
	`reference_type` text,
	`reference_id` text,
	`reference_number` text,
	`journal_entry_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`applied_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organisation_id`,`reconciliation_id`) REFERENCES `reconciliation_sessions`(`organisation_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organisation_id`,`journal_entry_id`) REFERENCES `journal_entries`(`organisation_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "reconciliation_adjustments_status_check" CHECK(status IN ('pending', 'applied', 'reversed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reconciliation_adjustments_org_id_uidx` ON `reconciliation_adjustments` (`organisation_id`,`id`);--> statement-breakpoint
CREATE INDEX `reconciliation_adjustments_org_idx` ON `reconciliation_adjustments` (`organisation_id`);--> statement-breakpoint
CREATE TABLE `reconciliation_matches` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`reconciliation_id` text NOT NULL,
	`bank_transaction_id` text,
	`invoice_id` text,
	`payment_id` text,
	`expense_id` text,
	`journal_entry_id` text,
	`match_type` text NOT NULL,
	`confidence_score` text DEFAULT '0' NOT NULL,
	`bank_amount` text,
	`book_amount` text,
	`difference` text DEFAULT '0' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`notes` text,
	`matched_by` text,
	`matched_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organisation_id`,`reconciliation_id`) REFERENCES `reconciliation_sessions`(`organisation_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organisation_id`,`bank_transaction_id`) REFERENCES `bank_transactions`(`organisation_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`organisation_id`,`invoice_id`) REFERENCES `invoices`(`organisation_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`organisation_id`,`payment_id`) REFERENCES `payments`(`organisation_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`organisation_id`,`expense_id`) REFERENCES `expenses`(`organisation_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`organisation_id`,`journal_entry_id`) REFERENCES `journal_entries`(`organisation_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "reconciliation_matches_status_check" CHECK(status IN ('pending', 'confirmed', 'rejected', 'adjusted'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reconciliation_matches_org_id_uidx` ON `reconciliation_matches` (`organisation_id`,`id`);--> statement-breakpoint
CREATE INDEX `reconciliation_matches_org_idx` ON `reconciliation_matches` (`organisation_id`);--> statement-breakpoint
CREATE TABLE `reconciliation_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`bank_account_id` text NOT NULL,
	`statement_start_date` text NOT NULL,
	`statement_end_date` text NOT NULL,
	`statement_opening_balance` text NOT NULL,
	`statement_closing_balance` text NOT NULL,
	`book_opening_balance` text NOT NULL,
	`book_closing_balance` text,
	`total_deposits` text DEFAULT '0' NOT NULL,
	`total_withdrawals` text DEFAULT '0' NOT NULL,
	`status` text DEFAULT 'in_progress' NOT NULL,
	`reconciled_at` integer,
	`matched_count` integer DEFAULT 0 NOT NULL,
	`unmatched_bank_count` integer DEFAULT 0 NOT NULL,
	`unmatched_book_count` integer DEFAULT 0 NOT NULL,
	`adjustment_count` integer DEFAULT 0 NOT NULL,
	`difference` text DEFAULT '0' NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organisation_id`,`bank_account_id`) REFERENCES `bank_accounts`(`organisation_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "reconciliation_sessions_status_check" CHECK(status IN ('in_progress', 'completed', 'locked'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reconciliation_sessions_org_id_uidx` ON `reconciliation_sessions` (`organisation_id`,`id`);--> statement-breakpoint
CREATE INDEX `reconciliation_sessions_org_idx` ON `reconciliation_sessions` (`organisation_id`);--> statement-breakpoint
CREATE TABLE `shared_invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`original_invoice_id` text NOT NULL,
	`invoice_data` text NOT NULL,
	`template_data` text NOT NULL,
	`share_token` text NOT NULL,
	`expires_at` integer,
	`access_count` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organisation_id`,`original_invoice_id`) REFERENCES `invoices`(`organisation_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shared_invoices_share_token_unique` ON `shared_invoices` (`share_token`);--> statement-breakpoint
CREATE UNIQUE INDEX `shared_invoices_org_id_uidx` ON `shared_invoices` (`organisation_id`,`id`);--> statement-breakpoint
CREATE INDEX `shared_invoices_org_idx` ON `shared_invoices` (`organisation_id`);--> statement-breakpoint
CREATE TABLE `tax_adjustments` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`tax_return_id` text,
	`adjustment_type` text NOT NULL,
	`description` text NOT NULL,
	`amount` text NOT NULL,
	`tax_impact` text DEFAULT '0' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organisation_id`,`tax_return_id`) REFERENCES `tax_returns`(`organisation_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "tax_adjustments_type_check" CHECK(adjustment_type IN ('bad_debt', 'capital_goods', 'correction', 'other'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tax_adjustments_org_id_uidx` ON `tax_adjustments` (`organisation_id`,`id`);--> statement-breakpoint
CREATE INDEX `tax_adjustments_org_idx` ON `tax_adjustments` (`organisation_id`);--> statement-breakpoint
CREATE TABLE `tax_configurations` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`country_code` text DEFAULT 'NZ' NOT NULL,
	`tax_type` text NOT NULL,
	`tax_rate` text NOT NULL,
	`tax_name` text NOT NULL,
	`applies_to_services` integer DEFAULT true NOT NULL,
	`applies_to_goods` integer DEFAULT true NOT NULL,
	`effective_from` text NOT NULL,
	`effective_to` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "tax_configurations_tax_type_check" CHECK(tax_type IN ('GST', 'VAT', 'Sales_Tax'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tax_configurations_org_id_uidx` ON `tax_configurations` (`organisation_id`,`id`);--> statement-breakpoint
CREATE INDEX `tax_configurations_org_idx` ON `tax_configurations` (`organisation_id`);--> statement-breakpoint
CREATE TABLE `tax_returns` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`return_type` text NOT NULL,
	`total_sales` text DEFAULT '0' NOT NULL,
	`total_purchases` text DEFAULT '0' NOT NULL,
	`gst_on_sales` text DEFAULT '0' NOT NULL,
	`gst_on_purchases` text DEFAULT '0' NOT NULL,
	`net_gst` text DEFAULT '0' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`submitted_at` integer,
	`ird_reference` text,
	`return_data` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "tax_returns_return_type_check" CHECK(return_type IN ('GST', 'Income_Tax', 'PAYE')),
	CONSTRAINT "tax_returns_status_check" CHECK(status IN ('draft', 'submitted', 'approved', 'rejected'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tax_returns_org_id_uidx` ON `tax_returns` (`organisation_id`,`id`);--> statement-breakpoint
CREATE INDEX `tax_returns_org_idx` ON `tax_returns` (`organisation_id`);