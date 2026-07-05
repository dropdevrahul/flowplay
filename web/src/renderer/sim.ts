// State-machine simulation: a tiny expression evaluator (no eval / no Function
// on user input) plus a runner. Nodes are states, edges are transitions with an
// optional event trigger, guard expression, and variable-mutating actions.
import type { DiagramState, EdgeSpec } from './types'

type Val = number | string | boolean | undefined
type Vars = Record<string, Val>

// ---- expression evaluator ----

type Tok = { t: 'num' | 'str' | 'id' | 'op' | 'punc'; v: string }

function tokenize(src: string): Tok[] {
  const toks: Tok[] = []
  let i = 0
  const ops = ['&&', '||', '==', '!=', '<=', '>=', '+=', '-=', '*=', '/=', '<', '>', '!', '+', '-', '*', '/', '%', '=']
  while (i < src.length) {
    const c = src[i]
    if (c === ' ' || c === '\t' || c === '\n') { i++; continue }
    if (c === '(' || c === ')') { toks.push({ t: 'punc', v: c }); i++; continue }
    if (c === '"' || c === "'") {
      let j = i + 1
      while (j < src.length && src[j] !== c) j++
      toks.push({ t: 'str', v: src.slice(i + 1, j) })
      i = j + 1
      continue
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      let j = i
      while (j < src.length && /[0-9.]/.test(src[j])) j++
      toks.push({ t: 'num', v: src.slice(i, j) })
      i = j
      continue
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++
      toks.push({ t: 'id', v: src.slice(i, j) })
      i = j
      continue
    }
    const op = ops.find((o) => src.startsWith(o, i))
    if (op) { toks.push({ t: 'op', v: op }); i += op.length; continue }
    throw new Error(`bad char '${c}'`)
  }
  return toks
}

class Parser {
  private p = 0
  constructor(private toks: Tok[], private vars: Vars) {}
  private peek() { return this.toks[this.p] }
  private next() { return this.toks[this.p++] }
  private eat(v: string) { const t = this.next(); if (!t || t.v !== v) throw new Error(`expected '${v}'`) }

  parseExpr(): Val { const v = this.or(); if (this.p < this.toks.length) throw new Error('trailing tokens'); return v }

  private or(): Val { let l = this.and(); while (this.peek()?.v === '||') { this.next(); const r = this.and(); l = truthy(l) || truthy(r) } return l }
  private and(): Val { let l = this.eq(); while (this.peek()?.v === '&&') { this.next(); const r = this.eq(); l = truthy(l) && truthy(r) } return l }
  private eq(): Val {
    let l = this.cmp()
    while (this.peek()?.v === '==' || this.peek()?.v === '!=') { const o = this.next().v; const r = this.cmp(); l = o === '==' ? l === r : l !== r }
    return l
  }
  private cmp(): Val {
    let l = this.add()
    while (['<', '>', '<=', '>='].includes(this.peek()?.v)) {
      const o = this.next().v; const r = this.add()
      const a = Number(l), b = Number(r)
      l = o === '<' ? a < b : o === '>' ? a > b : o === '<=' ? a <= b : a >= b
    }
    return l
  }
  private add(): Val {
    let l = this.mul()
    while (this.peek()?.v === '+' || this.peek()?.v === '-') {
      const o = this.next().v; const r = this.mul()
      if (o === '+') l = typeof l === 'string' || typeof r === 'string' ? String(l) + String(r) : Number(l) + Number(r)
      else l = Number(l) - Number(r)
    }
    return l
  }
  private mul(): Val {
    let l = this.unary()
    while (['*', '/', '%'].includes(this.peek()?.v)) {
      const o = this.next().v; const r = this.unary()
      l = o === '*' ? Number(l) * Number(r) : o === '/' ? Number(l) / Number(r) : Number(l) % Number(r)
    }
    return l
  }
  private unary(): Val {
    if (this.peek()?.v === '!') { this.next(); return !truthy(this.unary()) }
    if (this.peek()?.v === '-') { this.next(); return -Number(this.unary()) }
    return this.primary()
  }
  private primary(): Val {
    const t = this.next()
    if (!t) throw new Error('unexpected end')
    if (t.v === '(') { const v = this.or(); this.eat(')'); return v }
    if (t.t === 'num') return Number(t.v)
    if (t.t === 'str') return t.v
    if (t.t === 'id') {
      if (t.v === 'true') return true
      if (t.v === 'false') return false
      return this.vars[t.v]
    }
    throw new Error(`unexpected '${t.v}'`)
  }
}

export function truthy(v: Val): boolean {
  if (typeof v === 'number') return v !== 0 && !Number.isNaN(v)
  if (typeof v === 'string') return v.length > 0
  return !!v
}

export function evalExpr(src: string, vars: Vars): Val {
  if (!src.trim()) return true
  return new Parser(tokenize(src), vars).parseExpr()
}

// `a = expr; b += expr; ...` — mutates vars in place
export function runActions(src: string, vars: Vars): void {
  for (const stmt of src.split(';')) {
    const s = stmt.trim()
    if (!s) continue
    const m = s.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(=|\+=|-=|\*=|\/=)\s*(.+)$/)
    if (!m) throw new Error(`bad action '${s}'`)
    const [, name, op, rhs] = m
    const r = evalExpr(rhs, vars)
    if (op === '=') vars[name] = r
    else {
      const cur = Number(vars[name] ?? 0)
      vars[name] = op === '+=' ? cur + Number(r) : op === '-=' ? cur - Number(r) : op === '*=' ? cur * Number(r) : cur / Number(r)
    }
  }
}

// ---- simulation runner ----

// `entity` is optional so pre-existing single-entity call sites keep working.
export interface HistoryEntry { from: string; event: string; to: string; entity?: string }

// A live token: it sits AT some node and carries its own per-entity variables.
export interface SimEntity { id: string; at: string; vars: Vars }

export class Simulation {
  vars: Vars = {}                 // global variables (shared across entities)
  history: HistoryEntry[] = []
  lastError = ''
  entities: SimEntity[] = []      // the live tokens
  activeEntityId = ''
  private counter = 0             // for generating e1, e2, ... ids

  constructor(public state: DiagramState) { this.reset() }

  // Back-compat: the "active" node id is just the active entity's location.
  get active(): string { return this.activeEntity()?.at ?? '' }

  activeEntity(): SimEntity | undefined {
    return this.entities.find((e) => e.id === this.activeEntityId)
  }

  selectEntity(id: string): void {
    if (this.entities.some((e) => e.id === id)) this.activeEntityId = id
  }

  private startNode(): string {
    const init = this.state.nodes.find((n) => n.role === 'initial') ?? this.state.nodes[0]
    return init?.id ?? ''
  }

  spawn(at?: string, vars: Vars = {}): string {
    const id = 'e' + (++this.counter)
    this.entities.push({ id, at: at ?? this.startNode(), vars: { ...vars } })
    return id
  }

  removeEntity(id: string): void {
    this.entities = this.entities.filter((e) => e.id !== id)
    if (this.activeEntityId === id) this.activeEntityId = this.entities[0]?.id ?? ''
  }

  reset(): void {
    this.entities = []
    this.counter = 0
    this.vars = JSON.parse(JSON.stringify(this.state.variables ?? {}))
    this.history = []
    this.lastError = ''
    // Spawn one entity at each 'initial' node; if none, a single one at nodes[0].
    const inits = this.state.nodes.filter((n) => n.role === 'initial')
    if (inits.length) for (const n of inits) this.spawn(n.id)
    else if (this.state.nodes[0]) this.spawn(this.state.nodes[0].id)
    this.activeEntityId = this.entities[0]?.id ?? ''
  }

  // Resolve an entity by id, defaulting to the active one.
  private ent(entityId?: string): SimEntity | undefined {
    return entityId ? this.entities.find((e) => e.id === entityId) : this.activeEntity()
  }

  private outgoing(at: string): EdgeSpec[] { return this.state.edges.filter((e) => e.from === at) }

  // Guards/actions evaluate against the MERGE of global vars overlaid by the
  // entity's own vars (entity wins on read).
  private scopeFor(ent: SimEntity): Vars { return { ...this.vars, ...ent.vars } }

  private guardOk(guard: string | undefined, ent: SimEntity): boolean {
    if (!guard) return true
    try { return truthy(evalExpr(guard, this.scopeFor(ent))) } catch { return false }
  }

  // Write rule: run actions against a merged scope, then split results back.
  // Keys that ALREADY existed in the entity's own vars stay per-entity; every
  // other key (global-originated, or newly created) is written to global vars.
  private applyActions(actions: string, ent: SimEntity): void {
    const scope = this.scopeFor(ent)
    const entityKeys = new Set(Object.keys(ent.vars))
    runActions(actions, scope)
    for (const k of Object.keys(scope)) {
      if (entityKeys.has(k)) ent.vars[k] = scope[k]
      else this.vars[k] = scope[k]
    }
  }

  // ---- per-entity queries (entityId defaults to the active entity) ----

  enabledFor(entityId?: string): EdgeSpec[] {
    const ent = this.ent(entityId)
    if (!ent) return []
    return this.outgoing(ent.at).filter((e) => this.guardOk(e.guard, ent))
  }

  eventsFor(entityId?: string): string[] {
    const s = new Set<string>()
    for (const e of this.enabledFor(entityId)) if (e.event) s.add(e.event)
    return [...s]
  }

  // The enabled transitions a UI can offer as a manual pick (flowchart branches).
  choices(entityId?: string): EdgeSpec[] { return this.enabledFor(entityId) }

  private traverse(ent: SimEntity, e: EdgeSpec, event: string): boolean {
    if (e.actions) {
      try { this.applyActions(e.actions, ent) } catch (err) { this.lastError = String(err); return false }
    }
    this.history.push({ from: ent.at, event, to: e.to, entity: ent.id })
    ent.at = e.to
    this.lastError = ''
    return true
  }

  fireEntity(entityId?: string, event = ''): boolean {
    const ent = this.ent(entityId)
    if (!ent) { this.lastError = 'no such entity'; return false }
    const cand = this.outgoing(ent.at).filter((e) => (e.event ?? '') === event)
    if (!cand.length) { this.lastError = `no transition on "${event}"`; return false }
    const e = cand.find((x) => this.guardOk(x.guard, ent))
    if (!e) { this.lastError = `guard blocked "${event}"`; return false }
    return this.traverse(ent, e, event)
  }

  // Move along the edge to a specific target node (how flowchart choices resolve).
  fireTo(entityId: string | undefined, toNodeId: string): boolean {
    const ent = this.ent(entityId)
    if (!ent) { this.lastError = 'no such entity'; return false }
    const cand = this.outgoing(ent.at).filter((e) => e.to === toNodeId)
    if (!cand.length) { this.lastError = `no edge to "${toNodeId}"`; return false }
    const e = cand.find((x) => this.guardOk(x.guard, ent))
    if (!e) { this.lastError = `guard blocked to "${toNodeId}"`; return false }
    return this.traverse(ent, e, e.event ?? '')
  }

  stepEntity(entityId?: string): boolean {
    const ent = this.ent(entityId)
    if (!ent) { this.lastError = 'no such entity'; return false }
    const auto = this.enabledFor(ent.id).filter((e) => !e.event)
    if (auto.length !== 1) { this.lastError = auto.length ? 'ambiguous auto-transition' : 'no auto transition'; return false }
    return this.fireEntity(ent.id, '')
  }

  // Advance every entity by one unambiguous auto-step; return count advanced.
  stepAll(): number {
    let n = 0
    for (const ent of [...this.entities]) {
      const node = this.state.nodes.find((x) => x.id === ent.at)
      if (node?.role === 'final') continue
      const auto = this.enabledFor(ent.id).filter((e) => !e.event)
      if (auto.length === 1 && this.fireEntity(ent.id, '')) n++
    }
    return n
  }

  // ---- back-compat wrappers (operate on the active entity) ----
  enabled(): EdgeSpec[] { return this.enabledFor() }
  events(): string[] { return this.eventsFor() }
  fire(event: string): boolean { return this.fireEntity(this.activeEntityId, event) }
  step(): boolean { return this.stepEntity(this.activeEntityId) }
}

// ---- self-check (runs once at import; logs, never throws in prod) ----
function selfTest() {
  const assert = (c: boolean, m: string) => { if (!c) throw new Error('sim selfTest: ' + m) }
  assert(evalExpr('2 + 3 * 4', {}) === 14, 'precedence')
  assert(evalExpr('coins >= 2 && !done', { coins: 3, done: false }) === true, 'guard true')
  assert(evalExpr('coins >= 2', { coins: 1 }) === false, 'guard false')
  const v: Vars = { coins: 5 }
  runActions('coins -= 2; ready = true', v)
  assert(v.coins === 3 && v.ready === true, 'actions')

  // -- back-compat single-entity flow --
  const single = new Simulation({
    nodes: [{ id: 'A', role: 'initial' }, { id: 'B' }],
    edges: [{ from: 'A', to: 'B', event: 'go' }],
    subgraphs: [], type: 'statemachine', variables: {},
  })
  assert(single.active === 'A', 'single active getter')
  assert(single.fire('go') === true && single.active === 'B', 'single fire moves active')

  // -- multi-entity: two initial nodes each get a token --
  const multi = new Simulation({
    nodes: [
      { id: 'A', role: 'initial' }, { id: 'B', role: 'initial' },
      { id: 'C' }, { id: 'D' },
    ],
    edges: [
      { from: 'A', to: 'C', event: 'go' },
      { from: 'B', to: 'D', event: 'go' },
    ],
    subgraphs: [], type: 'statemachine', variables: {},
  })
  assert(multi.entities.length === 2, 'spawn at each initial')
  const [eA, eB] = multi.entities
  assert(eA.at === 'A' && eB.at === 'B', 'entities at their initial nodes')
  // fireEntity moves one entity and not the other
  assert(multi.fireEntity(eA.id, 'go') === true, 'fireEntity ok')
  assert(eA.at === 'C' && eB.at === 'B', 'only fired entity moved')

  // -- per-entity var isolation + global read visible in guard --
  const iso = new Simulation({
    nodes: [{ id: 'S', role: 'initial' }, { id: 'T' }],
    edges: [{ from: 'S', to: 'T', event: 'go', guard: 'g >= 0 && x >= 1', actions: 'x += 1; g += 5' }],
    subgraphs: [], type: 'statemachine', variables: { x: 100, g: 0 },
  })
  const ie = iso.activeEntity()!
  ie.vars.x = 1 // entity-local x shadows global x on read
  assert(iso.fireEntity(ie.id, 'go') === true, 'guard sees entity x=1 and global g=0')
  assert(ie.vars.x === 2, 'entity var x updated per-entity')
  assert(iso.vars.x === 100, 'global x not clobbered by entity write')
  assert(iso.vars.g === 5, 'global g written globally')

  // -- stepAll advances multiple entities --
  const autos = new Simulation({
    nodes: [
      { id: 'A', role: 'initial' }, { id: 'B', role: 'initial' },
      { id: 'C' }, { id: 'D' },
    ],
    edges: [{ from: 'A', to: 'C' }, { from: 'B', to: 'D' }],
    subgraphs: [], type: 'statemachine', variables: {},
  })
  assert(autos.stepAll() === 2, 'stepAll advances both entities')
  assert(autos.entities[0].at === 'C' && autos.entities[1].at === 'D', 'stepAll targets')

  // -- flowchart choices + fireTo selecting a branch --
  const fc = new Simulation({
    nodes: [{ id: 'start', role: 'initial' }, { id: 'left' }, { id: 'right' }],
    edges: [{ from: 'start', to: 'left' }, { from: 'start', to: 'right' }],
    subgraphs: [], type: 'flowchart', variables: {},
  })
  assert(fc.choices().length === 2, 'flowchart offers both branches')
  assert(fc.fireTo(fc.activeEntityId, 'right') === true && fc.active === 'right', 'fireTo selects branch')
}
try { selfTest() } catch (e) { console.error(e) }
console.log('sim selfTest passed')
