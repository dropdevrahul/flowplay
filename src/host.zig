pub extern "env" fn js_clear() void;
pub extern "env" fn js_node(kind: u32, x: f32, y: f32, w: f32, h: f32, fill: u32, stroke: u32, opacity: f32, line_w: f32) void;
pub extern "env" fn js_edge(x1: f32, y1: f32, cx: f32, cy: f32, x2: f32, y2: f32, color: u32, opacity: f32, line_w: f32, arrow: bool) void;
pub extern "env" fn js_token(x: f32, y: f32, r: f32, color: u32) void;
pub extern "env" fn js_label(ptr: [*]const u8, len: usize, x: f32, y: f32, color: u32, opacity: f32, size: f32) void;
pub extern "env" fn js_error(ptr: [*]const u8, len: usize) void;
pub extern "env" fn js_subgraph(x: f32, y: f32, w: f32, h: f32, label_ptr: [*]const u8, label_len: usize) void;
