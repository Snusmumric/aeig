package postgres

import (
	"context"
	"errors"

	"github.com/aeig/backend/internal/domain"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type GraphRepo struct {
	pool *pgxpool.Pool
}

func NewGraphRepo(pool *pgxpool.Pool) *GraphRepo {
	return &GraphRepo{pool: pool}
}

func (r *GraphRepo) CreateGraph(ctx context.Context, name string) (domain.Graph, error) {
	g := domain.Graph{ID: uuid.NewString(), Name: name, Version: 1}
	err := r.pool.QueryRow(ctx,
		`INSERT INTO graphs (id, name) VALUES ($1, $2) RETURNING version, created_at`,
		g.ID, g.Name,
	).Scan(&g.Version, &g.CreatedAt)
	if err != nil {
		return domain.Graph{}, err
	}
	return g, nil
}

func (r *GraphRepo) GetGraph(ctx context.Context, id string) (domain.Graph, error) {
	var g domain.Graph
	err := r.pool.QueryRow(ctx,
		`SELECT id, name, version, created_at FROM graphs WHERE id = $1`, id,
	).Scan(&g.ID, &g.Name, &g.Version, &g.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Graph{}, domain.ErrNotFound
	}
	if err != nil {
		return domain.Graph{}, err
	}
	return g, nil
}

func (r *GraphRepo) BumpVersion(ctx context.Context, id string, baseVersion int64) (int64, error) {
	var newVersion int64
	err := r.pool.QueryRow(ctx,
		`UPDATE graphs SET version = version + 1
		 WHERE id = $1 AND version = $2
		 RETURNING version`,
		id, baseVersion,
	).Scan(&newVersion)
	if errors.Is(err, pgx.ErrNoRows) {
		// Either the graph does not exist, or the base version is stale.
		if _, gErr := r.GetGraph(ctx, id); errors.Is(gErr, domain.ErrNotFound) {
			return 0, domain.ErrNotFound
		}
		return 0, domain.ErrVersionConflict
	}
	if err != nil {
		return 0, err
	}
	return newVersion, nil
}
