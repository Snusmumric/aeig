import type { CSSProperties } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { TypedNodeData } from './toFlow'

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
      <Handle type="target" position={Position.Left} />
      <div>{data.label}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}
