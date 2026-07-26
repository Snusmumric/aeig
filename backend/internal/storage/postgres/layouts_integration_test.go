//go:build integration

package postgres

import (
	"context"
	"testing"

	"github.com/aeig/backend/internal/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLayoutRepo_SaveListGet(t *testing.T) {
	ctx := context.Background()
	dsn := startPostgres(t) // helper from graphs_integration_test.go
	require.NoError(t, RunMigrations(dsn))

	pool, err := NewPool(ctx, dsn)
	require.NoError(t, err)
	defer pool.Close()

	graphs := NewGraphRepo(pool)
	layouts := NewLayoutRepo(pool)

	g, err := graphs.CreateGraph(ctx, "g")
	require.NoError(t, err)

	pos := map[string]domain.Position{"n1": {X: 10, Y: 20}}
	vp := domain.Viewport{X: 1, Y: 2, Zoom: 1.5}

	saved, err := layouts.SaveLayout(ctx, g.ID, "default", pos, vp)
	require.NoError(t, err)
	assert.NotEmpty(t, saved.ID)
	assert.Equal(t, "default", saved.Name)

	// Upsert: same (graph, name) overwrites, keeps one row and the same id.
	pos2 := map[string]domain.Position{"n1": {X: 99, Y: 0}, "n2": {X: 5, Y: 5}}
	saved2, err := layouts.SaveLayout(ctx, g.ID, "default", pos2, vp)
	require.NoError(t, err)
	assert.Equal(t, saved.ID, saved2.ID)

	list, err := layouts.ListLayouts(ctx, g.ID)
	require.NoError(t, err)
	require.Len(t, list, 1)
	assert.Equal(t, "default", list[0].Name)

	got, err := layouts.GetLayoutByName(ctx, g.ID, "default")
	require.NoError(t, err)
	assert.EqualValues(t, 99, got.Positions["n1"].X)
	assert.EqualValues(t, 5, got.Positions["n2"].Y)
	assert.EqualValues(t, 1.5, got.Viewport.Zoom)

	_, err = layouts.GetLayoutByName(ctx, g.ID, "missing")
	assert.ErrorIs(t, err, domain.ErrNotFound)
}
