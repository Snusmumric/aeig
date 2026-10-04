#!/usr/bin/env python3
"""Convert the PAIW roadmap tracker (roadmap.md) into an AEiG-schema seed:

  seed/roadmap-graph.sql     — Postgres: one row in `graphs`
  seed/roadmap-graph.cypher  — Neo4j: :Element nodes + :REL edges (graphId-scoped)

The markdown tracker is the SSOT (default ~/.paiw/projects/personal/aeig/roadmap.md,
override with ROADMAP_MD). Node types: phase / slice / feature / simplification /
extension. Edge types: contains (phase->item), next (phase chain), depends_on
(slice chain), revisit (simplification -> phase mentioned in the bullet).
Idempotent (MERGE / ON CONFLICT). Regenerate with `make roadmap-regen`.
"""
import os
import pathlib
import re
import sys

import seedgen  # cy_str, cy_props, pg_str — same directory

GRAPH_ID = "c0de0000-0000-4000-8000-000000000002"
GRAPH_NAME = "AEiG roadmap (PAIW tracker)"

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "seed"

PHASE_RE = re.compile(r"^##\s+Phase\s+(\d+)\s+—\s+«(.+?)»\s*(.*)$")
LATER_RE = re.compile(r"^##\s+Later\b")
SIMPL_RE = re.compile(r"^##\s+.*simplifications", re.IGNORECASE)
SECTION_RE = re.compile(r"^##\s+")
BULLET_RE = re.compile(r"^-\s+(.*)$")
BOLD_RE = re.compile(r"^\*\*(.+?)\*\*\s*(.*)$")
META_RE = re.compile(r"^(Result|Source|Needs its own|Tests|Known gap)\b")


def md_path() -> pathlib.Path:
    return pathlib.Path(os.environ.get("ROADMAP_MD", "")) if os.environ.get("ROADMAP_MD") else (
        pathlib.Path.home() / ".paiw" / "projects" / "personal" / "aeig" / "roadmap.md"
    )


def short_label(text: str) -> str:
    cut = re.split(r":| \(", text)[0].strip().replace("**", "")
    return (cut or text.replace("**", ""))[:60].strip()


def phase_status(rest: str) -> str:
    if "DONE" in rest:
        return "done"
    if "next" in rest:
        return "next"
    return "planned"


def parse(md: str):
    nodes, edges = [], []
    phases = []  # ordered phase node ids
    section = None  # None | ('phase', n) | ('later',) | ('simpl',) | ('other',)
    later_lines = []

    def add_node(nid, typ, label, props):
        nodes.append({"id": nid, "type": typ, "props": {"label": label, **props}})

    def add_edge(src, tgt, typ, props=None):
        edges.append({"source": src, "target": tgt, "type": typ, "props": props or {}})

    for line in md.splitlines():
        m = PHASE_RE.match(line)
        if m:
            num, title, rest = m.group(1), m.group(2), m.group(3)
            status = phase_status(rest)
            nid = f"p{num}"
            props = {"status": status}
            dm = re.search(r"\((\d{4}-\d{2}-\d{2})\)", rest)
            if status == "done" and dm:
                props["done"] = dm.group(1)
            add_node(nid, "phase", f"P{num} «{title}»", props)
            phases.append(nid)
            section = ("phase", num)
            later_lines = []
            continue
        if LATER_RE.match(line):
            section = ("later",)
            later_lines = []
            continue
        if SIMPL_RE.match(line):
            section = ("simpl",)
            continue
        if SECTION_RE.match(line):
            section = ("other",)
            continue
        if section is None:
            continue

        if section[0] == "later":
            if line.strip() and not line.strip().startswith("---"):
                later_lines.append(line.strip())
            continue

        b = BULLET_RE.match(line)
        if not b:
            continue
        text = b.group(1).strip()
        bm = BOLD_RE.match(text)
        bold, rest_text = (bm.group(1), bm.group(2)) if bm else ("", text)

        if section[0] == "simpl":
            k = sum(1 for n in nodes if n["type"] == "simplification") + 1
            nid = f"simpl-{k}"
            add_node(nid, "simplification", short_label(text), {"details": text})
            add_edge("p1", nid, "contains")
            pm = re.search(r"Phase\s+(\d+)", text)
            if pm:
                add_edge(nid, f"p{pm.group(1)}", "revisit")
            continue

        num = section[1]
        if META_RE.match(text):
            continue
        k = sum(1 for n in nodes if n["id"].startswith(f"p{num}-")) + 1
        nid = f"p{num}-{k}"
        if re.fullmatch(r"\d[A-D]", bold):
            typ = "slice"
        else:
            typ = "feature"
        label = short_label(f"{bold} {rest_text}".strip()) if bold else short_label(text)
        add_node(nid, typ, label, {"details": text})
        add_edge(f"p{num}", nid, "contains")

    # phase chain
    for a, b in zip(phases, phases[1:]):
        add_edge(a, b, "next")
    # slice chains inside a phase (1A->1B->...)
    for num in {n["id"].split("-")[0] for n in nodes if n["type"] == "slice"}:
        chain = [n["id"] for n in nodes if n["type"] == "slice" and n["id"].startswith(f"{num}-")]
        for a, b in zip(chain, chain[1:]):
            add_edge(a, b, "depends_on")
    # later: one extension node chained after the last phase
    if later_lines:
        add_node("later", "extension", "Later (extension points)", {"details": " ".join(later_lines)})
        if phases:
            add_edge(phases[-1], "later", "next")

    return nodes, edges


def main() -> None:
    src = md_path()
    if not src.is_file():
        print(f"roadmapgen: {src} not found (set ROADMAP_MD)", file=sys.stderr)
        sys.exit(1)
    nodes, edges = parse(src.read_text(encoding="utf-8"))
    OUT.mkdir(exist_ok=True)

    sql = (
        "-- Generated by scripts/roadmapgen.py from the PAIW roadmap.md. Do not edit by hand.\n"
        "INSERT INTO graphs (id, name) VALUES\n"
        f"  ('{GRAPH_ID}', {seedgen.pg_str(GRAPH_NAME)})\n"
        "ON CONFLICT (id) DO NOTHING;\n"
    )
    (OUT / "roadmap-graph.sql").write_text(sql, encoding="utf-8")

    node_rows = [
        f"  {{id: {seedgen.cy_str(n['id'])}, type: {seedgen.cy_str(n['type'])}, props: {seedgen.cy_props(n['props'])}}}"
        for n in nodes
    ]
    edge_rows = [
        f"  {{id: {seedgen.cy_str('e' + str(i))}, type: {seedgen.cy_str(e['type'])}, "
        f"source: {seedgen.cy_str(e['source'])}, target: {seedgen.cy_str(e['target'])}, props: {seedgen.cy_props(e['props'])}}}"
        for i, e in enumerate(edges)
    ]
    gid = seedgen.cy_str(GRAPH_ID)
    cypher = (
        "// Generated by scripts/roadmapgen.py from the PAIW roadmap.md. Do not edit by hand.\n"
        f"UNWIND [\n{','.join(chr(10) + r for r in node_rows)}\n] AS n\n"
        f"MERGE (x:Element {{graphId: {gid}, id: n.id}})\n"
        "SET x.type = n.type, x += n.props;\n\n"
        f"UNWIND [\n{','.join(chr(10) + r for r in edge_rows)}\n] AS e\n"
        f"MATCH (s:Element {{graphId: {gid}, id: e.source}})\n"
        f"MATCH (t:Element {{graphId: {gid}, id: e.target}})\n"
        f"MERGE (s)-[r:REL {{graphId: {gid}, id: e.id}}]->(t)\n"
        "SET r.type = e.type, r += e.props;\n"
    )
    (OUT / "roadmap-graph.cypher").write_text(cypher, encoding="utf-8")

    print(f"roadmap seed: {len(nodes)} nodes, {len(edges)} edges -> {OUT}/ (graphId={GRAPH_ID})")


if __name__ == "__main__":
    main()
