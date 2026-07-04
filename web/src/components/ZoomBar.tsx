interface ZoomBarProps {
  zoomPct: number
  onZoomIn: () => void
  onZoomOut: () => void
  onZoomReset: () => void
}

export function ZoomBar({ zoomPct, onZoomIn, onZoomOut, onZoomReset }: ZoomBarProps) {
  return (
    <div className="panel zoombar">
      <button id="zoomOut" title="Zoom out" onClick={onZoomOut}>−</button>
      <span id="zoomPct">{zoomPct}%</span>
      <button id="zoomIn" title="Zoom in" onClick={onZoomIn}>+</button>
      <div className="divider" />
      <button id="zoomReset" title="Fit to view" onClick={onZoomReset}>Fit</button>
    </div>
  )
}
