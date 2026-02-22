import { drawShadow } from "./shadow.js"

export function drawWall(ctx, camera, wall, dungeon) {
  if (wall.points.length < 2) return

  const path = () => {
    ctx.beginPath()
    wall.points.forEach((p, i) => {
      const s = camera.worldToScreen(p)
      i === 0 ? ctx.moveTo(s.x, s.y) : ctx.lineTo(s.x, s.y)
    })
  }

  if (dungeon.style.shadow.enabled) {
    drawShadow(ctx, path, dungeon.style.shadow)
  }

  ctx.strokeStyle = dungeon.style.wallColor
  ctx.lineWidth = dungeon.style.wallWidth * camera.zoom
  ctx.lineCap = "round"
  ctx.lineJoin = "round"
  path()
  ctx.stroke()
}
