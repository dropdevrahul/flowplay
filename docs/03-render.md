# Stage 2 — Render a static scene via Canvas2D

**Goal:** draw the scene from stage 1 on screen. Zig walks the elements and calls JS draw
functions. Still no animation — one static frame.

**Zig you learn:** **imported** functions (the other direction of the boundary), passing a
struct's fields as numbers, passing **strings** across (ptr + len).

## 2.1 Declare the JS functions Zig will call
In Zig, an `extern` fn with no body is an *import* the host must supply.
```zig
// src/render.zig
extern "env" fn js_clear() void;
extern "env" fn js_rect(x: f32, y: f32, w: f32, h: f32, color: u32, opacity: f32, rot: f32, scale: f32) void;
extern "env" fn js_ellipse(x: f32, y: f32, w: f32, h: f32, color: u32, opacity: f32) void;
extern "env" fn js_line(x: f32, y: f32, x2: f32, y2: f32, color: u32, opacity: f32) void;
// strings: pass pointer + length into shared memory
extern "env" fn js_text(ptr: [*]const u8, len: usize, x: f32, y: f32, color: u32, opacity: f32) void;
```

## 2.2 Draw one scene
```zig
const m = @import("model.zig");

pub fn drawScene(scene: *const m.Scene) void {
    js_clear();
    for (scene.elements.items) |e| {
        switch (e.shape) {
            .rect => js_rect(e.x, e.y, e.w, e.h, e.color, e.opacity, e.rotation, e.scale),
            .ellipse => js_ellipse(e.x, e.y, e.w, e.h, e.color, e.opacity),
            .line => |l| js_line(e.x, e.y, l.x2, l.y2, e.color, e.opacity),
            .text => |t| js_text(t.str.ptr, t.str.len, e.x, e.y, e.color, e.opacity),
        }
    }
}
```
The `switch` is exhaustive — add a shape later and Zig makes you handle it here.

## 2.3 Export an entry so JS can trigger a draw
`src/main.zig` (wiring grows over stages):
```zig
const std = @import("std");
const m = @import("model.zig");
const render = @import("render.zig");

var heap: [1 << 20]u8 = undefined;
var fba = std.heap.FixedBufferAllocator.init(&heap);
var show: m.Show = undefined;

export fn init() void {
    show = m.Show.init(fba.allocator());
    var s = m.Scene.init(fba.allocator(), "intro");
    s.elements.append(s.alloc, .{ .id = "box", .shape = .rect, .x = 100, .y = 100, .w = 200, .h = 120, .color = 0x3366ffff }) catch {};
    s.elements.append(s.alloc, .{ .id = "title", .shape = .{ .text = .{ .str = "Hello" } }, .x = 100, .y = 70, .color = 0xffffffff }) catch {};
    show.scenes.append(show.alloc, s) catch {};
}

export fn renderFirst() void {
    render.drawScene(&show.scenes.items[0]);
}
```

## 2.4 Implement the imports in JS (the pretty part — free AA & text)
`web/host.js`:
```js
const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");
let mem; // set after instantiate, for reading strings

const rgba = (c) => {
  const r = (c >>> 24) & 255, g = (c >>> 16) & 255, b = (c >>> 8) & 255, a = (c & 255) / 255;
  return `rgba(${r},${g},${b},${a})`;
};

const env = {
  js_clear: () => ctx.clearRect(0, 0, canvas.width, canvas.height),
  js_rect: (x, y, w, h, color, opacity, rot, scale) => {
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate(rot);
    ctx.scale(scale, scale);
    ctx.fillStyle = rgba(color);
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.restore();
  },
  js_ellipse: (x, y, w, h, color, opacity) => {
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.fillStyle = rgba(color);
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },
  js_line: (x, y, x2, y2, color, opacity) => {
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.strokeStyle = rgba(color);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.restore();
  },
  js_text: (ptr, len, x, y, color, opacity) => {
    const bytes = new Uint8Array(mem.buffer, ptr, len);
    const str = new TextDecoder().decode(bytes);
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.fillStyle = rgba(color);
    ctx.font = "32px system-ui, sans-serif";
    ctx.textBaseline = "top";
    ctx.fillText(str, x, y);
    ctx.restore();
  },
};

const { instance } = await WebAssembly.instantiateStreaming(
  fetch("../zig-out/bin/runtime.wasm"), { env });
mem = instance.exports.memory; // <-- the shared linear memory
instance.exports.init();
instance.exports.renderFirst();
```

## Acceptance check ✅
A blue rounded rect... no — a blue **rect** and white "Hello" text appear on the dark canvas.
Smooth, anti-aliased, free. Zig decided *what*; Canvas2D did *how*.

## Notes — the string trick, explained
WASM functions only speak numbers. A Zig `[]const u8` is `ptr + len`; both are just integers
into `instance.exports.memory` (one big `ArrayBuffer`). JS reads those bytes directly:
`new Uint8Array(mem.buffer, ptr, len)`. No copying into wasm, no serialization — JS reaches
into wasm's RAM. That's the entire "how do I pass a string" answer, and it generalizes to any
struct/array you want to share. Keep the string bytes alive until JS has read them (here they're
static literals, so always alive).
