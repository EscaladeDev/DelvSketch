export class Dungeon {
  constructor() {
    this.gridSize = 32
    this.walls = []
    this.style = {
      wallColor: "#1f2933",
      wallWidth: 6,
      shadow: {
        enabled: true,
        offset: { x: 4, y: 4 },
        blur: 8,
        opacity: 0.28
      },
      snapStrength: 0.85
    }
  }
}
