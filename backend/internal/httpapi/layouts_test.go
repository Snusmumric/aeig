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

type stubLayoutAPI struct {
	list      []domain.Layout
	saved     domain.Layout
	saveErr   error
	byName    domain.Layout
	getErr    error
	gotName   string
	gotPosLen int
	gotTypes  []string
}

func (s *stubLayoutAPI) ListLayouts(_ context.Context, _ string) ([]domain.Layout, error) {
	return s.list, nil
}
func (s *stubLayoutAPI) SaveLayout(_ context.Context, _ string, name string, p map[string]domain.Position, _ domain.Viewport, nodeTypes []string) (domain.Layout, error) {
	s.gotName = name
	s.gotPosLen = len(p)
	s.gotTypes = nodeTypes
	if s.saveErr != nil {
		return domain.Layout{}, s.saveErr
	}
	return s.saved, nil
}
func (s *stubLayoutAPI) GetLayout(_ context.Context, _, _ string) (domain.Layout, error) {
	return s.byName, s.getErr
}

func routerWithLayouts(l LayoutAPI) http.Handler {
	return NewRouter(Deps{Graphs: &stubAPI{}, Layouts: l})
}

func TestListLayouts_200(t *testing.T) {
	l := &stubLayoutAPI{list: []domain.Layout{{ID: "l1", Name: "default"}}}
	rec := doReq(t, routerWithLayouts(l), http.MethodGet, "/graphs/g1/layouts", "")
	require.Equal(t, http.StatusOK, rec.Code)
	var out []domain.Layout
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &out))
	assert.Len(t, out, 1)
}

func TestSaveLayout_201(t *testing.T) {
	l := &stubLayoutAPI{saved: domain.Layout{ID: "l1", Name: "default"}}
	body := `{"name":"default","positions":{"n1":{"x":10,"y":20}},"viewport":{"x":0,"y":0,"zoom":1}}`
	rec := doReq(t, routerWithLayouts(l), http.MethodPost, "/graphs/g1/layouts", body)
	require.Equal(t, http.StatusCreated, rec.Code)
	assert.Equal(t, "default", l.gotName)
	assert.Equal(t, 1, l.gotPosLen)
}

func TestSaveLayout_400OnInvalid(t *testing.T) {
	l := &stubLayoutAPI{saveErr: service.ErrInvalidInput}
	rec := doReq(t, routerWithLayouts(l), http.MethodPost, "/graphs/g1/layouts", `{"name":""}`)
	assert.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestSaveLayout_NodeTypes_201(t *testing.T) {
	l := &stubLayoutAPI{saved: domain.Layout{ID: "l1", Name: "default"}}
	body := `{"name":"default","nodeTypes":["service","domain"]}`
	rec := doReq(t, routerWithLayouts(l), http.MethodPost, "/graphs/g1/layouts", body)
	require.Equal(t, http.StatusCreated, rec.Code)
	assert.Equal(t, []string{"service", "domain"}, l.gotTypes)
}

func TestSaveLayout_NodeTypesAbsent_201(t *testing.T) {
	l := &stubLayoutAPI{saved: domain.Layout{ID: "l1", Name: "default"}}
	body := `{"name":"default"}`
	rec := doReq(t, routerWithLayouts(l), http.MethodPost, "/graphs/g1/layouts", body)
	require.Equal(t, http.StatusCreated, rec.Code)
	assert.Nil(t, l.gotTypes)
}

func TestGetLayout_404(t *testing.T) {
	l := &stubLayoutAPI{getErr: domain.ErrNotFound}
	rec := doReq(t, routerWithLayouts(l), http.MethodGet, "/graphs/g1/layouts/missing", "")
	assert.Equal(t, http.StatusNotFound, rec.Code)
}
