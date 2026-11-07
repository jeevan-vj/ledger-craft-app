CREATE TABLE `stripe_verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`user_id` text,
	`payment_id` text,
	`stripe_object_id` text NOT NULL,
	`kind` text NOT NULL,
	`result` text NOT NULL,
	`differences` text DEFAULT '[]' NOT NULL,
	`details` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organisation_id`,`payment_id`) REFERENCES `payments`(`organisation_id`,`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `stripe_verifications_org_idx` ON `stripe_verifications` (`organisation_id`);
