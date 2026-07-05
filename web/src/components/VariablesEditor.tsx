import { useState } from 'react'

type Val = number | string | boolean
type Vars = Record<string, Val>

interface Props {
  variables: Vars
  onChange: (next: Vars) => void
}

const FM = "'Geist Mono', ui-monospace, 'SFMono-Regular', monospace"
const heading: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em',
  color: 'var(--muted)', margin: '2px 0 8px',
}
const input: React.CSSProperties = {
  flex: 1, minWidth: 0, background: 'var(--bg)', color: 'var(--text)',
  border: '1px solid var(--line)', borderRadius: 6, padding: '5px 8px',
  fontSize: 12, fontFamily: FM, outline: 'none',
}
const smallBtn: React.CSSProperties = {
  background: 'none', border: '1px solid var(--line)', borderRadius: 6,
  color: 'var(--muted)', cursor: 'pointer', padding: '4px 7px', fontSize: 12,
}

// "true"/"false" → boolean, numeric string → number, otherwise string
function coerce(v: string): Val {
  if (v === 'true') return true
  if (v === 'false') return false
  if (v !== '' && !isNaN(Number(v))) return Number(v)
  return v
}

// Diagram-level variables (properties). These seed the simulation and are
// readable/writable by edge guards and actions. Add as many as you like.
export function VariablesEditor({ variables, onChange }: Props) {
  const entries = Object.entries(variables)
  const [newKey, setNewKey] = useState('')

  const setVal = (k: string, raw: string) => onChange({ ...variables, [k]: coerce(raw) })
  const remove = (k: string) => { const n = { ...variables }; delete n[k]; onChange(n) }
  const add = () => {
    const k = newKey.trim()
    if (!k || k in variables) return
    onChange({ ...variables, [k]: 0 })
    setNewKey('')
  }

  return (
    <div>
      <div style={heading}>Variables</div>
      {entries.length === 0 && (
        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>
          none — add properties the simulation can read and mutate
        </div>
      )}
      {entries.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <div style={{ ...input, flex: '0 0 96px', opacity: 0.75, overflow: 'hidden', whiteSpace: 'nowrap' }}>{k}</div>
          <input style={input} value={String(v)} onChange={(e) => setVal(k, e.target.value)} />
          <button style={smallBtn} title="Remove" onClick={() => remove(k)}>×</button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
        <input style={input} placeholder="new property" value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add() }} />
        <button style={{ ...smallBtn, color: 'var(--text)', padding: '4px 10px' }} onClick={add}>Add</button>
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 8, lineHeight: 1.6 }}>
        Use them in edge <b>guards</b> (e.g. <code>coins &gt;= 2</code>) and <b>actions</b> (e.g. <code>coins -= 2</code>).
      </div>
    </div>
  )
}
