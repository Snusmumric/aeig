-- Slices: named node sets over a graph's elements. Identity and metadata
-- live in Postgres (same principle as `graphs` itself); membership is the
-- `sliceIds` system property on :Element in Neo4j and is never stored here.
-- No created_at by design (YAGLI): no consumer; adding later is a one-minute
-- migration. ON DELETE CASCADE from graphs mirrors `layouts`.
CREATE TABLE slices (
    id          UUID PRIMARY KEY,
    graph_id    UUID NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    UNIQUE (graph_id, name)
);
