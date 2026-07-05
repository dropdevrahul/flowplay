// Local persistence for user-created diagrams. Built-in examples ship as
// read-only templates under /examples; anything the user saves lives here in
// localStorage so diagrams are no longer hardcoded into the app.
import type { DiagramState } from './types'

const KEY = 'flowplay-diagrams'

// built-in starter templates (fetched from /public/examples at load time)
export const TEMPLATES: { id: string; label: string }[] = [
  { id: 'fetch', label: 'Fetch state machine' },
  { id: 'traffic', label: 'Traffic light' },
  { id: 'approval', label: 'Approval flow' },
  { id: 'turnstile', label: 'Turnstile (state machine)' },
]

export const isTemplate = (id: string) => TEMPLATES.some((t) => t.id === id)

type Store = Record<string, DiagramState>

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Store) : {}
  } catch {
    return {}
  }
}

function write(s: Store): void {
  localStorage.setItem(KEY, JSON.stringify(s))
}

export function listSaved(): string[] {
  return Object.keys(read()).sort((a, b) => a.localeCompare(b))
}

export function loadSaved(name: string): DiagramState | null {
  return read()[name] ?? null
}

export function saveDiagram(name: string, state: DiagramState): void {
  const s = read()
  s[name] = JSON.parse(JSON.stringify(state))
  write(s)
}

export function deleteSaved(name: string): void {
  const s = read()
  delete s[name]
  write(s)
}

export function renameSaved(oldName: string, newName: string): void {
  if (oldName === newName) return
  const s = read()
  if (!(oldName in s)) return
  s[newName] = s[oldName]
  delete s[oldName]
  write(s)
}

export function existsSaved(name: string): boolean {
  return name in read()
}

// a fresh empty diagram to start from scratch
export function blankDiagram(type: 'flowchart' | 'statemachine' = 'flowchart'): DiagramState {
  return { nodes: [], edges: [], subgraphs: [], type }
}
