//go:build integration

package postgres

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/aeig/backend/internal/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
)

func startPostgres(t *testing.T) string {
	t.Helper()
	ctx := context.Background()
	ctr, err := tcpostgres.Run(ctx, "postgres:16",
		tcpostgres.WithDatabase("aeig"),
		tcpostgres.WithUsername("aeig"),
		tcpostgres.WithPassword("testpass"),
		tcpostgres.BasicWaitStrategies(),
	)
	require.NoError(t, err)
	t.Cleanup(func() { _ = ctr.Terminate(ctx) })

	dsn, err := ctr.ConnectionString(ctx, "sslmode=disable")
	require.NoError(t, err)
	return dsn
}

func TestGraphRepo_CreateGetBump(t *testing.T) {
	ctx := context.Background()
	dsn := startPostgres(t)
	require.NoError(t, RunMigrations(dsn))

	pool, err := NewPool(ctx, dsn)
	require.NoError(t, err)
	defer pool.Close()

	repo := NewGraphRepo(pool)

	created, err := repo.CreateGraph(ctx, "my graph")
	require.NoError(t, err)
	assert.NotEmpty(t, created.ID)
	assert.Equal(t, "my graph", created.Name)
	assert.Equal(t, int64(1), created.Version)
	assert.WithinDuration(t, time.Now(), created.CreatedAt, time.Minute)

	got, err := repo.GetGraph(ctx, created.ID)
	require.NoError(t, err)
	assert.Equal(t, created.ID, got.ID)
	assert.Equal(t, int64(1), got.Version)

	newV, err := repo.BumpVersion(ctx, created.ID, 1)
	require.NoError(t, err)
	assert.Equal(t, int64(2), newV)

	_, err = repo.BumpVersion(ctx, created.ID, 1) // stale base
	assert.ErrorIs(t, err, domain.ErrVersionConflict)

	_, err = repo.GetGraph(ctx, "00000000-0000-0000-0000-000000000000")
	assert.True(t, errors.Is(err, domain.ErrNotFound))
}
