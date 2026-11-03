CREATE TABLE `stripe_connected_accounts` (
  `organisation_id` text PRIMARY KEY NOT NULL REFERENCES `organisations`(`id`),
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `stripe_account_id` text NOT NULL,
  `status` text NOT NULL CHECK (`status` IN ('onboarding','restricted','active','disabled')),
  `charges_enabled` integer DEFAULT false NOT NULL,
  `payouts_enabled` integer DEFAULT false NOT NULL,
  `details_submitted` integer DEFAULT false NOT NULL,
  `requirements_due` text DEFAULT '[]' NOT NULL,
  `disabled_reason` text,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
CREATE UNIQUE INDEX `stripe_connected_accounts_account_uidx` ON `stripe_connected_accounts` (`stripe_account_id`);

CREATE TABLE `stripe_account_routes` (
  `stripe_account_id` text PRIMARY KEY NOT NULL,
  `organisation_id` text NOT NULL,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
CREATE UNIQUE INDEX `stripe_account_routes_org_uidx` ON `stripe_account_routes` (`organisation_id`);

CREATE TABLE `stripe_payment_links` (
  `id` text PRIMARY KEY NOT NULL,
  `organisation_id` text NOT NULL REFERENCES `organisations`(`id`),
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `invoice_id` text NOT NULL,
  `idempotency_key` text NOT NULL,
  `public_token` text NOT NULL,
  `stripe_checkout_session_id` text NOT NULL,
  `stripe_payment_intent_id` text,
  `amount` text NOT NULL,
  `platform_fee` text NOT NULL,
  `currency` text DEFAULT 'NZD' NOT NULL CHECK (`currency` = 'NZD'),
  `checkout_url` text NOT NULL,
  `status` text DEFAULT 'open' NOT NULL CHECK (`status` IN ('open','paid','expired','cancelled','failed')),
  `expires_at` integer NOT NULL,
  `payment_id` text,
  `receipt_id` text,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`organisation_id`,`invoice_id`) REFERENCES `invoices`(`organisation_id`,`id`) ON DELETE restrict,
  FOREIGN KEY (`organisation_id`,`payment_id`) REFERENCES `payments`(`organisation_id`,`id`) ON DELETE restrict,
  FOREIGN KEY (`organisation_id`,`receipt_id`) REFERENCES `receipts`(`organisation_id`,`id`) ON DELETE restrict
);
CREATE UNIQUE INDEX `stripe_payment_links_org_id_uidx` ON `stripe_payment_links` (`organisation_id`,`id`);
CREATE UNIQUE INDEX `stripe_payment_links_token_uidx` ON `stripe_payment_links` (`public_token`);
CREATE UNIQUE INDEX `stripe_payment_links_session_uidx` ON `stripe_payment_links` (`stripe_checkout_session_id`);
CREATE UNIQUE INDEX `stripe_payment_links_idempotency_uidx` ON `stripe_payment_links` (`organisation_id`,`idempotency_key`);
CREATE INDEX `stripe_payment_links_invoice_idx` ON `stripe_payment_links` (`organisation_id`,`invoice_id`);

CREATE TABLE `stripe_events` (
  `event_id` text PRIMARY KEY NOT NULL,
  `organisation_id` text NOT NULL,
  `event_type` text NOT NULL,
  `livemode` integer NOT NULL,
  `outcome` text DEFAULT 'processing' NOT NULL CHECK (`outcome` IN ('processing','processed','ignored','failed')),
  `error` text,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `processed_at` integer
);
CREATE INDEX `stripe_events_org_idx` ON `stripe_events` (`organisation_id`);
