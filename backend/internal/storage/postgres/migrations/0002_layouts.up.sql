CREATE TABLE layouts (
    id         UUID PRIMARY KEY,
    graph_id   UUID NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    positions  JSONB NOT NULL DEFAULT '{}'::jsonb,
    viewport   JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (graph_id, name)
);
