package service

import (
	"context"
	"errors"
	"fmt"
	"math/rand"
	"strings"
	"sync"
	"time"

	"github.com/aeig/backend/internal/domain"
)

// VisualizationStore is the storage contract for visualizations
// (implemented by postgres.VisualizationRepo).
type VisualizationStore interface {
	SaveVisualization(ctx context.Context, graphID, name string, positions map[string]domain.Position, vp domain.Viewport, nodeTypes, edgeTypes []string, hideOrphans bool) (domain.Visualization, error)
	GetVisualizationByName(ctx context.Context, graphID, name string) (domain.Visualization, error)
	GetDefaultVisualization(ctx context.Context, graphID string) (domain.Visualization, error)
	TryCreateDefaultVisualization(ctx context.Context, graphID, name string) (domain.Visualization, bool, error)
}

type GraphExistence interface {
	GetGraph(ctx context.Context, id string) (domain.Graph, error)
}

// maxDefaultNameAttempts bounds the random-name retry loop when every
// candidate collides with an existing non-default row.
const maxDefaultNameAttempts = 5

type VisualizationService struct {
	store  VisualizationStore
	graphs GraphExistence

	mu  sync.Mutex
	rng *rand.Rand
}

func NewVisualizationService(store VisualizationStore, graphs GraphExistence) *VisualizationService {
	return &VisualizationService{
		store:  store,
		graphs: graphs,
		rng:    rand.New(rand.NewSource(time.Now().UnixNano())),
	}
}

func (s *VisualizationService) nextName() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return NewVizName(s.rng)
}

// GetDefaultVisualization resolves the graph's default visualization,
// lazily creating it with a random readable name on first open.
// Retry algorithm (spec, Builder check #1): TryCreate → created: return;
// not created + default found: return (race lost); not created +
// ErrNotFound: the candidate name collided with a non-default row → next
// candidate; after maxDefaultNameAttempts attempts → error.
func (s *VisualizationService) GetDefaultVisualization(ctx context.Context, graphID string) (domain.Visualization, error) {
	if _, err := s.graphs.GetGraph(ctx, graphID); err != nil {
		return domain.Visualization{}, err
	}
	for attempt := 0; attempt < maxDefaultNameAttempts; attempt++ {
		v, _, err := s.store.TryCreateDefaultVisualization(ctx, graphID, s.nextName())
		if err != nil {
			if errors.Is(err, domain.ErrNotFound) {
				continue // name collision with a non-default row: try another name
			}
			return domain.Visualization{}, err
		}
		return v, nil // created, or the race was lost and the existing default came back
	}
	return domain.Visualization{}, fmt.Errorf("default visualization for graph %s: no unique candidate name after %d attempts", graphID, maxDefaultNameAttempts)
}

func (s *VisualizationService) GetVisualization(ctx context.Context, graphID, name string) (domain.Visualization, error) {
	return s.store.GetVisualizationByName(ctx, graphID, name)
}

// SaveVisualization upserts a named visualization. The name "default" is
// reserved for the resolve-or-create route and rejected here.
func (s *VisualizationService) SaveVisualization(ctx context.Context, graphID, name string, positions map[string]domain.Position, vp domain.Viewport, nodeTypes, edgeTypes []string, hideOrphans bool) (domain.Visualization, error) {
	if strings.TrimSpace(name) == "" || name == "default" {
		return domain.Visualization{}, ErrInvalidInput
	}
	if _, err := s.graphs.GetGraph(ctx, graphID); err != nil {
		return domain.Visualization{}, err
	}
	if positions == nil {
		positions = map[string]domain.Position{}
	}
	return s.store.SaveVisualization(ctx, graphID, name, positions, vp, nodeTypes, edgeTypes, hideOrphans)
}
