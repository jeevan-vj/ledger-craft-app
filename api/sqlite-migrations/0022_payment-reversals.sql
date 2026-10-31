ALTER TABLE `payments` ADD `reversal_reason` text;
--> statement-breakpoint
ALTER TABLE `payments` ADD `reversal_date` text;
--> statement-breakpoint
ALTER TABLE `payments` ADD `reversed_at` integer;
--> statement-breakpoint
ALTER TABLE `payments` ADD `reversed_by_user_id` text REFERENCES `users`(`id`);
