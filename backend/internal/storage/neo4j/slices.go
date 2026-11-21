package neo4j

import (
	"context"

	neo4jdriver "github.com/neo4j/neo4j-go-driver/v5/neo4j"
)

// SliceMembershipRepo manages slice membership as the `sliceIds` system
// property on :Element (spec v3): single-statement Cypher expression updates
// that serialize on each node's write lock (no read-modify-write races), no
// auxiliary labels/relationships. Slice identity lives in Postgres.
type SliceMembershipRepo struct {
	driver neo4jdriver.DriverWithContext
}

func NewSliceMembershipRepo(driver neo4jdriver.DriverWithContext) *SliceMembershipRepo {
	return &SliceMembershipRepo{driver: driver}
}

// AddToSlice adds every known node id to the slice (unknown ids are skipped,
// re-adding is a no-op) and returns the slice's member count after the op.
func (r *SliceMembershipRepo) AddToSlice(ctx context.Context, graphID, sliceID string, nodeIDs []string) (int, error) {
	res, err := neo4jdriver.ExecuteQuery(ctx, r.driver,
		`UNWIND $ids AS nid
		 MATCH (e:Element {graphId: $graphId, id: nid})
		 SET e.sliceIds = CASE WHEN $sid IN coalesce(e.sliceIds, [])
		                       THEN e.sliceIds
		                       ELSE coalesce(e.sliceIds, []) + $sid END
		 WITH count(e) AS touched
		 MATCH (m:Element {graphId: $graphId})
		 WHERE $sid IN coalesce(m.sliceIds, [])
		 RETURN count(m) AS members`,
		map[string]any{"graphId": graphID, "sid": sliceID, "ids": nodeIDs},
		neo4jdriver.EagerResultTransformer,
		neo4jdriver.ExecuteQueryWithDatabase("neo4j"),
	)
	if err != nil {
		return 0, err
	}
	return countFrom(res.Records, "members"), nil
}

// RemoveFromSlice removes the sid from every listed node (idempotent — a
// list-filter keeps nodes that never had it) and returns the member count
// after the op.
func (r *SliceMembershipRepo) RemoveFromSlice(ctx context.Context, graphID, sliceID string, nodeIDs []string) (int, error) {
	res, err := neo4jdriver.ExecuteQuery(ctx, r.driver,
		`UNWIND $ids AS nid
		 MATCH (e:Element {graphId: $graphId, id: nid})
		 SET e.sliceIds = [x IN coalesce(e.sliceIds, []) WHERE x <> $sid]
		 WITH count(e) AS touched
		 MATCH (m:Element {graphId: $graphId})
		 WHERE $sid IN coalesce(m.sliceIds, [])
		 RETURN count(m) AS members`,
		map[string]any{"graphId": graphID, "sid": sliceID, "ids": nodeIDs},
		neo4jdriver.EagerResultTransformer,
		neo4jdriver.ExecuteQueryWithDatabase("neo4j"),
	)
	if err != nil {
		return 0, err
	}
	return countFrom(res.Records, "members"), nil
}

// SweepSlice removes the sid from every element of the graph in one
// statement (best-effort cleanup on slice delete; leftovers are inert —
// the slices list comes from Postgres).
func (r *SliceMembershipRepo) SweepSlice(ctx context.Context, graphID, sliceID string) error {
	_, err := neo4jdriver.ExecuteQuery(ctx, r.driver,
		`MATCH (e:Element {graphId: $graphId})
		 WHERE $sid IN coalesce(e.sliceIds, [])
		 SET e.sliceIds = [x IN coalesce(e.sliceIds, []) WHERE x <> $sid]`,
		map[string]any{"graphId": graphID, "sid": sliceID},
		neo4jdriver.EagerResultTransformer,
		neo4jdriver.ExecuteQueryWithDatabase("neo4j"),
	)
	return err
}

// MemberCounts returns sid → member count for the whole graph in one scan
// (nodes without sliceIds contribute nothing).
func (r *SliceMembershipRepo) MemberCounts(ctx context.Context, graphID string) (map[string]int, error) {
	res, err := neo4jdriver.ExecuteQuery(ctx, r.driver,
		`MATCH (e:Element {graphId: $graphId})
		 UNWIND coalesce(e.sliceIds, []) AS sid
		 RETURN sid AS sid, count(*) AS c`,
		map[string]any{"graphId": graphID},
		neo4jdriver.EagerResultTransformer,
		neo4jdriver.ExecuteQueryWithDatabase("neo4j"),
	)
	if err != nil {
		return nil, err
	}
	out := map[string]int{}
	for _, rec := range res.Records {
		sid, _ := rec.Get("sid")
		c, _ := rec.Get("c")
		if s, ok := sid.(string); ok {
			out[s] = int(c.(int64))
		}
	}
	return out, nil
}

func countFrom(records []*neo4jdriver.Record, key string) int {
	if len(records) == 0 {
		return 0
	}
	c, _ := records[0].Get(key)
	if n, ok := c.(int64); ok {
		return int(n)
	}
	return 0
}
