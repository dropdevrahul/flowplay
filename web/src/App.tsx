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
import { SimPanel } from './components/SimPanel'
import { Simulation } from './renderer/sim'
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
  const [mode, setMode] = useState<'view' | 'edit' | 'simulate'>('view')
  const [sideOpen, setSideOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'palette' | 'json' | 'props'>('palette')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [editingLabel, setEditingLabel] = useState<{ id: string; edge?: { from: string; to: string }; x: number; y: number; w: number; h: number; label: string } | null>(null)
  const simRef = useRef<Simulation | null>(null)
  const [simTick, setSimTick] = useState(0)

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
    r.onEdgeDoubleClick = handleEdgeDoubleClick
    r.init(canvas, themeName).then(() => {
      r.loadDiagram(diagram)
    })
    return () => {
      r.onDoubleClick = null
      r.onEdgeDoubleClick = null
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
    rendererRef.current.editMode = mode !== 'view'
    rendererRef.current.simMode = mode === 'simulate'
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
      // rebuild the simulation if we loaded a new diagram while simulating
      if (rendererRef.current?.simMode && editorRef.current) {
        const sim = new Simulation(editorRef.current.state)
        simRef.current = sim
        rendererRef.current.simulation = sim
        setSimTick((t) => t + 1)
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

  const handleModeChange = useCallback((newMode: 'view' | 'edit' | 'simulate') => {
    setMode(newMode)
    setSideOpen(newMode !== 'view')
    const r = rendererRef.current
    if (!r) return
    r.editMode = newMode !== 'view'
    r.simMode = newMode === 'simulate'
    r.editor = newMode !== 'view' ? editorRef.current : null
    if (newMode === 'simulate' && editorRef.current) {
      const sim = new Simulation(editorRef.current.state)
      simRef.current = sim
      r.simulation = sim
      setSelectedId(null)
      setSimTick((t) => t + 1)
    } else {
      r.simulation = null
    }
    if (editorRef.current) r.loadStateToWasm(editorRef.current.state)
    if (newMode === 'view') r.resetView()
  }, [])

  const handleFire = useCallback((event: string) => {
    simRef.current?.fire(event)
    setSimTick((t) => t + 1)
  }, [])

  const handleStep = useCallback(() => {
    simRef.current?.step()
    setSimTick((t) => t + 1)
  }, [])

  const handleSimReset = useCallback(() => {
    simRef.current?.reset()
    setSimTick((t) => t + 1)
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

  const handleGlobalFont = useCallback((px: number) => {
    editorRef.current?.setGlobalFont(px)
    emitState()
  }, [emitState])

  const handleTypeChange = useCallback((t: 'flowchart' | 'statemachine') => {
    editorRef.current?.setType(t)
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

  const handleEdgeDoubleClick = useCallback((from: string, to: string, screenX: number, screenY: number) => {
    const ed = editorRef.current
    if (!ed) return
    const edge = ed.state.edges.find((e) => e.from === from && e.to === to)
    if (!edge) return
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const sm = ed.state.type === 'statemachine'
    const cur = sm ? (edge.event ?? '') : (edge.label ?? '')
    setEditingLabel({
      id: `edge:${from}→${to}`,
      edge: { from, to },
      x: screenX - 70,
      y: screenY - rect.top - 14,
      w: 140,
      h: 28,
      label: cur,
    })
  }, [])

  const commitLabel = useCallback((value: string) => {
    const el = editingLabel
    if (!el) return
    const ed = editorRef.current
    if (el.edge) {
      const sm = ed?.state.type === 'statemachine'
      ed?.updateEdge(el.edge.from, el.edge.to, sm ? { event: value } : { label: value })
    } else {
      ed?.updateNode(el.id, { label: value })
    }
    emitState()
    setEditingLabel(null)
  }, [editingLabel, emitState])

  const handleTogglePanel = useCallback(() => setSideOpen((o) => !o), [])

  const selectionType = editor?.getSelectionType() ?? null
  const selectedNode = selectionType === 'node' ? editor?.getSelectedNode() ?? null : null
  const selectedEdge = selectionType === 'edge' ? editor?.getSelectedEdge() ?? null : null
  const selectedSubgraph = selectionType === 'subgraph' ? editor?.getSelectedSubgraph() ?? null : null

  // hint text
  const hint = mode === 'edit'
    ? '<kbd>Del</kbd> delete · <kbd>Ctrl+Z</kbd> undo · drag node to move · drag port to connect · dbl-click to rename'
    : mode === 'simulate'
    ? 'Fire events in the panel · <kbd>Step</kbd> auto-advance · <kbd>Reset</kbd> · scroll to zoom · drag to pan'
    : '<kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> pick path · <kbd>R</kbd> restart · scroll to zoom · drag to pan'

  return (
    <>
      <canvas ref={canvasRef} id="c" />

      <TopBar
        diagram={diagram}
        theme={themeName}
        mode={mode}
        graphType={editor?.state.type ?? 'flowchart'}
        onDiagramChange={handleDiagramChange}
        onThemeChange={handleThemeChange}
        onModeChange={handleModeChange}
        onTypeChange={handleTypeChange}
      />

      <ZoomBar
        zoomPct={zoomPct}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onZoomReset={handleZoomReset}
      />

      <SidePanel open={sideOpen} onToggle={handleTogglePanel}>
        {mode === 'simulate' && simRef.current ? (
          <SimPanel sim={simRef.current} tick={simTick} onFire={handleFire} onStep={handleStep} onReset={handleSimReset} />
        ) : (
        <>
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
            fontSize={editor?.state.fontSize ?? 16}
            onFontChange={handleGlobalFont}
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
            isStateMachine={editor?.state.type === 'statemachine'}
          />
        )}
        </>
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
              commitLabel(e.currentTarget.value)
            } else if (e.key === 'Escape') {
              setEditingLabel(null)
            }
          }}
          onBlur={(e) => commitLabel(e.target.value)}
        />
      )}
    </>
  )
}
