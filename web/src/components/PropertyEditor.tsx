import { useState } from 'react'
import type { NodeSpec, EdgeSpec, SubgraphSpec } from '../renderer/types'

interface PropertyEditorProps {
  node: NodeSpec | null
  edge: EdgeSpec | null
  subgraph: SubgraphSpec | null
  selectionType: 'node' | 'edge' | 'subgraph' | null
  onNodeUpdate: (id: string, partial: Partial<NodeSpec>) => void
  onEdgeUpdate: (from: string, to: string, partial: Partial<EdgeSpec>) => void
  onEdgeReconnect: (oldFrom: string, oldTo: string, newFrom: string, newTo: string) => void
  onSubgraphUpdate: (id: string, partial: Partial<SubgraphSpec>) => void
  allNodes: NodeSpec[]
  isStateMachine: boolean
}

const FM = "'Geist Mono', ui-monospace, 'SFMono-Regular', monospace"

const labelCol: React.CSSProperties = {
  width: 48,
  flexShrink: 0,
  fontSize: 10.5,
  fontWeight: 500,
  fontFamily: FM,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--text)',
}

const input: React.CSSProperties = {
  flex: 1,
  background: 'var(--bg)',
  color: 'var(--text)',
  border: '1px solid var(--line)',
  borderRadius: 6,
  padding: '5px 8px',
  fontSize: 12,
  fontFamily: FM,
  outline: 'none',
  minWidth: 0,
}

const num: React.CSSProperties = {
  ...input,
  width: 70,
  flex: 'none',
}

function hexFromU32(v: number): string {
  return '#' + (v >>> 8).toString(16).padStart(6, '0')
}

function u32FromHex(h: string): number {
  return (parseInt(h.replace('#', ''), 16) << 8) | 0xff
}

export function PropertyEditor({ node, edge, subgraph, selectionType, onNodeUpdate, onEdgeUpdate, onEdgeReconnect, onSubgraphUpdate, allNodes, isStateMachine }: PropertyEditorProps) {
  if (selectionType === 'node' && node) {
    return <NodeProperties node={node} onUpdate={onNodeUpdate} isStateMachine={isStateMachine} />
  }
  if (selectionType === 'edge' && edge) {
    return <EdgeProperties edge={edge} onUpdate={onEdgeUpdate} onReconnect={onEdgeReconnect} allNodes={allNodes} isStateMachine={isStateMachine} />
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

function NodeProperties({ node, onUpdate, isStateMachine }: { node: NodeSpec; onUpdate: (id: string, partial: Partial<NodeSpec>) => void; isStateMachine: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 10 }}>
        Properties
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={{ ...labelCol, opacity: 0.5 }}>ID</div>
        <div style={{ ...input, opacity: 0.5, cursor: 'default' }}>{node.id}</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={labelCol}>Label</div>
        <textarea style={{ ...input, resize: 'vertical', minHeight: 30, lineHeight: 1.3, fontFamily: 'var(--font-display)' }} rows={node.label?.includes('\n') ? 3 : 1}
          value={node.label ?? ''} onChange={(e) => onUpdate(node.id, { label: e.target.value })} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={labelCol}>Kind</div>
        <select style={input} value={node.kind ?? 'roundrect'} onChange={(e) => onUpdate(node.id, { kind: e.target.value })}>
          <option value="roundrect">roundrect</option>
          <option value="rect">rect</option>
          <option value="ellipse">ellipse</option>
          <option value="diamond">diamond</option>
          <option value="stadium">stadium (pill)</option>
          <option value="cylinder">cylinder (database)</option>
          <option value="hexagon">hexagon</option>
          <option value="parallelogram">parallelogram</option>
          <option value="circle">circle</option>
        </select>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={labelCol}>X</div>
        <input style={num} type="number" value={Math.round(node.x ?? 0)} onChange={(e) => onUpdate(node.id, { x: +e.target.value })} />
        <div style={{ ...labelCol, marginLeft: 4 }}>Y</div>
        <input style={num} type="number" value={Math.round(node.y ?? 0)} onChange={(e) => onUpdate(node.id, { y: +e.target.value })} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={labelCol}>W</div>
        <input style={num} type="number" min={30} value={Math.round(node.w ?? 156)} onChange={(e) => onUpdate(node.id, { w: +e.target.value })} />
        <div style={{ ...labelCol, marginLeft: 4 }}>H</div>
        <input style={num} type="number" min={20} value={Math.round(node.h ?? 66)} onChange={(e) => onUpdate(node.id, { h: +e.target.value })} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={labelCol}>Font</div>
        <input style={num} type="number" min={8} max={48} placeholder="auto"
          value={node.fontSize ?? ''} onChange={(e) => onUpdate(node.id, { fontSize: e.target.value === '' ? undefined : +e.target.value })} />
        <div style={{ fontSize: 10.5, color: 'var(--muted)', marginLeft: 4 }}>px · blank = global</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={labelCol}>Fill</div>
        <input type="color" value={hexFromU32(node.fill ?? 0x1e2a3aff)} onChange={(e) => onUpdate(node.id, { fill: u32FromHex(e.target.value) })}
          style={{ width: 30, height: 26, padding: 0, border: '1px solid var(--line)', borderRadius: 4, cursor: 'pointer', background: 'none' }} />
        <input style={input} value={`#${(node.fill ?? 0x1e2a3aff).toString(16).padStart(8, '0').slice(0, 6)}`}
          onChange={(e) => { const h = e.target.value.replace('#', ''); if (/^[0-9a-fA-F]{6}$/.test(h)) onUpdate(node.id, { fill: parseInt(h, 16) << 8 | 0xff }) }} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={labelCol}>Stroke</div>
        <input type="color" value={hexFromU32(node.stroke ?? 0x46618aff)} onChange={(e) => onUpdate(node.id, { stroke: u32FromHex(e.target.value) })}
          style={{ width: 30, height: 26, padding: 0, border: '1px solid var(--line)', borderRadius: 4, cursor: 'pointer', background: 'none' }} />
        <input style={input} value={`#${(node.stroke ?? 0x46618aff).toString(16).padStart(8, '0').slice(0, 6)}`}
          onChange={(e) => { const h = e.target.value.replace('#', ''); if (/^[0-9a-fA-F]{6}$/.test(h)) onUpdate(node.id, { stroke: parseInt(h, 16) << 8 | 0xff }) }} />
      </div>

      {isStateMachine && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <div style={labelCol}>Role</div>
          <select style={input} value={node.role ?? 'normal'} onChange={(e) => onUpdate(node.id, { role: e.target.value as NodeSpec['role'] })}>
            <option value="normal">normal</option>
            <option value="initial">initial (start)</option>
            <option value="final">final</option>
          </select>
        </div>
      )}

      <DataEditor node={node} onUpdate={onUpdate} />
    </div>
  )
}

function DataEditor({ node, onUpdate }: { node: NodeSpec; onUpdate: (id: string, partial: Partial<NodeSpec>) => void }) {
  const data = node.data ?? {}
  const entries = Object.entries(data)
  const setData = (next: Record<string, string | number | boolean>) => onUpdate(node.id, { data: next })
  const [newKey, setNewKey] = useState('')
  const coerce = (v: string): string | number | boolean => (v === 'true' ? true : v === 'false' ? false : v !== '' && !isNaN(+v) ? +v : v)
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ ...labelCol, width: 'auto', marginBottom: 6 }}>Properties</div>
      {entries.length === 0 && <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>none</div>}
      {entries.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <div style={{ ...input, flex: '0 0 90px', opacity: 0.7, overflow: 'hidden' }}>{k}</div>
          <input style={input} value={String(v)} onChange={(e) => setData({ ...data, [k]: coerce(e.target.value) })} />
          <button onClick={() => { const n = { ...data }; delete n[k]; setData(n) }}
            style={{ background: 'none', border: '1px solid var(--line)', borderRadius: 6, color: 'var(--muted)', cursor: 'pointer', padding: '4px 7px' }}>×</button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
        <input style={input} placeholder="new property" value={newKey} onChange={(e) => setNewKey(e.target.value)} />
        <button onClick={() => { if (newKey && !(newKey in data)) { setData({ ...data, [newKey]: '' }); setNewKey('') } }}
          style={{ background: 'none', border: '1px solid var(--line)', borderRadius: 6, color: 'var(--text)', cursor: 'pointer', padding: '4px 10px', fontSize: 11 }}>Add</button>
      </div>
    </div>
  )
}

function EdgeProperties({ edge, onUpdate, onReconnect, allNodes, isStateMachine }: { edge: EdgeSpec; onUpdate: (from: string, to: string, partial: Partial<EdgeSpec>) => void; onReconnect: (of: string, ot: string, nf: string, nt: string) => void; allNodes: NodeSpec[]; isStateMachine: boolean }) {
  const nodeOpts = allNodes.map((n) => <option key={n.id} value={n.id}>{n.label ? `${n.id} · ${n.label}` : n.id}</option>)
  const up = (p: Partial<EdgeSpec>) => onUpdate(edge.from, edge.to, p)
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 10 }}>
        Edge Properties
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={labelCol}>From</div>
        <select style={input} value={edge.from} onChange={(e) => onReconnect(edge.from, edge.to, e.target.value, edge.to)}>{nodeOpts}</select>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={labelCol}>To</div>
        <select style={input} value={edge.to} onChange={(e) => onReconnect(edge.from, edge.to, edge.from, e.target.value)}>{nodeOpts}</select>
      </div>
      <button onClick={() => onReconnect(edge.from, edge.to, edge.to, edge.from)}
        style={{ ...input, flex: 'none', width: '100%', cursor: 'pointer', marginBottom: 6, textAlign: 'center' }}>
        ⇅ Swap direction
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={labelCol}>Label</div>
        <input style={input} value={edge.label ?? ''} onChange={(e) => up({ label: e.target.value })} />
      </div>

      {isStateMachine && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={labelCol}>Event</div>
            <input style={input} placeholder="e.g. COIN" value={edge.event ?? ''} onChange={(e) => up({ event: e.target.value })} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={labelCol}>Guard</div>
            <input style={input} placeholder="e.g. coins >= 2" value={edge.guard ?? ''} onChange={(e) => up({ guard: e.target.value })} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={labelCol}>Actions</div>
            <input style={input} placeholder="e.g. coins -= 2" value={edge.actions ?? ''} onChange={(e) => up({ actions: e.target.value })} />
          </div>
        </>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={labelCol}>Color</div>
        <input type="color" value={hexFromU32(edge.color ?? 0x5b6478ff)} onChange={(e) => up({ color: u32FromHex(e.target.value) })}
          style={{ width: 30, height: 26, padding: 0, border: '1px solid var(--line)', borderRadius: 4, cursor: 'pointer', background: 'none' }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text)', cursor: 'pointer' }}>
          <input type="checkbox" checked={edge.dashed ?? true} onChange={(e) => up({ dashed: e.target.checked })} /> dashed
        </label>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={labelCol}>Route</div>
        <select style={input} value={edge.route ?? 'orthogonal'} onChange={(e) => up({ route: e.target.value as EdgeSpec['route'] })}>
          <option value="orthogonal">elbow (right angles)</option>
          <option value="straight">straight</option>
          <option value="curved">curved</option>
        </select>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={labelCol}>Arrow</div>
        <select style={input} value={edge.arrow ?? 'end'} onChange={(e) => up({ arrow: e.target.value as EdgeSpec['arrow'] })}>
          <option value="end">end →</option>
          <option value="both">both ↔</option>
          <option value="none">none</option>
        </select>
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 2, lineHeight: 1.6 }}>
        Select the edge on canvas, then click a hollow midpoint handle to add a bend; drag dots to move, double-click to remove.
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
      <div style={{ ...labelCol, width: 'auto', marginBottom: 6 }}>Members</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 220, overflow: 'auto', border: '1px solid var(--line)', borderRadius: 6, padding: 6 }}>
        {allNodes.length === 0 && <div style={{ fontSize: 11, color: 'var(--muted)' }}>no nodes</div>}
        {allNodes.map((n) => {
          const on = subgraph.nodes.includes(n.id)
          return (
            <label key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer', padding: '3px 4px', borderRadius: 4 }}>
              <input type="checkbox" checked={on} onChange={(e) => {
                const next = e.target.checked ? [...subgraph.nodes, n.id] : subgraph.nodes.filter((x) => x !== n.id)
                onUpdate(subgraph.id, { nodes: next })
              }} />
              <span style={{ color: 'var(--text)' }}>{n.id}</span>
              {n.label && <span style={{ color: 'var(--muted)' }}>· {n.label}</span>}
            </label>
          )
        })}
      </div>
    </div>
  )
}
