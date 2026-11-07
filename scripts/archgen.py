#!/usr/bin/env python3
"""Render the AEiG architecture graph — data layer (stage 1) — into an
AEiG-schema seed:

  seed/aeig-arch-graph.sql     — Postgres: one row in `graphs`
  seed/aeig-arch-graph.cypher  — Neo4j: :Element nodes + :REL edges (graphId-scoped)

The model below is the SSOT for the schema diagram. Two layers:

  * physical  — what actually exists in the stores: `store` / `table` / `field`
                (PostgreSQL, strict schema) and `label` / `reltype` / `property`
                (Neo4j, schema-free);
  * domain    — runtime data types shared by Go structs and TS mirrors (`entity`),
                linked to physical structures by how they persist.

Edge vocabulary: stored_in, has_field, has_property, references (FK),
persisted_as, serializes (embedded JSONB), partitions (graphId scoping, no FK),
part_of / belongs_to (domain containment).

Later stages (backend API, frontend UI) extend the same model and graph id.
Idempotent (MERGE / ON CONFLICT). Regenerate + apply with `make arch-regen`.
"""
import pathlib
import sys

import seedgen  # cy_str, cy_props, pg_str — same directory

GRAPH_ID = "c0de0000-0000-4000-8000-000000000003"
GRAPH_NAME = "AEiG architecture — data layer"

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "seed"

NODES = [
    # ── physical layer: stores ──────────────────────────────────────────────
    {"id": "store-pg", "type": "store", "props": {"label": "PostgreSQL", "role": "метаданные: графы, версии, layout'ы"}},
    {"id": "store-neo4j", "type": "store", "props": {"label": "Neo4j", "role": "содержимое графов: вершины и рёбра"}},
    # ── physical layer: PostgreSQL tables and fields ────────────────────────
    {"id": "tbl-graphs", "type": "table", "props": {"label": "graphs", "note": "метаданные графа + оптимистичная версия"}},
    {"id": "fld-graphs-id", "type": "field", "props": {"label": "id", "datatype": "UUID", "constraint": "PK"}},
    {"id": "fld-graphs-name", "type": "field", "props": {"label": "name", "datatype": "TEXT"}},
    {"id": "fld-graphs-version", "type": "field", "props": {"label": "version", "datatype": "BIGINT", "note": "оптимистичная блокировка (409 при конфликте)"}},
    {"id": "fld-graphs-created-at", "type": "field", "props": {"label": "created_at", "datatype": "TIMESTAMPTZ"}},
    {"id": "tbl-layouts", "type": "table", "props": {"label": "layouts", "note": "сохранённые раскладки канваса"}},
    {"id": "fld-layouts-id", "type": "field", "props": {"label": "id", "datatype": "UUID", "constraint": "PK"}},
    {"id": "fld-layouts-graph-id", "type": "field", "props": {"label": "graph_id", "datatype": "UUID", "note": "FK → graphs.id, ON DELETE CASCADE"}},
    {"id": "fld-layouts-name", "type": "field", "props": {"label": "name", "datatype": "TEXT", "note": "UNIQUE (graph_id, name); default — имя дефолтной визуализации"}},
    {"id": "fld-layouts-positions", "type": "field", "props": {"label": "positions", "datatype": "JSONB", "note": "{nodeId: {x, y}}"}},
    {"id": "fld-layouts-viewport", "type": "field", "props": {"label": "viewport", "datatype": "JSONB", "note": "{x, y, zoom}"}},
    {"id": "fld-layouts-node-types", "type": "field", "props": {"label": "node_types", "datatype": "JSONB", "note": "NULL = без фильтра; массив видимых типов вершин"}},
    {"id": "fld-layouts-edge-types", "type": "field", "props": {"label": "edge_types", "datatype": "JSONB", "note": "NULL = без фильтра; массив видимых типов рёбер"}},
    {"id": "fld-layouts-hide-orphans", "type": "field", "props": {"label": "hide_orphans", "datatype": "BOOLEAN", "note": "скрывать изолированные вершины"}},
    {"id": "fld-layouts-is-default", "type": "field", "props": {"label": "is_default", "datatype": "BOOLEAN", "note": "partial unique index layouts_one_default_per_graph — ровно одна default-визуализация на граф"}},
    {"id": "fld-layouts-created-at", "type": "field", "props": {"label": "created_at", "datatype": "TIMESTAMPTZ"}},
    # ── physical layer: Neo4j labels / rel types / properties ──────────────
    {"id": "lbl-element", "type": "label", "props": {"label": ":Element", "note": "вершина пользовательского графа"}},
    {"id": "prp-element-graphid", "type": "property", "props": {"label": "graphId", "note": "ключ партиционирования по графу"}},
    {"id": "prp-element-id", "type": "property", "props": {"label": "id"}},
    {"id": "prp-element-type", "type": "property", "props": {"label": "type", "note": "тип вершины (метамодель)"}},
    {"id": "prp-element-user", "type": "property", "props": {"label": "user props", "note": "произвольные свойства; ключи graphId/id/type зарезервированы"}},
    {"id": "rel-rel", "type": "reltype", "props": {"label": ":REL", "note": "ребро пользовательского графа; :REL всегда направлен (source→target), семантика направления — в метамодели типов (направленные типы рисуются со стрелкой)"}},
    {"id": "prp-rel-graphid", "type": "property", "props": {"label": "graphId", "note": "ключ партиционирования по графу"}},
    {"id": "prp-rel-id", "type": "property", "props": {"label": "id"}},
    {"id": "prp-rel-type", "type": "property", "props": {"label": "type", "note": "тип ребра (метамодель)"}},
    {"id": "prp-rel-source", "type": "property", "props": {"label": "_source", "note": "id вершины-источника"}},
    {"id": "prp-rel-target", "type": "property", "props": {"label": "_target", "note": "id вершины-приёмника"}},
    # ── domain layer: entities (Go structs + TS mirrors) ────────────────────
    {"id": "ent-graph", "type": "entity", "props": {"label": "Graph", "note": "id, name, version, createdAt — Go domain.Graph + TS Graph"}},
    {"id": "ent-layout", "type": "entity", "props": {"label": "Visualization (manifest)", "note": "Go domain.Visualization + TS Visualization; эволюция Layout, таблица layouts сохранена; nodes/edges — манифест состава (память о элементах)"}},
    {"id": "ent-position", "type": "entity", "props": {"label": "Position", "note": "{x, y} — сериализуется в JSONB"}},
    {"id": "ent-viewport", "type": "entity", "props": {"label": "Viewport", "note": "{x, y, zoom}"}},
    {"id": "ent-nodetypes", "type": "entity", "props": {"label": "NodeTypes", "note": "[]string | null — видимые типы вершин"}},
    {"id": "ent-edgetypes", "type": "entity", "props": {"label": "EdgeTypes", "note": "[]string | null — видимые типы рёбер"}},
    {"id": "ent-hideorphans", "type": "entity", "props": {"label": "HideOrphans", "note": "bool — фильтр изолированных вершин"}},
    {"id": "ent-node", "type": "entity", "props": {"label": "Node", "note": "id, type, properties — Go domain.Node + TS GraphNode"}},
    {"id": "ent-edge", "type": "entity", "props": {"label": "Edge", "note": "id, type, source, target, properties — Go domain.Edge + TS GraphEdge"}},
    {"id": "ent-subgraph", "type": "entity", "props": {"label": "Subgraph", "transient": True, "note": "{nodes, edges} — ответ GET /subgraph; не хранится"}},
    {"id": "ent-mutations", "type": "entity", "props": {"label": "Mutations", "transient": True, "note": "тело POST /mutations; не хранится"}},
    # ── visualization manifest (0005) — appended at the END: node/edge ids are
    # positional in the seed, inserting mid-list would renumber existing ids ──
    {"id": "fld-layouts-graph-version", "type": "field", "props": {"label": "graph_version", "datatype": "BIGINT", "note": "версия графа последнего sync"}},
    {"id": "fld-layouts-nodes", "type": "field", "props": {"label": "nodes", "datatype": "JSONB", "note": "манифест узлов — {id: {type, label, x, y}}; NULL = legacy"}},
    {"id": "fld-layouts-edges", "type": "field", "props": {"label": "edges", "datatype": "JSONB", "note": "манифест рёбер — {id: {type, source, target}}; NULL = legacy"}},
    {"id": "ent-manifest-nodes", "type": "entity", "props": {"label": "ManifestNodes", "note": "map[string]ManifestNode — память визуализации о составе узлов"}},
    {"id": "ent-manifest-edges", "type": "entity", "props": {"label": "ManifestEdges", "note": "map[string]ManifestEdge — память визуализации о составе рёбер"}},
    # ── edge bends (0006) — appended at the END: node ids are positional in
    # the seed, inserting mid-list would renumber existing ids ────────────
    {"id": "fld-layouts-bends", "type": "field", "props": {"label": "bends", "datatype": "JSONB", "note": "изгибы рёбер — относительные офсеты {dx,dy} от середины"}},
    {"id": "ent-edge-bends", "type": "entity", "props": {"label": "EdgeBends", "note": "{edgeId → {dx,dy}}; автосейв шлёт полную карту от живых рёбер"}},
]

EDGES = [
    # physical: containment
    {"source": "tbl-graphs", "target": "store-pg", "type": "stored_in"},
    {"source": "tbl-layouts", "target": "store-pg", "type": "stored_in"},
    {"source": "tbl-graphs", "target": "fld-graphs-id", "type": "has_field"},
    {"source": "tbl-graphs", "target": "fld-graphs-name", "type": "has_field"},
    {"source": "tbl-graphs", "target": "fld-graphs-version", "type": "has_field"},
    {"source": "tbl-graphs", "target": "fld-graphs-created-at", "type": "has_field"},
    {"source": "tbl-layouts", "target": "fld-layouts-id", "type": "has_field"},
    {"source": "tbl-layouts", "target": "fld-layouts-graph-id", "type": "has_field"},
    {"source": "tbl-layouts", "target": "fld-layouts-name", "type": "has_field"},
    {"source": "tbl-layouts", "target": "fld-layouts-positions", "type": "has_field"},
    {"source": "tbl-layouts", "target": "fld-layouts-viewport", "type": "has_field"},
    {"source": "tbl-layouts", "target": "fld-layouts-node-types", "type": "has_field"},
    {"source": "tbl-layouts", "target": "fld-layouts-created-at", "type": "has_field"},
    # physical: FK inside PostgreSQL
    {"source": "fld-layouts-graph-id", "target": "tbl-graphs", "type": "references", "props": {"note": "ON DELETE CASCADE"}},
    # physical: Neo4j
    {"source": "lbl-element", "target": "store-neo4j", "type": "stored_in"},
    {"source": "rel-rel", "target": "store-neo4j", "type": "stored_in"},
    {"source": "lbl-element", "target": "prp-element-graphid", "type": "has_property"},
    {"source": "lbl-element", "target": "prp-element-id", "type": "has_property"},
    {"source": "lbl-element", "target": "prp-element-type", "type": "has_property"},
    {"source": "lbl-element", "target": "prp-element-user", "type": "has_property"},
    {"source": "rel-rel", "target": "prp-rel-graphid", "type": "has_property"},
    {"source": "rel-rel", "target": "prp-rel-id", "type": "has_property"},
    {"source": "rel-rel", "target": "prp-rel-type", "type": "has_property"},
    {"source": "rel-rel", "target": "prp-rel-source", "type": "has_property"},
    {"source": "rel-rel", "target": "prp-rel-target", "type": "has_property"},
    # cross-store: graphId scoping (no FK)
    {"source": "tbl-graphs", "target": "lbl-element", "type": "partitions", "props": {"note": "graphs.id живёт как :Element.graphId — связи без FK"}},
    {"source": "tbl-graphs", "target": "rel-rel", "type": "partitions", "props": {"note": "graphs.id живёт как :REL.graphId — связи без FK"}},
    # domain → physical
    {"source": "ent-graph", "target": "tbl-graphs", "type": "persisted_as"},
    {"source": "ent-layout", "target": "tbl-layouts", "type": "persisted_as"},
    {"source": "ent-node", "target": "lbl-element", "type": "persisted_as"},
    {"source": "ent-edge", "target": "rel-rel", "type": "persisted_as"},
    {"source": "ent-position", "target": "fld-layouts-positions", "type": "serializes"},
    {"source": "ent-viewport", "target": "fld-layouts-viewport", "type": "serializes"},
    {"source": "ent-nodetypes", "target": "fld-layouts-node-types", "type": "serializes"},
    # domain containment
    {"source": "ent-position", "target": "ent-layout", "type": "part_of"},
    {"source": "ent-viewport", "target": "ent-layout", "type": "part_of"},
    {"source": "ent-nodetypes", "target": "ent-layout", "type": "part_of"},
    {"source": "ent-layout", "target": "ent-graph", "type": "belongs_to"},
    # ── visualization evolution (0004) ────────────────────────────────────────
    # Appended at the END on purpose: edge ids are positional (e0..eN), and
    # inserting mid-list would renumber — and thus duplicate — every later edge.
    {"source": "tbl-layouts", "target": "fld-layouts-edge-types", "type": "has_field"},
    {"source": "tbl-layouts", "target": "fld-layouts-hide-orphans", "type": "has_field"},
    {"source": "tbl-layouts", "target": "fld-layouts-is-default", "type": "has_field"},
    {"source": "ent-edgetypes", "target": "fld-layouts-edge-types", "type": "serializes"},
    {"source": "ent-hideorphans", "target": "fld-layouts-hide-orphans", "type": "serializes"},
    {"source": "ent-edgetypes", "target": "ent-layout", "type": "part_of"},
    {"source": "ent-hideorphans", "target": "ent-layout", "type": "part_of"},
    # ── visualization manifest (0005) — appended at the END on purpose: edge
    # ids are positional (e0..eN), inserting mid-list would renumber every
    # later edge and duplicate it in Neo4j (MERGE is by id). ─────────────────
    {"source": "tbl-layouts", "target": "fld-layouts-graph-version", "type": "has_field"},
    {"source": "tbl-layouts", "target": "fld-layouts-nodes", "type": "has_field"},
    {"source": "tbl-layouts", "target": "fld-layouts-edges", "type": "has_field"},
    {"source": "ent-manifest-nodes", "target": "fld-layouts-nodes", "type": "serializes"},
    {"source": "ent-manifest-edges", "target": "fld-layouts-edges", "type": "serializes"},
    {"source": "ent-manifest-nodes", "target": "ent-layout", "type": "part_of"},
    {"source": "ent-manifest-edges", "target": "ent-layout", "type": "part_of"},
    # ── edge bends (0006) — appended at the END on purpose: edge ids are
    # positional (e0..eN), inserting mid-list would renumber every later
    # edge and duplicate it in Neo4j (MERGE is by id). ─────────────────────
    {"source": "tbl-layouts", "target": "fld-layouts-bends", "type": "has_field"},
    {"source": "ent-edge-bends", "target": "fld-layouts-bends", "type": "serializes"},
    {"source": "ent-edge-bends", "target": "ent-layout", "type": "part_of"},
]


def main() -> None:
    OUT.mkdir(exist_ok=True)

    sql = (
        "-- Generated by scripts/archgen.py. Do not edit by hand.\n"
        "INSERT INTO graphs (id, name) VALUES\n"
        f"  ('{GRAPH_ID}', {seedgen.pg_str(GRAPH_NAME)})\n"
        "ON CONFLICT (id) DO NOTHING;\n"
    )
    (OUT / "aeig-arch-graph.sql").write_text(sql, encoding="utf-8")

    node_rows = [
        f"  {{id: {seedgen.cy_str(n['id'])}, type: {seedgen.cy_str(n['type'])}, props: {seedgen.cy_props(n['props'])}}}"
        for n in NODES
    ]
    edge_rows = [
        f"  {{id: {seedgen.cy_str('e' + str(i))}, type: {seedgen.cy_str(e['type'])}, "
        f"source: {seedgen.cy_str(e['source'])}, target: {seedgen.cy_str(e['target'])}, props: {seedgen.cy_props(e.get('props', {}))}}}"
        for i, e in enumerate(EDGES)
    ]
    gid = seedgen.cy_str(GRAPH_ID)
    cypher = (
        "// Generated by scripts/archgen.py. Do not edit by hand.\n"
        f"UNWIND [\n{','.join(chr(10) + r for r in node_rows)}\n] AS n\n"
        f"MERGE (x:Element {{graphId: {gid}, id: n.id}})\n"
        "SET x.type = n.type, x += n.props;\n\n"
        f"UNWIND [\n{','.join(chr(10) + r for r in edge_rows)}\n] AS e\n"
        f"MATCH (s:Element {{graphId: {gid}, id: e.source}})\n"
        f"MATCH (t:Element {{graphId: {gid}, id: e.target}})\n"
        f"MERGE (s)-[r:REL {{graphId: {gid}, id: e.id}}]->(t)\n"
        "SET r.type = e.type, r += e.props;\n"
    )
    (OUT / "aeig-arch-graph.cypher").write_text(cypher, encoding="utf-8")

    print(f"archgen: {len(NODES)} nodes, {len(EDGES)} edges → seed/aeig-arch-graph.{{sql,cypher}}")


if __name__ == "__main__":
    main()
