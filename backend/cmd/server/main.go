package main

import (
	"log"
	"net/http"

	"github.com/aeig/backend/internal/config"
	"github.com/aeig/backend/internal/httpapi"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}
	log.Printf("listening on %s", cfg.HTTPAddr)
	if err := http.ListenAndServe(cfg.HTTPAddr, httpapi.NewRouter()); err != nil {
		log.Fatalf("server: %v", err)
	}
}
