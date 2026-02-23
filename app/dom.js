function q(doc, selector){ return doc.querySelector(selector) }
function qa(doc, selector){ return Array.from(doc.querySelectorAll(selector)) }
function byId(doc, id){ return doc.getElementById(id) }

export function getDomRefs(doc = document){
  const canvas = q(doc, "canvas")
  if (!canvas) throw new Error("Dungeon Sketch: <canvas> element not found")

  const refs = {
    // core
    canvas,
    hudRoot: q(doc, ".hud.appShellHud"),

    // tools + topbar
    toolButtons: qa(doc, "button.tool"),
    btnUnder: byId(doc, "btnUnder"),
    btnFinish: byId(doc, "btnFinish"),
    btnUndo: byId(doc, "btnUndo"),
    btnRedo: byId(doc, "btnRedo"),
    btnClear: byId(doc, "btnClear"),
    btnSaveMap: byId(doc, "btnSaveMap"),
    btnLoadMap: byId(doc, "btnLoadMap"),
    fileLoadMap: byId(doc, "fileLoadMap"),
    btnExport: byId(doc, "btnExport"),
    btnPDF: byId(doc, "btnPDF"),

    // drawer + tabs
    tabStyleBtn: byId(doc, "tabStyleBtn"),
    tabAssetsBtn: byId(doc, "tabAssetsBtn"),
    leftDrawer: byId(doc, "leftDrawer"),
    btnDrawerToggle: byId(doc, "btnDrawerToggle"),
    btnDrawerCollapse: byId(doc, "btnDrawerCollapse"),
    drawerPeekTab: byId(doc, "drawerPeekTab"),
    panelTabButtons: qa(doc, "[data-panel-tab]"),
    panelPages: qa(doc, "[data-panel-page]"),

    // assets panel
    btnPropsPick: byId(doc, "btnPropsPick"),
    btnPropsClear: byId(doc, "btnPropsClear"),
    btnPropsDefaults: byId(doc, "btnPropsDefaults"),
    propsFolderInput: byId(doc, "propsFolderInput"),
    propsShelf: byId(doc, "propsShelf"),

    // style controls
    gridSize: byId(doc, "gridSize"),
    corridorWidth: byId(doc, "corridorWidth"),
    wallWidth: byId(doc, "wallWidth"),
    wallColor: byId(doc, "wallColor"),
    floorColor: byId(doc, "floorColor"),
    backgroundColor: byId(doc, "backgroundColor"),
    transparentBg: byId(doc, "transparentBg"),
    polyToolOptions: byId(doc, "polyToolOptions"),
    polySides: byId(doc, "polySides"),
    polySidesOut: byId(doc, "polySidesOut"),
    snapDiv: byId(doc, "snapDiv"),
    snapDivOut: byId(doc, "snapDivOut"),
    shadowOn: byId(doc, "shadowOn"),
    shadowOpacity: byId(doc, "shadowOpacity"),
    shadowColor: byId(doc, "shadowColor"),
    hatchOn: byId(doc, "hatchOn"),
    hatchDensity: byId(doc, "hatchDensity"),
    hatchOpacity: byId(doc, "hatchOpacity"),
    hatchColor: byId(doc, "hatchColor"),
    hatchDepth: byId(doc, "hatchDepth"),
    snapStrength: byId(doc, "snapStrength"),
    propSnapToggle: byId(doc, "propSnapToggle"),
    puck: byId(doc, "shadowPuck"),

    // PDF modal
    pdfExportModal: byId(doc, "pdfExportModal"),
    pdfExportSummary: byId(doc, "pdfExportSummary"),
    btnPdfModalClose: byId(doc, "btnPdfModalClose"),
    btnPdfCancel: byId(doc, "btnPdfCancel"),
    btnPdfConfirm: byId(doc, "btnPdfConfirm"),
    pdfModeInput: byId(doc, "pdfMode"),
    pdfPaperInput: byId(doc, "pdfPaper"),
    pdfOrientationInput: byId(doc, "pdfOrientation"),
    pdfSourceInput: byId(doc, "pdfSource"),
    pdfPaddingSquaresInput: byId(doc, "pdfPaddingSquares"),
    pdfMarginInInput: byId(doc, "pdfMarginIn"),
    pdfRasterDpiInput: byId(doc, "pdfRasterDpi"),
    pdfRasterDpiOut: byId(doc, "pdfRasterDpiOut"),
    pdfSquareSizeInInput: byId(doc, "pdfSquareSizeIn"),
    pdfOverlapSquaresInput: byId(doc, "pdfOverlapSquares"),
    pdfLabelsInput: byId(doc, "pdfLabels"),
    pdfTrimMarksInput: byId(doc, "pdfTrimMarks"),
    pdfOverviewInput: byId(doc, "pdfOverview"),
    pdfIncludeEmptyTilesInput: byId(doc, "pdfIncludeEmptyTiles"),
    pdfTiledSection: byId(doc, "pdfTiledSection")
  }

  return refs
}
