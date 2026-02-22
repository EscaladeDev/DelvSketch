export function drawShadow(ctx, pathFn, style) {
  ctx.save()
  ctx.translate(style.offset.x, style.offset.y)
  ctx.strokeStyle = `rgba(0,0,0,${style.opacity})`
  ctx.shadowBlur = style.blur
  ctx.shadowColor = "rgba(0,0,0,1)"
  pathFn()
  ctx.stroke()
  ctx.restore()
}
