import { Dungeon } from "./model/dungeon.js"
import { Camera } from "./canvas/camera.js"
import { drawGrid } from "./canvas/grid.js"
import { snapHard, snapSoft } from "./utils/snap.js"
import { dist, norm, rotate } from "./utils/math.js"
import { compileWorldCache, drawCompiledBase } from "./canvas/render.js"

const canvas = document.querySelector("canvas")
const ctx = canvas.getContext("2d", { alpha: true })
const dungeon = new Dungeon()
const camera = new Camera()

const maskCanvas = document.createElement("canvas")
const maskCtx = maskCanvas.getContext("2d", { willReadFrequently: true })
let W=0, H=0

let compiledCache = null
let compiledSig = ""

// Global edit ordering across ALL tool types (rectangle/path/free/polygon).
// This lets subtracts apply correctly no matter which tool created the geometry.
let editSeqCounter = 1
function nextEditSeq(){ return editSeqCounter++ }
function normalizeEditSequences(){
  const all = [
    ...(Array.isArray(dungeon.spaces) ? dungeon.spaces : []),
    ...(Array.isArray(dungeon.paths) ? dungeon.paths : []),
    ...(Array.isArray(dungeon.shapes) ? dungeon.shapes : [])
  ]
  let fallback = 1
  for (const item of all){
    if (!item || !Number.isFinite(Number(item.seq))) item.seq = fallback++
  }
  refreshEditSeqCounter()
}
function refreshEditSeqCounter(){
  let maxSeq = 0
  for (const arr of [dungeon.spaces, dungeon.paths, dungeon.shapes]){
    for (const item of (arr || [])){
      const s = Number(item && item.seq)
      if (Number.isFinite(s) && s > maxSeq) maxSeq = s
    }
  }
  editSeqCounter = Math.max(1, Math.floor(maxSeq) + 1)
}
function resetTransientDrafts(){
  draft = null
  draftRect = null
  freeDraw = null
  draftShape = null
  shapeDrag = null
  eraseStroke = null
}
function clearPropSelection(){
  selectedPropId = null
  propTransformDrag = null
}

// Tools
const toolButtons = Array.from(document.querySelectorAll("button.tool"))
let tool = "space"
let underMode = false
function syncToolUI(){
  toolButtons.forEach(b => {
    const isEraseBtn = b.dataset.tool === "erase"
    const active = isEraseBtn ? !!underMode : (b.dataset.tool === tool)
    b.classList.toggle("primary", active)
  })
  if (polyToolOptions) polyToolOptions.classList.toggle("hidden", tool !== "poly")
}
function setTool(t){
  if (t === "erase") {
    // Erase is a toggle over the current drawing tool, but it is still a non-select interaction.
    clearPropSelection()
    underMode = !underMode
    syncUnderUI()
    syncToolUI()
    return
  }
  if (t !== tool) {
    resetTransientDrafts() // clear path/free/rect/poly previews when switching tools
    selectedShapeId = null
    if (t !== "select") { clearPropSelection(); selectedTextId = null; syncTextPanelVisibility() }
  } else if (t !== "select") {
    clearPropSelection()
    selectedTextId = null
    syncTextPanelVisibility()
  }
  tool = t
  syncToolUI()
}
function syncUnderUI(){ if (btnUnder) btnUnder.classList.toggle("primary", !!underMode); syncToolUI() }
toolButtons.forEach(b => b.addEventListener("click", () => { selectedShapeId=null; selectedPropId=null; selectedTextId=null; syncTextPanelVisibility(); setTool(b.dataset.tool) }))
if (tool === "erase") tool = "space"

const btnUnder = document.getElementById("btnUnder")
const btnFinish = document.getElementById("btnFinish")
const btnUndo = document.getElementById("btnUndo")
const btnRedo = document.getElementById("btnRedo")
const btnClear = document.getElementById("btnClear")
const btnSaveMap = document.getElementById("btnSaveMap")
const btnLoadMap = document.getElementById("btnLoadMap")
const fileLoadMap = document.getElementById("fileLoadMap")
const btnPropsPick = document.getElementById("btnPropsPick")
const btnPropsClear = document.getElementById("btnPropsClear")
const btnPropsDefaults = document.getElementById("btnPropsDefaults")
const propsFolderInput = document.getElementById("propsFolderInput")
const propsShelf = document.getElementById("propsShelf")
const tabStyleBtn = document.getElementById("tabStyleBtn")
const tabAssetsBtn = document.getElementById("tabAssetsBtn")
const leftDrawer = document.getElementById("leftDrawer")
const btnDrawerToggle = document.getElementById("btnDrawerToggle")
const btnDrawerCollapse = document.getElementById("btnDrawerCollapse")
const drawerPeekTab = document.getElementById("drawerPeekTab")
const hudRoot = document.querySelector(".hud.appShellHud")
const panelTabButtons = Array.from(document.querySelectorAll("[data-panel-tab]"))
const panelPages = Array.from(document.querySelectorAll("[data-panel-page]"))
const btnExport = document.getElementById("btnExport")
const btnPDF = document.getElementById("btnPDF")
const pdfExportModal = document.getElementById("pdfExportModal")
const pdfExportSummary = document.getElementById("pdfExportSummary")
const btnPdfModalClose = document.getElementById("btnPdfModalClose")
const btnPdfCancel = document.getElementById("btnPdfCancel")
const btnPdfConfirm = document.getElementById("btnPdfConfirm")
const pdfModeInput = document.getElementById("pdfMode")
const pdfPaperInput = document.getElementById("pdfPaper")
const pdfOrientationInput = document.getElementById("pdfOrientation")
const pdfSourceInput = document.getElementById("pdfSource")
const pdfPaddingSquaresInput = document.getElementById("pdfPaddingSquares")
const pdfMarginInInput = document.getElementById("pdfMarginIn")
const pdfRasterDpiInput = document.getElementById("pdfRasterDpi")
const pdfRasterDpiOut = document.getElementById("pdfRasterDpiOut")
const pdfSquareSizeInInput = document.getElementById("pdfSquareSizeIn")
const pdfOverlapSquaresInput = document.getElementById("pdfOverlapSquares")
const pdfLabelsInput = document.getElementById("pdfLabels")
const pdfTrimMarksInput = document.getElementById("pdfTrimMarks")
const pdfOverviewInput = document.getElementById("pdfOverview")
const pdfIncludeEmptyTilesInput = document.getElementById("pdfIncludeEmptyTiles")
const pdfTiledSection = document.getElementById("pdfTiledSection")

// controls
const gridSize = document.getElementById("gridSize")
const corridorWidth = document.getElementById("corridorWidth")
const wallWidth = document.getElementById("wallWidth")
const wallColor = document.getElementById("wallColor")
const floorColor = document.getElementById("floorColor")
const backgroundColor = document.getElementById("backgroundColor")
const transparentBg = document.getElementById("transparentBg")
const polyToolOptions = document.getElementById("polyToolOptions")
const polySides = document.getElementById("polySides")
const polySidesOut = document.getElementById("polySidesOut")
const snapDiv = document.getElementById("snapDiv")
const snapDivOut = document.getElementById("snapDivOut")
const darkModeUi = document.getElementById("darkModeUi")
const btnThemeMode = document.getElementById("btnThemeMode")
const themeColorMeta = document.querySelector('meta[name="theme-color"]')
const shadowOn = document.getElementById("shadowOn")
const shadowOpacity = document.getElementById("shadowOpacity")
const shadowColor = document.getElementById("shadowColor")
const hatchOn = document.getElementById("hatchOn")
const hatchDensity = document.getElementById("hatchDensity")
const hatchOpacity = document.getElementById("hatchOpacity")
const hatchColor = document.getElementById("hatchColor")
const hatchDepth = document.getElementById("hatchDepth")
const snapStrength = document.getElementById("snapStrength")
const propSnapToggle = document.getElementById("propSnapToggle")
const showTextPreview = document.getElementById("showTextPreview")
const showTextExport = document.getElementById("showTextExport")
const styleRenderGeneral = document.getElementById("styleRenderGeneral")
const textStylePanel = document.getElementById("textStylePanel")
const textContentInput = document.getElementById("textContentInput")
const textFontFamily = document.getElementById("textFontFamily")
const textFontSize = document.getElementById("textFontSize")
const textFontSizeOut = document.getElementById("textFontSizeOut")
const textColorInput = document.getElementById("textColorInput")
const textShowInPreview = document.getElementById("textShowInPreview")
const textShowInExport = document.getElementById("textShowInExport")
const textEditOverlay = document.getElementById("textEditOverlay")
const textCanvasEditor = document.getElementById("textCanvasEditor")
const googleFontFamilyInput = document.getElementById("googleFontFamilyInput")
const btnLoadGoogleFont = document.getElementById("btnLoadGoogleFont")
const googleFontStatus = document.getElementById("googleFontStatus")
const googleFontRecent = document.getElementById("googleFontRecent")

// Shadow puck
const puck = document.getElementById("shadowPuck")
const pctx = puck.getContext("2d")
const puckSize = 120
const C = { x: puckSize/2, y: puckSize/2 }
const R = 50

const UI_THEME_KEY = "dungeonSketch.uiTheme"

function getPreferredTheme(){
  try {
    const saved = localStorage.getItem(UI_THEME_KEY)
    if (saved === "dark" || saved === "light") return saved
  } catch {}
  try {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  } catch {}
  return "light"
}

function applyUiTheme(theme){
  const next = theme === "dark" ? "dark" : "light"
  document.body.dataset.theme = next
  if (darkModeUi) darkModeUi.checked = next === "dark"
  if (btnThemeMode) btnThemeMode.textContent = next === "dark" ? "Day" : "Night"
  if (themeColorMeta) themeColorMeta.setAttribute("content", next === "dark" ? "#14181f" : "#f8f7f4")
  try { localStorage.setItem(UI_THEME_KEY, next) } catch {}
}

function toggleUiTheme(){
  applyUiTheme((document.body.dataset.theme || "light") === "dark" ? "light" : "dark")
}

function updateHistoryButtons(){
  const canUndo = undoStack.length > 0
  const canRedo = redoStack.length > 0
  if (btnUndo){ btnUndo.disabled = !canUndo; btnUndo.setAttribute("aria-disabled", String(!canUndo)) }
  if (btnRedo){ btnRedo.disabled = !canRedo; btnRedo.setAttribute("aria-disabled", String(!canRedo)) }
}

function drawPuck(){
  pctx.clearRect(0,0,puckSize,puckSize)
  pctx.strokeStyle = "rgba(0,0,0,0.16)"
  pctx.lineWidth = 2
  pctx.beginPath(); pctx.arc(C.x, C.y, R, 0, Math.PI*2); pctx.stroke()
  pctx.strokeStyle = "rgba(0,0,0,0.06)"
  pctx.lineWidth = 1
  pctx.beginPath(); pctx.moveTo(C.x-R, C.y); pctx.lineTo(C.x+R, C.y); pctx.stroke()
  pctx.beginPath(); pctx.moveTo(C.x, C.y-R); pctx.lineTo(C.x, C.y+R); pctx.stroke()

  const maxLen = dungeon.style.shadow.maxLen
  const lenPx = Math.min(maxLen, Math.max(0, dungeon.style.shadow.length))
  const r = (lenPx / maxLen) * R
  const d = dungeon.style.shadow.dir
  const dx = d.x * r, dy = d.y * r

  pctx.fillStyle = "rgba(20,25,30,0.90)"
  pctx.beginPath(); pctx.arc(C.x + dx, C.y + dy, 6, 0, Math.PI*2); pctx.fill()
}

function updateShadowFromPuck(e){
  const rect = puck.getBoundingClientRect()
  let x = e.clientX - rect.left - C.x
  let y = e.clientY - rect.top  - C.y
  let d = Math.hypot(x,y)
  if (d > R) { x *= R/d; y *= R/d; d = R }

  const maxLen = dungeon.style.shadow.maxLen
  const lenPx = (d / R) * maxLen
  const dir = d < 0.001 ? {x: 0, y: 0} : norm({x: x, y: y})
  dungeon.style.shadow.dir = dir
  dungeon.style.shadow.length = lenPx
  drawPuck()
}
puck.addEventListener("pointerdown", (e)=>{ puck.setPointerCapture(e.pointerId); updateShadowFromPuck(e) })
puck.addEventListener("pointermove", (e)=>{ if (e.buttons) updateShadowFromPuck(e) })

function syncUI(){
  gridSize.value = dungeon.gridSize
  corridorWidth.value = dungeon.style.corridorWidth
  wallWidth.value = dungeon.style.wallWidth
  if (wallColor) wallColor.value = dungeon.style.wallColor || "#1f2933"
  if (floorColor) floorColor.value = dungeon.style.floorColor || dungeon.style.paper || "#ffffff"
  if (backgroundColor) backgroundColor.value = dungeon.style.backgroundColor || "#f8f7f4"
  if (transparentBg) transparentBg.checked = !!dungeon.style.transparentBackground
  if (polySides) polySides.value = Math.max(3, Math.min(12, Math.round(Number(dungeon.style.polySides || 6))))
  if (polySidesOut) polySidesOut.textContent = String(Math.max(3, Math.min(12, Math.round(Number(dungeon.style.polySides || 6)))))
  if (snapDiv) snapDiv.value = String(Math.max(1, Math.min(8, Math.round(Number(dungeon.subSnapDiv || 4)))))
  if (snapDivOut) snapDivOut.textContent = String(Math.max(1, Math.min(8, Math.round(Number(dungeon.subSnapDiv || 4)))))
  shadowOn.checked = dungeon.style.shadow.enabled
  shadowOpacity.value = dungeon.style.shadow.opacity
  if (shadowColor) shadowColor.value = dungeon.style.shadow.color || "#000000"
  hatchOn.checked = dungeon.style.hatch.enabled
  hatchDensity.value = Math.max(0.25, Number(dungeon.style.hatch.density) || 0.25)
  hatchOpacity.value = dungeon.style.hatch.opacity
  if (hatchColor) hatchColor.value = dungeon.style.hatch.color || "#1f2933"
  hatchDepth.value = dungeon.style.hatch.depth
  if (typeof dungeon.style.propSnapEnabled !== "boolean") dungeon.style.propSnapEnabled = true
  if (propSnapToggle) propSnapToggle.checked = !!dungeon.style.propSnapEnabled
  if (typeof dungeon.style.showTextPreview !== "boolean") dungeon.style.showTextPreview = true
  if (typeof dungeon.style.showTextExport !== "boolean") dungeon.style.showTextExport = true
  if (showTextPreview) showTextPreview.checked = !!dungeon.style.showTextPreview
  if (showTextExport) showTextExport.checked = !!dungeon.style.showTextExport
  snapStrength.value = dungeon.style.snapStrength
  drawPuck()
  syncUnderUI()
  syncToolUI()
}
syncUI()
syncTextPanelVisibility()
renderRecentGoogleFonts()
applyUiTheme(getPreferredTheme())

gridSize.addEventListener("input", () => dungeon.gridSize = Number(gridSize.value))
corridorWidth.addEventListener("input", () => dungeon.style.corridorWidth = Number(corridorWidth.value))
wallWidth.addEventListener("input", () => dungeon.style.wallWidth = Number(wallWidth.value))
if (wallColor) wallColor.addEventListener("input", () => dungeon.style.wallColor = wallColor.value)
if (floorColor) {
  const applyFloorColor = () => {
    dungeon.style.floorColor = floorColor.value
    dungeon.style.paper = floorColor.value // legacy alias for older save/export paths
  }
  floorColor.addEventListener("input", applyFloorColor)
  floorColor.addEventListener("change", applyFloorColor)
}
if (backgroundColor) backgroundColor.addEventListener("input", () => dungeon.style.backgroundColor = backgroundColor.value)
if (transparentBg) transparentBg.addEventListener("change", () => dungeon.style.transparentBackground = !!transparentBg.checked)
if (darkModeUi) darkModeUi.addEventListener("change", () => applyUiTheme(darkModeUi.checked ? "dark" : "light"))
if (btnThemeMode) btnThemeMode.addEventListener("click", toggleUiTheme)

if (snapDiv) snapDiv.addEventListener("input", () => {
  const v = Math.max(1, Math.min(8, Math.round(Number(snapDiv.value) || 4)))
  dungeon.subSnapDiv = v
  if (snapDivOut) snapDivOut.textContent = String(v)
})
function getPolySidesValue(){
  const n = Math.round(Number((polySides && polySides.value) || dungeon.style.polySides || 6))
  return Math.max(3, Math.min(12, Number.isFinite(n) ? n : 6))
}
if (polySides) {
  polySides.addEventListener("input", () => {
    const s = getPolySidesValue()
    dungeon.style.polySides = s
    if (polySidesOut) polySidesOut.textContent = String(s)
    if (selectedShapeId){
      const sh = dungeon.shapes.find(v => v.id === selectedShapeId)
      if (sh && sh.kind === "regular") sh.sides = s
    }
  })
}
shadowOn.addEventListener("change", () => dungeon.style.shadow.enabled = shadowOn.checked)
shadowOpacity.addEventListener("input", () => dungeon.style.shadow.opacity = Number(shadowOpacity.value))
if (shadowColor) shadowColor.addEventListener("input", () => dungeon.style.shadow.color = shadowColor.value)
hatchOn.addEventListener("change", () => dungeon.style.hatch.enabled = hatchOn.checked)
hatchDensity.addEventListener("input", () => dungeon.style.hatch.density = Math.max(0.25, Number(hatchDensity.value) || 0.25))
hatchOpacity.addEventListener("input", () => dungeon.style.hatch.opacity = Number(hatchOpacity.value))
if (hatchColor) hatchColor.addEventListener("input", () => dungeon.style.hatch.color = hatchColor.value)
hatchDepth.addEventListener("input", () => dungeon.style.hatch.depth = Number(hatchDepth.value))
snapStrength.addEventListener("input", () => dungeon.style.snapStrength = Number(snapStrength.value))
if (propSnapToggle) propSnapToggle.addEventListener("change", () => { dungeon.style.propSnapEnabled = !!propSnapToggle.checked })
if (showTextPreview) showTextPreview.addEventListener("change", () => { dungeon.style.showTextPreview = !!showTextPreview.checked; if (!isTextPreviewGloballyVisible()) { selectedTextId = null; if (textDrag && textDrag.pushedUndo && !textDrag.changed) undoStack.pop(); textDrag = null; cancelActiveTextEditor(); syncTextPanelVisibility(); } })
if (showTextExport) showTextExport.addEventListener("change", () => { dungeon.style.showTextExport = !!showTextExport.checked })

if (textContentInput) textContentInput.addEventListener('input', () => { const t = getSelectedText(); if (t) { t.text = textContentInput.value; if (textEditorState && textEditorState.id === t.id && textCanvasEditor && document.activeElement !== textCanvasEditor) textCanvasEditor.value = t.text; if (textEditorState && textEditorState.id === t.id) positionTextEditorOverlayForText(t) } })
if (textFontFamily) textFontFamily.addEventListener('change', async () => { const t = getSelectedText(); if (!t) return; const nextFont = textFontFamily.value; if (!hasFontOption(nextFont) && nextFont) { await loadGoogleFontFamily(nextFont) } t.fontFamily = nextFont; if (googleFontFamilyInput && !['Minecraft Five','system-ui','serif','monospace'].includes(nextFont)) googleFontFamilyInput.value = nextFont; if (textEditorState && textEditorState.id === t.id) positionTextEditorOverlayForText(t) })
if (textFontSize) textFontSize.addEventListener('input', () => { const t = getSelectedText(); const v = Math.max(8, Math.min(144, Math.round(Number(textFontSize.value)||20))); if (t) { t.fontSize = v; if (textEditorState && textEditorState.id === t.id) positionTextEditorOverlayForText(t) } if (textFontSizeOut) textFontSizeOut.textContent = String(v) })
if (textColorInput) textColorInput.addEventListener('input', () => { const t = getSelectedText(); if (!t) return; t.color = textColorInput.value || '#1f2933'; if (textCanvasEditor && textEditorState && textEditorState.id === t.id) textCanvasEditor.style.color = t.color })
if (btnLoadGoogleFont) btnLoadGoogleFont.addEventListener('click', async () => { const family = (googleFontFamilyInput && googleFontFamilyInput.value) || ''; if (!normalizeGoogleFontFamilyName(family)) return; if (!textEditorState) pushUndo(); await applyGoogleFontToSelectedText(family) })
if (googleFontFamilyInput) googleFontFamilyInput.addEventListener('keydown', async (e) => { if (e.key !== 'Enter') return; e.preventDefault(); const family = googleFontFamilyInput.value || ''; if (!normalizeGoogleFontFamilyName(family)) return; if (!textEditorState) pushUndo(); await applyGoogleFontToSelectedText(family) })
if (googleFontFamilyInput) googleFontFamilyInput.addEventListener('change', async () => { const family = normalizeGoogleFontFamilyName(googleFontFamilyInput.value); if (!family || !getSelectedText()) return; await applyGoogleFontToSelectedText(family) })
if (googleFontFamilyInput) googleFontFamilyInput.addEventListener('blur', () => { if (googleFontFamilyInput.value) googleFontFamilyInput.value = normalizeGoogleFontFamilyName(googleFontFamilyInput.value) })

if (textCanvasEditor) {
  textCanvasEditor.addEventListener('input', () => {
    const t = getSelectedText()
    if (!t) return
    t.text = textCanvasEditor.value
    if (textContentInput && document.activeElement !== textContentInput) textContentInput.value = textCanvasEditor.value
    positionTextEditorOverlayForText(t)
  })
  textCanvasEditor.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitActiveTextEditor() }
    else if (e.key === 'Escape') { e.preventDefault(); cancelActiveTextEditor() }
  })
  textCanvasEditor.addEventListener('blur', () => {
    if (!textEditorState) return
    // Commit on blur for a natural editor feel
    commitActiveTextEditor()
  })
}

// undo/redo
const undoStack=[], redoStack=[]
updateHistoryButtons()
function snapshot(){ return JSON.stringify({ gridSize:dungeon.gridSize, subSnapDiv:dungeon.subSnapDiv, spaces:dungeon.spaces, paths:dungeon.paths, shapes:dungeon.shapes, style:dungeon.style, placedProps, placedTexts, selectedPropId, selectedTextId }) }
function restore(s){
  const d = JSON.parse(s)
  // Backward compatible: restore either plain dungeon snapshot or wrapped save object.
  if (d && (d.dungeon || d.camera)) { applyLoadedMapObject(d); return }
  setDungeonFromObject(d)
  placedProps = Array.isArray(d.placedProps) ? d.placedProps.map(p => ({
    id: String(p?.id || ((typeof globalThis!=='undefined' && globalThis.crypto && globalThis.crypto.randomUUID) ? globalThis.crypto.randomUUID() : (Date.now()+Math.random()))),
    propId: (p && p.propId != null) ? String(p.propId) : undefined,
    name: String(p?.name || "Prop"),
    url: String(p?.url || ""),
    x: safeNum(p?.x, 0),
    y: safeNum(p?.y, 0),
    w: Math.max(1, safeNum(p?.w, dungeon.gridSize)),
    h: Math.max(1, safeNum(p?.h, dungeon.gridSize)),
    rot: safeNum(p?.rot, 0),
    shadowDisabled: p?.shadowDisabled === true
  })).filter(p => p.url) : placedProps
  placedTexts = Array.isArray(d.placedTexts) ? d.placedTexts.map(normalizeTextObj) : []
  draft=null; draftRect=null; freeDraw=null; draftShape=null; selectedShapeId=null; selectedPropId=null; selectedTextId=null; shapeDrag=null; propTransformDrag=null; textDrag=null; eraseStroke=null
  syncTextPanelVisibility()
  underMode = false
  syncUI()
  syncPanelTabs()
}

function safeNum(v, fallback=0){ const n = Number(v); return Number.isFinite(n) ? n : fallback }
function cloneJson(v){ return JSON.parse(JSON.stringify(v)) }

let activePanelTab = "style"
let armedPropId = null
let dragPropId = null
let selectedPropId = null
let propTransformDrag = null
let placedProps = []          // runtime-only for now (local asset URLs are session-based)
const propImageCache = new Map()
var placedTexts = []
var selectedTextId = null
var textDrag = null
let textEditorState = null
const loadedGoogleFonts = new Set()
const googleFontLoadPromises = new Map()
const googleFontLinkEls = new Map()
const GOOGLE_FONT_RECENTS_KEY = "dungeonSketch.googleFontRecents"

function normalizeGoogleFontFamilyName(raw){
  return String(raw || "").replace(/["']/g, "").replace(/\s+/g, " ").trim()
}
function setGoogleFontStatus(msg, kind=""){
  if (!googleFontStatus) return
  googleFontStatus.textContent = msg || ""
  googleFontStatus.dataset.state = kind || ""
}
function readRecentGoogleFonts(){
  try {
    const arr = JSON.parse(localStorage.getItem(GOOGLE_FONT_RECENTS_KEY) || "[]")
    return Array.isArray(arr) ? arr.filter(Boolean).map(normalizeGoogleFontFamilyName).filter(Boolean) : []
  } catch (_) { return [] }
}
function writeRecentGoogleFonts(list){ try { localStorage.setItem(GOOGLE_FONT_RECENTS_KEY, JSON.stringify((list || []).slice(0,8))) } catch (_) {} }
function pushRecentGoogleFont(name){
  const clean = normalizeGoogleFontFamilyName(name)
  if (!clean) return
  const next = [clean, ...readRecentGoogleFonts().filter(v => v !== clean)].slice(0,8)
  writeRecentGoogleFonts(next)
  renderRecentGoogleFonts()
}
function renderRecentGoogleFonts(){
  if (!googleFontRecent) return
  const recents = readRecentGoogleFonts()
  googleFontRecent.innerHTML = ''
  if (!recents.length){
    const hint = document.createElement('div')
    hint.className = 'fontRecentHint'
    hint.textContent = 'Recent Google fonts appear here'
    googleFontRecent.appendChild(hint)
    return
  }
  for (const family of recents){
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'fontChip'
    b.textContent = family
    b.title = `Apply ${family}`
    b.addEventListener('click', async () => {
      if (googleFontFamilyInput) googleFontFamilyInput.value = family
      if (!textEditorState) pushUndo()
      await applyGoogleFontToSelectedText(family)
    })
    googleFontRecent.appendChild(b)
  }
}

function isTextPreviewGloballyVisible(){ return dungeon?.style?.showTextPreview !== false }
function ensureGoogleFontLinkEl(family){
  const key = normalizeGoogleFontFamilyName(family) || '__default__'
  let link = googleFontLinkEls.get(key)
  if (link && document.head.contains(link)) return link
  link = document.createElement('link')
  link.rel = 'stylesheet'
  link.dataset.role = 'google-font-loader'
  if (key !== '__default__') link.dataset.family = key
  document.head.appendChild(link)
  googleFontLinkEls.set(key, link)
  return link
}

function waitForStylesheetLoad(link, timeoutMs=8000){
  return new Promise((resolve, reject) => {
    let done = false
    const finish = (ok, err) => {
      if (done) return
      done = true
      link.removeEventListener('load', onLoad)
      link.removeEventListener('error', onError)
      clearTimeout(timer)
      ok ? resolve(true) : reject(err || new Error('stylesheet failed'))
    }
    const onLoad = () => finish(true)
    const onError = () => finish(false, new Error('stylesheet error'))
    const timer = setTimeout(() => finish(false, new Error('stylesheet timeout')), timeoutMs)
    link.addEventListener('load', onLoad, { once:true })
    link.addEventListener('error', onError, { once:true })
  })
}
function googleFontFamilyToParam(name){
  return String(name || '').trim().split(/\s+/).join('+')
}
function hasFontOption(family){
  if (!textFontFamily) return false
  return Array.from(textFontFamily.options).some(o => o.value === family)
}
function addFontOptionIfMissing(family, label){
  if (!textFontFamily || !family) return
  if (hasFontOption(family)) return
  const opt = document.createElement('option')
  opt.value = family
  opt.textContent = label || family
  textFontFamily.appendChild(opt)
}
async function loadGoogleFontFamily(family){
  const clean = normalizeGoogleFontFamilyName(family)
  if (!clean) return false
  addFontOptionIfMissing(clean, `${clean} (Google)`)
  if (loadedGoogleFonts.has(clean)) return true
  if (googleFontLoadPromises.has(clean)) return googleFontLoadPromises.get(clean)
  const promise = (async () => {
    setGoogleFontStatus(`Loading ${clean}…`, 'loading')
    const link = ensureGoogleFontLinkEl(clean)
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(googleFontFamilyToParam(clean))}:wght@400&display=swap`
    try {
      await waitForStylesheetLoad(link)
      if (document.fonts && typeof document.fonts.load === 'function') {
        await Promise.race([
          Promise.all([
            document.fonts.load(`16px ${quoteCanvasFontFamily(clean)}`),
            document.fonts.load(`32px ${quoteCanvasFontFamily(clean)}`)
          ]),
          new Promise((_,rej)=>setTimeout(()=>rej(new Error('font timeout')), 8000))
        ])
      }
      loadedGoogleFonts.add(clean)
      setGoogleFontStatus(`Loaded ${clean}`, 'ok')
      pushRecentGoogleFont(clean)
      return true
    } catch (err) {
      console.warn('Google font load failed', clean, err)
      setGoogleFontStatus(`Couldn't load “${clean}”`, 'error')
      return false
    } finally {
      googleFontLoadPromises.delete(clean)
    }
  })()
  googleFontLoadPromises.set(clean, promise)
  return promise
}

async function applyGoogleFontToSelectedText(rawFamily){
  const family = normalizeGoogleFontFamilyName(rawFamily)
  if (!family) return
  const ok = await loadGoogleFontFamily(family)
  if (!ok) return
  const t = getSelectedText()
  if (!t) return
  t.fontFamily = family
  if (textFontFamily) textFontFamily.value = family
  if (googleFontFamilyInput) googleFontFamilyInput.value = family
  syncSelectedTextControls()
  if (textEditorState && textEditorState.id === t.id) positionTextEditorOverlayForText(t)
}

const propShadowRuntimeCache = new WeakMap()
let propShadowScratch = null
let propShadowScratchCtx = null

function newTextId(){
  try {
    if (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
      return globalThis.crypto.randomUUID()
    }
  } catch (_) {}
  return `text-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
function normalizeTextObj(t){
  return {
    id: String(t?.id || newTextId()),
    text: String(t?.text || 'Label'),
    x: safeNum(t?.x, 0),
    y: safeNum(t?.y, 0),
    fontFamily: String(t?.fontFamily || 'Minecraft Five'),
    fontSize: Math.max(8, Math.min(144, Math.round(safeNum(t?.fontSize, 20)))),
    color: String(t?.color || '#1f2933'),
    showInPreview: t?.showInPreview !== false,
    showInExport: t?.showInExport !== false
  }
}
function getSelectedText(){ return (selectedTextId && Array.isArray(placedTexts)) ? (placedTexts.find(t => t && t.id === selectedTextId) || null) : null }
function syncSelectedTextControls(){
  const t = getSelectedText()
  if (!t) return
  if (textContentInput && document.activeElement !== textContentInput) textContentInput.value = t.text || ''
  if (textFontFamily && document.activeElement !== textFontFamily) { const ff = t.fontFamily || 'Minecraft Five'; addFontOptionIfMissing(ff, ff); textFontFamily.value = ff }
  if (googleFontFamilyInput && document.activeElement !== googleFontFamilyInput) { const ff = t.fontFamily || ''; googleFontFamilyInput.value = ['Minecraft Five','system-ui','serif','monospace'].includes(ff) ? '' : ff }
  const sz = Math.max(8, Math.min(144, Math.round(Number(t.fontSize)||20)))
  if (textFontSize && document.activeElement !== textFontSize) textFontSize.value = String(sz)
  if (textFontSizeOut) textFontSizeOut.textContent = String(sz)
  if (textColorInput && document.activeElement !== textColorInput) textColorInput.value = String(t.color || '#1f2933')
}
function syncTextPanelVisibility(){
  const hasText = !!getSelectedText()
  if (styleRenderGeneral) styleRenderGeneral.classList.toggle('hidden', hasText)
  if (textStylePanel) textStylePanel.classList.toggle('hidden', !hasText)
  syncSelectedTextControls()
}
function getCanvasClientRect(){ return canvas.getBoundingClientRect() }
function positionTextEditorOverlayForText(t){
  if (!textEditOverlay || !textCanvasEditor || !t) return
  const screen = camera.worldToScreen({ x:t.x, y:t.y })
  const crect = getCanvasClientRect()
  textCanvasEditor.style.fontFamily = t.fontFamily || 'system-ui'
  textCanvasEditor.style.fontSize = `${Math.max(10, Math.min(32, Number(t.fontSize)||20))}px`
  textCanvasEditor.style.color = String(t.color || '#1f2933')
  const desiredW = Math.max(140, Math.min(420, Math.ceil((measureTextScreenBounds(t, camera, ctx).w || 160) + 60)))
  textEditOverlay.style.width = `${desiredW}px`
  const margin = 8
  let left = Math.round(crect.left + screen.x + 10)
  let top = Math.round(crect.top + screen.y - 18)
  textEditOverlay.classList.remove('hidden')
  textEditOverlay.setAttribute('aria-hidden', 'false')
  const r = textEditOverlay.getBoundingClientRect()
  if (left + r.width > window.innerWidth - margin) left = Math.max(margin, Math.round(crect.left + screen.x - r.width - 10))
  if (top + r.height > window.innerHeight - margin) top = Math.max(margin, Math.round(crect.top + screen.y - r.height - 12))
  if (top < margin) top = margin
  if (left < margin) left = margin
  textEditOverlay.style.left = `${left}px`
  textEditOverlay.style.top = `${top}px`
}
function openTextEditorFor(textId, opts={}){
  const t = placedTexts.find(v => v && v.id === textId)
  if (!t || !textEditOverlay || !textCanvasEditor) return false
  selectedTextId = t.id
  selectedPropId = null
  selectedShapeId = null
  syncTextPanelVisibility()
  textEditorState = {
    id: t.id,
    originalText: String(t.text || ''),
    isNew: !!opts.isNew,
    undoPushed: !!opts.undoPushed
  }
  textCanvasEditor.value = String(t.text || '')
  if (t.fontFamily && !['Minecraft Five','system-ui','serif','monospace'].includes(t.fontFamily)) { loadGoogleFontFamily(t.fontFamily) }
  textCanvasEditor.dataset.textId = t.id
  positionTextEditorOverlayForText(t)
  queueMicrotask(() => { try { textCanvasEditor.focus(); textCanvasEditor.select() } catch (_) {} })
  requestAnimationFrame(() => { try { textCanvasEditor.focus(); textCanvasEditor.select() } catch (_) {} })
  setTimeout(() => { try { textCanvasEditor.focus(); textCanvasEditor.select() } catch (_) {} }, 0)
  refocusTextCanvasEditorSoon()
  return true
}
function closeTextEditorOverlay(){
  if (!textEditOverlay || !textCanvasEditor) { textEditorState = null; return }
  textEditOverlay.classList.add('hidden')
  textEditOverlay.setAttribute('aria-hidden', 'true')
  textCanvasEditor.dataset.textId = ''
  textEditorState = null
}
function refocusTextCanvasEditorSoon(){
  if (!textCanvasEditor) return
  setTimeout(() => { try { if (textEditorState) { textCanvasEditor.focus(); textCanvasEditor.select() } } catch (_) {} }, 0)
  requestAnimationFrame(() => { try { if (textEditorState) { textCanvasEditor.focus(); textCanvasEditor.select() } } catch (_) {} })
}
function commitActiveTextEditor(){
  if (!textEditorState || !textCanvasEditor) return false
  const t = placedTexts.find(v => v && v.id === textEditorState.id)
  if (!t) { closeTextEditorOverlay(); return false }
  const raw = String(textCanvasEditor.value || '')
  t.text = raw.trim() || 'Label'
  syncSelectedTextControls()
  closeTextEditorOverlay()
  return true
}
function cancelActiveTextEditor(){
  if (!textEditorState || !textCanvasEditor) return false
  const st = textEditorState
  const t = placedTexts.find(v => v && v.id === st.id)
  if (t){
    if (st.isNew){
      placedTexts = placedTexts.filter(v => v && v.id !== st.id)
      selectedTextId = null
      if (st.undoPushed) undoStack.pop()
    } else {
      t.text = st.originalText
    }
  }
  syncTextPanelVisibility()
  closeTextEditorOverlay()
  return true
}
function quoteCanvasFontFamily(name){
  const raw = String(name || 'system-ui').trim() || 'system-ui'
  if (/^[A-Za-z0-9_-]+$/.test(raw)) return raw
  return `"${raw.replace(/(["\\])/g, '\\$1')}"`
}

function textFontCss(t, cam){
  const px = Math.max(8, (Number(t.fontSize)||20) * (cam?.zoom || 1))
  return `${px}px ${quoteCanvasFontFamily(t.fontFamily)} , system-ui`
}
function measureTextScreenBounds(t, cam, targetCtx=ctx){
  const s = cam.worldToScreen({x:t.x, y:t.y})
  targetCtx.save()
  targetCtx.font = textFontCss(t, cam)
  const m = targetCtx.measureText(t.text || '')
  targetCtx.restore()
  const fs = Math.max(8, (Number(t.fontSize)||20) * (cam?.zoom || 1))
  const pad = 6
  const w = Math.max(8, m.width || 0)
  return { x:s.x-pad, y:s.y-fs-pad, w:w+pad*2, h:fs+pad*2 }
}
function pickTextAtScreen(screen, cam=camera){
  if (!isTextPreviewGloballyVisible()) return null
  for (let i = placedTexts.length - 1; i >= 0; i--){
    const t = placedTexts[i]
    if (!t) continue
    const b = measureTextScreenBounds(t, cam, ctx)
    if (screen.x >= b.x && screen.x <= b.x + b.w && screen.y >= b.y && screen.y <= b.y + b.h) return t
  }
  return null
}
function createTextAtWorld(world){
  const p = snapSoft(world, subGrid(), dungeon.style.snapStrength)
  const t = normalizeTextObj({ x:p.x, y:p.y, text:'Label', fontFamily:'Minecraft Five', fontSize:20, color:'#1f2933' })
  placedTexts.push(t)
  selectedTextId = t.id
  selectedPropId = null
  selectedShapeId = null
  return t
}
function drawTextsTo(targetCtx, cam, opts={}){
  const forExport = !!opts.forExport
  const globalAllowed = forExport ? (dungeon.style.showTextExport !== false) : (dungeon.style.showTextPreview !== false)
  if (!forExport && !globalAllowed) return
  for (const t of placedTexts){
    if (!t) continue
    const itemAllowed = forExport ? (t.showInExport !== false) : (t.showInPreview !== false)
    if (forExport && (!globalAllowed || !itemAllowed)) continue
    const s = cam.worldToScreen({x:t.x,y:t.y})
    targetCtx.save()
    targetCtx.font = textFontCss(t, cam)
    targetCtx.textBaseline = 'alphabetic'
    targetCtx.fillStyle = String(t.color || '#1f2933')
    if (!forExport && !itemAllowed) targetCtx.globalAlpha = 0.25
    targetCtx.fillText(t.text || '', s.x, s.y)
    targetCtx.restore()
  }
}
function drawTextSelection(){
  if (!isTextPreviewGloballyVisible()) return
  const t = getSelectedText()
  if (!t) return
  const b = measureTextScreenBounds(t, camera, ctx)
  ctx.save()
  ctx.strokeStyle = 'rgba(80,120,255,0.95)'
  ctx.setLineDash([6,6])
  ctx.lineWidth = 2
  ctx.strokeRect(b.x, b.y, b.w, b.h)
  ctx.restore()
}

function getPropShadowScratch(width, height){
  const w = Math.max(1, Math.ceil(width))
  const h = Math.max(1, Math.ceil(height))
  if (!propShadowScratch){
    propShadowScratch = document.createElement('canvas')
    propShadowScratchCtx = propShadowScratch.getContext('2d')
  }
  if (propShadowScratch.width !== w || propShadowScratch.height !== h){
    propShadowScratch.width = w
    propShadowScratch.height = h
  }
  return { canvas: propShadowScratch, ctx: propShadowScratchCtx }
}


function syncPanelTabs(){
  const hasAssets = !!(tabAssetsBtn && panelPages.length)
  for (const b of panelTabButtons){
    const t = b.dataset.panelTab
    const active = t === activePanelTab
    b.classList.toggle("primary", active)
    b.setAttribute("aria-selected", active ? "true" : "false")
  }
  for (const p of panelPages){
    const active = p.dataset.panelPage === activePanelTab
    p.classList.toggle("hidden", !active)
    p.setAttribute("aria-hidden", active ? "false" : "true")
  }
}
function setPanelTab(tab){
  activePanelTab = (tab === "assets") ? "assets" : "style"
  if (activePanelTab === "style") clearPropSelection()
  syncPanelTabs()
}
let drawerOpen = true
function setDrawerOpen(open){
  drawerOpen = !!open
  if (leftDrawer) leftDrawer.classList.toggle("collapsed", !drawerOpen)
  if (hudRoot) hudRoot.classList.toggle("drawer-collapsed", !drawerOpen)
  if (btnDrawerToggle) btnDrawerToggle.setAttribute("aria-expanded", drawerOpen ? "true" : "false")
  if (btnDrawerCollapse) {
    btnDrawerCollapse.setAttribute("aria-expanded", drawerOpen ? "true" : "false")
    btnDrawerCollapse.title = drawerOpen ? "Collapse sidebar" : "Expand sidebar"
  }
}
function toggleDrawer(){ setDrawerOpen(!drawerOpen) }
function getPropById(id){
  return (propsCatalog || []).find(p => p.id === id) || null
}
function getPlacedPropById(id){
  return (placedProps || []).find(p => p && p.id === id) || null
}
function getPropSnapEnabled(){
  return !!(dungeon.style && dungeon.style.propSnapEnabled !== false)
}
function snapPropWorldPoint(world){
  if (!getPropSnapEnabled()) return { x: world.x, y: world.y }
  const step = Math.max(1, Number(dungeon.gridSize) || 32)
  // Props snap to grid-cell centers (not line intersections) for cleaner placement.
  return {
    x: (Math.round((world.x / step) - 0.5) + 0.5) * step,
    y: (Math.round((world.y / step) - 0.5) + 0.5) * step
  }
}
function normalizeAngleRad(a){
  if (!Number.isFinite(a)) return 0
  while (a <= -Math.PI) a += Math.PI * 2
  while (a > Math.PI) a -= Math.PI * 2
  return a
}
function rotatePropAngleMaybeSnap(rad){
  let out = normalizeAngleRad(rad)
  if (getPropSnapEnabled()) {
    const step = Math.PI / 12
    out = Math.round(out / step) * step
  }
  return out
}
function propHandleLocal(prop){
  const w = Math.max(1, Number(prop?.w || dungeon.gridSize || 32))
  const h = Math.max(1, Number(prop?.h || dungeon.gridSize || 32))
  const offset = Math.max(10, Math.min(24, w * 0.18))
  return { x: 0, y: -h/2 - offset }
}
function propLocalToWorld(prop, local){
  const r = Number(prop?.rot || 0) || 0
  const c = Math.cos(r), si = Math.sin(r)
  return {
    x: (prop?.x || 0) + local.x * c - local.y * si,
    y: (prop?.y || 0) + local.x * si + local.y * c
  }
}
function worldToPropLocal(prop, world){
  const r = Number(prop?.rot || 0) || 0
  const dx = world.x - (prop?.x || 0)
  const dy = world.y - (prop?.y || 0)
  const c = Math.cos(-r), si = Math.sin(-r)
  return { x: dx * c - dy * si, y: dx * si + dy * c }
}
function hitPlacedProp(world, prop){
  if (!prop) return false
  const l = worldToPropLocal(prop, world)
  const w = Math.max(1, Number(prop.w || dungeon.gridSize || 32))
  const h = Math.max(1, Number(prop.h || dungeon.gridSize || 32))
  return Math.abs(l.x) <= w/2 && Math.abs(l.y) <= h/2
}
function hitPlacedPropRotateHandle(world, prop){
  if (!prop) return false
  const hw = propLocalToWorld(prop, propHandleLocal(prop))
  const rWorld = Math.max((12 / Math.max(0.001, camera.zoom)), (dungeon.gridSize || 32) * 0.22)
  return Math.hypot(world.x - hw.x, world.y - hw.y) <= rWorld
}
function pickPlacedPropAtWorld(world){
  if (!Array.isArray(placedProps)) return null
  for (let i = placedProps.length - 1; i >= 0; i--){
    const p = placedProps[i]
    if (!p) continue
    if (hitPlacedPropRotateHandle(world, p) || hitPlacedProp(world, p)) return p
  }
  return null
}
function placePropAtScreenById(propId, screen){
  const prop = getPropById(propId)
  if (!prop) return false
  return !!placePropAtWorld(prop, camera.screenToWorld(screen))
}
function getPropImage(prop){
  if (!prop || !prop.url) return null
  let img = propImageCache.get(prop.url)
  if (!img){
    img = new Image()
    img.decoding = "async"
    img.src = prop.url
    propImageCache.set(prop.url, img)
  }
  return img
}
function placePropAtWorld(prop, world){
  if (!prop || !world) return null
  const placeWorld = getPropSnapEnabled() ? snapPropWorldPoint(world) : world
  const img = getPropImage(prop)
  const nw = (img && img.naturalWidth) || 64
  const nh = (img && img.naturalHeight) || 64
  const base = Math.max(8, dungeon.gridSize)
  const gridW = Math.max(0.2, Number(prop.gridW ?? prop.defaultGridW ?? 1) || 1)
  const gridH = Math.max(0.2, Number(prop.gridH ?? prop.defaultGridH ?? 1) || 1)
  let w = base * gridW
  let h = base * gridH
  if (!(w > 0 && h > 0)){
    const aspect = (nw > 0 && nh > 0) ? (nh / nw) : 1
    w = base
    h = Math.max(base * 0.4, base * aspect)
  }
  pushUndo()
  const placed = {
    id: (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now() + Math.random()),
    propId: prop.id,
    name: prop.name,
    url: prop.url,
    x: placeWorld.x,
    y: placeWorld.y,
    w,
    h,
    rot: rotatePropAngleMaybeSnap(Number(prop.rot || 0) || 0),
    shadowDisabled: false
  }
  placedProps.push(placed)
  selectedPropId = placed.id
  return placed
}

function getPropShadowCanvasLikeWalls(propInst, img, drawW, drawH, zoomOverride = null){
  const shadow = dungeon.style?.shadow
  if (!shadow?.enabled) return null
  const alpha = Math.max(0, Math.min(1, Number(shadow.opacity ?? 0.34)))
  if (alpha <= 0) return null
  const activeZoom = Number.isFinite(Number(zoomOverride)) ? Number(zoomOverride) : camera.zoom
  const lenPx = Math.max(0, Number(shadow.length || 0) * activeZoom)
  const globalDir = shadow.dir || { x: 0.707, y: 0.707 }
  const localDir = rotate({ x: globalDir.x || 0, y: globalDir.y || 0 }, -(Number(propInst?.rot || 0) || 0))
  const dx = Math.round((localDir.x || 0) * lenPx)
  const dy = Math.round((localDir.y || 0) * lenPx)
  if (dx === 0 && dy === 0) return null
  const w = Math.max(1, Math.round(drawW))
  const h = Math.max(1, Math.round(drawH))
  // Extra pad and feathering make thin SVG line props cast a visible shadow.
  const feather = Math.max(1, Math.round(Math.min(w, h) * 0.04))
  const pad = Math.max(6, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) + feather + 4))
  const key = [w,h,dx,dy,shadow.color||'#000000',alpha,feather].join('|')
  const cached = propShadowRuntimeCache.get(propInst)
  if (cached && cached.key === key && cached.canvas) return cached

  const cw = w + pad * 2, ch = h + pad * 2

  // Alpha mask for the prop image.
  const alphaC = document.createElement('canvas'); alphaC.width = cw; alphaC.height = ch
  const actx = alphaC.getContext('2d')
  actx.clearRect(0,0,cw,ch)
  actx.imageSmoothingEnabled = false
  actx.drawImage(img, pad, pad, w, h)

  // Slightly dilate the mask so stroke-based SVG icons (doors/chests/etc.) don't produce near-invisible shadows.
  if (feather > 0){
    const dilate = document.createElement('canvas'); dilate.width = cw; dilate.height = ch
    const dctx = dilate.getContext('2d')
    dctx.imageSmoothingEnabled = false
    for (let ox = -feather; ox <= feather; ox++){
      for (let oy = -feather; oy <= feather; oy++){
        if ((ox*ox + oy*oy) > feather*feather) continue
        dctx.drawImage(alphaC, ox, oy)
      }
    }
    actx.clearRect(0,0,cw,ch)
    actx.drawImage(dilate, 0, 0)
  }

  // Sweep the prop alpha in the shadow direction to make a directional cast shadow, then subtract the prop itself.
  const sweepC = document.createElement('canvas'); sweepC.width = cw; sweepC.height = ch
  const sctx = sweepC.getContext('2d')
  sctx.imageSmoothingEnabled = false
  const steps = Math.max(8, Math.min(80, Math.round(Math.hypot(dx, dy))))
  let lx = null, ly = null
  for (let i = 1; i <= steps; i++){
    const ox = Math.round((dx * i) / steps)
    const oy = Math.round((dy * i) / steps)
    if (ox === lx && oy === ly) continue
    lx = ox; ly = oy
    sctx.drawImage(alphaC, ox, oy)
  }
  sctx.globalCompositeOperation = 'destination-out'
  sctx.drawImage(alphaC, 0, 0)
  sctx.globalCompositeOperation = 'source-over'

  // Normalize the mask to binary alpha so overlapping sweep samples don't become darker.
  try {
    const maskImg = sctx.getImageData(0, 0, cw, ch)
    const d = maskImg.data
    for (let i = 0; i < d.length; i += 4){
      d[i + 3] = d[i + 3] > 0 ? 255 : 0
    }
    sctx.putImageData(maskImg, 0, 0)
  } catch {}

  const outC = document.createElement('canvas'); outC.width = cw; outC.height = ch
  const octx = outC.getContext('2d')
  octx.fillStyle = shadow.color || '#000000'
  octx.globalAlpha = alpha
  octx.fillRect(0,0,cw,ch)
  octx.globalAlpha = 1
  octx.globalCompositeOperation = 'destination-in'
  octx.drawImage(sweepC, 0, 0)
  octx.globalCompositeOperation = 'source-over'

  const result = { key, canvas: outC, pad }
  propShadowRuntimeCache.set(propInst, result)
  return result
}

function drawPropSelection(){
  if (tool !== 'select' || !selectedPropId) return
  const p = getPlacedPropById(selectedPropId)
  if (!p) return
  const c = camera.worldToScreen({ x: p.x, y: p.y })
  const w = Math.max(1, (p.w || dungeon.gridSize) * camera.zoom)
  const h = Math.max(1, (p.h || dungeon.gridSize) * camera.zoom)
  const handleW = propLocalToWorld(p, propHandleLocal(p))
  const hs = camera.worldToScreen(handleW)
  ctx.save()
  ctx.translate(c.x, c.y)
  if (p.rot) ctx.rotate(p.rot)
  ctx.strokeStyle = 'rgba(80,120,255,0.95)'
  ctx.lineWidth = 2
  ctx.setLineDash([6,6])
  ctx.strokeRect(-w/2, -h/2, w, h)
  ctx.setLineDash([])
  ctx.beginPath()
  ctx.moveTo(0, -h/2)
  ctx.lineTo(hs.x - c.x, hs.y - c.y)
  ctx.strokeStyle = 'rgba(80,120,255,0.55)'
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.restore()
  ctx.fillStyle = 'rgba(80,120,255,0.95)'
  ctx.beginPath(); ctx.arc(hs.x, hs.y, 7, 0, Math.PI*2); ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.95)'
  ctx.lineWidth = 2
  ctx.beginPath(); ctx.arc(hs.x, hs.y, 7, 0, Math.PI*2); ctx.stroke()
}

const __propLayerTmp = {}
function getPropLayerTemp(key, w, h){
  let c = __propLayerTmp[key]
  if (!c) c = __propLayerTmp[key] = document.createElement('canvas')
  if (c.width !== w || c.height !== h){ c.width = w; c.height = h }
  return c
}
function drawCompiledLayerToScreen(targetCtx, layerCanvas, cache, cam = camera){
  if (!targetCtx || !layerCanvas || !cache) return
  const tl = cam.worldToScreen({ x: cache.bounds.minx, y: cache.bounds.miny })
  const drawW = (layerCanvas.width / cache.ppu) * cam.zoom
  const drawH = (layerCanvas.height / cache.ppu) * cam.zoom
  targetCtx.imageSmoothingEnabled = true
  targetCtx.drawImage(layerCanvas, tl.x, tl.y, drawW, drawH)
}

function drawPlacedPropsTo(targetCtx, targetCamera, targetW, targetH, cacheForWalls = compiledCache){
  if (!Array.isArray(placedProps) || placedProps.length === 0) return

  const shadowMasterEnabled = !!(dungeon.style?.shadow?.enabled)
  const shadowMaskC = shadowMasterEnabled ? getPropLayerTemp('shadowMask', targetW, targetH) : null
  const propOccC = shadowMasterEnabled ? getPropLayerTemp('propOcc', targetW, targetH) : null
  const wallOccC = shadowMasterEnabled ? getPropLayerTemp('wallOcc', targetW, targetH) : null
  const shadowTintC = shadowMasterEnabled ? getPropLayerTemp('shadowTint', targetW, targetH) : null
  const smctx = shadowMaskC ? shadowMaskC.getContext('2d', { willReadFrequently: true }) : null
  const poctx = propOccC ? propOccC.getContext('2d') : null
  const woctx = wallOccC ? wallOccC.getContext('2d', { willReadFrequently: true }) : null
  const stctx = shadowTintC ? shadowTintC.getContext('2d') : null

  if (smctx) {
    smctx.clearRect(0,0,targetW,targetH)
    smctx.globalCompositeOperation = 'source-over'
    smctx.imageSmoothingEnabled = false
  }
  if (poctx) {
    poctx.clearRect(0,0,targetW,targetH)
    poctx.globalCompositeOperation = 'source-over'
    poctx.imageSmoothingEnabled = false
  }
  if (woctx) {
    woctx.clearRect(0,0,targetW,targetH)
    woctx.globalCompositeOperation = 'source-over'
    woctx.imageSmoothingEnabled = true
  }

  // Pass 1: accumulate prop shadow masks (union target) and total prop occupancy.
  if (shadowMasterEnabled && smctx && poctx){
    for (const a of placedProps){
      if (!a || !a.url) continue
      const propMeta = getPropById(a.propId)
      const img = propImageCache.get(a.url) || (()=>{ const p = propMeta; return p ? getPropImage(p) : null })()
      if (!img) continue
      const c = targetCamera.worldToScreen({ x: a.x, y: a.y })
      const w = Math.max(1, (a.w || dungeon.gridSize) * targetCamera.zoom)
      const h = Math.max(1, (a.h || dungeon.gridSize) * targetCamera.zoom)

      // Occupancy mask of prop bodies so no prop shadow can render over any prop sprite.
      if (img.complete && img.naturalWidth > 0){
        poctx.save()
        poctx.translate(c.x, c.y)
        if (a.rot) poctx.rotate(a.rot)
        poctx.drawImage(img, -w/2, -h/2, w, h)
        poctx.restore()
      }

      const shadowEnabled = (a?.shadowDisabled !== true) && (propMeta?.castShadow !== false)
      if (!shadowEnabled || !(img.complete && img.naturalWidth > 0)) continue
      const shadowLayer = getPropShadowCanvasLikeWalls(a, img, w, h, targetCamera.zoom)
      if (!shadowLayer?.canvas) continue
      smctx.save()
      smctx.translate(c.x, c.y)
      if (a.rot) smctx.rotate(a.rot)
      smctx.drawImage(shadowLayer.canvas, -w/2 - shadowLayer.pad, -h/2 - shadowLayer.pad)
      smctx.restore()
    }

    // Convert accumulated alpha to a binary union mask so overlaps don't get darker.
    try {
      const maskImg = smctx.getImageData(0, 0, targetW, targetH)
      const d = maskImg.data
      for (let i = 0; i < d.length; i += 4){
        d[i] = 0; d[i+1] = 0; d[i+2] = 0
        d[i+3] = d[i+3] > 0 ? 255 : 0
      }
      smctx.putImageData(maskImg, 0, 0)
    } catch {}

    // Never draw prop shadows over prop bodies.
    smctx.globalCompositeOperation = 'destination-out'
    smctx.drawImage(propOccC, 0, 0)
    smctx.globalCompositeOperation = 'source-over'

    // Max-merge prop shadow with the already-rendered wall shadow in screen space.
    // We compute a delta alpha such that source-over produces finalAlpha = max(wallAlpha, propAlpha).
    if (woctx && cacheForWalls?.shadowCanvas && cacheForWalls?.bounds && cacheForWalls?.ppu) {
      woctx.clearRect(0,0,targetW,targetH)
      drawCompiledLayerToScreen(woctx, cacheForWalls.shadowCanvas, cacheForWalls, targetCamera)
      try {
        const maskImg = smctx.getImageData(0, 0, targetW, targetH)
        const wallImg = woctx.getImageData(0, 0, targetW, targetH)
        const md = maskImg.data
        const wd = wallImg.data
        const shadowOpacity = Math.max(0.001, Math.min(1, Number(dungeon.style?.shadow?.opacity ?? 0.34)))
        for (let i = 0; i < md.length; i += 4) {
          const maskA = md[i+3] / 255
          if (maskA <= 0) { md[i+3] = 0; continue }
          const propA = Math.max(0, Math.min(1, maskA * shadowOpacity))
          const wallA = wd[i+3] / 255 // already includes wall shadow style opacity when rendered
          if (propA <= wallA + 1e-4) { md[i+3] = 0; continue }
          const denom = Math.max(1e-4, 1 - wallA)
          const addA = Math.max(0, Math.min(1, (propA - wallA) / denom))
          md[i] = 0; md[i+1] = 0; md[i+2] = 0
          md[i+3] = Math.round(addA * 255)
        }
        smctx.putImageData(maskImg, 0, 0)
      } catch {}
    } else if (smctx) {
      // No wall shadow layer available: convert mask alpha into actual source-over alpha payload using global opacity.
      try {
        const maskImg = smctx.getImageData(0, 0, targetW, targetH)
        const md = maskImg.data
        const shadowOpacity = Math.max(0, Math.min(1, Number(dungeon.style?.shadow?.opacity ?? 0.34)))
        for (let i = 0; i < md.length; i += 4) {
          md[i] = 0; md[i+1] = 0; md[i+2] = 0
          md[i+3] = Math.round((md[i+3] / 255) * shadowOpacity * 255)
        }
        smctx.putImageData(maskImg, 0, 0)
      } catch {}
    }

    // Tint once from the delta/max-merged prop shadow mask.
    if (stctx){
      stctx.clearRect(0,0,targetW,targetH)
      stctx.fillStyle = dungeon.style?.shadow?.color || '#000000'
      stctx.globalAlpha = 1
      stctx.fillRect(0,0,targetW,targetH)
      stctx.globalCompositeOperation = 'destination-in'
      stctx.drawImage(shadowMaskC, 0, 0)
      stctx.globalCompositeOperation = 'source-over'
      targetCtx.drawImage(shadowTintC, 0, 0)
    }
  }

  // Pass 2: draw prop sprites on top.
  targetCtx.save()
  for (const a of placedProps){
    if (!a || !a.url) continue
    const propMeta = getPropById(a.propId)
    const img = propImageCache.get(a.url) || (()=>{ const p = propMeta; return p ? getPropImage(p) : null })()
    if (!img) continue
    const c = targetCamera.worldToScreen({ x: a.x, y: a.y })
    const w = Math.max(1, (a.w || dungeon.gridSize) * targetCamera.zoom)
    const h = Math.max(1, (a.h || dungeon.gridSize) * targetCamera.zoom)

    targetCtx.save()
    targetCtx.translate(c.x, c.y)
    if (a.rot) targetCtx.rotate(a.rot)

    targetCtx.globalAlpha = 1
    if (img.complete && img.naturalWidth > 0){
      targetCtx.drawImage(img, -w/2, -h/2, w, h)
    } else {
      targetCtx.fillStyle = "rgba(17,24,39,0.16)"
      targetCtx.strokeStyle = "rgba(17,24,39,0.28)"
      targetCtx.lineWidth = 1
      targetCtx.fillRect(-w/2, -h/2, w, h)
      targetCtx.strokeRect(-w/2, -h/2, w, h)
      targetCtx.beginPath()
      targetCtx.moveTo(-w/2, -h/2); targetCtx.lineTo(w/2, h/2)
      targetCtx.moveTo(w/2, -h/2); targetCtx.lineTo(-w/2, h/2)
      targetCtx.stroke()
    }
    targetCtx.restore()
  }
  targetCtx.restore()
}

function drawPlacedProps(){
  drawPlacedPropsTo(ctx, camera, W, H, compiledCache)
}


let builtInPropsCatalog = []
let importedPropsCatalog = []
let propsCatalog = []
let bundledPropsLoadQueued = false

function rebuildPropsCatalog(){
  propsCatalog = [...builtInPropsCatalog, ...importedPropsCatalog]
}

function clearPropObjectURLs(list = importedPropsCatalog){
  for (const p of (list || [])){
    if (p && p.url && p.url.startsWith("blob:")) {
      try { URL.revokeObjectURL(p.url) } catch {}
    }
  }
}

function makeBundledPropUrl(src){
  try { return new URL(`assets/props/${src}`, window.location.href).href }
  catch { return `assets/props/${src}` }
}

async function loadBundledPropsManifest(force = false){
  if (!force && builtInPropsCatalog.length) return builtInPropsCatalog
  const manifestCandidates = [
    "assets/props/manifest.json",
    "assets/props-custom/manifest.json",
    "assets/user-assets/manifest.json"
  ]
  const merged = []
  for (const manifestPath of manifestCandidates){
    try {
      const res = await fetch(manifestPath, { cache: "no-store" })
      if (!res.ok) continue
      const manifest = await res.json()
      const list = Array.isArray(manifest?.assets) ? manifest.assets : []
      for (const [i, a] of list.entries()){
        if (!a || !a.src) continue
        const src = String(a.src)
        const baseDir = manifestPath.replace(/[^/]+$/, "")
        const resolvedSrc = /^(https?:|data:|blob:|\/)/i.test(src) ? src : (baseDir + src)
        merged.push({
          id: String(a.id || `${manifestPath}-builtin-${i}`),
          name: String(a.name || a.src).replace(/\.[^.]+$/, ""),
          url: resolvedSrc,
          source: "bundled",
          gridW: Number(a.gridW ?? a.defaultGridW ?? 1) || 1,
          gridH: Number(a.gridH ?? a.defaultGridH ?? 1) || 1,
          rot: Number(a.rot || 0) || 0,
          castShadow: (a.castShadow !== false)
        })
      }
    } catch (err) {
      if (manifestPath === "assets/props/manifest.json") {
        console.warn("Bundled props manifest not loaded:", err)
      }
    }
  }
  builtInPropsCatalog = merged.slice(0, 1000)
  rebuildPropsCatalog()
  for (const p of builtInPropsCatalog) getPropImage(p)
  renderPropsShelf()
  return builtInPropsCatalog
}

function queueBundledPropsLoad(){
  if (bundledPropsLoadQueued) return
  bundledPropsLoadQueued = true
  Promise.resolve().then(() => loadBundledPropsManifest()).catch(() => {})
}

async function collectPngFilesFromDirectoryHandle(dirHandle){
  const out = []
  async function walk(handle){
    for await (const entry of handle.values()){
      if (entry.kind === "file"){
        if (!/\.(png|svg|webp|jpg|jpeg)$/i.test(entry.name)) continue
        const file = await entry.getFile()
        out.push(file)
      } else if (entry.kind === "directory"){
        await walk(entry)
      }
    }
  }
  await walk(dirHandle)
  return out
}

async function pickPropsFolder(){
  if (window.showDirectoryPicker){
    const dirHandle = await window.showDirectoryPicker({ mode: "read" })
    const files = await collectPngFilesFromDirectoryHandle(dirHandle)
    await loadPropsFromFolderFiles(files)
    return
  }
  if (propsFolderInput) propsFolderInput.click()
}

function renderPropsShelf(){
  if (!propsShelf) return
  propsShelf.innerHTML = ""
  if (!Array.isArray(propsCatalog) || propsCatalog.length === 0){
    propsShelf.classList.add("empty")
    const empty = document.createElement("div")
    empty.className = "propsEmpty"
    empty.textContent = "No props loaded yet"
    propsShelf.appendChild(empty)
    return
  }
  propsShelf.classList.remove("empty")
  for (const prop of propsCatalog){
    const tile = document.createElement("button")
    tile.type = "button"
    tile.className = "propTile" + (armedPropId === prop.id ? " armed" : "")
    tile.title = prop.name + " — drag onto map or tap to arm one-click placement"
    tile.draggable = true
    tile.dataset.propId = prop.id

    const img = document.createElement("img")
    img.src = prop.url
    img.alt = prop.name
    img.draggable = false

    const name = document.createElement("div")
    name.className = "name"
    name.textContent = prop.name
    name.draggable = false

    const badge = document.createElement("div")
    badge.className = "badge"
    badge.textContent = "✓"

    tile.appendChild(img)
    tile.appendChild(name)
    tile.appendChild(badge)

    tile.addEventListener("click", () => {
      armedPropId = (armedPropId === prop.id) ? null : prop.id
      renderPropsShelf()
      setPanelTab("assets")
    })

    tile.addEventListener("dragstart", (e) => {
      dragPropId = prop.id
      armedPropId = prop.id
      renderPropsShelf()
      try {
        if (e.dataTransfer){
          e.dataTransfer.effectAllowed = "copy"
          e.dataTransfer.setData("text/plain", prop.id)
          e.dataTransfer.setData("application/x-dungeon-prop-id", prop.id)
        }
      } catch {}
    })
    tile.addEventListener("dragend", () => {
      dragPropId = null
    })

    propsShelf.appendChild(tile)
  }
}
async function loadPropsFromFolderFiles(fileList){
  const files = Array.from(fileList || [])
    .filter(f => /\.(png|svg|webp|jpg|jpeg)$/i.test(f.name))
    .sort((a,b) => a.name.localeCompare(b.name, undefined, { numeric:true, sensitivity:"base" }))
    .slice(0, 500)
  clearPropObjectURLs(importedPropsCatalog)
  importedPropsCatalog = files.map((f, i) => ({
    id: (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now() + i),
    name: f.name.replace(/\.[^.]+$/, ""),
    file: f,
    url: URL.createObjectURL(f),
    source: "imported"
  }))
  rebuildPropsCatalog()
  for (const p of importedPropsCatalog) getPropImage(p)
  armedPropId = null
  renderPropsShelf()
  setPanelTab("assets")
}

function setDungeonFromObject(d){
  if (!d || typeof d !== "object") return
  if (Number.isFinite(Number(d.gridSize))) dungeon.gridSize = Math.max(4, safeNum(d.gridSize, dungeon.gridSize))
  if (Number.isFinite(Number(d.subSnapDiv))) dungeon.subSnapDiv = Math.max(1, Math.min(16, Math.round(safeNum(d.subSnapDiv, dungeon.subSnapDiv))))

  // Prefer exact serialized edit geometry if present (preserves add/subtract ordering perfectly).
  const raw = (d.raw && typeof d.raw === "object") ? d.raw : null
  if (raw && (Array.isArray(raw.spaces) || Array.isArray(raw.paths) || Array.isArray(raw.shapes))) {
    dungeon.spaces = Array.isArray(raw.spaces) ? raw.spaces : []
    dungeon.paths  = Array.isArray(raw.paths)  ? raw.paths  : []
    dungeon.shapes = Array.isArray(raw.shapes) ? raw.shapes : []
  } else if (d.geometry && Array.isArray(d.geometry.regions)) {
    // Compact fallback: reconstruct as additive boundary regions.
    dungeon.spaces = d.geometry.regions
      .filter(poly => Array.isArray(poly) && poly.length >= 3)
      .map(poly => ({
        id: crypto.randomUUID(),
        mode: "add",
        polygon: poly.map(p => Array.isArray(p)
          ? { x: safeNum(p[0],0), y: safeNum(p[1],0) }
          : { x: safeNum(p.x,0), y: safeNum(p.y,0) }
        )
      }))
    dungeon.paths = []
    dungeon.shapes = []
  } else {
    dungeon.spaces = Array.isArray(d.spaces) ? d.spaces : []
    dungeon.paths = Array.isArray(d.paths) ? d.paths : []
    dungeon.shapes = Array.isArray(d.shapes) ? d.shapes : []
  }

  // Normalize IDs/modes after loading (older saves or hand-edited files).
  for (const s of dungeon.spaces) {
    if (!s.id) s.id = crypto.randomUUID()
    if (!s.mode) s.mode = "add"
    if (!Array.isArray(s.polygon)) s.polygon = []
    if (!Number.isFinite(Number(s.seq))) s.seq = nextEditSeq()
  }
  for (const p of dungeon.paths) {
    if (!p.id) p.id = crypto.randomUUID()
    if (!p.mode) p.mode = "add"
    if (!Array.isArray(p.points)) p.points = []
    if (!Number.isFinite(Number(p.seq))) p.seq = nextEditSeq()
  }
  for (const sh of dungeon.shapes) {
    if (!sh.id) sh.id = crypto.randomUUID()
    if (!sh.mode) sh.mode = "add"
    if (!Number.isFinite(Number(sh.seq))) sh.seq = nextEditSeq()
  }

  // Preserve newer style keys by merging onto current/default style.
  const nextStyle = cloneJson(dungeon.style)
  if (d.style && typeof d.style === "object") {
    Object.assign(nextStyle, d.style)
    if (d.style.shadow && typeof d.style.shadow === "object") {
      nextStyle.shadow = Object.assign({}, dungeon.style.shadow, d.style.shadow)
      if (d.style.shadow.dir && typeof d.style.shadow.dir === "object") {
        nextStyle.shadow.dir = Object.assign({}, dungeon.style.shadow.dir, d.style.shadow.dir)
      }
    }
    if (d.style.hatch && typeof d.style.hatch === "object") {
      nextStyle.hatch = Object.assign({}, dungeon.style.hatch, d.style.hatch)
    }
  }
  nextStyle.polySides = Math.max(3, Math.min(12, Math.round(safeNum(nextStyle.polySides, 6))))
  if (typeof nextStyle.propSnapEnabled !== "boolean") nextStyle.propSnapEnabled = true
  if (typeof nextStyle.showTextPreview !== "boolean") nextStyle.showTextPreview = true
  if (typeof nextStyle.showTextExport !== "boolean") nextStyle.showTextExport = true
  if (!(Number.isFinite(Number(nextStyle.hatch?.density)) && Number(nextStyle.hatch.density) > 0)) nextStyle.hatch.density = 0.25
  // Migrate old saves that used `paper` for the interior fill color.
  if (!nextStyle.floorColor && nextStyle.paper) nextStyle.floorColor = nextStyle.paper
  // Keep legacy alias in sync for compatibility with any older code paths.
  if (!nextStyle.paper && nextStyle.floorColor) nextStyle.paper = nextStyle.floorColor
  dungeon.style = nextStyle
  refreshEditSeqCounter()
}

function applyLoadedMapObject(obj){
  if (!obj || typeof obj !== "object") throw new Error("Invalid map file")

  // Supports both wrapped format {dungeon, camera...} and plain dungeon object.
  const d = (obj.dungeon && typeof obj.dungeon === "object") ? obj.dungeon : obj
  setDungeonFromObject(d)
  placedProps = Array.isArray(d.placedProps) ? d.placedProps.map(p => ({
    id: String(p?.id || ((typeof globalThis!=='undefined' && globalThis.crypto && globalThis.crypto.randomUUID) ? globalThis.crypto.randomUUID() : (Date.now()+Math.random()))),
    propId: (p && p.propId != null) ? String(p.propId) : undefined,
    name: String(p?.name || "Prop"),
    url: String(p?.url || ""),
    x: safeNum(p?.x, 0),
    y: safeNum(p?.y, 0),
    w: Math.max(1, safeNum(p?.w, dungeon.gridSize)),
    h: Math.max(1, safeNum(p?.h, dungeon.gridSize)),
    rot: safeNum(p?.rot, 0),
    shadowDisabled: p?.shadowDisabled === true
  })).filter(p => p.url) : []
  placedTexts = Array.isArray(d.placedTexts) ? d.placedTexts.map(normalizeTextObj) : []

  
  if (obj.camera && typeof obj.camera === "object") {
    camera.x = safeNum(obj.camera.x, camera.x)
    camera.y = safeNum(obj.camera.y, camera.y)
    camera.zoom = camera.clampZoom(safeNum(obj.camera.zoom, camera.zoom))
  }

  draft=null; draftRect=null; freeDraw=null; draftShape=null; selectedShapeId=null; selectedPropId=null; selectedTextId=null; shapeDrag=null; propTransformDrag=null; textDrag=null; eraseStroke=null
  syncTextPanelVisibility()
  underMode = false
  syncUI()
  drawPuck()
  compiledSig = "" // force recompile next frame
}


function getCompactBoundaryRegions(){
  try {
    const cache = ensureCompiled()
    if (!cache?.contoursWorld?.length) return []
    return cache.contoursWorld
      .filter(poly => Array.isArray(poly) && poly.length >= 3)
      .map(poly => poly.map(p => [Number(p.x.toFixed(3)), Number(p.y.toFixed(3))]))
  } catch (err) {
    console.warn("Failed to build compact boundary save; falling back to raw geometry.", err)
    return []
  }
}

function getSaveMapObject(){
  const compactRegions = getCompactBoundaryRegions()
  const dungeonData = {
    gridSize: dungeon.gridSize,
    subSnapDiv: dungeon.subSnapDiv,
    style: cloneJson(dungeon.style),
    // Reliable exact geometry for editing (preserves add/subtract order + all tool outputs)
    raw: {
      spaces: cloneJson(dungeon.spaces),
      paths: cloneJson(dungeon.paths),
      shapes: dungeon.shapes.map(s => ({...s, _poly: undefined}))
    }
  }

  // Optional compact boundary loops for future canonical loading / lightweight processing.
  if (compactRegions.length) {
    dungeonData.geometry = {
      kind: "boundary-regions",
      note: "Canonical boundary loops (derived). Exact editable geometry is stored in dungeon.raw.",
      regions: compactRegions
    }
  }

  return {
    app: "Dungeon Sketch",
    format: "dungeon-sketch-map",
    version: 3,
    savedAt: new Date().toISOString(),
    camera: { x: camera.x, y: camera.y, zoom: camera.zoom },
    dungeon: Object.assign(dungeonData, { placedProps: cloneJson(placedProps || []), placedTexts: cloneJson(placedTexts || []) })
  }
}

function saveMapToFile(){
  const data = JSON.stringify(getSaveMapObject(), null, 2)
  const blob = new Blob([data], { type: "application/json" })
  const a = document.createElement("a")
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  a.href = URL.createObjectURL(blob)
  a.download = `dungeon-sketch-map-${stamp}.json`
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    URL.revokeObjectURL(a.href)
    a.remove()
  }, 0)
}

async function loadMapFromFile(file){
  if (!file) return
  const text = await file.text()
  const obj = JSON.parse(text)
  pushUndo()
  applyLoadedMapObject(obj)
  updateHistoryButtons()
}

function pushUndo(){ undoStack.push(snapshot()); if(undoStack.length>200) undoStack.shift(); redoStack.length=0; updateHistoryButtons() }
function undo(){ if(!undoStack.length) return; redoStack.push(snapshot()); restore(undoStack.pop()); updateHistoryButtons() }
function redo(){ if(!redoStack.length) return; undoStack.push(snapshot()); restore(redoStack.pop()); updateHistoryButtons() }

btnUndo.addEventListener("click", undo)
btnRedo.addEventListener("click", redo)
if (btnSaveMap) btnSaveMap.addEventListener("click", saveMapToFile)
if (btnLoadMap) btnLoadMap.addEventListener("click", () => fileLoadMap && fileLoadMap.click())
if (btnDrawerToggle) btnDrawerToggle.addEventListener("click", toggleDrawer)
if (btnDrawerCollapse) btnDrawerCollapse.addEventListener("click", toggleDrawer)
if (drawerPeekTab) drawerPeekTab.addEventListener("click", () => setDrawerOpen(true))
if (tabStyleBtn) tabStyleBtn.addEventListener("click", () => setPanelTab("style"))
if (tabAssetsBtn) tabAssetsBtn.addEventListener("click", () => setPanelTab("assets"))
syncPanelTabs()
if (btnPropsPick) btnPropsPick.addEventListener("click", async () => { try { await pickPropsFolder() } catch (err) { if (err && err.name !== "AbortError") alert(`Could not open prop folder: ${err.message || err}`) } })
if (btnPropsClear) btnPropsClear.addEventListener("click", () => { clearPropObjectURLs(importedPropsCatalog); importedPropsCatalog = []; rebuildPropsCatalog(); armedPropId = null; dragPropId = null; propImageCache.clear(); renderPropsShelf() })
if (btnPropsDefaults) btnPropsDefaults.addEventListener("click", async () => { try { await loadBundledPropsManifest(true) } catch {} })
if (propsFolderInput) propsFolderInput.addEventListener("change", async (e) => {
  try { await loadPropsFromFolderFiles(e.target.files) }
  catch (err) { alert(`Could not load prop folder: ${err.message || err}`) }
  e.target.value = ""
})
renderPropsShelf()
queueBundledPropsLoad()
if (fileLoadMap) fileLoadMap.addEventListener("change", async (e) => {
  const file = e.target.files && e.target.files[0]
  if (!file) return
  try { await loadMapFromFile(file) }
  catch (err) { alert(`Could not load map: ${err.message || err}`) }
  e.target.value = ""
})
btnClear.addEventListener("click", () => { pushUndo(); dungeon.spaces=[]; dungeon.paths=[]; dungeon.shapes=[]; placedTexts=[]; refreshEditSeqCounter(); selectedShapeId=null; selectedTextId=null; draft=null; draftRect=null; freeDraw=null; draftShape=null; eraseStroke=null; syncTextPanelVisibility(); updateHistoryButtons() })
btnExport.addEventListener("click", exportPNG)
btnPDF?.addEventListener("click", () => exportMultipagePDF().catch(err => { console.error(err); alert("PDF export failed. See console."); }))
if (btnFinish) btnFinish.addEventListener("click", finishTool)
if (btnUnder) btnUnder.addEventListener("click", () => {
  if (selectedShapeId){
    const sh = dungeon.shapes.find(s=>s.id===selectedShapeId)
    if (!sh) return
    pushUndo()
    sh.mode = (sh.mode === "add") ? "subtract" : "add"
    sh.seq = nextEditSeq()
    return
  }
  underMode = !underMode
  syncUnderUI()
  syncToolUI()
})

function getPropWorldAABB(a){
  const cx = Number(a?.x || 0), cy = Number(a?.y || 0)
  const w = Math.max(0, Number(a?.w || dungeon.gridSize) || dungeon.gridSize)
  const h = Math.max(0, Number(a?.h || dungeon.gridSize) || dungeon.gridSize)
  const rot = Number(a?.rot || 0) || 0
  const c = Math.cos(rot), s = Math.sin(rot)
  const ex = Math.abs(c) * (w/2) + Math.abs(s) * (h/2)
  const ey = Math.abs(s) * (w/2) + Math.abs(c) * (h/2)
  return { minx: cx - ex, miny: cy - ey, maxx: cx + ex, maxy: cy + ey }
}

function unionBounds(a, b){
  if (!a) return b ? { ...b } : null
  if (!b) return { ...a }
  return {
    minx: Math.min(a.minx, b.minx),
    miny: Math.min(a.miny, b.miny),
    maxx: Math.max(a.maxx, b.maxx),
    maxy: Math.max(a.maxy, b.maxy)
  }
}

function renderSceneToCanvasForBounds(targetCanvas, worldBounds){
  const tw = Math.max(1, targetCanvas.width|0)
  const th = Math.max(1, targetCanvas.height|0)
  const tctx = targetCanvas.getContext('2d', { alpha: true })
  const exportCam = new Camera()
  exportCam.minZoom = 0.001
  exportCam.maxZoom = 100000
  exportCam.zoom = Math.min(tw / (worldBounds.maxx - worldBounds.minx), th / (worldBounds.maxy - worldBounds.miny))
  exportCam.x = -worldBounds.minx
  exportCam.y = -worldBounds.miny

  tctx.clearRect(0,0,tw,th)
  if (!dungeon.style.transparentBackground){
    tctx.fillStyle = dungeon.style.backgroundColor || '#f8f7f4'
    tctx.fillRect(0,0,tw,th)
  }
  drawGrid(tctx, exportCam, dungeon.gridSize, tw, th)
  const cache = ensureCompiled()
  drawCompiledBase(tctx, exportCam, cache, dungeon, tw, th)
  drawPlacedPropsTo(tctx, exportCam, tw, th, cache)
  drawTextsTo(tctx, exportCam, { forExport:true })
  return { ctx: tctx, cam: exportCam }
}

function exportPNG(){
  const bounds = getExportWorldBounds()
  if (!bounds){
    alert('Draw something first.')
    return
  }

  const worldW = bounds.maxx - bounds.minx
  const worldH = bounds.maxy - bounds.miny
  const aspect = worldW > 0 ? (worldH / worldW) : 1
  const defaultWidth = Math.max(1024, Math.min(8192, Math.round(worldW * 4)))
  const widthPx = Math.max(256, Math.min(16384, Math.round(Number(prompt('PNG export width (px) — full map will be auto-fit', String(defaultWidth))) || defaultWidth)))
  const heightPx = Math.max(256, Math.min(16384, Math.round(widthPx * aspect)))

  const out = document.createElement('canvas')
  out.width = widthPx
  out.height = heightPx
  renderSceneToCanvasForBounds(out, bounds)

  const a = document.createElement('a')
  a.download = `dungeon-map-${widthPx}x${heightPx}.png`
  a.href = out.toDataURL('image/png')
  a.click()
}

function compileSignature(){
  // committed geometry + style knobs that affect compiled caches only
  return JSON.stringify({
    spaces: dungeon.spaces,
    paths: dungeon.paths,
    shapes: dungeon.shapes.map(s => ({...s, _poly: undefined})),
    style: {
      corridorWidth: dungeon.style.corridorWidth,
      wallColor: dungeon.style.wallColor,
      wallWidth: dungeon.style.wallWidth,
      shadow: dungeon.style.shadow,
      hatch: dungeon.style.hatch
    }
  })
}

function ensureCompiled(){
  const sig = compileSignature()
  if (!compiledCache || sig !== compiledSig){
    compiledSig = sig
    compiledCache = compileWorldCache(dungeon)
  }
  return compiledCache
}


async function ensureJsPDF(){
  if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF
  await new Promise((resolve, reject) => {
    const s = document.createElement("script")
    s.src = "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js"
    s.onload = resolve
    s.onerror = reject
    document.head.appendChild(s)
  })
  if (!window.jspdf?.jsPDF) throw new Error("jsPDF failed to load")
  return window.jspdf.jsPDF
}

function inchesToMm(v){ return Number(v) * 25.4 }
function mmToInches(v){ return Number(v) / 25.4 }
function clampNum(v, min, max){ return Math.max(min, Math.min(max, v)) }

let pdfExportDialogState = {
  mode: 'tiled',
  paper: 'LETTER',
  orientation: 'auto',
  source: 'map',
  paddingSquares: 1,
  marginIn: 0.25,
  rasterDpi: 220,
  squareSizeIn: 1.0,
  overlapSquares: 0,
  labels: true,
  trimMarks: true,
  overview: true,
  includeEmptyTiles: false,
}

function normalizePdfExportOpts(raw = {}){
  const mode = String(raw.mode || 'tiled').toLowerCase().startsWith('s') ? 'single' : 'tiled'
  const source = String(raw.source || 'map').toLowerCase().includes('view') ? 'viewport' : 'map'
  const out = {
    mode,
    paper: String(raw.paper || 'LETTER').toUpperCase() === 'A4' ? 'A4' : 'LETTER',
    orientation: ['auto','portrait','landscape'].includes(String(raw.orientation || 'auto')) ? String(raw.orientation || 'auto') : 'auto',
    source,
    paddingSquares: Math.max(0, Math.round(Number(raw.paddingSquares ?? (source === 'map' ? 1 : 0)) || 0)),
    marginIn: clampNum(Number(raw.marginIn) || 0.25, 0, 2),
    rasterDpi: clampNum(Math.round(Number(raw.rasterDpi) || 220), 96, 600),
    squareSizeIn: clampNum(Number(raw.squareSizeIn) || 1, 0.1, 5),
    overlapSquares: Math.max(0, Math.floor(Number(raw.overlapSquares) || 0)),
    labels: raw.labels !== false,
    trimMarks: raw.trimMarks !== false,
    overview: raw.overview !== false,
    includeEmptyTiles: !!raw.includeEmptyTiles,
  }
  if (out.source === 'viewport' && !(raw && Object.prototype.hasOwnProperty.call(raw, 'paddingSquares'))) out.paddingSquares = 0
  return out
}

function syncPdfExportSummary(opts){
  if (!pdfExportSummary) return
  if (opts.mode === 'single'){
    pdfExportSummary.textContent = `Single-page PDF: fits the selected content area to one page. Margins ${opts.marginIn.toFixed(2)} in, ${opts.rasterDpi} dpi.`
    return
  }
  const emptyText = opts.includeEmptyTiles ? 'including empty tiles' : 'skipping effectively empty tiles'
  pdfExportSummary.textContent = `Tiled PDF: ${opts.squareSizeIn.toFixed(2)} in per grid square, overlap ${opts.overlapSquares} square(s), ${emptyText}.`
}
function applyPdfExportModalStateToInputs(raw){
  const opts = normalizePdfExportOpts(raw)
  if (pdfModeInput) pdfModeInput.value = opts.mode
  if (pdfPaperInput) pdfPaperInput.value = opts.paper
  if (pdfOrientationInput) pdfOrientationInput.value = opts.orientation
  if (pdfSourceInput) pdfSourceInput.value = opts.source === 'viewport' ? 'viewport' : 'map'
  if (pdfPaddingSquaresInput) pdfPaddingSquaresInput.value = String(opts.paddingSquares)
  if (pdfMarginInInput) pdfMarginInInput.value = String(Number(opts.marginIn.toFixed(2)))
  if (pdfRasterDpiInput) pdfRasterDpiInput.value = String(opts.rasterDpi)
  if (pdfRasterDpiOut) pdfRasterDpiOut.textContent = String(opts.rasterDpi)
  if (pdfSquareSizeInInput) pdfSquareSizeInInput.value = String(Number(opts.squareSizeIn.toFixed(2)))
  if (pdfOverlapSquaresInput) pdfOverlapSquaresInput.value = String(opts.overlapSquares)
  if (pdfLabelsInput) pdfLabelsInput.checked = !!opts.labels
  if (pdfTrimMarksInput) pdfTrimMarksInput.checked = !!opts.trimMarks
  if (pdfOverviewInput) pdfOverviewInput.checked = !!opts.overview
  if (pdfIncludeEmptyTilesInput) pdfIncludeEmptyTilesInput.checked = !!opts.includeEmptyTiles
  syncPdfExportModalFormVisibility()
  syncPdfExportModalSummary()
}

function readPdfExportModalInputs(){
  const source = (pdfSourceInput?.value === 'viewport') ? 'viewport' : 'map'
  return normalizePdfExportOpts({
    mode: pdfModeInput?.value || 'tiled',
    paper: pdfPaperInput?.value || 'LETTER',
    orientation: pdfOrientationInput?.value || 'auto',
    source,
    paddingSquares: pdfPaddingSquaresInput?.value,
    marginIn: pdfMarginInInput?.value,
    rasterDpi: pdfRasterDpiInput?.value,
    squareSizeIn: pdfSquareSizeInInput?.value,
    overlapSquares: pdfOverlapSquaresInput?.value,
    labels: !!pdfLabelsInput?.checked,
    trimMarks: !!pdfTrimMarksInput?.checked,
    overview: !!pdfOverviewInput?.checked,
    includeEmptyTiles: !!pdfIncludeEmptyTilesInput?.checked,
  })
}

function syncPdfExportModalFormVisibility(){
  const opts = readPdfExportModalInputs()
  if (pdfTiledSection) pdfTiledSection.classList.toggle('hidden', opts.mode !== 'tiled')
  if (pdfPaddingSquaresInput && pdfSourceInput){
    const shouldDefault = source => String(pdfPaddingSquaresInput.dataset.autofillSource || '') === source
    if (pdfSourceInput.value === 'viewport' && (pdfPaddingSquaresInput.value === '' || shouldDefault('map'))){
      pdfPaddingSquaresInput.value = '0'
      pdfPaddingSquaresInput.dataset.autofillSource = 'viewport'
    } else if (pdfSourceInput.value !== 'viewport' && (pdfPaddingSquaresInput.value === '' || shouldDefault('viewport'))){
      pdfPaddingSquaresInput.value = '1'
      pdfPaddingSquaresInput.dataset.autofillSource = 'map'
    }
  }
}

function syncPdfExportModalSummary(){
  syncPdfExportSummary(readPdfExportModalInputs())
}

function openPdfExportOptionsDialog(){
  if (!pdfExportModal) return Promise.resolve(null)
  applyPdfExportModalStateToInputs(pdfExportDialogState)
  pdfExportModal.classList.remove('hidden')
  pdfExportModal.setAttribute('aria-hidden', 'false')
  document.body.classList.add('modal-open')

  return new Promise((resolve) => {
    let closed = false
    let prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const close = (result) => {
      if (closed) return
      closed = true
      pdfExportModal.classList.add('hidden')
      pdfExportModal.setAttribute('aria-hidden', 'true')
      document.body.classList.remove('modal-open')
      document.body.style.overflow = prevOverflow
      if (result) pdfExportDialogState = normalizePdfExportOpts(result)
      cleanup()
      resolve(result || null)
    }

    const onCancel = () => close(null)
    const onConfirm = () => close(readPdfExportModalInputs())
    const onKeyDown = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onCancel(); return }
      if (e.key === 'Enter'){
        const el = e.target
        const tag = (el && el.tagName) ? el.tagName.toLowerCase() : ''
        if (tag !== 'textarea' && !(tag === 'button' && el.id === 'btnPdfCancel')) {
          e.preventDefault(); onConfirm()
        }
      }
    }
    const onBackdrop = (e) => {
      if (e.target && e.target.closest('[data-pdf-modal-close]')) onCancel()
    }
    const onInput = () => {
      if (pdfRasterDpiOut && pdfRasterDpiInput) pdfRasterDpiOut.textContent = String(Math.round(Number(pdfRasterDpiInput.value) || 220))
      syncPdfExportModalFormVisibility()
      syncPdfExportModalSummary()
    }

    const cleanup = () => {
      btnPdfCancel?.removeEventListener('click', onCancel)
      btnPdfModalClose?.removeEventListener('click', onCancel)
      btnPdfConfirm?.removeEventListener('click', onConfirm)
      pdfExportModal?.removeEventListener('click', onBackdrop)
      pdfExportModal?.removeEventListener('input', onInput)
      pdfExportModal?.removeEventListener('change', onInput)
      window.removeEventListener('keydown', onKeyDown, true)
    }

    btnPdfCancel?.addEventListener('click', onCancel)
    btnPdfModalClose?.addEventListener('click', onCancel)
    btnPdfConfirm?.addEventListener('click', onConfirm)
    pdfExportModal?.addEventListener('click', onBackdrop)
    pdfExportModal?.addEventListener('input', onInput)
    pdfExportModal?.addEventListener('change', onInput)
    window.addEventListener('keydown', onKeyDown, true)

    queueMicrotask(() => (btnPdfConfirm || btnPdfCancel)?.focus())
  })
}

function promptYesNo(message, defaultYes=true){
  const d = defaultYes ? 'y' : 'n'
  const raw = (prompt(`${message} (y/n)`, d) || d).trim().toLowerCase()
  if (!raw) return defaultYes
  if (raw.startsWith('y')) return true
  if (raw.startsWith('n')) return false
  return defaultYes
}
function rowLabelFromIndex(i){
  let n = Math.floor(i)
  let out = ''
  do {
    out = String.fromCharCode(65 + (n % 26)) + out
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return out
}
function pageTileLabel(r, c){ return `${rowLabelFromIndex(r)}${c+1}` }

function snapBoundsToGrid(bounds, paddingSquares=0){
  if (!bounds) return null
  const g = Math.max(1, Number(dungeon.gridSize) || 32)
  const pad = Math.max(0, Number(paddingSquares) || 0) * g
  const b = {
    minx: Number(bounds.minx) - pad,
    miny: Number(bounds.miny) - pad,
    maxx: Number(bounds.maxx) + pad,
    maxy: Number(bounds.maxy) + pad
  }
  b.minx = Math.floor(b.minx / g) * g
  b.miny = Math.floor(b.miny / g) * g
  b.maxx = Math.ceil(b.maxx / g) * g
  b.maxy = Math.ceil(b.maxy / g) * g
  if (!(b.maxx > b.minx) || !(b.maxy > b.miny)) return null
  return b
}

function getViewportWorldBounds(options = {}){
  if (!(W > 0 && H > 0 && camera.zoom > 0)) return null
  const base = {
    minx: -camera.x,
    miny: -camera.y,
    maxx: -camera.x + (W / camera.zoom),
    maxy: -camera.y + (H / camera.zoom)
  }
  return snapBoundsToGrid(base, options.paddingSquares || 0)
}

function getExportWorldBounds(options = {}){
  if (options && options.source === 'viewport') return getViewportWorldBounds(options)

  const cache = ensureCompiled()
  let b = null
  if (cache?.contentBounds) b = unionBounds(b, cache.contentBounds)
  else if (cache?.bounds) b = unionBounds(b, cache.bounds)

  if (Array.isArray(placedProps)){
    for (const a of placedProps){
      if (!a) continue
      b = unionBounds(b, getPropWorldAABB(a))
    }
  }
  if (!b) return null

  const g = Math.max(1, Number(dungeon.gridSize) || 32)
  const wallPad = Math.max(0, Number(dungeon.style?.wallWidth || 6)) * 0.75
  const shadowPad = !!(dungeon.style?.shadow?.enabled) ? Math.max(0, Number(dungeon.style?.shadow?.length || 0)) + 4 : 0
  const basePad = Math.max(g * 0.5, wallPad + shadowPad)
  const userPad = Math.max(0, Number(options.paddingSquares || 0)) * g
  const pad = basePad + userPad

  b = { minx: b.minx - pad, miny: b.miny - pad, maxx: b.maxx + pad, maxy: b.maxy + pad }
  b.minx = Math.floor(b.minx / g) * g
  b.miny = Math.floor(b.miny / g) * g
  b.maxx = Math.ceil(b.maxx / g) * g
  b.maxy = Math.ceil(b.maxy / g) * g

  if (!(b.maxx > b.minx) || !(b.maxy > b.miny)) return null
  return b
}

function drawPdfTrimMarks(pdf, pageMm, rectMm){
  const x = rectMm.x, y = rectMm.y, w = rectMm.w, h = rectMm.h
  if (!(w > 0 && h > 0)) return
  const mark = 4
  const gap = 1
  pdf.setDrawColor(90, 90, 90)
  pdf.setLineWidth(0.2)
  const segs = [
    [x-gap-mark, y, x-gap, y], [x, y-gap-mark, x, y-gap],
    [x+w+gap, y, x+w+gap+mark, y], [x+w, y-gap-mark, x+w, y-gap],
    [x-gap-mark, y+h, x-gap, y+h], [x, y+h+gap, x, y+h+gap+mark],
    [x+w+gap, y+h, x+w+gap+mark, y+h], [x+w, y+h+gap, x+w, y+h+gap+mark],
  ]
  for (const [x1,y1,x2,y2] of segs){
    if (Math.min(x1,x2) < 0 || Math.max(x1,x2) > pageMm.w || Math.min(y1,y2) < 0 || Math.max(y1,y2) > pageMm.h) continue
    pdf.line(x1,y1,x2,y2)
  }
}

async function collectPdfExportOptions(){
  if (pdfExportModal) {
    const opts = await openPdfExportOptionsDialog()
    return opts ? normalizePdfExportOpts(opts) : null
  }

  // Fallback for environments where the modal markup is unavailable.
  const modeRaw = (prompt('PDF export mode: tiled or single', 'tiled') || 'tiled').trim().toLowerCase()
  const mode = modeRaw.startsWith('s') ? 'single' : 'tiled'

  const paperRaw = (prompt('Paper size (Letter or A4)', 'Letter') || 'Letter').trim().toUpperCase()
  const paper = (paperRaw === 'A4') ? 'A4' : 'LETTER'

  const orientRaw = (prompt('Orientation (auto / portrait / landscape)', 'auto') || 'auto').trim().toLowerCase()
  const orientation = orientRaw.startsWith('p') ? 'portrait' : orientRaw.startsWith('l') ? 'landscape' : 'auto'

  const sourceRaw = (prompt('Content area: map bounds or viewport', 'map bounds') || 'map bounds').trim().toLowerCase()
  const source = (sourceRaw.includes('view') || sourceRaw.includes('canvas')) ? 'viewport' : 'map'

  const paddingDefault = source === 'map' ? '1' : '0'
  const paddingSquares = Math.max(0, Number(prompt('Padding around export bounds (grid squares)', paddingDefault)) || 0)
  const marginIn = clampNum(Number(prompt('Margins (inches)', '0.25')) || 0.25, 0, 2)
  const rasterDpi = clampNum(Number(prompt('PDF raster DPI (higher = sharper/larger file)', '220')) || 220, 96, 600)

  if (mode === 'single'){
    return normalizePdfExportOpts({ mode, paper, orientation, source, paddingSquares, marginIn, rasterDpi })
  }

  const squareSizeIn = clampNum(Number(prompt('Square print size in inches (1.0 = standard battlemat)', '1.0')) || 1, 0.1, 5)
  const overlapSquares = Math.max(0, Math.floor(Number(prompt('Tile overlap (grid squares; keeps seams aligned)', '0')) || 0))
  const labels = promptYesNo('Add page labels (A1, A2, B1...)', true)
  const trimMarks = promptYesNo('Add cut/trim marks', true)
  const overview = promptYesNo('Add assembly overview page', true)
  const includeEmptyTiles = promptYesNo('Include effectively empty tiles', false)

  return normalizePdfExportOpts({
    mode, paper, orientation, source, paddingSquares, marginIn, rasterDpi,
    squareSizeIn, overlapSquares, labels, trimMarks, overview, includeEmptyTiles
  })
}

function getPaperPageInches(paperKey){
  if (paperKey === 'A4') return { w: mmToInches(210), h: mmToInches(297), format: 'a4' }
  return { w: 8.5, h: 11, format: 'letter' }
}

function choosePageLayoutForTiling(opts, mapSquares){
  const paper = getPaperPageInches(opts.paper)
  const overlap = Math.max(0, Math.floor(opts.overlapSquares || 0))

  const candidates = []
  const orientations = opts.orientation === 'auto' ? ['portrait', 'landscape'] : [opts.orientation]

  for (const orientation of orientations){
    const pageIn = orientation === 'landscape' ? { w: paper.h, h: paper.w } : { w: paper.w, h: paper.h }
    const printable = { w: pageIn.w - 2*opts.marginIn, h: pageIn.h - 2*opts.marginIn }
    const capX = Math.floor(printable.w / opts.squareSizeIn)
    const capY = Math.floor(printable.h / opts.squareSizeIn)
    if (capX < 1 || capY < 1) continue
    const stepX = Math.max(1, capX - overlap)
    const stepY = Math.max(1, capY - overlap)
    const cols = (mapSquares.w <= capX) ? 1 : (1 + Math.ceil((mapSquares.w - capX) / stepX))
    const rows = (mapSquares.h <= capY) ? 1 : (1 + Math.ceil((mapSquares.h - capY) / stepY))
    candidates.push({
      orientation,
      paperFormat: paper.format,
      pageIn,
      printableIn: printable,
      capX, capY, stepX, stepY,
      cols, rows,
      pages: cols * rows
    })
  }

  if (!candidates.length) return null
  candidates.sort((a,b) => {
    if (a.pages !== b.pages) return a.pages - b.pages
    const aCap = a.capX * a.capY, bCap = b.capX * b.capY
    if (aCap !== bCap) return bCap - aCap
    return (b.printableIn.w*b.printableIn.h) - (a.printableIn.w*a.printableIn.h)
  })
  return candidates[0]
}

function buildTileGrid(bounds, layout){
  const g = Math.max(1, Number(dungeon.gridSize) || 32)
  const totalSqW = Math.max(1, Math.round((bounds.maxx - bounds.minx) / g))
  const totalSqH = Math.max(1, Math.round((bounds.maxy - bounds.miny) / g))
  const tiles = []

  for (let r=0; r<layout.rows; r++){
    for (let c=0; c<layout.cols; c++){
      const startSqX = c * layout.stepX
      const startSqY = r * layout.stepY
      const tileSqW = Math.max(0, Math.min(layout.capX, totalSqW - startSqX))
      const tileSqH = Math.max(0, Math.min(layout.capY, totalSqH - startSqY))
      if (tileSqW <= 0 || tileSqH <= 0) continue
      const minx = bounds.minx + startSqX * g
      const miny = bounds.miny + startSqY * g
      const maxx = minx + tileSqW * g
      const maxy = miny + tileSqH * g
      tiles.push({
        r, c,
        label: pageTileLabel(r,c),
        sqX: startSqX, sqY: startSqY,
        sqW: tileSqW, sqH: tileSqH,
        world: { minx, miny, maxx, maxy }
      })
    }
  }
  return { totalSqW, totalSqH, tiles }
}

function rectsIntersect(a, b){
  if (!a || !b) return false
  return a.minx < b.maxx && a.maxx > b.minx && a.miny < b.maxy && a.maxy > b.miny
}

function tileHasVisibleInterior(tileWorld, cache){
  if (!cache?.maskCanvas || !cache?.bounds || !rectsIntersect(tileWorld, cache.bounds)) return false
  const ppu = Number(cache.ppu) || 1
  const x0 = Math.max(0, Math.floor((tileWorld.minx - cache.bounds.minx) * ppu))
  const y0 = Math.max(0, Math.floor((tileWorld.miny - cache.bounds.miny) * ppu))
  const x1 = Math.min(cache.maskCanvas.width, Math.ceil((tileWorld.maxx - cache.bounds.minx) * ppu))
  const y1 = Math.min(cache.maskCanvas.height, Math.ceil((tileWorld.maxy - cache.bounds.miny) * ppu))
  const w = x1 - x0, h = y1 - y0
  if (w <= 0 || h <= 0) return false
  const mctx = cache.maskCanvas.getContext('2d', { willReadFrequently: true })
  const data = mctx.getImageData(x0, y0, w, h).data
  for (let i = 3; i < data.length; i += 4){
    if (data[i] > 8) return true
  }
  return false
}

function tileHasPlacedProp(tileWorld){
  if (!Array.isArray(placedProps) || placedProps.length === 0) return false
  for (const p of placedProps){
    if (!p) continue
    const b = getPropWorldAABB(p)
    if (rectsIntersect(tileWorld, b)) return true
  }
  return false
}

function tileHasPrintableContent(tileWorld, cache){
  return tileHasVisibleInterior(tileWorld, cache) || tileHasPlacedProp(tileWorld)
}

function renderTileCanvasForWorld(tileWorld, pxPerSquare){
  const g = Math.max(1, Number(dungeon.gridSize) || 32)
  const sqW = Math.max(1, Math.round((tileWorld.maxx - tileWorld.minx) / g))
  const sqH = Math.max(1, Math.round((tileWorld.maxy - tileWorld.miny) / g))
  const tilePxW = Math.max(64, Math.round(sqW * pxPerSquare))
  const tilePxH = Math.max(64, Math.round(sqH * pxPerSquare))
  const out = document.createElement('canvas')
  out.width = tilePxW
  out.height = tilePxH
  renderSceneToCanvasForBounds(out, tileWorld)
  return out
}

function drawPdfOverviewPage(pdf, pageMm, opts, layout, tileData, printedTileLabels = null){
  const margin = 12
  const headerY = 16
  const gridTop = 42
  const footerPad = 18
  const usableW = pageMm.w - margin*2
  const usableH = pageMm.h - gridTop - margin - footerPad
  const scale = Math.max(0.1, Math.min(usableW / layout.cols, usableH / layout.rows))
  const gridW = layout.cols * scale
  const gridH = layout.rows * scale
  const x0 = (pageMm.w - gridW) / 2
  const y0 = gridTop

  pdf.setFontSize(16)
  pdf.setTextColor(20,25,30)
  pdf.text('Dungeon Sketch — Tiled PDF Assembly', margin, headerY)

  pdf.setFontSize(9)
  const meta1 = `Paper: ${opts.paper === 'A4' ? 'A4' : 'Letter'}  •  Orientation: ${layout.orientation}  •  Square size: ${opts.squareSizeIn.toFixed(2)} in`
  const printedCount = printedTileLabels ? tileData.tiles.filter(t => printedTileLabels.has(t.label)).length : tileData.tiles.length
  const skippedCount = Math.max(0, tileData.tiles.length - printedCount)
  const meta2 = `Pages: ${layout.rows} × ${layout.cols} = ${printedCount}${skippedCount ? ` printed (+${skippedCount} skipped empty)` : ''}  •  Tile overlap: ${opts.overlapSquares} square(s)`
  pdf.text(meta1, margin, headerY + 8)
  pdf.text(meta2, margin, headerY + 14)

  pdf.setDrawColor(120,120,120)
  pdf.setLineWidth(0.25)
  pdf.setFillColor(235,238,242)

  for (let r=0; r<layout.rows; r++){
    for (let c=0; c<layout.cols; c++){
      const x = x0 + c*scale
      const y = y0 + r*scale
      const label = pageTileLabel(r,c)
      const printed = !printedTileLabels || printedTileLabels.has(label)
      if (printed) {
        pdf.setFillColor(235,238,242)
        pdf.setTextColor(35,40,45)
      } else {
        pdf.setFillColor(246,246,247)
        pdf.setTextColor(160,165,172)
      }
      pdf.rect(x, y, scale, scale, 'FD')
      if (!printed) {
        pdf.setDrawColor(205,208,212)
        pdf.setLineWidth(0.2)
        pdf.line(x+1, y+1, x+scale-1, y+scale-1)
        pdf.line(x+scale-1, y+1, x+1, y+scale-1)
        pdf.setDrawColor(120,120,120)
        pdf.setLineWidth(0.25)
      }
      pdf.setFontSize(Math.max(7, Math.min(14, scale * 0.35)))
      pdf.text(label, x + scale/2, y + scale/2 + 1.5, { align: 'center' })
    }
  }

  pdf.setDrawColor(80,80,80)
  pdf.setLineWidth(0.5)
  pdf.rect(x0, y0, gridW, gridH)

  pdf.setFontSize(8)
  pdf.setTextColor(80,80,80)
  const footerMsg = opts.includeEmptyTiles
    ? 'Print at 100% / Actual Size (disable "Fit to page") for accurate square sizing.'
    : 'Print at 100% / Actual Size. Empty tiles are skipped unless enabled in PDF settings.'
  pdf.text(footerMsg, margin, pageMm.h - 8)
}

async function exportSinglePagePDFWithOptions(jsPDF, opts){
  const bounds = getExportWorldBounds({ source: opts.source === 'viewport' ? 'viewport' : 'map', paddingSquares: opts.paddingSquares })
  if (!bounds){
    alert('Draw something first.')
    return
  }

  const paper = getPaperPageInches(opts.paper)
  const orientations = opts.orientation === 'auto' ? ['portrait', 'landscape'] : [opts.orientation]
  let best = null
  const worldW = bounds.maxx - bounds.minx
  const worldH = bounds.maxy - bounds.miny
  for (const orientation of orientations){
    const pageIn = orientation === 'landscape' ? { w: paper.h, h: paper.w } : { w: paper.w, h: paper.h }
    const printableIn = { w: pageIn.w - 2*opts.marginIn, h: pageIn.h - 2*opts.marginIn }
    if (printableIn.w <= 0 || printableIn.h <= 0) continue
    const fitScale = Math.min(printableIn.w / worldW, printableIn.h / worldH)
    if (!best || fitScale > best.fitScale) best = { orientation, pageIn, printableIn, fitScale }
  }
  if (!best) throw new Error('Margins too large for selected paper size')

  const pageMm = { w: inchesToMm(best.pageIn.w), h: inchesToMm(best.pageIn.h) }
  const marginMm = inchesToMm(opts.marginIn)
  const targetMmW = worldW * best.fitScale * 25.4
  const targetMmH = worldH * best.fitScale * 25.4
  const xMm = marginMm + (inchesToMm(best.printableIn.w) - targetMmW) * 0.5
  const yMm = marginMm + (inchesToMm(best.printableIn.h) - targetMmH) * 0.5

  const pxW = Math.max(800, Math.round((targetMmW / 25.4) * opts.rasterDpi))
  const pxH = Math.max(800, Math.round((targetMmH / 25.4) * opts.rasterDpi))
  const out = document.createElement('canvas')
  out.width = pxW
  out.height = pxH
  renderSceneToCanvasForBounds(out, bounds)

  const pdf = new jsPDF({
    orientation: best.orientation,
    unit: 'mm',
    format: paper.format,
    compress: true
  })
  pdf.addImage(out.toDataURL('image/png'), 'PNG', xMm, yMm, targetMmW, targetMmH, undefined, 'FAST')
  pdf.setFontSize(9)
  pdf.setTextColor(80,80,80)
  pdf.text('Single-page export (fit to page).', marginMm, pageMm.h - Math.max(4, marginMm * 0.5))
  pdf.save('dungeon-map-single-page.pdf')
}

async function exportTiledScalePDFWithOptions(jsPDF, opts){
  const bounds = getExportWorldBounds({ source: opts.source === 'viewport' ? 'viewport' : 'map', paddingSquares: opts.paddingSquares })
  if (!bounds){
    alert('Draw something first.')
    return
  }

  const g = Math.max(1, Number(dungeon.gridSize) || 32)
  const mapSquares = {
    w: Math.max(1, Math.round((bounds.maxx - bounds.minx) / g)),
    h: Math.max(1, Math.round((bounds.maxy - bounds.miny) / g))
  }

  const layout = choosePageLayoutForTiling(opts, mapSquares)
  if (!layout) {
    alert(`Square size (${opts.squareSizeIn.toFixed(2)} in) is too large for the chosen paper + margins.`)
    return
  }

  const tileData = buildTileGrid(bounds, layout)
  let tilesToPrint = tileData.tiles
  if (!opts.includeEmptyTiles) {
    const cache = ensureCompiled()
    tilesToPrint = tileData.tiles.filter(tile => tileHasPrintableContent(tile.world, cache))
  }
  if (!tilesToPrint.length) {
    alert('No printable tiles found in the selected export area. Try enabling “Include effectively empty pages” or adjusting bounds.')
    return
  }
  const printedTileLabels = new Set(tilesToPrint.map(t => t.label))

  const pageMm = { w: inchesToMm(layout.pageIn.w), h: inchesToMm(layout.pageIn.h) }
  const marginMm = inchesToMm(opts.marginIn)
  const pxPerSquare = clampNum(Math.round(opts.rasterDpi * opts.squareSizeIn), 24, 2400)

  const pdf = new jsPDF({
    orientation: layout.orientation,
    unit: 'mm',
    format: layout.paperFormat,
    compress: true
  })
  let writtenPages = 0
  const startPage = () => { if (writtenPages > 0) pdf.addPage(); writtenPages++ }

  if (opts.overview){
    startPage()
    drawPdfOverviewPage(pdf, pageMm, opts, layout, tileData, printedTileLabels)
  }

  for (let i = 0; i < tilesToPrint.length; i++){
    const tile = tilesToPrint[i]
    startPage()

    const tileCanvas = renderTileCanvasForWorld(tile.world, pxPerSquare)
    const tileMmW = inchesToMm(tile.sqW * opts.squareSizeIn)
    const tileMmH = inchesToMm(tile.sqH * opts.squareSizeIn)
    const imgX = marginMm
    const imgY = marginMm

    pdf.addImage(tileCanvas.toDataURL('image/png'), 'PNG', imgX, imgY, tileMmW, tileMmH, undefined, 'FAST')

    if (opts.trimMarks) drawPdfTrimMarks(pdf, pageMm, { x: imgX, y: imgY, w: tileMmW, h: tileMmH })

    if (opts.labels){
      pdf.setFontSize(10)
      pdf.setTextColor(20,25,30)
      const topLabel = `${tile.label}  (${tile.r + 1},${tile.c + 1})`
      pdf.text(topLabel, pageMm.w - marginMm, Math.max(6, marginMm * 0.7), { align: 'right' })
      pdf.setFontSize(8)
      pdf.setTextColor(90,90,90)
      pdf.text(
        `Tile ${i+1}/${tilesToPrint.length} • ${tile.sqW}×${tile.sqH} squares • scale ${opts.squareSizeIn.toFixed(2)} in/square`,
        marginMm,
        pageMm.h - Math.max(4, marginMm * 0.55)
      )
    }
  }

  const sqLabel = String(opts.squareSizeIn).replace(/\./g, '_')
  pdf.save(`dungeon-map-tiled-${sqLabel}in.pdf`)
}

async function exportMultipagePDF(){
  const cache = ensureCompiled()
  const hasMap = cache && (Array.isArray(dungeon.spaces) || Array.isArray(dungeon.paths) || Array.isArray(dungeon.shapes))
  if (!hasMap) {
    // still allow viewport exports if props-only, but keep quick guard friendly
  }

  const jsPDF = await ensureJsPDF()
  const opts = await collectPdfExportOptions()
  if (!opts) return

  if (opts.mode === 'single') return exportSinglePagePDFWithOptions(jsPDF, opts)
  return exportTiledScalePDFWithOptions(jsPDF, opts)
}

// drafting states
let draft = null          // {type:'path', points:[]}
let draftRect = null      // {a,b}
let freeDraw = null       // [{x,y}...]
let draftShape = null     // {center, radius, rotation, sides}
let selectedShapeId = null
let shapeDrag = null      // {mode:'move'|'handle', id, startWorld, startCenter, startRadius, startRot}
let eraseStroke = null     // {cells: Map<key,{gx,gy}>}
normalizeEditSequences()

function finishTool(){
  if (tool === "path" || tool === "poly") {
    if (draft && draft.type === "path" && draft.points.length>=2) {
      pushUndo()
      dungeon.paths.push({ id: crypto.randomUUID(), seq: nextEditSeq(), mode: currentDrawMode(), points: draft.points })
      draft = null
    }
  }
  // poly tool doesn't need finish (created on drag), but keep for symmetry
}

function simplifyFree(points, minDist=7){
  if(points.length<3) return points
  const out=[points[0]]
  for (let i=1;i<points.length;i++){
    if (dist(points[i], out[out.length-1]) >= minDist) out.push(points[i])
  }
  return out
}

function subGrid(){ return dungeon.gridSize / (dungeon.subSnapDiv || 4) }
function currentDrawMode(){ return underMode ? "subtract" : "add" }

function rectPolyKey(poly){
  if (!Array.isArray(poly) || poly.length !== 4) return null
  const xs = poly.map(p => Number(p.x))
  const ys = poly.map(p => Number(p.y))
  if (xs.some(v=>!Number.isFinite(v)) || ys.some(v=>!Number.isFinite(v))) return null
  const minx = Math.min(...xs), maxx = Math.max(...xs)
  const miny = Math.min(...ys), maxy = Math.max(...ys)
  const corners = new Set([`${minx},${miny}`,`${maxx},${miny}`,`${maxx},${maxy}`,`${minx},${maxy}`])
  const pts = new Set(poly.map(p => `${Number(p.x)},${Number(p.y)}`))
  if (pts.size !== 4 || corners.size !== 4) return null
  for (const c of corners) if (!pts.has(c)) return null
  return `${minx},${miny},${maxx},${maxy}`
}

function commitSpacePolygon(poly, mode=currentDrawMode()){
  const key = rectPolyKey(poly)
  if (!key){
    dungeon.spaces.push({ id: crypto.randomUUID(), seq: nextEditSeq(), mode, polygon: poly })
    return true
  }
  for (let i=dungeon.spaces.length-1; i>=0; i--){
    const s = dungeon.spaces[i]
    const sk = rectPolyKey(s && s.polygon)
    if (sk !== key) continue
    if ((s.mode || "add") === mode){
      // exact duplicate rectangle in same mode -> ignore
      return false
    }
    // exact opposite rectangle exists -> latest action wins (replace prior)
    dungeon.spaces.splice(i, 1)
    dungeon.spaces.push({ id: crypto.randomUUID(), seq: nextEditSeq(), mode, polygon: poly })
    return true
  }
  dungeon.spaces.push({ id: crypto.randomUUID(), seq: nextEditSeq(), mode, polygon: poly })
  return true
}

function getCellAt(world){
  const g = subGrid()
  return { gx: Math.floor(world.x / g), gy: Math.floor(world.y / g) }
}
function cellKey(gx, gy){ return `${gx},${gy}` }
function cellRectFromGrid(gx, gy){
  const g = subGrid()
  const x = gx * g, y = gy * g
  return [{x,y},{x:x+g,y},{x:x+g,y:y+g},{x,y:y+g}]
}
function addEraseCell(erase, gx, gy){
  const key = cellKey(gx, gy)
  if (!erase.cells.has(key)) erase.cells.set(key, { gx, gy })
}
function addEraseLine(erase, aCell, bCell){
  const dx = bCell.gx - aCell.gx
  const dy = bCell.gy - aCell.gy
  const steps = Math.max(Math.abs(dx), Math.abs(dy), 1)
  for (let i=0;i<=steps;i++){
    const t = i / steps
    const gx = Math.round(aCell.gx + dx * t)
    const gy = Math.round(aCell.gy + dy * t)
    addEraseCell(erase, gx, gy)
  }
}
function rebuildEraseRect(erase, aCell, bCell){
  if (!erase || !aCell || !bCell) return
  erase.cells.clear()
  const minGX = Math.min(aCell.gx, bCell.gx)
  const maxGX = Math.max(aCell.gx, bCell.gx)
  const minGY = Math.min(aCell.gy, bCell.gy)
  const maxGY = Math.max(aCell.gy, bCell.gy)
  for (let gx = minGX; gx <= maxGX; gx++){
    for (let gy = minGY; gy <= maxGY; gy++){
      addEraseCell(erase, gx, gy)
    }
  }
}

function getPointerPos(e){
  const r = canvas.getBoundingClientRect()
  const sx = (r.width > 0 ? (W / r.width) : 1)
  const sy = (r.height > 0 ? (H / r.height) : 1)
  if (typeof e.clientX === "number" && typeof e.clientY === "number"){
    return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy }
  }
  if (typeof e.offsetX === "number" && typeof e.offsetY === "number"){
    return { x: e.offsetX * sx, y: e.offsetY * sy }
  }
  return { x: lastCursorScreen.x, y: lastCursorScreen.y }
}

function pointInsideCanvasClient(clientX, clientY){
  const r = canvas.getBoundingClientRect()
  return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom
}

function getDraggedPropIdFromEvent(e){
  try {
    return (e.dataTransfer && (e.dataTransfer.getData("application/x-dungeon-prop-id") || e.dataTransfer.getData("text/plain"))) || dragPropId || null
  } catch {
    return dragPropId || null
  }
}

function maybeHandlePropDrop(e){
  const pid = getDraggedPropIdFromEvent(e)
  if (!pid) return false
  if (typeof e.clientX === 'number' && typeof e.clientY === 'number' && !pointInsideCanvasClient(e.clientX, e.clientY)) return false
  e.preventDefault()
  const pos = getPointerPos(e)
  if (placePropAtScreenById(pid, pos)) {
    // Keep the asset armed so the user can place multiple copies until they deselect it.
    dragPropId = null
    renderPropsShelf()
    return true
  }
  return false
}

function zoomAt(screenPt, factor){
  const sp = (screenPt && Number.isFinite(screenPt.x) && Number.isFinite(screenPt.y))
    ? screenPt
    : { x: W * 0.5, y: H * 0.5 }
  const before = camera.screenToWorld(sp)
  camera.zoom = camera.clampZoom(camera.zoom * factor)
  const after = camera.screenToWorld(sp)
  // Keep the world point under the cursor fixed after zooming.
  camera.x += after.x - before.x
  camera.y += after.y - before.y
}

// Navigation
const pointers = new Map()
let gesture=null
let panDrag=null
let lastCursorScreen = { x: 0, y: 0 }
window.addEventListener("pointermove", (e)=>{
  if (typeof e.clientX !== "number" || typeof e.clientY !== "number") return
  if (!pointInsideCanvasClient(e.clientX, e.clientY)) return
  lastCursorScreen = getPointerPos(e)
})
canvas.addEventListener("contextmenu", (e)=>{
  e.preventDefault()
  const screen = getPointerPos(e)
  const world = camera.screenToWorld(screen)

  if (textEditorState && textEditOverlay && !textEditOverlay.contains(e.target)) {
    commitActiveTextEditor()
  }
  const picked = pickPlacedPropAtWorld(world)
  if (!picked) return
  pushUndo()
  picked.shadowDisabled = !(picked.shadowDisabled === true)
  selectedPropId = picked.id
  selectedTextId = null
  propTransformDrag = null
  syncTextPanelVisibility()
})
canvas.addEventListener("dragover", (e)=>{
  if (!getDraggedPropIdFromEvent(e)) return
  e.preventDefault()
  try { if (e.dataTransfer) e.dataTransfer.dropEffect = "copy" } catch {}
})
canvas.addEventListener("drop", (e)=>{
  maybeHandlePropDrop(e)
})
// Fallback: if the drag lands on a non-canvas overlay element, still place onto the canvas at cursor position.
window.addEventListener("dragover", (e)=>{
  if (!getDraggedPropIdFromEvent(e)) return
  if (typeof e.clientX === 'number' && typeof e.clientY === 'number' && pointInsideCanvasClient(e.clientX, e.clientY)) {
    e.preventDefault()
    try { if (e.dataTransfer) e.dataTransfer.dropEffect = "copy" } catch {}
  }
})
window.addEventListener("drop", (e)=>{
  maybeHandlePropDrop(e)
})
canvas.addEventListener("wheel", (e)=>{
  e.preventDefault()
  const sp = getPointerPos(e)
  lastCursorScreen = sp
  const isZoom = e.ctrlKey || e.metaKey || e.altKey
  if (isZoom) {
    zoomAt(sp, Math.exp(-e.deltaY * 0.0015))
  } else {
    camera.x -= e.deltaX / camera.zoom
    camera.y -= e.deltaY / camera.zoom
  }
},{passive:false})

window.addEventListener("keydown", (e)=>{
  if (textEditorState && e.key === "Escape") { e.preventDefault(); cancelActiveTextEditor(); return }
  const accel = e.metaKey || e.ctrlKey
  if (accel && !e.altKey){
    const k = (e.key || "").toLowerCase()
    if (k === "z" && e.shiftKey){ e.preventDefault(); redo(); return }
    if (k === "z"){ e.preventDefault(); undo(); return }
    if (k === "y"){ e.preventDefault(); redo(); return }
  }
  const tag = (document.activeElement && document.activeElement.tagName || "").toLowerCase()
  if (tag === "input" || tag === "textarea") return
  if ((e.key === "t" || e.key === "T") && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); setTool("text") ; return }
  if (e.key === "Enter" && selectedTextId) { e.preventDefault(); if (!textEditorState) { pushUndo(); openTextEditorFor(selectedTextId, { isNew:false, undoPushed:true }) } return }
  if ((e.key === "Delete" || e.key === "Backspace") && selectedPropId){
    const idx = placedProps.findIndex(p => p && p.id === selectedPropId)
    if (idx >= 0){
      e.preventDefault()
      pushUndo()
      placedProps.splice(idx, 1)
      selectedPropId = null
      return
    }
  }
  if ((e.key === "Delete" || e.key === "Backspace") && selectedTextId){
    const idx = placedTexts.findIndex(t => t && t.id === selectedTextId)
    if (idx >= 0){
      e.preventDefault()
      pushUndo()
      placedTexts.splice(idx, 1)
      selectedTextId = null
      syncTextPanelVisibility()
      return
    }
  }
  if ((e.key === "Delete" || e.key === "Backspace") && selectedShapeId){
    const idx = dungeon.shapes.findIndex(sh => sh && sh.id === selectedShapeId)
    if (idx >= 0){
      e.preventDefault()
      pushUndo()
      dungeon.shapes.splice(idx, 1)
      selectedShapeId = null
      shapeDrag = null
      return
    }
  }
  if ((e.key === "+" || e.key === "=") && !e.metaKey && !e.ctrlKey) {
    e.preventDefault()
    zoomAt(lastCursorScreen, 1.12)
  } else if ((e.key === "-" || e.key === "_") && !e.metaKey && !e.ctrlKey) {
    e.preventDefault()
    zoomAt(lastCursorScreen, 1/1.12)
  }
})

// Shape helpers
function regularPolygon(center, sides, radius, rotation){
  const pts=[]
  for (let i=0;i<sides;i++){
    const a = rotation + i * 2*Math.PI/sides
    pts.push({ x: center.x + Math.cos(a)*radius, y: center.y + Math.sin(a)*radius })
  }
  return pts
}
function updateShapePoly(sh){
  sh._poly = regularPolygon(sh.center, sh.sides, sh.radius, sh.rotation)
}
function hitShape(worldPt, sh){
  const dx = worldPt.x - sh.center.x
  const dy = worldPt.y - sh.center.y
  return Math.hypot(dx,dy) <= sh.radius * 1.05
}
function shapeHandleWorld(sh){
  // handle at first vertex
  const a = sh.rotation
  return { x: sh.center.x + Math.cos(a)*sh.radius, y: sh.center.y + Math.sin(a)*sh.radius }
}
function hitHandle(worldPt, sh){
  const h = shapeHandleWorld(sh)
  return Math.hypot(worldPt.x-h.x, worldPt.y-h.y) <= dungeon.gridSize*0.5
}

// Input
canvas.addEventListener("pointerdown", (e)=>{
  canvas.setPointerCapture(e.pointerId)
  pointers.set(e.pointerId, getPointerPos(e))

  if (e.pointerType==="mouse" && (e.button===1 || e.button===2)){
    panDrag = { start:{x:e.clientX,y:e.clientY}, cam:{x:camera.x,y:camera.y} }
    draftRect=null; freeDraw=null; draft=null; draftShape=null; shapeDrag=null; propTransformDrag=null; eraseStroke=null
    return
  }
  if (pointers.size===2){
    const [a,b]=Array.from(pointers.values())
    const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2}
    const dd=Math.hypot(a.x-b.x,a.y-b.y)
    gesture={ lastDist:Math.max(dd, 0.0001), lastMid:mid }
    draftRect=null; freeDraw=null; draft=null; draftShape=null; shapeDrag=null; propTransformDrag=null; eraseStroke=null
    return
  }

  const screen = getPointerPos(e)
  const world = camera.screenToWorld(screen)

  // Armed asset placement works in any tool (including Select) and stays armed until deselected.
  if (armedPropId){
    const beforeCount = placedProps.length
    placePropAtWorld(getPropById(armedPropId), world)
    if (placedProps.length > beforeCount){
      renderPropsShelf()
      resetTransientDrafts()
      return
    }
  }

  // Select tool: move text / props
  if (tool === "select") {
    const pickedText = pickTextAtScreen(screen)
    if (pickedText){
      selectedTextId = pickedText.id
      selectedPropId = null
      selectedShapeId = null
      syncTextPanelVisibility()
      pushUndo()
      textDrag = { id:pickedText.id, startWorld:world, startX:pickedText.x, startY:pickedText.y, changed:false, pushedUndo:true }
      return
    }
    const picked = pickPlacedPropAtWorld(world)
    if (!picked){
      selectedPropId = null
      selectedTextId = null
      propTransformDrag = null
      textDrag = null
      syncTextPanelVisibility()
      return
    }
    selectedTextId = null
    selectedPropId = picked.id
    syncTextPanelVisibility()
    const onHandle = hitPlacedPropRotateHandle(world, picked)
    pushUndo()
    propTransformDrag = onHandle
      ? { mode:"rotate", id:picked.id, startWorld:world, startRot:Number(picked.rot || 0) || 0, startAngle:Math.atan2(world.y - picked.y, world.x - picked.x), changed:false, pushedUndo:true }
      : { mode:"move", id:picked.id, startWorld:world, startX:picked.x, startY:picked.y, changed:false, pushedUndo:true }
    return
  }

  // Text tool: click existing text to select/drag, otherwise place a new label and edit inline
  if (tool === "text"){
    if (textEditorState) commitActiveTextEditor()
    const pickedText = pickTextAtScreen(screen)
    if (pickedText){
      selectedTextId = pickedText.id
      selectedPropId = null
      selectedShapeId = null
      syncTextPanelVisibility()
      pushUndo()
      textDrag = { id:pickedText.id, startWorld:world, startX:pickedText.x, startY:pickedText.y, changed:false, pushedUndo:true }
      return
    }
    pushUndo()
    const t = createTextAtWorld(world)
    syncTextPanelVisibility()
    openTextEditorFor(t.id, { isNew:true, undoPushed:true })
    return
  }

  // Poly tool: create/select/drag parametric shape
  if (tool === "poly"){
    // try select existing
    const found = dungeon.shapes.slice().reverse().find(sh => hitHandle(world, sh) || hitShape(world, sh))
    if (found){
      selectedShapeId = found.id
      if (hitHandle(world, found)){
        shapeDrag = { mode:"handle", id:found.id, startWorld:world, startCenter:{...found.center}, startRadius:found.radius, startRot:found.rotation }
      } else {
        shapeDrag = { mode:"move", id:found.id, startWorld:world, startCenter:{...found.center} }
      }
      return
    }
    // create new on drag
    const c = snapSoft(world, subGrid(), dungeon.style.snapStrength)
    draftShape = { center:c, radius:dungeon.gridSize*2, rotation:-Math.PI/6, sides:getPolySidesValue() }
    return
  }

  selectedShapeId = null
  selectedPropId = null
  selectedTextId = null
  syncTextPanelVisibility()
  if (tool === "erase"){
    const w = camera.screenToWorld(screen)
    draftRect = { a:w, b:w }
    eraseStroke = null
    return
  }

  selectedShapeId = null

  if (tool === "space"){
    const w = camera.screenToWorld(screen)
    draftRect = { a:w, b:w }
  } else if (tool === "free"){
    freeDraw = [ snapSoft(world, subGrid(), dungeon.style.snapStrength) ]
  }
})

canvas.addEventListener("pointermove", (e)=>{
  if (!pointers.has(e.pointerId)) return
  const pos = getPointerPos(e)
  pointers.set(e.pointerId, pos)

  if (panDrag){
    const dx = (e.clientX - panDrag.start.x)/camera.zoom
    const dy = (e.clientY - panDrag.start.y)/camera.zoom
    camera.x = panDrag.cam.x + dx
    camera.y = panDrag.cam.y + dy
    return
  }
  if (gesture && pointers.size===2){
    const [a,b]=Array.from(pointers.values())
    const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2}
    const dd=Math.max(Math.hypot(a.x-b.x,a.y-b.y), 0.0001)

    // Two-finger pan follows the pinch midpoint.
    if (gesture.lastMid){
      const mdx = mid.x - gesture.lastMid.x
      const mdy = mid.y - gesture.lastMid.y
      camera.x += mdx / camera.zoom
      camera.y += mdy / camera.zoom
    }

    // Zoom around the CURRENT pinch midpoint so the content under the fingers stays put.
    const factor = dd / (gesture.lastDist || dd)
    if (Number.isFinite(factor) && factor > 0){
      zoomAt(mid, factor)
    }

    gesture.lastMid = mid
    gesture.lastDist = dd
    return
  }

  const world = camera.screenToWorld(pos)


  // text drag
  if (textDrag){
    const t = placedTexts.find(v => v && v.id === textDrag.id)
    if (!t) return
    let nx = textDrag.startX + (world.x - textDrag.startWorld.x)
    let ny = textDrag.startY + (world.y - textDrag.startWorld.y)
    const snapped = snapSoft({ x:nx, y:ny }, subGrid(), dungeon.style.snapStrength)
    nx = snapped.x; ny = snapped.y
    if (Math.abs(nx - t.x) > 1e-6 || Math.abs(ny - t.y) > 1e-6) textDrag.changed = true
    t.x = nx; t.y = ny
    return
  }

  // prop transform drag
  if (propTransformDrag){
    const p = getPlacedPropById(propTransformDrag.id)
    if (!p) return
    if (propTransformDrag.mode === "move") {
      let nx = propTransformDrag.startX + (world.x - propTransformDrag.startWorld.x)
      let ny = propTransformDrag.startY + (world.y - propTransformDrag.startWorld.y)
      if (getPropSnapEnabled()) { const snapped = snapPropWorldPoint({ x:nx, y:ny }); nx = snapped.x; ny = snapped.y }
      if (Math.abs(nx - p.x) > 1e-6 || Math.abs(ny - p.y) > 1e-6) propTransformDrag.changed = true
      p.x = nx; p.y = ny
    } else {
      const ang = Math.atan2(world.y - p.y, world.x - p.x)
      const nextRot = rotatePropAngleMaybeSnap((propTransformDrag.startRot || 0) + (ang - propTransformDrag.startAngle))
      if (Math.abs(nextRot - (Number(p.rot || 0) || 0)) > 1e-6) propTransformDrag.changed = true
      p.rot = nextRot
    }
    return
  }

  // shape drag
  if (shapeDrag){
    const sh = dungeon.shapes.find(s=>s.id===shapeDrag.id)
    if (!sh) return
    if (shapeDrag.mode==="move"){
      const dx = world.x - shapeDrag.startWorld.x
      const dy = world.y - shapeDrag.startWorld.y
      const newC = { x: shapeDrag.startCenter.x + dx, y: shapeDrag.startCenter.y + dy }
      sh.center = snapSoft(newC, subGrid(), dungeon.style.snapStrength)
      updateShapePoly(sh)
    } else {
      // handle drag sets radius + rotation
      const v = { x: world.x - sh.center.x, y: world.y - sh.center.y }
      const r = Math.max(subGrid(), Math.hypot(v.x,v.y))
      const ang = Math.atan2(v.y, v.x)
      sh.radius = snapHard({x:r,y:0}, subGrid()).x
      // snap rotation to 15 degrees
      const step = Math.PI/12
      sh.rotation = Math.round(ang/step)*step
      updateShapePoly(sh)
    }
    return
  }

  if (tool==="poly" && draftShape){
    const v = { x: world.x - draftShape.center.x, y: world.y - draftShape.center.y }
    const r = Math.max(subGrid(), Math.hypot(v.x,v.y))
    draftShape.radius = snapHard({x:r,y:0}, subGrid()).x
    const ang = Math.atan2(v.y, v.x)
    const step = Math.PI/12
    draftShape.rotation = Math.round(ang/step)*step
  }

  if (tool==="space" && draftRect && pointers.size===1){
    draftRect.b = world
  }
  if (tool==="free" && freeDraw && pointers.size===1){
    freeDraw.push(snapSoft(world, subGrid(), dungeon.style.snapStrength))
  }
})

let lastTapTime=0, lastTapPos=null
canvas.addEventListener("pointerup", (e)=>{
  const pos = getPointerPos(e)
  const wasGesture = !!gesture || pointers.size>1
  pointers.delete(e.pointerId)

  if (panDrag){ panDrag=null; return }
  if (gesture && pointers.size<2){ gesture=null; return }
  if (wasGesture) return

  const world = camera.screenToWorld(pos)
  const now = performance.now()
  const isNearLast = lastTapPos ? Math.hypot(pos.x-lastTapPos.x, pos.y-lastTapPos.y) < 22 : true
  const isDoubleTap = (now - lastTapTime) < 320 && isNearLast


  // end text drag
  if (textDrag){
    const clickedId = textDrag.id
    const wasChanged = !!textDrag.changed
    if (!wasChanged && textDrag.pushedUndo) undoStack.pop()
    textDrag = null
    if (!wasChanged && (tool === "select" || tool === "text")) {
      openTextEditorFor(clickedId, { isNew:false, undoPushed:false })
    }
    return
  }

  // end prop transform drag
  if (propTransformDrag){
    if (!propTransformDrag.changed && propTransformDrag.pushedUndo) undoStack.pop()
    propTransformDrag = null
    return
  }

  // end shape drag / create shape
  if (shapeDrag){
    pushUndo()
    const sh = dungeon.shapes.find(s => s.id === shapeDrag.id)
    if (sh) sh.seq = nextEditSeq()
    shapeDrag = null
    return
  }
  if (tool==="poly" && draftShape){
    pushUndo()
    const sh = { id: crypto.randomUUID(), seq: nextEditSeq(), kind:"regular", sides:draftShape.sides, center:draftShape.center, radius:draftShape.radius, rotation:draftShape.rotation, mode: currentDrawMode() }
    updateShapePoly(sh)
    dungeon.shapes.push(sh)
    selectedShapeId = sh.id
    draftShape = null
    return
  }

  if (tool==="space"){
    if (!draftRect) return
    const a=draftRect.a, b=draftRect.b
    const minx=Math.min(a.x,b.x), maxx=Math.max(a.x,b.x)
    const miny=Math.min(a.y,b.y), maxy=Math.max(a.y,b.y)
    const p0 = snapHard({x:minx,y:miny}, subGrid())
    const p2 = snapHard({x:maxx,y:maxy}, subGrid())
    const w = Math.abs(p2.x-p0.x), h = Math.abs(p2.y-p0.y)
    if (w >= subGrid()*0.75 && h >= subGrid()*0.75){
      const poly = [
        {x:p0.x,y:p0.y},{x:p2.x,y:p0.y},{x:p2.x,y:p2.y},{x:p0.x,y:p2.y}
      ]
      pushUndo()
      const changed = commitSpacePolygon(poly, currentDrawMode())
      if (!changed) undoStack.pop()
    }
    draftRect=null
  } else if (tool==="free"){
    if (freeDraw && freeDraw.length>=2){
      pushUndo()
      const pts = simplifyFree(freeDraw, 6)
      dungeon.paths.push({ id: crypto.randomUUID(), seq: nextEditSeq(), mode: currentDrawMode(), points: pts })
    }
    freeDraw=null
  } else if (tool==="path"){
    if (isDoubleTap && draft && draft.type==="path"){
      if (draft.points.length>=2){
        pushUndo()
        dungeon.paths.push({ id: crypto.randomUUID(), seq: nextEditSeq(), mode: currentDrawMode(), points: draft.points })
      }
      draft=null
    } else {
      if (!draft) draft = { type:"path", points:[] }
      const p = snapSoft(world, subGrid(), dungeon.style.snapStrength)
      draft.points.push(p)
    }
  }

  lastTapTime=now; lastTapPos=pos
  if (textEditorState) refocusTextCanvasEditorSoon()
})

canvas.addEventListener("dblclick", (e)=>{
  if (tool !== "select") return
  const screen = getPointerPos(e)
  const pickedText = pickTextAtScreen(screen)
  if (!pickedText) return
  e.preventDefault()
  if (!textEditorState) pushUndo()
  openTextEditorFor(pickedText.id, { isNew:false, undoPushed:!textEditorState })
})

canvas.addEventListener("pointercancel", (e)=>{
  pointers.delete(e.pointerId)
  if (pointers.size<2) gesture=null
  if (propTransformDrag && !propTransformDrag.changed && propTransformDrag.pushedUndo) undoStack.pop()
  panDrag=null
  draftRect=null
  freeDraw=null
  draft=null
  draftShape=null
  shapeDrag=null
  propTransformDrag=null
  textDrag=null
  eraseStroke=null
})

// resize
function resize(){
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1))
  canvas.width = Math.floor(window.innerWidth * dpr)
  canvas.height = Math.floor(window.innerHeight * dpr)
  canvas.style.width = window.innerWidth + "px"
  canvas.style.height = window.innerHeight + "px"
  ctx.setTransform(dpr,0,0,dpr,0,0)
  W = window.innerWidth; H = window.innerHeight
  maskCanvas.width = W; maskCanvas.height = H
}
window.addEventListener("resize", resize)
resize()

function drawShapeSelection(){
  if (!selectedShapeId) return
  const sh = dungeon.shapes.find(s=>s.id===selectedShapeId)
  if (!sh) return
  updateShapePoly(sh)
  const poly = sh._poly
  ctx.save()
  ctx.strokeStyle = sh.mode==="subtract" ? "rgba(255,80,80,0.95)" : "rgba(80,120,255,0.95)"
  ctx.lineWidth = 2
  ctx.setLineDash([6,6])
  ctx.beginPath()
  for (let i=0;i<poly.length;i++){
    const p = camera.worldToScreen(poly[i])
    i===0 ? ctx.moveTo(p.x,p.y) : ctx.lineTo(p.x,p.y)
  }
  ctx.closePath()
  ctx.stroke()
  ctx.setLineDash([])

  // center handle
  const c = camera.worldToScreen(sh.center)
  ctx.fillStyle = "rgba(20,25,30,0.9)"
  ctx.beginPath(); ctx.arc(c.x,c.y,5,0,Math.PI*2); ctx.fill()

  // resize/rotate handle
  const h = shapeHandleWorld(sh)
  const hs = camera.worldToScreen(h)
  ctx.fillStyle = "rgba(80,120,255,0.95)"
  ctx.beginPath(); ctx.arc(hs.x,hs.y,6,0,Math.PI*2); ctx.fill()
  ctx.restore()
}

function drawDraftOverlay(){
  ctx.save()
  // high contrast preview colors
  const isErasePreview = !!underMode
  const stroke = (underMode || isErasePreview) ? "rgba(220,80,80,0.95)" : "rgba(80,120,255,0.90)"
  const fill = (underMode || isErasePreview) ? "rgba(220,80,80,0.22)" : "rgba(80,120,255,0.20)"
  ctx.strokeStyle = stroke
  ctx.lineWidth = 1
  ctx.setLineDash([6,6])

  if (draftRect){
    const p0 = snapHard({ x: Math.min(draftRect.a.x, draftRect.b.x), y: Math.min(draftRect.a.y, draftRect.b.y) }, subGrid())
    const p1 = snapHard({ x: Math.max(draftRect.a.x, draftRect.b.x), y: Math.max(draftRect.a.y, draftRect.b.y) }, subGrid())
    const a = camera.worldToScreen(p0)
    const b = camera.worldToScreen(p1)
    const x=Math.min(a.x,b.x), y=Math.min(a.y,b.y)
    const w=Math.abs(a.x-b.x), h=Math.abs(a.y-b.y)
    ctx.strokeRect(x,y,w,h)
  }

  // Path tool preview: dashed centerline + translucent corridor stroke (no squish)
  if (draft && draft.type==="path" && draft.points.length>0){
    ctx.beginPath()
    draft.points.forEach((p,i)=>{
      const s = camera.worldToScreen(p)
      i===0 ? ctx.moveTo(s.x,s.y) : ctx.lineTo(s.x,s.y)
    })
    ctx.stroke()

    // Show corridor width preview immediately at the first point
    const pFirst = camera.worldToScreen(draft.points[0])
    const r = Math.max(2, (dungeon.style.corridorWidth * camera.zoom) * 0.5)
    ctx.setLineDash([])
    ctx.fillStyle = fill
    ctx.strokeStyle = stroke
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(pFirst.x, pFirst.y, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()

    if (draft.points.length>=2){
      ctx.setLineDash([])
      ctx.strokeStyle = fill
      ctx.lineWidth = dungeon.style.corridorWidth * camera.zoom
      ctx.lineCap = "round"; ctx.lineJoin = "round"
      ctx.beginPath()
      draft.points.forEach((p,i)=>{
        const s = camera.worldToScreen(p)
        i===0 ? ctx.moveTo(s.x,s.y) : ctx.lineTo(s.x,s.y)
      })
      ctx.stroke()
    }
  }

  // Free draw preview: translucent corridor stroke
  if (freeDraw && freeDraw.length>1){
    ctx.setLineDash([6,6])
    ctx.strokeStyle = stroke
    ctx.lineWidth = 1
    ctx.beginPath()
    freeDraw.forEach((p,i)=>{
      const s = camera.worldToScreen(p)
      i===0 ? ctx.moveTo(s.x,s.y) : ctx.lineTo(s.x,s.y)
    })
    ctx.stroke()

    ctx.setLineDash([])
    ctx.strokeStyle = fill
    ctx.lineWidth = dungeon.style.corridorWidth * camera.zoom
    ctx.lineCap = "round"; ctx.lineJoin = "round"
    ctx.beginPath()
    freeDraw.forEach((p,i)=>{
      const s = camera.worldToScreen(p)
      i===0 ? ctx.moveTo(s.x,s.y) : ctx.lineTo(s.x,s.y)
    })
    ctx.stroke()
  }

  // Draft shape preview
  if (draftShape){
    const pts = []
    for (let i=0;i<draftShape.sides;i++){
      const a = draftShape.rotation + i*2*Math.PI/draftShape.sides
      pts.push({ x: draftShape.center.x + Math.cos(a)*draftShape.radius, y: draftShape.center.y + Math.sin(a)*draftShape.radius })
    }
    ctx.setLineDash([6,6])
    ctx.strokeStyle = stroke
    ctx.lineWidth = 1.5
    ctx.beginPath()
    pts.forEach((p,i)=>{
      const s = camera.worldToScreen(p)
      i===0 ? ctx.moveTo(s.x,s.y) : ctx.lineTo(s.x,s.y)
    })
    ctx.closePath()
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = fill
    ctx.beginPath()
    pts.forEach((p,i)=>{
      const s = camera.worldToScreen(p)
      i===0 ? ctx.moveTo(s.x,s.y) : ctx.lineTo(s.x,s.y)
    })
    ctx.closePath()
    ctx.fill()
  }

  ctx.restore()
}

// render loop
function loop(){
  // keep shape polys up to date
  for (const sh of dungeon.shapes) updateShapePoly(sh)

  // scene cache compile (authoritative world-space compile, stable across pan/zoom)
  ensureCompiled()

  ctx.clearRect(0,0,W,H)
  if (!dungeon.style.transparentBackground){
    ctx.fillStyle = dungeon.style.backgroundColor || "#f8f7f4"
    ctx.fillRect(0,0,W,H)
  }
  drawGrid(ctx, camera, dungeon.gridSize, W, H)

  drawCompiledBase(ctx, camera, compiledCache, dungeon, W, H)
  drawPlacedProps()
  drawTextsTo(ctx, camera, { forExport:false })
  drawPropSelection()
  drawTextSelection()
  if (textEditorState) { const tt = getSelectedText(); if (tt) positionTextEditorOverlayForText(tt) }

  drawShapeSelection()
  drawDraftOverlay()

  requestAnimationFrame(loop)
}
loop()
