package neo4j

import (
	"context"

	"github.com/aeig/backend/internal/domain"
	neo4jdriver "github.com/neo4j/neo4j-go-driver/v5/neo4j"
)

// reserved system property keys stripped from user Properties.
var reservedKeys = map[string]struct{}{"graphId": {}, "id": {}, "type": {}}

type ElementRepo struct {
	driver neo4jdriver.DriverWithContext
}

func NewElementRepo(driver neo4jdriver.DriverWithContext) *ElementRepo {
	return &ElementRepo{driver: driver}
}

// buildProps merges system props with user props into one flat map for `SET x = $props`.
func buildProps(graphID string, id, typ string, source, target *string, user map[string]any) map[string]any {
	props := map[string]any{"graphId": graphID, "id": id, "type": typ}
	for k, v := range user {
		if _, reserved := reservedKeys[k]; reserved {
			continue
		}
		props[k] = v
	}
	if source != nil {
		props["_source"] = *source
	}
	if target != nil {
		props["_target"] = *target
	}
	return props
}

func userProps(all map[string]any) map[string]any {
	out := map[string]any{}
	for k, v := range all {
		if _, reserved := reservedKeys[k]; reserved {
			continue
		}
		if k == "_source" || k == "_target" {
			continue
		}
		out[k] = v
	}
	return out
}

func (r *ElementRepo) UpsertNode(ctx context.Context, graphID string, n domain.Node) error {
	props := buildProps(graphID, n.ID, n.Type, nil, nil, n.Properties)
	_, err := neo4jdriver.ExecuteQuery(ctx, r.driver,
		`MERGE (x:Element {graphId: $graphId, id: $id})
		 SET x = $props`,
		map[string]any{"graphId": graphID, "id": n.ID, "props": props},
		neo4jdriver.EagerResultTransformer,
		neo4jdriver.ExecuteQueryWithDatabase("neo4j"),
	)
	return err
}

func (r *ElementRepo) UpsertEdge(ctx context.Context, graphID string, e domain.Edge) error {
	props := buildProps(graphID, e.ID, e.Type, &e.Source, &e.Target, e.Properties)
	_, err := neo4jdriver.ExecuteQuery(ctx, r.driver,
		`MATCH (s:Element {graphId: $graphId, id: $source})
		 MATCH (t:Element {graphId: $graphId, id: $target})
		 MERGE (s)-[e:REL {graphId: $graphId, id: $id}]->(t)
		 SET e = $props`,
		map[string]any{
			"graphId": graphID, "id": e.ID,
			"source": e.Source, "target": e.Target, "props": props,
		},
		neo4jdriver.EagerResultTransformer,
		neo4jdriver.ExecuteQueryWithDatabase("neo4j"),
	)
	return err
}

func (r *ElementRepo) GetSubgraph(ctx context.Context, graphID string) (domain.Subgraph, error) {
	var sg domain.Subgraph

	nodesRes, err := neo4jdriver.ExecuteQuery(ctx, r.driver,
		`MATCH (x:Element {graphId: $graphId}) RETURN x`,
		map[string]any{"graphId": graphID},
		neo4jdriver.EagerResultTransformer,
		neo4jdriver.ExecuteQueryWithDatabase("neo4j"),
	)
	if err != nil {
		return sg, err
	}
	for _, rec := range nodesRes.Records {
		raw, _ := rec.Get("x")
		node := raw.(neo4jdriver.Node)
		sg.Nodes = append(sg.Nodes, domain.Node{
			ID:         node.Props["id"].(string),
			Type:       node.Props["type"].(string),
			Properties: userProps(node.Props),
		})
	}

	edgesRes, err := neo4jdriver.ExecuteQuery(ctx, r.driver,
		`MATCH (s:Element {graphId: $graphId})-[e:REL {graphId: $graphId}]->(t:Element {graphId: $graphId})
		 RETURN e, s.id AS source, t.id AS target`,
		map[string]any{"graphId": graphID},
		neo4jdriver.EagerResultTransformer,
		neo4jdriver.ExecuteQueryWithDatabase("neo4j"),
	)
	if err != nil {
		return sg, err
	}
	for _, rec := range edgesRes.Records {
		raw, _ := rec.Get("e")
		rel := raw.(neo4jdriver.Relationship)
		src, _ := rec.Get("source")
		tgt, _ := rec.Get("target")
		sg.Edges = append(sg.Edges, domain.Edge{
			ID:         rel.Props["id"].(string),
			Type:       rel.Props["type"].(string),
			Source:     src.(string),
			Target:     tgt.(string),
			Properties: userProps(rel.Props),
		})
	}
	return sg, nil
}

func (r *ElementRepo) DeleteNode(ctx context.Context, graphID, nodeID string) error {
	_, err := neo4jdriver.ExecuteQuery(ctx, r.driver,
		`MATCH (x:Element {graphId: $graphId, id: $id}) DETACH DELETE x`,
		map[string]any{"graphId": graphID, "id": nodeID},
		neo4jdriver.EagerResultTransformer,
		neo4jdriver.ExecuteQueryWithDatabase("neo4j"),
	)
	return err
}

func (r *ElementRepo) DeleteEdge(ctx context.Context, graphID, edgeID string) error {
	_, err := neo4jdriver.ExecuteQuery(ctx, r.driver,
		`MATCH ()-[e:REL {graphId: $graphId, id: $id}]->() DELETE e`,
		map[string]any{"graphId": graphID, "id": edgeID},
		neo4jdriver.EagerResultTransformer,
		neo4jdriver.ExecuteQueryWithDatabase("neo4j"),
	)
	return err
}
