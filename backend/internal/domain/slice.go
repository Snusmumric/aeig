package domain

// Slice is a named, arbitrary set of a graph's nodes: identity and metadata
// live in Postgres (UNIQUE (graph_id, name), CASCADE from graphs), while
// membership is the `sliceIds` system property on the elements themselves
// (Neo4j). Deliberately no created_at (YAGLI — see the spec). Edge membership
// is derived (both endpoints), never stored.
type Slice struct {
	ID          string `json:"id"`
	GraphID     string `json:"graphId"`
	Name        string `json:"name"`
	Description string `json:"description"`
}
