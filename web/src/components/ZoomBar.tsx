interface ZoomBarProps {
  zoomPct: number
  onZoomIn: () => void
  onZoomOut: () => void
  onZoomReset: () => void
  onExport: () => void
}

export function ZoomBar({ zoomPct, onZoomIn, onZoomOut, onZoomReset, onExport }: ZoomBarProps) {
  return (
    <div className="panel zoombar">
      <button id="zoomOut" title="Zoom out" onClick={onZoomOut}>−</button>
      <span id="zoomPct">{zoomPct}%</span>
      <button id="zoomIn" title="Zoom in" onClick={onZoomIn}>+</button>
      <div className="divider" />
      <button id="zoomReset" title="Fit to view" onClick={onZoomReset}>Fit</button>
      <div className="divider" />
      <button id="exportPng" title="Download as PNG" onClick={onExport}>PNG</button>
    </div>
  )
}
