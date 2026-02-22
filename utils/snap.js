export function snap(point, gridSize, strength = 0.85) {
  const gx = Math.round(point.x / gridSize) * gridSize
  const gy = Math.round(point.y / gridSize) * gridSize

  return {
    x: point.x * (1 - strength) + gx * strength,
    y: point.y * (1 - strength) + gy * strength
  }
}
