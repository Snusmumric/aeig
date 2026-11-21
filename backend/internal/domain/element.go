package domain

type Node struct {
	ID   string `json:"id"`
	Type string `json:"type"`
	// SliceIDs is the node's slice memberships (system field, populated
	// explicitly by GetSubgraph; `sliceIds` is a reserved element key and is
	// never part of Properties). nil = no membership.
	SliceIDs   []string       `json:"sliceIds,omitempty"`
	Properties map[string]any `json:"properties"`
}

type Edge struct {
	ID         string         `json:"id"`
	Type       string         `json:"type"`
	Source     string         `json:"source"`
	Target     string         `json:"target"`
	Properties map[string]any `json:"properties"`
}

type Subgraph struct {
	Nodes []Node `json:"nodes"`
	Edges []Edge `json:"edges"`
}
