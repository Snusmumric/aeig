-- Down migration drops the bends column (edge layout offsets are
-- presentation-only; losing them restores straight edges).
ALTER TABLE layouts
    DROP COLUMN IF EXISTS bends;
