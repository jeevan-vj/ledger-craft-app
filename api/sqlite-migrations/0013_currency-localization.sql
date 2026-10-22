CREATE TABLE `organisation_localization_settings` (
  `organisation_id` text PRIMARY KEY NOT NULL REFERENCES `organisations`(`id`) ON DELETE CASCADE,
  `base_currency` text NOT NULL DEFAULT 'NZD', `locale` text NOT NULL DEFAULT 'en-NZ',
  `language` text NOT NULL DEFAULT 'en', `timezone` text NOT NULL DEFAULT 'Pacific/Auckland',
  `date_format` text NOT NULL DEFAULT 'DD/MM/YYYY', `number_format` text NOT NULL DEFAULT '1,234.56',
  `financial_year_start_month` integer NOT NULL DEFAULT 4, `financial_year_start_day` integer NOT NULL DEFAULT 1,
  `percent_position` text NOT NULL DEFAULT 'after', `updated_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  CONSTRAINT `organisation_localization_base_currency_check` CHECK (`base_currency` GLOB '[A-Z][A-Z][A-Z]'),
  CONSTRAINT `organisation_localization_financial_month_check` CHECK (`financial_year_start_month` BETWEEN 1 AND 12),
  CONSTRAINT `organisation_localization_financial_day_check` CHECK (`financial_year_start_day` BETWEEN 1 AND 31)
);
CREATE TABLE `organisation_currencies` (
  `organisation_id` text NOT NULL REFERENCES `organisations`(`id`) ON DELETE CASCADE,
  `code` text NOT NULL, `name` text NOT NULL, `precision` integer NOT NULL, `symbol` text NOT NULL,
  `symbol_position` text NOT NULL, `enabled` integer NOT NULL DEFAULT 1,
  `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000), `updated_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  CONSTRAINT `organisation_currencies_code_check` CHECK (`code` GLOB '[A-Z][A-Z][A-Z]'),
  CONSTRAINT `organisation_currencies_precision_check` CHECK (`precision` BETWEEN 0 AND 4),
  CONSTRAINT `organisation_currencies_symbol_position_check` CHECK (`symbol_position` IN ('before','after'))
);
CREATE UNIQUE INDEX `organisation_currencies_org_code_uidx` ON `organisation_currencies` (`organisation_id`,`code`);
CREATE INDEX `organisation_currencies_org_enabled_idx` ON `organisation_currencies` (`organisation_id`,`enabled`);
CREATE TABLE `exchange_rates` (
  `id` text PRIMARY KEY NOT NULL, `organisation_id` text NOT NULL REFERENCES `organisations`(`id`) ON DELETE CASCADE,
  `currency_code` text NOT NULL, `base_currency` text NOT NULL, `effective_date` text NOT NULL, `rate` text NOT NULL,
  `created_by_user_id` text NOT NULL REFERENCES `users`(`id`), `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  CONSTRAINT `exchange_rates_distinct_currency_check` CHECK (`currency_code` <> `base_currency`),
  CONSTRAINT `exchange_rates_rate_check` CHECK (`rate` <> '' AND `rate` NOT GLOB '*[^0-9.]*' AND trim(`rate`, '0.') <> '')
);
CREATE UNIQUE INDEX `exchange_rates_org_currency_date_uidx` ON `exchange_rates` (`organisation_id`,`currency_code`,`effective_date`);
CREATE UNIQUE INDEX `exchange_rates_org_id_uidx` ON `exchange_rates` (`organisation_id`,`id`);
CREATE INDEX `exchange_rates_lookup_idx` ON `exchange_rates` (`organisation_id`,`currency_code`,`base_currency`,`effective_date`);
CREATE TABLE `exchange_rate_usage` (
  `id` text PRIMARY KEY NOT NULL, `organisation_id` text NOT NULL REFERENCES `organisations`(`id`) ON DELETE CASCADE,
  `exchange_rate_id` text NOT NULL, `document_type` text NOT NULL, `document_id` text NOT NULL,
  `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  FOREIGN KEY (`organisation_id`,`exchange_rate_id`) REFERENCES `exchange_rates`(`organisation_id`,`id`) ON DELETE RESTRICT,
  CONSTRAINT `exchange_rate_usage_type_check` CHECK (`document_type` IN ('invoice','bill','expense','transfer'))
);
CREATE UNIQUE INDEX `exchange_rate_usage_document_uidx` ON `exchange_rate_usage` (`organisation_id`,`document_type`,`document_id`);
CREATE INDEX `exchange_rate_usage_rate_idx` ON `exchange_rate_usage` (`organisation_id`,`exchange_rate_id`);

ALTER TABLE `invoices` ADD COLUMN `exchange_rate` text NOT NULL DEFAULT '1';
ALTER TABLE `invoices` ADD COLUMN `exchange_rate_id` text;
ALTER TABLE `invoices` ADD COLUMN `base_currency` text NOT NULL DEFAULT 'NZD';
ALTER TABLE `invoices` ADD COLUMN `base_subtotal` text NOT NULL DEFAULT '0';
ALTER TABLE `invoices` ADD COLUMN `base_tax_amount` text NOT NULL DEFAULT '0';
ALTER TABLE `invoices` ADD COLUMN `base_total` text NOT NULL DEFAULT '0';
UPDATE `invoices` SET `base_subtotal`=`subtotal`,`base_tax_amount`=`tax_amount`,`base_total`=`total`;
ALTER TABLE `bills` ADD COLUMN `exchange_rate` text NOT NULL DEFAULT '1';
ALTER TABLE `bills` ADD COLUMN `exchange_rate_id` text;
ALTER TABLE `bills` ADD COLUMN `base_currency` text NOT NULL DEFAULT 'NZD';
ALTER TABLE `bills` ADD COLUMN `base_subtotal` text NOT NULL DEFAULT '0';
ALTER TABLE `bills` ADD COLUMN `base_tax_amount` text NOT NULL DEFAULT '0';
ALTER TABLE `bills` ADD COLUMN `base_total` text NOT NULL DEFAULT '0';
UPDATE `bills` SET `base_subtotal`=`subtotal`,`base_tax_amount`=`tax_amount`,`base_total`=`total`;
ALTER TABLE `expenses` ADD COLUMN `exchange_rate` text NOT NULL DEFAULT '1';
ALTER TABLE `expenses` ADD COLUMN `exchange_rate_id` text;
ALTER TABLE `expenses` ADD COLUMN `base_currency` text NOT NULL DEFAULT 'NZD';
ALTER TABLE `expenses` ADD COLUMN `base_amount` text NOT NULL DEFAULT '0';
ALTER TABLE `expenses` ADD COLUMN `base_tax_amount` text NOT NULL DEFAULT '0';
UPDATE `expenses` SET `base_amount`=`amount`,`base_tax_amount`=`tax_amount`;
ALTER TABLE `bank_transfers` ADD COLUMN `destination_currency` text NOT NULL DEFAULT 'NZD';
ALTER TABLE `bank_transfers` ADD COLUMN `destination_amount` text NOT NULL DEFAULT '0';
ALTER TABLE `bank_transfers` ADD COLUMN `exchange_rate` text NOT NULL DEFAULT '1';
ALTER TABLE `bank_transfers` ADD COLUMN `exchange_rate_id` text;
UPDATE `bank_transfers` SET `destination_currency`=`currency`,`destination_amount`=`amount`;
