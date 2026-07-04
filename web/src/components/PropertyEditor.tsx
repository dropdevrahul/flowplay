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

export function PropertyEditor({ node, edge, subgraph, selectionType, onNodeUpdate, onEdgeUpdate, onEdgeReconnect, onSubgraphUpdate, allNodes }: PropertyEditorProps) {
  if (selectionType === 'node' && node) {
    return <NodeProperties node={node} onUpdate={onNodeUpdate} />
  }
  if (selectionType === 'edge' && edge) {
    return <EdgeProperties edge={edge} onUpdate={onEdgeUpdate} onReconnect={onEdgeReconnect} allNodes={allNodes} />
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
        <input style={input} value={node.label ?? ''} onChange={(e) => onUpdate(node.id, { label: e.target.value })} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={labelCol}>Kind</div>
        <select style={input} value={node.kind ?? 'roundrect'} onChange={(e) => onUpdate(node.id, { kind: e.target.value })}>
          <option value="roundrect">roundrect</option>
          <option value="rect">rect</option>
          <option value="ellipse">ellipse</option>
          <option value="diamond">diamond</option>
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
    </div>
  )
}

function EdgeProperties({ edge, onUpdate, onReconnect, allNodes }: { edge: EdgeSpec; onUpdate: (from: string, to: string, partial: Partial<EdgeSpec>) => void; onReconnect: (of: string, ot: string, nf: string, nt: string) => void; allNodes: NodeSpec[] }) {
  const nodeOpts = allNodes.map((n) => <option key={n.id} value={n.id}>{n.label ? `${n.id} · ${n.label}` : n.id}</option>)
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
