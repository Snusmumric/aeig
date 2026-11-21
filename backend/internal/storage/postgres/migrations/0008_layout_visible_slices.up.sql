-- Slice visibility filter: the array of VISIBLE slice UUIDs persisted with
-- the visualization (autosave family, like positions/bends — unlike the
-- manifest binding). NULL = no filtering (all slices visible, the default).
ALTER TABLE layouts
    ADD COLUMN visible_slices JSONB NULL;
