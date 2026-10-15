PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_expenses` (
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
	`gst_treatment` text DEFAULT 'standard' NOT NULL,
	`gst_exemption_reason` text DEFAULT 'none' NOT NULL,
	`gst_claimable_percentage` integer DEFAULT 100 NOT NULL,
	`private_use_percentage` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organisation_id`,`category_id`) REFERENCES `expense_categories`(`organisation_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`organisation_id`,`account_id`) REFERENCES `accounts`(`organisation_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`organisation_id`,`customer_id`) REFERENCES `customers`(`organisation_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "expenses_amount_check" CHECK(amount <> '' AND amount NOT GLOB '*[^0-9.]*' AND amount GLOB '[0-9]*' AND amount NOT LIKE '%.' AND length(amount) - length(replace(amount, '.', '')) <= 1),
	CONSTRAINT "expenses_tax_amount_check" CHECK(tax_amount <> '' AND tax_amount NOT GLOB '*[^0-9.]*' AND tax_amount GLOB '[0-9]*' AND tax_amount NOT LIKE '%.' AND length(tax_amount) - length(replace(tax_amount, '.', '')) <= 1),
	CONSTRAINT "expenses_status_check" CHECK(status IN ('pending', 'approved', 'rejected')),
	CONSTRAINT "expenses_gst_treatment_check" CHECK(gst_treatment IN ('standard', 'zero_rated', 'exempt', 'partial', 'private_use')),
	CONSTRAINT "expenses_gst_exemption_reason_check" CHECK(gst_exemption_reason IN ('none', 'motor_vehicle', 'financial_services', 'residential_rent', 'insurance_life', 'exported_services', 'entertainment_50', 'home_office', 'second_hand_goods', 'other_exempt')),
	CONSTRAINT "expenses_gst_claimable_percentage_check" CHECK(gst_claimable_percentage >= 0 AND gst_claimable_percentage <= 100),
	CONSTRAINT "expenses_private_use_percentage_check" CHECK(private_use_percentage >= 0 AND private_use_percentage <= 100)
);
--> statement-breakpoint
INSERT INTO `__new_expenses`("id", "organisation_id", "user_id", "description", "amount", "category_id", "account_id", "vendor_name", "receipt_url", "expense_date", "status", "is_billable", "customer_id", "tax_amount", "currency", "payment_method", "notes", "gst_treatment", "gst_exemption_reason", "gst_claimable_percentage", "private_use_percentage", "created_at", "updated_at") SELECT "id", "organisation_id", "user_id", "description", "amount", "category_id", "account_id", "vendor_name", "receipt_url", "expense_date", "status", "is_billable", "customer_id", "tax_amount", "currency", "payment_method", "notes", 'standard', 'none', 100, 0, "created_at", "updated_at" FROM `expenses`;--> statement-breakpoint
DROP TABLE `expenses`;--> statement-breakpoint
ALTER TABLE `__new_expenses` RENAME TO `expenses`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `expenses_org_id_uidx` ON `expenses` (`organisation_id`,`id`);--> statement-breakpoint
CREATE INDEX `expenses_org_idx` ON `expenses` (`organisation_id`);
