# Stage 8 — (Optional) Command-buffer rendering

**Only do this if you measure a problem.** At slide scale you won't. Documented because the
overview promised it and it's a great Zig exercise.

**Problem it solves:** stage 2 calls one imported JS function per element per frame. Each call
crosses the WASM↔JS boundary. At tens of elements: irrelevant. At thousands: the crossings add
up.

**Fix:** Zig writes draw commands into a flat byte buffer in shared memory; JS reads the whole
buffer once per frame and replays it. One crossing per frame instead of N.

## Sketch
```zig
// a packed command: tag + fields, fixed stride for simplicity
pub const Cmd = extern struct {
    tag: u32,       // 0=rect 1=ellipse 2=line 3=text
    a: f32, b: f32, c: f32, d: f32,
    color: u32, opacity: f32, e: f32, f: f32,
};

var cmds: [4096]Cmd = undefined;
var cmd_len: usize = 0;

fn emit(c: Cmd) void { cmds[cmd_len] = c; cmd_len += 1; }

export fn cmdPtr() [*]Cmd { return &cmds; }
export fn cmdLen() usize { return cmd_len; }
```
Each frame: Zig resets `cmd_len`, fills `cmds`, returns. JS:
```js
const n = instance.exports.cmdLen();
const base = instance.exports.cmdPtr();
const view = new DataView(mem.buffer, base, n * STRIDE);
// loop n commands, switch on tag, draw
```
Text is the awkward case (variable-length strings): keep a side buffer of bytes + store
offset/len in the command, or keep text on the per-call path (hybrid). Hybrid is laziest.

**Zig you learn:** `extern struct` layout, packed/fixed-stride data, `DataView` on the JS side,
thinking in bytes.

`// ponytail: premature until profiled. The whole point of this file is "don't, yet."`

## Acceptance check ✅
Same visuals as before, identical or better frame time, one boundary crossing per frame
visible in a profiler. If frame time didn't improve, **revert it** — you added complexity for
nothing.
