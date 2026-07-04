// State-machine simulation: a tiny expression evaluator (no eval / no Function
// on user input) plus a runner. Nodes are states, edges are transitions with an
// optional event trigger, guard expression, and variable-mutating actions.
import type { DiagramState } from './types'

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

export interface HistoryEntry { from: string; event: string; to: string }

export class Simulation {
  active = ''
  vars: Vars = {}
  history: HistoryEntry[] = []
  lastError = ''

  constructor(public state: DiagramState) { this.reset() }

  reset(): void {
    const init = this.state.nodes.find((n) => n.role === 'initial') ?? this.state.nodes[0]
    this.active = init?.id ?? ''
    this.vars = JSON.parse(JSON.stringify(this.state.variables ?? {}))
    this.history = []
    this.lastError = ''
  }

  private outgoing() { return this.state.edges.filter((e) => e.from === this.active) }

  private guardOk(guard?: string): boolean {
    if (!guard) return true
    try { return truthy(evalExpr(guard, this.vars)) } catch { return false }
  }

  enabled() { return this.outgoing().filter((e) => this.guardOk(e.guard)) }

  events(): string[] {
    const s = new Set<string>()
    for (const e of this.enabled()) if (e.event) s.add(e.event)
    return [...s]
  }

  fire(event: string): boolean {
    const cand = this.outgoing().filter((e) => (e.event ?? '') === event)
    if (!cand.length) { this.lastError = `no transition on "${event}"`; return false }
    const e = cand.find((x) => this.guardOk(x.guard))
    if (!e) { this.lastError = `guard blocked "${event}"`; return false }
    if (e.actions) { try { runActions(e.actions, this.vars) } catch (err) { this.lastError = String(err); return false } }
    this.history.push({ from: this.active, event, to: e.to })
    this.active = e.to
    this.lastError = ''
    return true
  }

  step(): boolean {
    const auto = this.enabled().filter((e) => !e.event)
    if (auto.length !== 1) { this.lastError = auto.length ? 'ambiguous auto-transition' : 'no auto transition'; return false }
    return this.fire('')
  }
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
}
try { selfTest() } catch (e) { console.error(e) }
