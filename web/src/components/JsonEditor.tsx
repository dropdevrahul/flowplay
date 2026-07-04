import { useState, useRef, useCallback, useEffect } from 'react'

interface JsonEditorProps {
  value: string
  onChange: (json: string) => void
  onError: (error: string | null) => void
}

export function JsonEditor({ value, onChange, onError }: JsonEditorProps) {
  const [text, setText] = useState(value)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    setText(value)
  }, [value])

  const handleChange = useCallback((raw: string) => {
    setText(raw)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      try {
        JSON.parse(raw)
        setErrorMsg(null)
        onError(null)
        onChange(raw)
      } catch (e: any) {
        const msg = e?.message ?? 'invalid JSON'
        setErrorMsg(msg)
        onError(msg)
      }
    }, 300)
  }, [onChange, onError])

  const format = useCallback(() => {
    try {
      const pretty = JSON.stringify(JSON.parse(text), null, 2)
      setText(pretty)
      onChange(pretty)
      setErrorMsg(null)
      onError(null)
    } catch {}
  }, [text, onChange, onError])

  const copy = useCallback(() => {
    navigator.clipboard.writeText(text)
  }, [text])

  const FM = "'Geist Mono', ui-monospace, 'SFMono-Regular', monospace"

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 8 }}>
        JSON
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <button onClick={format} style={{
          background: 'none',
          border: '1px solid var(--line)',
          borderRadius: 6,
          color: 'var(--text)',
          cursor: 'pointer',
          padding: '4px 10px',
          fontSize: 11,
          fontFamily: 'var(--font-display)',
        }}>
          Format
        </button>
        <button onClick={copy} style={{
          background: 'none',
          border: '1px solid var(--line)',
          borderRadius: 6,
          color: 'var(--text)',
          cursor: 'pointer',
          padding: '4px 10px',
          fontSize: 11,
          fontFamily: 'var(--font-display)',
        }}>
          Copy
        </button>
      </div>
      <textarea
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        spellCheck={false}
        style={{
          flex: 1,
          resize: 'none',
          fontFamily: FM,
          fontSize: 11,
          lineHeight: 1.5,
          background: 'var(--bg)',
          color: 'var(--text)',
          border: '1px solid var(--line)',
          borderRadius: 6,
          padding: 10,
          outline: 'none',
          tabSize: 2,
        }}
      />
      {errorMsg && (
        <div style={{ color: '#ef4444', fontSize: 11, marginTop: 6, fontFamily: FM }}>
          {errorMsg}
        </div>
      )}
    </div>
  )
}
