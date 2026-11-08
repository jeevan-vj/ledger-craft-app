PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_accounting_period_events` (
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
	CONSTRAINT "accounting_period_events_action_check" CHECK("__new_accounting_period_events"."action" IN ('close','reopen'))
);
--> statement-breakpoint
INSERT INTO `__new_accounting_period_events`("id", "organisation_id", "actor_id", "action", "previous_closed_through", "new_closed_through", "reason", "revision", "created_at") SELECT "id", "organisation_id", "actor_id", "action", "previous_closed_through", "new_closed_through", "reason", "revision", "created_at" FROM `accounting_period_events`;--> statement-breakpoint
DROP TABLE `accounting_period_events`;--> statement-breakpoint
ALTER TABLE `__new_accounting_period_events` RENAME TO `accounting_period_events`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `accounting_period_events_org_revision_uidx` ON `accounting_period_events` (`organisation_id`,`revision`);