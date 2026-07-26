import { createClient } from './api/client'
import { GraphEditor } from './graph/GraphEditor'
import type { TypeStyleMap } from './graph/typeStyle'

// Default to a relative base ('') so the browser talks to the same origin:
// in dev the Vite proxy forwards /graphs and /health to the Go server; when the
// backend serves the built frontend, requests are same-origin too. Override with
// VITE_API_URL for cross-origin setups.
const client = createClient(import.meta.env.VITE_API_URL ?? '')

const styles: TypeStyleMap = {
  Task: { shape: 'rectangle', color: '#3366cc' },
  Milestone: { shape: 'diamond', color: '#cc6633' },
  depends_on: { shape: 'rectangle', color: '#888888' },
}

const graphId = new URLSearchParams(window.location.search).get('graph') ?? ''

export default function App() {
  if (!graphId) {
    return <div style={{ padding: 20 }}>Append ?graph=&lt;id&gt; to the URL to open a graph.</div>
  }
  return <GraphEditor client={client} graphId={graphId} styles={styles} />
}
