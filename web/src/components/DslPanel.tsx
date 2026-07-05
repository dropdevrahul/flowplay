import { useState, useEffect } from 'react'
import type { DiagramState } from '../renderer/types'
import { parseDSL } from '../renderer/dsl'

interface Props {
  seed: string
  onApply: (state: DiagramState) => void
}

const FM = "'Geist Mono', ui-monospace, 'SFMono-Regular', monospace"
const heading: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em',
  color: 'var(--muted)', margin: '2px 0 8px',
}

const PLACEHOLDER = `var coins = 0
[*] -> Locked
Locked -> Unlocked : COIN
Unlocked -> Locked : PUSH
Unlocked -> [*]`

// Text authoring for state machines. Type transitions, hit Apply (or Ctrl+Enter).
export function DslPanel({ seed, onApply }: Props) {
  const [text, setText] = useState(seed)
  const [err, setErr] = useState<string | null>(null)

  // reseed when the underlying diagram changes (new diagram / switched away & back)
  useEffect(() => { setText(seed); setErr(null) }, [seed])

  const apply = () => {
    const { state, error } = parseDSL(text)
    if (error || !state) { setErr(error ?? 'parse failed'); return }
    setErr(null)
    onApply(state)
  }

  // live validation feedback without applying
  const liveErr = (() => {
    if (!text.trim()) return null
    return parseDSL(text).error ?? null
  })()

  return (
    <div>
      <div style={heading}>State-machine text</div>
      <div style={{ fontSize: 10.5, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 8 }}>
        <code>A -&gt; B : EVENT [guard] / action</code> · <code>[*] -&gt; S</code> initial · <code>S -&gt; [*]</code> final · <code>var x = 0</code>
      </div>
      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setErr(null) }}
        onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); apply() } }}
        placeholder={PLACEHOLDER}
        spellCheck={false}
        style={{
          width: '100%', minHeight: 240, boxSizing: 'border-box',
          background: 'var(--bg)', color: 'var(--text)',
          border: `1px solid ${liveErr ? '#ef4444' : 'var(--line)'}`, borderRadius: 8,
          padding: 10, fontSize: 12.5, fontFamily: FM, lineHeight: 1.6,
          outline: 'none', resize: 'vertical', whiteSpace: 'pre', overflowWrap: 'normal', overflowX: 'auto',
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
        <button onClick={apply}
          style={{ background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', padding: '7px 16px', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-display)' }}>
          Apply ▸
        </button>
        <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>or <kbd>Ctrl</kbd>+<kbd>Enter</kbd></span>
      </div>
      {(err || liveErr) && (
        <div style={{ fontSize: 11, color: '#ef4444', marginTop: 8, fontFamily: FM }}>{err || liveErr}</div>
      )}
    </div>
  )
}
