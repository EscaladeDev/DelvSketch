export class Dungeon {
  constructor() {
    this.gridSize = 32
    this.subSnapDiv = 4 // invisible snap grid = gridSize / subSnapDiv
    this.spaces = []        // {id, polygon: [{x,y}...]}
    this.paths = []         // {id, points:[{x,y}...]}
    this.shapes = []        // {id, kind:'regular', sides, center, radius, rotation, mode:'add'|'subtract'}
    this.style = {
      // floorColor is the canonical interior fill color. `paper` is kept as a
      // legacy alias for compatibility with older saved maps.
      floorColor: "#ffffff",
      paper: "#ffffff",
      backgroundColor: "#f8f7f4",
      transparentBackground: false,
      wallColor: "#1f2933",
      wallWidth: 6,
      corridorWidth: 48,
      shadow: { enabled: true, color: "#000000", length: 18, opacity: 0.34, dir: {x: 0.707, y: 0.707}, maxLen: 48 },
      hatch: { enabled: true, color: "#1f2933", density: 0.5, opacity: 1, depth: 12, inset: 2, angleRange: 1.15, minLen: 10, maxLen: 30 },
      snapStrength: 0.95,
      msStep: 4,
      polySides: 6
    }
  }
}
