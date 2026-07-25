## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## Code knowledge graph — cadence (enforced)

`graphify-out/` is the committed, authoritative code knowledge graph and MUST stay in sync with the code:

- Run `make setup` **once per clone** to (re)install the post-commit/post-checkout git hooks and the CLAUDE.md/PreToolUse integration — git does not clone hooks, and the hooks use a machine-local graphify path (so `.claude/` is gitignored and regenerated here).
- The post-commit hook re-extracts changed code and rebuilds `graphify-out/` after each commit. Because a post-commit hook cannot amend its own commit, **commit the refreshed graph**: after finishing any change to code, run `make graph-refresh`, then `git add graphify-out/graph.json graphify-out/GRAPH_REPORT.md graphify-out/manifest.json graphify-out/.graphify_labels.json && git commit`. Any agent finishing a code task must leave `graphify-out/` rebuilt and committed.
- The graph is scoped to source code via `.graphifyignore` (docs, notes, and generated dirs are excluded). Only `graph.json`, `GRAPH_REPORT.md`, `manifest.json`, and `.graphify_labels.json` are committed; `graph.html`, `cache/`, backups, and internal markers are gitignored.

