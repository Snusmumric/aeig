-- Visualization evolution: the `layouts` table stays the visualization store
-- (spec: Approaches #1 — one concept, one mechanism, zero data migration).
-- edge_types NULL = no filter (all visible).
-- Legacy manual saves literally named 'default' are promoted to the graph's
-- default visualization under a unique name (spec: Bootstrap).
ALTER TABLE layouts
    ADD COLUMN edge_types   JSONB   NULL,
    ADD COLUMN hide_orphans BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN is_default   BOOLEAN NOT NULL DEFAULT false;
UPDATE layouts SET is_default = true,
                   name = 'default-' || substr(id::text, 1, 8)
 WHERE name = 'default';
CREATE UNIQUE INDEX layouts_one_default_per_graph
    ON layouts (graph_id) WHERE is_default;
