.PHONY: setup graph graph-refresh test test-integration

setup: ## one-time per clone: install graphify commit hooks + CLAUDE.md/agent integration
	command -v graphify >/dev/null 2>&1 || uv tool install graphifyy
	graphify hook install
	graphify claude install

graph: ## full rebuild of the code knowledge graph (force)
	graphify update . --force

graph-refresh: ## incremental refresh — what the commit hook runs
	graphify update .

test: ## backend unit tests
	cd backend && go test ./...

test-integration: ## backend integration tests (requires Docker)
	cd backend && go test -tags=integration ./...
