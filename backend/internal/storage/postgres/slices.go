package postgres

import (
	"context"
	"errors"

	"github.com/aeig/backend/internal/domain"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// SliceRepo stores slice identity and metadata in the `slices` table
// (migration 0007). Membership is NOT stored here — it lives on the elements
// as the `sliceIds` system property (neo4j.SliceMembershipRepo).
type SliceRepo struct {
	pool *pgxpool.Pool
}

func NewSliceRepo(pool *pgxpool.Pool) *SliceRepo {
	return &SliceRepo{pool: pool}
}

// isUniqueViolation reports a 23505 (unique constraint) failure.
func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

// CreateSlice inserts a new slice (uuid generated here); a (graph_id, name)
// collision maps to domain.ErrAlreadyExists (409). Graph existence is checked
// by the service layer first; an FK violation here is a race and propagates.
func (r *SliceRepo) CreateSlice(ctx context.Context, graphID string, s domain.Slice) (domain.Slice, error) {
	s.ID = uuid.NewString()
	s.GraphID = graphID
	err := r.pool.QueryRow(ctx,
		`INSERT INTO slices (id, graph_id, name, description) VALUES ($1, $2, $3, $4)
		 RETURNING description`,
		s.ID, s.GraphID, s.Name, s.Description,
	).Scan(&s.Description) // echoes the NOT NULL DEFAULT '' back
	if isUniqueViolation(err) {
		return domain.Slice{}, domain.ErrAlreadyExists
	}
	if err != nil {
		return domain.Slice{}, err
	}
	return s, nil
}

func (r *SliceRepo) GetSliceByName(ctx context.Context, graphID, name string) (domain.Slice, error) {
	var s domain.Slice
	err := r.pool.QueryRow(ctx,
		`SELECT id, graph_id, name, description FROM slices WHERE graph_id = $1 AND name = $2`,
		graphID, name,
	).Scan(&s.ID, &s.GraphID, &s.Name, &s.Description)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Slice{}, domain.ErrNotFound
	}
	if err != nil {
		return domain.Slice{}, err
	}
	return s, nil
}

// ListSlices returns the graph's slices ordered by name (stable UI order).
func (r *SliceRepo) ListSlices(ctx context.Context, graphID string) ([]domain.Slice, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, graph_id, name, description FROM slices WHERE graph_id = $1 ORDER BY name`,
		graphID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.Slice{}
	for rows.Next() {
		var s domain.Slice
		if err := rows.Scan(&s.ID, &s.GraphID, &s.Name, &s.Description); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// RenameSlice updates a slice's name and description in one statement. The
// slice UUID is stable (nothing in Neo4j references the name). Colliding the
// new name with another slice of the graph maps to domain.ErrAlreadyExists;
// a missing source slice maps to domain.ErrNotFound.
func (r *SliceRepo) RenameSlice(ctx context.Context, graphID, name, newName, description string) (domain.Slice, error) {
	var s domain.Slice
	err := r.pool.QueryRow(ctx,
		`UPDATE slices SET name = $3, description = $4
		 WHERE graph_id = $1 AND name = $2
		 RETURNING id, graph_id, name, description`,
		graphID, name, newName, description,
	).Scan(&s.ID, &s.GraphID, &s.Name, &s.Description)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Slice{}, domain.ErrNotFound
	}
	if isUniqueViolation(err) {
		return domain.Slice{}, domain.ErrAlreadyExists
	}
	if err != nil {
		return domain.Slice{}, err
	}
	return s, nil
}

func (r *SliceRepo) DeleteSlice(ctx context.Context, graphID, name string) error {
	tag, err := r.pool.Exec(ctx,
		`DELETE FROM slices WHERE graph_id = $1 AND name = $2`,
		graphID, name)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}
