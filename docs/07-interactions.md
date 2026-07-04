# Stage 6 — Interactions: events → actions

**Goal:** make it interactive and programmable. Register, in the builder, that clicking an
element or pressing a key triggers an action (go to another scene). Feed real DOM events into
WASM and dispatch them.

**Zig you learn:** more tagged unions (events + actions), hit-testing, dispatch tables,
exported functions taking input, a small state machine.

## 6.1 Model events and actions
```zig
// in model.zig
pub const Trigger = union(enum) {
    click: []const u8, // element id to click
    key_next,          // → / space / click anywhere
    key_prev,          // ←
    timer: f32,        // auto-advance after ms
};

pub const Action = union(enum) {
    goto: []const u8,  // scene name
    // later: set_prop, play_sound, run_script ...
};

pub const Interaction = struct { trigger: Trigger, action: Action };
```
Add to `Scene`: a field `interactions: std.ArrayList(Interaction)`, init it `= .empty` in
`Scene.init`, and `self.interactions.deinit(self.alloc)` in `Scene.deinit` (0.16 unmanaged
list — same pattern as `elements`).

## 6.2 Builder: the `.on(...)` from the API design
```zig
// in Scene
pub fn onClick(self: *Scene, element_id: []const u8, action: Action) void {
    self.interactions.append(self.alloc, .{ .trigger = .{ .click = element_id }, .action = action }) catch @panic("OOM");
}
pub fn onNext(self: *Scene, action: Action) void {
    self.interactions.append(self.alloc, .{ .trigger = .key_next, .action = action }) catch @panic("OOM");
}
```
Usage matches the locked API:
```zig
intro.onClick("box", .{ .goto = "next" });
intro.onNext(.{ .goto = "next" });
```

## 6.3 Resolve scene name → index
```zig
fn sceneIndex(name: []const u8) ?usize {
    for (show.scenes.items, 0..) |s, i| if (std.mem.eql(u8, s.name, name)) return i;
    return null;
}
```
`// ponytail: linear scan over scenes. O(n) per event, n = slide count = tiny. A name->index
// map is premature; add it only if you ever have thousands of scenes (you won't).`

## 6.4 Hit-testing (which element was clicked)
Axis-aligned bounds check, current (settled) scene only. Ignores rotation — fine for click
targets at this scale.
```zig
fn hitTest(scene: *const m.Scene, px: f32, py: f32) ?[]const u8 {
    // iterate in reverse so topmost (last drawn) wins
    var i = scene.elements.items.len;
    while (i > 0) {
        i -= 1;
        const e = scene.elements.items[i];
        if (px >= e.x and px <= e.x + e.w and py >= e.y and py <= e.y + e.h)
            return e.id;
    }
    return null;
}
// ponytail: AABB hit-test, no rotation. Add rotated/point-in-ellipse tests only if a real
// design needs clickable rotated/round targets.
```

## 6.5 Dispatch: exported input entry points
```zig
fn runAction(a: m.Action, now: f32) void {
    switch (a) {
        .goto => |name| if (sceneIndex(name)) |idx| startTransition(idx, now),
    }
}

export fn onClick(px: f32, py: f32, now: f32) void {
    if (anim_start >= 0) return; // ignore input mid-transition (or queue it — later)
    const scene = &show.scenes.items[to_scene];
    const hit = hitTest(scene, px, py); // ?id
    for (scene.interactions.items) |it| {
        switch (it.trigger) {
            .click => |id| if (hit != null and std.mem.eql(u8, hit.?, id)) runAction(it.action, now),
            .key_next => runAction(it.action, now), // bare click also advances
            else => {},
        }
    }
}

export fn onKey(code: u32, now: f32) void {
    if (anim_start >= 0) return;
    const scene = &show.scenes.items[to_scene];
    for (scene.interactions.items) |it| {
        const want: ?m.Trigger = switch (code) {
            39, 32 => .key_next, // ArrowRight, Space
            37 => .key_prev,     // ArrowLeft
            else => null,
        };
        if (want == null) continue;
        if (std.meta.activeTag(it.trigger) == std.meta.activeTag(want.?)) runAction(it.action, now);
    }
}
```

## 6.6 Feed DOM events in (host.js)
```js
canvas.addEventListener("click", (ev) => {
  const r = canvas.getBoundingClientRect();
  instance.exports.onClick(ev.clientX - r.left, ev.clientY - r.top, performance.now());
});
window.addEventListener("keydown", (ev) => {
  const map = { ArrowRight: 39, ArrowLeft: 37, " ": 32 };
  if (map[ev.key] != null) instance.exports.onKey(map[ev.key], performance.now());
});
```

## 6.7 Timer triggers (optional, easy)
In `frame(now)`, when idle, check the current scene for a `.timer` trigger and compare
`now - scene_entered_at` against it; fire once. One bool guard so it doesn't refire.

## Self-check
```zig
test "hit-test picks topmost" {
    // two overlapping rects, same area, different ids; assert reverse-iteration returns the later one.
}
test "sceneIndex resolves and rejects" {
    // assert known name -> Some(i), unknown -> null
}
```

## Acceptance check ✅
Click the box (or press →) → smooth magic-move to the next scene. Press ← → back. A fully
interactive, programmatically-defined little slide runtime. **Core complete.**

## Notes
- Input ignored mid-transition keeps state simple (no interruption races). Upgrade to
  "interrupt + retarget from current tweened values" later if it feels stiff — that needs
  capturing the in-flight element states as the new `from`.
- Everything is still pure-ish Zig logic + thin JS shims. The brain is yours; the browser is
  just a screen and a keyboard.
