# Stage 3 — The programmatic builder API

**Goal:** stop hand-appending elements. Build the fluent authoring API from `00-overview.md`
so scenes/elements/interactions are defined in clean Zig code.

**Zig you learn:** methods returning pointers (`*Scene`), anonymous struct literals as named
args, optionals/defaults, error handling (`!` and `try`), light `comptime`.

## 3.1 The shape we're building toward
```zig
const intro = show.scene("intro");
intro.rect("box",   .{ .x = 100, .y = 100, .w = 200, .h = 120, .color = 0x3366ffff });
intro.text("title", .{ .x = 100, .y = 70, .str = "Hello", .color = 0xffffffff });
intro.ellipse("dot",.{ .x = 400, .y = 200, .w = 60, .h = 60, .color = 0xff5577ff });
```
Interactions (`.on(...)`) land in stage 6; build elements now.

## 3.2 Option structs = named, defaulted args
Zig has no keyword args; the idiom is "pass an anonymous struct". Give each shape an options
struct with sane defaults so callers set only what they care about.
```zig
pub const RectOpts = struct {
    x: f32 = 0, y: f32 = 0, w: f32 = 100, h: f32 = 60,
    color: Color = 0xffffffff, opacity: f32 = 1, rotation: f32 = 0, scale: f32 = 1,
};
pub const TextOpts = struct {
    x: f32 = 0, y: f32 = 0, str: []const u8 = "",
    color: Color = 0xffffffff, opacity: f32 = 1,
};
pub const EllipseOpts = struct {
    x: f32 = 0, y: f32 = 0, w: f32 = 60, h: f32 = 60,
    color: Color = 0xffffffff, opacity: f32 = 1,
};
```

## 3.3 Builder methods on Scene
```zig
pub const Scene = struct {
    name: []const u8,
    elements: std.ArrayList(Element),

    // returns *Element so a future .on()/.tween() could chain; ignore the return if unused.
    pub fn rect(self: *Scene, id: []const u8, o: RectOpts) void {
        self.elements.append(self.alloc, .{
            .id = id, .shape = .rect,
            .x = o.x, .y = o.y, .w = o.w, .h = o.h,
            .color = o.color, .opacity = o.opacity, .rotation = o.rotation, .scale = o.scale,
        }) catch @panic("OOM: grow the arena (see 02-model.md)");
    }
    pub fn ellipse(self: *Scene, id: []const u8, o: EllipseOpts) void {
        self.elements.append(self.alloc, .{
            .id = id, .shape = .ellipse,
            .x = o.x, .y = o.y, .w = o.w, .h = o.h, .color = o.color, .opacity = o.opacity,
        }) catch @panic("OOM");
    }
    pub fn text(self: *Scene, id: []const u8, o: TextOpts) void {
        self.elements.append(self.alloc, .{
            .id = id, .shape = .{ .text = .{ .str = o.str } },
            .x = o.x, .y = o.y, .color = o.color, .opacity = o.opacity,
        }) catch @panic("OOM");
    }
};
```
`// ponytail: .catch @panic on OOM. A slide author hitting OOM is a bug, not a recoverable
// path — surface it loud. Switch to returning !void if you ever load untrusted/huge content.`

## 3.4 Show.scene returns a usable pointer
`ArrayList` can move its backing memory when it grows, invalidating pointers. Two lazy-safe
options:
- **A (simplest):** build all scenes, *then* render — append returns are fine because you
  finish authoring before taking long-lived pointers.
- **B:** reserve capacity up front (`try scenes.ensureTotalCapacity(N)`) so the array never
  moves, making `&scenes.items[i]` stable.

Use B for the builder so `const intro = show.scene("intro")` stays valid:
```zig
pub fn scene(self: *Show, name: []const u8) *Scene {
    self.scenes.ensureUnusedCapacity(self.alloc, 1) catch @panic("OOM");
    self.scenes.appendAssumeCapacity(Scene.init(self.alloc, name));
    return &self.scenes.items[self.scenes.items.len - 1];
}
```
`// ponytail: capacity-reserve keeps pointers stable cheaply. If scene count gets huge,
// switch scenes to a std.SegmentedList (stable addresses) — not needed at slide scale.`

## 3.5 Wire it into init
```zig
export fn init() void {
    show = m.Show.init(fba.allocator());
    const intro = show.scene("intro");
    intro.rect("box", .{ .x = 100, .y = 100, .w = 200, .h = 120, .color = 0x3366ffff });
    intro.text("title", .{ .x = 100, .y = 70, .str = "Hello", .color = 0xffffffff });
}
```

## Self-check
```zig
test "builder adds elements with defaults" {
    var buf: [1 << 16]u8 = undefined;
    var fba = std.heap.FixedBufferAllocator.init(&buf);
    var show = Show.init(fba.allocator());
    const s = show.scene("a");
    s.rect("box", .{ .x = 10 });
    try std.testing.expectEqual(@as(f32, 10), s.elements.items[0].x);
    try std.testing.expectEqual(@as(f32, 60), s.elements.items[0].h); // default
}
```

## Acceptance check ✅
Same picture as stage 2, but `init()` reads like the target API. Adding an element is one
readable line.

## Notes
- Anonymous struct literal `.{ .x = 10 }` is *the* Zig ergonomic for options — embrace it.
- Returning `*Element`/`*Scene` enables future chaining without committing to it now.
- `comptime` peek: you could generate the three builder methods from a list of shapes with a
  `comptime` loop. Don't yet — three hand-written methods are clearer than one clever
  generator. Revisit in stage 8 if shapes multiply.
