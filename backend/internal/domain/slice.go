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

// SliceInfo is the API list-item / create response: slice identity plus the
// current member count (membership lives in Neo4j, aggregated by the service).
type SliceInfo struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	NodeCount   int    `json:"nodeCount"`
}

// SliceDetail is the hydrated single-slice response: full member node data
// (GraphNode shape, incl. the typed sliceIds field).
type SliceDetail struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Nodes       []Node `json:"nodes"`
}
