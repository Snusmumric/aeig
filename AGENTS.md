# Agent instructions

See [CLAUDE.md](CLAUDE.md). In particular:

- Run `make setup` once per clone (installs the graphify commit hooks + integration).
- Keep the `graphify-out/` code knowledge graph in sync per the **"Code knowledge graph — cadence"** rule in CLAUDE.md: after any change to code, ensure `graphify-out/` is rebuilt (`make graph-refresh`) and committed.
- For codebase questions, query the graph first: `graphify query "<question>"`.
