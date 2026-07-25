package config

import (
	"fmt"
	"os"
)

type Config struct {
	HTTPAddr      string
	Neo4jURI      string
	Neo4jUser     string
	Neo4jPassword string
	PostgresDSN   string
}

func Load() (Config, error) {
	cfg := Config{
		HTTPAddr:      os.Getenv("HTTP_ADDR"),
		Neo4jURI:      os.Getenv("NEO4J_URI"),
		Neo4jUser:     os.Getenv("NEO4J_USER"),
		Neo4jPassword: os.Getenv("NEO4J_PASSWORD"),
		PostgresDSN:   os.Getenv("POSTGRES_DSN"),
	}
	if cfg.HTTPAddr == "" {
		cfg.HTTPAddr = ":8080"
	}
	required := map[string]string{
		"NEO4J_URI":      cfg.Neo4jURI,
		"NEO4J_USER":     cfg.Neo4jUser,
		"NEO4J_PASSWORD": cfg.Neo4jPassword,
		"POSTGRES_DSN":   cfg.PostgresDSN,
	}
	for name, val := range required {
		if val == "" {
			return Config{}, fmt.Errorf("missing required env var %s", name)
		}
	}
	return cfg, nil
}
