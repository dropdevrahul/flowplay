import { useRef, useEffect, useState, useCallback } from 'react'
import { CanvasRenderer } from './canvas'
import { DiagramEditor } from './renderer/editor'
import type { DiagramState, NodeSpec, EdgeSpec, SubgraphSpec } from './renderer/types'
import { themes } from './theme'
import { TopBar } from './components/TopBar'
import { ZoomBar } from './components/ZoomBar'
import { SidePanel } from './components/SidePanel'
import { ToolPalette } from './components/ToolPalette'
import { JsonEditor } from './components/JsonEditor'
import { PropertyEditor } from './components/PropertyEditor'
import { layoutDiagram, nodeSize } from './renderer/layout'

const KEY_MAP: Record<string, number> = {
  ' ': 32,
  ArrowRight: 39,
  ArrowLeft: 37,
  r: 82,
  R: 82,
  '1': 49, '2': 50, '3': 51, '4': 52, '5': 53,
  '6': 54, '7': 55, '8': 56, '9': 57,
}

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<CanvasRenderer | null>(null)
  const editorRef = useRef<DiagramEditor | null>(null)
  const [diagram, setDiagram] = useState('fetch')
  const [themeName, setThemeName] = useState(() => {
    return localStorage.getItem('ff-theme') && themes[localStorage.getItem('ff-theme')!]
      ? localStorage.getItem('ff-theme')!
      : 'light'
  })
  const [zoomPct, setZoomPct] = useState(100)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [sideOpen, setSideOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'palette' | 'json' | 'props'>('palette')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [editingLabel, setEditingLabel] = useState<{ id: string; x: number; y: number; w: number; h: number; label: string } | null>(null)

  const editor = editorRef.current

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const r = new CanvasRenderer()
    rendererRef.current = r
    r.onZoomChange = setZoomPct
    r.onError = setError
    r.onSelectionChange = setSelectedId
    r.onDoubleClick = handleDoubleClick
    r.init(canvas, themeName).then(() => {
      r.loadDiagram(diagram)
    })
    return () => {
      r.onDoubleClick = null
      r.destroy()
      rendererRef.current = null
    }
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (mode === 'view') {
        const code = KEY_MAP[e.key]
        if (code != null) {
          rendererRef.current?.handleKey(code)
          e.preventDefault()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [mode])

  useEffect(() => {
    if (!rendererRef.current) return
    rendererRef.current.editMode = mode === 'edit'
  }, [mode])

  useEffect(() => {
    const handler = () => {
      if (editorRef.current) {
        setJsonStr(editorRef.current.toJSON())
        setSelectedId(editorRef.current?.selected ?? null)
      }
    }
    window.addEventListener('editor-state-change', handler)
    return () => window.removeEventListener('editor-state-change', handler)
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        if (mode === 'edit' && editorRef.current) {
          const json = editorRef.current.toJSON()
          const blob = new Blob([json], { type: 'application/json' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `${diagram}-edited.json`
          a.click()
          URL.revokeObjectURL(url)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [mode, diagram])

  // load JSON string for the JSON editor
  const [jsonStr, setJsonStr] = useState('')
  const loadJsonStr = useCallback(async (name: string) => {
    try {
      const resp = await fetch(`/examples/${name}.json`)
      const text = await resp.text()
      const spec = JSON.parse(text) as DiagramState
      layoutDiagram(spec)
      setJsonStr(JSON.stringify(spec, null, 2))
      if (editorRef.current) {
        editorRef.current.load(spec)
      } else {
        const ed = new DiagramEditor(spec)
        editorRef.current = ed
      }
    } catch {}
  }, [])

  useEffect(() => {
    loadJsonStr(diagram)
  }, [diagram, loadJsonStr])

  const handleDiagramChange = useCallback((name: string) => {
    setDiagram(name)
    setError('')
    setSelectedId(null)
    if (mode === 'view') {
      rendererRef.current?.loadDiagram(name)
    }
    loadJsonStr(name)
  }, [mode, loadJsonStr])

  const handleThemeChange = useCallback((name: string) => {
    setThemeName(name)
    localStorage.setItem('ff-theme', name)
    rendererRef.current?.setTheme(name)
  }, [])

  const handleModeChange = useCallback((newMode: 'view' | 'edit') => {
    setMode(newMode)
    setSideOpen(newMode === 'edit')
    if (rendererRef.current) {
      rendererRef.current.editMode = newMode === 'edit'
      rendererRef.current.editor = newMode === 'edit' ? editorRef.current : null
      if (editorRef.current) {
        rendererRef.current.loadStateToWasm(editorRef.current.state)
        if (newMode === 'view') {
          rendererRef.current.resetView()
        }
      }
    }
  }, [])

  const handleZoomIn = useCallback(() => rendererRef.current?.zoomIn(), [])
  const handleZoomOut = useCallback(() => rendererRef.current?.zoomOut(), [])
  const handleZoomReset = useCallback(() => rendererRef.current?.resetView(), [])

  // editor callbacks
  const emitState = useCallback(() => {
    if (editorRef.current) {
      setJsonStr(editorRef.current.toJSON())
      if (rendererRef.current && mode === 'edit') {
        rendererRef.current.loadStateToWasm(editorRef.current.state)
      }
    }
  }, [mode])

  const handleAddNode = useCallback((kind: string = 'roundrect') => {
    const ed = editorRef.current
    if (!ed) return
    const { w, h } = nodeSize(kind)
    const center = rendererRef.current?.getCameraCenter() ?? { x: 0, y: 0 }
    const id = ed.addNode({ kind, w, h, x: center.x - w / 2, y: center.y - h / 2 })
    ed.select(id)
    setSelectedId(id)
    emitState()
  }, [emitState])

  const handleConnect = useCallback(() => {
    const ok = rendererRef.current?.armConnect()
    if (!ok) {
      setError('Select a node first, then click a target to connect')
      setTimeout(() => setError(''), 2200)
    }
  }, [])

  const handleAddSubgraph = useCallback(() => {
    const ed = editorRef.current
    if (!ed) return
    const id = ed.addSubgraph()
    setSelectedId('subgraph:' + id)
    setActiveTab('props')
    emitState()
  }, [emitState])

  const handleDelete = useCallback(() => {
    const ed = editorRef.current
    if (!ed || !ed.selected) return
    const selType = ed.getSelectionType()
    if (selType === 'node') {
      ed.removeNode(ed.selected)
    } else if (selType === 'edge') {
      const edge = ed.getSelectedEdge()
      if (edge) ed.removeEdge(edge.from, edge.to)
    } else if (selType === 'subgraph') {
      const sg = ed.getSelectedSubgraph()
      if (sg) ed.removeSubgraph(sg.id)
    }
    setSelectedId(null)
    emitState()
  }, [emitState])

  const handleUndo = useCallback(() => {
    editorRef.current?.undo()
    setSelectedId(editorRef.current?.selected ?? null)
    setJsonStr(editorRef.current?.toJSON() ?? '')
    if (rendererRef.current && mode === 'edit') {
      rendererRef.current.loadStateToWasm(editorRef.current!.state)
    }
  }, [mode])

  const handleRedo = useCallback(() => {
    editorRef.current?.redo()
    setSelectedId(editorRef.current?.selected ?? null)
    setJsonStr(editorRef.current?.toJSON() ?? '')
    if (rendererRef.current && mode === 'edit') {
      rendererRef.current.loadStateToWasm(editorRef.current!.state)
    }
  }, [mode])

  const handleNodeUpdate = useCallback((id: string, partial: Partial<NodeSpec>) => {
    editorRef.current?.updateNode(id, partial)
    emitState()
  }, [emitState])

  const handleEdgeUpdate = useCallback((from: string, to: string, partial: Partial<EdgeSpec>) => {
    editorRef.current?.updateEdge(from, to, partial)
    emitState()
  }, [emitState])

  const handleSubgraphUpdate = useCallback((id: string, partial: Partial<SubgraphSpec>) => {
    editorRef.current?.updateSubgraph(id, partial)
    emitState()
  }, [emitState])

  const handleEdgeReconnect = useCallback((oldFrom: string, oldTo: string, newFrom: string, newTo: string) => {
    editorRef.current?.reconnectEdge(oldFrom, oldTo, newFrom, newTo)
    setSelectedId(editorRef.current?.selected ?? null)
    emitState()
  }, [emitState])

  const handleDuplicate = useCallback(() => {
    const ed = editorRef.current
    if (!ed || !ed.selected || ed.getSelectionType() !== 'node') return
    const nid = ed.duplicateNode(ed.selected)
    if (nid) setSelectedId(nid)
    emitState()
  }, [emitState])

  const handleClear = useCallback(() => {
    const ed = editorRef.current
    if (!ed || ed.state.nodes.length === 0) return
    if (!window.confirm('Clear the whole diagram?')) return
    ed.clear()
    setSelectedId(null)
    emitState()
  }, [emitState])

  const handleJsonChange = useCallback((json: string) => {
    setJsonStr(json)
    try {
      const parsed = JSON.parse(json) as DiagramState
      editorRef.current?.load(parsed)
      setSelectedId(null)
      setJsonError(null)
      if (rendererRef.current && mode === 'edit') {
        rendererRef.current.loadStateToWasm(parsed)
      }
    } catch {}
  }, [mode])

  const handleJsonError = useCallback((err: string | null) => {
    setJsonError(err)
  }, [])

  const handleDoubleClick = useCallback((nodeId: string, screenX: number, screenY: number) => {
    const ed = editorRef.current
    if (!ed) return
    const node = ed.state.nodes.find((n) => n.id === nodeId)
    if (!node) return
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const renderer = rendererRef.current as any
    const zoom = renderer?.cam?.zoom ?? 1
    setEditingLabel({
      id: nodeId,
      x: screenX,
      y: screenY - rect.top,
      w: (node.w ?? 156) * zoom,
      h: (node.h ?? 66) * zoom,
      label: node.label ?? '',
    })
  }, [])

  const handleTogglePanel = useCallback(() => setSideOpen((o) => !o), [])

  const selectionType = editor?.getSelectionType() ?? null
  const selectedNode = selectionType === 'node' ? editor?.getSelectedNode() ?? null : null
  const selectedEdge = selectionType === 'edge' ? editor?.getSelectedEdge() ?? null : null
  const selectedSubgraph = selectionType === 'subgraph' ? editor?.getSelectedSubgraph() ?? null : null

  // hint text
  const hint = mode === 'edit'
    ? '<kbd>Del</kbd> delete · <kbd>Ctrl+Z</kbd> undo · drag node to move · drag port to connect'
    : '<kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> pick path · <kbd>R</kbd> restart · scroll to zoom · drag to pan'

  return (
    <>
      <canvas ref={canvasRef} id="c" />

      <TopBar
        diagram={diagram}
        theme={themeName}
        mode={mode}
        onDiagramChange={handleDiagramChange}
        onThemeChange={handleThemeChange}
        onModeChange={handleModeChange}
      />

      <ZoomBar
        zoomPct={zoomPct}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onZoomReset={handleZoomReset}
      />

      <SidePanel open={sideOpen} onToggle={handleTogglePanel}>
        <div style={{ display: 'flex', gap: 4, marginBottom: 14, borderBottom: '1px solid var(--line)', paddingBottom: 4 }}>
          {(['palette', 'json', 'props'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                background: tab === activeTab ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'none',
                color: tab === activeTab ? 'var(--accent)' : 'var(--muted)',
                border: 'none',
                borderRadius: 6,
                padding: '5px 10px',
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === 'palette' && (
          <ToolPalette
            onAddNode={handleAddNode}
            onConnect={handleConnect}
            onAddSubgraph={handleAddSubgraph}
            onDuplicate={handleDuplicate}
            onDelete={handleDelete}
            onClear={handleClear}
            onUndo={handleUndo}
            onRedo={handleRedo}
            canUndo={editor?.canUndo() ?? false}
            canRedo={editor?.canRedo() ?? false}
          />
        )}

        {activeTab === 'json' && (
          <JsonEditor value={jsonStr} onChange={handleJsonChange} onError={handleJsonError} />
        )}

        {activeTab === 'props' && (
          <PropertyEditor
            node={selectedNode}
            edge={selectedEdge}
            subgraph={selectedSubgraph}
            selectionType={selectionType}
            onNodeUpdate={handleNodeUpdate}
            onEdgeUpdate={handleEdgeUpdate}
            onEdgeReconnect={handleEdgeReconnect}
            onSubgraphUpdate={handleSubgraphUpdate}
            allNodes={editor?.state.nodes ?? []}
          />
        )}
      </SidePanel>

      <div id="err" style={{ opacity: error || jsonError ? 1 : 0 }}>
        {error || jsonError}
      </div>
      <div className="hint" dangerouslySetInnerHTML={{ __html: hint }} />

      {editingLabel && (
        <input
          key={editingLabel.id}
          autoFocus
          defaultValue={editingLabel.label}
          style={{
            position: 'fixed',
            left: editingLabel.x,
            top: editingLabel.y,
            width: editingLabel.w,
            height: editingLabel.h,
            background: 'var(--bg)',
            color: 'var(--text)',
            border: '2px solid var(--accent)',
            borderRadius: 6,
            padding: '0 10px',
            fontSize: 14,
            fontFamily: 'var(--font-display)',
            textAlign: 'center',
            outline: 'none',
            zIndex: 20,
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              editorRef.current?.updateNode(editingLabel.id, { label: e.currentTarget.value })
              emitState()
              setEditingLabel(null)
            } else if (e.key === 'Escape') {
              setEditingLabel(null)
            }
          }}
          onBlur={(e) => {
            editorRef.current?.updateNode(editingLabel.id, { label: e.target.value })
            emitState()
            setEditingLabel(null)
          }}
        />
      )}
    </>
  )
}
