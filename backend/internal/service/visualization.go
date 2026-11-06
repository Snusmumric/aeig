package service

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/aeig/backend/internal/domain"
)

// VisualizationStore is the storage contract for visualizations
// (implemented by postgres.VisualizationRepo).
type VisualizationStore interface {
	SaveVisualization(ctx context.Context, graphID, name string, positions map[string]domain.Position, vp domain.Viewport, nodeTypes, edgeTypes []string, hideOrphans bool, graphVersion *int64, nodes, edges []byte) (domain.Visualization, error)
	GetVisualizationByName(ctx context.Context, graphID, name string) (domain.Visualization, error)
	GetDefaultVisualization(ctx context.Context, graphID string) (domain.Visualization, error)
	TryCreateDefaultVisualization(ctx context.Context, graphID string) (domain.Visualization, bool, error)
}

type GraphExistence interface {
	GetGraph(ctx context.Context, id string) (domain.Graph, error)
}

type VisualizationService struct {
	store  VisualizationStore
	graphs GraphExistence
}

func NewVisualizationService(store VisualizationStore, graphs GraphExistence) *VisualizationService {
	return &VisualizationService{
		store:  store,
		graphs: graphs,
	}
}

// GetDefaultVisualization resolves the graph's default visualization,
// lazily creating it under the fixed name "default" on first open.
// Single-shot: TryCreate → created: return; not created: the store already
// re-selected the existing default (race lost) and returned it. An
// ErrNotFound from that re-SELECT means no default exists even after the
// insert attempt (a concurrent delete) — surfaced as a plain server error,
// never a 404.
func (s *VisualizationService) GetDefaultVisualization(ctx context.Context, graphID string) (domain.Visualization, error) {
	if _, err := s.graphs.GetGraph(ctx, graphID); err != nil {
		return domain.Visualization{}, err
	}
	v, _, err := s.store.TryCreateDefaultVisualization(ctx, graphID)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return domain.Visualization{}, fmt.Errorf("default visualization for graph %s: create raced and no default exists", graphID)
		}
		return domain.Visualization{}, err
	}
	return v, nil
}

func (s *VisualizationService) GetVisualization(ctx context.Context, graphID, name string) (domain.Visualization, error) {
	return s.store.GetVisualizationByName(ctx, graphID, name)
}

// SaveVisualization upserts a named visualization. "default" is the default's
// own name (autosave of the default writes under it) and is legal here; only
// blank names are rejected. The manifest binding (graphVersion/nodes/edges)
// is passed through opaquely: nil = leave the stored values unchanged.
func (s *VisualizationService) SaveVisualization(ctx context.Context, graphID, name string, positions map[string]domain.Position, vp domain.Viewport, nodeTypes, edgeTypes []string, hideOrphans bool, graphVersion *int64, nodes, edges []byte) (domain.Visualization, error) {
	if strings.TrimSpace(name) == "" {
		return domain.Visualization{}, ErrInvalidInput
	}
	if _, err := s.graphs.GetGraph(ctx, graphID); err != nil {
		return domain.Visualization{}, err
	}
	if positions == nil {
		positions = map[string]domain.Position{}
	}
	return s.store.SaveVisualization(ctx, graphID, name, positions, vp, nodeTypes, edgeTypes, hideOrphans, graphVersion, nodes, edges)
}
