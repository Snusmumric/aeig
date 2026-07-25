package main

import (
	"context"
	"log"
	"net/http"

	"github.com/aeig/backend/internal/config"
	"github.com/aeig/backend/internal/httpapi"
	"github.com/aeig/backend/internal/service"
	neo4jstore "github.com/aeig/backend/internal/storage/neo4j"
	pgstore "github.com/aeig/backend/internal/storage/postgres"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	if err := pgstore.RunMigrations(cfg.PostgresDSN); err != nil {
		log.Fatalf("migrate: %v", err)
	}

	ctx := context.Background()
	pool, err := pgstore.NewPool(ctx, cfg.PostgresDSN)
	if err != nil {
		log.Fatalf("postgres: %v", err)
	}
	defer pool.Close()

	driver, err := neo4jstore.NewDriver(cfg.Neo4jURI, cfg.Neo4jUser, cfg.Neo4jPassword)
	if err != nil {
		log.Fatalf("neo4j: %v", err)
	}
	defer driver.Close(ctx)

	svc := service.NewGraphService(
		pgstore.NewGraphRepo(pool),
		neo4jstore.NewElementRepo(driver),
	)

	log.Printf("listening on %s", cfg.HTTPAddr)
	if err := http.ListenAndServe(cfg.HTTPAddr, httpapi.NewRouter(svc)); err != nil {
		log.Fatalf("server: %v", err)
	}
}
