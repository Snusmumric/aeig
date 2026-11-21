//go:build integration

package postgres

import (
	"context"
	"testing"

	"github.com/aeig/backend/internal/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSliceRepo_CRUDRoundtrip(t *testing.T) {
	ctx := context.Background()
	dsn := startPostgres(t)
	require.NoError(t, RunMigrations(dsn))

	pool, err := NewPool(ctx, dsn)
	require.NoError(t, err)
	defer pool.Close()

	graphs := NewGraphRepo(pool)
	slices := NewSliceRepo(pool)

	g, err := graphs.CreateGraph(ctx, "g")
	require.NoError(t, err)

	// create → uuid gen + defaults echoed back
	created, err := slices.CreateSlice(ctx, g.ID, domain.Slice{Name: "focus", Description: "the hot part"})
	require.NoError(t, err)
	assert.NotEmpty(t, created.ID)
	assert.Equal(t, g.ID, created.GraphID)
	assert.Equal(t, "focus", created.Name)
	assert.Equal(t, "the hot part", created.Description)

	// empty description defaults to '' (NOT NULL DEFAULT '')
	created2, err := slices.CreateSlice(ctx, g.ID, domain.Slice{Name: "other"})
	require.NoError(t, err)
	assert.Equal(t, "", created2.Description)

	// get by name
	got, err := slices.GetSliceByName(ctx, g.ID, "focus")
	require.NoError(t, err)
	assert.Equal(t, created.ID, got.ID)
	assert.Equal(t, "the hot part", got.Description)

	_, err = slices.GetSliceByName(ctx, g.ID, "missing")
	assert.ErrorIs(t, err, domain.ErrNotFound)

	// list is name-ordered and scoped to the graph
	listed, err := slices.ListSlices(ctx, g.ID)
	require.NoError(t, err)
	require.Len(t, listed, 2)
	assert.Equal(t, "focus", listed[0].Name)
	assert.Equal(t, "other", listed[1].Name)

	// rename + edit description (uuid stable)
	renamed, err := slices.RenameSlice(ctx, g.ID, "focus", "core", "renamed desc")
	require.NoError(t, err)
	assert.Equal(t, created.ID, renamed.ID)
	assert.Equal(t, "core", renamed.Name)
	assert.Equal(t, "renamed desc", renamed.Description)

	_, err = slices.GetSliceByName(ctx, g.ID, "focus")
	assert.ErrorIs(t, err, domain.ErrNotFound)
	gotRenamed, err := slices.GetSliceByName(ctx, g.ID, "core")
	require.NoError(t, err)
	assert.Equal(t, "renamed desc", gotRenamed.Description)

	// rename keeping the same name is a plain description edit
	sameName, err := slices.RenameSlice(ctx, g.ID, "core", "core", "v2")
	require.NoError(t, err)
	assert.Equal(t, "core", sameName.Name)
	assert.Equal(t, "v2", sameName.Description)

	// delete
	require.NoError(t, slices.DeleteSlice(ctx, g.ID, "core"))
	_, err = slices.GetSliceByName(ctx, g.ID, "core")
	assert.ErrorIs(t, err, domain.ErrNotFound)
	listed, err = slices.ListSlices(ctx, g.ID)
	require.NoError(t, err)
	require.Len(t, listed, 1)

	// deleting a missing slice reports not-found
	err = slices.DeleteSlice(ctx, g.ID, "core")
	assert.ErrorIs(t, err, domain.ErrNotFound)

	// renaming a missing slice reports not-found
	_, err = slices.RenameSlice(ctx, g.ID, "core", "x", "")
	assert.ErrorIs(t, err, domain.ErrNotFound)
}

func TestSliceRepo_NameCollision(t *testing.T) {
	ctx := context.Background()
	dsn := startPostgres(t)
	require.NoError(t, RunMigrations(dsn))

	pool, err := NewPool(ctx, dsn)
	require.NoError(t, err)
	defer pool.Close()

	graphs := NewGraphRepo(pool)
	slices := NewSliceRepo(pool)

	g, err := graphs.CreateGraph(ctx, "g")
	require.NoError(t, err)
	g2, err := graphs.CreateGraph(ctx, "g2")
	require.NoError(t, err)

	_, err = slices.CreateSlice(ctx, g.ID, domain.Slice{Name: "dup", Description: "first"})
	require.NoError(t, err)

	// same (graph, name) → ErrAlreadyExists (the 409 mapping)
	_, err = slices.CreateSlice(ctx, g.ID, domain.Slice{Name: "dup"})
	assert.ErrorIs(t, err, domain.ErrAlreadyExists)

	// the same name on a DIFFERENT graph is a different slice
	other, err := slices.CreateSlice(ctx, g2.ID, domain.Slice{Name: "dup"})
	require.NoError(t, err)
	assert.NotEqual(t, g.ID, other.GraphID)

	// rename onto an existing name → ErrAlreadyExists
	_, err = slices.CreateSlice(ctx, g.ID, domain.Slice{Name: "second"})
	require.NoError(t, err)
	_, err = slices.RenameSlice(ctx, g.ID, "second", "dup", "")
	assert.ErrorIs(t, err, domain.ErrAlreadyExists)

	// the failed rename left the row untouched
	second, err := slices.GetSliceByName(ctx, g.ID, "second")
	require.NoError(t, err)
	assert.Equal(t, "", second.Description)
}

func TestSliceRepo_GraphCascade(t *testing.T) {
	ctx := context.Background()
	dsn := startPostgres(t)
	require.NoError(t, RunMigrations(dsn))

	pool, err := NewPool(ctx, dsn)
	require.NoError(t, err)
	defer pool.Close()

	graphs := NewGraphRepo(pool)
	slices := NewSliceRepo(pool)

	g, err := graphs.CreateGraph(ctx, "g")
	require.NoError(t, err)
	gOther, err := graphs.CreateGraph(ctx, "other")
	require.NoError(t, err)

	kept, err := slices.CreateSlice(ctx, gOther.ID, domain.Slice{Name: "keep"})
	require.NoError(t, err)
	for _, name := range []string{"a", "b"} {
		_, err := slices.CreateSlice(ctx, g.ID, domain.Slice{Name: name})
		require.NoError(t, err)
	}

	// deleting the graph removes its slices but nobody else's (CASCADE)
	_, err = pool.Exec(ctx, `DELETE FROM graphs WHERE id = $1`, g.ID)
	require.NoError(t, err)

	listed, err := slices.ListSlices(ctx, g.ID)
	require.NoError(t, err)
	assert.Empty(t, listed)
	_, err = slices.GetSliceByName(ctx, g.ID, "a")
	assert.ErrorIs(t, err, domain.ErrNotFound)

	gotKept, err := slices.GetSliceByName(ctx, gOther.ID, "keep")
	require.NoError(t, err)
	assert.Equal(t, kept.ID, gotKept.ID)

	// down migration drops the slices table (SELECT on it fails);
	// two steps down = 0008's then 0007's down
	migrateDownOne(t, dsn)
	migrateDownOne(t, dsn)
	_, err = pool.Exec(ctx, `SELECT id FROM slices LIMIT 1`)
	assert.Error(t, err)
}
