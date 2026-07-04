const std = @import("std");
const model = @import("model.zig");

pub const Pt = struct { x: f32, y: f32 };

pub fn center(n: model.Node) Pt {
    return .{ .x = n.x + n.w / 2, .y = n.y + n.h / 2 };
}

pub fn border(n: model.Node, tx: f32, ty: f32) Pt {
    const c = center(n);
    const dx = tx - c.x;
    const dy = ty - c.y;
    if (dx == 0 and dy == 0) return c;
    var s: f32 = std.math.floatMax(f32);
    if (@abs(dx) > 0) s = @min(s, (n.w / 2) / @abs(dx));
    if (@abs(dy) > 0) s = @min(s, (n.h / 2) / @abs(dy));
    return .{ .x = c.x + dx * s, .y = c.y + dy * s };
}

pub fn easeInOut(t: f32) f32 {
    const c = std.math.clamp(t, 0, 1);
    return if (c < 0.5) 2 * c * c else 1 - std.math.pow(f32, -2 * c + 2, 2) / 2;
}

const curvature: f32 = 0.22;

pub fn control(p1: Pt, p2: Pt) Pt {
    return .{
        .x = (p1.x + p2.x) / 2 + (p2.y - p1.y) * curvature,
        .y = (p1.y + p2.y) / 2 - (p2.x - p1.x) * curvature,
    };
}

pub fn quad(p1: Pt, c: Pt, p2: Pt, t: f32) Pt {
    const u = 1 - t;
    return .{
        .x = u * u * p1.x + 2 * u * t * c.x + t * t * p2.x,
        .y = u * u * p1.y + 2 * u * t * c.y + t * t * p2.y,
    };
}
