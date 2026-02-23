export function drawGrid(ctx, camera, gridSize, width, height) {
  if (!gridSize || gridSize <= 0) return
  ctx.save()
  ctx.strokeStyle = "rgba(0,0,0,0.06)"
  ctx.lineWidth = 1

  const size = gridSize * camera.zoom
  if (size <= 0.0001) { ctx.restore(); return }

  // Anchor grid to world origin so pan/zoom keeps map and grid aligned.
  const origin = camera.worldToScreen({ x: 0, y: 0 })
  const mod = (n, m) => ((n % m) + m) % m
  const x0 = mod(origin.x, size)
  const y0 = mod(origin.y, size)

  for (let x = x0; x < width + size; x += size) {
    const sx = Math.round(x) + 0.5
    ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, height); ctx.stroke()
  }
  for (let y = y0; y < height + size; y += size) {
    const sy = Math.round(y) + 0.5
    ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(width, sy); ctx.stroke()
  }
  ctx.restore()
}
