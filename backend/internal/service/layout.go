package service

import (
	"context"
	"strings"

	"github.com/aeig/backend/internal/domain"
)

type LayoutStore interface {
	SaveLayout(ctx context.Context, graphID, name string, positions map[string]domain.Position, vp domain.Viewport, nodeTypes []string) (domain.Layout, error)
	ListLayouts(ctx context.Context, graphID string) ([]domain.Layout, error)
	GetLayoutByName(ctx context.Context, graphID, name string) (domain.Layout, error)
}

type GraphExistence interface {
	GetGraph(ctx context.Context, id string) (domain.Graph, error)
}

type LayoutService struct {
	store  LayoutStore
	graphs GraphExistence
}

func NewLayoutService(store LayoutStore, graphs GraphExistence) *LayoutService {
	return &LayoutService{store: store, graphs: graphs}
}

func (s *LayoutService) SaveLayout(ctx context.Context, graphID, name string, positions map[string]domain.Position, vp domain.Viewport, nodeTypes []string) (domain.Layout, error) {
	if strings.TrimSpace(name) == "" {
		return domain.Layout{}, ErrInvalidInput
	}
	if _, err := s.graphs.GetGraph(ctx, graphID); err != nil {
		return domain.Layout{}, err
	}
	if positions == nil {
		positions = map[string]domain.Position{}
	}
	return s.store.SaveLayout(ctx, graphID, name, positions, vp, nodeTypes)
}

func (s *LayoutService) ListLayouts(ctx context.Context, graphID string) ([]domain.Layout, error) {
	if _, err := s.graphs.GetGraph(ctx, graphID); err != nil {
		return nil, err
	}
	return s.store.ListLayouts(ctx, graphID)
}

func (s *LayoutService) GetLayout(ctx context.Context, graphID, name string) (domain.Layout, error) {
	return s.store.GetLayoutByName(ctx, graphID, name)
}
