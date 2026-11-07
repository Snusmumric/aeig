export type NodeShape = 'rectangle' | 'ellipse' | 'diamond'

export interface TypeStyle {
  shape: NodeShape
  color: string
  /** Edge types only: direction is semantically meaningful → render an arrowhead. */
  directed?: boolean
}

export type TypeStyleMap = Record<string, TypeStyle>

export const DEFAULT_STYLE: TypeStyle = { shape: 'rectangle', color: '#8899aa' }

export function resolveStyle(map: TypeStyleMap, type: string): TypeStyle {
  return map[type] ?? DEFAULT_STYLE
}
