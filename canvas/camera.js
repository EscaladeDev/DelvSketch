export class Camera {
  constructor() {
    this.x = 0
    this.y = 0
    this.zoom = 1
    this.minZoom = 0.35
    this.maxZoom = 3.0
  }

  clampZoom(z) {
    return Math.max(this.minZoom, Math.min(this.maxZoom, z))
  }

  worldToScreen(p) {
    return {
      x: (p.x + this.x) * this.zoom,
      y: (p.y + this.y) * this.zoom
    }
  }

  screenToWorld(p) {
    return {
      x: p.x / this.zoom - this.x,
      y: p.y / this.zoom - this.y
    }
  }
}
