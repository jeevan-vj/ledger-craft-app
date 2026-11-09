CREATE TABLE `assistant_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`request_id` text NOT NULL,
	`action` text NOT NULL,
	`outcome` text NOT NULL,
	`tool_names` text DEFAULT '[]' NOT NULL,
	`confirmed` integer DEFAULT 0 NOT NULL,
	`draft_id` text,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`cost_usd` text DEFAULT '0.000000' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "assistant_events_action_check" CHECK(action IN ('turn', 'save_draft')),
	CONSTRAINT "assistant_events_outcome_check" CHECK(outcome IN ('reply', 'proposal', 'refused', 'limit', 'timeout', 'invalid_output', 'saved', 'incomplete')),
	CONSTRAINT "assistant_events_confirmed_check" CHECK(confirmed IN (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assistant_events_org_id_uidx` ON `assistant_events` (`organisation_id`,`id`);
--> statement-breakpoint
CREATE INDEX `assistant_events_org_created_idx` ON `assistant_events` (`organisation_id`,`created_at`);
