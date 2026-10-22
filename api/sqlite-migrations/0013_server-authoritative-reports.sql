CREATE INDEX `journal_entries_org_date_status_idx`
  ON `journal_entries` (`organisation_id`, `entry_date`, `status`);
--> statement-breakpoint
CREATE INDEX `journal_entries_org_reference_idx`
  ON `journal_entries` (`organisation_id`, `reference_type`, `reference_id`);
--> statement-breakpoint
CREATE INDEX `journal_entry_lines_org_account_idx`
  ON `journal_entry_lines` (`organisation_id`, `account_id`, `journal_entry_id`);
--> statement-breakpoint
CREATE TRIGGER `journal_entries_posted_no_delete`
BEFORE DELETE ON `journal_entries`
WHEN OLD.status IN ('posted', 'reversed')
BEGIN
  SELECT RAISE(ABORT, 'posted journal entries are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `journal_entries_posted_financial_no_update`
BEFORE UPDATE ON `journal_entries`
WHEN OLD.status IN ('posted', 'reversed') AND (
  NEW.organisation_id IS NOT OLD.organisation_id OR
  NEW.user_id IS NOT OLD.user_id OR
  NEW.entry_number IS NOT OLD.entry_number OR
  NEW.entry_date IS NOT OLD.entry_date OR
  NEW.description IS NOT OLD.description OR
  NEW.reference_type IS NOT OLD.reference_type OR
  NEW.reference_id IS NOT OLD.reference_id OR
  NEW.total_amount IS NOT OLD.total_amount
)
BEGIN
  SELECT RAISE(ABORT, 'posted journal entries are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `journal_entry_lines_posted_no_update`
BEFORE UPDATE ON `journal_entry_lines`
WHEN EXISTS (
  SELECT 1 FROM `journal_entries`
  WHERE id = OLD.journal_entry_id
    AND organisation_id = OLD.organisation_id
    AND status IN ('posted', 'reversed')
)
BEGIN
  SELECT RAISE(ABORT, 'posted journal lines are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `journal_entry_lines_posted_no_delete`
BEFORE DELETE ON `journal_entry_lines`
WHEN EXISTS (
  SELECT 1 FROM `journal_entries`
  WHERE id = OLD.journal_entry_id
    AND organisation_id = OLD.organisation_id
    AND status IN ('posted', 'reversed')
)
BEGIN
  SELECT RAISE(ABORT, 'posted journal lines are immutable');
END;
