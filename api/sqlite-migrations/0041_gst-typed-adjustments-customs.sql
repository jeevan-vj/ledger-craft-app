CREATE TABLE `customs_gst_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`invoice_date` text NOT NULL,
	`payment_date` text,
	`amount` text NOT NULL,
	`reference` text NOT NULL,
	`description` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "customs_gst_entries_status_check" CHECK("customs_gst_entries"."status" IN ('open', 'void')),
	CONSTRAINT "customs_gst_entries_amount_check" CHECK("customs_gst_entries"."amount" <> '' AND "customs_gst_entries"."amount" NOT GLOB '*[^0-9.]*' AND "customs_gst_entries"."amount" GLOB '[0-9]*' AND "customs_gst_entries"."amount" NOT LIKE '%.' AND length("customs_gst_entries"."amount") - length(replace("customs_gst_entries"."amount", '.', '')) <= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customs_gst_entries_org_id_uidx` ON `customs_gst_entries` (`organisation_id`,`id`);--> statement-breakpoint
CREATE INDEX `customs_gst_entries_org_idx` ON `customs_gst_entries` (`organisation_id`);--> statement-breakpoint
UPDATE `tax_returns`
SET `return_data` = json_set(
	`return_data`,
	'$.gstReview.adjustments',
	json((
		SELECT json_group_array(
			CASE
				WHEN json_extract(value, '$.type') IS NULL THEN json_set(value, '$.type', 'other', '$.note', COALESCE(json_extract(value, '$.note'), json_extract(value, '$.reason')))
				ELSE value
			END
		)
		FROM json_each(json_extract(`tax_returns`.`return_data`, '$.gstReview.adjustments'))
		ORDER BY key
	))
)
WHERE json_type(json_extract(`return_data`, '$.gstReview.adjustments')) = 'array'
	AND json_array_length(json_extract(`return_data`, '$.gstReview.adjustments')) > 0;
