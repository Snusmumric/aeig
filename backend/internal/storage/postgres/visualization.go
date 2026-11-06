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

func (r *VisualizationRepo) SaveVisualization(ctx context.Context, graphID, name string, positions map[string]domain.Position, vp domain.Viewport, nodeTypes, edgeTypes []string, hideOrphans bool) (domain.Visualization, error) {
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
	// Upsert by (graph_id, name); never flips is_default.
	err = r.pool.QueryRow(ctx,
		`INSERT INTO layouts (id, graph_id, name, positions, viewport, node_types, edge_types, hide_orphans)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		 ON CONFLICT (graph_id, name)
		 DO UPDATE SET positions = EXCLUDED.positions, viewport = EXCLUDED.viewport, node_types = EXCLUDED.node_types, edge_types = EXCLUDED.edge_types, hide_orphans = EXCLUDED.hide_orphans
		 RETURNING id, is_default, created_at`,
		uuid.NewString(), graphID, name, posJSON, vpJSON, nodeTypesJSON, edgeTypesJSON, hideOrphans,
	).Scan(&out.ID, &out.IsDefault, &out.CreatedAt)
	if err != nil {
		return domain.Visualization{}, err
	}
	return out, nil
}

func (r *VisualizationRepo) GetVisualizationByName(ctx context.Context, graphID, name string) (domain.Visualization, error) {
	row := r.pool.QueryRow(ctx,
		`SELECT id, graph_id, name, positions, viewport, node_types, edge_types, hide_orphans, is_default, created_at
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
		`SELECT id, graph_id, name, positions, viewport, node_types, edge_types, hide_orphans, is_default, created_at
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
// visualization under the given candidate name. ON CONFLICT DO NOTHING catches
// both unique constraints (one default per graph, and (graph_id, name)), so
// when no row comes back the outcome is decided by GetDefaultVisualization:
// found → the race was lost, return the existing default (created=false);
// ErrNotFound → the name collided with a non-default row, the caller should
// retry with another name.
func (r *VisualizationRepo) TryCreateDefaultVisualization(ctx context.Context, graphID, name string) (domain.Visualization, bool, error) {
	row := r.pool.QueryRow(ctx,
		`INSERT INTO layouts (id, graph_id, name, positions, viewport, is_default)
		 VALUES ($1, $2, $3, '{}'::jsonb, $4, true)
		 ON CONFLICT DO NOTHING
		 RETURNING id, created_at`,
		uuid.NewString(), graphID, name, `{"x":0,"y":0,"zoom":1}`)
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
		Name:      name,
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

func scanVisualization(row rowScanner) (domain.Visualization, error) {
	var v domain.Visualization
	var posJSON, vpJSON, nodeTypesJSON, edgeTypesJSON []byte
	if err := row.Scan(&v.ID, &v.GraphID, &v.Name, &posJSON, &vpJSON, &nodeTypesJSON, &edgeTypesJSON, &v.HideOrphans, &v.IsDefault, &v.CreatedAt); err != nil {
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
	return v, nil
}
