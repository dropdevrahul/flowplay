import type { DrawAPI } from './types'

export function createWasmEnv(draw: DrawAPI): WebAssembly.Imports {
  return {
    env: {
      js_clear: () => draw.js_clear(),
      js_node: (kind: number, x: number, y: number, w: number, h: number, fill: number, stroke: number, opacity: number, lineW: number) =>
        draw.js_node(kind, x, y, w, h, fill, stroke, opacity, lineW),
      js_edge: (x1: number, y1: number, cx: number, cy: number, x2: number, y2: number, _color: number, opacity: number, lineW: number, arrow: boolean) =>
        draw.js_edge(x1, y1, cx, cy, x2, y2, _color, opacity, lineW, arrow),
      js_token: (x: number, y: number, r: number, _color: number) =>
        draw.js_token(x, y, r, _color),
      js_label: (ptr: number, len: number, x: number, y: number, _color: number, opacity: number, size: number) =>
        draw.js_label(ptr, len, x, y, _color, opacity, size),
      js_subgraph: (x: number, y: number, w: number, h: number, ptr: number, len: number) =>
        draw.js_subgraph(x, y, w, h, ptr, len),
      js_error: (ptr: number, len: number) =>
        draw.js_error(ptr, len),
    },
  }
}

export async function instantiateWasm(draw: DrawAPI): Promise<WebAssembly.Instance> {
  const resp = await fetch(`${import.meta.env.BASE_URL}runtime.wasm`)
  const env = createWasmEnv(draw)
  const { instance } = await WebAssembly.instantiate(await resp.arrayBuffer(), env)
  return instance
}

export function readStr(mem: WebAssembly.Memory, ptr: number, len: number): string {
  return new TextDecoder().decode(new Uint8Array(mem.buffer, ptr, len))
}

export function readTransitions(mem: WebAssembly.Memory, ptr: number): string[] {
  const view = new Uint8Array(mem.buffer, ptr, 2048)
  const labels: string[] = []
  let offset = 0
  while (offset < 2048 && view[offset] !== 0) {
    const start = offset
    while (offset < 2048 && view[offset] !== 0) offset++
    labels.push(new TextDecoder().decode(view.slice(start, offset)))
    offset++
  }
  return labels
}
