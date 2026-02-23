export const MAX_UNDO_HISTORY = 200
export const DEFAULT_PANEL_TAB = "style"
export const DEFAULT_DRAWER_OPEN = true

// Organized buckets for render invalidation. These are advisory in the current refactor
// (feature parity), but provide a stable place to plug future incremental rendering.
export const DIRTY_FLAGS = Object.freeze({
  WORLD: "world",
  PROPS: "props",
  OVERLAY: "overlay",
  UI: "ui",
  EXPORT: "export"
})
