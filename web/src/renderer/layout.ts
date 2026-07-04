import type { ContentBox, NodeSpec } from './types'
import { NODE_PALETTE } from '../theme'

export function nodeSize(kind?: string) {
  if (kind === 'ellipse') return { w: 148, h: 62 }
  if (kind === 'diamond') return { w: 158, h: 86 }
  return { w: 156, h: 66 }
}

export const contentBox: ContentBox = { x: 0, y: 0, w: 700, h: 470 }

export function layoutDiagram(spec: any) {
  const nodes: NodeSpec[] = spec.nodes || []
  const edges: { from: string; to: string }[] = spec.edges || []
  if (!nodes.length) return
  // give each node a distinct border color unless the spec set one
  nodes.forEach((n, i) => { if (n.stroke === undefined) n.stroke = NODE_PALETTE[i % NODE_PALETTE.length] })
  const out = new Map<string, string[]>(nodes.map((n) => [n.id, []]))
  edges.forEach((e) => { if (out.has(e.from)) out.get(e.from)!.push(e.to) })

  const state: Record<string, number> = {}
  const back = new Set<string>()
  const roots = nodes.filter((n) => !edges.some((e) => e.to === n.id)).map((n) => n.id)
  const seeds = roots.length ? roots : [nodes[0].id]
  const dfs = (u: string) => {
    state[u] = 1
    for (const v of out.get(u) || []) {
      if (state[v] === 1) back.add(u + '|' + v)
      else if (!state[v]) dfs(v)
    }
    state[u] = 2
  }
  seeds.forEach((s) => { if (!state[s]) dfs(s) })
  nodes.forEach((n) => { if (!state[n.id]) dfs(n.id) })

  const fedges = edges.filter((e) => !back.has(e.from + '|' + e.to))
  const rank = new Map<string, number>(nodes.map((n) => [n.id, 0]))
  for (let i = 0; i < nodes.length; i++)
    for (const e of fedges)
      if ((rank.get(e.to) ?? 0) < (rank.get(e.from) ?? 0) + 1)
        rank.set(e.to, (rank.get(e.from) ?? 0) + 1)

  const layers: NodeSpec[][] = []
  nodes.forEach((n) => { const r = rank.get(n.id) ?? 0; (layers[r] ||= []).push(n) })

  const parents = new Map<string, string[]>(nodes.map((n) => [n.id, []]))
  const children = new Map<string, string[]>(nodes.map((n) => [n.id, []]))
  fedges.forEach((e) => {
    children.get(e.from)?.push(e.to)
    parents.get(e.to)?.push(e.from)
  })
  const pos = new Map<string, number>()
  const reindex = () => layers.forEach((L) => L.forEach((n, i) => pos.set(n.id, i)))
  reindex()
  const bary = (n: NodeSpec, rel: Map<string, string[]>) => {
    const ns = rel.get(n.id) || []
    if (!ns.length) return pos.get(n.id) ?? 0
    return ns.reduce((s, id) => s + (pos.get(id) ?? 0), 0) / ns.length
  }
  for (let sweep = 0; sweep < 4; sweep++) {
    const down = sweep % 2 === 0
    const rel = down ? parents : children
    ;(down ? layers : [...layers].reverse()).forEach((L) => {
      L.sort((a, b) => bary(a, rel) - bary(b, rel))
      reindex()
    })
  }

  const SLOT = 210, ROW = 150
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  layers.forEach((L, r) => {
    const y = r * ROW
    L.forEach((n, i) => {
      const s = nodeSize(n.kind)
      n.w = s.w; n.h = s.h
      n.x = (i - (L.length - 1) / 2) * SLOT - s.w / 2
      n.y = y
      minX = Math.min(minX, n.x!); minY = Math.min(minY, n.y!)
      maxX = Math.max(maxX, n.x! + n.w!); maxY = Math.max(maxY, n.y! + n.h!)
    })
  })
  contentBox.x = minX; contentBox.y = minY
  contentBox.w = maxX - minX; contentBox.h = maxY - minY
}
