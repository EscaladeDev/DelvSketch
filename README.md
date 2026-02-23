# Dungeon Sketch Premium Rebuild (v12)

This build switches the renderer to an **authoritative world-space compile cache** so:
- hatching does not change when panning/zooming
- walls are drawn outside the interior volume
- shadows are smooth and stable
- all rendered layers derive from one compiled world mask (no mixed screen/world extraction)

## Features
- Space (rect) tool with snapping
- Path / Free path corridor drawing
- Parametric polygon tool with move/resize/rotate
- Under toggle for subtractive shapes
- Smooth interior shadow with direction puck
- Cartoony exterior hatching (stable)
- Exterior walls
- PNG export
- Multipage PDF export (raster tiles via jsPDF)

## iPad / Browser test
1. Upload the folder to GitHub Pages (or any static host).
2. Open in Safari on iPad.
3. Use:
   - one finger draw
   - two-finger pan
   - pinch zoom
   - panel controls for style
4. PDF export requires internet access to load jsPDF (CDN).

## Notes
- PDF export is **multipage raster** (high-res) in this build.
- A true vector PDF exporter is still possible on top of a full polygon boolean kernel later.


## v14 patch
- Corner-aware interior shadows (combines axis + diagonal directional bands to fill shadow gaps at inside corners).

## v15 patch
- Shadow now uses directional line-erosion banding for angled corner shadows and uniform shading (constant opacity inside the shadow band).

## v16 patch
- Replaced shadow generation with outside-mask ray-union banding (corner-aware angled wedges, uniform fill, and guaranteed wall contact).

## v17 patch
- World-anchored grid phase for better grid/map alignment while panning/zooming.
- Added Save/Load map JSON options (toolbar) including camera state.


## v21 patch
- Erase tool now uses snapped drag-box behavior like Space (sub-grid aware).
- Space operations are applied in insertion order during mask build so drawing after erase can restore areas.
