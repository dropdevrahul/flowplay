# Stage 5 — Scene diff: the "magic move"

**Goal:** transition between two *whole scenes*. Elements with the same `id` glide/morph;
new ids fade in; removed ids fade out. This is the feature that makes it feel like Keynote.

**Zig you learn:** `std.StringHashMap`, building/clearing maps, three-way set logic, iterating
with stable references.

## 5.1 The algorithm (plain words first)
Given `from` scene and `to` scene, for progress `p`:
1. **In both (same id):** draw `tweenElement(from_el, to_el, p)`.
2. **Only in `to` (entering):** draw it with opacity `lerp(0, target_opacity, p)` (fade in).
   Optionally also scale `0.9 → 1.0` for a nicer pop.
3. **Only in `from` (leaving):** draw it with opacity `lerp(orig_opacity, 0, p)` (fade out).

At `p = 1` only `to`'s elements remain at full opacity. Settle there.

## 5.2 Index a scene by id
```zig
// src/diff.zig
const std = @import("std");
const m = @import("model.zig");
const anim = @import("anim.zig");

const Index = std.StringHashMap(m.Element);

fn indexScene(alloc: std.mem.Allocator, scene: *const m.Scene) !Index {
    var map = Index.init(alloc);
    for (scene.elements.items) |e| try map.put(e.id, e);
    return map;
}
```
`StringHashMap` hashes by string *contents*, so `"box"` in scene A matches `"box"` in scene B
even though they're different slices. Exactly what id-matching needs.

## 5.3 Draw a transition
```zig
extern "env" fn js_clear() void; // or import render's draw-one-element

pub fn drawTransition(
    alloc: std.mem.Allocator,
    from: *const m.Scene,
    to: *const m.Scene,
    p_raw: f32,
) !void {
    const p = anim.ease(.ease_in_out, p_raw);

    var from_idx = try indexScene(alloc, from);
    defer from_idx.deinit();
    var to_idx = try indexScene(alloc, to);
    defer to_idx.deinit();

    js_clear();

    // entering + matched: iterate the TARGET scene (draw order = to's order)
    for (to.elements.items) |t| {
        if (from_idx.get(t.id)) |f| {
            drawOne(anim.tweenElement(f, t, p)); // matched -> morph
        } else {
            var e = t; // entering -> fade in (+ slight scale pop)
            e.opacity = anim.lerp(0, t.opacity, p);
            e.scale = anim.lerp(0.9, t.scale, p);
            drawOne(e);
        }
    }
    // leaving: in from, not in to -> fade out
    for (from.elements.items) |f| {
        if (to_idx.get(f.id) == null) {
            var e = f;
            e.opacity = anim.lerp(f.opacity, 0, p);
            drawOne(e);
        }
    }
}
```
`drawOne(element)` is the per-element `switch` from stage 2 (refactor `drawScene` to call it).

## 5.4 Allocator note
`indexScene` allocates a map every transition. With the FixedBufferAllocator that *leaks*
within the arena until reset. Two lazy fixes:
- Reset the arena's tail each frame (`fba.reset()` only if nothing else lives after it — it
  doesn't here if scenes are built once... but they are, so be careful).
- Better: keep two reusable maps as globals, `clearRetainingCapacity()` each frame.
```zig
// ponytail: reuse two module-level maps, clearRetainingCapacity() per frame.
// No per-frame alloc, no leak, no arena gymnastics. Build the maps once in init().
```
Do the reusable-maps version — it's less code *and* faster.

## 5.5 Wire frame() to the real transition
```zig
export fn frame(now: f32) void {
    if (anim_start < 0) {
        render.drawScene(&show.scenes.items[to_scene]);
        return;
    }
    const p_raw = (now - anim_start) / anim_dur;
    diff.drawTransition(scratch_alloc, &show.scenes.items[from_scene], &show.scenes.items[to_scene], p_raw) catch {};
    if (p_raw >= 1) anim_start = -1;
}
```

## Self-check
```zig
test "diff classifies ids" {
    // build from = {a,b}, to = {b,c}; assert b matched, c entering, a leaving.
    // (construct two scenes, index them, check .get() presence — no rendering needed)
}
```
Fill the body using `indexScene` + `.get`; assert `from_idx.get("a") != null and to_idx.get("a") == null` (leaving), etc.

## Acceptance check ✅
Two scenes where `box` moves+recolors, `title` changes text, a new `dot` appears, an old
element disappears. Trigger the transition → box glides and morphs, dot fades/pops in, old one
fades out, all on one eased timeline. That's the magic move.

## Notes
- Same-text element keeps its id but changes `str`: Canvas2D just renders the new string at
  the tweened position — text content doesn't interpolate (and shouldn't). Position/opacity do.
- Draw order = target scene's element order; leaving elements draw last (on top) so they fade
  over the new layout. Swap if you want them underneath.
