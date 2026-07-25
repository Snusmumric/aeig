package service

import (
	"context"
	"errors"
	"testing"

	"github.com/aeig/backend/internal/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type stubGraphStore struct {
	graph      domain.Graph
	getErr     error
	bumpErr    error
	bumpedBase int64
	newVersion int64
}

func (s *stubGraphStore) CreateGraph(_ context.Context, name string) (domain.Graph, error) {
	return domain.Graph{ID: "g1", Name: name, Version: 1}, nil
}
func (s *stubGraphStore) GetGraph(_ context.Context, _ string) (domain.Graph, error) {
	return s.graph, s.getErr
}
func (s *stubGraphStore) BumpVersion(_ context.Context, _ string, base int64) (int64, error) {
	s.bumpedBase = base
	return s.newVersion, s.bumpErr
}

type stubElementStore struct {
	upsertedNodes []domain.Node
	upsertedEdges []domain.Edge
	deletedNodes  []string
	deletedEdges  []string
	sub           domain.Subgraph
	upsertNodeErr error
}

func (s *stubElementStore) UpsertNode(_ context.Context, _ string, n domain.Node) error {
	s.upsertedNodes = append(s.upsertedNodes, n)
	return s.upsertNodeErr
}
func (s *stubElementStore) UpsertEdge(_ context.Context, _ string, e domain.Edge) error {
	s.upsertedEdges = append(s.upsertedEdges, e)
	return nil
}
func (s *stubElementStore) DeleteNode(_ context.Context, _ string, id string) error {
	s.deletedNodes = append(s.deletedNodes, id)
	return nil
}
func (s *stubElementStore) DeleteEdge(_ context.Context, _ string, id string) error {
	s.deletedEdges = append(s.deletedEdges, id)
	return nil
}
func (s *stubElementStore) GetSubgraph(_ context.Context, _ string) (domain.Subgraph, error) {
	return s.sub, nil
}

func TestCreateGraph_EmptyName(t *testing.T) {
	svc := NewGraphService(&stubGraphStore{}, &stubElementStore{})
	_, err := svc.CreateGraph(context.Background(), "  ")
	assert.ErrorIs(t, err, ErrInvalidInput)
}

func TestGetSubgraph_NotFound(t *testing.T) {
	gs := &stubGraphStore{getErr: domain.ErrNotFound}
	svc := NewGraphService(gs, &stubElementStore{})
	_, err := svc.GetSubgraph(context.Background(), "missing")
	assert.ErrorIs(t, err, domain.ErrNotFound)
}

func TestApplyMutations_BumpsFirstThenApplies(t *testing.T) {
	gs := &stubGraphStore{newVersion: 5}
	es := &stubElementStore{}
	svc := NewGraphService(gs, es)

	m := domain.Mutations{
		UpsertNodes:   []domain.Node{{ID: "n1", Type: "Task"}},
		UpsertEdges:   []domain.Edge{{ID: "e1", Type: "rel", Source: "n1", Target: "n2"}},
		DeleteEdgeIDs: []string{"eOld"},
		DeleteNodeIDs: []string{"nOld"},
	}
	v, err := svc.ApplyMutations(context.Background(), "g1", 4, m)
	require.NoError(t, err)
	assert.Equal(t, int64(5), v)
	assert.Equal(t, int64(4), gs.bumpedBase)
	assert.Equal(t, []string{"n1"}, nodeIDs(es.upsertedNodes))
	assert.Equal(t, []string{"e1"}, edgeIDs(es.upsertedEdges))
	assert.Equal(t, []string{"eOld"}, es.deletedEdges)
	assert.Equal(t, []string{"nOld"}, es.deletedNodes)
}

func TestApplyMutations_VersionConflict_NoElementWrites(t *testing.T) {
	gs := &stubGraphStore{bumpErr: domain.ErrVersionConflict}
	es := &stubElementStore{}
	svc := NewGraphService(gs, es)

	_, err := svc.ApplyMutations(context.Background(), "g1", 2,
		domain.Mutations{UpsertNodes: []domain.Node{{ID: "n1"}}})
	assert.ErrorIs(t, err, domain.ErrVersionConflict)
	assert.Empty(t, es.upsertedNodes, "no element writes on conflict")
}

func TestApplyMutations_ElementErrorPropagates(t *testing.T) {
	gs := &stubGraphStore{newVersion: 3}
	es := &stubElementStore{upsertNodeErr: errors.New("neo4j down")}
	svc := NewGraphService(gs, es)
	_, err := svc.ApplyMutations(context.Background(), "g1", 2,
		domain.Mutations{UpsertNodes: []domain.Node{{ID: "n1"}}})
	require.Error(t, err)
	assert.NotErrorIs(t, err, domain.ErrVersionConflict)
}

func nodeIDs(ns []domain.Node) []string {
	out := []string{}
	for _, n := range ns {
		out = append(out, n.ID)
	}
	return out
}
func edgeIDs(es []domain.Edge) []string {
	out := []string{}
	for _, e := range es {
		out = append(out, e.ID)
	}
	return out
}
