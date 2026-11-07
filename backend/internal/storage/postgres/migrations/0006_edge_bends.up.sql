-- Edge bends: per-edge relative offsets ({edgeId: {dx, dy}}) for the
-- visualization's edge layout. NULL = saved before bends existed (legacy).
ALTER TABLE layouts
    ADD COLUMN bends JSONB NULL;
