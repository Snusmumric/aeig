-- Down migration drops the manifest columns. The default rename
-- ('default-<uuid8>' -> 'default') is NOT reconstructed: the old generated
-- name is derivable from the row id, but 0005's contract is forward-only.
ALTER TABLE layouts
    DROP COLUMN IF EXISTS graph_version,
    DROP COLUMN IF EXISTS nodes,
    DROP COLUMN IF EXISTS edges;
