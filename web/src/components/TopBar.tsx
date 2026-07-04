const diagrams = [
  { value: 'fetch', label: 'Fetch state machine' },
  { value: 'traffic', label: 'Traffic light' },
  { value: 'approval', label: 'Approval flow' },
  { value: 'checkout', label: 'Order checkout' },
  { value: 'turnstile', label: 'Turnstile (state machine)' },
]

const themes = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'contrast', label: 'Contrast' },
]

type Mode = 'view' | 'edit' | 'simulate'

interface TopBarProps {
  diagram: string
  theme: string
  mode: Mode
  graphType: 'flowchart' | 'statemachine'
  onDiagramChange: (name: string) => void
  onThemeChange: (name: string) => void
  onModeChange: (mode: Mode) => void
  onTypeChange: (t: 'flowchart' | 'statemachine') => void
}

const MODES: Mode[] = ['view', 'edit', 'simulate']

export function TopBar({ diagram, theme, mode, graphType, onDiagramChange, onThemeChange, onModeChange, onTypeChange }: TopBarProps) {
  return (
    <div className="panel topbar">
      <span className="brand">Flowplay</span>
      <div className="divider" />
      <div className="field">
        <label htmlFor="pick">Diagram</label>
        <select id="pick" value={diagram} onChange={(e) => onDiagramChange(e.target.value)}>
          {diagrams.map((d) => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </select>
      </div>
      <div className="divider" />
      <div className="field">
        <label htmlFor="theme">Theme</label>
        <select id="theme" value={theme} onChange={(e) => onThemeChange(e.target.value)}>
          {themes.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>
      <div className="divider" />
      <div className="field">
        <label htmlFor="gtype">Type</label>
        <select id="gtype" value={graphType} onChange={(e) => onTypeChange(e.target.value as 'flowchart' | 'statemachine')}>
          <option value="flowchart">Flowchart</option>
          <option value="statemachine">State machine</option>
        </select>
      </div>
      <div className="divider" />
      <div className="field">
        <label>Mode</label>
        <div style={{ display: 'flex', gap: 2, background: 'color-mix(in srgb, var(--bg) 60%, transparent)', border: '1px solid var(--line)', borderRadius: 8, padding: 2 }}>
          {MODES.map((m) => (
            <button
              key={m}
              onClick={() => onModeChange(m)}
              style={{
                background: mode === m ? 'var(--accent)' : 'none',
                color: mode === m ? '#fff' : 'var(--text)',
                border: 'none',
                borderRadius: 6,
                padding: '4px 10px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'var(--font-display)',
                transition: 'background .15s, color .15s',
                textTransform: 'capitalize',
              }}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
