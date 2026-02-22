export function drawGrid(ctx, camera, gridSize, width, height) {
  ctx.strokeStyle = "rgba(0,0,0,0.06)"
  ctx.lineWidth = 1

  const size = gridSize * camera.zoom
  for (let x = (-camera.x * camera.zoom) % size; x < width; x += size) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, height)
    ctx.stroke()
  }
  for (let y = (-camera.y * camera.zoom) % size; y < height; y += size) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(width, y)
    ctx.stroke()
  }
}
