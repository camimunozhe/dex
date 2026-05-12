-- meetups.last_modified_by currently has no ON DELETE rule, which blocks
-- account deletion when the user is last_modified_by on a meetup. Switch
-- to ON DELETE SET NULL so account deletion cascades cleanly.

ALTER TABLE meetups DROP CONSTRAINT IF EXISTS meetups_last_modified_by_fkey;

ALTER TABLE meetups
  ADD CONSTRAINT meetups_last_modified_by_fkey
  FOREIGN KEY (last_modified_by) REFERENCES profiles(id) ON DELETE SET NULL;
