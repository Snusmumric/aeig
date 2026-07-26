import { toFlowNodes, toFlowEdges } from './graph/toFlow'
import { GraphCanvas } from './graph/GraphCanvas'
import type { TypeStyleMap } from './graph/typeStyle'
import type { Subgraph } from './api/types'

const styles: TypeStyleMap = {
  Task: { shape: 'rectangle', color: '#3366cc' },
  Milestone: { shape: 'diamond', color: '#cc6633' },
  depends_on: { shape: 'rectangle', color: '#888888' },
}

const demo: Subgraph = {
  nodes: [
    { id: 'm1', type: 'Milestone', properties: { label: 'Release' } },
    { id: 't1', type: 'Task', properties: { label: 'Build API' } },
    { id: 't2', type: 'Task', properties: { label: 'Build UI' } },
  ],
  edges: [
    { id: 'e1', type: 'depends_on', source: 't1', target: 'm1', properties: {} },
    { id: 'e2', type: 'depends_on', source: 't2', target: 'm1', properties: {} },
  ],
}

export default function App() {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <GraphCanvas nodes={toFlowNodes(demo, styles)} edges={toFlowEdges(demo, styles)} />
    </div>
  )
}
