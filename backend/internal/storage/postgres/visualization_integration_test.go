//go:build integration

package postgres

import (
	"context"
	"database/sql"
	"testing"

	"github.com/aeig/backend/internal/domain"
	"github.com/golang-migrate/migrate/v4"
	migratepg "github.com/golang-migrate/migrate/v4/database/postgres"
	"github.com/golang-migrate/migrate/v4/source/iofs"
	"github.com/google/uuid"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestVisualizationRepo_SaveGet(t *testing.T) {
	ctx := context.Background()
	dsn := startPostgres(t) // helper from graphs_integration_test.go
	require.NoError(t, RunMigrations(dsn))

	pool, err := NewPool(ctx, dsn)
	require.NoError(t, err)
	defer pool.Close()

	graphs := NewGraphRepo(pool)
	viz := NewVisualizationRepo(pool)

	g, err := graphs.CreateGraph(ctx, "g")
	require.NoError(t, err)

	pos := map[string]domain.Position{"n1": {X: 10, Y: 20}}
	vp := domain.Viewport{X: 1, Y: 2, Zoom: 1.5}

	saved, err := viz.SaveVisualization(ctx, g.ID, "mine", pos, vp, nil, nil, false)
	require.NoError(t, err)
	assert.NotEmpty(t, saved.ID)
	assert.Equal(t, "mine", saved.Name)

	// Upsert: same (graph, name) overwrites, keeps one row and the same id.
	pos2 := map[string]domain.Position{"n1": {X: 99, Y: 0}, "n2": {X: 5, Y: 5}}
	saved2, err := viz.SaveVisualization(ctx, g.ID, "mine", pos2, vp, nil, nil, false)
	require.NoError(t, err)
	assert.Equal(t, saved.ID, saved2.ID)

	got, err := viz.GetVisualizationByName(ctx, g.ID, "mine")
	require.NoError(t, err)
	assert.EqualValues(t, 99, got.Positions["n1"].X)
	assert.EqualValues(t, 5, got.Positions["n2"].Y)
	assert.EqualValues(t, 1.5, got.Viewport.Zoom)

	_, err = viz.GetVisualizationByName(ctx, g.ID, "missing")
	assert.ErrorIs(t, err, domain.ErrNotFound)
}

func TestVisualizationRepo_NodeTypesRoundtrip(t *testing.T) {
	ctx := context.Background()
	dsn := startPostgres(t)
	require.NoError(t, RunMigrations(dsn))

	pool, err := NewPool(ctx, dsn)
	require.NoError(t, err)
	defer pool.Close()

	graphs := NewGraphRepo(pool)
	viz := NewVisualizationRepo(pool)

	g, err := graphs.CreateGraph(ctx, "g")
	require.NoError(t, err)

	saved, err := viz.SaveVisualization(ctx, g.ID, "filtered", nil, domain.Viewport{}, []string{"service", "domain"}, nil, false)
	require.NoError(t, err)
	require.NotNil(t, saved.NodeTypes)
	assert.Equal(t, []string{"service", "domain"}, *saved.NodeTypes)

	// upsert with nil overwrites node_types back to NULL
	_, err = viz.SaveVisualization(ctx, g.ID, "filtered", nil, domain.Viewport{}, nil, nil, false)
	require.NoError(t, err)

	got, err := viz.GetVisualizationByName(ctx, g.ID, "filtered")
	require.NoError(t, err)
	assert.Nil(t, got.NodeTypes)

	// [] ("show none") roundtrips distinctly from NULL
	_, err = viz.SaveVisualization(ctx, g.ID, "filtered", nil, domain.Viewport{}, []string{}, nil, false)
	require.NoError(t, err)
	gotEmpty, err := viz.GetVisualizationByName(ctx, g.ID, "filtered")
	require.NoError(t, err)
	require.NotNil(t, gotEmpty.NodeTypes)
	assert.Empty(t, *gotEmpty.NodeTypes)
}

func TestVisualizationRepo_NewFieldsRoundtrip(t *testing.T) {
	ctx := context.Background()
	dsn := startPostgres(t)
	require.NoError(t, RunMigrations(dsn))

	pool, err := NewPool(ctx, dsn)
	require.NoError(t, err)
	defer pool.Close()

	graphs := NewGraphRepo(pool)
	viz := NewVisualizationRepo(pool)

	g, err := graphs.CreateGraph(ctx, "g")
	require.NoError(t, err)

	saved, err := viz.SaveVisualization(ctx, g.ID, "v1", nil, domain.Viewport{Zoom: 1}, nil, []string{"rel"}, true)
	require.NoError(t, err)
	assert.True(t, saved.HideOrphans)
	require.NotNil(t, saved.EdgeTypes)
	assert.Equal(t, []string{"rel"}, *saved.EdgeTypes)

	got, err := viz.GetVisualizationByName(ctx, g.ID, "v1")
	require.NoError(t, err)
	require.NotNil(t, got.EdgeTypes)
	assert.Equal(t, []string{"rel"}, *got.EdgeTypes)
	assert.True(t, got.HideOrphans)
	assert.False(t, got.IsDefault)

	// re-save with nil edgeTypes + false → NULL/false back
	_, err = viz.SaveVisualization(ctx, g.ID, "v1", nil, domain.Viewport{}, nil, nil, false)
	require.NoError(t, err)
	got2, err := viz.GetVisualizationByName(ctx, g.ID, "v1")
	require.NoError(t, err)
	assert.Nil(t, got2.EdgeTypes)
	assert.False(t, got2.HideOrphans)
}

func TestVisualizationRepo_TryCreateDefault(t *testing.T) {
	ctx := context.Background()
	dsn := startPostgres(t)
	require.NoError(t, RunMigrations(dsn))

	pool, err := NewPool(ctx, dsn)
	require.NoError(t, err)
	defer pool.Close()

	graphs := NewGraphRepo(pool)
	viz := NewVisualizationRepo(pool)

	g, err := graphs.CreateGraph(ctx, "g")
	require.NoError(t, err)

	// 1) first TryCreate wins
	first, created, err := viz.TryCreateDefaultVisualization(ctx, g.ID, "quiet-harbor-42")
	require.NoError(t, err)
	assert.True(t, created)
	assert.True(t, first.IsDefault)
	assert.Equal(t, "quiet-harbor-42", first.Name)
	assert.Empty(t, first.Positions)

	// 2) second TryCreate (any name) loses the race → the SAME existing default row
	second, created2, err := viz.TryCreateDefaultVisualization(ctx, g.ID, "loud-otter-07")
	require.NoError(t, err)
	assert.False(t, created2)
	assert.Equal(t, first.ID, second.ID)
	assert.Equal(t, "quiet-harbor-42", second.Name)

	// 3) name collision with a legacy non-default row → created=false AND ErrNotFound (retry signal)
	g2, err := graphs.CreateGraph(ctx, "g2")
	require.NoError(t, err)
	_, err = viz.SaveVisualization(ctx, g2.ID, "taken-name", nil, domain.Viewport{}, nil, nil, false)
	require.NoError(t, err)
	_, created3, err := viz.TryCreateDefaultVisualization(ctx, g2.ID, "taken-name")
	assert.False(t, created3)
	assert.ErrorIs(t, err, domain.ErrNotFound)
}

// migrateToVersion mirrors RunMigrations but stops at an explicit version
// (same embedded FS, same source), to build legacy-schema states in tests.
func migrateToVersion(t *testing.T, dsn string, version int) {
	t.Helper()
	db, err := sql.Open("pgx", dsn)
	require.NoError(t, err)
	defer db.Close()

	driver, err := migratepg.WithInstance(db, &migratepg.Config{})
	require.NoError(t, err)
	src, err := iofs.New(migrationsFS, "migrations")
	require.NoError(t, err)
	m, err := migrate.NewWithInstance("iofs", src, "postgres", driver)
	require.NoError(t, err)
	require.NoError(t, m.Migrate(uint(version)))
}

// migrateDownOne steps the schema down a single version.
func migrateDownOne(t *testing.T, dsn string) {
	t.Helper()
	db, err := sql.Open("pgx", dsn)
	require.NoError(t, err)
	defer db.Close()

	driver, err := migratepg.WithInstance(db, &migratepg.Config{})
	require.NoError(t, err)
	src, err := iofs.New(migrationsFS, "migrations")
	require.NoError(t, err)
	m, err := migrate.NewWithInstance("iofs", src, "postgres", driver)
	require.NoError(t, err)
	require.NoError(t, m.Steps(-1))
}

func TestVisualizationRepo_PromotionMigration(t *testing.T) {
	ctx := context.Background()
	dsn := startPostgres(t)
	migrateToVersion(t, dsn, 3) // legacy schema: before the visualization fields

	pool, err := NewPool(ctx, dsn)
	require.NoError(t, err)
	defer pool.Close()

	graphs := NewGraphRepo(pool)
	g, err := graphs.CreateGraph(ctx, "g")
	require.NoError(t, err)

	// a legacy manual save literally named "default"
	var legacyID string
	err = pool.QueryRow(ctx,
		`INSERT INTO layouts (id, graph_id, name, positions, viewport)
		 VALUES ($1, $2, 'default', $3, '{}'::jsonb) RETURNING id`,
		uuid.NewString(), g.ID, `{"n1":{"x":1,"y":2}}`).Scan(&legacyID)
	require.NoError(t, err)

	// version 4 promotes it to the default visualization
	require.NoError(t, RunMigrations(dsn))

	viz := NewVisualizationRepo(pool)
	promoted, err := viz.GetDefaultVisualization(ctx, g.ID)
	require.NoError(t, err)
	assert.Equal(t, legacyID, promoted.ID)
	assert.True(t, promoted.IsDefault)
	assert.Equal(t, "default-"+legacyID[:8], promoted.Name)
	assert.EqualValues(t, 1, promoted.Positions["n1"].X)
	assert.EqualValues(t, 2, promoted.Positions["n1"].Y)

	// the default now exists: TryCreate loses and returns the same row
	v, created, err := viz.TryCreateDefaultVisualization(ctx, g.ID, "some-candidate")
	require.NoError(t, err)
	assert.False(t, created)
	assert.Equal(t, legacyID, v.ID)

	// no default → ErrNotFound
	g2, err := graphs.CreateGraph(ctx, "g2")
	require.NoError(t, err)
	_, err = viz.GetDefaultVisualization(ctx, g2.ID)
	assert.ErrorIs(t, err, domain.ErrNotFound)

	// down migration drops the new columns (SELECT on them fails)
	migrateDownOne(t, dsn)
	_, err = pool.Exec(ctx, `SELECT hide_orphans FROM layouts LIMIT 1`)
	assert.Error(t, err)
}

func TestVisualizationRepo_SaveNeverFlipsDefault(t *testing.T) {
	ctx := context.Background()
	dsn := startPostgres(t)
	require.NoError(t, RunMigrations(dsn))

	pool, err := NewPool(ctx, dsn)
	require.NoError(t, err)
	defer pool.Close()

	graphs := NewGraphRepo(pool)
	viz := NewVisualizationRepo(pool)

	g, err := graphs.CreateGraph(ctx, "g")
	require.NoError(t, err)

	def, created, err := viz.TryCreateDefaultVisualization(ctx, g.ID, "quiet-harbor-42")
	require.NoError(t, err)
	require.True(t, created)

	// autosave PUTs the whole state over the default row's name — the row must
	// stay the graph's default (upsert never flips is_default)
	saved, err := viz.SaveVisualization(ctx, g.ID, "quiet-harbor-42",
		map[string]domain.Position{"n1": {X: 5, Y: 5}}, domain.Viewport{Zoom: 1}, nil, nil, true)
	require.NoError(t, err)
	assert.Equal(t, def.ID, saved.ID)

	got, err := viz.GetDefaultVisualization(ctx, g.ID)
	require.NoError(t, err)
	assert.Equal(t, def.ID, got.ID)
	assert.Equal(t, "quiet-harbor-42", got.Name)
	assert.True(t, got.IsDefault)
}
