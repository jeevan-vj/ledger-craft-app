CREATE TABLE `dashboard_layouts` (
  `id` text PRIMARY KEY NOT NULL,
  `organisation_id` text NOT NULL REFERENCES `organisations`(`id`) ON DELETE cascade,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE cascade,
  `name` text NOT NULL,
  `is_default` integer DEFAULT 0 NOT NULL,
  `filters` text NOT NULL,
  `widgets` text NOT NULL,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  CONSTRAINT `dashboard_layouts_name_check` CHECK(length(trim(`name`)) BETWEEN 1 AND 80)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dashboard_layouts_org_user_name_uidx` ON `dashboard_layouts` (`organisation_id`,`user_id`,`name`);
--> statement-breakpoint
CREATE INDEX `dashboard_layouts_org_user_idx` ON `dashboard_layouts` (`organisation_id`,`user_id`);
--> statement-breakpoint
CREATE TABLE `saved_report_definitions` (
  `id` text PRIMARY KEY NOT NULL,
  `organisation_id` text NOT NULL REFERENCES `organisations`(`id`) ON DELETE cascade,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE cascade,
  `name` text NOT NULL,
  `report_type` text NOT NULL,
  `filters` text NOT NULL,
  `is_pinned` integer DEFAULT 0 NOT NULL,
  `is_archived` integer DEFAULT 0 NOT NULL,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  CONSTRAINT `saved_report_definitions_type_check` CHECK(`report_type` IN ('summary', 'receivables', 'payables', 'cash', 'tax', 'activity')),
  CONSTRAINT `saved_report_definitions_name_check` CHECK(length(trim(`name`)) BETWEEN 1 AND 100)
);
--> statement-breakpoint
CREATE INDEX `saved_report_definitions_org_user_idx` ON `saved_report_definitions` (`organisation_id`,`user_id`);
