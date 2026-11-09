CREATE TABLE `assistant_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`payload` text NOT NULL,
	`signature` text NOT NULL,
	`saved_invoice_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assistant_proposals_org_id_uidx` ON `assistant_proposals` (`organisation_id`,`id`);
--> statement-breakpoint
CREATE INDEX `assistant_proposals_org_idx` ON `assistant_proposals` (`organisation_id`);
