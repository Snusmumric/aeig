package httpapi

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/aeig/backend/internal/domain"
	"github.com/aeig/backend/internal/service"
	"github.com/go-chi/chi/v5"
)

// VisualizationAPI mirrors the VisualizationService methods.
type VisualizationAPI interface {
	GetDefaultVisualization(ctx context.Context, graphID string) (domain.Visualization, error)
	GetVisualization(ctx context.Context, graphID, name string) (domain.Visualization, error)
	SaveVisualization(ctx context.Context, graphID, name string, positions map[string]domain.Position, vp domain.Viewport, nodeTypes, edgeTypes []string, hideOrphans bool, graphVersion *int64, nodes, edges, bends []byte) (domain.Visualization, error)
}

// maxVizBodyBytes caps PUT bodies: positions + manifests grow with graph
// size, so the guard is generous but finite (1 MB).
const maxVizBodyBytes = 1 << 20

// handleGetDefaultVisualization resolves-or-creates the graph's default
// visualization (the literal path segment "default" is routed here, never
// treated as a name).
func handleGetDefaultVisualization(api VisualizationAPI) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		v, err := api.GetDefaultVisualization(r.Context(), chi.URLParam(r, "id"))
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, v)
	}
}

func handleGetVisualization(api VisualizationAPI) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		v, err := api.GetVisualization(r.Context(), chi.URLParam(r, "id"), chi.URLParam(r, "name"))
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, v)
	}
}

func handleSaveVisualization(api VisualizationAPI) http.HandlerFunc {
	type request struct {
		Positions    map[string]domain.Position `json:"positions"`
		Viewport     domain.Viewport            `json:"viewport"`
		NodeTypes    []string                   `json:"nodeTypes"`
		EdgeTypes    []string                   `json:"edgeTypes"`
		HideOrphans  bool                       `json:"hideOrphans"`
		GraphVersion *int64                     `json:"graphVersion"`
		Nodes        json.RawMessage            `json:"nodes"`
		Edges        json.RawMessage            `json:"edges"`
		Bends        json.RawMessage            `json:"bends"`
	}
	return func(w http.ResponseWriter, r *http.Request) {
		name := chi.URLParam(r, "name") // "default" is legal: it is the default's own name
		r.Body = http.MaxBytesReader(w, r.Body, maxVizBodyBytes)
		var req request
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, service.ErrInvalidInput)
			return
		}
		v, err := api.SaveVisualization(r.Context(), chi.URLParam(r, "id"), name, req.Positions, req.Viewport, req.NodeTypes, req.EdgeTypes, req.HideOrphans, req.GraphVersion, req.Nodes, req.Edges, req.Bends)
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, v)
	}
}
