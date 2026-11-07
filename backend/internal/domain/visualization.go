package domain

import "time"

type Position struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type Viewport struct {
	X    float64 `json:"x"`
	Y    float64 `json:"y"`
	Zoom float64 `json:"zoom"`
}

// ManifestNode is a remembered node in a visualization manifest: just enough
// to render a ghost (type, label) at its saved position.
type ManifestNode struct {
	Type  string  `json:"type"`
	Label string  `json:"label"`
	X     float64 `json:"x"`
	Y     float64 `json:"y"`
}

// ManifestEdge is a remembered edge in a visualization manifest.
type ManifestEdge struct {
	Type   string `json:"type"`
	Source string `json:"source"`
	Target string `json:"target"`
}

// Bend is a relative edge-bend offset: the displacement of the curve's
// midpoint from the straight-line midpoint between the anchor points.
type Bend struct {
	Dx float64 `json:"dx"`
	Dy float64 `json:"dy"`
}

type Visualization struct {
	ID          string              `json:"id"`
	GraphID     string              `json:"graphId"`
	Name        string              `json:"name"`
	Positions   map[string]Position `json:"positions"`
	Viewport    Viewport            `json:"viewport"`
	NodeTypes   *[]string           `json:"nodeTypes,omitempty"`
	EdgeTypes   *[]string           `json:"edgeTypes,omitempty"`
	HideOrphans bool                `json:"hideOrphans"`
	IsDefault   bool                `json:"isDefault"`
	// GraphVersion is the graph version at the last explicit save/sync
	// (0 = never bound); Nodes/Edges are the element manifest (nil = legacy
	// row saved before manifests existed).
	GraphVersion int64                    `json:"graphVersion"`
	Nodes        *map[string]ManifestNode `json:"nodes,omitempty"`
	Edges        *map[string]ManifestEdge `json:"edges,omitempty"`
	// Bends is the edge-bend map (edge id → relative offset); nil = the
	// row has no bends (NULL column, e.g. saved before bends existed).
	Bends     *map[string]Bend `json:"bends,omitempty"`
	CreatedAt time.Time        `json:"createdAt"`
}
