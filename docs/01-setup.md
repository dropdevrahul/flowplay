# Stage 0 — Setup: Zig → WASM → browser

**Goal:** compile a Zig function to `.wasm`, load it in a page, call it from JS, see the
result. Prove the whole pipeline before any graphics.

**Zig you learn:** the `build.zig` build script, the wasm freestanding target,
`export fn`, and the JS↔WASM boundary (numbers only, for now).

## 0.1 Install
```sh
brew install zig   # macOS; or download from ziglang.org
zig version        # pinned to 0.16.0 in these docs — see version note in 00-overview.md
```

## 0.2 The smallest export
`src/main.zig`:
```zig
// export = visible to the WASM host (JS). No name mangling, C ABI.
export fn add(a: i32, b: i32) i32 {
    return a + b;
}
```

## 0.3 build.zig (this is the churny part — concepts first, spelling may drift)
```zig
const std = @import("std");

pub fn build(b: *std.Build) void {
    // Freestanding wasm: no OS, no libc. We are the whole world.
    const target = b.resolveTargetQuery(.{
        .cpu_arch = .wasm32,
        .os_tag = .freestanding,
    });

    const exe = b.addExecutable(.{
        .name = "runtime",
        // 0.16: target/optimize/source go inside a module, not flat on addExecutable.
        .root_module = b.createModule(.{
            .root_source_file = b.path("src/main.zig"),
            .target = target,
            .optimize = .ReleaseSmall, // small .wasm; use .Debug while learning
        }),
    });

    // WASM has no main(); it's a library of exports.
    exe.entry = .disabled;
    // keep `export fn`s in the binary even if "unused" from Zig's view.
    exe.rdynamic = true;

    b.installArtifact(exe);
}
```
```sh
zig build
# -> zig-out/bin/runtime.wasm   (verified: this exact build.zig works on 0.16.0)
```
If `entry`/`rdynamic`/`createModule` names moved in a newer Zig: search "zig build wasm export"
for the current spelling. The intent — *no entry point, keep exports* — is stable.

## 0.4 Host page
`web/index.html`:
```html
<!doctype html>
<meta charset="utf-8">
<canvas id="c" width="960" height="540" style="background:#111"></canvas>
<script type="module" src="./host.js"></script>
```
`web/host.js`:
```js
const { instance } = await WebAssembly.instantiateStreaming(
  fetch("../zig-out/bin/runtime.wasm"),
  { env: {} } // imports go here later
);
console.log("add(2,3) =", instance.exports.add(2, 3));
```

## 0.5 Serve & run
WASM won't load from `file://`. Serve:
```sh
cd /Users/rahultyagi/work/ff-viewer
python3 -m http.server 8080
# open http://localhost:8080/web/
```

## Acceptance check ✅
Console prints `add(2,3) = 5`. Pipeline proven: Zig compiled, wasm loaded, JS called in.

## Notes for the curious
- **No GC, no allocator yet.** Numbers pass by value across the boundary — trivial.
  Strings/structs are the hard part (stage 2): WASM only knows i32/i64/f32/f64, so
  everything else is "a number that indexes into wasm linear memory."
- `ReleaseSmall` vs `Debug`: stay on `Debug` while learning — better panics. Switch to
  `ReleaseSmall` when you care about download size.
