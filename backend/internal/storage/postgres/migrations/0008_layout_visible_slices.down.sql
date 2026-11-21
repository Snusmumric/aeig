-- Down migration drops the visible_slices column (restores "all visible").
ALTER TABLE layouts
    DROP COLUMN IF EXISTS visible_slices;
