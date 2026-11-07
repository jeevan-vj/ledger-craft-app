CREATE TABLE `reminder_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`invoice_id` text NOT NULL,
	`step_id` text NOT NULL,
	`scheduled_date` text NOT NULL,
	`status` text NOT NULL,
	`reason` text,
	`sent_at` integer,
	`created_at` integer DEFAULT (unixepoch()*1000) NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organisation_id`,`invoice_id`) REFERENCES `invoices`(`organisation_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "reminder_logs_status" CHECK("reminder_logs"."status" IN ('sending','sent','skipped','failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reminder_logs_delivery_uidx` ON `reminder_logs` (`organisation_id`,`invoice_id`,`step_id`);--> statement-breakpoint
CREATE INDEX `reminder_logs_invoice_idx` ON `reminder_logs` (`organisation_id`,`invoice_id`);--> statement-breakpoint
CREATE TABLE `reminder_opt_outs` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`kind` text NOT NULL,
	`source_id` text NOT NULL,
	`opt_out` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "reminder_opt_outs_kind" CHECK("reminder_opt_outs"."kind" IN ('customer','invoice'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reminder_opt_outs_scope_uidx` ON `reminder_opt_outs` (`organisation_id`,`kind`,`source_id`);--> statement-breakpoint
CREATE TABLE `reminder_settings` (
	`organisation_id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`time_zone` text DEFAULT 'Pacific/Auckland' NOT NULL,
	`local_time` text DEFAULT '09:00' NOT NULL,
	`steps` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()*1000) NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `customer_statement_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`snapshot` text NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`created_at` integer DEFAULT (unixepoch()*1000) NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organisation_id`,`customer_id`) REFERENCES `customers`(`organisation_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_statement_token_uidx` ON `customer_statement_shares` (`token_hash`);--> statement-breakpoint
CREATE INDEX `customer_statement_customer_idx` ON `customer_statement_shares` (`organisation_id`,`customer_id`);