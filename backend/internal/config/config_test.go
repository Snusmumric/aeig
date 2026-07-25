package config

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLoad_ReadsAllVars(t *testing.T) {
	t.Setenv("HTTP_ADDR", ":9090")
	t.Setenv("NEO4J_URI", "bolt://localhost:7687")
	t.Setenv("NEO4J_USER", "neo4j")
	t.Setenv("NEO4J_PASSWORD", "secret")
	t.Setenv("POSTGRES_DSN", "postgres://u:p@localhost:5432/aeig")

	cfg, err := Load()
	require.NoError(t, err)
	assert.Equal(t, ":9090", cfg.HTTPAddr)
	assert.Equal(t, "bolt://localhost:7687", cfg.Neo4jURI)
	assert.Equal(t, "secret", cfg.Neo4jPassword)
	assert.Equal(t, "postgres://u:p@localhost:5432/aeig", cfg.PostgresDSN)
}

func TestLoad_DefaultsHTTPAddr(t *testing.T) {
	t.Setenv("HTTP_ADDR", "")
	t.Setenv("NEO4J_URI", "bolt://localhost:7687")
	t.Setenv("NEO4J_USER", "neo4j")
	t.Setenv("NEO4J_PASSWORD", "secret")
	t.Setenv("POSTGRES_DSN", "postgres://u:p@localhost:5432/aeig")

	cfg, err := Load()
	require.NoError(t, err)
	assert.Equal(t, ":8080", cfg.HTTPAddr)
}

func TestLoad_MissingRequired(t *testing.T) {
	t.Setenv("HTTP_ADDR", ":8080")
	t.Setenv("NEO4J_URI", "")
	t.Setenv("NEO4J_USER", "neo4j")
	t.Setenv("NEO4J_PASSWORD", "secret")
	t.Setenv("POSTGRES_DSN", "postgres://u:p@localhost:5432/aeig")

	_, err := Load()
	require.Error(t, err)
	assert.Contains(t, err.Error(), "NEO4J_URI")
}
