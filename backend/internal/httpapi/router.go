package httpapi

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

type Deps struct {
	Graphs  GraphAPI
	Layouts LayoutAPI
}

func NewRouter(d Deps) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.Recoverer)
	r.Get("/health", handleHealth)
	r.Route("/graphs", func(r chi.Router) {
		r.Post("/", handleCreateGraph(d.Graphs))
		r.Get("/{id}", handleGetGraph(d.Graphs))
		r.Get("/{id}/subgraph", handleGetSubgraph(d.Graphs))
		r.Post("/{id}/mutations", handleApplyMutations(d.Graphs))
		r.Get("/{id}/layouts", handleListLayouts(d.Layouts))
		r.Post("/{id}/layouts", handleSaveLayout(d.Layouts))
		r.Get("/{id}/layouts/{name}", handleGetLayout(d.Layouts))
	})
	return r
}
