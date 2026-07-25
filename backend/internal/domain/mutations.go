package domain

type Mutations struct {
	UpsertNodes   []Node   `json:"upsertNodes"`
	UpsertEdges   []Edge   `json:"upsertEdges"`
	DeleteNodeIDs []string `json:"deleteNodeIds"`
	DeleteEdgeIDs []string `json:"deleteEdgeIds"`
}
