# Stage 1 — Data model: elements, scenes, show

**Goal:** represent the runtime's state in memory. No drawing yet — just the structs and an
allocator that holds them.

**Zig you learn:** `struct`, `enum`, **tagged union**, slices vs arrays, optionals,
**allocators** + `defer`, `ArrayList`.

## 1.1 Color
Pack RGBA into one `u32` (0xRRGGBBAA). One number, easy to pass to JS later.
```zig
pub const Color = u32; // 0xRRGGBBAA
```

## 1.2 Element shape — a tagged union
Different shapes carry different data, but all share transform/style. Model the *shape*
as a tagged union; keep shared fields outside it.
```zig
pub const Shape = union(enum) {
    rect,
    ellipse,
    line: struct { x2: f32, y2: f32 }, // line needs an end point
    text: struct { str: []const u8 },  // slice into memory we own
};

pub const Element = struct {
    id: []const u8,     // matched across scenes for magic-move (stage 5)
    shape: Shape,
    x: f32 = 0,
    y: f32 = 0,
    w: f32 = 0,
    h: f32 = 0,
    color: Color = 0xffffffff,
    opacity: f32 = 1,
    rotation: f32 = 0,  // radians
    scale: f32 = 1,
};
```
Why tagged union: a `switch` on `e.shape` forces you to handle every case — the compiler
won't let you forget `text` when you add it. That's the safety you're buying.

## 1.3 Scene & Show
```zig
const std = @import("std");

// 0.16: ArrayList is unmanaged. Init with `.empty`; pass the allocator to each method.
// We stash `alloc` in the struct so the builder API (stage 3) stays clean.
pub const Scene = struct {
    alloc: std.mem.Allocator,
    name: []const u8,
    elements: std.ArrayList(Element),
    // interactions added in stage 6

    pub fn init(alloc: std.mem.Allocator, name: []const u8) Scene {
        return .{ .alloc = alloc, .name = name, .elements = .empty };
    }
    pub fn deinit(self: *Scene) void {
        self.elements.deinit(self.alloc);
    }
};

pub const Show = struct {
    alloc: std.mem.Allocator,
    scenes: std.ArrayList(Scene),

    pub fn init(alloc: std.mem.Allocator) Show {
        return .{ .alloc = alloc, .scenes = .empty };
    }
    pub fn deinit(self: *Show) void {
        for (self.scenes.items) |*s| s.deinit();
        self.scenes.deinit(self.alloc);
    }
};
```

## 1.4 Allocator in a freestanding WASM world
No OS = no default allocator handed to you. Two easy options:
- **FixedBufferAllocator** over a static byte array — dead simple, bounded, no free needed.
- A page allocator backed by `@wasmMemoryGrow` — more real, more work.

Start fixed:
```zig
var heap: [1 << 20]u8 = undefined; // 1 MiB, plenty for a slide show
var fba = std.heap.FixedBufferAllocator.init(&heap);
const alloc = fba.allocator();
```
`// ponytail: 1 MiB fixed arena. Grow the array or switch to a page allocator if scenes outgrow it.`

## 1.5 Self-check (runnable, no browser)
Put a `demo()` behind a normal target so you can run it on your machine:
```zig
test "model holds a scene" {
    var fba = std.heap.FixedBufferAllocator.init(try std.testing.allocator.alloc(u8, 1 << 16));
    defer std.testing.allocator.free(fba.buffer);
    var show = Show.init(fba.allocator());
    defer show.deinit();

    var s = Scene.init(fba.allocator(), "intro");
    try s.elements.append(s.alloc, .{ .id = "box", .shape = .rect, .x = 100, .w = 200, .h = 120 });
    try show.scenes.append(show.alloc, s);

    try std.testing.expectEqual(@as(usize, 1), show.scenes.items.len);
    try std.testing.expectEqualStrings("box", show.scenes.items[0].elements.items[0].id);
}
```
```sh
zig test src/model.zig
```

## Acceptance check ✅
`zig test` passes. You can construct a Show → Scene → Elements in memory and read them back.

## Notes
- `defer x.deinit()` runs at scope exit — Zig's answer to "no GC, but don't leak". Pair every
  `init` with a `defer deinit` and leaks mostly vanish.
- Slices (`[]const u8`) are `ptr + len`. A string is not owned by the slice — *someone* owns
  the bytes. Here string literals live in the wasm data section (static), so `"box"` is fine
  forever. User-supplied text later will need real ownership — note it now.
