-- Add rate_unit column to line_items table
-- This allows users to specify the unit that the rate is in (e.g., per kg, per liter)
-- while the quantity can be in a different compatible unit (e.g., grams, ml)

-- Add the rate_unit column with a default value
ALTER TABLE line_items 
ADD COLUMN rate_unit TEXT DEFAULT 'each';

-- Update existing rows to use the same unit for rate_unit as unit
-- This maintains backward compatibility - existing invoices will calculate the same way
UPDATE line_items SET rate_unit = unit WHERE rate_unit IS NULL;

-- Make rate_unit NOT NULL after setting defaults
ALTER TABLE line_items 
ALTER COLUMN rate_unit SET NOT NULL;

-- Add a comment explaining the column's purpose
COMMENT ON COLUMN line_items.rate_unit IS 'The unit that the rate is specified in (e.g., if rate is $10 per kg, rate_unit is kg). Used for unit conversion when quantity unit differs.';

