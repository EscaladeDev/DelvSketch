# Dungeon Sketch Architecture Notes (Feature-Parity Refactor)

This refactor keeps current behavior while improving structure and reducing `main.js` responsibilities.

## New modules

- `app/dom.js` — Centralized DOM lookup map (single source of truth for UI elements)
- `app/history.js` — Snapshot history stack manager (undo/redo plumbing isolated)
- `app/dirty-flags.js` — Render/export/UI invalidation flags (advisory, future-proofing)
- `app/constants.js` — Shared app-level constants
- `ui/drawer-tabs.js` — Sidebar tab + drawer collapse/open controller

## Why this helps

- UI element wiring is now centralized (safer layout changes)
- Undo/redo stack logic is isolated (easier future command-based history swap)
- Drawer/tab behavior no longer lives inline with geometry/input logic
- Dirty flags provide stable compartments for future incremental rendering and feature additions

## Non-goals of this pass

- No new features
- No intentional UX changes
- No changes to map format or export behavior
- No rewrite of tool logic yet (still in `main.js` for feature parity)
