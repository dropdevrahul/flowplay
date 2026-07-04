const std = @import("std");
const host = @import("host.zig");
const model = @import("model.zig");
const geom = @import("geom.zig");

// ---- palette ----
const C_EDGE: u32 = 0x55657eff;
const C_HILITE: u32 = 0x6ee7ffff;
const C_LABEL: u32 = 0xe6edf5ff;
const C_EDGELABEL: u32 = 0x9fb0c8ff;

// ---- runtime state ----
var heap: [1 << 20]u8 = undefined;
var fba = std.heap.FixedBufferAllocator.init(&heap);
var dg: model.Diagram = undefined;

var json_buf: [64 * 1024]u8 = undefined;

var cur_id: []const u8 = "";
var next_id: []const u8 = "";
var anim_start: f32 = -1;
var paused: bool = false;

var trans_buf: [2048]u8 = undefined;
var trans_count: u32 = 0;

const anim_dur: f32 = 1200;

// ---- helpers ----
fn findEdge(from: []const u8, to: []const u8) ?model.Edge {
    for (dg.edges.items) |e| {
        if (std.mem.eql(u8, e.from, from) and std.mem.eql(u8, e.to, to)) return e;
    }
    return null;
}

fn startAnim(target: []const u8, now: f32) void {
    next_id = target;
    anim_start = now;
    paused = false;
}

fn buildTransitions(id: []const u8) void {
    var offset: usize = 0;
    var count: u32 = 0;
    for (dg.edges.items) |e| {
        if (!std.mem.eql(u8, e.from, id)) continue;
        const label = if (e.label.len > 0) e.label else e.to;
        if (offset + label.len + 1 > trans_buf.len) break;
        @memcpy(trans_buf[offset..][0..label.len], label);
        offset += label.len;
        trans_buf[offset] = 0;
        offset += 1;
        count += 1;
    }
    trans_count = count;
}

// ---- exports ----
export fn init() void {
    dg = .{ .alloc = fba.allocator() };
}

export fn jsonPtr() [*]u8 {
    return &json_buf;
}

export fn loadJson(len: usize) void {
    fba.reset();
    dg = .{ .alloc = fba.allocator() };
    const spec = std.json.parseFromSliceLeaky(model.Spec, dg.alloc, json_buf[0..len], .{
        .ignore_unknown_fields = true,
    }) catch {
        const msg = "diagram JSON: parse error";
        host.js_error(msg.ptr, msg.len);
        return;
    };
    for (spec.nodes) |n| dg.node(.{
        .id = n.id,
        .kind = model.kindFrom(n.kind),
        .x = n.x,
        .y = n.y,
        .w = n.w,
        .h = n.h,
        .fill = n.fill,
        .stroke = n.stroke,
        .label = n.label,
    });
    for (spec.edges) |e| dg.edge(.{ .from = e.from, .to = e.to, .label = e.label });
    for (spec.subgraphs) |sg| dg.subgraph(.{ .id = sg.id, .label = sg.label, .nodes = sg.nodes });

    if (dg.nodes.items.len > 0) {
        cur_id = dg.nodes.items[0].id;
    }
    anim_start = -1;
    paused = true;
    next_id = "";
}

export fn frame(now: f32) void {
    host.js_clear();

    // subgraphs
    for (dg.subgraphs.items) |sg| {
        var min_x: f32 = std.math.floatMax(f32);
        var min_y: f32 = std.math.floatMax(f32);
        var max_x: f32 = -std.math.floatMax(f32);
        var max_y: f32 = -std.math.floatMax(f32);
        for (sg.nodes) |nid| {
            if (dg.find(nid)) |n| {
                min_x = @min(min_x, n.x);
                min_y = @min(min_y, n.y);
                max_x = @max(max_x, n.x + n.w);
                max_y = @max(max_y, n.y + n.h);
            }
        }
        if (min_x <= max_x) {
            const pad: f32 = 16;
            const top_pad: f32 = 36;
            host.js_subgraph(
                min_x - pad,
                min_y - top_pad,
                (max_x - min_x) + pad * 2,
                (max_y - min_y) + pad + top_pad,
                sg.label.ptr,
                sg.label.len,
            );
        }
    }

    const is_animating = anim_start >= 0;

    // edges
    for (dg.edges.items) |e| {
        const a = dg.find(e.from) orelse continue;
        const b = dg.find(e.to) orelse continue;
        const ca = geom.center(a);
        const cb = geom.center(b);
        const p1 = geom.border(a, cb.x, cb.y);
        const p2 = geom.border(b, ca.x, ca.y);
        const c = geom.control(p1, p2);
        const active = is_animating and std.mem.eql(u8, e.from, cur_id) and std.mem.eql(u8, e.to, next_id);
        host.js_edge(p1.x, p1.y, c.x, c.y, p2.x, p2.y, if (active) C_HILITE else C_EDGE, 1, if (active) 3 else 1.5, true);
        if (e.label.len > 0) {
            const mid = geom.quad(p1, c, p2, 0.5);
            host.js_label(e.label.ptr, e.label.len, mid.x, mid.y - 9, C_EDGELABEL, 1, 13);
        }
    }

    // nodes
    for (dg.nodes.items) |n| {
        const is_cur = std.mem.eql(u8, n.id, cur_id);
        const is_nxt = is_animating and std.mem.eql(u8, n.id, next_id);
        const highlight = is_cur or is_nxt;
        host.js_node(
            @intFromEnum(n.kind), n.x, n.y, n.w, n.h, n.fill,
            if (highlight) C_HILITE else n.stroke, 1,
            if (highlight) 3.5 else 1.5,
        );
        if (n.label.len > 0) {
            host.js_label(n.label.ptr, n.label.len, geom.center(n).x, geom.center(n).y, C_LABEL, 1, 16);
        }
    }

    // transition pills when paused
    if (paused) {
        buildTransitions(cur_id);
    }

    // animation
    if (is_animating) {
        const a = dg.find(cur_id) orelse return;
        const b = dg.find(next_id) orelse return;
        const ca = geom.center(a);
        const cb = geom.center(b);
        const p1 = geom.border(a, cb.x, cb.y);
        const p2 = geom.border(b, ca.x, ca.y);
        const c = geom.control(p1, p2);
        const elapsed = now - anim_start;
        const tok = geom.quad(p1, c, p2, geom.easeInOut(elapsed / anim_dur));
        host.js_token(tok.x, tok.y, 7, C_HILITE);

        if (elapsed >= anim_dur) {
            cur_id = next_id;
            anim_start = -1;
            paused = true;
        }
    }
}

export fn onKey(code: u32) void {
    switch (code) {
        32 => {}, // space unused in interactive mode
        82 => { // r: restart
            if (dg.nodes.items.len > 0) {
                cur_id = dg.nodes.items[0].id;
                anim_start = -1;
                paused = true;
            }
        },
        else => {
            if (code >= 49 and code <= 57) {
                const idx = code - 49;
                if (paused and idx < trans_count) {
                    var i: u32 = 0;
                    for (dg.edges.items) |e| {
                        if (!std.mem.eql(u8, e.from, cur_id)) continue;
                        if (i == idx) {
                            startAnim(e.to, 0);
                            break;
                        }
                        i += 1;
                    }
                }
            }
        },
    }
}

// ---- JS transition query API ----
export fn getTransitionCount() u32 {
    return trans_count;
}

export fn getTransitionStr() [*]u8 {
    return &trans_buf;
}

export fn selectTransition(idx: u32) void {
    if (idx >= trans_count) return;
    var i: u32 = 0;
    for (dg.edges.items) |e| {
        if (!std.mem.eql(u8, e.from, cur_id)) continue;
        if (i == idx) {
            startAnim(e.to, 0);
            return;
        }
        i += 1;
    }
}

export fn currentNodeX() f32 {
    const n = dg.find(cur_id) orelse return 0;
    return n.x + n.w / 2;
}
export fn currentNodeY() f32 {
    const n = dg.find(cur_id) orelse return 0;
    return n.y + n.h / 2;
}
export fn currentNodeW() f32 {
    const n = dg.find(cur_id) orelse return 0;
    return n.w;
}
export fn currentNodeH() f32 {
    const n = dg.find(cur_id) orelse return 0;
    return n.h;
}
