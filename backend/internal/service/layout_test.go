package service

import (
	"context"
	"testing"

	"github.com/aeig/backend/internal/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type stubLayoutStore struct {
	saved  domain.Layout
	list   []domain.Layout
	byName domain.Layout
	getErr error
}

func (s *stubLayoutStore) SaveLayout(_ context.Context, graphID, name string, p map[string]domain.Position, vp domain.Viewport, _ []string) (domain.Layout, error) {
	s.saved = domain.Layout{ID: "l1", GraphID: graphID, Name: name, Positions: p, Viewport: vp}
	return s.saved, nil
}
func (s *stubLayoutStore) ListLayouts(_ context.Context, _ string) ([]domain.Layout, error) {
	return s.list, nil
}
func (s *stubLayoutStore) GetLayoutByName(_ context.Context, _, _ string) (domain.Layout, error) {
	return s.byName, s.getErr
}

type stubGraphExistence struct{ err error }

func (s *stubGraphExistence) GetGraph(_ context.Context, _ string) (domain.Graph, error) {
	return domain.Graph{ID: "g1"}, s.err
}

func TestLayoutService_SaveEmptyName(t *testing.T) {
	svc := NewLayoutService(&stubLayoutStore{}, &stubGraphExistence{})
	_, err := svc.SaveLayout(context.Background(), "g1", " ", nil, domain.Viewport{}, nil)
	assert.ErrorIs(t, err, ErrInvalidInput)
}

func TestLayoutService_SaveUnknownGraph(t *testing.T) {
	svc := NewLayoutService(&stubLayoutStore{}, &stubGraphExistence{err: domain.ErrNotFound})
	_, err := svc.SaveLayout(context.Background(), "gX", "default", nil, domain.Viewport{}, nil)
	assert.ErrorIs(t, err, domain.ErrNotFound)
}

func TestLayoutService_SaveOK(t *testing.T) {
	store := &stubLayoutStore{}
	svc := NewLayoutService(store, &stubGraphExistence{})
	l, err := svc.SaveLayout(context.Background(), "g1", "default",
		map[string]domain.Position{"n1": {X: 1, Y: 2}}, domain.Viewport{Zoom: 1}, nil)
	require.NoError(t, err)
	assert.Equal(t, "default", l.Name)
	assert.EqualValues(t, 1, store.saved.Positions["n1"].X)
}
