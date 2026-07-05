import { useEffect } from 'react'

interface SidePanelProps {
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}

export function SidePanel({ open, onToggle, children }: SidePanelProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'b') {
        e.preventDefault()
        onToggle()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onToggle])

  return (
    <div style={{
      position: 'fixed',
      // start below the floating top bar so its tabs never sit under it
      top: 76,
      right: 0,
      height: 'calc(100% - 76px)',
      width: open ? 320 : 0,
      overflow: 'hidden',
      zIndex: 9,
      transition: 'width .2s ease',
      display: 'flex',
      flexDirection: 'column',
      background: 'color-mix(in srgb, var(--panel) 88%, transparent)',
      WebkitBackdropFilter: 'blur(12px) saturate(1.2)',
      backdropFilter: 'blur(12px) saturate(1.2)',
      borderLeft: '1px solid color-mix(in srgb, var(--line) 80%, transparent)',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '10px 12px',
        borderBottom: '1px solid var(--line)',
        gap: 8,
        flexShrink: 0,
      }}>
        <button
          onClick={onToggle}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text)',
            cursor: 'pointer',
            fontSize: 14,
            padding: '2px 6px',
            borderRadius: 4,
          }}
        >
          {open ? '◀' : '▶'}
        </button>
        {open && <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)', letterSpacing: '-0.01em' }}>Editor</span>}
      </div>
      {open && (
        <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
          {children}
        </div>
      )}
    </div>
  )
}
