---
status: backlog
value: 4
effort: M
remaining: Verify the current 60 arrow SVG assets and manifest against the Illustrator split plan before assigning implementation.
depends_on: 'external: Manual Illustrator SVG split workflow'
plan_path: docs/superpowers/plans/backlog/2026-04-04-arrow-tip-z-promotion.md
tags: []
last_triaged: '2026-10-07'
work_state: unverified
---

# Arrow Tip Z-Promotion

## Problem

When two arrows overlap in a pictograph, the behind arrow (blue) is completely hidden by the front arrow (red). This includes the arrowhead (tip), which is the most important part for readability — it shows where the motion is going. When the blue tip is buried under the red shaft, the user can't see where the blue arrow points.

## Solution

Split each arrow SVG into two parts (shaft + tip) ahead of time using a splitter tool. At render time, detect when a tip is buried under another arrow's shaft. When it is, promote that tip to a higher z-layer so it's visible.

## Design Constraints

- **No visible seam.** The shaft and tip paths must overlap slightly at the join point. Same-color overlap is invisible. When the tip is promoted, the overlap covers any gap.
- **No change when arrows don't overlap.** The vast majority of pictographs render identically to today — single combined path per arrow.
- **No runtime path splitting.** All geometry work happens in the splitter tool. The manifest stores pre-computed path strings.

## Components

### 1. Arrow Splitter Tool

Standalone HTML file (`tools/arrow-splitter.html`). No build step, no dependencies.

**Workflow:**
1. Loads all 60 real arrow SVGs from `static/images/arrows/`
2. Displays the current arrow large on a canvas
3. User clicks two points to draw a cut line across the arrow where shaft meets tip
4. Tool splits the path into shaft + tip with an overlap margin (~5px)
5. Preview shows shaft and tip in different colors for verification
6. "Save & Next" stores the result and advances
7. Progress tracker (1/60, 2/60...)

**Path splitting algorithm** (runs in the tool, not in production):
- Parse SVG `<path>` `d` attribute into discrete segments
- Find intersection points between each segment and the cut line (De Casteljau subdivision for bezier curves)
- Partition segments into shaft-side and tip-side
- Extend both partitions past the cut line by the overlap margin
- Close each partition into a valid SVG path string

**Output:** Downloads `arrow-split-manifest.json` when all arrows are processed.

### 2. Manifest Format

```json
{
  "pro/from_radial/pro_0.0.svg": {
    "shaftPath": "<path d='M...' style='fill:#2e3192'/>",
    "tipPath": "<path d='M...' style='fill:#2e3192'/>",
    "tipBBox": { "x": 180, "y": 200, "width": 80, "height": 60 }
  }
}
```

Stored at `static/images/arrows/arrow-split-manifest.json`.

Fields:
- `shaftPath`: SVG content for the shaft portion
- `tipPath`: SVG content for the arrowhead portion
- `tipBBox`: Bounding box of the tip in the arrow's local coordinate space (used for overlap detection)

### 3. Data Flow for Split Fields

The split data flows through the existing arrow loading pipeline:

1. **`ArrowSvgLoader`** loads the manifest once (lazily on first arrow load, cached permanently). If the manifest fails to load, rendering proceeds without splitting — no errors, no degradation.
2. **`ArrowSvgData`** (in `svg-models.ts`) gets new optional fields:
   ```typescript
   shaftSrc?: string;
   tipSrc?: string;
   tipBBox?: { x: number; y: number; width: number; height: number };
   ```
3. **`ArrowLifecycleManager.loadArrowAssets()`** maps these onto `ArrowAssets` via `createArrowAssets()` in `arrow-factories.ts`
4. **`ArrowAssets`** (in `arrow-models.ts`) gets the same optional fields

Manifest keys use relative paths from `static/images/arrows/` (e.g. `pro/from_radial/pro_0.0.svg`). The loader strips the base path from the resolver's output to match.

### 4. Overlap Detection

A `$derived` computation in `PictographRenderer.svelte`. If fewer than 2 arrows are present, skip entirely.

After arrow positions are computed for both colors:

1. Transform each arrow's `tipBBox` from local space to pictograph space using the arrow's position (x, y) and rotation
2. Transform each arrow's overall bounding box (from viewBox dimensions) to pictograph space
3. Check if the behind-arrow's transformed tip bbox intersects the front-arrow's transformed overall bbox
4. If yes, flag that arrow for tip promotion

This is simple axis-aligned bounding box (AABB) intersection after applying the position/rotation transform. A few multiplications and comparisons — no complex geometry.

### 5. Rendering Changes

In `PictographRenderer.svelte`, the `<!-- Arrows -->` `{#each motions}` section becomes:

**When no tip promotion needed (most cases):**
```
{#each motions} <ArrowSvg ... /> {/each}
```
Identical to today. Single combined path per arrow.

**When tip promotion detected:**
```
<!-- Shaft layer -->
{#each motions} <ArrowSvg renderPart="shaft" ... /> {/each}

<!-- Tip layer (above all shafts) -->
{#each motions} <ArrowSvg renderPart="tip" ... /> {/each}
```

`ArrowSvg.svelte` gets a new optional prop `renderPart?: "shaft" | "tip"`:
- `undefined` (default): renders `arrowAssets.imageSrc` as today
- `"shaft"`: renders `arrowAssets.shaftSrc`
- `"tip"`: renders `arrowAssets.tipSrc`

### 6. What Doesn't Change

- Arrow SVG source files in `static/images/arrows/` — untouched
- Arrow positioning system — unchanged
- Arrow color transformation — applied to both parts identically
- Arrow click handling, selection, animation — unchanged
- ArrowPathResolver, ArrowSvgParser (core methods), ArrowSvgColorTransformer — unchanged

## File Inventory

| File | Change |
|------|--------|
| `tools/arrow-splitter.html` | **New** — standalone splitter UI |
| `static/images/arrows/arrow-split-manifest.json` | **New** — pre-computed split data |
| `ArrowSvgLoader.ts` | Load manifest (lazy, cached), populate split fields |
| `svg-models.ts` | Add optional `shaftSrc`, `tipSrc`, `tipBBox` to `ArrowSvgData` |
| `arrow-models.ts` | Add same optional fields to `ArrowAssets` |
| `arrow-factories.ts` | Map split fields through `createArrowAssets()` |
| `ArrowSvg.svelte` | Add `renderPart` prop, conditional rendering |
| `PictographRenderer.svelte` | Overlap detection ($derived) + conditional 4-layer rendering |

## Scope Boundaries

**In scope (v1):** SVG DOM rendering path (`PictographRenderer.svelte` + `ArrowSvg.svelte`).

**Out of scope (v1):** Canvas2D rendering (`Canvas2DDirectRenderer.ts`) and Node.js server-side rendering (`NodeArrowSvgLoader.ts`). These paths are used for card image exports, print preview, and MCP rendering. They will continue to render arrows as single combined paths. Tip promotion can be extended to these paths in a follow-up if the SVG DOM version proves valuable.

## Splitter Tool: Load & Resume

The splitter tool supports loading an existing manifest to resume or edit previous splits. If `arrow-split-manifest.json` is loaded, arrows with existing entries show their saved split for review. The user can re-split or skip.

## Overlap Margin

The overlap margin is specified in SVG coordinate units (the arrow's own viewBox space). Default: 8 units. Given arrow viewBoxes range from ~100 to ~400 units, 8 units provides visible overlap without distorting the shape. The splitter tool preview confirms the overlap is sufficient before saving.

## Risks

- **Overlap detection false positives.** AABB is a rough approximation. Could promote tips that aren't actually buried. Acceptable — promoting a non-buried tip doesn't look wrong, it just looks slightly different.
- **Overlap detection false negatives.** Rotated arrows could have tips that are buried but whose AABBs don't intersect after rotation. Could refine later with OBB if needed.
- **Splitter tool path splitting accuracy.** Complex bezier paths might not split cleanly at every cut line angle. The preview step lets the user verify and retry.
