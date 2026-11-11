ALTER TABLE `line_items` ADD `tax_code` text;--> statement-breakpoint
ALTER TABLE `quote_line_items` ADD `tax_code` text;--> statement-breakpoint
UPDATE `line_items` SET `tax_code` = 'standard_15' WHERE `tax` IS NOT NULL AND `tax` GLOB '*[1-9]*' AND `tax_code` IS NULL;--> statement-breakpoint
UPDATE `quote_line_items` SET `tax_code` = 'standard_15' WHERE `tax` IS NOT NULL AND `tax` GLOB '*[1-9]*' AND `tax_code` IS NULL;--> statement-breakpoint
UPDATE `credit_note_lines` SET `data` = json_set(`data`, '$.taxCode', 'standard_15') WHERE json_valid(`data`) AND json_extract(`data`, '$.tax') IS NOT NULL AND json_extract(`data`, '$.tax') GLOB '*[1-9]*' AND json_extract(`data`, '$.taxCode') IS NULL;--> statement-breakpoint
CREATE TABLE `sales_tax_reclassifications` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`tax_code` text,
	`reason` text NOT NULL,
	`line_ids` text NOT NULL,
	`previous_codes` text NOT NULL,
	`before_impact` text NOT NULL,
	`after_impact` text NOT NULL,
	`undone_at` integer,
	`undo_of_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "sales_tax_reclassifications_action_check" CHECK("sales_tax_reclassifications"."action" IN ('apply', 'undo')),
	CONSTRAINT "sales_tax_reclassifications_code_check" CHECK("sales_tax_reclassifications"."tax_code" IS NULL OR "sales_tax_reclassifications"."tax_code" IN ('zero_rated', 'exempt'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sales_tax_reclassifications_org_id_uidx` ON `sales_tax_reclassifications` (`organisation_id`,`id`);--> statement-breakpoint
CREATE INDEX `sales_tax_reclassifications_org_idx` ON `sales_tax_reclassifications` (`organisation_id`);
