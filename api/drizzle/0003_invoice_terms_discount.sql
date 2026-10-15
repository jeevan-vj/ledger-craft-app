ALTER TABLE business_profiles
  ADD COLUMN IF NOT EXISTS payment_term_days integer NOT NULL DEFAULT 30;

ALTER TABLE business_profiles
  DROP CONSTRAINT IF EXISTS business_profiles_payment_term_days_check;
ALTER TABLE business_profiles
  ADD CONSTRAINT business_profiles_payment_term_days_check
  CHECK (payment_term_days >= 0 AND payment_term_days <= 365);

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS payment_term_days integer,
  ADD COLUMN IF NOT EXISTS discount_type text NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS discount_percent numeric(5, 2);

ALTER TABLE invoices
  DROP CONSTRAINT IF EXISTS invoices_payment_term_days_check;
ALTER TABLE invoices
  ADD CONSTRAINT invoices_payment_term_days_check
  CHECK (payment_term_days IS NULL OR (payment_term_days >= 0 AND payment_term_days <= 365));

ALTER TABLE invoices
  DROP CONSTRAINT IF EXISTS invoices_discount_type_check;
ALTER TABLE invoices
  ADD CONSTRAINT invoices_discount_type_check
  CHECK (discount_type IN ('fixed', 'percent'));

ALTER TABLE invoices
  DROP CONSTRAINT IF EXISTS invoices_discount_percent_check;
ALTER TABLE invoices
  ADD CONSTRAINT invoices_discount_percent_check
  CHECK (discount_percent IS NULL OR (discount_percent >= 0 AND discount_percent <= 100));
