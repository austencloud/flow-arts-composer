# Shifting Mandala Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task, inline (Austen's agent budget: no subagent per task). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Studio `mandala` clip and an arrangement cell type that shift between chosen sequences on the song's beats, drawn as a pure function of the beat clock so preview and export agree.

**Architecture:** Pure beat math (`mandala-shift.ts`) and a reusable morph plan (`planMandalaMorph`) feed one canvas component, `ShiftingMandala.svelte`, that draws whenever its `beats` prop changes. The Studio item kind and the arrangement cell both mount that component; the item's clock comes from the post's music grid (120 BPM fallback), the cell's from the arrangement BPM. Export copies the component's canvas pixels through a surface, as arrangements do.

**Tech Stack:** SvelteKit / Svelte 5 runes, TypeScript, zod, `@austencloud/video-editor` plugin API, vitest (jsdom). Spec: `docs/superpowers/specs/2026-10-19-shifting-mandala-design.md`.

Worktree: `E:/worktrees/tka-platform/shifting-mandala`, branch `codex/shifting-mandala`. Tests: `pnpm vitest run <path>` from the worktree. Commit each task with an explicit pathspec.

---

### Task 1: Shift math and morph plan (pure, tested)

**Files:**
- Create: `src/lib/shared/mandala/domain/mandala-shift-types.ts` (zod schemas + defaults for `MandalaShift`, `MandalaLook`)
- Create: `src/lib/shared/mandala/services/mandala-shift.ts`
- Create: `src/lib/shared/mandala/services/__tests__/mandala-shift.test.ts`
- Modify: `src/lib/shared/mandala/services/mandala-path-interpolator.ts` (add `planMandalaMorph`, keep `createMandalaMorph`)
- Modify: `src/lib/shared/mandala/services/__tests__/mandala-path-interpolator.test.ts` (plan test)

- [ ] Types: `MandalaShiftSchema = z.object({ every: z.union([1,2,4] literals), unit: z.enum(["bars","beats"]), morph: z.union([1,2,4]) }).strict()`, `MandalaLookSchema` per the spec table, `DEFAULT_MANDALA_SHIFT`, `DEFAULT_MANDALA_LOOK`, `MANDALA_MAX_SEQUENCES = 8`.
- [ ] Math (`mandala-shift.ts`):

```ts
export function shiftHoldBeats(shift: MandalaShift, beatsPerBar: number): number {
  return shift.unit === "bars" ? shift.every * beatsPerBar : shift.every;
}
export function shiftFrameAt(shift, count, beats, beatsPerBar): MandalaShiftFrame {
  if (count <= 0) return { from: 0, to: 0, morphT: 0, hold: 0 };
  const holdBeats = shiftHoldBeats(shift, beatsPerBar);
  const hold = Math.max(0, Math.floor(beats / holdBeats));
  const from = hold % count, to = (hold + 1) % count;
  if (count === 1 || from === to) return { from, to: from, morphT: 0, hold };
  const morph = Math.min(shift.morph, holdBeats);
  const phase = Math.max(0, beats - hold * holdBeats);
  const linear = clamp((phase - (holdBeats - morph)) / morph, 0, 1);
  return { from, to, morphT: bloomEase(linear), hold };
}
export function breathAt(beats, breathBeats) { const p = ((beats % breathBeats) + breathBeats) % breathBeats / breathBeats; const tri = p < .5 ? p*2 : 2 - p*2; return breatheEase(tri); }
export function spinAt(beats, beatsPerBar, spinPerBar) { return (beats / beatsPerBar) * spinPerBar; }
export function colorPhaseAt(beats, breathBeats) { const cycle = breathBeats * COLOR_CYCLE_BREATHS; return ((beats % cycle) + cycle) % cycle / cycle; }
```
`bloomEase` and `breatheEase` are copied from `SequenceMandala.svelte` / `mandala-frame-renderer.ts` into `mandala-shift.ts` and exported; the frame renderer keeps its private copy (no behaviour change there).

- [ ] Tests: hold index and wrap for 3 sequences at every 1 bar (beats 0, 4, 8, 12 give from 0,1,2,0); morph window: at beats 2 (holdBeats 4, morph 2) morphT 0, at 3 morphT in (0,1), at 3.999 near 1, at 4 the frame is hold 1 with morphT 0; morph 4 on 2-beat holds is clamped (continuous); one sequence never morphs; breathAt periodic with 0 at 0 and 1 at half; colorPhaseAt(12, 4) = 0.
- [ ] Plan: refactor `prepareBeatGroup` into `pairing = decideBeatPairing(from, to)` (returns `{ pairing: number[][] } | null`) and `buildLineMorphs(fromPaths, toPaths, pairing)`; tips into `decideTipPairing` (sorted tip indices) and `buildTipMorphs`. `planMandalaMorph(from, to)` decides per group once; `plan.at(fromNow, toNow, t)` builds and blends with the decision; `createMandalaMorph` = `planMandalaMorph(from,to)` closed over the original paths (same output as before).
- [ ] Plan test: `circle(0)` vs `circle(1)` geometries at `{dx: 0}` and at `{dx: 120, dy: 0}` (tip override); `planMandalaMorph(a0, b0).at(a120, b120, t)` equals `createMandalaMorph(a120, b120)(t)` path for path at t = 0, 0.5, 1. Same for a 4-beat vs 8-beat pair (tip pairing).
- [ ] Run `pnpm vitest run src/lib/shared/mandala` then commit.

### Task 2: `ShiftingMandala.svelte` and the test page

**Files:**
- Create: `src/lib/shared/mandala/components/ShiftingMandala.svelte`
- Create: `src/lib/shared/mandala/services/mandala-shift-render.ts` (pure helpers: `shiftingMandalaFrame(spec, beats, beatsPerBar)` returning `{ paths, tipDx, palette, gradient, rotDeg, bg }` and `drawShiftingMandalaFrame(ctx, frame, width, height, lineWeight)`; keeps the component thin and lets the cell export reuse the drawing)
- Create: `src/routes/test/shifting-mandala/+page.svelte`

- [ ] `mandala-shift-render.ts`: a `ShiftingMandalaSource` = `{ steps: readonly StepLike[]; leftPropType?: string; rightPropType?: string }`. `prepareShiftingMandala(sources, look)` returns an object holding per-source `options` (`getMandalaPathOptions(look.shape, pairTipEnds(l, r))`) and a lazy `plan(i, j)` cache built from `calculate(steps, l, r, options)` at the standard offset. `frameAt(prepared, shift, look, beats, beatsPerBar, reducedMotion)` computes `tipDx = reducedMotion ? 0 : look.depth * 2.5 * breathAt(...)`, the shift frame, `fromPaths = calculate(..., { dx: tipDx, dy: 0 })`, blends through the plan when morphing (reduced motion: returns both path sets and the crossfade alpha instead), palette/gradient (`flowPalette`, `flowGradientColors` with `PRESET_COLORS[preset].morph` at `colorPhaseAt`, or the solid pair), `rotDeg = reducedMotion ? 0 : spinAt(...)`, `bg = PRESET_COLORS[preset].bg`. `draw(ctx, frame, w, h, lineWeight)`: fill bg, square = min(w,h), offset to centre, rotate about centre, `renderMandalaToCanvas` with `glow: { blur: 3 * renderScale, bloomBlur: DEFAULT_OVERLAP_CONFIG.bloomBlur * renderScale }` where `renderScale` mirrors `renderMandalaFrameToCanvas`.
- [ ] Component props: `sources, shift, look, beats, beatsPerBar = 4, stamp = undefined, exportSize = null, reducedMotion = prefersReducedMotion()` (from `#lib/shared/3d/environments/primitives/motion-preference.js`). One `$effect` draws; after drawing sets `canvas.dataset.frame = stamp` when a stamp is given. Backing store = `exportSize` while given, else box x DPR via `bind:clientWidth/Height`. Canvas has `data-shifting-mandala`, fills its box (`display:block; width:100%; height:100%`).
- [ ] Test page: three sequences from the mandala path test fixtures or the sample sequence loader used by `/test/mandala-paths` (read that page and reuse its source); a Play toggle driving `beats` at 120 BPM from `requestAnimationFrame`, a beat slider, and `MandalaShiftLookPanel` once Task 4 lands (until then the page sets the defaults).
- [ ] Watch it in the browser at `/test/shifting-mandala` (dev server on 5173 in the primary checkout; the worktree's edits are not there, so run `pnpm dev --port 5174` from the worktree in the background, verify, then stop it). Commit.

### Task 3: The `mandala` item kind (schema, compile, binding, sublayer, add, lane)

**Files:**
- Modify: `src/lib/shared/post-studio-plugin/item-kinds.ts` (`PostMandalaItemSchema`, union augmentation, `TKA_ITEM_KINDS` entry, patch fields)
- Modify: `src/lib/shared/post-studio-plugin/compile-hooks.ts` (`mandalaRole`, `itemIdFromMandalaRole`, `compileMandalaItem`)
- Create: `src/lib/shared/post-studio-plugin/mandala-item-clock.ts` (`mandalaItemClock(project, item)` returning `{ beatsPerBar, hasGrid, beatsAt(postSeconds) }`, `mandalaItemPostSeconds(item, sourceTimeSeconds)`)
- Create: `src/lib/shared/post-studio-plugin/mandala-item-clock.test.ts`
- Modify: `src/lib/shared/media-composition/domain/post-project-edits.ts` (`addMandalaItem(project, at, sequence, ctx)` modelled on `addArrangementItem`; `createMandalaItem`)
- Modify: `src/lib/shared/media-composition/state/post-editor-state.svelte.ts` (`addMandala(at)`)
- Modify: `src/lib/shared/post-studio-plugin/ui/tka-painters.svelte.ts` (binding for the mandala role, `renderMode: "shifting-mandala"`)
- Create: `src/lib/shared/post-studio-plugin/ui/PostStudioShiftingMandalaLayer.svelte` (item -> sources/clock -> `ShiftingMandala`)
- Modify: `src/lib/shared/post-studio-plugin/ui/TkaMediaSublayer.svelte` and `tka-plugin-ui.ts` (render mode list, SEQUENCE_TOOLS exemption)
- Modify: `src/lib/shared/post-studio-plugin/ui/tka-add-items.ts`, `tka-kind-ui.ts`, `tka-row.ts`, `tka-tools.ts`, `tka-arrangement-lanes.ts`
- Modify: `src/lib/shared/post-studio-plugin/plugin.test.ts`, `src/lib/shared/post-studio-plugin/ui/tka-row.test.ts`

- [ ] Schema: `MandalaSequenceSnapshotSchema = z.object({ id, name, sequence: z.record(z.string(), z.unknown()) }).passthrough()` cast to `z.ZodType<MandalaSequenceSnapshot>` the way the arrangement snapshot is; item = `itemBase + kind + sequences (max 8) + shift + look + sourceIn + sourceOut + speed`. Kind entry: `mainTrack: true, transitionVisual: true, defaultBox: POST_BOX.full, sourceLength: () => MANDALA_SOURCE_SECONDS (3600), compile: compileMandalaItem`.
- [ ] Clock test: a grid at 100 BPM, 4/4, downbeat 0 s, music at 0 s; item starting at 3 s with every-1-bar holds: anchor is bar 2's downbeat (2.4 s), so `beatsAt(3) = 1`; without a grid `beatsAt(item.start + 0.5) = 1` at 120 BPM.
- [ ] Row: `case "mandala": return ["back", "sequence", "split", "look", "timing", ...TAIL]`. Tools: Look label "Look" for mandala too; Sequence label "Sequences" for mandala. Add entry replaces the PiP mandala entry and is offered without a post sequence. Lanes: one per sequence (first hold span inside the clip through the clock). Kind UI: `faSun`, label from `post_editor_kind_mandala`, `toolPanel: TkaKindTools`.
- [ ] Run the plugin, row and clock tests; commit.

### Task 4: Tools (Sequences panel, Look panel)

**Files:**
- Create: `src/lib/shared/post-studio-plugin/ui/PostMandalaSequencesTool.svelte`
- Create: `src/lib/shared/post-studio-plugin/ui/MandalaShiftLookPanel.svelte`
- Modify: `src/lib/shared/post-studio-plugin/ui/TkaKindTools.svelte` (route `sequence` and `look` for `item.kind === "mandala"`)
- Modify: `src/routes/test/shifting-mandala/+page.svelte` (mount the panel)

- [ ] Sequences tool: list rows with `PanelButton` Up/Down/Replace/Remove, Add opens `SequencePickerModal`; a snapshot is `{ id: chosen.id, name: chosen.displayName ?? deriveWord(chosen), sequence: chosen }`; edits patch `sequences` through `editor.edit(updateItem(...))`.
- [ ] Look panel props: `shift, look, onShift, onLook, locked, gridNote?: string | null`. Controls as the spec lists, all `SegmentedControl`/`FilterChipBase`/`ValueSlider`.
- [ ] Watch both panels at `/post` with a mandala clip; commit.

### Task 5: Export surface

**Files:**
- Create: `src/lib/shared/post-studio-plugin/shifting-mandala-surface.ts`
- Modify: `src/lib/shared/post-studio-plugin/surfaces.ts`, `plugin.test.ts`

- [ ] `createShiftingMandalaSurface()`: `renderMode: "shifting-mandala"`; `draw` waits for `canvas[data-shifting-mandala][data-frame="<String(layer.sourceTimeSeconds)>"]` by rAF (10 s, then an error naming the layer), then `resolveFrameLayerGeometry({ preset, region: { ...region, fit: "fill" }, sourceWidth: canvas.width, sourceHeight: canvas.height, transform: layer.transform })`, `applyLayerTransform`, `globalAlpha = layer.opacity`, `drawSource`.
- [ ] Export a short mandala clip from `/post` and open the file; commit.

### Task 6: Mandala cells

**Files:**
- Modify: `src/lib/shared/media-composition/domain/arrangement.ts` (`mediaType` enum gains `"mandala"`; optional `mandala: { shift, look }` on the cell)
- Modify: `src/lib/shared/media-composition/domain/arrangement-edits.ts` (`setCellMediaType`, `setCellMandala`), `post-project-edits.ts` (`setArrangementCellMediaType`, `setArrangementCellMandala`)
- Modify: `src/lib/shared/media-composition/components/ArrangementCellCanvas.svelte` (new `bpm` prop; `mediaType === "mandala"` branch mounting `ShiftingMandala`, marked `data-arrangement-cell-ready="true"`)
- Modify: `src/lib/shared/post-studio-plugin/ui/PostStudioArrangementLayer.svelte` (pass `bpm`, export scale for mandala cells), `arrangement-surface.ts` (copy mandala canvases)
- Modify: `src/lib/shared/post-studio-plugin/ui/PostArrangementTool.svelte` (type switch in Sequence; `MandalaShiftLookPanel` in Look for a mandala cell)
- Modify: the arrangement schema test (find it with `rg "arrangementCellSchema" --glob "*.test.ts"`)

- [ ] Beats for a cell: `(virtualTimeMs / 1000) * bpm / 60 - cell.beatOffset`, 4 beats a bar.
- [ ] Watch a 2x2 grid with a mandala cell beside animation cells at `/post`, export once; commit.

### Task 7: Gates and integration

- [ ] `pnpm run check:fast` in the worktree (expect `new 0`).
- [ ] `pwsh scripts/d2-run.ps1 -Ref <sha> "pnpm run test:ci"` from `E:/tka-platform`.
- [ ] Reduced-motion check on the test page once (`resize_window` colorScheme has no motion switch; emulate with the `reducedMotion` prop in the page).
- [ ] `npm run wt:finish -- codex/shifting-mandala --route /post` from `E:/tka-platform`; verify on `https://localhost:5173/post`.
