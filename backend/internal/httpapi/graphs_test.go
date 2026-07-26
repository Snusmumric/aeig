package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/aeig/backend/internal/domain"
	"github.com/aeig/backend/internal/service"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type stubAPI struct {
	created     domain.Graph
	createErr   error
	graph       domain.Graph
	getErr      error
	sub         domain.Subgraph
	subErr      error
	version     int64
	applyErr    error
	gotBaseVer  int64
	gotMutation domain.Mutations
}

func (s *stubAPI) CreateGraph(_ context.Context, name string) (domain.Graph, error) {
	if s.createErr != nil {
		return domain.Graph{}, s.createErr
	}
	s.created.Name = name
	return s.created, nil
}
func (s *stubAPI) GetGraph(_ context.Context, _ string) (domain.Graph, error) {
	return s.graph, s.getErr
}
func (s *stubAPI) GetSubgraph(_ context.Context, _ string) (domain.Subgraph, error) {
	return s.sub, s.subErr
}
func (s *stubAPI) ApplyMutations(_ context.Context, _ string, base int64, m domain.Mutations) (int64, error) {
	s.gotBaseVer = base
	s.gotMutation = m
	return s.version, s.applyErr
}

func doReq(t *testing.T, h http.Handler, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, bytes.NewBufferString(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestCreateGraph_201(t *testing.T) {
	api := &stubAPI{created: domain.Graph{ID: "g1", Version: 1}}
	rec := doReq(t, NewRouter(Deps{Graphs: api}), http.MethodPost, "/graphs", `{"name":"demo"}`)
	require.Equal(t, http.StatusCreated, rec.Code)
	var g domain.Graph
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &g))
	assert.Equal(t, "g1", g.ID)
	assert.Equal(t, "demo", g.Name)
}

func TestCreateGraph_400OnInvalid(t *testing.T) {
	api := &stubAPI{createErr: service.ErrInvalidInput}
	rec := doReq(t, NewRouter(Deps{Graphs: api}), http.MethodPost, "/graphs", `{"name":""}`)
	assert.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestGetGraph_404(t *testing.T) {
	api := &stubAPI{getErr: domain.ErrNotFound}
	rec := doReq(t, NewRouter(Deps{Graphs: api}), http.MethodGet, "/graphs/x", "")
	assert.Equal(t, http.StatusNotFound, rec.Code)
}

func TestGetSubgraph_200(t *testing.T) {
	api := &stubAPI{sub: domain.Subgraph{Nodes: []domain.Node{{ID: "n1", Type: "Task"}}}}
	rec := doReq(t, NewRouter(Deps{Graphs: api}), http.MethodGet, "/graphs/g1/subgraph", "")
	require.Equal(t, http.StatusOK, rec.Code)
	var sg domain.Subgraph
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &sg))
	assert.Len(t, sg.Nodes, 1)
}

func TestApplyMutations_200(t *testing.T) {
	api := &stubAPI{version: 7}
	body := `{"baseVersion":6,"upsertNodes":[{"id":"n1","type":"Task","properties":{}}]}`
	rec := doReq(t, NewRouter(Deps{Graphs: api}), http.MethodPost, "/graphs/g1/mutations", body)
	require.Equal(t, http.StatusOK, rec.Code)
	var out map[string]int64
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &out))
	assert.Equal(t, int64(7), out["version"])
	assert.Equal(t, int64(6), api.gotBaseVer)
	assert.Len(t, api.gotMutation.UpsertNodes, 1)
}

func TestApplyMutations_409OnConflict(t *testing.T) {
	api := &stubAPI{applyErr: domain.ErrVersionConflict}
	rec := doReq(t, NewRouter(Deps{Graphs: api}), http.MethodPost, "/graphs/g1/mutations", `{"baseVersion":1}`)
	assert.Equal(t, http.StatusConflict, rec.Code)
}
