CREATE TABLE `recurring_templates` (
  `id` text PRIMARY KEY NOT NULL, `organisation_id` text NOT NULL, `user_id` text NOT NULL,
  `name` text NOT NULL, `kind` text NOT NULL CHECK (`kind` IN ('invoice','bill','income','expense')),
  `status` text NOT NULL DEFAULT 'active' CHECK (`status` IN ('active','paused','ended')),
  `payload_json` text NOT NULL, `schedule_json` text NOT NULL, `next_run_at` integer, `last_run_at` integer,
  `occurrences_created` integer NOT NULL DEFAULT 0, `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000), `updated_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`), FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
);
CREATE UNIQUE INDEX `recurring_templates_org_id_uidx` ON `recurring_templates` (`organisation_id`,`id`);
CREATE INDEX `recurring_templates_due_idx` ON `recurring_templates` (`organisation_id`,`status`,`next_run_at`);
CREATE TABLE `recurring_runs` (
  `id` text PRIMARY KEY NOT NULL, `organisation_id` text NOT NULL, `template_id` text NOT NULL,
  `occurrence_key` text NOT NULL, `scheduled_for` integer NOT NULL, `status` text NOT NULL CHECK (`status` IN ('running','succeeded','failed')),
  `attempt_count` integer NOT NULL DEFAULT 1, `generated_type` text NOT NULL,
  `generated_id` text, `delivery_status` text NOT NULL DEFAULT 'not_requested', `failure_reason` text, `next_attempt_at` integer,
  `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000), `updated_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`), FOREIGN KEY (`template_id`) REFERENCES `recurring_templates`(`id`) ON DELETE CASCADE
);
CREATE UNIQUE INDEX `recurring_runs_occurrence_uidx` ON `recurring_runs` (`organisation_id`,`occurrence_key`);
CREATE UNIQUE INDEX `recurring_runs_org_id_uidx` ON `recurring_runs` (`organisation_id`,`id`);
CREATE INDEX `recurring_runs_template_idx` ON `recurring_runs` (`organisation_id`,`template_id`,`scheduled_for`);
