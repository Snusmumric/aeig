//go:build integration

package neo4j

import (
	"context"
	"testing"

	"github.com/aeig/backend/internal/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSliceMembershipRepo_AddRemoveIdempotent(t *testing.T) {
	ctx := context.Background()
	uri, user, pass := startNeo4j(t) // helper from elements_integration_test.go

	drv, err := NewDriver(uri, user, pass)
	require.NoError(t, err)
	defer drv.Close(ctx)

	elements := NewElementRepo(drv)
	members := NewSliceMembershipRepo(drv)
	const gid = "g1"

	require.NoError(t, elements.UpsertNode(ctx, gid, domain.Node{ID: "n1", Type: "Task"}))
	require.NoError(t, elements.UpsertNode(ctx, gid, domain.Node{ID: "n2", Type: "Task"}))

	// add with an unknown id mixed in: skipped, no error; returns count after
	count, err := members.AddToSlice(ctx, gid, "sid-1", []string{"n1", "missing"})
	require.NoError(t, err)
	assert.Equal(t, 1, count)

	// add is idempotent: re-adding does not duplicate the membership
	count, err = members.AddToSlice(ctx, gid, "sid-1", []string{"n1"})
	require.NoError(t, err)
	assert.Equal(t, 1, count)

	sg, err := elements.GetSubgraph(ctx, gid)
	require.NoError(t, err)
	for _, n := range sg.Nodes {
		if n.ID == "n1" {
			assert.Equal(t, []string{"sid-1"}, n.SliceIDs, "no duplicate sid")
		}
	}

	// a node in a different graph is never touched
	require.NoError(t, elements.UpsertNode(ctx, "other", domain.Node{ID: "x", Type: "Task"}))
	count, err = members.AddToSlice(ctx, gid, "sid-1", []string{"x"})
	require.NoError(t, err)
	assert.Equal(t, 1, count)

	// remove is idempotent too; count reflects the store after the op
	count, err = members.RemoveFromSlice(ctx, gid, "sid-1", []string{"n1"})
	require.NoError(t, err)
	assert.Equal(t, 0, count)
	count, err = members.RemoveFromSlice(ctx, gid, "sid-1", []string{"n1"})
	require.NoError(t, err)
	assert.Equal(t, 0, count)

	// removing an unknown id is a no-op
	_, err = members.RemoveFromSlice(ctx, gid, "sid-1", []string{"missing"})
	require.NoError(t, err)
}

func TestSliceMembershipRepo_MemberCounts(t *testing.T) {
	ctx := context.Background()
	uri, user, pass := startNeo4j(t)

	drv, err := NewDriver(uri, user, pass)
	require.NoError(t, err)
	defer drv.Close(ctx)

	elements := NewElementRepo(drv)
	members := NewSliceMembershipRepo(drv)
	const gid = "g1"

	for _, id := range []string{"n1", "n2", "n3"} {
		require.NoError(t, elements.UpsertNode(ctx, gid, domain.Node{ID: id, Type: "Task"}))
	}
	_, err = members.AddToSlice(ctx, gid, "sid-a", []string{"n1", "n2"})
	require.NoError(t, err)
	_, err = members.AddToSlice(ctx, gid, "sid-b", []string{"n2", "n3"})
	require.NoError(t, err)

	// one scan, sid → member count; an element in no slice contributes nothing
	counts, err := members.MemberCounts(ctx, gid)
	require.NoError(t, err)
	assert.Equal(t, map[string]int{"sid-a": 2, "sid-b": 2}, counts)

	// counts are graph-scoped
	other, err := members.MemberCounts(ctx, "other")
	require.NoError(t, err)
	assert.Empty(t, other)
}

func TestSliceMembershipRepo_Sweep(t *testing.T) {
	ctx := context.Background()
	uri, user, pass := startNeo4j(t)

	drv, err := NewDriver(uri, user, pass)
	require.NoError(t, err)
	defer drv.Close(ctx)

	elements := NewElementRepo(drv)
	members := NewSliceMembershipRepo(drv)
	const gid = "g1"

	for _, id := range []string{"n1", "n2", "n3"} {
		require.NoError(t, elements.UpsertNode(ctx, gid, domain.Node{ID: id, Type: "Task"}))
	}
	_, err = members.AddToSlice(ctx, gid, "sid-dead", []string{"n1", "n2", "n3"})
	require.NoError(t, err)
	_, err = members.AddToSlice(ctx, gid, "sid-keep", []string{"n1"})
	require.NoError(t, err)

	// sweep removes the dead sid from every element in one statement
	require.NoError(t, members.SweepSlice(ctx, gid, "sid-dead"))

	counts, err := members.MemberCounts(ctx, gid)
	require.NoError(t, err)
	assert.Equal(t, map[string]int{"sid-keep": 1}, counts)

	sg, err := elements.GetSubgraph(ctx, gid)
	require.NoError(t, err)
	for _, n := range sg.Nodes {
		if n.ID == "n1" {
			assert.Equal(t, []string{"sid-keep"}, n.SliceIDs)
		} else {
			assert.Empty(t, n.SliceIDs)
		}
	}
}

// Review Focus 1: UpsertNode is a full property replacement that PRESERVES
// the system `sliceIds` — omitted user properties are still deleted.
func TestElementRepo_UpsertPreservesSliceIDs(t *testing.T) {
	ctx := context.Background()
	uri, user, pass := startNeo4j(t)

	drv, err := NewDriver(uri, user, pass)
	require.NoError(t, err)
	defer drv.Close(ctx)

	elements := NewElementRepo(drv)
	members := NewSliceMembershipRepo(drv)
	const gid = "g1"

	require.NoError(t, elements.UpsertNode(ctx, gid, domain.Node{
		ID: "n1", Type: "Task", Properties: map[string]any{"status": "open", "weight": int64(3)},
	}))
	_, err = members.AddToSlice(ctx, gid, "sid-1", []string{"n1"})
	require.NoError(t, err)

	// upsert with `status` changed and `weight` OMITTED
	require.NoError(t, elements.UpsertNode(ctx, gid, domain.Node{
		ID: "n1", Type: "Task", Properties: map[string]any{"status": "done"},
	}))

	sg, err := elements.GetSubgraph(ctx, gid)
	require.NoError(t, err)
	require.Len(t, sg.Nodes, 1)
	n := sg.Nodes[0]

	// half one: omitted user props are deleted (SET x = $props semantics kept)
	assert.Equal(t, "done", n.Properties["status"])
	assert.NotContains(t, n.Properties, "weight")

	// half two: the membership survives the replacement
	assert.Equal(t, []string{"sid-1"}, n.SliceIDs)

	// a NEW node upserted after membership ops has no phantom memberships
	require.NoError(t, elements.UpsertNode(ctx, gid, domain.Node{ID: "n2", Type: "Task"}))
	sg2, err := elements.GetSubgraph(ctx, gid)
	require.NoError(t, err)
	for _, n := range sg2.Nodes {
		if n.ID == "n2" {
			assert.Empty(t, n.SliceIDs)
		}
	}
}

// Review Focus 2: `sliceIds` never surfaces as a user property, but DOES as
// the typed GraphNode response field (both halves in one test).
func TestElementRepo_SubgraphExposesSliceIDs(t *testing.T) {
	ctx := context.Background()
	uri, user, pass := startNeo4j(t)

	drv, err := NewDriver(uri, user, pass)
	require.NoError(t, err)
	defer drv.Close(ctx)

	elements := NewElementRepo(drv)
	members := NewSliceMembershipRepo(drv)
	const gid = "g1"

	require.NoError(t, elements.UpsertNode(ctx, gid, domain.Node{
		ID: "n1", Type: "Task", Properties: map[string]any{"status": "open"},
	}))
	require.NoError(t, elements.UpsertNode(ctx, gid, domain.Node{ID: "n2", Type: "Task"}))
	_, err = members.AddToSlice(ctx, gid, "sid-1", []string{"n1"})
	require.NoError(t, err)

	sg, err := elements.GetSubgraph(ctx, gid)
	require.NoError(t, err)

	byID := map[string]domain.Node{}
	for _, n := range sg.Nodes {
		byID[n.ID] = n
	}

	// userProps excludes the system property…
	assert.NotContains(t, byID["n1"].Properties, "sliceIds")
	assert.NotContains(t, byID["n2"].Properties, "sliceIds")
	// …while GraphNode exposes it as a typed field
	assert.Equal(t, []string{"sid-1"}, byID["n1"].SliceIDs)
	assert.Empty(t, byID["n2"].SliceIDs)
}

func TestElementRepo_DeleteNodeDropsMembership(t *testing.T) {
	ctx := context.Background()
	uri, user, pass := startNeo4j(t)

	drv, err := NewDriver(uri, user, pass)
	require.NoError(t, err)
	defer drv.Close(ctx)

	elements := NewElementRepo(drv)
	members := NewSliceMembershipRepo(drv)
	const gid = "g1"

	require.NoError(t, elements.UpsertNode(ctx, gid, domain.Node{ID: "n1", Type: "Task"}))
	require.NoError(t, elements.UpsertNode(ctx, gid, domain.Node{ID: "n2", Type: "Task"}))
	_, err = members.AddToSlice(ctx, gid, "sid-1", []string{"n1", "n2"})
	require.NoError(t, err)

	// DETACH DELETE removes the node together with its memberships
	require.NoError(t, elements.DeleteNode(ctx, gid, "n1"))

	counts, err := members.MemberCounts(ctx, gid)
	require.NoError(t, err)
	assert.Equal(t, map[string]int{"sid-1": 1}, counts)
}
