import type { NodeSpec, EdgeSpec, SubgraphSpec, DiagramState, Pt } from './types'
import { NODE_PALETTE } from '../theme'
import { layoutDiagram, type LayoutDir } from './layout'

let nodeCounter = 0
let sgCounter = 0

// examples may omit edges/subgraphs; the renderer iterates them unconditionally
function normalize(s: DiagramState): DiagramState {
  return { ...s, nodes: s.nodes ?? [], edges: s.edges ?? [], subgraphs: s.subgraphs ?? [] }
}

export class DiagramEditor {
  state: DiagramState
  selected: string | null = null
  // additional node ids selected alongside `selected` (multi-select). Always
  // includes the primary node id when the primary selection is a node.
  selectedNodes = new Set<string>()
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
    this.selectedNodes.delete(id)
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

  // auto-arrange all nodes with the ranked layout, clearing manual waypoints
  relayout(dir?: LayoutDir): void {
    if (!this.state.nodes.length) return
    this.snapshot()
    if (dir) this.state.dir = dir
    for (const e of this.state.edges) delete e.waypoints
    layoutDiagram(this.state, this.state.dir ?? 'TD')
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
    this.selectedNodes.clear()
    if (id && !id.startsWith('edge:') && !id.startsWith('subgraph:')) this.selectedNodes.add(id)
  }

  // multi-select helpers ---------------------------------------------------
  setSelectedNodes(ids: string[]): void {
    this.selectedNodes = new Set(ids)
    this.selected = ids.length ? ids[ids.length - 1] : null
  }

  toggleNodeSelection(id: string): void {
    if (this.selectedNodes.has(id)) {
      this.selectedNodes.delete(id)
      if (this.selected === id) this.selected = this.selectedNodes.size ? [...this.selectedNodes][this.selectedNodes.size - 1] : null
    } else {
      this.selectedNodes.add(id)
      this.selected = id
    }
  }

  isNodeSelected(id: string): boolean { return this.selectedNodes.has(id) }
  get multiCount(): number { return this.selectedNodes.size }

  // move every selected node by (dx,dy) without a snapshot (live drag)
  moveSelectionSilent(dx: number, dy: number): void {
    for (const id of this.selectedNodes) {
      const n = this.state.nodes.find((x) => x.id === id)
      if (n) { n.x = (n.x ?? 0) + dx; n.y = (n.y ?? 0) + dy }
    }
  }

  // nudge selection by a fixed delta with an undo snapshot (arrow keys)
  nudgeSelection(dx: number, dy: number): void {
    if (!this.selectedNodes.size) return
    this.snapshot()
    for (const id of this.selectedNodes) {
      const n = this.state.nodes.find((x) => x.id === id)
      if (n) { n.x = (n.x ?? 0) + dx; n.y = (n.y ?? 0) + dy }
    }
    this.emit()
  }

  removeSelectedNodes(): void {
    if (!this.selectedNodes.size) return
    this.snapshot()
    const ids = this.selectedNodes
    this.state.nodes = this.state.nodes.filter((n) => !ids.has(n.id))
    this.state.edges = this.state.edges.filter((e) => !ids.has(e.from) && !ids.has(e.to))
    for (const sg of this.state.subgraphs) sg.nodes = sg.nodes.filter((nid) => !ids.has(nid))
    this.selectedNodes.clear()
    this.selected = null
    this.emit()
  }

  // duplicate a set of nodes plus any edges wholly inside the set; returns the
  // new node ids. Used for copy/paste and multi-duplicate.
  duplicateNodes(ids: string[], dx = 28, dy = 28): string[] {
    const src = ids.map((id) => this.state.nodes.find((n) => n.id === id)).filter(Boolean) as NodeSpec[]
    if (!src.length) return []
    this.snapshot()
    const idMap = new Map<string, string>()
    const newIds: string[] = []
    for (const n of src) {
      const nid = `n${++nodeCounter}`
      idMap.set(n.id, nid)
      newIds.push(nid)
      this.state.nodes.push({ ...JSON.parse(JSON.stringify(n)), id: nid, x: (n.x ?? 0) + dx, y: (n.y ?? 0) + dy })
    }
    for (const e of this.state.edges) {
      if (idMap.has(e.from) && idMap.has(e.to)) {
        this.state.edges.push({ ...JSON.parse(JSON.stringify(e)), from: idMap.get(e.from)!, to: idMap.get(e.to)! })
      }
    }
    this.setSelectedNodes(newIds)
    this.emit()
    return newIds
  }

  // z-order: node draw order follows array order (last drawn = on top)
  bringToFront(ids: string[]): void {
    if (!ids.length) return
    this.snapshot()
    const set = new Set(ids)
    const kept = this.state.nodes.filter((n) => !set.has(n.id))
    const moved = this.state.nodes.filter((n) => set.has(n.id))
    this.state.nodes = [...kept, ...moved]
    this.emit()
  }

  sendToBack(ids: string[]): void {
    if (!ids.length) return
    this.snapshot()
    const set = new Set(ids)
    const moved = this.state.nodes.filter((n) => set.has(n.id))
    const kept = this.state.nodes.filter((n) => !set.has(n.id))
    this.state.nodes = [...moved, ...kept]
    this.emit()
  }

  // insert deep-copied nodes/edges (from a clipboard) with fresh ids, remapping
  // edge endpoints that point inside the pasted set. Returns the new node ids.
  insertClone(nodes: NodeSpec[], edges: EdgeSpec[], dx = 24, dy = 24): string[] {
    if (!nodes.length) return []
    this.snapshot()
    const idMap = new Map<string, string>()
    const newIds: string[] = []
    for (const n of nodes) {
      const nid = `n${++nodeCounter}`
      idMap.set(n.id, nid)
      newIds.push(nid)
      this.state.nodes.push({ ...JSON.parse(JSON.stringify(n)), id: nid, x: (n.x ?? 0) + dx, y: (n.y ?? 0) + dy })
    }
    for (const e of edges) {
      if (idMap.has(e.from) && idMap.has(e.to)) {
        this.state.edges.push({ ...JSON.parse(JSON.stringify(e)), from: idMap.get(e.from)!, to: idMap.get(e.to)! })
      }
    }
    this.setSelectedNodes(newIds)
    this.emit()
    return newIds
  }

  // align/distribute a set of nodes ---------------------------------------
  alignNodes(ids: string[], edge: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'): void {
    const ns = ids.map((id) => this.state.nodes.find((n) => n.id === id)).filter(Boolean) as NodeSpec[]
    if (ns.length < 2) return
    this.snapshot()
    const lefts = ns.map((n) => n.x ?? 0)
    const rights = ns.map((n) => (n.x ?? 0) + (n.w ?? 0))
    const tops = ns.map((n) => n.y ?? 0)
    const bots = ns.map((n) => (n.y ?? 0) + (n.h ?? 0))
    const minX = Math.min(...lefts), maxX = Math.max(...rights)
    const minY = Math.min(...tops), maxY = Math.max(...bots)
    for (const n of ns) {
      if (edge === 'left') n.x = minX
      else if (edge === 'right') n.x = maxX - (n.w ?? 0)
      else if (edge === 'hcenter') n.x = (minX + maxX) / 2 - (n.w ?? 0) / 2
      else if (edge === 'top') n.y = minY
      else if (edge === 'bottom') n.y = maxY - (n.h ?? 0)
      else if (edge === 'vcenter') n.y = (minY + maxY) / 2 - (n.h ?? 0) / 2
    }
    this.emit()
  }

  distributeNodes(ids: string[], axis: 'h' | 'v'): void {
    const ns = ids.map((id) => this.state.nodes.find((n) => n.id === id)).filter(Boolean) as NodeSpec[]
    if (ns.length < 3) return
    this.snapshot()
    if (axis === 'h') {
      ns.sort((a, b) => (a.x ?? 0) - (b.x ?? 0))
      const first = ns[0].x ?? 0
      const last = (ns[ns.length - 1].x ?? 0)
      const step = (last - first) / (ns.length - 1)
      ns.forEach((n, i) => { n.x = first + step * i })
    } else {
      ns.sort((a, b) => (a.y ?? 0) - (b.y ?? 0))
      const first = ns[0].y ?? 0
      const last = (ns[ns.length - 1].y ?? 0)
      const step = (last - first) / (ns.length - 1)
      ns.forEach((n, i) => { n.y = first + step * i })
    }
    this.emit()
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

  private pruneSelection(): void {
    const ids = new Set(this.state.nodes.map((n) => n.id))
    for (const id of [...this.selectedNodes]) if (!ids.has(id)) this.selectedNodes.delete(id)
  }

  undo(): void {
    if (this.undoStack.length === 0) return
    this.redoStack.push(JSON.parse(JSON.stringify(this.state)) as DiagramState)
    this.state = this.undoStack.pop()!
    this.pruneSelection()
  }

  redo(): void {
    if (this.redoStack.length === 0) return
    this.undoStack.push(JSON.parse(JSON.stringify(this.state)) as DiagramState)
    this.state = this.redoStack.pop()!
    this.pruneSelection()
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
    this.selectedNodes.clear()
  }
}
