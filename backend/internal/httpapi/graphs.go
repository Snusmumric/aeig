package httpapi

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/aeig/backend/internal/domain"
	"github.com/aeig/backend/internal/service"
	"github.com/go-chi/chi/v5"
)

type GraphAPI interface {
	CreateGraph(ctx context.Context, name string) (domain.Graph, error)
	GetGraph(ctx context.Context, id string) (domain.Graph, error)
	GetSubgraph(ctx context.Context, id string) (domain.Subgraph, error)
	ApplyMutations(ctx context.Context, id string, baseVersion int64, m domain.Mutations) (int64, error)
}

func handleCreateGraph(api GraphAPI) http.HandlerFunc {
	type request struct {
		Name string `json:"name"`
	}
	return func(w http.ResponseWriter, r *http.Request) {
		var req request
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, service.ErrInvalidInput)
			return
		}
		g, err := api.CreateGraph(r.Context(), req.Name)
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, g)
	}
}

func handleGetGraph(api GraphAPI) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		g, err := api.GetGraph(r.Context(), chi.URLParam(r, "id"))
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, g)
	}
}

func handleGetSubgraph(api GraphAPI) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		sg, err := api.GetSubgraph(r.Context(), chi.URLParam(r, "id"))
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, sg)
	}
}

func handleApplyMutations(api GraphAPI) http.HandlerFunc {
	type request struct {
		BaseVersion int64 `json:"baseVersion"`
		domain.Mutations
	}
	return func(w http.ResponseWriter, r *http.Request) {
		var req request
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, service.ErrInvalidInput)
			return
		}
		v, err := api.ApplyMutations(r.Context(), chi.URLParam(r, "id"), req.BaseVersion, req.Mutations)
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]int64{"version": v})
	}
}
