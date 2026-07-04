# Stage 7 — Later (deliberately deferred)

Core is done after stage 6: programmatic elements + interactions + smooth magic-move
transitions, in Zig→WASM, rendered via Canvas2D. Everything below is **optional**, ordered by
likely value. Don't build any of it until you actually want it — YAGNI.

## A. Scene file format (JSON) — "author without recompiling"
Load scenes from JSON at runtime instead of Zig code.
- Zig: `std.json` parses into your `Element`/`Scene` structs.
- The builder API stays as the *programmatic* path; JSON becomes the *data* path. Both feed
  the same model.
- Learn: parsing, owned strings (now text isn't a static literal — you must copy bytes into an
  arena and keep them alive), error handling on malformed input (a real trust boundary —
  validate).
- **Add when:** you're editing scenes more than code, or want non-programmers to author.

## B. More element types & styling
gradients, rounded rects, images, polygons, dashed strokes.
- Most are pure JS-side additions (Canvas2D already does them) + a new `Shape` variant + a
  builder method + a `switch` arm. The exhaustive `switch` shows you every place to touch.
- Images: load in JS, store an image-handle integer in the element, `js_image(handle, ...)`.
- **Add when:** a real slide needs it. One element type at a time.

## C. A scripting / DSL layer — "programmatic" for non-Zig users
This is the big one, and the thing that would make it a real "Flash alternative".
- **Option 1 (lazy, strong):** embed an existing small VM — e.g. compile **Lua** (or QuickJS)
  to WASM and bind your element/scene API to it. Reuse, don't write a language.
- **Option 2 (learning):** write a tiny stack-bytecode interpreter in Zig — lexer → parser →
  bytecode → VM. Maximum Zig (this is its own multi-stage curriculum), maximum scope.
- Either way: expose `setProp(id, field, value)`, `goto(scene)`, `on(event, handler)` to scripts.
- **Add when:** you want behavior authored as data/script, not compiled Zig. Big commitment —
  do A and B first.

## D. Audio
`js_play(handle)` backed by WebAudio; an `Action.play_sound`. Trivial to bolt on once actions
exist (stage 6 made the slot).

## E. Export / embed
- Bundle `runtime.wasm` + a scene JSON + a 2 KB loader → a single embeddable widget.
- This is the actual "Flash `.swf` but modern" deliverable: one portable thing that plays
  anywhere. The format unification, not the renderer, is the real product (see overview).

## What NOT to build (unless proven needed)
- A software rasterizer / font engine — Canvas2D already wins at this scale.
- WebGL/WebGPU backend — only if you hit thousands of elements or heavy effects. Measure first.
- A plugin system, a theme engine, an undo stack, a component framework — none of this exists
  yet because nothing needs it. When something needs it, it'll tell you.

---

## Suggested first concrete milestone after the docs
Don't read all stages then build. Do **stage 0 → working `add()` in browser today**, then one
stage per session. You'll have something on screen by stage 2 and something *smooth* by
stage 4 — that momentum matters more than completeness.
