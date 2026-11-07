CREATE TABLE `stripe_rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`window_started_at` integer NOT NULL,
	`count` integer NOT NULL,
	CONSTRAINT "stripe_rate_limits_count_check" CHECK(count >= 0)
);
--> statement-breakpoint
CREATE TABLE `stripe_verification_state` (
	`organisation_id` text PRIMARY KEY NOT NULL,
	`next_verification_at` integer NOT NULL,
	`last_attempt_at` integer,
	`last_verified_at` integer,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action
);
