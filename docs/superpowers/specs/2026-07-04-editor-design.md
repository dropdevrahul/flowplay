# Diagram Editor — Design Spec

## Overview

Add a visual diagram editor and JSON editor to the ff-viewer. Two modes: **View** (existing step-through behavior) and **Edit** (canvas interaction + side panel). Users toggle between them.

---

## Architecture

### Modes

| Aspect | View Mode | Edit Mode |
|--------|-----------|-----------|
| Canvas interaction | Zoom/pan only | Drag nodes, create edges, click-select |
| Pills | Visible | Hidden |
| Side panel | Hidden | Visible (collapsible) |
| Step-through | Active | Disabled |
| WASM role | Renders + manages nav | Renders only (JS owns state) |

### Data Ownership

- **View mode**: WASM runtime is the authority — owns diagram state + navigation state
- **Edit mode**: JS `DiagramState` is the authority — WASM is a render-only consumer
- **Mode switch View→Edit**: Current diagram JSON is extracted from the loaded file path and becomes JS's `DiagramState`. WASM's state is irrelevant for editing.
- **Mode switch Edit→View**: JS serializes `DiagramState` back to JSON, calls `loadJson` on WASM to reinitialize, triggers `resetView()`. Step-through starts fresh from the first node.
- **JSON editor sync**: `DiagramState` serializes to JSON. Textarea edits re-parse and update `DiagramState`. All canvas interactions update `DiagramState`. On each change → reload WASM for live preview.

### Bidirectional Sync (JSON ↔ Canvas)

```
JSON textarea edit → parse JSON → update DiagramState → reload WASM → canvas redraws
Canvas interaction → update DiagramState → reload WASM → canvas redraws → JSON textarea updates
Property panel edit → update DiagramState → reload WASM → canvas redraws → JSON textarea updates
```

Sync is always: **change → DiagramState → both outputs update**. No cycle risk.

---

## Component Breakdown

### `renderer/editor.ts` (new)

Diagram state + undo/redo manager. Pure logic, no rendering.

```ts
interface EdgeSpec { from: string; to: string; label: string }
interface SubgraphSpec { id: string; label: string; nodes: string[] }

interface DiagramState {
  nodes: NodeSpec[]
  edges: EdgeSpec[]
  subgraphs: SubgraphSpec[]
}

class DiagramEditor {
  state: DiagramState
  selected: string | null  // selected node ID
  private undoStack: DiagramState[]
  private redoStack: DiagramState[]

  constructor(initial: DiagramState)
  
  // mutations (each pushes undo)
  addNode(node: NodeSpec): void
  updateNode(id: string, partial: Partial<NodeSpec>): void
  removeNode(id: string): void
  moveNode(id: string, x: number, y: number): void
  addEdge(edge: EdgeSpec): void
  removeEdge(from: string, to: string): void
  addSubgraph(sg: SubgraphSpec): void
  
  select(id: string | null): void
  undo(): void
  redo(): void
  toJSON(): string
  onChange: ((state: DiagramState) => void) | null  // callback for WASM reload
}
```

### `canvas.ts` — Edit Interaction Additions

Current zoom/pan/pill behavior stays. Add for edit mode:

- **Click on empty canvas** → deselect
- **Click on node** → select it (`editor.select(id)`)
- **Drag node** → move it (`editor.moveNode(id, newX, newY)`)
- **Drag from node port** (small circles on node edges) → create edge, drop on target node
- **Delete key** → remove selected node (also removes its edges)
- **Double-click node** → enter inline label editing (input field overlays canvas at node position)

Ports: small circles rendered at the 4 cardinal points of each selected node (top/bottom/left/right). User drags from a port to create an edge — while dragging, a dashed line follows the cursor. Releasing over another node creates the edge.

### `components/SidePanel.tsx` (new)

Collapsible right panel. Width 320px. Contains:

```
┌──────────────────────┐
│ [Palette] [JSON] [Props]  ← tabs
│──────────────────────│
│                      │
│   (active tab)       │
│                      │
└──────────────────────┘
```

Collapse/expand via a button or `Ctrl+B`. Panel shrinks canvas width accordingly (no overlap).

### `components/ToolPalette.tsx` (new)

Buttons arranged in a compact grid:
- **Add Node** — adds a roundrect node at canvas center, auto-named, then selects it for editing
- **Add Edge** — (or just drag from ports)
- **Add Subgraph** — creates subgraph around selected nodes
- **Delete** — removes selected node/edge
- **Undo** / **Redo** — with keyboard shortcuts (Ctrl+Z / Ctrl+Shift+Z)

### `components/JsonEditor.tsx` (new)

Textarea with:
- Monospace font, dark/light theme-aware background
- **Format button** — pretty-prints JSON
- **Copy button** — copies JSON to clipboard
- On every keystroke (debounced 300ms): parse JSON, if valid → update `DiagramState` → reload WASM
- If JSON is invalid: show a small error indicator at the bottom of the textarea (red text, parse error message). Canvas still shows the last valid state.
- Read-only when mode is View

### `components/PropertyEditor.tsx` (new)

Shows when a node is selected. Fields:
- **ID** (text, readonly — identity is immutable)
- **Label** (text input)
- **Kind** (dropdown: roundrect, rect, ellipse, diamond)
- **Fill** (color picker — text input with hex, or native color input)
- **Stroke** (color picker)
- **X, Y, W, H** (number inputs — for precise positioning)

All changes call `editor.updateNode(id, partial)` immediately (no debounce needed).

---

## Canvas Editing Details

### Node Selection

- Click node → select it: accent-colored border, 4 port circles appear at top/bottom/left/right
- Click empty area → deselect
- Click another node → switch selection
- Selected node's properties show in the Properties tab

### Node Drag

- Mouse down on a selected node → start drag
- Move → update node position in `DiagramState` and reload WASM on each frame (throttled to ~30fps during drag)
- Mouse up → finalize position, push undo checkpoint

### Edge Creation

- Each selected node shows 4 port circles (radius 5px, accent color)
- Mouse down on a port → start edge creation
- While dragging: draw a dashed line from port to cursor position (in canvas world coords, bypassing WASM rendering — or we add a "draw temp line" to the frame loop)
- Mouse up:
  - If over a node → create edge from port's node to target node → call `editor.addEdge`
  - If over empty space → cancel
- During drag, the frame loop should continue but we need to draw the temporary edge. Approach: add a `tempEdge: { from: Pt, to: Pt } | null` on the renderer that `js_clear` appends after WASM rendering (or during, via a new draw call).

### Inline Label Editing

- Double-click a node → an HTML `<input>` element is positioned over the node (transformed from world coords to screen coords via camera)
- Input shows current label, focused
- Enter / blur → update label, remove input, reload WASM
- Escape → cancel, remove input

### Keyboard Shortcuts

| Key | Mode | Action |
|-----|------|--------|
| Delete / Backspace | Edit | Remove selected node/edge |
| Ctrl+Z | Edit | Undo |
| Ctrl+Shift+Z / Ctrl+Y | Edit | Redo |
| Ctrl+B | Edit | Toggle side panel |
| Ctrl+S | Edit | Save JSON to file download |
| Esc | Edit | Deselect / cancel inline edit |

---

## Mode Switch Behavior

### View → Edit
1. Read current diagram name from TopBar state
2. Fetch the JSON file, parse into `DiagramState`
3. Create `DiagramEditor(state)`
4. Show side panel (Palette tab active by default)
5. Hide pills
6. Disable step-through (WASM still renders via frame loop but we keep `paused=true`, don't reset)

### Edit → View
1. Serialize `DiagramEditor.state` to JSON
2. Call `loadJson` with that JSON to reinitialize WASM
3. Reset view (fit to content)
4. Hide side panel
5. Show pills, enable step-through (WASM resets to first node, paused=true)

---

## File structure changes

```
web/src/
├── App.tsx                       — mode state, edit/view toggle logic
├── canvas.ts                     — edit interaction handlers, temp edge drawing
├── renderer/
│   ├── types.ts                  — + EdgeSpec, SubgraphSpec, DiagramState
│   ├── editor.ts                 — NEW: DiagramEditor class, undo/redo
│   └── ... (unchanged)
└── components/
    ├── TopBar.tsx                 — + Edit/View toggle button
    ├── SidePanel.tsx              — NEW: collapsible panel with tabs
    ├── ToolPalette.tsx            — NEW: add/delete/undo/redo buttons
    ├── JsonEditor.tsx             — NEW: JSON textarea with sync
    └── PropertyEditor.tsx         — NEW: node property fields
```

---

## Future considerations (out of scope for v1)

- Subgraph editing in the canvas (reparent nodes, drag subgraph bounds)
- Edge routing (orthogonal path recalculation on node move)
- Multi-select (shift-click, box select)
- Copy/paste nodes
- Export as image (PNG/SVG)
- File save to disk (for now, copy JSON manually or Ctrl+S downloads)
- Auto-layout trigger button (re-run `layoutDiagram` on current state)
