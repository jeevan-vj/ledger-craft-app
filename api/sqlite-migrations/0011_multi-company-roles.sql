ALTER TABLE `organisations` ADD `archived_at` integer;
--> statement-breakpoint
ALTER TABLE `organisation_memberships` ADD `removed_at` integer;
--> statement-breakpoint
CREATE TABLE `active_organisation_selections` (
  `user_id` text PRIMARY KEY NOT NULL,
  `organisation_id` text NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade,
  FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `organisation_invitations` (
  `id` text PRIMARY KEY NOT NULL,
  `organisation_id` text NOT NULL,
  `email` text NOT NULL,
  `role` text NOT NULL,
  `token_hash` text NOT NULL,
  `status` text DEFAULT 'pending' NOT NULL,
  `invited_by_user_id` text NOT NULL,
  `expires_at` integer NOT NULL,
  `accepted_at` integer,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON DELETE cascade,
  FOREIGN KEY (`invited_by_user_id`) REFERENCES `users`(`id`) ON DELETE cascade,
  CONSTRAINT `organisation_invitations_role_check` CHECK (`role` IN ('admin','accountant','member','read_only')),
  CONSTRAINT `organisation_invitations_status_check` CHECK (`status` IN ('pending','accepted','revoked','expired'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organisation_invitations_token_hash_uidx` ON `organisation_invitations` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `organisation_invitations_org_idx` ON `organisation_invitations` (`organisation_id`);
--> statement-breakpoint
CREATE INDEX `organisation_invitations_email_idx` ON `organisation_invitations` (`email`);
