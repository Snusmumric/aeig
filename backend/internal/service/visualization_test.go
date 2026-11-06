package service

import (
	"context"
	"math/rand"
	"regexp"
	"testing"

	"github.com/aeig/backend/internal/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type tryResult struct {
	v       domain.Visualization
	created bool
	err     error
}

type stubVizStore struct {
	saved     domain.Visualization
	byName    domain.Visualization
	getErr    error
	gotTypes  []string
	gotEdge   []string
	gotHide   bool
	saveCalls int
	tryScript []tryResult
	tryCalls  int
	tryNames  []string
}

func (s *stubVizStore) SaveVisualization(_ context.Context, graphID, name string, p map[string]domain.Position, vp domain.Viewport, nodeTypes, edgeTypes []string, hideOrphans bool) (domain.Visualization, error) {
	s.saveCalls++
	s.saved = domain.Visualization{ID: "v1", GraphID: graphID, Name: name, Positions: p, Viewport: vp}
	s.gotTypes = nodeTypes
	s.gotEdge = edgeTypes
	s.gotHide = hideOrphans
	return s.saved, nil
}

func (s *stubVizStore) GetVisualizationByName(_ context.Context, _, _ string) (domain.Visualization, error) {
	return s.byName, s.getErr
}

func (s *stubVizStore) GetDefaultVisualization(_ context.Context, _ string) (domain.Visualization, error) {
	return s.byName, s.getErr
}

func (s *stubVizStore) TryCreateDefaultVisualization(_ context.Context, _, name string) (domain.Visualization, bool, error) {
	s.tryCalls++
	s.tryNames = append(s.tryNames, name)
	if s.tryCalls <= len(s.tryScript) {
		r := s.tryScript[s.tryCalls-1]
		return r.v, r.created, r.err
	}
	return domain.Visualization{}, false, domain.ErrNotFound
}

type stubGraphExistence struct{ err error }

func (s *stubGraphExistence) GetGraph(_ context.Context, _ string) (domain.Graph, error) {
	return domain.Graph{ID: "g1"}, s.err
}

func TestNamegen_Format(t *testing.T) {
	re := regexp.MustCompile(`^[a-z]+-[a-z]+-[0-9]{2}$`)
	for i := 0; i < 200; i++ {
		assert.Regexp(t, re, NewVizName(rand.New(rand.NewSource(int64(i)))))
	}
	// deterministic with a seeded rand
	assert.Equal(t,
		NewVizName(rand.New(rand.NewSource(42))),
		NewVizName(rand.New(rand.NewSource(42))))
}

func TestGetDefault_Creates(t *testing.T) {
	store := &stubVizStore{tryScript: []tryResult{
		{v: domain.Visualization{ID: "d1", Name: "quiet-otter-42", IsDefault: true}, created: true},
	}}
	svc := NewVisualizationService(store, &stubGraphExistence{})
	v, err := svc.GetDefaultVisualization(context.Background(), "g1")
	require.NoError(t, err)
	assert.Equal(t, "d1", v.ID)
	assert.True(t, v.IsDefault)
	assert.Equal(t, 1, store.tryCalls)
}

func TestGetDefault_RaceLost(t *testing.T) {
	store := &stubVizStore{tryScript: []tryResult{
		{v: domain.Visualization{ID: "d1", Name: "loud-lynx-07", IsDefault: true}, created: false},
	}}
	svc := NewVisualizationService(store, &stubGraphExistence{})
	v, err := svc.GetDefaultVisualization(context.Background(), "g1")
	require.NoError(t, err)
	assert.Equal(t, "d1", v.ID)
	assert.Equal(t, 1, store.tryCalls) // no retry: the existing default is returned
}

func TestGetDefault_NameCollisionRetries(t *testing.T) {
	store := &stubVizStore{tryScript: []tryResult{
		{err: domain.ErrNotFound}, // candidate name collided with a non-default row
		{err: domain.ErrNotFound},
		{v: domain.Visualization{ID: "d3", IsDefault: true}, created: true},
	}}
	svc := NewVisualizationService(store, &stubGraphExistence{})
	v, err := svc.GetDefaultVisualization(context.Background(), "g1")
	require.NoError(t, err)
	assert.Equal(t, "d3", v.ID)
	assert.Equal(t, 3, store.tryCalls)
}

func TestGetDefault_Exhausted(t *testing.T) {
	store := &stubVizStore{} // every Try returns ErrNotFound
	svc := NewVisualizationService(store, &stubGraphExistence{})
	_, err := svc.GetDefaultVisualization(context.Background(), "g1")
	require.Error(t, err)
	assert.Equal(t, 5, store.tryCalls)
	// exhaustion is a server failure (500), never surfaced as a missing graph (404)
	assert.NotErrorIs(t, err, domain.ErrNotFound)
}

func TestGetDefault_UnknownGraph(t *testing.T) {
	svc := NewVisualizationService(&stubVizStore{}, &stubGraphExistence{err: domain.ErrNotFound})
	_, err := svc.GetDefaultVisualization(context.Background(), "gX")
	assert.ErrorIs(t, err, domain.ErrNotFound)
}

func TestSave_ReservedName(t *testing.T) {
	store := &stubVizStore{}
	svc := NewVisualizationService(store, &stubGraphExistence{})
	_, err := svc.SaveVisualization(context.Background(), "g1", "default", nil, domain.Viewport{}, nil, nil, false)
	assert.ErrorIs(t, err, ErrInvalidInput)
	assert.Equal(t, 0, store.saveCalls)
}

func TestVisualizationService_SaveEmptyName(t *testing.T) {
	svc := NewVisualizationService(&stubVizStore{}, &stubGraphExistence{})
	_, err := svc.SaveVisualization(context.Background(), "g1", " ", nil, domain.Viewport{}, nil, nil, false)
	assert.ErrorIs(t, err, ErrInvalidInput)
}

func TestVisualizationService_SaveUnknownGraph(t *testing.T) {
	svc := NewVisualizationService(&stubVizStore{}, &stubGraphExistence{err: domain.ErrNotFound})
	_, err := svc.SaveVisualization(context.Background(), "gX", "v", nil, domain.Viewport{}, nil, nil, false)
	assert.ErrorIs(t, err, domain.ErrNotFound)
}

func TestVisualizationService_SaveOK(t *testing.T) {
	store := &stubVizStore{}
	svc := NewVisualizationService(store, &stubGraphExistence{})
	v, err := svc.SaveVisualization(context.Background(), "g1", "mine",
		map[string]domain.Position{"n1": {X: 1, Y: 2}}, domain.Viewport{Zoom: 1}, nil, nil, false)
	require.NoError(t, err)
	assert.Equal(t, "mine", v.Name)
	assert.EqualValues(t, 1, store.saved.Positions["n1"].X)
}

func TestVisualizationService_SavePassesFilters(t *testing.T) {
	store := &stubVizStore{}
	svc := NewVisualizationService(store, &stubGraphExistence{})
	_, err := svc.SaveVisualization(context.Background(), "g1", "mine", nil, domain.Viewport{}, []string{"phase"}, []string{"rel"}, true)
	require.NoError(t, err)
	assert.Equal(t, []string{"phase"}, store.gotTypes)
	assert.Equal(t, []string{"rel"}, store.gotEdge)
	assert.True(t, store.gotHide)
}
