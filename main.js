import { Dungeon } from "./model/dungeon.js"
import { Wall } from "./model/elements.js"
import { Camera } from "./canvas/camera.js"
import { drawGrid } from "./canvas/grid.js"
import { drawWall } from "./canvas/wall.js"
import { snap } from "./utils/snap.js"

const canvas = document.querySelector("canvas")
const ctx = canvas.getContext("2d", { alpha: true })
const dungeon = new Dungeon()
const camera = new Camera()

// --- UI hooks
const btnFinish = document.getElementById("btnFinish")
const btnUndo = document.getElementById("btnUndo")
const btnRedo = document.getElementById("btnRedo")
const btnClear = document.getElementById("btnClear")
const btnExport = document.getElementById("btnExport")

const wallWidth = document.getElementById("wallWidth")
const shadowOn = document.getElementById("shadowOn")
const shadowOpacity = document.getElementById("shadowOpacity")
const shadowBlur = document.getElementById("shadowBlur")
const shadowOffset = document.getElementById("shadowOffset")
const snapStrength = document.getElementById("snapStrength")

// --- state
let currentWall = null

// undo/redo as snapshots (simple + safe for MVP)
const undoStack = []
const redoStack = []
function snapshot() {
  return JSON.stringify({
    gridSize: dungeon.gridSize,
    walls: dungeon.walls.map(w => ({ points: w.points.map(p => ({x:p.x,y:p.y})) })),
    style: dungeon.style
  })
}
function restore(jsonStr) {
  const data = JSON.parse(jsonStr)
  dungeon.gridSize = data.gridSize
  dungeon.style = data.style
  dungeon.walls = data.walls.map(w => new Wall(w.points))
  currentWall = null
}
function pushUndo() {
  undoStack.push(snapshot())
  if (undoStack.length > 200) undoStack.shift()
  redoStack.length = 0
}
function undo() {
  if (!undoStack.length) return
  redoStack.push(snapshot())
  restore(undoStack.pop())
}
function redo() {
  if (!redoStack.length) return
  undoStack.push(snapshot())
  restore(redoStack.pop())
}

btnUndo.addEventListener("click", () => undo())
btnRedo.addEventListener("click", () => redo())
btnClear.addEventListener("click", () => {
  pushUndo()
  dungeon.walls = []
  currentWall = null
})
btnFinish.addEventListener("click", () => { currentWall = null })
btnExport.addEventListener("click", () => exportPNG())

// style controls
wallWidth.addEventListener("input", () => dungeon.style.wallWidth = Number(wallWidth.value))
shadowOn.addEventListener("change", () => dungeon.style.shadow.enabled = shadowOn.checked)
shadowOpacity.addEventListener("input", () => dungeon.style.shadow.opacity = Number(shadowOpacity.value))
shadowBlur.addEventListener("input", () => dungeon.style.shadow.blur = Number(shadowBlur.value))
shadowOffset.addEventListener("input", () => {
  const v = Number(shadowOffset.value)
  dungeon.style.shadow.offset = { x: v, y: v }
})
snapStrength.addEventListener("input", () => dungeon.style.snapStrength = Number(snapStrength.value))

// --- helpers
function getPointerPos(e) {
  const rect = canvas.getBoundingClientRect()
  return { x: e.clientX - rect.left, y: e.clientY - rect.top }
}
function addPointFromScreen(screenPt) {
  const world = camera.screenToWorld(screenPt)
  const snapped = snap(world, dungeon.gridSize, dungeon.style.snapStrength)
  if (!currentWall) {
    pushUndo()
    currentWall = new Wall([snapped])
    dungeon.walls.push(currentWall)
  } else {
    pushUndo()
    currentWall.points.push(snapped)
  }
}

function removeLastPoint() {
  if (!currentWall || currentWall.points.length === 0) return
  pushUndo()
  currentWall.points.pop()
  if (currentWall.points.length < 2) {
    // if wall became too short, remove it entirely
    const idx = dungeon.walls.indexOf(currentWall)
    if (idx >= 0) dungeon.walls.splice(idx, 1)
    currentWall = null
  }
}

function exportPNG() {
  // Render at current resolution (simple MVP)
  const a = document.createElement("a")
  a.download = "dungeon.png"
  a.href = canvas.toDataURL("image/png")
  a.click()
}

// --- iPad-friendly input via Pointer Events + gestures
const pointers = new Map() // pointerId -> {x,y}
let gesture = null
let longPressTimer = null
let lastTapTime = 0
let lastTapPos = null

function startLongPress() {
  clearLongPress()
  longPressTimer = setTimeout(() => {
    // long press removes last point
    removeLastPoint()
    longPressTimer = null
  }, 450)
}
function clearLongPress() {
  if (longPressTimer) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }
}

canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId)
  pointers.set(e.pointerId, getPointerPos(e))

  // If a second pointer arrives, enter gesture mode
  if (pointers.size === 2) {
    clearLongPress()
    const [a, b] = Array.from(pointers.values())
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    const dist = Math.hypot(a.x - b.x, a.y - b.y)
    gesture = {
      startMid: mid,
      startDist: dist,
      startCam: { x: camera.x, y: camera.y, zoom: camera.zoom },
      startWorldMid: camera.screenToWorld(mid)
    }
    return
  }

  // Single pointer: prepare for tap/long-press
  if (pointers.size === 1) {
    startLongPress()
  }
})

canvas.addEventListener("pointermove", (e) => {
  if (!pointers.has(e.pointerId)) return
  const pos = getPointerPos(e)
  pointers.set(e.pointerId, pos)

  // if gesture (two-finger): pan + pinch zoom
  if (gesture && pointers.size === 2) {
    clearLongPress()
    const [a, b] = Array.from(pointers.values())
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    const dist = Math.hypot(a.x - b.x, a.y - b.y)

    // zoom around the midpoint (world-anchored)
    const zoomFactor = dist / gesture.startDist
    const newZoom = camera.clampZoom(gesture.startCam.zoom * zoomFactor)
    camera.zoom = newZoom

    // keep world point under midpoint stable
    const worldMidNow = camera.screenToWorld(mid)
    const dx = (gesture.startWorldMid.x - worldMidNow.x)
    const dy = (gesture.startWorldMid.y - worldMidNow.y)
    camera.x += dx
    camera.y += dy

    // also allow slight pan via midpoint drift (already largely handled by anchoring)
    return
  }

  // single pointer move: cancel long press if they move much
  if (pointers.size === 1) {
    const p0 = pointers.get(e.pointerId)
    // movement threshold
    if (p0) {
      // If moving, cancel long press; user likely intends pan with one finger (we keep drawing tap-only to stay clean)
      // This keeps accidental long-presses low.
      // (You can add one-finger pan later if you want)
      const start = p0
      // no-op; we don't track start delta in this MVP
    }
  }
})

canvas.addEventListener("pointerup", (e) => {
  clearLongPress()

  // tap detection only when it was a single-pointer interaction (no gesture)
  const wasGesture = !!gesture || pointers.size > 1
  pointers.delete(e.pointerId)

  if (gesture && pointers.size < 2) {
    gesture = null
    return
  }

  if (!wasGesture) {
    const now = performance.now()
    const pos = getPointerPos(e)

    // double-tap to finish
    const isNearLast = lastTapPos
      ? Math.hypot(pos.x - lastTapPos.x, pos.y - lastTapPos.y) < 22
      : true
    const isDoubleTap = (now - lastTapTime) < 320 && isNearLast

    if (isDoubleTap) {
      currentWall = null
    } else {
      addPointFromScreen(pos)
    }

    lastTapTime = now
    lastTapPos = pos
  }
})

canvas.addEventListener("pointercancel", (e) => {
  clearLongPress()
  pointers.delete(e.pointerId)
  if (pointers.size < 2) gesture = null
})

// --- resize
function resize() {
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1))
  canvas.width = Math.floor(window.innerWidth * dpr)
  canvas.height = Math.floor(window.innerHeight * dpr)
  canvas.style.width = window.innerWidth + "px"
  canvas.style.height = window.innerHeight + "px"
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0) // draw in CSS pixels
}
window.addEventListener("resize", resize)
resize()

// --- render loop
function loop() {
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
  drawGrid(ctx, camera, dungeon.gridSize, window.innerWidth, window.innerHeight)
  dungeon.walls.forEach(w => drawWall(ctx, camera, w, dungeon))
  requestAnimationFrame(loop)
}
loop()
