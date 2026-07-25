package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/aeig/backend/internal/domain"
	"github.com/aeig/backend/internal/service"
)

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, err error) {
	status := http.StatusInternalServerError
	switch {
	case errors.Is(err, domain.ErrNotFound):
		status = http.StatusNotFound
	case errors.Is(err, domain.ErrVersionConflict):
		status = http.StatusConflict
	case errors.Is(err, service.ErrInvalidInput):
		status = http.StatusBadRequest
	}
	writeJSON(w, status, map[string]string{"error": err.Error()})
}
