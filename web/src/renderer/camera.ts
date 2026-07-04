import type { ContentBox } from './types'

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export class CameraController {
  x = 0
  y = 0
  zoom = 1
  onZoomChange: ((pct: number) => void) | null = null

  private _vw = () => window.innerWidth
  private _vh = () => window.innerHeight

  zoomIn() { this.zoomAbout(this._vw() / 2, this._vh() / 2, 1.2) }
  zoomOut() { this.zoomAbout(this._vw() / 2, this._vh() / 2, 1 / 1.2) }

  resetView(box: ContentBox) {
    const pad = 160
    const z = clamp(Math.min((this._vw() - pad) / box.w, (this._vh() - pad) / box.h), 0.2, 5)
    this.zoom = z
    this.x = (this._vw() - box.w * z) / 2 - box.x * z
    this.y = (this._vh() - box.h * z) / 2 - box.y * z
    this.onZoomChange?.(Math.round(z * 100))
  }

  zoomAbout(cx: number, cy: number, factor: number) {
    const wx = (cx - this.x) / this.zoom
    const wy = (cy - this.y) / this.zoom
    this.zoom = clamp(this.zoom * factor, 0.2, 5)
    this.x = cx - wx * this.zoom
    this.y = cy - wy * this.zoom
    this.onZoomChange?.(Math.round(this.zoom * 100))
  }

  worldX(screenX: number) { return (screenX - this.x) / this.zoom }
  worldY(screenY: number) { return (screenY - this.y) / this.zoom }
}
