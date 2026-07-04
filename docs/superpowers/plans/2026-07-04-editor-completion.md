# Diagram Editor Completion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete all remaining gaps in the in-browser diagram editor for ff-viewer.

**Architecture:** Extend the existing editor infrastructure — `DiagramEditor` (state/undo), `CanvasRenderer` (canvas interactions), React components (panels/property editors). All edit-mode state lives in JS; WASM is a render-only consumer.

**Tech Stack:** React 19, TypeScript 5, Canvas2D, Vite

**Verify:** Run `npx tsc --noEmit` and `npm run build` in `web/` after each task.

---

### Task 1: Fix drag undo flooding

**Problem:** `moveNode()` snapshots to undo stack on every mousemove during a drag, flooding the undo stack with hundreds of intermediate positions.

**Solution:** Add a `moveNodeSilent()` variant that skips the snapshot. The drag start in `onEditMouseDown` takes one snapshot. Mousemove calls `moveNodeSilent()`. Mouseup does `loadStateToWasm`.

**Files:**
- Modify: `web/src/renderer/editor.ts:69-76`
- Modify: `web/src/canvas.ts:856-860`

- [ ] **Step 1: Add `moveNodeSilent` to DiagramEditor**

```ts
// web/src/renderer/editor.ts — add after moveNode
moveNodeSilent(id: string, x: number, y: number): void {
  const n = this.state.nodes.find((x) => x.id === id)
  if (!n) return
  n.x = x
  n.y = y
}
```

- [ ] **Step 2: Switch drag to use `moveNodeSilent`**

In `canvas.ts` `onEditMouseMove`, change:
```ts
this.editor?.moveNode(this.dragNode, this.nodeStart.x + dx, this.nodeStart.y + dy)
```
to:
```ts
this.editor?.moveNodeSilent(this.dragNode, this.nodeStart.x + dx, this.nodeStart.y + dy)
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit` then `npm run build` in `web/` — both should pass.

---

### Task 2: Add node at canvas center + fix edge creation state propagation

**Problem 1:** `handleAddNode` in `App.tsx` places new nodes at `{x:0, y:0}` instead of the visible canvas center.

**Problem 2:** After creating an edge via port drag, `onEditMouseUp` calls `loadStateToWasm` but the JSON editor doesn't get updated.

**Files:**
- Modify: `web/src/canvas.ts:43` (add `getCameraCenter` method)
- Modify: `web/src/App.tsx:142-147` (handleAddNode)
- Modify: `web/src/canvas.ts:891` (emit update after edge creation)

- [ ] **Step 1: Expose camera center from CanvasRenderer**

Add to `canvas.ts` after the `editMode` field block (~line 43):
```ts
getCameraCenter(): { x: number; y: number } {
  const cx = window.innerWidth / 2
  const cy = window.innerHeight / 2
  return { x: this.cam.worldX(cx), y: this.cam.worldY(cy) }
}
```

- [ ] **Step 2: Update `handleAddNode` in App.tsx**

```ts
const handleAddNode = useCallback(() => {
  const ed = editorRef.current
  if (!ed) return
  const center = rendererRef.current?.getCameraCenter() ?? { x: 0, y: 0 }
  const id = ed.addNode({ x: center.x - 78, y: center.y - 33 })
  ed.select(id)
  setSelectedId(id)
  emitState()
}, [emitState])
```

- [ ] **Step 3: Fix edge creation state propagation**

In `canvas.ts` `onEditMouseUp`, after `ed.addEdge(...)`, replace:
```ts
ed.addEdge(this.tempEdge.fromNode, n.id)
this.loadStateToWasm(ed.state)
```
with:
```ts
ed.addEdge(this.tempEdge.fromNode, n.id)
this.loadStateToWasm(ed.state)
// trigger App-level state update via a custom event
window.dispatchEvent(new CustomEvent('editor-state-change'))
```

And in `App.tsx`, add an effect that listens to this event:
```ts
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
```

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit` then `npm run build` in `web/` — both should pass.

---

### Task 3: Add inline label editing

**Problem:** No way to edit a node's label directly on the canvas. Users must use the PropertyEditor panel.

**Solution:** Double-click a node → position an HTML `<input>` overlay at the node's screen position. Enter/blur confirms, Escape cancels.

**Files:**
- Modify: `web/src/canvas.ts` — add double-click handler
- Modify: `web/src/App.tsx` — state for label editing overlay
- Create: none (use React state + inline overlay or a small new component)

- [ ] **Step 1: Add `onDoubleClick` callback type to CanvasRenderer**

In `canvas.ts`, add to the constructor (~line 43 block):
```ts
onDoubleClick: ((nodeId: string, screenX: number, screenY: number) => void) | null = null
```

- [ ] **Step 2: Add double-click event listener in canvas init**

In `init()` method (~line 79), add:
```ts
canvas.addEventListener('dblclick', (e: MouseEvent) => {
  if (!this.editMode || !this.editor) return
  const rect = canvas.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  const wx = this.cam.worldX(mx)
  const wy = this.cam.worldY(my)

  // hit-test nodes
  for (const n of this.editor.state.nodes) {
    if (wx >= n.x! && wx <= n.x! + n.w! && wy >= n.y! && wy <= n.y! + n.h!) {
      this.editor.select(n.id)
      this.onSelectionChange?.(n.id)
      this.onDoubleClick?.(n.id, e.clientX, e.clientY)
      return
    }
  }
})
```

- [ ] **Step 3: Add label editing state to App.tsx**

Add state:
```ts
const [editingLabel, setEditingLabel] = useState<{ id: string; x: number; y: number; w: number; h: number; label: string } | null>(null)
```

Add DoubleClick handler connected to renderer:
```ts
const handleDoubleClick = useCallback((nodeId: string, screenX: number, screenY: number) => {
  const ed = editorRef.current
  if (!ed) return
  const node = ed.state.nodes.find((n) => n.id === nodeId)
  if (!node) return
  const rect = canvasRef.current?.getBoundingClientRect()
  if (!rect) return
  setEditingLabel({
    id: nodeId,
    x: screenX,
    y: screenY - rect.top,
    w: (node.w ?? 156) * (rendererRef.current as any).cam.zoom,
    h: (node.h ?? 66) * (rendererRef.current as any).cam.zoom,
    label: node.label ?? '',
  })
}, [])
```

Wire into renderer:
```ts
// in the init effect, before return:
r.onDoubleClick = handleDoubleClick
```

- [ ] **Step 4: Add label editing overlay in App.tsx JSX**

Before the `</>` closing fragment, add:
```tsx
{editingLabel && (
  <input
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
```

- [ ] **Step 5: Also add dblclick listener in the destroy method to avoid leaks**

In `destroy()` of CanvasRenderer, the `dblclick` listener is added inline with `canvas.addEventListener` so it should be tracked. Update `destroy()`:
```ts
// add to destroy method — store dblclick handler reference
private boundDoubleClick: ((e: MouseEvent) => void) | null = null
```

Move the dblclick handler to a bound method in the constructor, just like other bound handlers.

Actually simpler: just add `canvas.addEventListener('dblclick', ...)` as before but since destroy removes the canvas element listeners... wait, looking at the code, `destroy()` currently removes `resize`, `wheel`, `mousedown` via `removeEventListener`. It also calls `cancelAnimationFrame`. The `dblclick` listener if added inline would need to be tracked.

Let me simplify: store the dblclick handler ref, cleanup in destroy.

```ts
// in constructor:
this.boundDoubleClick = null as ((e: MouseEvent) => void) | null

// in init:
this.boundDoubleClick = (e: MouseEvent) => {
  if (!this.editMode || !this.editor) return
  // ... hit test logic ...
}
canvas.addEventListener('dblclick', this.boundDoubleClick)

// in destroy:
if (this.boundDoubleClick) {
  this.canvas?.removeEventListener('dblclick', this.boundDoubleClick)
  this.boundDoubleClick = null
}
```

- [ ] **Step 6: Verify build**

Run: `npx tsc --noEmit` then `npm run build` in `web/` — both should pass.

---

### Task 4: Extend type system — add EdgeSpec and SubgraphSpec selection support

**Problem:** The DiagramEditor and PropertyEditor only support node selection. Edges and subgraphs cannot be selected or edited.

**Solution:** Add hit-testing for edges and subgraph backgrounds. Extend the selection model with prefixed IDs (`edge:from->to`, `subgraph:id`). Update PropertyEditor to handle all three types.

**Files:**
- Modify: `web/src/renderer/editor.ts` — add `selectionType` getter
- Modify: `web/src/renderer/types.ts` — add `SelectionTarget` type
- Modify: `web/src/canvas.ts` — add edge/subgraph hit-testing in `onEditMouseDown`
- Modify: `web/src/components/PropertyEditor.tsx` — handle edge and subgraph types
- Modify: `web/src/App.tsx` — wire up selection change

- [ ] **Step 1: Add selection helpers to DiagramEditor**

```ts
// web/src/renderer/editor.ts — add methods
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
  const parts = this.selected!.slice(5).split('→')
  if (parts.length !== 2) return null
  return this.state.edges.find((e) => e.from === parts[0] && e.to === parts[1]) ?? null
}

getSelectedSubgraph(): SubgraphSpec | null {
  if (this.getSelectionType() !== 'subgraph') return null
  return this.state.subgraphs.find((s) => s.id === this.selected!.slice(10)) ?? null
}
```

- [ ] **Step 2: Add edge and subgraph hit-testing to canvas**

In `onEditMouseDown` in canvas.ts (~line 788-831), after the port hit-test and before node hit-test, add:

```ts
// subgraph hit-test (before node hit-test, since subgraph contains nodes)
for (const sg of ed.state.subgraphs) {
  const nids = sg.nodes
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const nid of nids) {
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
```

Then after node hit-test (when no node is hit), add edge hit-test:

```ts
// edge hit-test (click near an edge path)
if (ed.selected && ed.getSelectionType() === 'edge') {
  ed.select(null)
  this.onSelectionChange?.(null)
}
for (const e of ed.state.edges) {
  const a = ed.state.nodes.find((n) => n.id === e.from)
  const b = ed.state.nodes.find((n) => n.id === e.to)
  if (!a || !b) continue
  const ax = a.x! + a.w! / 2, ay = a.y! + a.h! / 2
  const bx = b.x! + b.w! / 2, by = b.y! + b.h! / 2
  const p1 = this.borderPt(a, bx, by)
  const p2 = this.borderPt(b, ax, ay)
  const dy = p2.y - p1.y, dx = p2.x - p1.x
  const pts: Pt[] = Math.abs(dy) > Math.abs(dx) * 0.3
    ? [{ x: p1.x, y: p1.y }, { x: p1.x, y: (p1.y + p2.y) / 2 }, { x: p2.x, y: (p1.y + p2.y) / 2 }, { x: p2.x, y: p2.y }]
    : [{ x: p1.x, y: p1.y }, { x: (p1.x + p2.x) / 2, y: p1.y }, { x: (p1.x + p2.x) / 2, y: p2.y }, { x: p2.x, y: p2.y }]
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
```

Add `distToSegment` helper:
```ts
private distToSegment(px: number, py: number, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(px - a.x, py - a.y)
  let t = ((px - a.x) * dx + (py - a.y) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy))
}
```

- [ ] **Step 3: Update PropertyEditor for edges and subgraphs**

Replace the `PropertyEditor` component to handle all three types:

```tsx
// web/src/components/PropertyEditor.tsx
import type { NodeSpec, EdgeSpec, SubgraphSpec } from '../renderer/types'

interface PropertyEditorProps {
  node: NodeSpec | null
  edge: EdgeSpec | null
  subgraph: SubgraphSpec | null
  selectionType: 'node' | 'edge' | 'subgraph' | null
  onNodeUpdate: (id: string, partial: Partial<NodeSpec>) => void
  onEdgeUpdate: (from: string, to: string, partial: Partial<EdgeSpec>) => void
  onSubgraphUpdate: (id: string, partial: Partial<SubgraphSpec>) => void
  allNodes: NodeSpec[]
}

// ... labelCol, input, num, hex helpers stay same ...

export function PropertyEditor({ node, edge, subgraph, selectionType, onNodeUpdate, onEdgeUpdate, onSubgraphUpdate, allNodes }: PropertyEditorProps) {
  if (selectionType === 'node' && node) {
    return <NodeProperties node={node} onUpdate={onNodeUpdate} />
  }
  if (selectionType === 'edge' && edge) {
    return <EdgeProperties edge={edge} onUpdate={onEdgeUpdate} allNodes={allNodes} />
  }
  if (selectionType === 'subgraph' && subgraph) {
    return <SubgraphProperties subgraph={subgraph} onUpdate={onSubgraphUpdate} allNodes={allNodes} />
  }
  return (
    <div style={{ fontSize: 12, color: 'var(--muted)', padding: '20px 0', textAlign: 'center' }}>
      No selection — click a node, edge, or subgraph
    </div>
  )
}

function NodeProperties({ node, onUpdate }: { node: NodeSpec; onUpdate: (id: string, partial: Partial<NodeSpec>) => void }) {
  // ... existing node property code ...
}

function EdgeProperties({ edge, onUpdate, allNodes }: { edge: EdgeSpec; onUpdate: (from: string, to: string, partial: Partial<EdgeSpec>) => void; allNodes: NodeSpec[] }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 10 }}>
        Edge Properties
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={{ ...labelCol, opacity: 0.5 }}>From</div>
        <div style={{ ...input, opacity: 0.5, cursor: 'default' }}>{edge.from}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={{ ...labelCol, opacity: 0.5 }}>To</div>
        <div style={{ ...input, opacity: 0.5, cursor: 'default' }}>{edge.to}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={labelCol}>Label</div>
        <input style={input} value={edge.label ?? ''} onChange={(e) => onUpdate(edge.from, edge.to, { label: e.target.value })} />
      </div>
    </div>
  )
}

function SubgraphProperties({ subgraph, onUpdate, allNodes }: { subgraph: SubgraphSpec; onUpdate: (id: string, partial: Partial<SubgraphSpec>) => void; allNodes: NodeSpec[] }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 10 }}>
        Subgraph Properties
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={{ ...labelCol, opacity: 0.5 }}>ID</div>
        <div style={{ ...input, opacity: 0.5, cursor: 'default' }}>{subgraph.id}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={labelCol}>Label</div>
        <input style={input} value={subgraph.label ?? ''} onChange={(e) => onUpdate(subgraph.id, { label: e.target.value })} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={labelCol}>Nodes</div>
        <div style={{ ...input, opacity: 0.5, cursor: 'default' }}>{subgraph.nodes.join(', ') || '(none)'}</div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Add `updateEdge` and `updateSubgraph` to DiagramEditor**

```ts
// web/src/renderer/editor.ts
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
```

- [ ] **Step 5: Update App.tsx — wire handleEdgeUpdate / handleSubgraphUpdate and update PropertyEditor props**

Add callbacks:
```ts
const handleEdgeUpdate = useCallback((from: string, to: string, partial: Partial<EdgeSpec>) => {
  editorRef.current?.updateEdge(from, to, partial)
  emitState()
}, [emitState])

const handleSubgraphUpdate = useCallback((id: string, partial: Partial<SubgraphSpec>) => {
  editorRef.current?.updateSubgraph(id, partial)
  emitState()
}, [emitState])
```

Update selection derivation:
```ts
const selectionType = editor?.getSelectionType() ?? null
const selectedNode = selectionType === 'node' ? editor?.getSelectedNode() ?? null : null
const selectedEdge = selectionType === 'edge' ? editor?.getSelectedEdge() ?? null : null
const selectedSubgraph = selectionType === 'subgraph' ? editor?.getSelectedSubgraph() ?? null : null
```

Update PropertyEditor usage:
```tsx
<PropertyEditor
  node={selectedNode}
  edge={selectedEdge}
  subgraph={selectedSubgraph}
  selectionType={selectionType}
  onNodeUpdate={handleNodeUpdate}
  onEdgeUpdate={handleEdgeUpdate}
  onSubgraphUpdate={handleSubgraphUpdate}
  allNodes={editor?.state.nodes ?? []}
/>
```

- [ ] **Step 6: Handle edge/subgraph selection in canvas keyboard handler**

In `canvas.ts` `onKeyDown`, update the Delete handler to also handle edges and subgraphs:
```ts
if (e.key === 'Delete' || e.key === 'Backspace') {
  if (this.editor?.selected) {
    const selType = this.editor.getSelectionType()
    if (selType === 'node') {
      this.editor.removeNode(this.editor.selected)
      this.onSelectionChange?.(null)
      this.loadStateToWasm(this.editor.state)
    } else if (selType === 'edge') {
      const edge = this.editor.getSelectedEdge()
      if (edge) {
        this.editor.removeEdge(edge.from, edge.to)
        this.onSelectionChange?.(null)
        this.loadStateToWasm(this.editor.state)
      }
    } else if (selType === 'subgraph') {
      const sg = this.editor.getSelectedSubgraph()
      if (sg) {
        this.editor.removeSubgraph(sg.id)
        this.onSelectionChange?.(null)
        this.loadStateToWasm(this.editor.state)
      }
    }
    e.preventDefault()
  }
}
```

- [ ] **Step 7: Verify build**

Run: `npx tsc --noEmit` then `npm run build` in `web/` — both should pass.

---

### Task 5: Add Ctrl+S save-to-file

**Problem:** No way to save the edited diagram as a downloadable JSON file.

**Solution:** Add a keyboard handler in App.tsx for Ctrl+S that triggers a file download.

**Files:**
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Add save handler in App.tsx**

Add to the existing keyboard effect (after the `mode === 'view'` conditions):
```ts
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
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit` then `npm run build` in `web/` — both should pass.

---

### Task 6: Visual polish — highlight selected edge/subgraph on canvas

**Problem:** When an edge or subgraph is selected, there's no visual indication in the canvas (currently only nodes highlight).

**Files:**
- Modify: `web/src/canvas.ts` — `renderEditFrame()`

- [ ] **Step 1: Highlight selected edge**

In `renderEditFrame()`, update edge drawing:
```ts
for (const e of state.edges) {
  const a = state.nodes.find((n) => n.id === e.from)
  const b = state.nodes.find((n) => n.id === e.to)
  if (!a || !b) continue
  const isSel = ed.getSelectionType() === 'edge' && ed.selected === 'edge:' + e.from + '→' + e.to
  this.drawEdgeFromState(a, b, e.label, isSel)
}
```

- [ ] **Step 2: Highlight selected subgraph border**

In `renderEditFrame()`, add after the subgraph loop:
```ts
// highlight selected subgraph
if (ed.selected && ed.getSelectionType() === 'subgraph') {
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
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit` then `npm run build` in `web/` — both should pass.

---

### Task 7: Final verification

- [ ] **Step 1: Type-check**

Run: `npx tsc --noEmit` in `web/`
Expected: No errors.

- [ ] **Step 2: Build**

Run: `npm run build` in `web/`
Expected: Build succeeds, output in `web/dist/`.

- [ ] **Step 3: Full walkthrough**

1. Start dev server: `npm run dev` in `web/`
2. Toggle to Edit mode via TopBar
3. Click a node → PropertyEditor shows node properties
4. Double-click a node → inline label editor appears
5. Click an edge → PropertyEditor shows edge properties
6. Click a subgraph → PropertyEditor shows subgraph properties
7. Drag a node → moves smoothly, undo stack isn't flooded
8. Ctrl+Z undo → reverts the last change
9. Ctrl+S → downloads JSON file
10. Switch to View mode → diagram plays correctly
