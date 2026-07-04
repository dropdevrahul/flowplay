# Flowplay — overview & plan

A tiny scene runtime: define **elements** and **interactions** programmatically in Zig,
compile to **WASM**, render **beautiful smooth graphics** in the browser. Think
"PowerPoint × Keynote Magic Move" at minimal scale. Learning Zig along the way.

## What it does (core, locked)

- **Element**: `rect`, `ellipse`, `line`, `text`. Props: `id, x, y, w, h, color, opacity, rotation, scale`.
- **Scene**: a named set of elements with values. One "slide".
- **Show**: ordered list of scenes.
- **Transition**: advance to a scene → elements matched by `id` tween old→new with easing
  (the "magic move"). New id fades in. Removed id fades out. **This is the smooth.**
- **Interaction**: events (`click` an element, `key`, `timer`) → actions (`goto` scene, set prop).
- **Programmatic**: everything above is built with a Zig builder API (see `04-api.md`).

## Architecture decision: Zig = brain, Canvas2D = pixels

```
+------------------ browser tab -------------------+
|  index.html / host.js                            |
|    - loads runtime.wasm                           |
|    - implements draw imports via Canvas2D         |
|    - feeds input events into wasm                 |
|    - calls frame(now_ms) each requestAnimationFrame|
|         |  (JS<->WASM boundary)                   |
|  runtime.wasm  (all your Zig)                      |
|    - scene/element data model                      |
|    - builder API                                   |
|    - tween + easing + timing                       |
|    - scene diff (magic move)                       |
|    - input dispatch + actions                      |
+--------------------------------------------------+
```

Why Canvas2D and not a software rasterizer: "beautiful smooth" needs anti-aliasing + text.
In a rasterizer that means writing a font engine — huge, off-goal. At PPT scale (tens of
elements) the JS↔WASM boundary cost is irrelevant; that cost only bites in per-pixel hot
loops. So Zig owns the interesting 80% (model, tween math, diff algorithm, timing), Canvas2D
gives gorgeous AA + text + gradients for free. Right altitude.

Render path: each frame, Zig calls imported JS draw functions (`js_clear`, `js_rect`,
`js_ellipse`, `js_line`, `js_text`). Stage 09 (optional) upgrades this to a command buffer
in shared memory read once/frame — fewer crossings, more Zig. Don't do it until measured.

## Stage map (each = one file, build + learn)

| Stage | File | Build | Zig you learn |
|------|------|-------|---------------|
| 0 | `01-setup.md` | toolchain, empty `.wasm`, host page, export `add()` | build.zig, wasm target, `export fn`, the boundary |
| 1 | `02-model.md` | element/scene structs in memory | structs, enums, tagged unions, slices, `ArrayList`, allocators |
| 2 | `03-render.md` | draw a static scene via Canvas2D | imported fns, passing data/strings across boundary |
| 3 | `04-api.md` | the builder API (`show.scene().rect()...`) | methods, optionals, errors, `comptime` basics |
| 4 | `05-anim.md` | frame loop + easing + tween one element | floats, math, enums-as-funcs, timing |
| 5 | `06-transitions.md` | scene diff by id → magic move | `AutoHashMap`/`StringHashMap`, algorithms |
| 6 | `07-interactions.md` | click/key events → goto actions | event dispatch, hit-testing, state machine |
| 7 | `08-next.md` | later: JSON format, scripting, images, gradients | parsing, design — deferred (YAGNI) |
| 8 | `09-optim.md` | (optional) command-buffer render | serialization, packed structs, perf |

Build a working demo at the end of **every** stage. No stage is theory-only.

## Concept → stage index (for revisiting Zig)
- allocators / `defer` → stage 1
- tagged unions → stage 1
- the WASM ABI (ptr+len, no GC) → stage 0, 2
- floats & lerp → stage 4
- hash maps → stage 5
- comptime → stage 3 (light), 8

## Version note (the calibration knob)
Zig is pre-1.0; `build.zig` and std APIs churn between releases. **These docs are pinned to
Zig 0.16.0** (installed & verified — stage 0 builds and runs). Key 0.16-isms already baked in:
- `std.ArrayList(T)` is **unmanaged**: init with `= .empty`, pass the allocator to each method
  (`list.append(alloc, x)`, `list.deinit(alloc)`). We store `alloc` in `Scene` to keep the
  builder API clean.
- `std.heap.DebugAllocator(.{}){}` (the old `GeneralPurposeAllocator` name is gone).
- `std.StringHashMap(T).init(alloc)` is unchanged (still managed).
- `build.zig`: `addExecutable` takes `.root_module = b.createModule(.{ ... })`, not flat
  `.target`/`.root_source_file`.

If you move to a newer Zig and a name moved again: check `zig version` + current std docs,
fix the one line, move on. Concepts don't change; spelling does.

## File layout you'll end up with
```
flowplay/
  build.zig
  src/
    main.zig        # exports: init, frame, on_click, on_key
    model.zig       # Element, Scene, Show
    render.zig      # draw() -> imported js_* calls
    anim.zig        # easing, tween
    diff.zig        # scene matching by id
  web/
    index.html
    host.js         # wasm loader + Canvas2D draw imports + input
  docs/             # these files
```
