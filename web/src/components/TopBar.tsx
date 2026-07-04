const diagrams = [
  { value: 'fetch', label: 'Fetch state machine' },
  { value: 'traffic', label: 'Traffic light' },
  { value: 'approval', label: 'Approval flow' },
  { value: 'checkout', label: 'Order checkout' },
]

const themes = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'contrast', label: 'Contrast' },
]

interface TopBarProps {
  diagram: string
  theme: string
  mode: 'view' | 'edit'
  onDiagramChange: (name: string) => void
  onThemeChange: (name: string) => void
  onModeChange: (mode: 'view' | 'edit') => void
}

export function TopBar({ diagram, theme, mode, onDiagramChange, onThemeChange, onModeChange }: TopBarProps) {
  return (
    <div className="panel topbar">
      <span className="brand">ff<span>·</span>viewer</span>
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
        <label>Mode</label>
        <button
          onClick={() => onModeChange(mode === 'view' ? 'edit' : 'view')}
          style={{
            background: mode === 'edit' ? 'var(--accent)' : 'none',
            color: mode === 'edit' ? '#fff' : 'var(--text)',
            border: '1px solid var(--line)',
            borderRadius: 8,
            padding: '5px 12px',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'var(--font-display)',
            transition: 'background .15s, color .15s',
          }}
        >
          {mode === 'view' ? 'View' : 'Edit'}
        </button>
      </div>
    </div>
  )
}
