import type { ThemeCanvas } from './theme'
import { themes, applyThemeCSS } from './theme'
import type { Pt, NodeSpec, EdgeSpec, SubgraphSpec, DrawAPI } from './renderer/types'
import type { DiagramEditor } from './renderer/editor'
import { layoutDiagram, contentBox } from './renderer/layout'
import { CameraController } from './renderer/camera'
import { instantiateWasm, readStr, readTransitions } from './renderer/wasm'

function rgba(hex: string, a: number = 1): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${a})`
}

function hexU32(v: number): string {
  return '#' + (v >>> 8).toString(16).padStart(6, '0')
}

export class CanvasRenderer implements DrawAPI {
  private canvas!: HTMLCanvasElement
  private ctx!: CanvasRenderingContext2D
  private mem!: WebAssembly.Memory
  private instance!: WebAssembly.Instance
  private T = 0
  private trail: Pt[] = []
  private dpr = 1
  private themeName = 'dark'
  private theme!: ThemeCanvas
  private raf = 0
  private running = false
  private cam = new CameraController()
  private pills: { label: string; x: number; y: number; w: number; h: number }[] = []

  // edit mode
  editMode = false
  simMode = false
  editor: DiagramEditor | null = null
  simulation: import('./renderer/sim').Simulation | null = null
  private tempEdge: { fromNode: string; fromPort: Pt; toPt: Pt } | null = null
  private connectFrom: string | null = null
  private dragNode: string | null = null
  private dragWaypoint: { from: string; to: string; index: number } | null = null
  private dragStart = { x: 0, y: 0 }
  private nodeStart = { x: 0, y: 0 }

  getCameraCenter(): { x: number; y: number } {
    const cx = window.innerWidth / 2
    const cy = window.innerHeight / 2
    return { x: this.cam.worldX(cx), y: this.cam.worldY(cy) }
  }

  onZoomChange: ((pct: number) => void) | null = null
  onError: ((msg: string) => void) | null = null
  onSelectionChange: ((id: string | null) => void) | null = null
  onDoubleClick: ((nodeId: string, screenX: number, screenY: number) => void) | null = null
  onEdgeDoubleClick: ((from: string, to: string, screenX: number, screenY: number) => void) | null = null

  private boundResize: () => void
  private boundWheel: (e: WheelEvent) => void
  private boundMouseDown: (e: MouseEvent) => void
  private boundMouseMove: (e: MouseEvent) => void
  private boundMouseUp: () => void
  private boundKeyDown: (e: KeyboardEvent) => void
  private boundDoubleClick: ((e: MouseEvent) => void) | null = null
  private dragging = false
  private last = { x: 0, y: 0 }
  private FONT_D = "'Geist', system-ui, -apple-system, sans-serif"
  private FONT_M = "'Geist Mono', ui-monospace, 'SFMono-Regular', monospace"

  constructor() {
    this.boundResize = () => this.fitCanvas()
    this.boundWheel = (e) => this.onWheel(e)
    this.boundMouseDown = (e) => this.onMouseDown(e)
    this.boundMouseMove = (e) => this.onMouseMove(e)
    this.boundMouseUp = () => this.onMouseUp()
    this.boundKeyDown = (e) => this.onKeyDown(e)
    this.cam.onZoomChange = (pct) => this.onZoomChange?.(pct)
  }

  async init(canvas: HTMLCanvasElement, themeName?: string) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.setTheme(themeName ?? 'light')
    this.fitCanvas()
    window.addEventListener('resize', this.boundResize)
    canvas.addEventListener('wheel', this.boundWheel, { passive: false })
    canvas.addEventListener('mousedown', this.boundMouseDown)
    window.addEventListener('mousemove', this.boundMouseMove)
    window.addEventListener('mouseup', this.boundMouseUp)
    window.addEventListener('keydown', this.boundKeyDown)
    canvas.addEventListener('mouseleave', () => { this.dragging = false; this.dragNode = null; this.dragWaypoint = null })
    canvas.style.cursor = 'grab'

    this.boundDoubleClick = (e: MouseEvent) => {
      if (!this.editMode || !this.editor || this.simMode) return
      const ed = this.editor
      const rect = this.canvas.getBoundingClientRect()
      const wx = this.cam.worldX(e.clientX - rect.left)
      const wy = this.cam.worldY(e.clientY - rect.top)

      // double-click a waypoint on the selected edge to remove it
      if (ed.getSelectionType() === 'edge') {
        const se = ed.getSelectedEdge()
        if (se?.waypoints) {
          for (let i = 0; i < se.waypoints.length; i++) {
            if (Math.hypot(wx - se.waypoints[i].x, wy - se.waypoints[i].y) < 8) {
              ed.removeWaypoint(se.from, se.to, i)
              this.loadStateToWasm(ed.state)
              window.dispatchEvent(new CustomEvent('editor-state-change'))
              return
            }
          }
        }
      }

      // node label edit
      for (const n of ed.state.nodes) {
        if (wx >= n.x! && wx <= n.x! + n.w! && wy >= n.y! && wy <= n.y! + n.h!) {
          ed.select(n.id)
          this.onSelectionChange?.(n.id)
          this.onDoubleClick?.(n.id, e.clientX, e.clientY)
          return
        }
      }

      // edge label edit
      for (const e2 of ed.state.edges) {
        const a = ed.state.nodes.find((n) => n.id === e2.from)
        const b = ed.state.nodes.find((n) => n.id === e2.to)
        if (!a || !b) continue
        const pts = this.edgePath(a, b, e2)
        for (let i = 0; i < pts.length - 1; i++) {
          if (this.distToSegment(wx, wy, pts[i], pts[i + 1]) < 6) {
            ed.select('edge:' + e2.from + '→' + e2.to)
            this.onSelectionChange?.('edge:' + e2.from + '→' + e2.to)
            this.onEdgeDoubleClick?.(e2.from, e2.to, e.clientX, e.clientY)
            return
          }
        }
      }
    }
    canvas.addEventListener('dblclick', this.boundDoubleClick)

    this.instance = await instantiateWasm(this)
    this.mem = this.instance.exports.memory as WebAssembly.Memory
    ;(this.instance.exports as any).init()
  }

  destroy() {
    this.running = false
    cancelAnimationFrame(this.raf)
    window.removeEventListener('resize', this.boundResize)
    this.canvas?.removeEventListener('wheel', this.boundWheel)
    this.canvas?.removeEventListener('mousedown', this.boundMouseDown)
    window.removeEventListener('mousemove', this.boundMouseMove)
    window.removeEventListener('mouseup', this.boundMouseUp)
    window.removeEventListener('keydown', this.boundKeyDown)
    if (this.boundDoubleClick) {
      this.canvas?.removeEventListener('dblclick', this.boundDoubleClick)
      this.boundDoubleClick = null
    }
  }

  setTheme(name: string) {
    const t = themes[name]
    if (!t) return
    this.themeName = name
    this.theme = t.canvas
    applyThemeCSS(name, themes)
  }

  getThemeName() { return this.themeName }

  async loadDiagram(name: string) {
    if (!this.instance) return
    this.trail = []
    let text: string
    try {
      const resp = await fetch(`/examples/${name}.json`)
      text = await resp.text()
    } catch {
      this.onError?.(`failed to load ${name}`)
      return
    }
    let spec: any
    try {
      spec = JSON.parse(text)
      layoutDiagram(spec)
    } catch { return }
    const json = JSON.stringify(spec)
    const cap = 64 * 1024
    if (json.length > cap) {
      this.onError?.('diagram too large')
      return
    }
    const ptr = (this.instance.exports as any).jsonPtr() as number
    new Uint8Array(this.mem.buffer, ptr, json.length).set(new TextEncoder().encode(json))
    ;(this.instance.exports as any).loadJson(json.length)
    this.startLoop()
    this.cam.resetView(contentBox)
  }

  loadStateToWasm(state: import('./renderer/types').DiagramState) {
    const json = JSON.stringify(state)
    const cap = 64 * 1024
    if (json.length > cap) return
    const ptr = (this.instance.exports as any).jsonPtr() as number
    new Uint8Array(this.mem.buffer, ptr, json.length).set(new TextEncoder().encode(json))
    ;(this.instance.exports as any).loadJson(json.length)
  }

  // arm click-to-connect from the selected node; returns false if nothing is selected
  armConnect(): boolean {
    const sel = this.editor?.selected
    if (!sel || this.editor?.getSelectionType() !== 'node') return false
    this.connectFrom = sel
    this.canvas.style.cursor = 'crosshair'
    return true
  }

  handleKey(code: number) { (this.instance.exports as any).onKey(code) }
  zoomIn() { this.cam.zoomIn() }
  zoomOut() { this.cam.zoomOut() }
  resetView() { this.cam.resetView(contentBox) }

  // ---- DrawAPI (called by WASM in view mode) ----

  js_clear() {
    const c = this.theme
    const ctx = this.ctx
    const W = window.innerWidth, H = window.innerHeight

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.fillStyle = c.bgTop
    ctx.fillRect(0, 0, W, H)

    let base = 48
    let sw = base * this.cam.zoom
    while (sw < 16) { base *= 2; sw = base * this.cam.zoom }
    const px = ((this.cam.x % sw) + sw) % sw
    const py = ((this.cam.y % sw) + sw) % sw
    ctx.strokeStyle = c.grid
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let x = px; x < W; x += sw) { ctx.moveTo(x, 0); ctx.lineTo(x, H) }
    for (let y = py; y < H; y += sw) { ctx.moveTo(0, y); ctx.lineTo(W, y) }
    ctx.stroke()

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.translate(this.cam.x, this.cam.y)
    ctx.scale(this.cam.zoom, this.cam.zoom)
  }

  js_node(kind: number, x: number, y: number, w: number, h: number, _fill: number, stroke: number, opacity: number, lineW: number) {
    const c = this.theme
    const active = lineW >= 3
    const ctx = this.ctx
    ctx.save()
    ctx.globalAlpha = opacity
    ctx.shadowColor = c.shadow
    ctx.shadowBlur = 10
    ctx.shadowOffsetY = 3
    this.nodePath(kind, x, y, w, h)
    ctx.fillStyle = c.nodeFill
    ctx.fill()
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
    ctx.shadowOffsetY = 0

    ctx.save()
    this.nodePath(kind, x, y, w, h)
    ctx.clip()
    const topGrad = ctx.createLinearGradient(x, y, x, y + h * 0.35)
    topGrad.addColorStop(0, 'rgba(255,255,255,0.06)')
    topGrad.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = topGrad
    ctx.fillRect(x, y, w, h * 0.35)
    ctx.restore()

    this.nodePath(kind, x, y, w, h)
    ctx.lineWidth = active ? 2 : 1.5
    ctx.strokeStyle = active ? c.accent : hexU32(stroke)
    ctx.stroke()
    ctx.restore()
  }

  js_edge(x1: number, y1: number, _cx: number, _cy: number, x2: number, y2: number, _color: number, opacity: number, lineW: number, arrow: boolean) {
    const c = this.theme
    const active = lineW >= 3
    const ctx = this.ctx
    ctx.save()
    ctx.globalAlpha = opacity

    const dy = y2 - y1
    const dx = x2 - x1
    let path: Pt[]
    if (Math.abs(dy) > Math.abs(dx) * 0.3) {
      const midY = (y1 + y2) / 2
      path = [{ x: x1, y: y1 }, { x: x1, y: midY }, { x: x2, y: midY }, { x: x2, y: y2 }]
    } else {
      const midX = (x1 + x2) / 2
      path = [{ x: x1, y: y1 }, { x: midX, y: y1 }, { x: midX, y: y2 }, { x: x2, y: y2 }]
    }

    ctx.beginPath()
    ctx.moveTo(path[0].x, path[0].y)
    for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y)

    ctx.strokeStyle = active ? c.accent : c.edge
    ctx.lineWidth = active ? 2.5 : 1.5
    ctx.setLineDash([5, 5])
    ctx.lineDashOffset = 0
    ctx.stroke()

    if (arrow && path.length >= 2) {
      const last = path[path.length - 1]
      const prev = path[path.length - 2]
      const a = Math.atan2(last.y - prev.y, last.x - prev.x)
      const s = 8
      ctx.setLineDash([])
      ctx.beginPath()
      ctx.moveTo(last.x, last.y)
      ctx.lineTo(last.x - s * Math.cos(a - 0.45), last.y - s * Math.sin(a - 0.45))
      ctx.lineTo(last.x - s * 0.55 * Math.cos(a), last.y - s * 0.55 * Math.sin(a))
      ctx.lineTo(last.x - s * Math.cos(a + 0.45), last.y - s * Math.sin(a + 0.45))
      ctx.closePath()
      ctx.fillStyle = active ? c.accent : c.edge
      ctx.fill()
    }

    ctx.restore()
  }

  js_token(x: number, y: number, r: number, _color: number) {
    const c = this.theme
    const ctx = this.ctx
    this.trail.push({ x, y })
    if (this.trail.length > 12) this.trail.shift()

    ctx.save()
    for (let i = 0; i < this.trail.length; i++) {
      const p = this.trail[i]
      const k = i / this.trail.length
      ctx.globalAlpha = Math.pow(k, 1.5) * 0.25
      ctx.fillStyle = c.accent
      ctx.beginPath()
      ctx.arc(p.x, p.y, r * 0.3 * k, 0, Math.PI * 2)
      ctx.fill()
    }

    const pulse = 0.2 + Math.sin(this.T / 400) * 0.12
    ctx.globalAlpha = pulse
    ctx.strokeStyle = c.accent
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(x, y, r * 1.6, 0, Math.PI * 2)
    ctx.stroke()

    ctx.globalAlpha = 1
    ctx.fillStyle = c.accent
    ctx.beginPath()
    ctx.arc(x, y, r * 0.6, 0, Math.PI * 2)
    ctx.fill()

    ctx.globalAlpha = 0.6
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(x - r * 0.15, y - r * 0.15, r * 0.22, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  js_subgraph(x: number, y: number, w: number, h: number, ptr: number, len: number) {
    const label = len > 0 ? readStr(this.mem, ptr, len) : ''
    this.drawSubgraph(x, y, w, h, label)
  }

  js_label(ptr: number, len: number, x: number, y: number, _color: number, opacity: number, size: number) {
    this.drawLabel(readStr(this.mem, ptr, len), x, y, opacity, size)
  }

  js_error(ptr: number, len: number) {
    this.onError?.(readStr(this.mem, ptr, len))
  }

  // ---- edit-mode rendering ----

  private renderEditFrame() {
    const ed = this.editor
    if (!ed) return

    this.js_clear()

    const state = ed.state

    for (const sg of state.subgraphs) {
      this.drawSubgraphFromState(sg)
    }

    const simActive = this.simMode ? this.simulation?.active ?? null : null

    if (!this.simMode && ed.selected && ed.getSelectionType() === 'subgraph') {
      const selSg = ed.getSelectedSubgraph()
      if (selSg) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
        for (const nid of selSg.nodes) {
          const n = state.nodes.find((x) => x.id === nid)
          if (!n) continue
          minX = Math.min(minX, n.x!)
          minY = Math.min(minY, n.y!)
          maxX = Math.max(maxX, n.x! + n.w!)
          maxY = Math.max(maxY, n.y! + n.h!)
        }
        if (minX <= maxX) {
          const pad = 16, topPad = 36
          const ctx = this.ctx
          const c = this.theme
          ctx.save()
          ctx.strokeStyle = c.accent
          ctx.lineWidth = 2.5
          ctx.setLineDash([6, 4])
          ctx.beginPath()
          ctx.roundRect(minX - pad, minY - topPad, (maxX - minX) + pad * 2, (maxY - minY) + pad + topPad, 10)
          ctx.stroke()
          ctx.setLineDash([])
          ctx.restore()
        }
      }
    }

    for (const e of state.edges) {
      const a = state.nodes.find((n) => n.id === e.from)
      const b = state.nodes.find((n) => n.id === e.to)
      if (!a || !b) continue
      const isSel = this.simMode
        ? e.from === simActive
        : ed.getSelectionType() === 'edge' && ed.selected === 'edge:' + e.from + '→' + e.to
      this.drawEdgeFromState(a, b, e, isSel)
    }

    if (this.tempEdge) {
      this.drawTempEdge()
    }

    for (const n of state.nodes) {
      const isSel = this.simMode ? n.id === simActive : n.id === ed.selected
      this.drawNodeFromState(n, isSel)
    }

    if (!this.simMode && ed.selected) {
      const selNode = state.nodes.find((n) => n.id === ed.selected)
      if (selNode) this.drawPorts(selNode)
    }

    if (!this.simMode) {
      this.readTransitions()
      this.drawPills()
    }
  }

  private drawNodeFromState(n: NodeSpec, selected: boolean) {
    const kind = n.kind ?? 'roundrect'
    const kindMap: Record<string, number> = { rect: 0, ellipse: 1, diamond: 2, roundrect: 3 }
    const k = kindMap[kind] ?? 3
    const c = this.theme
    const ctx = this.ctx

    const cx = n.x! + n.w! / 2
    const cy = n.y! + n.h! / 2
    const scale = selected ? 1.08 : 1
    const sw = n.w! * scale
    const sh = n.h! * scale
    const sx = cx - sw / 2
    const sy = cy - sh / 2

    ctx.save()
    ctx.shadowColor = selected ? c.accent + '60' : c.shadow
    ctx.shadowBlur = selected ? 22 : 10
    ctx.shadowOffsetY = selected ? 4 : 3
    this.nodePath(k, sx, sy, sw, sh)
    ctx.fillStyle = n.fill !== undefined ? hexU32(n.fill) : c.nodeFill
    ctx.fill()
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
    ctx.shadowOffsetY = 0

    // top highlight
    ctx.save()
    this.nodePath(k, sx, sy, sw, sh)
    ctx.clip()
    const g = ctx.createLinearGradient(sx, sy, sx, sy + sh * 0.35)
    g.addColorStop(0, 'rgba(255,255,255,0.06)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(sx, sy, sw, sh * 0.35)
    ctx.restore()

    this.nodePath(k, sx, sy, sw, sh)
    ctx.lineWidth = selected ? 3 : 1.5
    ctx.strokeStyle = selected ? c.accent : (n.stroke !== undefined ? hexU32(n.stroke) : c.nodeStroke)
    ctx.stroke()
    ctx.restore()

    if (n.label) {
      const base = n.fontSize ?? this.editor?.state.fontSize ?? 16
      this.drawLabel(n.label, cx, cy, 1, selected ? base + 1 : base)
    }
  }

  // shared polyline used by rendering, hit-testing, and waypoint editing
  edgePath(a: NodeSpec, b: NodeSpec, edge: EdgeSpec): Pt[] {
    const ax = a.x! + a.w! / 2, ay = a.y! + a.h! / 2
    const bx = b.x! + b.w! / 2, by = b.y! + b.h! / 2
    const wps = edge.waypoints
    if (wps && wps.length) {
      const first = wps[0], last = wps[wps.length - 1]
      const p1 = this.borderPt(a, first.x, first.y)
      const p2 = this.borderPt(b, last.x, last.y)
      return [p1, ...wps, p2]
    }
    const p1 = this.borderPt(a, bx, by)
    const p2 = this.borderPt(b, ax, ay)
    const dy = p2.y - p1.y, dx = p2.x - p1.x
    if (Math.abs(dy) > Math.abs(dx) * 0.3) {
      const midY = (p1.y + p2.y) / 2
      return [p1, { x: p1.x, y: midY }, { x: p2.x, y: midY }, p2]
    }
    const midX = (p1.x + p2.x) / 2
    return [p1, { x: midX, y: p1.y }, { x: midX, y: p2.y }, p2]
  }

  private drawEdgeFromState(a: NodeSpec, b: NodeSpec, edge: EdgeSpec, active: boolean) {
    const c = this.theme
    const ctx = this.ctx
    const path = this.edgePath(a, b, edge)
    const stroke = active ? c.accent : (edge.color !== undefined ? hexU32(edge.color) : c.edge)

    ctx.save()
    ctx.beginPath()
    ctx.moveTo(path[0].x, path[0].y)
    for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y)
    ctx.strokeStyle = stroke
    ctx.lineWidth = active ? 2.5 : 1.5
    ctx.setLineDash(edge.dashed === false ? [] : [5, 5])
    ctx.stroke()

    // arrow
    if (path.length >= 2) {
      const last = path[path.length - 1]
      const prev = path[path.length - 2]
      const a2 = Math.atan2(last.y - prev.y, last.x - prev.x)
      const s = 8
      ctx.setLineDash([])
      ctx.beginPath()
      ctx.moveTo(last.x, last.y)
      ctx.lineTo(last.x - s * Math.cos(a2 - 0.45), last.y - s * Math.sin(a2 - 0.45))
      ctx.lineTo(last.x - s * 0.55 * Math.cos(a2), last.y - s * 0.55 * Math.sin(a2))
      ctx.lineTo(last.x - s * Math.cos(a2 + 0.45), last.y - s * Math.sin(a2 + 0.45))
      ctx.closePath()
      ctx.fillStyle = stroke
      ctx.fill()
    }

    // event/label (state machine: "event [guard]")
    const text = this.edgeText(edge)
    if (text) {
      const m = Math.floor(path.length / 2)
      const mid = path.length % 2 === 0
        ? { x: (path[m - 1].x + path[m].x) / 2, y: (path[m - 1].y + path[m].y) / 2 }
        : path[m]
      this.drawLabel(text, mid.x, mid.y - 9, 1, 11)
    }

    ctx.restore()

    // waypoint edit handles when this edge is selected
    if (active && this.editMode && !this.simMode) this.drawWaypointHandles(a, b, edge)
  }

  private drawWaypointHandles(a: NodeSpec, b: NodeSpec, edge: EdgeSpec) {
    const ctx = this.ctx
    const c = this.theme
    const path = this.edgePath(a, b, edge)
    ctx.save()
    // existing waypoints — solid, draggable
    for (const p of edge.waypoints ?? []) {
      ctx.fillStyle = c.accent
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    }
    // add-handles at segment midpoints — hollow
    for (let i = 0; i < path.length - 1; i++) {
      const mx = (path[i].x + path[i + 1].x) / 2
      const my = (path[i].y + path[i + 1].y) / 2
      ctx.fillStyle = c.bgTop
      ctx.strokeStyle = c.accent
      ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.arc(mx, my, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    }
    ctx.restore()
  }

  private edgeText(edge: EdgeSpec): string {
    if (this.editor?.state.type === 'statemachine') {
      const ev = edge.event ?? ''
      const g = edge.guard ? ` [${edge.guard}]` : ''
      return (ev + g) || (edge.label ?? '')
    }
    return edge.label ?? ''
  }

  private drawSubgraphFromState(sg: SubgraphSpec) {
    const state = this.editor!.state
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const nid of sg.nodes) {
      const n = state.nodes.find((x) => x.id === nid)
      if (!n) continue
      minX = Math.min(minX, n.x!)
      minY = Math.min(minY, n.y!)
      maxX = Math.max(maxX, n.x! + n.w!)
      maxY = Math.max(maxY, n.y! + n.h!)
    }
    if (minX > maxX) return
    const pad = 16, topPad = 36
    this.drawSubgraph(minX - pad, minY - topPad, (maxX - minX) + pad * 2, (maxY - minY) + pad + topPad, sg.label)
  }

  private drawSubgraph(x: number, y: number, w: number, h: number, label: string) {
    const c = this.theme
    const ctx = this.ctx
    ctx.save()
    ctx.fillStyle = c.subgraphFill
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, 10)
    ctx.fill()

    ctx.strokeStyle = c.subgraphStroke
    ctx.lineWidth = 1.5
    ctx.setLineDash([6, 4])
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, 10)
    ctx.stroke()
    ctx.setLineDash([])

    if (label) {
      ctx.font = `600 11px ${this.FONT_M}`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillStyle = c.subgraphLabel
      ctx.fillText(label.toUpperCase(), x + 14, y + 10)
    }
    ctx.restore()
  }

  private drawLabel(text: string, x: number, y: number, opacity: number, size: number) {
    const c = this.theme
    const isEdge = size <= 13
    const ctx = this.ctx
    ctx.save()
    ctx.globalAlpha = opacity
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    if (isEdge) {
      ctx.font = `500 11px ${this.FONT_M}`
      const pad = 8
      const tw = ctx.measureText(text).width
      ctx.fillStyle = c.edgeLabelBg
      ctx.beginPath()
      ctx.roundRect(x - tw / 2 - pad, y - 8, tw + pad * 2, 16, 4)
      ctx.fill()
      ctx.strokeStyle = rgba(c.accent, 0.2)
      ctx.lineWidth = 0.5
      ctx.beginPath()
      ctx.roundRect(x - tw / 2 - pad, y - 8, tw + pad * 2, 16, 4)
      ctx.stroke()
      ctx.fillStyle = c.edgeLabelText
      ctx.font = `500 11px ${this.FONT_M}`
    } else {
      ctx.font = `500 ${size}px ${this.FONT_D}`
      ctx.shadowColor = 'rgba(0,0,0,0.5)'
      ctx.shadowBlur = 4
      ctx.shadowOffsetY = 1
      ctx.fillStyle = c.label
    }
    ctx.fillText(text, x, y)
    ctx.restore()
  }

  private drawPorts(n: NodeSpec) {
    const c = this.theme
    const ctx = this.ctx
    const x = n.x!, y = n.y!, w = n.w!, h = n.h!
    const ports = [
      { x: x + w / 2, y }, { x: x + w, y: y + h / 2 },
      { x: x + w / 2, y: y + h }, { x: x, y: y + h / 2 },
    ]
    for (const p of ports) {
      ctx.save()
      ctx.fillStyle = c.accent
      ctx.beginPath()
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
    }
  }

  private drawTempEdge() {
    if (!this.tempEdge) return
    const c = this.theme
    const ctx = this.ctx
    ctx.save()
    ctx.strokeStyle = c.accent
    ctx.lineWidth = 2
    ctx.setLineDash([6, 4])
    ctx.beginPath()
    ctx.moveTo(this.tempEdge.fromPort.x, this.tempEdge.fromPort.y)
    ctx.lineTo(this.tempEdge.toPt.x, this.tempEdge.toPt.y)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.restore()
  }

  private borderPt(n: NodeSpec, tx: number, ty: number): Pt {
    const cx = n.x! + n.w! / 2
    const cy = n.y! + n.h! / 2
    const dx = tx - cx
    const dy = ty - cy
    if (dx === 0 && dy === 0) return { x: cx, y: cy }
    let s = Infinity
    if (Math.abs(dx) > 0) s = Math.min(s, (n.w! / 2) / Math.abs(dx))
    if (Math.abs(dy) > 0) s = Math.min(s, (n.h! / 2) / Math.abs(dy))
    return { x: cx + dx * s, y: cy + dy * s }
  }

  private nodeInBounds(n: NodeSpec, wx: number, wy: number): boolean {
    return wx >= n.x! && wx <= n.x! + n.w! && wy >= n.y! && wy <= n.y! + n.h!
  }

  private distToSegment(px: number, py: number, a: Pt, b: Pt): number {
    const dx = b.x - a.x, dy = b.y - a.y
    const len2 = dx * dx + dy * dy
    if (len2 === 0) return Math.hypot(px - a.x, py - a.y)
    let t = ((px - a.x) * dx + (py - a.y) * dy) / len2
    t = Math.max(0, Math.min(1, t))
    return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy))
  }

  private portHit(n: NodeSpec, wx: number, wy: number, r = 8): Pt | null {
    const x = n.x!, y = n.y!, w = n.w!, h = n.h!
    const ports = [
      { x: x + w / 2, y, label: 'top' },
      { x: x + w, y: y + h / 2, label: 'right' },
      { x: x + w / 2, y: y + h, label: 'bottom' },
      { x: x, y: y + h / 2, label: 'left' },
    ]
    for (const p of ports) {
      if (Math.abs(wx - p.x) < r && Math.abs(wy - p.y) < r) return p
    }
    return null
  }

  // ---- keyboard ----

  private onKeyDown(e: KeyboardEvent) {
    // don't treat Del/Backspace/Ctrl+Z as canvas commands while typing in a field
    const t = e.target as HTMLElement | null
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
    if (this.editMode && !this.simMode) {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this.editor?.selected) {
          const selType = this.editor.getSelectionType()
          if (selType === 'node') {
            this.editor.removeNode(this.editor.selected)
          } else if (selType === 'edge') {
            const edge = this.editor.getSelectedEdge()
            if (edge) this.editor.removeEdge(edge.from, edge.to)
          } else if (selType === 'subgraph') {
            const sg = this.editor.getSelectedSubgraph()
            if (sg) this.editor.removeSubgraph(sg.id)
          }
          this.onSelectionChange?.(null)
          this.loadStateToWasm(this.editor.state)
          window.dispatchEvent(new CustomEvent('editor-state-change'))
          e.preventDefault()
        }
      }
      if (e.key === 'Escape') {
        this.tempEdge = null
        this.connectFrom = null
        this.canvas.style.cursor = 'grab'
        this.editor?.select(null)
        this.onSelectionChange?.(null)
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault()
        if (e.shiftKey) {
          this.editor?.redo()
        } else {
          this.editor?.undo()
        }
        this.loadStateToWasm(this.editor!.state)
        this.onSelectionChange?.(this.editor?.selected ?? null)
      }
    }
  }

  // ---- internal ----

  private nodePath(kind: number, x: number, y: number, w: number, h: number) {
    const ctx = this.ctx
    ctx.beginPath()
    if (kind === 1) {
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
    } else if (kind === 2) {
      const cx = x + w / 2, cy = y + h / 2
      ctx.moveTo(cx, y)
      ctx.lineTo(x + w, cy)
      ctx.lineTo(cx, y + h)
      ctx.lineTo(x, cy)
      ctx.closePath()
    } else if (kind === 3) {
      ctx.roundRect(x, y, w, h, 6)
    } else {
      ctx.rect(x, y, w, h)
    }
  }

  private startLoop() {
    if (this.running) return
    this.running = true
    const loop = (now: number) => {
      if (!this.running) return
      this.T = now
      if (this.editMode) {
        this.renderEditFrame()
      } else {
        ;(this.instance.exports as any).frame(now)
        this.readTransitions()
        this.drawPills()
      }
      this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
  }

  private readTransitions() {
    if (!this.instance) { this.pills = []; return }
    const ex = this.instance.exports as any
    const count = ex.getTransitionCount() as number
    if (count === 0) {
      if (this.pills.length) this.pills = []
      return
    }

    const ptr = ex.getTransitionStr() as number
    const labels = readTransitions(this.mem, ptr)

    if (this.pills.length === count && this.pills.every((p, i) => p.label === labels[i])) return

    const nx = ex.currentNodeX() as number
    const ny = ex.currentNodeY() as number
    const nh = ex.currentNodeH() as number
    const belowY = ny + nh / 2 + 18

    const ctx = this.ctx
    ctx.font = `500 13px system-ui, sans-serif`
    const pillH = 28, pillGap = 8
    const totalW = Math.max(...labels.map(l => ctx.measureText(l).width + 40))
    const startX = nx - totalW / 2

    this.pills = labels.map((label, i) => ({
      label,
      x: startX,
      y: belowY + i * (pillH + pillGap),
      w: totalW,
      h: pillH,
    }))
  }

  private drawPills() {
    const pills = this.pills
    if (!pills.length) return
    const c = this.theme
    const ctx = this.ctx

    ctx.save()
    for (let i = 0; i < pills.length; i++) {
      const p = pills[i]
      const cy = p.y + p.h / 2

      ctx.shadowColor = c.shadow
      ctx.shadowBlur = 6
      ctx.shadowOffsetY = 2

      ctx.beginPath()
      ctx.roundRect(p.x, p.y, p.w, p.h, 6)
      ctx.fillStyle = this.themeName === 'light' ? '#ffffff' : '#1a1d26'
      ctx.fill()
      ctx.shadowColor = 'transparent'
      ctx.shadowBlur = 0
      ctx.shadowOffsetY = 0

      ctx.strokeStyle = c.accent
      ctx.lineWidth = 1.5
      ctx.stroke()

      const num = `${i + 1}`
      ctx.font = `600 12px system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = c.nodeFill
      ctx.beginPath()
      ctx.arc(p.x + 16, cy, 10, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = c.accent
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.fillStyle = c.accent
      ctx.fillText(num, p.x + 16, cy)

      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = c.label
      ctx.font = `500 13px system-ui, sans-serif`
      ctx.fillText(p.label, p.x + 32, cy)
    }
    ctx.restore()
  }

  private fitCanvas() {
    this.dpr = window.devicePixelRatio || 1
    const w = Math.round(window.innerWidth * this.dpr)
    const h = Math.round(window.innerHeight * this.dpr)
    this.canvas.style.width = window.innerWidth + 'px'
    this.canvas.style.height = window.innerHeight + 'px'
    this.canvas.width = w
    this.canvas.height = h
  }

  private onWheel(e: WheelEvent) {
    e.preventDefault()
    const rect = this.canvas.getBoundingClientRect()
    this.cam.zoomAbout(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * 0.001))
  }

  private onMouseDown(e: MouseEvent) {
    if (this.editMode) {
      this.onEditMouseDown(e)
      return
    }
    // view mode: pill hit-test
    const pills = this.pills
    if (pills.length > 0) {
      const rect = this.canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const wx = this.cam.worldX(mx)
      const wy = this.cam.worldY(my)
      for (let i = 0; i < pills.length; i++) {
        const p = pills[i]
        if (wx >= p.x && wx <= p.x + p.w && wy >= p.y && wy <= p.y + p.h) {
          const ex = this.instance?.exports as any
          if (ex?.selectTransition) ex.selectTransition(i)
          return
        }
      }
    }

    this.dragging = true
    this.last = { x: e.clientX, y: e.clientY }
    this.canvas.style.cursor = 'grabbing'
  }

  private onEditMouseDown(e: MouseEvent) {
    if (this.simMode) {
      // simulate mode: pan only, no editing
      this.dragging = true
      this.last = { x: e.clientX, y: e.clientY }
      this.canvas.style.cursor = 'grabbing'
      return
    }
    const ed = this.editor
    if (!ed) return
    const rect = this.canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const wx = this.cam.worldX(mx)
    const wy = this.cam.worldY(my)

    // click-to-connect: armed from a source node, next node click completes the edge
    if (this.connectFrom) {
      const from = this.connectFrom
      this.connectFrom = null
      this.canvas.style.cursor = 'grab'
      for (let i = ed.state.nodes.length - 1; i >= 0; i--) {
        const n = ed.state.nodes[i]
        if (this.nodeInBounds(n, wx, wy)) {
          ed.addEdge(from, n.id)
          this.loadStateToWasm(ed.state)
          window.dispatchEvent(new CustomEvent('editor-state-change'))
          return
        }
      }
      return
    }

    // waypoint handles on a selected edge (drag existing, or add on a segment midpoint)
    if (ed.getSelectionType() === 'edge') {
      const se = ed.getSelectedEdge()
      const a = se && ed.state.nodes.find((n) => n.id === se.from)
      const b = se && ed.state.nodes.find((n) => n.id === se.to)
      if (se && a && b) {
        const wps = se.waypoints ?? []
        for (let i = 0; i < wps.length; i++) {
          if (Math.hypot(wx - wps[i].x, wy - wps[i].y) < 8) {
            ed.snapshot()
            this.dragWaypoint = { from: se.from, to: se.to, index: i }
            this.canvas.style.cursor = 'grabbing'
            return
          }
        }
        const path = this.edgePath(a, b, se)
        for (let i = 0; i < path.length - 1; i++) {
          const cx = (path[i].x + path[i + 1].x) / 2, cy = (path[i].y + path[i + 1].y) / 2
          if (Math.hypot(wx - cx, wy - cy) < 7) {
            ed.addWaypoint(se.from, se.to, i, { x: cx, y: cy })
            this.dragWaypoint = { from: se.from, to: se.to, index: i }
            this.canvas.style.cursor = 'grabbing'
            this.loadStateToWasm(ed.state)
            window.dispatchEvent(new CustomEvent('editor-state-change'))
            return
          }
        }
      }
    }

    // port hit-test on selected node
    if (ed.selected) {
      const selNode = ed.state.nodes.find((n) => n.id === ed.selected)
      if (selNode) {
        const hit = this.portHit(selNode, wx, wy)
        if (hit) {
          this.tempEdge = { fromNode: ed.selected, fromPort: hit, toPt: { x: wx, y: wy } }
          return
        }
      }
    }

    // node hit-test (iterate reverse for topmost)
    for (let i = ed.state.nodes.length - 1; i >= 0; i--) {
      const n = ed.state.nodes[i]
      if (this.nodeInBounds(n, wx, wy)) {
        ed.select(n.id)
        ed.snapshot()
        this.onSelectionChange?.(n.id)
        this.dragNode = n.id
        this.dragStart = { x: mx, y: my }
        this.nodeStart = { x: n.x!, y: n.y! }
        this.canvas.style.cursor = 'grabbing'
        this.loadStateToWasm(ed.state)
        return
      }
    }

    // subgraph hit-test
    for (const sg of ed.state.subgraphs) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const nid of sg.nodes) {
        const n = ed.state.nodes.find((x) => x.id === nid)
        if (!n) continue
        minX = Math.min(minX, n.x!)
        minY = Math.min(minY, n.y!)
        maxX = Math.max(maxX, n.x! + n.w!)
        maxY = Math.max(maxY, n.y! + n.h!)
      }
      if (minX > maxX) continue
      const pad = 16, topPad = 36
      const sx = minX - pad, sy = minY - topPad
      const sw = (maxX - minX) + pad * 2, sh = (maxY - minY) + pad + topPad
      if (wx >= sx && wx <= sx + sw && wy >= sy && wy <= sy + sh) {
        ed.select('subgraph:' + sg.id)
        this.onSelectionChange?.('subgraph:' + sg.id)
        this.canvas.style.cursor = 'pointer'
        return
      }
    }

    // edge hit-test
    for (const e of ed.state.edges) {
      const a = ed.state.nodes.find((n) => n.id === e.from)
      const b = ed.state.nodes.find((n) => n.id === e.to)
      if (!a || !b) continue
      const pts = this.edgePath(a, b, e)
      const tol = 6
      for (let i = 0; i < pts.length - 1; i++) {
        const d = this.distToSegment(wx, wy, pts[i], pts[i + 1])
        if (d < tol) {
          ed.select('edge:' + e.from + '→' + e.to)
          this.onSelectionChange?.('edge:' + e.from + '→' + e.to)
          this.canvas.style.cursor = 'pointer'
          return
        }
      }
    }

    // empty area
    ed.select(null)
    this.onSelectionChange?.(null)
    this.tempEdge = null
    this.dragging = true
    this.last = { x: e.clientX, y: e.clientY }
    this.canvas.style.cursor = 'grabbing'
  }

  private onMouseMove(e: MouseEvent) {
    if (this.editMode) {
      this.onEditMouseMove(e)
      return
    }
    if (!this.dragging) return
    this.cam.x += e.clientX - this.last.x
    this.cam.y += e.clientY - this.last.y
    this.last = { x: e.clientX, y: e.clientY }
  }

  private onEditMouseMove(e: MouseEvent) {
    const rect = this.canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const wx = this.cam.worldX(mx)
    const wy = this.cam.worldY(my)

    if (this.tempEdge) {
      this.tempEdge.toPt = { x: wx, y: wy }
      return
    }

    if (this.dragWaypoint) {
      const w = this.dragWaypoint
      this.editor?.moveWaypointSilent(w.from, w.to, w.index, { x: wx, y: wy })
      return
    }

    if (this.dragNode) {
      const dx = (mx - this.dragStart.x) / this.cam.zoom
      const dy = (my - this.dragStart.y) / this.cam.zoom
      this.editor?.moveNodeSilent(this.dragNode, this.nodeStart.x + dx, this.nodeStart.y + dy)
      return
    }

    if (this.dragging) {
      this.cam.x += e.clientX - this.last.x
      this.cam.y += e.clientY - this.last.y
      this.last = { x: e.clientX, y: e.clientY }
    }
  }

  private onMouseUp() {
    if (this.editMode) {
      this.onEditMouseUp()
      return
    }
    this.dragging = false
    this.canvas.style.cursor = 'grab'
  }

  private onEditMouseUp() {
    if (this.tempEdge) {
      const ed = this.editor
      if (ed) {
        const rect = this.canvas.getBoundingClientRect()
        const mx = this.tempEdge.toPt.x
        const my = this.tempEdge.toPt.y
        // find target node
        for (const n of ed.state.nodes) {
          if (n.id === this.tempEdge.fromNode) continue
          if (this.nodeInBounds(n, mx, my)) {
            ed.addEdge(this.tempEdge.fromNode, n.id)
            this.loadStateToWasm(ed.state)
            window.dispatchEvent(new CustomEvent('editor-state-change'))
            break
          }
        }
      }
      this.tempEdge = null
      return
    }

    if (this.dragWaypoint) {
      this.dragWaypoint = null
      this.loadStateToWasm(this.editor!.state)
      window.dispatchEvent(new CustomEvent('editor-state-change'))
      this.canvas.style.cursor = 'grab'
      return
    }

    if (this.dragNode) {
      this.dragNode = null
      this.loadStateToWasm(this.editor!.state)
      window.dispatchEvent(new CustomEvent('editor-state-change'))
      this.canvas.style.cursor = 'grab'
      return
    }

    this.dragging = false
    this.canvas.style.cursor = 'grab'
  }
}
