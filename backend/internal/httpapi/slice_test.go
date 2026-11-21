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

type stubSliceAPI struct {
	gotGraphID string

	createCalls int
	gotCreate   struct {
		name, description string
		nodeIDs           []string
	}
	created   domain.SliceInfo
	createErr error

	listed  []domain.SliceInfo
	listErr error

	detail  domain.SliceDetail
	getErr  error
	gotName string

	renamed   domain.Slice
	renameErr error
	gotRename struct {
		name                 string
		newName, description *string
	}

	deleteErr   error
	deleteCalls int

	addErr      error
	addCalls    int
	gotIDs      []string
	addCount    int
	removeErr   error
	removeCalls int
	removeCount int
}

func (s *stubSliceAPI) CreateSlice(_ context.Context, graphID, name, description string, nodeIDs []string) (domain.SliceInfo, error) {
	s.createCalls++
	s.gotGraphID = graphID
	s.gotCreate.name, s.gotCreate.description, s.gotCreate.nodeIDs = name, description, nodeIDs
	return s.created, s.createErr
}

func (s *stubSliceAPI) ListSlices(_ context.Context, graphID string) ([]domain.SliceInfo, error) {
	s.gotGraphID = graphID
	if s.listed == nil {
		return []domain.SliceInfo{}, s.listErr // the service returns non-nil empty
	}
	return s.listed, s.listErr
}

func (s *stubSliceAPI) GetSlice(_ context.Context, graphID, name string) (domain.SliceDetail, error) {
	s.gotGraphID = graphID
	s.gotName = name
	return s.detail, s.getErr
}

func (s *stubSliceAPI) RenameSlice(_ context.Context, graphID, name string, newName, description *string) (domain.Slice, error) {
	s.gotGraphID = graphID
	s.gotRename.name, s.gotRename.newName, s.gotRename.description = name, newName, description
	return s.renamed, s.renameErr
}

func (s *stubSliceAPI) DeleteSlice(_ context.Context, graphID, name string) error {
	s.gotGraphID = graphID
	s.gotName = name
	s.deleteCalls++
	return s.deleteErr
}

func (s *stubSliceAPI) AddSliceNodes(_ context.Context, graphID, name string, ids []string) (int, error) {
	s.gotGraphID = graphID
	s.gotName = name
	s.addCalls++
	s.gotIDs = ids
	return s.addCount, s.addErr
}

func (s *stubSliceAPI) RemoveSliceNodes(_ context.Context, graphID, name string, ids []string) (int, error) {
	s.gotGraphID = graphID
	s.gotName = name
	s.removeCalls++
	s.gotIDs = ids
	return s.removeCount, s.removeErr
}

func routerWithSlices(s SliceAPI) http.Handler {
	return NewRouter(Deps{Graphs: &stubAPI{}, Visualizations: &stubVizAPI{}, Slices: s})
}

func TestSliceRoutes_Create(t *testing.T) {
	t.Run("201", func(t *testing.T) {
		api := &stubSliceAPI{created: domain.SliceInfo{ID: "sid-1", Name: "focus", Description: "d", NodeCount: 2}}
		body := `{"name":"focus","description":"d","nodeIds":["n1","n2"]}`
		rec := doReq(t, routerWithSlices(api), http.MethodPost, "/graphs/g1/slices", body)
		require.Equal(t, http.StatusCreated, rec.Code)
		assert.Equal(t, 1, api.createCalls)
		assert.Equal(t, "g1", api.gotGraphID)
		assert.Equal(t, "focus", api.gotCreate.name)
		assert.Equal(t, "d", api.gotCreate.description)
		assert.Equal(t, []string{"n1", "n2"}, api.gotCreate.nodeIDs)
		var out domain.SliceInfo
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &out))
		assert.Equal(t, domain.SliceInfo{ID: "sid-1", Name: "focus", Description: "d", NodeCount: 2}, out)
		assert.Contains(t, rec.Body.String(), `"nodeCount":2`)
	})

	t.Run("201 without optional fields", func(t *testing.T) {
		api := &stubSliceAPI{}
		rec := doReq(t, routerWithSlices(api), http.MethodPost, "/graphs/g1/slices", `{"name":"focus"}`)
		require.Equal(t, http.StatusCreated, rec.Code)
		assert.Equal(t, "", api.gotCreate.description)
		assert.Nil(t, api.gotCreate.nodeIDs)
	})

	t.Run("400 on invalid json", func(t *testing.T) {
		api := &stubSliceAPI{}
		rec := doReq(t, routerWithSlices(api), http.MethodPost, "/graphs/g1/slices", `{nope`)
		assert.Equal(t, http.StatusBadRequest, rec.Code)
		assert.Equal(t, 0, api.createCalls)
	})

	t.Run("400 on blank name", func(t *testing.T) {
		api := &stubSliceAPI{createErr: service.ErrInvalidInput}
		rec := doReq(t, routerWithSlices(api), http.MethodPost, "/graphs/g1/slices", `{"name":"  "}`)
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("409 on name collision", func(t *testing.T) {
		api := &stubSliceAPI{createErr: domain.ErrAlreadyExists}
		rec := doReq(t, routerWithSlices(api), http.MethodPost, "/graphs/g1/slices", `{"name":"dup"}`)
		assert.Equal(t, http.StatusConflict, rec.Code)
	})

	t.Run("404 on unknown graph", func(t *testing.T) {
		api := &stubSliceAPI{createErr: domain.ErrNotFound}
		rec := doReq(t, routerWithSlices(api), http.MethodPost, "/graphs/gX/slices", `{"name":"s"}`)
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})
}

func TestSliceRoutes_List(t *testing.T) {
	t.Run("200", func(t *testing.T) {
		api := &stubSliceAPI{listed: []domain.SliceInfo{
			{ID: "sid-1", Name: "a", Description: "da", NodeCount: 3},
			{ID: "sid-2", Name: "b", NodeCount: 0},
		}}
		rec := doReq(t, routerWithSlices(api), http.MethodGet, "/graphs/g1/slices", "")
		require.Equal(t, http.StatusOK, rec.Code)
		assert.Equal(t, "g1", api.gotGraphID)
		var out []domain.SliceInfo
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &out))
		require.Len(t, out, 2)
		assert.Equal(t, "sid-1", out[0].ID)
		assert.Equal(t, 3, out[0].NodeCount)
		assert.Equal(t, "b", out[1].Name)
	})

	t.Run("200 empty list as []", func(t *testing.T) {
		api := &stubSliceAPI{}
		rec := doReq(t, routerWithSlices(api), http.MethodGet, "/graphs/g1/slices", "")
		require.Equal(t, http.StatusOK, rec.Code)
		assert.JSONEq(t, `[]`, rec.Body.String())
	})

	t.Run("404 on unknown graph", func(t *testing.T) {
		api := &stubSliceAPI{listErr: domain.ErrNotFound}
		rec := doReq(t, routerWithSlices(api), http.MethodGet, "/graphs/gX/slices", "")
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})
}

func TestSliceRoutes_Get(t *testing.T) {
	t.Run("200 hydrated", func(t *testing.T) {
		api := &stubSliceAPI{detail: domain.SliceDetail{
			ID: "sid-1", Name: "focus", Description: "d",
			Nodes: []domain.Node{
				{ID: "n1", Type: "Task", SliceIDs: []string{"sid-1"}, Properties: map[string]any{}},
			},
		}}
		rec := doReq(t, routerWithSlices(api), http.MethodGet, "/graphs/g1/slices/focus", "")
		require.Equal(t, http.StatusOK, rec.Code)
		assert.Equal(t, "focus", api.gotName)
		var out domain.SliceDetail
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &out))
		assert.Equal(t, "sid-1", out.ID)
		require.Len(t, out.Nodes, 1)
		assert.Equal(t, "n1", out.Nodes[0].ID)
		assert.Equal(t, []string{"sid-1"}, out.Nodes[0].SliceIDs)
		assert.Contains(t, rec.Body.String(), `"sliceIds":["sid-1"]`) // typed GraphNode field
	})

	t.Run("404", func(t *testing.T) {
		api := &stubSliceAPI{getErr: domain.ErrNotFound}
		rec := doReq(t, routerWithSlices(api), http.MethodGet, "/graphs/g1/slices/missing", "")
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})
}

func TestSliceRoutes_Patch(t *testing.T) {
	t.Run("200 both fields", func(t *testing.T) {
		api := &stubSliceAPI{renamed: domain.Slice{ID: "sid-1", Name: "core", Description: "d2"}}
		rec := doReq(t, routerWithSlices(api), http.MethodPatch, "/graphs/g1/slices/old", `{"name":"core","description":"d2"}`)
		require.Equal(t, http.StatusOK, rec.Code)
		assert.Equal(t, "old", api.gotRename.name)
		require.NotNil(t, api.gotRename.newName)
		assert.Equal(t, "core", *api.gotRename.newName)
		require.NotNil(t, api.gotRename.description)
		assert.Equal(t, "d2", *api.gotRename.description)
		var out domain.Slice
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &out))
		assert.Equal(t, "core", out.Name)
		assert.Equal(t, "d2", out.Description)
	})

	t.Run("200 description only keeps name absent", func(t *testing.T) {
		api := &stubSliceAPI{renamed: domain.Slice{ID: "sid-1", Name: "old", Description: "d2"}}
		rec := doReq(t, routerWithSlices(api), http.MethodPatch, "/graphs/g1/slices/old", `{"description":"d2"}`)
		require.Equal(t, http.StatusOK, rec.Code)
		assert.Nil(t, api.gotRename.newName)
		require.NotNil(t, api.gotRename.description)
	})

	t.Run("400 on invalid json", func(t *testing.T) {
		rec := doReq(t, routerWithSlices(&stubSliceAPI{}), http.MethodPatch, "/graphs/g1/slices/old", `{nope`)
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("409 on rename collision", func(t *testing.T) {
		api := &stubSliceAPI{renameErr: domain.ErrAlreadyExists}
		rec := doReq(t, routerWithSlices(api), http.MethodPatch, "/graphs/g1/slices/old", `{"name":"taken"}`)
		assert.Equal(t, http.StatusConflict, rec.Code)
	})

	t.Run("404", func(t *testing.T) {
		api := &stubSliceAPI{renameErr: domain.ErrNotFound}
		rec := doReq(t, routerWithSlices(api), http.MethodPatch, "/graphs/g1/slices/missing", `{"name":"x"}`)
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})
}

func TestSliceRoutes_Delete(t *testing.T) {
	t.Run("204 empty body", func(t *testing.T) {
		api := &stubSliceAPI{}
		rec := doReq(t, routerWithSlices(api), http.MethodDelete, "/graphs/g1/slices/old", "")
		require.Equal(t, http.StatusNoContent, rec.Code)
		assert.Empty(t, rec.Body.String())
		assert.Equal(t, 1, api.deleteCalls)
		assert.Equal(t, "old", api.gotName)
	})

	t.Run("404", func(t *testing.T) {
		api := &stubSliceAPI{deleteErr: domain.ErrNotFound}
		rec := doReq(t, routerWithSlices(api), http.MethodDelete, "/graphs/g1/slices/missing", "")
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})
}

func TestSliceRoutes_Nodes(t *testing.T) {
	t.Run("add 200 nodeCount", func(t *testing.T) {
		api := &stubSliceAPI{addCount: 3}
		rec := doReq(t, routerWithSlices(api), http.MethodPost, "/graphs/g1/slices/focus/nodes", `{"ids":["n1","n2"]}`)
		require.Equal(t, http.StatusOK, rec.Code)
		assert.Equal(t, 1, api.addCalls)
		assert.Equal(t, "focus", api.gotName)
		assert.Equal(t, []string{"n1", "n2"}, api.gotIDs)
		var out map[string]int
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &out))
		assert.Equal(t, 3, out["nodeCount"])
	})

	t.Run("add 404", func(t *testing.T) {
		api := &stubSliceAPI{addErr: domain.ErrNotFound}
		rec := doReq(t, routerWithSlices(api), http.MethodPost, "/graphs/g1/slices/missing/nodes", `{"ids":["n1"]}`)
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("add 400 on invalid json", func(t *testing.T) {
		rec := doReq(t, routerWithSlices(&stubSliceAPI{}), http.MethodPost, "/graphs/g1/slices/focus/nodes", `{nope`)
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("remove 200 nodeCount", func(t *testing.T) {
		api := &stubSliceAPI{removeCount: 1}
		rec := doReq(t, routerWithSlices(api), http.MethodDelete, "/graphs/g1/slices/focus/nodes", `{"ids":["n1"]}`)
		require.Equal(t, http.StatusOK, rec.Code)
		assert.Equal(t, 1, api.removeCalls)
		assert.Equal(t, []string{"n1"}, api.gotIDs)
		var out map[string]int
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &out))
		assert.Equal(t, 1, out["nodeCount"])
	})

	t.Run("remove 404", func(t *testing.T) {
		api := &stubSliceAPI{removeErr: domain.ErrNotFound}
		rec := doReq(t, routerWithSlices(api), http.MethodDelete, "/graphs/g1/slices/missing/nodes", `{"ids":["n1"]}`)
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})
}
