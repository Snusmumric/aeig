import { createClient } from './api/client'
import { GraphEditor } from './graph/GraphEditor'
import type { TypeStyleMap } from './graph/typeStyle'

// Default to a relative base ('') so the browser talks to the same origin:
// in dev the Vite proxy forwards /graphs and /health to the Go server; when the
// backend serves the built frontend, requests are same-origin too. Override with
// VITE_API_URL for cross-origin setups.
const client = createClient(import.meta.env.VITE_API_URL ?? '')

const styles: TypeStyleMap = {
  // sample metamodel types
  Task: { shape: 'rectangle', color: '#3366cc' },
  Milestone: { shape: 'diamond', color: '#cc6633' },
  depends_on: { shape: 'rectangle', color: '#888888' },
  // AEiG code-graph seed types (see scripts/seedgen.py) — backend
  service: { shape: 'rectangle', color: '#3b82f6' },
  httpapi: { shape: 'rectangle', color: '#06b6d4' },
  domain: { shape: 'ellipse', color: '#8b5cf6' },
  pg: { shape: 'rectangle', color: '#10b981' },
  neo4j: { shape: 'rectangle', color: '#22c55e' },
  config: { shape: 'rectangle', color: '#64748b' },
  cmd: { shape: 'diamond', color: '#f59e0b' },
  backend: { shape: 'rectangle', color: '#475569' },
  // frontend
  'fe-graph': { shape: 'rectangle', color: '#ec4899' },
  'fe-api': { shape: 'rectangle', color: '#f43f5e' },
  'fe-app': { shape: 'rectangle', color: '#e11d48' },
  'fe-test': { shape: 'rectangle', color: '#a855f7' },
  frontend: { shape: 'rectangle', color: '#9333ea' },
  code: { shape: 'rectangle', color: '#94a3b8' },
  // roadmap graph types (see scripts/roadmapgen.py)
  phase: { shape: 'diamond', color: '#dc2626' },
  slice: { shape: 'rectangle', color: '#f97316' },
  feature: { shape: 'rectangle', color: '#0ea5e9' },
  simplification: { shape: 'rectangle', color: '#94a3b8' },
  extension: { shape: 'ellipse', color: '#65a30d' },
  contains: { shape: 'rectangle', color: '#cbd5e1' },
  next: { shape: 'rectangle', color: '#dc2626' },
  revisit: { shape: 'rectangle', color: '#64748b' },
  // architecture graph types (see scripts/archgen.py) — data layer
  store: { shape: 'diamond', color: '#0d9488' },
  table: { shape: 'rectangle', color: '#059669' },
  field: { shape: 'rectangle', color: '#15803d' },
  label: { shape: 'rectangle', color: '#16a34a' },
  reltype: { shape: 'rectangle', color: '#4ade80' },
  property: { shape: 'rectangle', color: '#166534' },
  entity: { shape: 'ellipse', color: '#8b5cf6' },
  stored_in: { shape: 'rectangle', color: '#0d9488' },
  has_field: { shape: 'rectangle', color: '#cbd5e1' },
  has_property: { shape: 'rectangle', color: '#cbd5e1' },
  references: { shape: 'rectangle', color: '#ef4444' },
  persisted_as: { shape: 'rectangle', color: '#8b5cf6' },
  serializes: { shape: 'rectangle', color: '#a78bfa' },
  partitions: { shape: 'rectangle', color: '#f59e0b' },
  part_of: { shape: 'rectangle', color: '#c4b5fd' },
  belongs_to: { shape: 'rectangle', color: '#7c3aed' },
}

// Default to the roadmap graph (seeded by `make dev`, see scripts/roadmapgen.py):
// opening "/" redirects to it; any ?graph=<id> still wins.
const ROADMAP_GRAPH_ID = 'c0de0000-0000-4000-8000-000000000002'

const params = new URLSearchParams(window.location.search)
const graphId = params.get('graph') ?? ROADMAP_GRAPH_ID
if (!params.has('graph')) {
  window.history.replaceState(null, '', `?graph=${ROADMAP_GRAPH_ID}`)
}

export default function App() {
  return <GraphEditor client={client} graphId={graphId} styles={styles} />
}
