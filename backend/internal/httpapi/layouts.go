package httpapi

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/aeig/backend/internal/domain"
	"github.com/aeig/backend/internal/service"
	"github.com/go-chi/chi/v5"
)

type LayoutAPI interface {
	ListLayouts(ctx context.Context, graphID string) ([]domain.Layout, error)
	SaveLayout(ctx context.Context, graphID, name string, positions map[string]domain.Position, vp domain.Viewport) (domain.Layout, error)
	GetLayout(ctx context.Context, graphID, name string) (domain.Layout, error)
}

func handleListLayouts(api LayoutAPI) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ls, err := api.ListLayouts(r.Context(), chi.URLParam(r, "id"))
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, ls)
	}
}

func handleSaveLayout(api LayoutAPI) http.HandlerFunc {
	type request struct {
		Name      string                     `json:"name"`
		Positions map[string]domain.Position `json:"positions"`
		Viewport  domain.Viewport            `json:"viewport"`
	}
	return func(w http.ResponseWriter, r *http.Request) {
		var req request
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, service.ErrInvalidInput)
			return
		}
		l, err := api.SaveLayout(r.Context(), chi.URLParam(r, "id"), req.Name, req.Positions, req.Viewport)
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, l)
	}
}

func handleGetLayout(api LayoutAPI) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		l, err := api.GetLayout(r.Context(), chi.URLParam(r, "id"), chi.URLParam(r, "name"))
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, l)
	}
}
