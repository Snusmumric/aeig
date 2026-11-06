-- Down migration drops the visualization fields. The legacy-default promotion
-- (rename to 'default-<id-prefix>') is NOT reversible: the original name is lost.
DROP INDEX IF EXISTS layouts_one_default_per_graph;
ALTER TABLE layouts
    DROP COLUMN IF EXISTS edge_types,
    DROP COLUMN IF EXISTS hide_orphans,
    DROP COLUMN IF EXISTS is_default;
