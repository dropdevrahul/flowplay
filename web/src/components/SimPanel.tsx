import type { Simulation } from '../renderer/sim'

interface SimPanelProps {
  sim: Simulation
  tick: number // forces re-read after imperative sim mutations
  onFire: (event: string) => void
  onStep: () => void
  onReset: () => void
}

const heading: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em',
  color: 'var(--muted)', margin: '2px 0 8px',
}
const btn: React.CSSProperties = {
  background: 'color-mix(in srgb, var(--accent) 14%, transparent)',
  border: '1px solid var(--accent)', borderRadius: 8, color: 'var(--accent)',
  cursor: 'pointer', padding: '7px 12px', fontSize: 12, fontWeight: 600,
  fontFamily: 'var(--font-display)',
}
const flat: React.CSSProperties = {
  background: 'none', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--text)',
  cursor: 'pointer', padding: '7px 12px', fontSize: 12, fontFamily: 'var(--font-display)',
}

export function SimPanel({ sim, onFire, onStep, onReset }: SimPanelProps) {
  const activeNode = sim.state.nodes.find((n) => n.id === sim.active)
  const events = sim.events()
  const vars = Object.entries(sim.vars)
  const canStep = sim.enabled().some((e) => !e.event)

  return (
    <div>
      <div style={heading}>Current state</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--accent)', marginBottom: 16 }}>
        {activeNode?.label || sim.active || '—'}
      </div>

      <div style={heading}>Variables</div>
      <div style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 8, marginBottom: 16 }}>
        {vars.length === 0 && <div style={{ fontSize: 11, color: 'var(--muted)' }}>no variables</div>}
        {vars.map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontFamily: 'var(--font-mono)', padding: '2px 0' }}>
            <span style={{ color: 'var(--muted)' }}>{k}</span>
            <span style={{ color: 'var(--text)', fontWeight: 600 }}>{String(v)}</span>
          </div>
        ))}
      </div>

      <div style={heading}>Events</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {events.length === 0 && <div style={{ fontSize: 11, color: 'var(--muted)' }}>no enabled events from this state</div>}
        {events.map((ev) => (
          <button key={ev} style={btn} onClick={() => onFire(ev)}>{ev}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <button style={{ ...flat, opacity: canStep ? 1 : 0.4 }} onClick={onStep} disabled={!canStep}>Step ▸</button>
        <button style={flat} onClick={onReset}>Reset ↺</button>
      </div>
      {sim.lastError && <div style={{ fontSize: 11, color: '#ef4444', marginBottom: 10 }}>{sim.lastError}</div>}

      <div style={heading}>History</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 260, overflow: 'auto' }}>
        {sim.history.length === 0 && <div style={{ fontSize: 11, color: 'var(--muted)' }}>nothing fired yet</div>}
        {sim.history.map((h, i) => (
          <div key={i} style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>
            <span style={{ color: 'var(--muted)' }}>{i + 1}.</span> {h.from} <span style={{ color: 'var(--accent)' }}>—{h.event || 'auto'}→</span> {h.to}
          </div>
        ))}
      </div>
    </div>
  )
}
