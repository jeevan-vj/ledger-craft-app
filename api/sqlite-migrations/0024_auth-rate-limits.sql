CREATE TABLE `auth_rate_limits` (
  `id` text PRIMARY KEY NOT NULL,
  `key` text NOT NULL,
  `count` integer NOT NULL,
  `last_request` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_rate_limits_key_uidx` ON `auth_rate_limits` (`key`);
