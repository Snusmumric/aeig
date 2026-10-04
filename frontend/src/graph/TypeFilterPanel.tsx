import type { TypeStyleMap } from './typeStyle'

export interface TypeFilterPanelProps {
  types: string[]
  visibleTypes: Set<string> | null
  styles: TypeStyleMap
  onChange: (next: Set<string> | null) => void
}

export function TypeFilterPanel({ types, visibleTypes, styles, onChange }: TypeFilterPanelProps) {
  const isChecked = (t: string) => !visibleTypes || visibleTypes.has(t)

  const toggle = (t: string) => {
    const next = new Set(visibleTypes ?? types)
    if (next.has(t)) next.delete(t)
    else next.add(t)
    onChange(next.size === types.length ? null : next)
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }} data-testid="type-filter">
      {types.map((t) => (
        <label key={t} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={isChecked(t)}
            onChange={() => toggle(t)}
            data-testid={`type-${t}`}
          />
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              background: styles[t]?.color ?? '#8899aa',
              display: 'inline-block',
            }}
          />
          {t}
        </label>
      ))}
      <button onClick={() => onChange(null)}>Все</button>
      <button onClick={() => onChange(new Set())}>Ни одного</button>
    </div>
  )
}
