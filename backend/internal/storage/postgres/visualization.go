package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/aeig/backend/internal/domain"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// VisualizationRepo stores visualizations in the `layouts` table (the table
// keeps its historical name; it is the visualization store since migration 0004).
type VisualizationRepo struct {
	pool *pgxpool.Pool
}

func NewVisualizationRepo(pool *pgxpool.Pool) *VisualizationRepo {
	return &VisualizationRepo{pool: pool}
}

// SaveVisualization upserts by (graph_id, name). The manifest binding is
// partial: nil graphVersion/nodes/edges leave the stored values unchanged,
// non-nil (raw JSON, including `null`) set them. Any INSERT of a row named
// "default" self-heals into the graph's default (is_default = true); the
// conflict-update path never flips is_default.
func (r *VisualizationRepo) SaveVisualization(ctx context.Context, graphID, name string, positions map[string]domain.Position, vp domain.Viewport, nodeTypes, edgeTypes []string, hideOrphans bool, graphVersion *int64, nodes, edges []byte) (domain.Visualization, error) {
	posJSON, err := json.Marshal(positions)
	if err != nil {
		return domain.Visualization{}, err
	}
	vpJSON, err := json.Marshal(vp)
	if err != nil {
		return domain.Visualization{}, err
	}
	var nodeTypesJSON []byte
	if nodeTypes != nil {
		nodeTypesJSON, err = json.Marshal(nodeTypes)
		if err != nil {
			return domain.Visualization{}, err
		}
	}
	var edgeTypesJSON []byte
	if edgeTypes != nil {
		edgeTypesJSON, err = json.Marshal(edgeTypes)
		if err != nil {
			return domain.Visualization{}, err
		}
	}
	out := domain.Visualization{GraphID: graphID, Name: name, Positions: positions, Viewport: vp, HideOrphans: hideOrphans}
	if nodeTypes != nil {
		nt := nodeTypes
		out.NodeTypes = &nt
	}
	if edgeTypes != nil {
		et := edgeTypes
		out.EdgeTypes = &et
	}
	// graphVersion is NOT NULL, so the INSERT path defaults nil → 0; the
	// conflict-update path must distinguish "absent" from "set to 0", hence
	// it re-checks the parameter instead of using EXCLUDED.
	var nodesJSON, edgesJSON []byte
	err = r.pool.QueryRow(ctx,
		`INSERT INTO layouts (id, graph_id, name, positions, viewport, node_types, edge_types, hide_orphans, is_default, graph_version, nodes, edges)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, ($3 = 'default'), COALESCE($9, 0), $10, $11)
		 ON CONFLICT (graph_id, name)
		 DO UPDATE SET positions = EXCLUDED.positions, viewport = EXCLUDED.viewport, node_types = EXCLUDED.node_types, edge_types = EXCLUDED.edge_types, hide_orphans = EXCLUDED.hide_orphans,
		   graph_version = COALESCE($9, layouts.graph_version),
		   nodes = COALESCE($10, layouts.nodes),
		   edges = COALESCE($11, layouts.edges)
		 RETURNING id, is_default, created_at, graph_version, nodes, edges`,
		uuid.NewString(), graphID, name, posJSON, vpJSON, nodeTypesJSON, edgeTypesJSON, hideOrphans, graphVersion, nodes, edges,
	).Scan(&out.ID, &out.IsDefault, &out.CreatedAt, &out.GraphVersion, &nodesJSON, &edgesJSON)
	if err != nil {
		return domain.Visualization{}, err
	}
	if out.Nodes, err = decodeManifest[domain.ManifestNode](nodesJSON); err != nil {
		return domain.Visualization{}, err
	}
	if out.Edges, err = decodeManifest[domain.ManifestEdge](edgesJSON); err != nil {
		return domain.Visualization{}, err
	}
	return out, nil
}

func (r *VisualizationRepo) GetVisualizationByName(ctx context.Context, graphID, name string) (domain.Visualization, error) {
	row := r.pool.QueryRow(ctx,
		`SELECT id, graph_id, name, positions, viewport, node_types, edge_types, hide_orphans, is_default, graph_version, nodes, edges, created_at
		 FROM layouts WHERE graph_id = $1 AND name = $2`, graphID, name)
	v, err := scanVisualization(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Visualization{}, domain.ErrNotFound
	}
	if err != nil {
		return domain.Visualization{}, err
	}
	return v, nil
}

func (r *VisualizationRepo) GetDefaultVisualization(ctx context.Context, graphID string) (domain.Visualization, error) {
	row := r.pool.QueryRow(ctx,
		`SELECT id, graph_id, name, positions, viewport, node_types, edge_types, hide_orphans, is_default, graph_version, nodes, edges, created_at
		 FROM layouts WHERE graph_id = $1 AND is_default`, graphID)
	v, err := scanVisualization(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Visualization{}, domain.ErrNotFound
	}
	if err != nil {
		return domain.Visualization{}, err
	}
	return v, nil
}

// TryCreateDefaultVisualization attempts to insert the graph's default
// visualization under the fixed name "default" (unbound: graph_version 0,
// no manifests). ON CONFLICT DO NOTHING catches both unique constraints
// (one default per graph, and (graph_id, name)); when no row comes back the
// race was lost and the existing default is returned via
// GetDefaultVisualization (created=false).
func (r *VisualizationRepo) TryCreateDefaultVisualization(ctx context.Context, graphID string) (domain.Visualization, bool, error) {
	row := r.pool.QueryRow(ctx,
		`INSERT INTO layouts (id, graph_id, name, positions, viewport, is_default, graph_version)
		 VALUES ($1, $2, 'default', '{}'::jsonb, $3, true, 0)
		 ON CONFLICT DO NOTHING
		 RETURNING id, created_at`,
		uuid.NewString(), graphID, `{"x":0,"y":0,"zoom":1}`)
	var id string
	var createdAt time.Time
	if err := row.Scan(&id, &createdAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			v, err := r.GetDefaultVisualization(ctx, graphID)
			if err != nil {
				return domain.Visualization{}, false, err
			}
			return v, false, nil
		}
		return domain.Visualization{}, false, err
	}
	return domain.Visualization{
		ID:        id,
		GraphID:   graphID,
		Name:      "default",
		Positions: map[string]domain.Position{},
		Viewport:  domain.Viewport{X: 0, Y: 0, Zoom: 1},
		IsDefault: true,
		CreatedAt: createdAt,
	}, true, nil
}

// rowScanner is satisfied by both pgx.Row and pgx.Rows.
type rowScanner interface {
	Scan(dest ...any) error
}

// decodeManifest turns a stored JSONB manifest (nodes/edges) into the typed
// map pointer: NULL column → nil (legacy row), non-NULL → present map.
func decodeManifest[T any](b []byte) (*map[string]T, error) {
	if len(b) == 0 {
		return nil, nil
	}
	var m map[string]T
	if err := json.Unmarshal(b, &m); err != nil {
		return nil, err
	}
	return &m, nil
}

func scanVisualization(row rowScanner) (domain.Visualization, error) {
	var v domain.Visualization
	var posJSON, vpJSON, nodeTypesJSON, edgeTypesJSON, nodesJSON, edgesJSON []byte
	if err := row.Scan(&v.ID, &v.GraphID, &v.Name, &posJSON, &vpJSON, &nodeTypesJSON, &edgeTypesJSON, &v.HideOrphans, &v.IsDefault, &v.GraphVersion, &nodesJSON, &edgesJSON, &v.CreatedAt); err != nil {
		return domain.Visualization{}, err
	}
	if err := json.Unmarshal(posJSON, &v.Positions); err != nil {
		return domain.Visualization{}, err
	}
	if err := json.Unmarshal(vpJSON, &v.Viewport); err != nil {
		return domain.Visualization{}, err
	}
	if len(nodeTypesJSON) > 0 {
		var nt []string
		if err := json.Unmarshal(nodeTypesJSON, &nt); err != nil {
			return domain.Visualization{}, err
		}
		v.NodeTypes = &nt
	}
	if len(edgeTypesJSON) > 0 {
		var et []string
		if err := json.Unmarshal(edgeTypesJSON, &et); err != nil {
			return domain.Visualization{}, err
		}
		v.EdgeTypes = &et
	}
	var err error
	if v.Nodes, err = decodeManifest[domain.ManifestNode](nodesJSON); err != nil {
		return domain.Visualization{}, err
	}
	if v.Edges, err = decodeManifest[domain.ManifestEdge](edgesJSON); err != nil {
		return domain.Visualization{}, err
	}
	return v, nil
}
