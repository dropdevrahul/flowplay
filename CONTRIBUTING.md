# Contributing to Flowplay

Thanks for your interest in contributing! Here's how to get started.

## Project overview

Flowplay is a Zig + WASM diagram player with a TypeScript/React frontend.

- **Zig runtime** (`src/`) — compiled to WASM, handles model, geometry, playback
- **Web frontend** (`web/`) — Vite + React 19, Canvas2D rendering, editor UI
- **Examples** (`examples/`) — sample diagrams as JSON

## Development setup

```sh
# Build the WASM runtime
zig build

# Start the dev server (from the web/ directory)
cd web && npm install && npm run dev
```

## Making changes

1. Open an issue to discuss significant changes before implementing.
2. Follow existing code style — the project uses minimal comments and descriptive names.
3. Keep commits focused and use conventional commit messages.
4. Test your changes by running the dev server and loading a diagram.

## Pull request guidelines

- Reference any related issues.
- Explain what the change does and why.
- Keep PRs small and focused on a single concern.
- Ensure the WASM runtime still builds (`zig build`) and the frontend compiles (`npm run build`).

## Code of conduct

Be respectful and constructive. We're all here to learn and build something cool.
