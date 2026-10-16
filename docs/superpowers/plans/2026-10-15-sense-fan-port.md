# Sense Fan Port Implementation Plan

> **For agentic workers:** executed inline (Agent Budget). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add Flow DNA's Sense Fan as the fan build `sense`: 2D look, unlit 3D shell, picker entry credited "Flow DNA" with no link.

**Spec:** `docs/superpowers/specs/2026-10-15-sense-fan-port-design.md`

**Architecture:** One reference file feeds a Blender script that writes the GLB, the 2D SVG and the preview render, exactly as the Renegade Star build does (commit 75e5048011 is the template). The build id `sense` is then threaded through every place that enumerates fan builds.

**Frames.** Reference metres put the grip centre at the origin with +Y along the reach and X across it, the Star frame. SVG: `x = 130 + Y * 417.3`, `y = 103.5 + X * 417.3` (the DoodleGrip scale; the 468 mm span is 195 px, inside the 207 px box). 2D tips: `dx = Y * 417.3`, `dy = X * 417.3`.

---

### Task 1: Reference file

**Files:** Create `scripts/build-sense-fan-reference.mjs`, `scripts/assets/sense-fan-reference.json`.

- [ ] The script takes the Flow DNA outline source path as its only argument (never recorded in the repo), reads the ring list (millimetres, grip centre at (-180, 0), reach along +x), and rotates each point into the reference frame: `X = -y / 1000`, `Y = (x + 180) / 1000`.
- [ ] Keep ring 0 as `outline_m` and every other ring with area at least `MIN_HOLE_AREA_M2 = 5e-5` (50 mm²) as `holes_m`, printing the counts kept and dropped.
- [ ] Compute `rim_points_m`: five points where rays from the grip at the fire fan's bearings (0, ±42.2°, ±70.2° from the reach axis, the bearings Moon uses) leave the silhouette, pulled 8 mm back towards the grip, ordered from -X to +X.
- [ ] Write `version`, `source` ("Flow DNA Sense Fan"), `provenance` (traced from Flow DNA's own outline of the fan's shell at Duncan Greenwood's request, conversion approved by Austen on 2026-10-15, LED layout deliberately absent), `prop_length_m`, `span_m`, `sheet_thickness_m: 0.003` with `sheet_thickness_estimate: true`, `svg_scale_px_per_m: 417.3`, `outline_m`, `holes_m`, `rim_points_m`.
- [ ] Run it against `E:/worktrees/flowdna_studio/prop-census` (the flowdna guard asks Austen; wait for his answer). Commit.

### Task 2: GLB, SVG and preview

**Files:** Create `scripts/build-sense-fan.py`, `scripts/build-sense-fan-preview.mjs`; generated `static/models/props/fan-sense.glb`, `static/images/props/appearances/fan-sense.svg` (copied to `mcp-server-pkg/assets/images/props/appearances/`), `static/images/props/build-previews/fan-sense-complete.webp` + `.provenance.json`.

- [ ] `build-sense-fan.py` loads `build-fan-model.py` as the Star script does, adds `TKA_Fan` > `Fan_Sense`, records `tka_source`, `tka_prop_length_m`, `tka_rim_points_m` on the group, extrudes `add_cut_sheet("Fan_Sense_Shell", outline, holes, thickness, shell, group)` with one matte black polymer material `TKA_Fan_Sense_Shell`, exports with `{"sense": group}`, writes the SVG and renders `scratchpad/sense-fan/preview.png` at 640 x 440.
- [ ] SVG: viewBox `0 0 260 207`, `data-generated-from`, `<title>Flow DNA Sense Fan</title>`, a `<desc>`, and `<g data-fan-frame="" fill="#2E3192" fill-rule="evenodd" stroke="none"><path data-sense-shell="" d="..."/></g>`, the DoodleGrip Day structure.
- [ ] Run Blender (`C:/Program Files/Blender Foundation/Blender 5.0/blender.exe --background --factory-startup --python scripts/build-sense-fan.py`), then the preview script, then copy the SVG to the MCP assets. Commit.

### Task 3: Thread the build through the app

- [ ] `fan-appearance.ts`: `FAN_BUILDS` and `COMPACT_FAN_LOOKS` gain `sense` after `star`; render key `${prop}__sense`, parse regex, artwork `fan-sense.svg?v=1`, preview `fan-sense-complete.webp`, preview option `{ id: "sense", label: "Sense Fan", imageScale, designCredit: { originator: "Flow DNA" } }`; `designCredit.sourceUrl` becomes optional.
- [ ] `prop-look.ts`: `PropDesignCredit.sourceUrl` optional.
- [ ] Credit renderers: `PropGrid.svelte` rail credit renders a plain `<span>` when there is no URL, and its short name map gains `sense: "Flow DNA"`; any other `sourceUrl` reader handles absence.
- [ ] `FanAppearancePicker.svelte`: `case "sense"` uses `shared_fan_build_sense`; add `"shared_fan_build_sense": "Sense Fan"` to all 11 `messages/*.json` (a product name, not translated).
- [ ] `prop-tip-points.ts`: `FAN_SENSE_TIP_POINTS` from `rim_points_m` at 417.3 px/m, plus `${propType}__sense` in `fanBuildTables`.
- [ ] `prop-build-tip-geometry-3d.ts`: `FAN_SENSE_RIM_POINTS_M` and its `fanAnchors` branch; union gains `sense`.
- [ ] `build-for-effect.ts`: compatibility union gains `sense` (no fire wicks, so enabling fire swaps builds as Moon does).
- [ ] Worker renderer: `WorkerPropBuild.fanBuild` gains `sense`; `fanModelUrl("sense")` returns `/models/props/fan-sense.glb`.
- [ ] `prop-tip-parity-2d-3d.test.ts` build list, `EffectPropTypeSelector.svelte`, `prop-3d-studio/capture/+page.svelte` gain `sense`.
- [ ] scene-3d patch: `sense: "/models/props/fan-sense.glb"` in both Fan3D `SEPARATE_BUILD_MODEL_URLS` maps and `| "sense"` in `prop-finish-state` `FanBuild`, hunk counts recomputed; `pnpm-lock.yaml` `patch_hash` set to the new file's sha256 (both occurrences).
- [ ] MCP: `FAN_BUILDS` in `standalone-renderer.ts` and the build enums in `sequence-renderer.ts`, `server-context.ts`, `loop-tools.ts`, `preference-tools.ts`, `preset-tools.ts`, `sequence-tools.ts` gain `star` (missing today) and `sense`.

### Task 4: Tests

**Files:** Create `tests/unit/3d-viewer/fan-sense.test.ts`.

- [ ] GLB: `Fan_Sense` group exists with `tka_source`; its exported `tka_rim_points_m` equal `resolvePropTipAnchors3D("fan", 0.4, build)` offsets; bigfan anchors are 1.4x.
- [ ] 2D tips equal `rim_points_m` through 417.3 px/m; the SVG has `data-fan-frame`, `fill-rule="evenodd"`, viewBox 260 x 207, and every path point inside the box.
- [ ] Static and MCP copies of `fan-sense.svg` are byte-identical.
- [ ] Normalisation keeps `sense`; both render keys round-trip; artwork path; `fanBuildPreviewOptions` lists Sense Fan credited "Flow DNA" with no `sourceUrl`.
- [ ] Run the focused tests: the new file, `fan-appearance.test.ts`, `prop-look.test.ts`, `prop-svg-loader.fan-build.test.ts`, `prop-tip-parity-2d-3d.test.ts`, `prop-tip-points.test.ts`, `led-prop-builds.test.ts`, `worker-prop-factory-contract.test.ts`, the MCP renderer appearance test. Commit.

### Task 5: Verify and integrate

- [ ] Patch check: apply the new patch to a pristine scene-3d copy in scratch with `git apply --check`.
- [ ] Browser: a task-owned vite on a free port (never 5173) from this worktree; check the fan look picker, a pictograph with the Sense Fan, the 2D animator, and the capture route through the worker renderer, light and dark.
- [ ] Full gate on d2 (`pwsh scripts/d2-run.ps1 -Ref <sha> "pnpm run test:ci"` plus the check), which also installs the new patch from the lockfile.
- [ ] Merge main in, stop the preview, `npm run wt:finish -- codex/sense-fan-port --route /settings` from PowerShell.
