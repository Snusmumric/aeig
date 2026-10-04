PGPW ?= devpass
NEO4J_PW ?= password123

.PHONY: setup graph graph-refresh test test-integration dev down seed-regen roadmap-regen

dev: ## run the full dev stack in one command (databases + backend + frontend)
	./scripts/dev.sh

down: ## stop the dev databases (docker compose)
	docker compose down

seed-regen: ## regenerate the AEiG code-graph seed from graphify-out/graph.json
	python3 scripts/seedgen.py

roadmap-regen: ## regenerate the roadmap seed; apply it to a running dev stack, seed-files-only otherwise
	python3 scripts/roadmapgen.py
	@RUNNING=$$(docker compose ps --services --filter status=running 2>/dev/null); \
	if echo "$$RUNNING" | grep -qx postgres && echo "$$RUNNING" | grep -qx neo4j; then \
		echo "==> local dev DB is up — applying the roadmap seed"; \
		docker compose exec -T -e PGPASSWORD=$(PGPW) postgres psql -q -U aeig -d aeig < seed/roadmap-graph.sql; \
		docker compose exec -T neo4j cypher-shell -u neo4j -p $(NEO4J_PW) < seed/roadmap-graph.cypher >/dev/null; \
		echo "    roadmap graph updated in the running databases"; \
	else \
		echo "==> no local dev DB found — seed files only (applied on the next 'make dev')"; \
	fi

setup: ## one-time per clone: install graphify commit hooks + CLAUDE.md/agent integration
	command -v graphify >/dev/null 2>&1 || uv tool install graphifyy
	graphify hook install
	graphify claude install

graph: ## full rebuild of the code knowledge graph (force)
	PYTHONHASHSEED=0 graphify update . --force

graph-refresh: ## incremental refresh — what the commit hook runs
	PYTHONHASHSEED=0 graphify update .

test: ## backend unit tests
	cd backend && go test ./...

test-integration: ## backend integration tests (requires Docker)
	cd backend && go test -tags=integration ./...
