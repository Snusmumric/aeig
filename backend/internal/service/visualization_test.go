package service

import (
	"context"
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
	saved       domain.Visualization
	byName      domain.Visualization
	getErr      error
	gotTypes    []string
	gotEdge     []string
	gotHide     bool
	gotGraphVer *int64
	gotNodes    []byte
	gotEdges    []byte
	gotBends    []byte
	saveCalls   int
	tryScript   []tryResult
	tryCalls    int
}

func (s *stubVizStore) SaveVisualization(_ context.Context, graphID, name string, p map[string]domain.Position, vp domain.Viewport, nodeTypes, edgeTypes []string, hideOrphans bool, graphVersion *int64, nodes, edges, bends []byte) (domain.Visualization, error) {
	s.saveCalls++
	s.saved = domain.Visualization{ID: "v1", GraphID: graphID, Name: name, Positions: p, Viewport: vp}
	s.gotTypes = nodeTypes
	s.gotEdge = edgeTypes
	s.gotHide = hideOrphans
	s.gotGraphVer = graphVersion
	s.gotNodes = nodes
	s.gotEdges = edges
	s.gotBends = bends
	return s.saved, nil
}

func (s *stubVizStore) GetVisualizationByName(_ context.Context, _, _ string) (domain.Visualization, error) {
	return s.byName, s.getErr
}

func (s *stubVizStore) GetDefaultVisualization(_ context.Context, _ string) (domain.Visualization, error) {
	return s.byName, s.getErr
}

func (s *stubVizStore) TryCreateDefaultVisualization(_ context.Context, _ string) (domain.Visualization, bool, error) {
	s.tryCalls++
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

func TestGetDefault_Creates(t *testing.T) {
	store := &stubVizStore{tryScript: []tryResult{
		{v: domain.Visualization{ID: "d1", Name: "default", IsDefault: true}, created: true},
	}}
	svc := NewVisualizationService(store, &stubGraphExistence{})
	v, err := svc.GetDefaultVisualization(context.Background(), "g1")
	require.NoError(t, err)
	assert.Equal(t, "d1", v.ID)
	assert.Equal(t, "default", v.Name)
	assert.True(t, v.IsDefault)
	assert.Equal(t, 1, store.tryCalls)
}

func TestGetDefault_RaceLost(t *testing.T) {
	store := &stubVizStore{tryScript: []tryResult{
		{v: domain.Visualization{ID: "d1", Name: "default", IsDefault: true}, created: false},
	}}
	svc := NewVisualizationService(store, &stubGraphExistence{})
	v, err := svc.GetDefaultVisualization(context.Background(), "g1")
	require.NoError(t, err)
	assert.Equal(t, "d1", v.ID)
	assert.Equal(t, 1, store.tryCalls) // single shot: the existing default is returned
}

func TestGetDefault_ReSelectNone(t *testing.T) {
	store := &stubVizStore{tryScript: []tryResult{
		{err: domain.ErrNotFound}, // create raced AND the re-SELECT found no default
	}}
	svc := NewVisualizationService(store, &stubGraphExistence{})
	_, err := svc.GetDefaultVisualization(context.Background(), "g1")
	require.Error(t, err)
	// a server failure (500), never surfaced as a missing graph (404)
	assert.NotErrorIs(t, err, domain.ErrNotFound)
	assert.Equal(t, 1, store.tryCalls)
}

func TestGetDefault_UnknownGraph(t *testing.T) {
	svc := NewVisualizationService(&stubVizStore{}, &stubGraphExistence{err: domain.ErrNotFound})
	_, err := svc.GetDefaultVisualization(context.Background(), "gX")
	assert.ErrorIs(t, err, domain.ErrNotFound)
}

func TestSave_DefaultNameAllowed(t *testing.T) {
	store := &stubVizStore{}
	svc := NewVisualizationService(store, &stubGraphExistence{})
	v, err := svc.SaveVisualization(context.Background(), "g1", "default", nil, domain.Viewport{}, nil, nil, false, nil, nil, nil, nil)
	require.NoError(t, err)
	assert.Equal(t, "default", v.Name)
	assert.Equal(t, 1, store.saveCalls) // no reserved-name rejection: it is the default's own name
}

func TestVisualizationService_SaveEmptyName(t *testing.T) {
	svc := NewVisualizationService(&stubVizStore{}, &stubGraphExistence{})
	_, err := svc.SaveVisualization(context.Background(), "g1", " ", nil, domain.Viewport{}, nil, nil, false, nil, nil, nil, nil)
	assert.ErrorIs(t, err, ErrInvalidInput)
}

func TestVisualizationService_SaveUnknownGraph(t *testing.T) {
	svc := NewVisualizationService(&stubVizStore{}, &stubGraphExistence{err: domain.ErrNotFound})
	_, err := svc.SaveVisualization(context.Background(), "gX", "v", nil, domain.Viewport{}, nil, nil, false, nil, nil, nil, nil)
	assert.ErrorIs(t, err, domain.ErrNotFound)
}

func TestVisualizationService_SaveOK(t *testing.T) {
	store := &stubVizStore{}
	svc := NewVisualizationService(store, &stubGraphExistence{})
	v, err := svc.SaveVisualization(context.Background(), "g1", "mine",
		map[string]domain.Position{"n1": {X: 1, Y: 2}}, domain.Viewport{Zoom: 1}, nil, nil, false, nil, nil, nil, nil)
	require.NoError(t, err)
	assert.Equal(t, "mine", v.Name)
	assert.EqualValues(t, 1, store.saved.Positions["n1"].X)
}

func TestVisualizationService_SavePassesFilters(t *testing.T) {
	store := &stubVizStore{}
	svc := NewVisualizationService(store, &stubGraphExistence{})
	_, err := svc.SaveVisualization(context.Background(), "g1", "mine", nil, domain.Viewport{}, []string{"phase"}, []string{"rel"}, true, nil, nil, nil, nil)
	require.NoError(t, err)
	assert.Equal(t, []string{"phase"}, store.gotTypes)
	assert.Equal(t, []string{"rel"}, store.gotEdge)
	assert.True(t, store.gotHide)
}

func TestVisualizationService_SavePassesManifestVerbatim(t *testing.T) {
	store := &stubVizStore{}
	svc := NewVisualizationService(store, &stubGraphExistence{})
	gv := int64(12)
	nodes := []byte(`{"n1":{"type":"service","label":"S","x":1,"y":2}}`)
	edges := []byte(`{"e1":{"type":"rel","source":"n1","target":"n2"}}`)
	_, err := svc.SaveVisualization(context.Background(), "g1", "mine", nil, domain.Viewport{}, nil, nil, false, &gv, nodes, edges, nil)
	require.NoError(t, err)
	require.NotNil(t, store.gotGraphVer)
	assert.EqualValues(t, 12, *store.gotGraphVer)
	assert.Equal(t, nodes, store.gotNodes) // opaque bytes, forwarded verbatim
	assert.Equal(t, edges, store.gotEdges)
}

func TestVisualizationService_SavePassesBendsVerbatim(t *testing.T) {
	store := &stubVizStore{}
	svc := NewVisualizationService(store, &stubGraphExistence{})
	bends := []byte(`{"e1":{"dx":30,"dy":10},"e2":{"dx":0,"dy":-60}}`)
	_, err := svc.SaveVisualization(context.Background(), "g1", "mine", nil, domain.Viewport{}, nil, nil, false, nil, nil, nil, bends)
	require.NoError(t, err)
	assert.Equal(t, bends, store.gotBends) // opaque bytes, forwarded verbatim
}
