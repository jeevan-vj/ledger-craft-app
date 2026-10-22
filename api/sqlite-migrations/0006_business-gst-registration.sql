ALTER TABLE `business_profiles` ADD `gst_registration_status` text DEFAULT 'unknown' NOT NULL CHECK (`gst_registration_status` IN ('unknown', 'registered', 'not_registered'));
