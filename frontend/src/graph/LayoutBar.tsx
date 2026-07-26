import { useState } from 'react'
import type { Layout } from '../api/types'

export interface LayoutBarProps {
  layouts: Layout[]
  onSave: (name: string) => void
  onLoad: (name: string) => void
}

export function LayoutBar({ layouts, onSave, onLoad }: LayoutBarProps) {
  const [name, setName] = useState('default')
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 8 }}>
      <input
        placeholder="layout name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button onClick={() => onSave(name)}>Save layout</button>
      {layouts.map((l) => (
        <button key={l.id} onClick={() => onLoad(l.name)}>
          {l.name}
        </button>
      ))}
    </div>
  )
}
