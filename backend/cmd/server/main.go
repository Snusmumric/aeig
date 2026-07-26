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

	graphRepo := pgstore.NewGraphRepo(pool)
	svc := service.NewGraphService(graphRepo, neo4jstore.NewElementRepo(driver))
	layoutSvc := service.NewLayoutService(pgstore.NewLayoutRepo(pool), graphRepo)

	router := httpapi.NewRouter(httpapi.Deps{Graphs: svc, Layouts: layoutSvc})

	log.Printf("listening on %s", cfg.HTTPAddr)
	if err := http.ListenAndServe(cfg.HTTPAddr, router); err != nil {
		log.Fatalf("server: %v", err)
	}
}
