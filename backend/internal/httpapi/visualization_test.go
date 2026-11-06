package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/aeig/backend/internal/domain"
	"github.com/aeig/backend/internal/service"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type stubVizAPI struct {
	def       domain.Visualization
	defErr    error
	defCalls  int
	gotDefID  string
	byName    domain.Visualization
	getErr    error
	gotName   string
	saved     domain.Visualization
	saveErr   error
	saveCalls int
	gotPosLen int
	gotTypes  []string
	gotEdge   []string
	gotHide   bool
}

func (s *stubVizAPI) GetDefaultVisualization(_ context.Context, graphID string) (domain.Visualization, error) {
	s.defCalls++
	s.gotDefID = graphID
	if s.defErr != nil {
		return domain.Visualization{}, s.defErr
	}
	return s.def, nil
}

func (s *stubVizAPI) GetVisualization(_ context.Context, _, name string) (domain.Visualization, error) {
	s.gotName = name
	return s.byName, s.getErr
}

func (s *stubVizAPI) SaveVisualization(_ context.Context, _, name string, p map[string]domain.Position, _ domain.Viewport, nodeTypes, edgeTypes []string, hideOrphans bool) (domain.Visualization, error) {
	s.saveCalls++
	s.gotName = name
	s.gotPosLen = len(p)
	s.gotTypes = nodeTypes
	s.gotEdge = edgeTypes
	s.gotHide = hideOrphans
	if s.saveErr != nil {
		return domain.Visualization{}, s.saveErr
	}
	return s.saved, nil
}

func routerWithVisualizations(v VisualizationAPI) http.Handler {
	return NewRouter(Deps{Graphs: &stubAPI{}, Visualizations: v})
}

func TestGetDefaultVisualization_200(t *testing.T) {
	v := &stubVizAPI{def: domain.Visualization{ID: "d1", GraphID: "g1", Name: "quiet-otter-42", IsDefault: true}}
	rec := doReq(t, routerWithVisualizations(v), http.MethodGet, "/graphs/g1/visualizations/default", "")
	require.Equal(t, http.StatusOK, rec.Code)
	var out domain.Visualization
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &out))
	assert.Equal(t, "d1", out.ID)
	assert.True(t, out.IsDefault)
	assert.Equal(t, 1, v.defCalls)
	assert.Equal(t, "g1", v.gotDefID)
}

func TestGetVisualization_200(t *testing.T) {
	v := &stubVizAPI{byName: domain.Visualization{ID: "v1", Name: "mine"}}
	rec := doReq(t, routerWithVisualizations(v), http.MethodGet, "/graphs/g1/visualizations/mine", "")
	require.Equal(t, http.StatusOK, rec.Code)
	var out domain.Visualization
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &out))
	assert.Equal(t, "v1", out.ID)
	assert.Equal(t, "mine", v.gotName)
}

func TestGetVisualization_404(t *testing.T) {
	v := &stubVizAPI{getErr: domain.ErrNotFound}
	rec := doReq(t, routerWithVisualizations(v), http.MethodGet, "/graphs/g1/visualizations/missing", "")
	assert.Equal(t, http.StatusNotFound, rec.Code)
}

func TestPutVisualization_201(t *testing.T) {
	v := &stubVizAPI{saved: domain.Visualization{ID: "v1", Name: "mine"}}
	body := `{"positions":{"n1":{"x":10,"y":20}},"viewport":{"x":0,"y":0,"zoom":1},"nodeTypes":["service"],"edgeTypes":["rel"],"hideOrphans":true}`
	rec := doReq(t, routerWithVisualizations(v), http.MethodPut, "/graphs/g1/visualizations/mine", body)
	require.Equal(t, http.StatusCreated, rec.Code)
	assert.Equal(t, "mine", v.gotName)
	assert.Equal(t, 1, v.gotPosLen)
	assert.Equal(t, []string{"service"}, v.gotTypes)
	assert.Equal(t, []string{"rel"}, v.gotEdge)
	assert.True(t, v.gotHide)
}

func TestPutVisualization_OptionalFieldsAbsent_201(t *testing.T) {
	v := &stubVizAPI{saved: domain.Visualization{ID: "v1"}}
	body := `{"positions":{},"viewport":{"x":0,"y":0,"zoom":1}}`
	rec := doReq(t, routerWithVisualizations(v), http.MethodPut, "/graphs/g1/visualizations/mine", body)
	require.Equal(t, http.StatusCreated, rec.Code)
	assert.Nil(t, v.gotTypes)
	assert.Nil(t, v.gotEdge)
	assert.False(t, v.gotHide)
}

func TestPutVisualization_ReservedName_400(t *testing.T) {
	v := &stubVizAPI{}
	rec := doReq(t, routerWithVisualizations(v), http.MethodPut, "/graphs/g1/visualizations/default", `{"positions":{}}`)
	assert.Equal(t, http.StatusBadRequest, rec.Code)
	assert.Equal(t, 0, v.saveCalls)
}

func TestPutVisualization_400OnInvalid(t *testing.T) {
	v := &stubVizAPI{saveErr: service.ErrInvalidInput}
	rec := doReq(t, routerWithVisualizations(v), http.MethodPut, "/graphs/g1/visualizations/mine", `{"positions":{}}`)
	assert.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestOldLayoutsRoutes_Gone(t *testing.T) {
	h := routerWithVisualizations(&stubVizAPI{})
	assert.Equal(t, http.StatusNotFound, doReq(t, h, http.MethodGet, "/graphs/g1/layouts", "").Code)
	assert.Equal(t, http.StatusNotFound, doReq(t, h, http.MethodPost, "/graphs/g1/layouts", `{"name":"x"}`).Code)
	assert.Equal(t, http.StatusNotFound, doReq(t, h, http.MethodGet, "/graphs/g1/layouts/x", "").Code)
}
