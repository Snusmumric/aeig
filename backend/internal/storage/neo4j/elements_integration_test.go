//go:build integration

package neo4j

import (
	"context"
	"testing"

	"github.com/aeig/backend/internal/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	tcneo4j "github.com/testcontainers/testcontainers-go/modules/neo4j"
)

func startNeo4j(t *testing.T) (uri, user, pass string) {
	t.Helper()
	ctx := context.Background()
	ctr, err := tcneo4j.Run(ctx, "neo4j:5-community",
		tcneo4j.WithAdminPassword("testpass"),
	)
	require.NoError(t, err)
	t.Cleanup(func() { _ = ctr.Terminate(ctx) })

	uri, err = ctr.BoltUrl(ctx)
	require.NoError(t, err)
	return uri, "neo4j", "testpass"
}

func TestElementRepo_UpsertAndGetSubgraph(t *testing.T) {
	ctx := context.Background()
	uri, user, pass := startNeo4j(t)

	drv, err := NewDriver(uri, user, pass)
	require.NoError(t, err)
	defer drv.Close(ctx)

	repo := NewElementRepo(drv)
	const gid = "g1"

	require.NoError(t, repo.UpsertNode(ctx, gid, domain.Node{
		ID: "n1", Type: "Task", Properties: map[string]any{"status": "open"},
	}))
	require.NoError(t, repo.UpsertNode(ctx, gid, domain.Node{
		ID: "n2", Type: "Task", Properties: map[string]any{"status": "done"},
	}))
	require.NoError(t, repo.UpsertEdge(ctx, gid, domain.Edge{
		ID: "e1", Type: "depends_on", Source: "n1", Target: "n2",
		Properties: map[string]any{"weight": int64(3)},
	}))

	// A node in a different graph must not leak into g1's subgraph.
	require.NoError(t, repo.UpsertNode(ctx, "other", domain.Node{ID: "x", Type: "Task"}))

	sg, err := repo.GetSubgraph(ctx, gid)
	require.NoError(t, err)
	assert.Len(t, sg.Nodes, 2)
	assert.Len(t, sg.Edges, 1)

	byID := map[string]domain.Node{}
	for _, n := range sg.Nodes {
		byID[n.ID] = n
	}
	assert.Equal(t, "Task", byID["n1"].Type)
	assert.Equal(t, "open", byID["n1"].Properties["status"])
	assert.NotContains(t, byID["n1"].Properties, "graphId")
	assert.NotContains(t, byID["n1"].Properties, "id")
	assert.NotContains(t, byID["n1"].Properties, "type")

	e := sg.Edges[0]
	assert.Equal(t, "e1", e.ID)
	assert.Equal(t, "n1", e.Source)
	assert.Equal(t, "n2", e.Target)
	assert.Equal(t, "depends_on", e.Type)
	assert.EqualValues(t, 3, e.Properties["weight"])

	// Upsert is idempotent + updates props.
	require.NoError(t, repo.UpsertNode(ctx, gid, domain.Node{
		ID: "n1", Type: "Task", Properties: map[string]any{"status": "blocked"},
	}))
	sg, err = repo.GetSubgraph(ctx, gid)
	require.NoError(t, err)
	assert.Len(t, sg.Nodes, 2)

	require.NoError(t, repo.DeleteEdge(ctx, gid, "e1"))
	require.NoError(t, repo.DeleteNode(ctx, gid, "n2"))
	sg, err = repo.GetSubgraph(ctx, gid)
	require.NoError(t, err)
	assert.Len(t, sg.Nodes, 1)
	assert.Len(t, sg.Edges, 0)
}
