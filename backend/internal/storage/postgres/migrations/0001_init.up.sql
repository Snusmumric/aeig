CREATE TABLE graphs (
    id         UUID PRIMARY KEY,
    name       TEXT NOT NULL,
    version    BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
