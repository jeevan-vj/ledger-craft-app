ALTER TABLE `business_profiles` ADD `quote_number_format` text DEFAULT 'QUO-{YYYY}-{SEQ}' NOT NULL;
--> statement-breakpoint
ALTER TABLE `business_profiles` ADD `quote_number_sequence` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `business_profiles` ADD `quote_validity_days` integer DEFAULT 30 NOT NULL CHECK (`quote_validity_days` >= 1 AND `quote_validity_days` <= 365);
--> statement-breakpoint
ALTER TABLE `business_profiles` ADD `default_quote_kind` text DEFAULT 'quote' NOT NULL CHECK (`default_quote_kind` IN ('quote', 'estimate'));
--> statement-breakpoint
CREATE TABLE `quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`quote_number` text NOT NULL,
	`kind` text DEFAULT 'quote' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`customer_id` text NOT NULL,
	`date` text NOT NULL,
	`expiry_date` text NOT NULL,
	`subtotal` text NOT NULL,
	`tax_amount` text NOT NULL,
	`tax_rate` text NOT NULL,
	`tax_inclusive` integer DEFAULT true NOT NULL,
	`discount_type` text DEFAULT 'fixed' NOT NULL,
	`discount_percent` text,
	`discount` text,
	`additional_charges` text,
	`additional_charges_list` text,
	`additional_charges_total` text,
	`total` text NOT NULL,
	`notes` text,
	`terms` text,
	`currency` text DEFAULT 'NZD' NOT NULL,
	`template_name` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`sent_at` integer,
	`public_viewed_at` integer,
	`responded_at` integer,
	`responded_by_name` text,
	`response_note` text,
	`accepted_revision` integer,
	`converted_invoice_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organisation_id`,`customer_id`) REFERENCES `customers`(`organisation_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`organisation_id`,`converted_invoice_id`) REFERENCES `invoices`(`organisation_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "quotes_kind_check" CHECK("quotes"."kind" IN ('quote', 'estimate')),
	CONSTRAINT "quotes_status_check" CHECK("quotes"."status" IN ('draft', 'sent', 'viewed', 'accepted', 'declined', 'expired', 'converted')),
	CONSTRAINT "quotes_discount_type_check" CHECK("quotes"."discount_type" IN ('fixed', 'percent')),
	CONSTRAINT "quotes_revision_check" CHECK("quotes"."revision" >= 1),
	CONSTRAINT "quotes_expiry_check" CHECK("quotes"."expiry_date" >= "quotes"."date"),
	CONSTRAINT "quotes_converted_check" CHECK("quotes"."status" <> 'converted' OR "quotes"."converted_invoice_id" IS NOT NULL),
	CONSTRAINT "quotes_responded_by_name_check" CHECK("quotes"."responded_by_name" IS NULL OR (length("quotes"."responded_by_name") >= 1 AND length("quotes"."responded_by_name") <= 120)),
	CONSTRAINT "quotes_response_note_check" CHECK("quotes"."response_note" IS NULL OR length("quotes"."response_note") <= 1000),
	CONSTRAINT "quotes_subtotal_check" CHECK("quotes"."subtotal" <> '' AND "quotes"."subtotal" NOT GLOB '*[^0-9.]*' AND "quotes"."subtotal" GLOB '[0-9]*' AND "quotes"."subtotal" NOT LIKE '%.' AND length("quotes"."subtotal") - length(replace("quotes"."subtotal", '.', '')) <= 1),
	CONSTRAINT "quotes_tax_amount_check" CHECK("quotes"."tax_amount" <> '' AND "quotes"."tax_amount" NOT GLOB '*[^0-9.]*' AND "quotes"."tax_amount" GLOB '[0-9]*' AND "quotes"."tax_amount" NOT LIKE '%.' AND length("quotes"."tax_amount") - length(replace("quotes"."tax_amount", '.', '')) <= 1),
	CONSTRAINT "quotes_tax_rate_check" CHECK("quotes"."tax_rate" <> '' AND "quotes"."tax_rate" NOT GLOB '*[^0-9.]*' AND "quotes"."tax_rate" GLOB '[0-9]*' AND "quotes"."tax_rate" NOT LIKE '%.' AND length("quotes"."tax_rate") - length(replace("quotes"."tax_rate", '.', '')) <= 1),
	CONSTRAINT "quotes_total_check" CHECK("quotes"."total" <> '' AND "quotes"."total" NOT GLOB '*[^0-9.]*' AND "quotes"."total" GLOB '[0-9]*' AND "quotes"."total" NOT LIKE '%.' AND length("quotes"."total") - length(replace("quotes"."total", '.', '')) <= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quotes_org_id_uidx` ON `quotes` (`organisation_id`,`id`);--> statement-breakpoint
CREATE INDEX `quotes_org_idx` ON `quotes` (`organisation_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `quotes_org_number_uidx` ON `quotes` (`organisation_id`,`quote_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `quotes_converted_invoice_uidx` ON `quotes` (`organisation_id`,`converted_invoice_id`);--> statement-breakpoint
CREATE TABLE `quote_line_items` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`quote_id` text NOT NULL,
	`description` text NOT NULL,
	`quantity` text NOT NULL,
	`unit` text DEFAULT 'ea' NOT NULL,
	`rate` text NOT NULL,
	`rate_unit` text DEFAULT 'ea' NOT NULL,
	`tax` text,
	`total` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organisation_id`,`quote_id`) REFERENCES `quotes`(`organisation_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "quote_line_items_quantity_check" CHECK("quote_line_items"."quantity" <> '' AND "quote_line_items"."quantity" NOT GLOB '*[^0-9.]*' AND "quote_line_items"."quantity" GLOB '[0-9]*' AND "quote_line_items"."quantity" NOT LIKE '%.' AND length("quote_line_items"."quantity") - length(replace("quote_line_items"."quantity", '.', '')) <= 1 AND trim("quote_line_items"."quantity", '0.') <> ''),
	CONSTRAINT "quote_line_items_rate_check" CHECK("quote_line_items"."rate" <> '' AND "quote_line_items"."rate" NOT GLOB '*[^0-9.]*' AND "quote_line_items"."rate" GLOB '[0-9]*' AND "quote_line_items"."rate" NOT LIKE '%.' AND length("quote_line_items"."rate") - length(replace("quote_line_items"."rate", '.', '')) <= 1),
	CONSTRAINT "quote_line_items_total_check" CHECK("quote_line_items"."total" <> '' AND "quote_line_items"."total" NOT GLOB '*[^0-9.]*' AND "quote_line_items"."total" GLOB '[0-9]*' AND "quote_line_items"."total" NOT LIKE '%.' AND length("quote_line_items"."total") - length(replace("quote_line_items"."total", '.', '')) <= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quote_line_items_org_id_uidx` ON `quote_line_items` (`organisation_id`,`id`);--> statement-breakpoint
CREATE INDEX `quote_line_items_org_idx` ON `quote_line_items` (`organisation_id`);--> statement-breakpoint
CREATE INDEX `quote_line_items_org_quote_idx` ON `quote_line_items` (`organisation_id`,`quote_id`);--> statement-breakpoint
CREATE TABLE `shared_quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`quote_id` text NOT NULL,
	`quote_data` text NOT NULL,
	`template_data` text NOT NULL,
	`share_token` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`expires_at` integer,
	`access_count` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organisation_id`,`quote_id`) REFERENCES `quotes`(`organisation_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shared_quotes_share_token_unique` ON `shared_quotes` (`share_token`);--> statement-breakpoint
CREATE UNIQUE INDEX `shared_quotes_org_id_uidx` ON `shared_quotes` (`organisation_id`,`id`);--> statement-breakpoint
CREATE INDEX `shared_quotes_org_idx` ON `shared_quotes` (`organisation_id`);
