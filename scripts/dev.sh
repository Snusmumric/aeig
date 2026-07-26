#!/usr/bin/env bash
# One-command dev stack: databases + backend (REST API) + frontend (Vite, proxied).
# Overridable via env: PG_PORT, PGPW, NEO4J_PW, HTTP_ADDR.
set -euo pipefail

PG_PORT="${PG_PORT:-5432}"
PGPW="${PGPW:-devpass}"
NEO4J_PW="${NEO4J_PW:-password123}"   # must match NEO4J_AUTH in docker-compose.yml
HTTP_ADDR="${HTTP_ADDR:-:8080}"
API="http://localhost${HTTP_ADDR}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# --- prerequisites ---
command -v docker >/dev/null || { echo "ERROR: docker is required"; exit 1; }
docker info >/dev/null 2>&1 || { echo "ERROR: docker daemon is not running"; exit 1; }
command -v go >/dev/null || { echo "ERROR: go is required"; exit 1; }
NODE_MAJOR="$(node -v 2>/dev/null | sed -E 's/v([0-9]+).*/\1/')"
if [ -z "${NODE_MAJOR:-}" ] || [ "$NODE_MAJOR" -lt 18 ]; then
  echo "ERROR: Node 18+ required (found: $(node -v 2>/dev/null || echo none)). Run: nvm use 20"
  exit 1
fi

# --- databases ---
echo "==> starting databases (Postgres :$PG_PORT, Neo4j :7687)"
POSTGRES_PASSWORD="$PGPW" PG_PORT="$PG_PORT" docker compose up -d

echo "==> waiting for Postgres"
for _ in $(seq 1 30); do
  docker compose exec -T postgres pg_isready -U aeig >/dev/null 2>&1 && break
  sleep 1
done

echo "==> waiting for Neo4j (bolt :7687)"
for _ in $(seq 1 60); do
  (exec 3<>/dev/tcp/localhost/7687) 2>/dev/null && { exec 3>&- 3<&-; break; }
  sleep 1
done

# --- backend (background; migrations run on start) ---
export HTTP_ADDR
export NEO4J_URI="bolt://localhost:7687"
export NEO4J_USER="neo4j"
export NEO4J_PASSWORD="$NEO4J_PW"
export POSTGRES_DSN="postgres://aeig:${PGPW}@localhost:${PG_PORT}/aeig?sslmode=disable"

echo "==> starting backend ($API)"
( cd backend && go run ./cmd/server ) &
BACK_PID=$!

cleanup() {
  echo
  echo "==> stopping backend"
  kill "$BACK_PID" 2>/dev/null || true
  echo "    databases are still up — run 'make down' to stop them."
}
trap cleanup EXIT INT TERM

echo "==> waiting for API /health"
for _ in $(seq 1 30); do
  curl -fsS "$API/health" >/dev/null 2>&1 && break
  sleep 1
done

# --- seed a demo graph (the UI has no create-graph flow yet) ---
GID="$(curl -fsS -XPOST "$API/graphs" -d '{"name":"demo"}' | sed -E 's/.*"id":"([^"]+)".*/\1/')"
echo "==> demo graph created: $GID"
echo "==> OPEN:  http://localhost:5173/?graph=$GID"

# --- frontend (foreground; Ctrl+C stops everything via the trap) ---
echo "==> starting frontend (Vite :5173) — press Ctrl+C to stop the whole stack"
( cd frontend && npm run dev )
