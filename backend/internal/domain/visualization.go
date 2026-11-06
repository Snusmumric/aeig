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
	CreatedAt   time.Time           `json:"createdAt"`
}
