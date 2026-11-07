package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/aeig/backend/internal/domain"
	"github.com/aeig/backend/internal/service"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type stubVizAPI struct {
	def         domain.Visualization
	defErr      error
	defCalls    int
	gotDefID    string
	byName      domain.Visualization
	getErr      error
	gotName     string
	saved       domain.Visualization
	saveErr     error
	saveCalls   int
	gotPosLen   int
	gotTypes    []string
	gotEdge     []string
	gotHide     bool
	gotGraphVer *int64
	gotNodes    []byte
	gotEdges    []byte
	gotBends    []byte
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

func (s *stubVizAPI) SaveVisualization(_ context.Context, _, name string, p map[string]domain.Position, _ domain.Viewport, nodeTypes, edgeTypes []string, hideOrphans bool, graphVersion *int64, nodes, edges, bends []byte) (domain.Visualization, error) {
	s.saveCalls++
	s.gotName = name
	s.gotPosLen = len(p)
	s.gotTypes = nodeTypes
	s.gotEdge = edgeTypes
	s.gotHide = hideOrphans
	s.gotGraphVer = graphVersion
	s.gotNodes = nodes
	s.gotEdges = edges
	s.gotBends = bends
	if s.saveErr != nil {
		return domain.Visualization{}, s.saveErr
	}
	return s.saved, nil
}

func routerWithVisualizations(v VisualizationAPI) http.Handler {
	return NewRouter(Deps{Graphs: &stubAPI{}, Visualizations: v})
}

func TestGetDefaultVisualization_200(t *testing.T) {
	v := &stubVizAPI{def: domain.Visualization{ID: "d1", GraphID: "g1", Name: "default", IsDefault: true, GraphVersion: 12}}
	rec := doReq(t, routerWithVisualizations(v), http.MethodGet, "/graphs/g1/visualizations/default", "")
	require.Equal(t, http.StatusOK, rec.Code)
	var out domain.Visualization
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &out))
	assert.Equal(t, "d1", out.ID)
	assert.True(t, out.IsDefault)
	assert.EqualValues(t, 12, out.GraphVersion)
	// the response JSON carries the binding fields
	assert.Contains(t, rec.Body.String(), `"graphVersion":12`)
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

func TestPutVisualization_ManifestFields_201(t *testing.T) {
	v := &stubVizAPI{saved: domain.Visualization{ID: "v1", Name: "mine"}}
	body := `{"positions":{},"viewport":{"x":0,"y":0,"zoom":1},` +
		`"graphVersion":7,` +
		`"nodes":{"n1":{"type":"service","label":"S","x":1,"y":2}},` +
		`"edges":{"e1":{"type":"rel","source":"n1","target":"n2"}}}`
	rec := doReq(t, routerWithVisualizations(v), http.MethodPut, "/graphs/g1/visualizations/mine", body)
	require.Equal(t, http.StatusCreated, rec.Code)
	require.NotNil(t, v.gotGraphVer)
	assert.EqualValues(t, 7, *v.gotGraphVer)
	assert.JSONEq(t, `{"n1":{"type":"service","label":"S","x":1,"y":2}}`, string(v.gotNodes))
	assert.JSONEq(t, `{"e1":{"type":"rel","source":"n1","target":"n2"}}`, string(v.gotEdges))
}

func TestPutVisualization_OptionalFieldsAbsent_201(t *testing.T) {
	v := &stubVizAPI{saved: domain.Visualization{ID: "v1"}}
	body := `{"positions":{},"viewport":{"x":0,"y":0,"zoom":1}}`
	rec := doReq(t, routerWithVisualizations(v), http.MethodPut, "/graphs/g1/visualizations/mine", body)
	require.Equal(t, http.StatusCreated, rec.Code)
	assert.Nil(t, v.gotTypes)
	assert.Nil(t, v.gotEdge)
	assert.False(t, v.gotHide)
	// manifest binding absent → forwarded as nil (leave unchanged)
	assert.Nil(t, v.gotGraphVer)
	assert.Nil(t, v.gotNodes)
	assert.Nil(t, v.gotEdges)
	assert.Nil(t, v.gotBends)
}

func TestPutVisualization_BendsField_201(t *testing.T) {
	v := &stubVizAPI{saved: domain.Visualization{ID: "v1", Name: "mine"}}
	body := `{"positions":{},"viewport":{"x":0,"y":0,"zoom":1},` +
		`"bends":{"e1":{"dx":30,"dy":10},"e2":{"dx":0,"dy":-60}}}`
	rec := doReq(t, routerWithVisualizations(v), http.MethodPut, "/graphs/g1/visualizations/mine", body)
	require.Equal(t, http.StatusCreated, rec.Code)
	assert.JSONEq(t, `{"e1":{"dx":30,"dy":10},"e2":{"dx":0,"dy":-60}}`, string(v.gotBends))
}

func TestPutVisualization_BendsInResponse_201(t *testing.T) {
	// the PUT response echoes the stored bends map
	bends := map[string]domain.Bend{"e1": {Dx: 30, Dy: 10}, "e2": {Dx: 0, Dy: -60}}
	v := &stubVizAPI{saved: domain.Visualization{ID: "v1", Name: "mine", Bends: &bends}}
	rec := doReq(t, routerWithVisualizations(v), http.MethodPut, "/graphs/g1/visualizations/mine", `{"positions":{}}`)
	require.Equal(t, http.StatusCreated, rec.Code)
	var out domain.Visualization
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &out))
	require.NotNil(t, out.Bends)
	assert.Equal(t, bends, *out.Bends)
	assert.Contains(t, rec.Body.String(), `"bends":{"e1":{"dx":30,"dy":10},"e2":{"dx":0,"dy":-60}}`)
}

func TestGetVisualization_BendsInResponse_200(t *testing.T) {
	bends := map[string]domain.Bend{"e7": {Dx: -5, Dy: 12}}
	v := &stubVizAPI{byName: domain.Visualization{ID: "v1", Name: "mine", Bends: &bends}}
	rec := doReq(t, routerWithVisualizations(v), http.MethodGet, "/graphs/g1/visualizations/mine", "")
	require.Equal(t, http.StatusOK, rec.Code)
	var out domain.Visualization
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &out))
	require.NotNil(t, out.Bends)
	assert.Equal(t, bends, *out.Bends)
}

func TestPutVisualization_DefaultName_201(t *testing.T) {
	v := &stubVizAPI{saved: domain.Visualization{ID: "d1", Name: "default"}}
	rec := doReq(t, routerWithVisualizations(v), http.MethodPut, "/graphs/g1/visualizations/default", `{"positions":{}}`)
	require.Equal(t, http.StatusCreated, rec.Code)
	assert.Equal(t, "default", v.gotName)
	assert.Equal(t, 1, v.saveCalls) // "default" is no longer reserved
}

func TestPutVisualization_BodyTooLarge_400(t *testing.T) {
	v := &stubVizAPI{saved: domain.Visualization{ID: "v1"}}
	// valid JSON, just over the 1 MB guard (positions+manifests grow with graph size)
	big := `{"positions":{},"nodeTypes":["` + strings.Repeat("a", 1<<20) + `"]}`
	rec := doReq(t, routerWithVisualizations(v), http.MethodPut, "/graphs/g1/visualizations/mine", big)
	assert.Equal(t, http.StatusBadRequest, rec.Code)
	assert.Equal(t, 0, v.saveCalls) // rejected before reaching the service
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
