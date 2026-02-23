import { lerp } from "./math.js"
export function snapHard(point, gridSize) {
  return { x: Math.round(point.x / gridSize) * gridSize, y: Math.round(point.y / gridSize) * gridSize }
}
export function snapSoft(point, gridSize, strength = 0.95) {
  const hard = snapHard(point, gridSize)
  return lerp(point, hard, strength)
}
