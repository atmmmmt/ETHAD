-- Audit log is append-only: no UPDATE, no DELETE — ever.
CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();

-- Lines of a posted (or reversed) entry can never be changed or deleted.
CREATE OR REPLACE FUNCTION journal_line_locked() RETURNS trigger AS $$
DECLARE st "EntryStatus";
BEGIN
  SELECT status INTO st FROM "JournalEntry" WHERE id = COALESCE(OLD."entryId", NEW."entryId");
  IF st IN ('POSTED', 'REVERSED') THEN
    RAISE EXCEPTION 'Lines of a posted entry are locked';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER journal_line_lock BEFORE UPDATE OR DELETE ON "JournalLine"
  FOR EACH ROW EXECUTE FUNCTION journal_line_locked();

-- A posted entry can only move to REVERSED; it can never be deleted.
CREATE OR REPLACE FUNCTION journal_entry_locked() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.status IN ('POSTED', 'REVERSED') THEN
    RAISE EXCEPTION 'Posted entries cannot be deleted';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'POSTED' AND NEW.status NOT IN ('POSTED', 'REVERSED') THEN
    RAISE EXCEPTION 'Posted entries can only be reversed';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IN ('POSTED', 'REVERSED')
     AND (NEW.date <> OLD.date OR NEW.total <> OLD.total OR NEW.number IS DISTINCT FROM OLD.number) THEN
    RAISE EXCEPTION 'Posted entries are locked';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER journal_entry_lock BEFORE UPDATE OR DELETE ON "JournalEntry"
  FOR EACH ROW EXECUTE FUNCTION journal_entry_locked();

-- Every journal line is one-sided and non-negative.
ALTER TABLE "JournalLine" ADD CONSTRAINT journal_line_one_side
  CHECK (debit >= 0 AND credit >= 0 AND (debit = 0 OR credit = 0));
