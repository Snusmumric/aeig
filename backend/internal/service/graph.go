package service

import (
	"context"
	"errors"
	"strings"

	"github.com/aeig/backend/internal/domain"
)

var ErrInvalidInput = errors.New("invalid input")

type GraphStore interface {
	CreateGraph(ctx context.Context, name string) (domain.Graph, error)
	GetGraph(ctx context.Context, id string) (domain.Graph, error)
	BumpVersion(ctx context.Context, id string, baseVersion int64) (int64, error)
}

type ElementStore interface {
	UpsertNode(ctx context.Context, graphID string, n domain.Node) error
	UpsertEdge(ctx context.Context, graphID string, e domain.Edge) error
	DeleteNode(ctx context.Context, graphID, nodeID string) error
	DeleteEdge(ctx context.Context, graphID, edgeID string) error
	GetSubgraph(ctx context.Context, graphID string) (domain.Subgraph, error)
}

type GraphService struct {
	graphs   GraphStore
	elements ElementStore
}

func NewGraphService(g GraphStore, e ElementStore) *GraphService {
	return &GraphService{graphs: g, elements: e}
}

func (s *GraphService) CreateGraph(ctx context.Context, name string) (domain.Graph, error) {
	if strings.TrimSpace(name) == "" {
		return domain.Graph{}, ErrInvalidInput
	}
	return s.graphs.CreateGraph(ctx, name)
}

func (s *GraphService) GetGraph(ctx context.Context, id string) (domain.Graph, error) {
	return s.graphs.GetGraph(ctx, id)
}

func (s *GraphService) GetSubgraph(ctx context.Context, id string) (domain.Subgraph, error) {
	if _, err := s.graphs.GetGraph(ctx, id); err != nil {
		return domain.Subgraph{}, err
	}
	return s.elements.GetSubgraph(ctx, id)
}

// ApplyMutations bumps the version first (atomic optimistic guard); on success it
// applies element writes in dependency-safe order. Not a distributed transaction:
// a Neo4j failure after the bump surfaces as a non-domain error (HTTP 500) and the
// client must re-fetch the subgraph.
func (s *GraphService) ApplyMutations(ctx context.Context, id string, baseVersion int64, m domain.Mutations) (int64, error) {
	newVersion, err := s.graphs.BumpVersion(ctx, id, baseVersion)
	if err != nil {
		return 0, err // ErrNotFound / ErrVersionConflict propagate unchanged
	}
	for _, n := range m.UpsertNodes {
		if err := s.elements.UpsertNode(ctx, id, n); err != nil {
			return 0, err
		}
	}
	for _, e := range m.UpsertEdges {
		if err := s.elements.UpsertEdge(ctx, id, e); err != nil {
			return 0, err
		}
	}
	for _, eid := range m.DeleteEdgeIDs {
		if err := s.elements.DeleteEdge(ctx, id, eid); err != nil {
			return 0, err
		}
	}
	for _, nid := range m.DeleteNodeIDs {
		if err := s.elements.DeleteNode(ctx, id, nid); err != nil {
			return 0, err
		}
	}
	return newVersion, nil
}
