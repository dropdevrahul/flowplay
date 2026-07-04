import type { NodeSpec, EdgeSpec, SubgraphSpec, DiagramState, Pt } from './types'
import { NODE_PALETTE } from '../theme'

let nodeCounter = 0
let sgCounter = 0

// examples may omit edges/subgraphs; the renderer iterates them unconditionally
function normalize(s: DiagramState): DiagramState {
  return { ...s, nodes: s.nodes ?? [], edges: s.edges ?? [], subgraphs: s.subgraphs ?? [] }
}

export class DiagramEditor {
  state: DiagramState
  selected: string | null = null
  onChange: ((state: DiagramState) => void) | null = null

  private undoStack: DiagramState[] = []
  private redoStack: DiagramState[] = []
  private maxUndo = 50

  constructor(initial?: DiagramState) {
    this.state = normalize(initial ?? { nodes: [], edges: [], subgraphs: [] })
  }

  snapshot() {
    this.undoStack.push(JSON.parse(JSON.stringify(this.state)) as DiagramState)
    if (this.undoStack.length > this.maxUndo) this.undoStack.shift()
    this.redoStack = []
  }

  private emit() {
    this.onChange?.(this.state)
  }

  addNode(spec?: Partial<NodeSpec>): string {
    this.snapshot()
    const id = `n${++nodeCounter}`
    const node: NodeSpec = {
      id,
      kind: spec?.kind ?? 'roundrect',
      x: spec?.x ?? 0,
      y: spec?.y ?? 0,
      w: spec?.w ?? 156,
      h: spec?.h ?? 66,
      // leave fill unset so it follows the theme; give a distinct palette border
      stroke: spec?.stroke ?? NODE_PALETTE[this.state.nodes.length % NODE_PALETTE.length],
      label: spec?.label ?? '',
    }
    if (spec?.fill !== undefined) node.fill = spec.fill
    this.state.nodes.push(node)
    this.emit()
    return id
  }

  updateNode(id: string, partial: Partial<NodeSpec>): void {
    const n = this.state.nodes.find((x) => x.id === id)
    if (!n) return
    this.snapshot()
    Object.assign(n, partial)
    this.emit()
  }

  removeNode(id: string): void {
    const idx = this.state.nodes.findIndex((x) => x.id === id)
    if (idx === -1) return
    this.snapshot()
    this.state.nodes.splice(idx, 1)
    this.state.edges = this.state.edges.filter((e) => e.from !== id && e.to !== id)
    for (const sg of this.state.subgraphs) {
      sg.nodes = sg.nodes.filter((nid) => nid !== id)
    }
    if (this.selected === id) this.selected = null
    this.emit()
  }

  moveNode(id: string, x: number, y: number): void {
    const n = this.state.nodes.find((x) => x.id === id)
    if (!n) return
    this.snapshot()
    n.x = x
    n.y = y
    this.emit()
  }

  moveNodeSilent(id: string, x: number, y: number): void {
    const n = this.state.nodes.find((x) => x.id === id)
    if (!n) return
    n.x = x
    n.y = y
  }

  addEdge(from: string, to: string, label?: string): void {
    if (from === to) return
    if (this.state.edges.some((e) => e.from === from && e.to === to)) return
    this.snapshot()
    this.state.edges.push({ from, to, label: label ?? '' })
    this.emit()
  }

  reconnectEdge(oldFrom: string, oldTo: string, newFrom: string, newTo: string): void {
    if (newFrom === newTo) return
    const e = this.state.edges.find((x) => x.from === oldFrom && x.to === oldTo)
    if (!e) return
    if (this.state.edges.some((x) => x !== e && x.from === newFrom && x.to === newTo)) return
    this.snapshot()
    e.from = newFrom
    e.to = newTo
    if (this.selected === 'edge:' + oldFrom + '→' + oldTo) this.selected = 'edge:' + newFrom + '→' + newTo
    this.emit()
  }

  duplicateNode(id: string): string | null {
    const n = this.state.nodes.find((x) => x.id === id)
    if (!n) return null
    this.snapshot()
    const nid = `n${++nodeCounter}`
    this.state.nodes.push({ ...n, id: nid, x: (n.x ?? 0) + 28, y: (n.y ?? 0) + 28 })
    this.selected = nid
    this.emit()
    return nid
  }

  clear(): void {
    this.snapshot()
    this.state = { nodes: [], edges: [], subgraphs: [] }
    this.selected = null
    this.emit()
  }

  setGlobalFont(px: number): void {
    this.snapshot()
    this.state.fontSize = px
    this.emit()
  }

  setType(t: 'flowchart' | 'statemachine'): void {
    this.snapshot()
    this.state.type = t
    this.emit()
  }

  setVariables(vars: Record<string, number | string | boolean>): void {
    this.snapshot()
    this.state.variables = vars
    this.emit()
  }

  private findEdge(from: string, to: string): EdgeSpec | undefined {
    return this.state.edges.find((e) => e.from === from && e.to === to)
  }

  addWaypoint(from: string, to: string, index: number, pt: Pt): void {
    const e = this.findEdge(from, to)
    if (!e) return
    this.snapshot()
    const wp = e.waypoints ? [...e.waypoints] : []
    wp.splice(index, 0, pt)
    e.waypoints = wp
    this.emit()
  }

  moveWaypointSilent(from: string, to: string, index: number, pt: Pt): void {
    const e = this.findEdge(from, to)
    if (!e || !e.waypoints || !e.waypoints[index]) return
    e.waypoints[index] = pt
  }

  removeWaypoint(from: string, to: string, index: number): void {
    const e = this.findEdge(from, to)
    if (!e || !e.waypoints) return
    this.snapshot()
    e.waypoints.splice(index, 1)
    if (e.waypoints.length === 0) delete e.waypoints
    this.emit()
  }

  removeEdge(from: string, to: string): void {
    const idx = this.state.edges.findIndex((e) => e.from === from && e.to === to)
    if (idx === -1) return
    this.snapshot()
    this.state.edges.splice(idx, 1)
    this.emit()
  }

  addSubgraph(label?: string): string {
    this.snapshot()
    const id = `sg${++sgCounter}`
    const nodes = this.getSelectionType() === 'node' && this.selected ? [this.selected] : []
    this.state.subgraphs.push({ id, label: label ?? '', nodes })
    this.selected = 'subgraph:' + id
    this.emit()
    return id
  }

  removeSubgraph(id: string): void {
    const idx = this.state.subgraphs.findIndex((s) => s.id === id)
    if (idx === -1) return
    this.snapshot()
    this.state.subgraphs.splice(idx, 1)
    this.emit()
  }

  select(id: string | null): void {
    this.selected = id
  }

  getSelectionType(): 'node' | 'edge' | 'subgraph' | null {
    if (!this.selected) return null
    if (this.selected.startsWith('edge:')) return 'edge'
    if (this.selected.startsWith('subgraph:')) return 'subgraph'
    return 'node'
  }

  getSelectedNode(): NodeSpec | null {
    if (this.getSelectionType() !== 'node') return null
    return this.state.nodes.find((n) => n.id === this.selected!) ?? null
  }

  getSelectedEdge(): EdgeSpec | null {
    if (this.getSelectionType() !== 'edge') return null
    const id = this.selected!.slice(5)
    const delim = id.indexOf('→')
    if (delim === -1) return null
    const from = id.slice(0, delim)
    const to = id.slice(delim + 1)
    return this.state.edges.find((e) => e.from === from && e.to === to) ?? null
  }

  getSelectedSubgraph(): SubgraphSpec | null {
    if (this.getSelectionType() !== 'subgraph') return null
    return this.state.subgraphs.find((s) => s.id === this.selected!.slice('subgraph:'.length)) ?? null
  }

  updateEdge(from: string, to: string, partial: Partial<EdgeSpec>): void {
    const e = this.state.edges.find((x) => x.from === from && x.to === to)
    if (!e) return
    this.snapshot()
    Object.assign(e, partial)
    this.emit()
  }

  updateSubgraph(id: string, partial: Partial<SubgraphSpec>): void {
    const sg = this.state.subgraphs.find((x) => x.id === id)
    if (!sg) return
    this.snapshot()
    Object.assign(sg, partial)
    this.emit()
  }

  undo(): void {
    if (this.undoStack.length === 0) return
    this.redoStack.push(JSON.parse(JSON.stringify(this.state)) as DiagramState)
    this.state = this.undoStack.pop()!
  }

  redo(): void {
    if (this.redoStack.length === 0) return
    this.undoStack.push(JSON.parse(JSON.stringify(this.state)) as DiagramState)
    this.state = this.redoStack.pop()!
  }

  canUndo(): boolean { return this.undoStack.length > 0 }
  canRedo(): boolean { return this.redoStack.length > 0 }

  toJSON(): string {
    return JSON.stringify(this.state, null, 2)
  }

  load(state: DiagramState): void {
    this.state = normalize(JSON.parse(JSON.stringify(state)) as DiagramState)
    this.undoStack = []
    this.redoStack = []
    this.selected = null
  }
}
