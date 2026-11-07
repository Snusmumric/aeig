//go:build integration

package postgres

import (
	"context"
	"database/sql"
	"encoding/json"
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

	saved, err := viz.SaveVisualization(ctx, g.ID, "mine", pos, vp, nil, nil, false, nil, nil, nil, nil)
	require.NoError(t, err)
	assert.NotEmpty(t, saved.ID)
	assert.Equal(t, "mine", saved.Name)

	// Upsert: same (graph, name) overwrites, keeps one row and the same id.
	pos2 := map[string]domain.Position{"n1": {X: 99, Y: 0}, "n2": {X: 5, Y: 5}}
	saved2, err := viz.SaveVisualization(ctx, g.ID, "mine", pos2, vp, nil, nil, false, nil, nil, nil, nil)
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

	saved, err := viz.SaveVisualization(ctx, g.ID, "filtered", nil, domain.Viewport{}, []string{"service", "domain"}, nil, false, nil, nil, nil, nil)
	require.NoError(t, err)
	require.NotNil(t, saved.NodeTypes)
	assert.Equal(t, []string{"service", "domain"}, *saved.NodeTypes)

	// upsert with nil overwrites node_types back to NULL
	_, err = viz.SaveVisualization(ctx, g.ID, "filtered", nil, domain.Viewport{}, nil, nil, false, nil, nil, nil, nil)
	require.NoError(t, err)

	got, err := viz.GetVisualizationByName(ctx, g.ID, "filtered")
	require.NoError(t, err)
	assert.Nil(t, got.NodeTypes)

	// [] ("show none") roundtrips distinctly from NULL
	_, err = viz.SaveVisualization(ctx, g.ID, "filtered", nil, domain.Viewport{}, []string{}, nil, false, nil, nil, nil, nil)
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

	saved, err := viz.SaveVisualization(ctx, g.ID, "v1", nil, domain.Viewport{Zoom: 1}, nil, []string{"rel"}, true, nil, nil, nil, nil)
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
	_, err = viz.SaveVisualization(ctx, g.ID, "v1", nil, domain.Viewport{}, nil, nil, false, nil, nil, nil, nil)
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

	// 1) first TryCreate wins, under the literal name "default"
	first, created, err := viz.TryCreateDefaultVisualization(ctx, g.ID)
	require.NoError(t, err)
	assert.True(t, created)
	assert.True(t, first.IsDefault)
	assert.Equal(t, "default", first.Name)
	assert.Empty(t, first.Positions)
	assert.EqualValues(t, 0, first.GraphVersion)
	assert.Nil(t, first.Nodes)
	assert.Nil(t, first.Edges)

	// 2) second TryCreate loses the race → the SAME existing default row
	second, created2, err := viz.TryCreateDefaultVisualization(ctx, g.ID)
	require.NoError(t, err)
	assert.False(t, created2)
	assert.Equal(t, first.ID, second.ID)
	assert.Equal(t, "default", second.Name)

	// 3) a graph with other named rows but no default still gets its default
	//    (the name is fixed, so no collision with non-default rows is possible)
	g2, err := graphs.CreateGraph(ctx, "g2")
	require.NoError(t, err)
	_, err = viz.SaveVisualization(ctx, g2.ID, "taken-name", nil, domain.Viewport{}, nil, nil, false, nil, nil, nil, nil)
	require.NoError(t, err)
	third, created3, err := viz.TryCreateDefaultVisualization(ctx, g2.ID)
	require.NoError(t, err)
	assert.True(t, created3)
	assert.Equal(t, "default", third.Name)
	assert.True(t, third.IsDefault)
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

	// version 4 promotes it to the default visualization under a unique name
	// (0004), then 0005 renames every is_default row back to the literal
	// "default" — the pre-0004 name is restored
	require.NoError(t, RunMigrations(dsn))

	viz := NewVisualizationRepo(pool)
	promoted, err := viz.GetDefaultVisualization(ctx, g.ID)
	require.NoError(t, err)
	assert.Equal(t, legacyID, promoted.ID)
	assert.True(t, promoted.IsDefault)
	assert.Equal(t, "default", promoted.Name)
	assert.EqualValues(t, 1, promoted.Positions["n1"].X)
	assert.EqualValues(t, 2, promoted.Positions["n1"].Y)

	// the default now exists: TryCreate loses and returns the same row
	v, created, err := viz.TryCreateDefaultVisualization(ctx, g.ID)
	require.NoError(t, err)
	assert.False(t, created)
	assert.Equal(t, legacyID, v.ID)

	// no default → ErrNotFound
	g2, err := graphs.CreateGraph(ctx, "g2")
	require.NoError(t, err)
	_, err = viz.GetDefaultVisualization(ctx, g2.ID)
	assert.ErrorIs(t, err, domain.ErrNotFound)

	// down migrations drop the new columns (SELECT on them fails);
	// two steps down = 0006's then 0005's down, so assert on a manifest column
	migrateDownOne(t, dsn)
	migrateDownOne(t, dsn)
	_, err = pool.Exec(ctx, `SELECT nodes FROM layouts LIMIT 1`)
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

	def, created, err := viz.TryCreateDefaultVisualization(ctx, g.ID)
	require.NoError(t, err)
	require.True(t, created)

	// autosave PUTs the whole state over the default row's name — the row must
	// stay the graph's default (upsert never flips is_default)
	saved, err := viz.SaveVisualization(ctx, g.ID, "default",
		map[string]domain.Position{"n1": {X: 5, Y: 5}}, domain.Viewport{Zoom: 1}, nil, nil, true, nil, nil, nil, nil)
	require.NoError(t, err)
	assert.Equal(t, def.ID, saved.ID)

	got, err := viz.GetDefaultVisualization(ctx, g.ID)
	require.NoError(t, err)
	assert.Equal(t, def.ID, got.ID)
	assert.Equal(t, "default", got.Name)
	assert.True(t, got.IsDefault)
}

func TestVisualizationRepo_ManifestRoundtrip(t *testing.T) {
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

	wantNodes := map[string]domain.ManifestNode{
		"n1": {Type: "service", Label: "Svc", X: 1.5, Y: 2.5},
		"n2": {Type: "domain", Label: "Dom", X: -1, Y: 0},
	}
	wantEdges := map[string]domain.ManifestEdge{
		"e1": {Type: "rel", Source: "n1", Target: "n2"},
	}
	nodesJSON, err := json.Marshal(wantNodes)
	require.NoError(t, err)
	edgesJSON, err := json.Marshal(wantEdges)
	require.NoError(t, err)

	// 1) save with a graph version + manifests → stored and returned
	gv := int64(7)
	saved, err := viz.SaveVisualization(ctx, g.ID, "v", nil, domain.Viewport{}, nil, nil, false, &gv, nodesJSON, edgesJSON, nil)
	require.NoError(t, err)
	assert.EqualValues(t, 7, saved.GraphVersion)
	require.NotNil(t, saved.Nodes)
	assert.Equal(t, wantNodes, *saved.Nodes)
	require.NotNil(t, saved.Edges)
	assert.Equal(t, wantEdges, *saved.Edges)

	got, err := viz.GetVisualizationByName(ctx, g.ID, "v")
	require.NoError(t, err)
	assert.EqualValues(t, 7, got.GraphVersion)
	require.NotNil(t, got.Nodes)
	assert.Equal(t, wantNodes, *got.Nodes)
	require.NotNil(t, got.Edges)
	assert.Equal(t, wantEdges, *got.Edges)

	// 2) re-save with nil binding params → binding unchanged
	_, err = viz.SaveVisualization(ctx, g.ID, "v",
		map[string]domain.Position{"n1": {X: 9, Y: 9}}, domain.Viewport{Zoom: 2}, nil, nil, false, nil, nil, nil, nil)
	require.NoError(t, err)
	got2, err := viz.GetVisualizationByName(ctx, g.ID, "v")
	require.NoError(t, err)
	assert.EqualValues(t, 7, got2.GraphVersion)
	require.NotNil(t, got2.Nodes)
	assert.Equal(t, wantNodes, *got2.Nodes)
	require.NotNil(t, got2.Edges)
	assert.Equal(t, wantEdges, *got2.Edges)

	// 3) re-save with fresh manifests → replaced
	gv9 := int64(9)
	freshNodes := map[string]domain.ManifestNode{"n9": {Type: "ghost", Label: "n9", X: 0, Y: 0}}
	freshEdges := map[string]domain.ManifestEdge{}
	freshNodesJSON, err := json.Marshal(freshNodes)
	require.NoError(t, err)
	freshEdgesJSON, err := json.Marshal(freshEdges)
	require.NoError(t, err)
	_, err = viz.SaveVisualization(ctx, g.ID, "v", nil, domain.Viewport{}, nil, nil, false, &gv9, freshNodesJSON, freshEdgesJSON, nil)
	require.NoError(t, err)
	got3, err := viz.GetVisualizationByName(ctx, g.ID, "v")
	require.NoError(t, err)
	assert.EqualValues(t, 9, got3.GraphVersion)
	require.NotNil(t, got3.Nodes)
	assert.Equal(t, freshNodes, *got3.Nodes)
	require.NotNil(t, got3.Edges) // JSON null/empty still decodes to a present, empty map
	assert.Empty(t, *got3.Edges)
}

func TestVisualizationRepo_BendsRoundtrip(t *testing.T) {
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

	wantBends := map[string]domain.Bend{
		"e1": {Dx: 30, Dy: 10},
		"e2": {Dx: -12.5, Dy: 0},
	}
	bendsJSON, err := json.Marshal(wantBends)
	require.NoError(t, err)

	// 1) save with bends absent → NULL column, scan gives nil
	saved, err := viz.SaveVisualization(ctx, g.ID, "v", nil, domain.Viewport{}, nil, nil, false, nil, nil, nil, nil)
	require.NoError(t, err)
	assert.Nil(t, saved.Bends)

	got, err := viz.GetVisualizationByName(ctx, g.ID, "v")
	require.NoError(t, err)
	assert.Nil(t, got.Bends)

	// 2) re-save with bends (binding otherwise absent) → stored and returned
	saved2, err := viz.SaveVisualization(ctx, g.ID, "v", nil, domain.Viewport{}, nil, nil, false, nil, nil, nil, bendsJSON)
	require.NoError(t, err)
	require.NotNil(t, saved2.Bends)
	assert.Equal(t, wantBends, *saved2.Bends)

	got2, err := viz.GetVisualizationByName(ctx, g.ID, "v")
	require.NoError(t, err)
	require.NotNil(t, got2.Bends)
	assert.Equal(t, wantBends, *got2.Bends)

	// 3) re-save with bends absent → stored bends unchanged
	_, err = viz.SaveVisualization(ctx, g.ID, "v",
		map[string]domain.Position{"n1": {X: 9, Y: 9}}, domain.Viewport{Zoom: 2}, nil, nil, false, nil, nil, nil, nil)
	require.NoError(t, err)
	got3, err := viz.GetVisualizationByName(ctx, g.ID, "v")
	require.NoError(t, err)
	require.NotNil(t, got3.Bends)
	assert.Equal(t, wantBends, *got3.Bends)

	// 4) re-save with {} → full replace to a present, empty map
	_, err = viz.SaveVisualization(ctx, g.ID, "v", nil, domain.Viewport{}, nil, nil, false, nil, nil, nil, []byte(`{}`))
	require.NoError(t, err)
	got4, err := viz.GetVisualizationByName(ctx, g.ID, "v")
	require.NoError(t, err)
	require.NotNil(t, got4.Bends) // {} still decodes to a present, empty map
	assert.Empty(t, *got4.Bends)

	// 5) full replace with a different map
	freshBends := map[string]domain.Bend{"e9": {Dx: 0, Dy: -60}}
	freshBendsJSON, err := json.Marshal(freshBends)
	require.NoError(t, err)
	_, err = viz.SaveVisualization(ctx, g.ID, "v", nil, domain.Viewport{}, nil, nil, false, nil, nil, nil, freshBendsJSON)
	require.NoError(t, err)
	got5, err := viz.GetVisualizationByName(ctx, g.ID, "v")
	require.NoError(t, err)
	require.NotNil(t, got5.Bends)
	assert.Equal(t, freshBends, *got5.Bends)

	// 6) INSERT path (brand-new row) writes bends directly
	_, err = viz.SaveVisualization(ctx, g.ID, "fresh", nil, domain.Viewport{}, nil, nil, false, nil, nil, nil, bendsJSON)
	require.NoError(t, err)
	got6, err := viz.GetVisualizationByName(ctx, g.ID, "fresh")
	require.NoError(t, err)
	require.NotNil(t, got6.Bends)
	assert.Equal(t, wantBends, *got6.Bends)

	// down migration drops the bends column (SELECT on it fails);
	// one step down = 0006's down
	migrateDownOne(t, dsn)
	_, err = pool.Exec(ctx, `SELECT bends FROM layouts LIMIT 1`)
	assert.Error(t, err)
}

func TestVisualizationRepo_SelfHealingDefault(t *testing.T) {
	ctx := context.Background()
	dsn := startPostgres(t)
	require.NoError(t, RunMigrations(dsn))

	pool, err := NewPool(ctx, dsn)
	require.NoError(t, err)
	defer pool.Close()

	graphs := NewGraphRepo(pool)
	viz := NewVisualizationRepo(pool)

	g, err := graphs.CreateGraph(ctx, "g") // fresh graph, no rows at all
	require.NoError(t, err)

	// any INSERT of a row named "default" self-heals into the graph's default
	saved, err := viz.SaveVisualization(ctx, g.ID, "default",
		map[string]domain.Position{"n1": {X: 1, Y: 2}}, domain.Viewport{Zoom: 1}, nil, nil, false, nil, nil, nil, nil)
	require.NoError(t, err)
	assert.True(t, saved.IsDefault)
	assert.Equal(t, "default", saved.Name)

	got, err := viz.GetDefaultVisualization(ctx, g.ID)
	require.NoError(t, err)
	assert.Equal(t, saved.ID, got.ID)
	assert.Equal(t, "default", got.Name)
	assert.True(t, got.IsDefault)
}

func TestVisualizationRepo_DefaultRenameMigration(t *testing.T) {
	ctx := context.Background()
	dsn := startPostgres(t)
	migrateToVersion(t, dsn, 4) // schema as of 0004: defaults named default-<uuid8>

	pool, err := NewPool(ctx, dsn)
	require.NoError(t, err)
	defer pool.Close()

	graphs := NewGraphRepo(pool)
	g, err := graphs.CreateGraph(ctx, "g")
	require.NoError(t, err)

	// a 0004-promoted default: is_default row named default-<uuid8>
	var rowID string
	err = pool.QueryRow(ctx,
		`INSERT INTO layouts (id, graph_id, name, positions, viewport, is_default)
		 VALUES ($1, $2, 'default-8e1c94d1', $3, '{}'::jsonb, true) RETURNING id`,
		uuid.NewString(), g.ID, `{"n7":{"x":3,"y":4}}`).Scan(&rowID)
	require.NoError(t, err)

	// 0005 renames it to the literal "default"
	require.NoError(t, RunMigrations(dsn))

	viz := NewVisualizationRepo(pool)
	got, err := viz.GetDefaultVisualization(ctx, g.ID)
	require.NoError(t, err)
	assert.Equal(t, rowID, got.ID)
	assert.Equal(t, "default", got.Name)
	assert.True(t, got.IsDefault)
	assert.EqualValues(t, 3, got.Positions["n7"].X)
	assert.EqualValues(t, 4, got.Positions["n7"].Y)

	// the default keeps resolving-or-creating semantics under its new name
	_, created, err := viz.TryCreateDefaultVisualization(ctx, g.ID)
	require.NoError(t, err)
	assert.False(t, created)

	// down migrations drop the manifest columns (SELECT on them fails);
	// two steps down = 0006's then 0005's down
	migrateDownOne(t, dsn)
	migrateDownOne(t, dsn)
	_, err = pool.Exec(ctx, `SELECT graph_version FROM layouts LIMIT 1`)
	assert.Error(t, err)
}

func TestVisualizationRepo_TryCreateDefaultRace(t *testing.T) {
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

	first, created, err := viz.TryCreateDefaultVisualization(ctx, g.ID)
	require.NoError(t, err)
	require.True(t, created)
	assert.Equal(t, "default", first.Name)

	// a concurrent creator loses the race and gets the SAME row
	second, created2, err := viz.TryCreateDefaultVisualization(ctx, g.ID)
	require.NoError(t, err)
	assert.False(t, created2)
	assert.Equal(t, first.ID, second.ID)
	assert.Equal(t, "default", second.Name)
}
