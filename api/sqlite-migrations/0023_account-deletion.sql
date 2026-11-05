CREATE TABLE `organisation_invitations_account_deletion` (
  `id` text PRIMARY KEY NOT NULL,
  `organisation_id` text NOT NULL,
  `email` text NOT NULL,
  `role` text NOT NULL,
  `token_hash` text NOT NULL,
  `status` text DEFAULT 'pending' NOT NULL,
  `invited_by_user_id` text,
  `expires_at` integer NOT NULL,
  `accepted_at` integer,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON DELETE cascade,
  FOREIGN KEY (`invited_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null,
  CONSTRAINT `organisation_invitations_role_check` CHECK (`role` IN ('admin','accountant','member','read_only')),
  CONSTRAINT `organisation_invitations_status_check` CHECK (`status` IN ('pending','accepted','revoked','expired'))
);
--> statement-breakpoint
INSERT INTO `organisation_invitations_account_deletion` SELECT * FROM `organisation_invitations`;
--> statement-breakpoint
DROP TABLE `organisation_invitations`;
--> statement-breakpoint
ALTER TABLE `organisation_invitations_account_deletion` RENAME TO `organisation_invitations`;
--> statement-breakpoint
CREATE UNIQUE INDEX `organisation_invitations_token_hash_uidx` ON `organisation_invitations` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `organisation_invitations_org_idx` ON `organisation_invitations` (`organisation_id`);
--> statement-breakpoint
CREATE INDEX `organisation_invitations_email_idx` ON `organisation_invitations` (`email`);
--> statement-breakpoint
CREATE TABLE `account_deletion_tombstones` (
  `user_id_hash` text PRIMARY KEY NOT NULL,
  `deleted_at` integer NOT NULL
);
