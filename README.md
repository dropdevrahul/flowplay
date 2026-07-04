# ff-viewer

A tiny **diagram player**: describe a flowchart or state machine as JSON, watch it play out —
a token walks the path, active node and edge glow, edges are smooth curves. Runtime is Zig
compiled to WASM; rendering is Canvas2D. No dependencies, no build step for authors.

![kinds: rect, roundrect, ellipse, diamond; curved arrows; a traveling token]

## Run

```sh
zig build                       # -> zig-out/bin/runtime.wasm  (needs Zig 0.16)
python3 -m http.server 8080     # WASM won't load from file://
# open http://localhost:8080/web/
```

Pick a diagram from the dropdown. Controls: **Space** play/pause, **→** step, **←** back,
**R** restart.

## Author your own diagram

Drop a `.json` file in `examples/`, add its name to the `<select>` in `web/index.html`.
No recompile — the Zig runtime parses JSON at load time.

```json
{
  "nodes": [
    { "id": "a", "kind": "ellipse", "x": 360, "y": 24, "w": 130, "h": 56, "label": "Start" },
    { "id": "b", "x": 350, "y": 130, "label": "Work" },
    { "id": "c", "kind": "diamond", "x": 350, "y": 240, "w": 150, "h": 96, "label": "Done?" }
  ],
  "edges": [
    { "from": "a", "to": "b" },
    { "from": "b", "to": "c" },
    { "from": "c", "to": "a", "label": "no" }
  ],
  "play": ["a", "b", "c", "a"]
}
```

### `nodes[]`
| field | default | notes |
|-------|---------|-------|
| `id` | — (required) | referenced by edges and play |
| `kind` | `"roundrect"` | `rect` \| `roundrect` \| `ellipse` \| `diamond` |
| `x`, `y` | 0 | top-left, canvas is 880×480 |
| `w`, `h` | 150, 66 | |
| `label` | `""` | centered text |
| `fill`, `stroke` | slate blue | `0xRRGGBBAA` as an integer (optional) |

### `edges[]`
`from` / `to` are node ids. `label` (optional) rides the curve midpoint. Arrows auto-anchor to
node borders and follow the curve tangent. `a→b` and `b→a` bend opposite ways.

### `play[]`
Ordered node ids. The token travels each consecutive pair; the last→first makes it loop. The
node it's leaving is highlighted. Omit `play` (or give <2 ids) for a static diagram.

## Layout

```
build.zig          # Zig 0.16 wasm build
src/main.zig       # model, JSON loader, geometry, playback, input  (one file)
web/index.html     # canvas + diagram picker
web/host.js        # Canvas2D draw calls + JSON loader glue
examples/*.json    # diagrams as data
docs/              # staged Zig+WASM build tutorial (how this was built)
```

## Not yet (deliberately)
- Data charts (bar/pie/line) — different layer (data→geometry).
- Auto-layout — positions are manual `x`/`y` for now.
- Orthogonal/elbow edge routing and self-loops — edges are quadratic curves.
- In-browser JSON editor — author in a file today.
