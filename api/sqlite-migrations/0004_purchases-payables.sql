CREATE TABLE `bill_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`bill_id` text NOT NULL,
	`description` text NOT NULL,
	`quantity` text NOT NULL,
	`unit_price` text NOT NULL,
	`tax_rate` text DEFAULT '15' NOT NULL,
	`subtotal` text NOT NULL,
	`tax_amount` text NOT NULL,
	`total` text NOT NULL,
	`account_id` text,
	`line_order` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organisation_id`,`bill_id`) REFERENCES `bills`(`organisation_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organisation_id`,`account_id`) REFERENCES `accounts`(`organisation_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "bill_lines_quantity_check" CHECK("bill_lines"."quantity" <> '' AND "bill_lines"."quantity" NOT GLOB '*[^0-9.]*' AND "bill_lines"."quantity" GLOB '[0-9]*' AND "bill_lines"."quantity" NOT LIKE '%.' AND length("bill_lines"."quantity") - length(replace("bill_lines"."quantity", '.', '')) <= 1),
	CONSTRAINT "bill_lines_unit_price_check" CHECK("bill_lines"."unit_price" <> '' AND "bill_lines"."unit_price" NOT GLOB '*[^0-9.]*' AND "bill_lines"."unit_price" GLOB '[0-9]*' AND "bill_lines"."unit_price" NOT LIKE '%.' AND length("bill_lines"."unit_price") - length(replace("bill_lines"."unit_price", '.', '')) <= 1),
	CONSTRAINT "bill_lines_tax_rate_check" CHECK("bill_lines"."tax_rate" <> '' AND "bill_lines"."tax_rate" NOT GLOB '*[^0-9.]*' AND "bill_lines"."tax_rate" GLOB '[0-9]*' AND "bill_lines"."tax_rate" NOT LIKE '%.' AND length("bill_lines"."tax_rate") - length(replace("bill_lines"."tax_rate", '.', '')) <= 1),
	CONSTRAINT "bill_lines_subtotal_check" CHECK("bill_lines"."subtotal" <> '' AND "bill_lines"."subtotal" NOT GLOB '*[^0-9.]*' AND "bill_lines"."subtotal" GLOB '[0-9]*' AND "bill_lines"."subtotal" NOT LIKE '%.' AND length("bill_lines"."subtotal") - length(replace("bill_lines"."subtotal", '.', '')) <= 1),
	CONSTRAINT "bill_lines_tax_amount_check" CHECK("bill_lines"."tax_amount" <> '' AND "bill_lines"."tax_amount" NOT GLOB '*[^0-9.]*' AND "bill_lines"."tax_amount" GLOB '[0-9]*' AND "bill_lines"."tax_amount" NOT LIKE '%.' AND length("bill_lines"."tax_amount") - length(replace("bill_lines"."tax_amount", '.', '')) <= 1),
	CONSTRAINT "bill_lines_total_check" CHECK("bill_lines"."total" <> '' AND "bill_lines"."total" NOT GLOB '*[^0-9.]*' AND "bill_lines"."total" GLOB '[0-9]*' AND "bill_lines"."total" NOT LIKE '%.' AND length("bill_lines"."total") - length(replace("bill_lines"."total", '.', '')) <= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bill_lines_org_id_uidx` ON `bill_lines` (`organisation_id`,`id`);--> statement-breakpoint
CREATE INDEX `bill_lines_org_bill_idx` ON `bill_lines` (`organisation_id`,`bill_id`);--> statement-breakpoint
CREATE TABLE `bill_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`bill_id` text NOT NULL,
	`bank_account_id` text NOT NULL,
	`amount` text NOT NULL,
	`payment_date` text NOT NULL,
	`reference_number` text,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organisation_id`,`bill_id`) REFERENCES `bills`(`organisation_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`organisation_id`,`bank_account_id`) REFERENCES `bank_accounts`(`organisation_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "bill_payments_amount_check" CHECK("bill_payments"."amount" <> '' AND "bill_payments"."amount" NOT GLOB '*[^0-9.]*' AND "bill_payments"."amount" GLOB '[0-9]*' AND "bill_payments"."amount" NOT LIKE '%.' AND length("bill_payments"."amount") - length(replace("bill_payments"."amount", '.', '')) <= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bill_payments_org_id_uidx` ON `bill_payments` (`organisation_id`,`id`);--> statement-breakpoint
CREATE INDEX `bill_payments_org_bill_idx` ON `bill_payments` (`organisation_id`,`bill_id`);--> statement-breakpoint
CREATE TABLE `bills` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`bill_number` text NOT NULL,
	`vendor_id` text NOT NULL,
	`vendor_reference` text,
	`issue_date` text NOT NULL,
	`due_date` text NOT NULL,
	`lifecycle_status` text DEFAULT 'draft' NOT NULL,
	`payment_status` text DEFAULT 'unpaid' NOT NULL,
	`currency` text DEFAULT 'NZD' NOT NULL,
	`tax_inclusive` integer DEFAULT true NOT NULL,
	`subtotal` text NOT NULL,
	`tax_amount` text NOT NULL,
	`total` text NOT NULL,
	`total_paid` text DEFAULT '0' NOT NULL,
	`balance_due` text NOT NULL,
	`notes` text,
	`received_at` integer,
	`voided_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organisation_id`,`vendor_id`) REFERENCES `vendors`(`organisation_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "bills_lifecycle_status_check" CHECK("bills"."lifecycle_status" IN ('draft', 'received', 'void')),
	CONSTRAINT "bills_payment_status_check" CHECK("bills"."payment_status" IN ('unpaid', 'partial', 'paid')),
	CONSTRAINT "bills_subtotal_check" CHECK("bills"."subtotal" <> '' AND "bills"."subtotal" NOT GLOB '*[^0-9.]*' AND "bills"."subtotal" GLOB '[0-9]*' AND "bills"."subtotal" NOT LIKE '%.' AND length("bills"."subtotal") - length(replace("bills"."subtotal", '.', '')) <= 1),
	CONSTRAINT "bills_tax_amount_check" CHECK("bills"."tax_amount" <> '' AND "bills"."tax_amount" NOT GLOB '*[^0-9.]*' AND "bills"."tax_amount" GLOB '[0-9]*' AND "bills"."tax_amount" NOT LIKE '%.' AND length("bills"."tax_amount") - length(replace("bills"."tax_amount", '.', '')) <= 1),
	CONSTRAINT "bills_total_check" CHECK("bills"."total" <> '' AND "bills"."total" NOT GLOB '*[^0-9.]*' AND "bills"."total" GLOB '[0-9]*' AND "bills"."total" NOT LIKE '%.' AND length("bills"."total") - length(replace("bills"."total", '.', '')) <= 1),
	CONSTRAINT "bills_total_paid_check" CHECK("bills"."total_paid" <> '' AND "bills"."total_paid" NOT GLOB '*[^0-9.]*' AND "bills"."total_paid" GLOB '[0-9]*' AND "bills"."total_paid" NOT LIKE '%.' AND length("bills"."total_paid") - length(replace("bills"."total_paid", '.', '')) <= 1),
	CONSTRAINT "bills_balance_due_check" CHECK("bills"."balance_due" <> '' AND "bills"."balance_due" NOT GLOB '*[^0-9.]*' AND "bills"."balance_due" GLOB '[0-9]*' AND "bills"."balance_due" NOT LIKE '%.' AND length("bills"."balance_due") - length(replace("bills"."balance_due", '.', '')) <= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bills_org_id_uidx` ON `bills` (`organisation_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `bills_org_number_uidx` ON `bills` (`organisation_id`,`bill_number`);--> statement-breakpoint
CREATE INDEX `bills_org_due_date_idx` ON `bills` (`organisation_id`,`due_date`);--> statement-breakpoint
CREATE TABLE `vendors` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`phone` text,
	`tax_id` text,
	`address` text,
	`payment_term_days` integer DEFAULT 20 NOT NULL,
	`notes` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "vendors_payment_term_days_check" CHECK("vendors"."payment_term_days" >= 0 AND "vendors"."payment_term_days" <= 365)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vendors_org_id_uidx` ON `vendors` (`organisation_id`,`id`);--> statement-breakpoint
CREATE INDEX `vendors_org_name_idx` ON `vendors` (`organisation_id`,`name`);