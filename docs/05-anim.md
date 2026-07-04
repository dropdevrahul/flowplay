# Stage 4 — The frame loop, easing, and tweening

**Goal:** smooth motion. Drive a frame loop from JS, and tween one element's properties from
A to B over a duration with easing. This is where "beautiful smooth" is born.

**Zig you learn:** `f32` math, `enum` used as a dispatch, pure functions, time deltas,
`std.math`.

## 4.1 Easing — an enum + one function
```zig
// src/anim.zig
const std = @import("std");

pub const Easing = enum { linear, ease_in, ease_out, ease_in_out };

/// t in [0,1] -> eased [0,1]
pub fn ease(e: Easing, t: f32) f32 {
    const c = std.math.clamp(t, 0, 1);
    return switch (e) {
        .linear => c,
        .ease_in => c * c,
        .ease_out => 1 - (1 - c) * (1 - c),
        .ease_in_out => if (c < 0.5) 2 * c * c else 1 - std.math.pow(f32, -2 * c + 2, 2) / 2,
    };
}

/// linear interpolate
pub fn lerp(a: f32, b: f32, t: f32) f32 {
    return a + (b - a) * t;
}
```

## 4.2 Color lerp (channelwise — don't lerp the packed u32!)
```zig
pub fn lerpColor(a: u32, b: u32, t: f32) u32 {
    var out: u32 = 0;
    inline for (.{ 24, 16, 8, 0 }) |sh| {
        const ca: f32 = @floatFromInt((a >> sh) & 0xff);
        const cb: f32 = @floatFromInt((b >> sh) & 0xff);
        const cv: u32 = @intFromFloat(@round(lerp(ca, cb, t)));
        out |= (cv & 0xff) << sh;
    }
    return out;
}
```
`inline for` unrolls the four channels at compile time — your first useful `comptime`.

## 4.3 A transition between two element states
```zig
const m = @import("model.zig");

/// produce the element to draw at progress p (already eased) between from->to
pub fn tweenElement(from: m.Element, to: m.Element, p: f32) m.Element {
    var r = to; // copy 'to' for shape/id, override animatable fields
    r.x = lerp(from.x, to.x, p);
    r.y = lerp(from.y, to.y, p);
    r.w = lerp(from.w, to.w, p);
    r.h = lerp(from.h, to.h, p);
    r.opacity = lerp(from.opacity, to.opacity, p);
    r.rotation = lerp(from.rotation, to.rotation, p);
    r.scale = lerp(from.scale, to.scale, p);
    r.color = lerpColor(from.color, to.color, p);
    return r;
}
```

## 4.4 Timing: JS owns the clock, Zig owns the logic
JS's `requestAnimationFrame` gives a high-res timestamp. Pass it to an exported `frame(now)`.
Zig computes progress from its own start time.
```zig
// src/main.zig (additions)
const anim = @import("anim.zig");

var anim_start: f32 = -1;     // ms; <0 means idle
var anim_dur: f32 = 600;      // ms
var from_scene: usize = 0;
var to_scene: usize = 0;

export fn startTransition(to: usize, now: f32) void {
    from_scene = to_scene;
    to_scene = to;
    anim_start = now;
}

export fn frame(now: f32) void {
    // For stage 4, just animate the WHOLE scene's first element as a proof.
    // Stage 5 replaces this with per-id diffing across scenes.
    if (anim_start < 0) {
        render.drawScene(&show.scenes.items[to_scene]);
        return;
    }
    const p_raw = (now - anim_start) / anim_dur;
    const p = anim.ease(.ease_in_out, p_raw);
    // ... draw tweened elements (full version in stage 5) ...
    if (p_raw >= 1) anim_start = -1; // done -> settle on target
}
```
```js
// host.js — the loop
function loop(now) {
  instance.exports.frame(now);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
```

## 4.5 Why this stays smooth
- JS clock = real wall time, so motion is **frame-rate independent**: progress is
  `elapsed / duration`, not "+1 per frame". A 144Hz screen and a 30Hz screen finish the
  600ms move at the same wall-clock moment.
- `ease_in_out` removes the robotic linear feel. That single curve is 80% of "it looks pro".

## Self-check
```zig
test "ease + lerp endpoints" {
    try std.testing.expectEqual(@as(f32, 0), ease(.ease_in_out, 0));
    try std.testing.expectEqual(@as(f32, 1), ease(.ease_in_out, 1));
    try std.testing.expectEqual(@as(f32, 50), lerp(0, 100, 0.5));
    try std.testing.expectEqual(@as(u32, 0x808080ff), lerpColor(0x000000ff, 0xffffffff, 0.5019608));
}
```

## Acceptance check ✅
Trigger `startTransition` from the console (`instance.exports.startTransition(0, performance.now())`)
and watch an element glide with an eased curve, not a linear snap. Smooth at any refresh rate.

## Notes
- Keep tween functions **pure** (input → output, no globals). Easy to test, easy to reason
  about, trivial to parallelize later if ever needed (it won't be).
- `@floatFromInt` / `@intFromFloat` are explicit on purpose — Zig refuses silent numeric
  coercion. Verbose, but no surprise truncation at 3am.
