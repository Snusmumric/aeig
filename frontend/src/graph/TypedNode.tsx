import type { CSSProperties } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { TypedNodeData } from './toFlow'

/** Geometric anchor sides — ids are matched by the dynamic-anchor picker. */
export const SIDES = [
  { id: 't', position: Position.Top },
  { id: 'r', position: Position.Right },
  { id: 'b', position: Position.Bottom },
  { id: 'l', position: Position.Left },
] as const

function shapeStyle(data: TypedNodeData): CSSProperties {
  const base: CSSProperties = {
    background: data.style.color,
    padding: 10,
    minWidth: 80,
    textAlign: 'center',
    color: '#fff',
    border: '1px solid rgba(0,0,0,0.25)',
  }
  switch (data.style.shape) {
    case 'ellipse':
      return { ...base, borderRadius: '50%' }
    case 'diamond':
      return { ...base, clipPath: 'polygon(50% 0, 100% 50%, 50% 100%, 0 50%)' }
    default:
      return { ...base, borderRadius: 4 }
  }
}

export function TypedNode(props: NodeProps) {
  const data = props.data as TypedNodeData
  return (
    <div style={shapeStyle(data)} data-testid="typed-node" data-node-type={data.nodeType}>
      {SIDES.map((side) => (
        <Handle key={`target-${side.id}`} type="target" position={side.position} id={side.id} className="anchor" />
      ))}
      <div>{data.label}</div>
      {SIDES.map((side) => (
        <Handle key={`source-${side.id}`} type="source" position={side.position} id={side.id} className="anchor" />
      ))}
    </div>
  )
}
