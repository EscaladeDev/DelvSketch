const __gridTmp = { canvas: null }

function ensureGridCanvas(w, h) {
  if (!__gridTmp.canvas) __gridTmp.canvas = document.createElement("canvas")
  const c = __gridTmp.canvas
  if (c.width !== w || c.height !== h) {
    c.width = w
    c.height = h
  }
  return c
}

export function drawGrid(ctx, camera, gridSize, width, height, lineWidth = 1, opacity = 0.06, lineWidthScale = 1) {
  if (!gridSize || gridSize <= 0) return
  const opacityNum = Number(opacity)
  const safeOpacity = Math.max(0, Math.min(1, Number.isFinite(opacityNum) ? opacityNum : 0.06))
  const lineWidthNum = Number(lineWidth)
  const lineWidthScaleNum = Number(lineWidthScale)
  const safeLineWidth = Math.max(0.5, (Number.isFinite(lineWidthNum) ? lineWidthNum : 1) * Math.max(0.1, Number.isFinite(lineWidthScaleNum) ? lineWidthScaleNum : 1))
  if (safeOpacity <= 0) return

  const size = gridSize * camera.zoom
  if (size <= 0.0001) return

  const gridCanvas = ensureGridCanvas(width, height)
  const gctx = gridCanvas.getContext("2d")
  gctx.clearRect(0, 0, width, height)
  gctx.fillStyle = "rgba(0,0,0,1)"

  // Anchor grid to world origin so pan/zoom keeps map and grid aligned.
  const origin = camera.worldToScreen({ x: 0, y: 0 })
  const mod = (n, m) => ((n % m) + m) % m
  const x0 = mod(origin.x, size)
  const y0 = mod(origin.y, size)

  const crispOnePx = safeLineWidth <= 1.05
  const halfW = safeLineWidth / 2

  for (let x = x0; x < width + size; x += size) {
    const sx = crispOnePx ? (Math.round(x) + 0.5) : x
    const left = crispOnePx ? (sx - 0.5) : (sx - halfW)
    gctx.fillRect(left, 0, Math.max(1, safeLineWidth), height)
  }
  for (let y = y0; y < height + size; y += size) {
    const sy = crispOnePx ? (Math.round(y) + 0.5) : y
    const top = crispOnePx ? (sy - 0.5) : (sy - halfW)
    gctx.fillRect(0, top, width, Math.max(1, safeLineWidth))
  }

  ctx.save()
  ctx.globalAlpha = safeOpacity
  ctx.drawImage(gridCanvas, 0, 0)
  ctx.restore()
}
