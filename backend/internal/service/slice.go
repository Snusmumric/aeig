package service

import (
	"context"
	"strings"

	"github.com/aeig/backend/internal/domain"
)

// SliceStore is the Postgres half: slice identity and metadata CRUD
// (implemented by postgres.SliceRepo).
type SliceStore interface {
	CreateSlice(ctx context.Context, graphID string, s domain.Slice) (domain.Slice, error)
	GetSliceByName(ctx context.Context, graphID, name string) (domain.Slice, error)
	ListSlices(ctx context.Context, graphID string) ([]domain.Slice, error)
	RenameSlice(ctx context.Context, graphID, name, newName, description string) (domain.Slice, error)
	DeleteSlice(ctx context.Context, graphID, name string) error
}

// SliceMembership is the Neo4j half: membership as the `sliceIds` system
// property on :Element (implemented by neo4j.SliceMembershipRepo).
type SliceMembership interface {
	AddToSlice(ctx context.Context, graphID, sliceID string, nodeIDs []string) (int, error)
	RemoveFromSlice(ctx context.Context, graphID, sliceID string, nodeIDs []string) (int, error)
	SweepSlice(ctx context.Context, graphID, sliceID string) error
	MemberCounts(ctx context.Context, graphID string) (map[string]int, error)
}

// SubgraphSource supplies hydrated element data (the members of a slice are
// subgraph nodes filtered by their typed SliceIDs).
type SubgraphSource interface {
	GetSubgraph(ctx context.Context, graphID string) (domain.Subgraph, error)
}

// SliceService composes the two stores, the same DI pattern as
// GraphService (PG + Neo4j halves). Slice edits never bump graphs.version
// (annotations; per-op idempotency replaces versioning).
type SliceService struct {
	slices     SliceStore
	membership SliceMembership
	graphs     GraphExistence
	elements   SubgraphSource
}

func NewSliceService(slices SliceStore, membership SliceMembership, graphs GraphExistence, elements SubgraphSource) *SliceService {
	return &SliceService{slices: slices, membership: membership, graphs: graphs, elements: elements}
}

// CreateSlice inserts the PG row first, then adds the requested nodes
// best-effort (no cross-store transaction is possible). The response reports
// the ACTUAL member count (unknown node ids are skipped by the store). An
// AddToSlice failure surfaces as a server error while the row stays — the
// ApplyMutations precedent; the client retries the add.
func (s *SliceService) CreateSlice(ctx context.Context, graphID, name, description string, nodeIDs []string) (domain.SliceInfo, error) {
	if strings.TrimSpace(name) == "" {
		return domain.SliceInfo{}, ErrInvalidInput
	}
	if _, err := s.graphs.GetGraph(ctx, graphID); err != nil {
		return domain.SliceInfo{}, err
	}
	created, err := s.slices.CreateSlice(ctx, graphID, domain.Slice{Name: name, Description: description})
	if err != nil {
		return domain.SliceInfo{}, err
	}
	info := domain.SliceInfo{ID: created.ID, Name: created.Name, Description: created.Description}
	if len(nodeIDs) > 0 {
		count, err := s.membership.AddToSlice(ctx, graphID, created.ID, nodeIDs)
		if err != nil {
			return domain.SliceInfo{}, err
		}
		info.NodeCount = count
	}
	return info, nil
}

// ListSlices aggregates the PG slice list with the Neo4j member counts
// (a slice with no members shows 0).
func (s *SliceService) ListSlices(ctx context.Context, graphID string) ([]domain.SliceInfo, error) {
	if _, err := s.graphs.GetGraph(ctx, graphID); err != nil {
		return nil, err
	}
	all, err := s.slices.ListSlices(ctx, graphID)
	if err != nil {
		return nil, err
	}
	counts, err := s.membership.MemberCounts(ctx, graphID)
	if err != nil {
		return nil, err
	}
	out := make([]domain.SliceInfo, 0, len(all))
	for _, sl := range all {
		out = append(out, domain.SliceInfo{
			ID: sl.ID, Name: sl.Name, Description: sl.Description,
			NodeCount: counts[sl.ID],
		})
	}
	return out, nil
}

// GetSlice returns the slice with its members hydrated as full graph nodes
// (subgraph nodes carrying the slice's id in their typed SliceIDs field).
func (s *SliceService) GetSlice(ctx context.Context, graphID, name string) (domain.SliceDetail, error) {
	if _, err := s.graphs.GetGraph(ctx, graphID); err != nil {
		return domain.SliceDetail{}, err
	}
	sl, err := s.slices.GetSliceByName(ctx, graphID, name)
	if err != nil {
		return domain.SliceDetail{}, err
	}
	sg, err := s.elements.GetSubgraph(ctx, graphID)
	if err != nil {
		return domain.SliceDetail{}, err
	}
	detail := domain.SliceDetail{ID: sl.ID, Name: sl.Name, Description: sl.Description, Nodes: []domain.Node{}}
	for _, n := range sg.Nodes {
		for _, sid := range n.SliceIDs {
			if sid == sl.ID {
				detail.Nodes = append(detail.Nodes, n)
				break
			}
		}
	}
	return detail, nil
}

// RenameSlice edits name and/or description (PG only — the slice UUID is
// stable, nothing in Neo4j references the name). Absent fields keep the
// current values.
func (s *SliceService) RenameSlice(ctx context.Context, graphID, name string, newName, description *string) (domain.Slice, error) {
	if _, err := s.graphs.GetGraph(ctx, graphID); err != nil {
		return domain.Slice{}, err
	}
	current, err := s.slices.GetSliceByName(ctx, graphID, name)
	if err != nil {
		return domain.Slice{}, err
	}
	resolvedName, resolvedDesc := current.Name, current.Description
	if newName != nil {
		resolvedName = *newName
	}
	if description != nil {
		resolvedDesc = *description
	}
	if strings.TrimSpace(resolvedName) == "" {
		return domain.Slice{}, ErrInvalidInput
	}
	return s.slices.RenameSlice(ctx, graphID, name, resolvedName, resolvedDesc)
}

// DeleteSlice removes the PG row, then sweeps the sid from the graph's
// elements best-effort: a sweep failure is swallowed (leftovers are inert
// garbage — the slices list comes from Postgres).
func (s *SliceService) DeleteSlice(ctx context.Context, graphID, name string) error {
	if _, err := s.graphs.GetGraph(ctx, graphID); err != nil {
		return err
	}
	sl, err := s.slices.GetSliceByName(ctx, graphID, name)
	if err != nil {
		return err
	}
	if err := s.slices.DeleteSlice(ctx, graphID, name); err != nil {
		return err
	}
	_ = s.membership.SweepSlice(ctx, graphID, sl.ID)
	return nil
}

// AddSliceNodes adds node ids to the slice (idempotent, unknown ids skipped)
// and returns the member count after the op.
func (s *SliceService) AddSliceNodes(ctx context.Context, graphID, name string, ids []string) (int, error) {
	sl, err := s.resolveSlice(ctx, graphID, name)
	if err != nil {
		return 0, err
	}
	return s.membership.AddToSlice(ctx, graphID, sl.ID, ids)
}

// RemoveSliceNodes removes node ids from the slice (idempotent) and returns
// the member count after the op.
func (s *SliceService) RemoveSliceNodes(ctx context.Context, graphID, name string, ids []string) (int, error) {
	sl, err := s.resolveSlice(ctx, graphID, name)
	if err != nil {
		return 0, err
	}
	return s.membership.RemoveFromSlice(ctx, graphID, sl.ID, ids)
}

func (s *SliceService) resolveSlice(ctx context.Context, graphID, name string) (domain.Slice, error) {
	if _, err := s.graphs.GetGraph(ctx, graphID); err != nil {
		return domain.Slice{}, err
	}
	return s.slices.GetSliceByName(ctx, graphID, name)
}
