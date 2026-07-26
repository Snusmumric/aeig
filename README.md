# AEiG

Browser app for creating, storing, and displaying arbitrary **typed graphs** with metamodels and validation.

- **Backend** — Go (chi), REST API over **Neo4j** (graph data) + **PostgreSQL** (app metadata: graphs registry, layouts, versions).
- **Frontend** — React + TypeScript + React Flow (Vite).
- **Design & plans** — `docs/superpowers/specs/` and `docs/superpowers/plans/`.

Status: **Phase 1 «Ядро» complete** — a working typed-graph editor. See the design spec for the roadmap (Phases 2–4).

## Prerequisites

- **Docker** (for Postgres + Neo4j via `docker-compose.yml`)
- **Go 1.22+**
- **Node 18+** (Vite/Vitest). If your default is older: `nvm use 20`.

## Run the whole stack — one command

```bash
nvm use 20        # ensure Node 18+
make dev
```

`make dev` (see `scripts/dev.sh`) does everything:

1. starts the databases (`docker compose up -d`),
2. waits for Postgres and Neo4j to be ready,
3. starts the **backend** on `:8080` (migrations run on start),
4. seeds a **demo graph** (the UI has no create-graph screen yet) and prints its URL,
5. starts the **frontend** on `:5173` (Vite proxies `/graphs` and `/health` to the backend, so the browser talks same-origin — no CORS).

Then open the printed URL, e.g. **`http://localhost:5173/?graph=<id>`**. Use **Add Task** to create nodes and **Save layout** to persist positions.

**Stop:** press `Ctrl+C` (stops backend + frontend); then `make down` stops the databases.

### Port 5432 already in use?

If another Postgres holds host port 5432, run on an alternate port:

```bash
PG_PORT=5433 make dev
```

Overridable env for `make dev`: `PG_PORT` (Postgres host port, default 5432), `PGPW` (Postgres dev password, default `devpass`), `NEO4J_PW` (must match `NEO4J_AUTH` in `docker-compose.yml`, default `password123`), `HTTP_ADDR` (default `:8080`).

## Run pieces manually

Databases:
```bash
POSTGRES_PASSWORD=devpass docker compose up -d      # add PG_PORT=5433 to remap
```

Backend (from repo root):
```bash
NEO4J_PW=password123    # matches NEO4J_AUTH in docker-compose.yml
export HTTP_ADDR=:8080 NEO4J_URI=bolt://localhost:7687 NEO4J_USER=neo4j
export NEO4J_PASSWORD="$NEO4J_PW"
export POSTGRES_DSN="postgres://aeig:devpass@localhost:5432/aeig?sslmode=disable"
(cd backend && go run ./cmd/server)
```

Frontend (Node 20, separate terminal):
```bash
cd frontend && npm run dev
```

Create a graph (no UI flow yet), then open it:
```bash
curl -s -XPOST localhost:8080/graphs -d '{"name":"demo"}'   # → {"id":"<uuid>", ...}
# open http://localhost:5173/?graph=<uuid>
```

> The backend currently serves only the REST API. Serving the built frontend from the Go binary (single-server, `frontend/dist` + SPA fallback) is a planned small addition; the relative API base already makes that same-origin too.

## Develop

Backend (from `backend/`):
```bash
go build ./... && go vet ./...
go test ./...                    # unit
go test -tags=integration ./...  # integration (needs Docker; testcontainers)
```

Frontend (from `frontend/`, Node 20):
```bash
npm test        # Vitest
npm run build   # tsc -b && vite build
```

Code knowledge graph (graphify) is committed under `graphify-out/` and kept in sync by a commit hook. Run `make setup` once per clone; query it with `graphify query "<question>"`.

## Make targets

| Target | What |
|---|---|
| `make dev` | full dev stack in one command |
| `make down` | stop the dev databases |
| `make setup` | install graphify commit hooks + integration (once per clone) |
| `make graph` / `make graph-refresh` | rebuild the code knowledge graph |
| `make test` / `make test-integration` | backend tests |
