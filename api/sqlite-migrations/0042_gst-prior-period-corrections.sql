CREATE TABLE `gst_period_corrections` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`original_tax_return_id` text NOT NULL,
	`original_period_start` text NOT NULL,
	`original_period_end` text NOT NULL,
	`target_period_start` text NOT NULL,
	`target_period_end` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`action` text NOT NULL,
	`kind` text NOT NULL,
	`amount` text NOT NULL,
	`reason` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`resolution` text,
	`included_tax_return_id` text,
	`resolved_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organisation_id`,`original_tax_return_id`) REFERENCES `tax_returns`(`organisation_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`organisation_id`,`included_tax_return_id`) REFERENCES `tax_returns`(`organisation_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "gst_period_corrections_source_check" CHECK("source_type" IN ('invoice', 'bill', 'expense', 'credit_note', 'payment', 'bill_payment', 'customs_gst')),
	CONSTRAINT "gst_period_corrections_action_check" CHECK("action" IN ('added', 'changed', 'voided')),
	CONSTRAINT "gst_period_corrections_kind_check" CHECK("kind" IN ('output', 'input')),
	CONSTRAINT "gst_period_corrections_status_check" CHECK("status" IN ('pending', 'included', 'resolved', 'withdrawn')),
	CONSTRAINT "gst_period_corrections_resolution_check" CHECK("resolution" IS NULL OR "resolution" IN ('amend_in_myir'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gst_period_corrections_org_id_uidx` ON `gst_period_corrections` (`organisation_id`,`id`);--> statement-breakpoint
CREATE INDEX `gst_period_corrections_org_idx` ON `gst_period_corrections` (`organisation_id`);--> statement-breakpoint
CREATE INDEX `gst_period_corrections_org_target_idx` ON `gst_period_corrections` (`organisation_id`,`target_period_start`,`target_period_end`);--> statement-breakpoint
CREATE TABLE `gst_correction_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`correction_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organisation_id`,`correction_id`) REFERENCES `gst_period_corrections`(`organisation_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "gst_correction_events_action_check" CHECK("action" IN ('recorded', 'included', 'resolved', 'withdrawn'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gst_correction_events_org_id_uidx` ON `gst_correction_events` (`organisation_id`,`id`);--> statement-breakpoint
CREATE INDEX `gst_correction_events_org_idx` ON `gst_correction_events` (`organisation_id`);
