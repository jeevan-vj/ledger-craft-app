ALTER TABLE `item_categories` ADD `is_active` integer DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE `items` ADD `is_active` integer DEFAULT true NOT NULL;
