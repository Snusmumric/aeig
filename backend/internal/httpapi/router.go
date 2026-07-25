package httpapi

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

func NewRouter(api GraphAPI) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.Recoverer)
	r.Get("/health", handleHealth)
	r.Route("/graphs", func(r chi.Router) {
		r.Post("/", handleCreateGraph(api))
		r.Get("/{id}", handleGetGraph(api))
		r.Get("/{id}/subgraph", handleGetSubgraph(api))
		r.Post("/{id}/mutations", handleApplyMutations(api))
	})
	return r
}
