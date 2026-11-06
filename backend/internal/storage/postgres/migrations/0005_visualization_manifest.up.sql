-- Visualization manifest: soft binding to the graph version plus the
-- element manifest (nodes/edges remembered at the last explicit save/sync).
-- nodes/edges NULL = legacy (pre-manifest) visualization.
-- Migration 0004 renamed promoted defaults to 'default-<uuid8>'; this renames
-- every is_default row back to the literal 'default' (safe: no 'default'-named
-- rows exist post-0004, and the self-healing upsert keeps the invariant).
ALTER TABLE layouts
    ADD COLUMN graph_version BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN nodes         JSONB NULL,
    ADD COLUMN edges         JSONB NULL;
UPDATE layouts SET name = 'default' WHERE is_default;
