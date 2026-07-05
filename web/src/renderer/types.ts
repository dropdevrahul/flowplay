export interface Pt { x: number; y: number }

export interface ContentBox { x: number; y: number; w: number; h: number }

export interface NodeSpec {
  id: string
  kind?: string
  x?: number
  y?: number
  w?: number
  h?: number
  fill?: number
  stroke?: number
  label?: string
  fontSize?: number
  role?: 'initial' | 'normal' | 'final'
  data?: Record<string, string | number | boolean>
}

export interface EdgeSpec {
  from: string
  to: string
  label?: string
  event?: string
  guard?: string
  actions?: string
  color?: number
  dashed?: boolean
  route?: 'orthogonal' | 'straight' | 'curved'
  arrow?: 'end' | 'both' | 'none'
  waypoints?: Pt[]
}

export interface SubgraphSpec {
  id: string
  label: string
  nodes: string[]
}

export interface DiagramState {
  nodes: NodeSpec[]
  edges: EdgeSpec[]
  subgraphs: SubgraphSpec[]
  type?: 'flowchart' | 'statemachine'
  dir?: 'TD' | 'BT' | 'LR' | 'RL'
  variables?: Record<string, number | string | boolean>
  fontSize?: number
}

export interface TransitionPill {
  label: string
  x: number
  y: number
  w: number
  h: number
}

export interface DrawAPI {
  js_clear(): void
  js_node(kind: number, x: number, y: number, w: number, h: number, fill: number, stroke: number, opacity: number, lineW: number): void
  js_edge(x1: number, y1: number, cx: number, cy: number, x2: number, y2: number, color: number, opacity: number, lineW: number, arrow: boolean): void
  js_token(x: number, y: number, r: number, color: number): void
  js_label(ptr: number, len: number, x: number, y: number, color: number, opacity: number, size: number): void
  js_subgraph(x: number, y: number, w: number, h: number, ptr: number, len: number): void
  js_error(ptr: number, len: number): void
}
