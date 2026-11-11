ALTER TABLE `tax_returns` ADD `superseded_at` integer;--> statement-breakpoint
ALTER TABLE `tax_returns` ADD `reopen_reason` text;--> statement-breakpoint
CREATE TABLE `gst_return_audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`tax_return_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organisation_id`,`tax_return_id`) REFERENCES `tax_returns`(`organisation_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "gst_return_audit_events_action_check" CHECK("gst_return_audit_events"."action" IN ('reopen'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gst_return_audit_events_org_id_uidx` ON `gst_return_audit_events` (`organisation_id`,`id`);--> statement-breakpoint
CREATE INDEX `gst_return_audit_events_org_idx` ON `gst_return_audit_events` (`organisation_id`);
