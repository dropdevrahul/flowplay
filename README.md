# Flowplay

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Zig](https://img.shields.io/badge/Zig-0.16-orange)](https://ziglang.org)
[![WASM](https://img.shields.io/badge/target-WASM-purple)](https://webassembly.org)

**Flowplay** is a lightweight, interactive diagram player for flowcharts and state machines. Describe your diagram as JSON — Flowplay renders it with smooth animated transitions, curved edges, and an in-browser editor. Powered by **Zig** + **WASM** + **Canvas2D**.

- **Zero runtime dependencies** — the core is a single `.wasm` binary
- **No build step for authors** — write JSON, hit refresh
- **Dual mode** — view animated playback or edit visually in the browser

![kinds: rect, roundrect, ellipse, diamond; curved arrows; a traveling token]

---

## Quick start

```sh
zig build                       # -> zig-out/bin/runtime.wasm  (needs Zig 0.16)
python3 -m http.server 8080     # WASM won't load from file://
# open http://localhost:8080/web/
```

Pick a diagram from the dropdown. Controls: **Space** play/pause, **→** step, **←** back,
**R** restart.

---

## Author your own diagram

Drop a `.json` file in `examples/`, add its name to the diagram picker in `web/src/components/TopBar.tsx`.
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

---

## Project layout

```
build.zig            # Zig 0.16 wasm build
src/                 # Zig runtime: model, geometry, playback, input
├── main.zig
├── model.zig
├── geom.zig
└── host.zig
web/                 # Browser frontend (React + Vite)
├── index.html
├── src/
│   └── components/  # React components (TopBar, Editor, etc.)
└── public/
examples/            # Sample diagrams as JSON
docs/                # Development tutorial and design docs
```

---

## Roadmap

- [x] Core player (animated token, curved edges, keyboard controls)
- [x] In-browser editor (visual + JSON)
- [x] Graph types: flowchart, state machine
- [ ] Auto-layout
- [ ] Orthogonal / elbow edge routing
- [ ] Self-loop support
- [ ] Data charts

---

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

Flowplay is open source under the [MIT License](LICENSE).
