package postgres

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/aeig/backend/internal/domain"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type LayoutRepo struct {
	pool *pgxpool.Pool
}

func NewLayoutRepo(pool *pgxpool.Pool) *LayoutRepo {
	return &LayoutRepo{pool: pool}
}

func (r *LayoutRepo) SaveLayout(ctx context.Context, graphID, name string, positions map[string]domain.Position, vp domain.Viewport) (domain.Layout, error) {
	posJSON, err := json.Marshal(positions)
	if err != nil {
		return domain.Layout{}, err
	}
	vpJSON, err := json.Marshal(vp)
	if err != nil {
		return domain.Layout{}, err
	}
	out := domain.Layout{GraphID: graphID, Name: name, Positions: positions, Viewport: vp}
	err = r.pool.QueryRow(ctx,
		`INSERT INTO layouts (id, graph_id, name, positions, viewport)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (graph_id, name)
		 DO UPDATE SET positions = EXCLUDED.positions, viewport = EXCLUDED.viewport
		 RETURNING id, created_at`,
		uuid.NewString(), graphID, name, posJSON, vpJSON,
	).Scan(&out.ID, &out.CreatedAt)
	if err != nil {
		return domain.Layout{}, err
	}
	return out, nil
}

func (r *LayoutRepo) ListLayouts(ctx context.Context, graphID string) ([]domain.Layout, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, graph_id, name, positions, viewport, created_at
		 FROM layouts WHERE graph_id = $1 ORDER BY name`, graphID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []domain.Layout{}
	for rows.Next() {
		l, err := scanLayout(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

func (r *LayoutRepo) GetLayoutByName(ctx context.Context, graphID, name string) (domain.Layout, error) {
	row := r.pool.QueryRow(ctx,
		`SELECT id, graph_id, name, positions, viewport, created_at
		 FROM layouts WHERE graph_id = $1 AND name = $2`, graphID, name)
	l, err := scanLayout(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Layout{}, domain.ErrNotFound
	}
	if err != nil {
		return domain.Layout{}, err
	}
	return l, nil
}

// rowScanner is satisfied by both pgx.Row and pgx.Rows.
type rowScanner interface {
	Scan(dest ...any) error
}

func scanLayout(row rowScanner) (domain.Layout, error) {
	var l domain.Layout
	var posJSON, vpJSON []byte
	if err := row.Scan(&l.ID, &l.GraphID, &l.Name, &posJSON, &vpJSON, &l.CreatedAt); err != nil {
		return domain.Layout{}, err
	}
	if err := json.Unmarshal(posJSON, &l.Positions); err != nil {
		return domain.Layout{}, err
	}
	if err := json.Unmarshal(vpJSON, &l.Viewport); err != nil {
		return domain.Layout{}, err
	}
	return l, nil
}
