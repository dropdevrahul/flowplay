import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'fs'
import { resolve } from 'path'

const root = resolve(__dirname, '..')
const publicDir = resolve(__dirname, 'public')

const ensure = (d: string) => { if (!existsSync(d)) mkdirSync(d, { recursive: true }) }
ensure(publicDir)
ensure(resolve(publicDir, 'examples'))

const wasmSrc = resolve(root, 'zig-out/bin/runtime.wasm')
if (existsSync(wasmSrc)) {
  copyFileSync(wasmSrc, resolve(publicDir, 'runtime.wasm'))
}

const examplesSrc = resolve(root, 'examples')
if (existsSync(examplesSrc)) {
  for (const f of readdirSync(examplesSrc)) {
    if (f.endsWith('.json')) {
      copyFileSync(resolve(examplesSrc, f), resolve(publicDir, 'examples', f))
    }
  }
}

export default defineConfig({
  plugins: [react()],
})
