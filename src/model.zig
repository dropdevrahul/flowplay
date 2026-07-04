const std = @import("std");

pub const NodeKind = enum(u32) { rect = 0, ellipse = 1, diamond = 2, roundrect = 3 };

pub const Node = struct {
    id: []const u8,
    kind: NodeKind = .roundrect,
    x: f32 = 0,
    y: f32 = 0,
    w: f32 = 150,
    h: f32 = 66,
    fill: u32 = 0x1e2a3aff,
    stroke: u32 = 0x46618aff,
    label: []const u8 = "",
};

pub const Edge = struct {
    from: []const u8,
    to: []const u8,
    label: []const u8 = "",
};

pub const Subgraph = struct {
    id: []const u8,
    label: []const u8 = "",
    nodes: [][]const u8 = &.{},
};

pub const Diagram = struct {
    alloc: std.mem.Allocator,
    nodes: std.ArrayList(Node) = .empty,
    edges: std.ArrayList(Edge) = .empty,
    subgraphs: std.ArrayList(Subgraph) = .empty,

    pub fn init(self: *Diagram) void {
        self.* = .{ .alloc = self.alloc };
    }
    pub fn node(self: *Diagram, n: Node) void {
        self.nodes.append(self.alloc, n) catch @panic("OOM");
    }
    pub fn edge(self: *Diagram, e: Edge) void {
        self.edges.append(self.alloc, e) catch @panic("OOM");
    }
    pub fn subgraph(self: *Diagram, sg: Subgraph) void {
        self.subgraphs.append(self.alloc, sg) catch @panic("OOM");
    }
    pub fn find(self: *Diagram, id: []const u8) ?Node {
        for (self.nodes.items) |n| if (std.mem.eql(u8, n.id, id)) return n;
        return null;
    }
    pub fn outgoing(self: *Diagram, id: []const u8) []const Edge {
        var list = std.ArrayList(Edge).init(self.alloc);
        for (self.edges.items) |e| {
            if (std.mem.eql(u8, e.from, id)) list.append(self.alloc, e) catch @panic("OOM");
        }
        return list.items;
    }
};

// JSON authoring format
pub const NodeJson = struct {
    id: []const u8,
    kind: []const u8 = "roundrect",
    x: f32 = 0,
    y: f32 = 0,
    w: f32 = 150,
    h: f32 = 66,
    fill: u32 = 0x1e2a3aff,
    stroke: u32 = 0x46618aff,
    label: []const u8 = "",
};
pub const EdgeJson = struct {
    from: []const u8,
    to: []const u8,
    label: []const u8 = "",
};
pub const SubgraphJson = struct {
    id: []const u8,
    label: []const u8 = "",
    nodes: [][]const u8 = &.{},
};
pub const Spec = struct {
    nodes: []NodeJson = &.{},
    edges: []EdgeJson = &.{},
    subgraphs: []SubgraphJson = &.{},
};

pub fn kindFrom(s: []const u8) NodeKind {
    if (std.mem.eql(u8, s, "ellipse")) return .ellipse;
    if (std.mem.eql(u8, s, "diamond")) return .diamond;
    if (std.mem.eql(u8, s, "rect")) return .rect;
    return .roundrect;
}
