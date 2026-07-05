import type { Simulation } from '../renderer/sim'

interface SimPanelProps {
  sim: Simulation
  tick: number // bump forces re-read after imperative sim mutations
  isStateMachine: boolean
  onFire: (event: string) => void // fire an event on the active entity
  onFireTo: (toNodeId: string) => void // flowchart: advance active entity along edge to this node
  onStep: () => void // auto-step the active entity
  onStepAll: () => void // advance every entity one auto-step
  onReset: () => void
  onSpawn: () => void // spawn a new entity at the start node
  onRemoveEntity: (id: string) => void
  onSelectEntity: (id: string) => void
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

function nodeLabel(sim: Simulation, id: string): string {
  return sim.state.nodes.find((n) => n.id === id)?.label || id
}

function VarRows({ entries }: { entries: [string, unknown][] }) {
  return (
    <>
      {entries.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontFamily: 'var(--font-mono)', padding: '2px 0' }}>
          <span style={{ color: 'var(--muted)' }}>{k}</span>
          <span style={{ color: 'var(--text)', fontWeight: 600 }}>{String(v)}</span>
        </div>
      ))}
    </>
  )
}

export function SimPanel(props: SimPanelProps) {
  const { sim, isStateMachine, onFire, onFireTo, onStep, onStepAll, onReset, onSpawn, onRemoveEntity, onSelectEntity } = props
  void props.tick // referenced so re-renders read fresh sim state

  const activeNode = sim.state.nodes.find((n) => n.id === sim.active)
  const globalVars = Object.entries(sim.vars)
  const entityVars = Object.entries(sim.activeEntity()?.vars ?? {})

  const events = sim.eventsFor()
  const choices = sim.choices()
  const canStep = isStateMachine
    ? sim.enabledFor().filter((e) => !e.event).length === 1
    : sim.choices().length === 1

  return (
    <div>
      {/* --- Entities --- */}
      <div style={heading}>Entities</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
        {sim.entities.length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>no entities — Reset to start</div>
        )}
        {sim.entities.map((ent) => {
          const isActive = ent.id === sim.activeEntityId
          return (
            <div
              key={ent.id}
              onClick={() => onSelectEntity(ent.id)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
                cursor: 'pointer', borderRadius: 8, padding: '5px 8px',
                border: isActive ? '1px solid var(--accent)' : '1px solid var(--line)',
                background: isActive ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'none',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
                <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 600, color: isActive ? 'var(--accent)' : 'var(--muted)' }}>{ent.id}</span>
                <span style={{ fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nodeLabel(sim, ent.at)}</span>
              </span>
              {sim.entities.length > 1 && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRemoveEntity(ent.id) }}
                  aria-label={`remove ${ent.id}`}
                  style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '0 2px' }}
                >×</button>
              )}
            </div>
          )
        })}
      </div>
      <div style={{ marginBottom: 16 }}>
        <button style={flat} onClick={onSpawn}>＋ Spawn</button>
      </div>

      {/* --- Current state --- */}
      <div style={heading}>Current state</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--accent)', marginBottom: 16 }}>
        {activeNode?.label || sim.active || '—'}
      </div>

      {/* --- Variables --- */}
      <div style={heading}>Variables</div>
      <div style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 8, marginBottom: 16 }}>
        {globalVars.length === 0 && entityVars.length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>no variables</div>
        )}
        {globalVars.length > 0 && <VarRows entries={globalVars} />}
        {entityVars.length > 0 && (
          <>
            <div style={{ ...heading, margin: '8px 0 4px' }}>This entity</div>
            <VarRows entries={entityVars} />
          </>
        )}
      </div>

      {/* --- Actions --- */}
      <div style={heading}>Actions</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {isStateMachine ? (
          events.length === 0
            ? <div style={{ fontSize: 11, color: 'var(--muted)' }}>no enabled events</div>
            : events.map((ev, i) => (
              <button key={ev} style={btn} onClick={() => onFire(ev)}>{i + 1}  {ev}</button>
            ))
        ) : (
          choices.length === 0
            ? <div style={{ fontSize: 11, color: 'var(--muted)' }}>end of flow — nothing to advance</div>
            : choices.map((c, i) => (
              <button key={`${c.to}-${i}`} style={btn} onClick={() => onFireTo(c.to)}>
                {i + 1}  {nodeLabel(sim, c.to)}{c.label ? ` (${c.label})` : ''}
              </button>
            ))
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <button style={{ ...flat, opacity: canStep ? 1 : 0.4 }} onClick={onStep} disabled={!canStep}>Step ▸</button>
        <button style={flat} onClick={onStepAll}>Step all ▸▸</button>
        <button style={flat} onClick={onReset}>Reset ↺</button>
      </div>
      {sim.lastError && <div style={{ fontSize: 11, color: '#ef4444', marginBottom: 10 }}>{sim.lastError}</div>}

      {/* --- History --- */}
      <div style={heading}>History</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 260, overflow: 'auto' }}>
        {sim.history.length === 0 && <div style={{ fontSize: 11, color: 'var(--muted)' }}>nothing fired yet</div>}
        {sim.history.map((h, i) => (
          <div key={i} style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>
            <span style={{ color: 'var(--muted)' }}>{i + 1}.</span>{' '}
            {h.entity && <span style={{ color: 'var(--muted)' }}>{h.entity} </span>}
            {h.from} <span style={{ color: 'var(--accent)' }}>—{h.event || 'auto'}→</span> {h.to}
          </div>
        ))}
      </div>
    </div>
  )
}
