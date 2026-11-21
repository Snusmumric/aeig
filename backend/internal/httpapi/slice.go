package httpapi

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/aeig/backend/internal/domain"
	"github.com/aeig/backend/internal/service"
	"github.com/go-chi/chi/v5"
)

// SliceAPI mirrors the SliceService methods.
type SliceAPI interface {
	CreateSlice(ctx context.Context, graphID, name, description string, nodeIDs []string) (domain.SliceInfo, error)
	ListSlices(ctx context.Context, graphID string) ([]domain.SliceInfo, error)
	GetSlice(ctx context.Context, graphID, name string) (domain.SliceDetail, error)
	RenameSlice(ctx context.Context, graphID, name string, newName, description *string) (domain.Slice, error)
	DeleteSlice(ctx context.Context, graphID, name string) error
	AddSliceNodes(ctx context.Context, graphID, name string, ids []string) (int, error)
	RemoveSliceNodes(ctx context.Context, graphID, name string, ids []string) (int, error)
}

func handleCreateSlice(api SliceAPI) http.HandlerFunc {
	type request struct {
		Name        string   `json:"name"`
		Description string   `json:"description"`
		NodeIDs     []string `json:"nodeIds"`
	}
	return func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, maxVizBodyBytes)
		var req request
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, service.ErrInvalidInput)
			return
		}
		info, err := api.CreateSlice(r.Context(), chi.URLParam(r, "id"), req.Name, req.Description, req.NodeIDs)
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, info)
	}
}

func handleListSlices(api SliceAPI) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		list, err := api.ListSlices(r.Context(), chi.URLParam(r, "id"))
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, list)
	}
}

func handleGetSlice(api SliceAPI) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		detail, err := api.GetSlice(r.Context(), chi.URLParam(r, "id"), chi.URLParam(r, "name"))
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, detail)
	}
}

func handleRenameSlice(api SliceAPI) http.HandlerFunc {
	type request struct {
		Name        *string `json:"name"`
		Description *string `json:"description"`
	}
	return func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, maxVizBodyBytes)
		var req request
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, service.ErrInvalidInput)
			return
		}
		s, err := api.RenameSlice(r.Context(), chi.URLParam(r, "id"), chi.URLParam(r, "name"), req.Name, req.Description)
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, s)
	}
}

func handleDeleteSlice(api SliceAPI) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := api.DeleteSlice(r.Context(), chi.URLParam(r, "id"), chi.URLParam(r, "name")); err != nil {
			writeError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent) // sweep failures are swallowed by the service (best-effort)
	}
}

func handleAddSliceNodes(api SliceAPI) http.HandlerFunc {
	return handleSliceNodesOp(func(ctx context.Context, graphID, name string, ids []string) (int, error) {
		return api.AddSliceNodes(ctx, graphID, name, ids)
	})
}

func handleRemoveSliceNodes(api SliceAPI) http.HandlerFunc {
	return handleSliceNodesOp(func(ctx context.Context, graphID, name string, ids []string) (int, error) {
		return api.RemoveSliceNodes(ctx, graphID, name, ids)
	})
}

func handleSliceNodesOp(op func(ctx context.Context, graphID, name string, ids []string) (int, error)) http.HandlerFunc {
	type request struct {
		IDs []string `json:"ids"`
	}
	return func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, maxVizBodyBytes)
		var req request
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, service.ErrInvalidInput)
			return
		}
		count, err := op(r.Context(), chi.URLParam(r, "id"), chi.URLParam(r, "name"), req.IDs)
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]int{"nodeCount": count})
	}
}
