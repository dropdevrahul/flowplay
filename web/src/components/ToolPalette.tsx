interface ToolPaletteProps {
  onAddNode: (kind: string) => void
  onConnect: () => void
  onAddSubgraph: () => void
  onDuplicate: () => void
  onDelete: () => void
  onClear: () => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  fontSize: number
  onFontChange: (px: number) => void
}

const NODE_TYPES: { kind: string; label: string; shape: React.ReactNode }[] = [
  { kind: 'roundrect', label: 'Process', shape: <rect x="4" y="6" width="46" height="26" rx="7" /> },
  { kind: 'rect', label: 'State', shape: <rect x="4" y="6" width="46" height="26" /> },
  { kind: 'ellipse', label: 'Start / End', shape: <ellipse cx="27" cy="19" rx="23" ry="13" /> },
  { kind: 'diamond', label: 'Decision', shape: <polygon points="27,4 50,19 27,34 4,19" /> },
]

const heading: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em',
  color: 'var(--muted)', margin: '2px 0 8px',
}

const tile: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
  background: 'none', border: '1px solid var(--line)', borderRadius: 10,
  color: 'var(--text)', cursor: 'pointer', padding: '10px 4px 8px',
  fontSize: 11, fontWeight: 500, fontFamily: 'var(--font-display)',
  transition: 'background .12s, border-color .12s',
}

const act: React.CSSProperties = {
  background: 'none', border: '1px solid var(--line)', borderRadius: 8,
  color: 'var(--text)', cursor: 'pointer', padding: '7px 4px',
  fontSize: 12, fontWeight: 500, fontFamily: 'var(--font-display)',
  transition: 'background .12s, border-color .12s',
}
const actOff: React.CSSProperties = { ...act, opacity: 0.35, cursor: 'not-allowed' }

function hover(on: boolean, color = 'var(--accent)') {
  return (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.background = on ? `color-mix(in srgb, ${color} 12%, transparent)` : 'none'
    e.currentTarget.style.borderColor = on ? color : 'var(--line)'
  }
}

export function ToolPalette({ onAddNode, onConnect, onAddSubgraph, onDuplicate, onDelete, onClear, onUndo, onRedo, canUndo, canRedo, fontSize, onFontChange }: ToolPaletteProps) {
  return (
    <div>
      <div style={heading}>Nodes</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 18 }}>
        {NODE_TYPES.map((t) => (
          <button key={t.kind} style={tile} onClick={() => onAddNode(t.kind)} onMouseEnter={hover(true)} onMouseLeave={hover(false)}>
            <svg width="54" height="38" viewBox="0 0 54 38" fill="color-mix(in srgb, var(--accent) 10%, transparent)"
              stroke="var(--accent)" strokeWidth="1.6" style={{ display: 'block' }}>
              {t.shape}
            </svg>
            {t.label}
          </button>
        ))}
      </div>

      <div style={heading}>Actions</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
        <button style={act} onClick={onConnect} onMouseEnter={hover(true)} onMouseLeave={hover(false)}>Connect</button>
        <button style={act} onClick={onAddSubgraph} onMouseEnter={hover(true)} onMouseLeave={hover(false)}>Group</button>
        <button style={act} onClick={onDuplicate} onMouseEnter={hover(true)} onMouseLeave={hover(false)}>Duplicate</button>
        <button style={act} onClick={onDelete} onMouseEnter={hover(true, '#ef4444')} onMouseLeave={hover(false)}>Delete</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
        <button style={canUndo ? act : actOff} onClick={canUndo ? onUndo : undefined}>Undo</button>
        <button style={canRedo ? act : actOff} onClick={canRedo ? onRedo : undefined}>Redo</button>
        <button style={act} onClick={onClear} onMouseEnter={hover(true, '#ef4444')} onMouseLeave={hover(false)}>Clear</button>
      </div>

      <div style={{ ...heading, marginTop: 18 }}>Text</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>Font</span>
        <input type="range" min={8} max={40} value={fontSize} onChange={(e) => onFontChange(+e.target.value)} style={{ flex: 1, accentColor: 'var(--accent)' }} />
        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text)', width: 34, textAlign: 'right' }}>{fontSize}px</span>
      </div>

      <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 14, lineHeight: 1.6 }}>
        Pick a node to add it · select a node then <b>Connect</b> and click a target · drag a node to move · double-click to rename.
      </div>
    </div>
  )
}
