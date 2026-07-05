// A tiny mermaid-flavoured text DSL for authoring state machines fast.
// Type transitions instead of clicking each edge:
//
//   var coins = 0
//   [*] -> Locked
//   Locked   -> Unlocked : COIN [coins >= 0] / coins += 1
//   Unlocked -> Locked   : PUSH
//   Unlocked -> [*]
//
//   Line forms:
//     var NAME = VALUE            declare a variable (number/bool/string)
//     [*] -> State               mark State as the initial state
//     State -> [*]               mark State as a final state
//     A -> B : EVENT [GUARD] / ACTIONS   a transition (label part optional)
//     StateName                  a bare state with no transitions yet
//     # comment                  ignored
import type { DiagramState, NodeSpec, EdgeSpec } from './types'

type Val = number | string | boolean

function coerce(v: string): Val {
  const t = v.trim()
  if (t === 'true') return true
  if (t === 'false') return false
  if (t !== '' && !isNaN(Number(t))) return Number(t)
  // strip surrounding quotes if present
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1)
  return t
}

// parse the "EVENT [GUARD] / ACTIONS" part after a transition's colon
function parseLabel(s: string): { event?: string; guard?: string; actions?: string } {
  let guard: string | undefined
  let actions: string | undefined
  const g = s.match(/\[([^\]]*)\]/)
  if (g) { guard = g[1].trim() || undefined; s = s.replace(g[0], ' ') }
  const slash = s.indexOf('/')
  if (slash >= 0) { actions = s.slice(slash + 1).trim() || undefined; s = s.slice(0, slash) }
  const event = s.trim() || undefined
  return { event, guard, actions }
}

export function parseDSL(text: string): { state?: DiagramState; error?: string } {
  const nodes = new Map<string, NodeSpec>()
  const edges: EdgeSpec[] = []
  const variables: Record<string, Val> = {}

  const node = (name: string): NodeSpec => {
    let n = nodes.get(name)
    if (!n) { n = { id: name, kind: 'roundrect', label: name, role: 'normal' }; nodes.set(name, n) }
    return n
  }

  const lines = text.split('\n')
  for (let ln = 0; ln < lines.length; ln++) {
    const raw = lines[ln].trim()
    if (!raw || raw.startsWith('#') || raw.startsWith('//')) continue

    // variable declaration
    const vm = raw.match(/^var\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/)
    if (vm) { variables[vm[1]] = coerce(vm[2]); continue }

    const arrow = raw.indexOf('->')
    if (arrow < 0) {
      // bare state name (allow spaces); ignore stray tokens like [*] alone
      if (raw !== '[*]') node(raw)
      continue
    }

    const src = raw.slice(0, arrow).trim()
    let rest = raw.slice(arrow + 2).trim()
    let dst = rest
    let labelPart = ''
    const colon = rest.indexOf(':')
    if (colon >= 0) { dst = rest.slice(0, colon).trim(); labelPart = rest.slice(colon + 1).trim() }

    if (!src || !dst) return { error: `line ${ln + 1}: transition needs "A -> B"` }

    if (src === '[*]' && dst === '[*]') return { error: `line ${ln + 1}: cannot go [*] -> [*]` }
    if (src === '[*]') { node(dst).role = 'initial'; continue }
    if (dst === '[*]') { node(src).role = 'final'; continue }

    node(src); node(dst)
    const { event, guard, actions } = labelPart ? parseLabel(labelPart) : {}
    // merge into an existing identical from/to edge, else push a new one
    let e = edges.find((x) => x.from === src && x.to === dst && (x.event ?? '') === (event ?? ''))
    if (!e) { e = { from: src, to: dst }; edges.push(e) }
    if (event) e.event = event
    if (guard) e.guard = guard
    if (actions) e.actions = actions
    if (event) e.label = event
  }

  if (nodes.size === 0) return { error: 'no states — try "A -> B : EVENT"' }

  const state: DiagramState = {
    nodes: [...nodes.values()],
    edges,
    subgraphs: [],
    type: 'statemachine',
  }
  if (Object.keys(variables).length) state.variables = variables
  return { state }
}

// generate DSL text from a diagram so the text tab can seed from the canvas
export function toDSL(state: DiagramState): string {
  const label = (id: string) => {
    const n = state.nodes.find((x) => x.id === id)
    return n?.label || id
  }
  const out: string[] = []
  for (const [k, v] of Object.entries(state.variables ?? {})) out.push(`var ${k} = ${v}`)
  if (out.length) out.push('')

  for (const n of state.nodes) if (n.role === 'initial') out.push(`[*] -> ${n.label || n.id}`)

  const connected = new Set<string>()
  for (const e of state.edges) {
    connected.add(e.from); connected.add(e.to)
    let lab = ''
    const ev = e.event ?? ''
    const g = e.guard ? ` [${e.guard}]` : ''
    const a = e.actions ? ` / ${e.actions}` : ''
    if (ev || g || a) lab = ` : ${ev}${g}${a}`
    out.push(`${label(e.from)} -> ${label(e.to)}${lab}`)
  }

  for (const n of state.nodes) if (n.role === 'final') out.push(`${n.label || n.id} -> [*]`)
  // bare, unconnected, non-initial states so they survive a round-trip
  for (const n of state.nodes) {
    if (!connected.has(n.id) && n.role !== 'initial' && n.role !== 'final') out.push(n.label || n.id)
  }
  return out.join('\n')
}

// ---- self-check (runs at import; logs, never throws in prod) ----
function selfTest() {
  const assert = (c: boolean, m: string) => { if (!c) throw new Error('dsl selfTest: ' + m) }
  const src = [
    'var coins = 0',
    '[*] -> Locked',
    'Locked -> Unlocked : COIN [coins >= 0] / coins += 1',
    'Unlocked -> Locked : PUSH',
    'Unlocked -> [*]',
  ].join('\n')
  const { state, error } = parseDSL(src)
  assert(!error && !!state, 'parses without error')
  const s = state!
  assert(s.type === 'statemachine', 'type is statemachine')
  assert(s.nodes.length === 2, 'two states')
  assert(s.nodes.find((n) => n.id === 'Locked')?.role === 'initial', 'Locked initial')
  assert(s.nodes.find((n) => n.id === 'Unlocked')?.role === 'final', 'Unlocked final')
  assert(s.variables?.coins === 0, 'variable parsed')
  const coin = s.edges.find((e) => e.from === 'Locked' && e.to === 'Unlocked')!
  assert(coin.event === 'COIN' && coin.guard === 'coins >= 0' && coin.actions === 'coins += 1', 'label parts')
  // round trip: generated text re-parses to the same shape
  const rt = parseDSL(toDSL(s)).state!
  assert(rt.nodes.length === 2 && rt.edges.length === 2, 'round-trip node/edge count')
  assert(rt.nodes.find((n) => n.id === 'Locked')?.role === 'initial', 'round-trip initial preserved')
  // error case
  assert(!!parseDSL('-> B').error, 'missing source errors')
  console.log('dsl selfTest passed')
}
try { selfTest() } catch (e) { console.error(e) }
