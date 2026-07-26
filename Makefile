.PHONY: setup graph graph-refresh test test-integration dev down seed-regen

dev: ## run the full dev stack in one command (databases + backend + frontend)
	./scripts/dev.sh

down: ## stop the dev databases (docker compose)
	docker compose down

seed-regen: ## regenerate the AEiG code-graph seed from graphify-out/graph.json
	python3 scripts/seedgen.py

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
