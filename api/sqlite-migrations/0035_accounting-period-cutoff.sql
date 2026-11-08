CREATE TABLE `accounting_period_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`previous_closed_through` text,
	`new_closed_through` text,
	`reason` text NOT NULL,
	`revision` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()*1000) NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "accounting_period_events_action_check" CHECK("accounting_period_events"."action" IN ('close','reopen'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounting_period_events_org_revision_uidx` ON `accounting_period_events` (`organisation_id`,`revision`);--> statement-breakpoint
CREATE TABLE `accounting_period_locks` (
	`organisation_id` text PRIMARY KEY NOT NULL,
	`closed_through` text,
	`revision` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "accounting_period_locks_revision_check" CHECK("accounting_period_locks"."revision" >= 0)
);
--> statement-breakpoint
