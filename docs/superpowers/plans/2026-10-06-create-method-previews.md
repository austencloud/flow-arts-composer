# Create Method Previews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each method card on the Create front door ("How do you want to create?") trades its static icon box for a small live preview that acts out the method with the app's own renderers and data. The cards take turns for two rounds, then rest on finished pictures.

**Architecture:** A Create-owned turn coordinator, `createMethodPreviewTurns()`, passes one turn around the cards in board order. Each card hosts `CreateMethodPreview`, which reserves the box, shows the method tint, loads its scene after the board is idle, and crossfades to it. Six scene components compose the real renderers: `PictographContainer`, `GhostPointer`, the step grid's diagonal wave, `ShapeMatrixMandalaArt` with the guide painter's reveal, `TunnelArtView`, and `GridSvg` with `SvgPropAnimator`.

**Tech Stack:** Svelte 5 runes, SvelteKit, TypeScript, Vitest with jsdom, CSS container queries and subgrid, Web Animations API, Chrome DevTools MCP for browser checks.

**Spec:** `docs/superpowers/specs/2026-10-06-create-method-previews-design.md` (approved 2026-10-06). Read it before Task 1.

---

## Before You Start

**Worktree.** All edits happen in `E:/worktrees/tka-platform/create-method-previews` on branch `codex/create-method-previews`. The primary checkout `E:/tka-platform` stays on `main`; it is used only for the final `wt:finish`.

One-time setup, in PowerShell:

```powershell
New-Item -ItemType Junction -Path E:/worktrees/tka-platform/create-method-previews/node_modules -Target E:/tka-platform/node_modules
Set-Location E:/worktrees/tka-platform/create-method-previews
node scripts/svelte-kit-sync-if-needed.mjs
```

Never run `pnpm install` in the worktree: through the junction it rewrites the primary checkout's packages.

**Tests.** From the worktree:

```bash
npx vitest run --config tests/config/vitest.config.ts <test file>
```

**Type check.** `npm run check:fast` once per task that touches `.svelte` or `.ts` files. Only one `svelte-check` may run machine-wide; check first:

```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'svelte-check' } | Select-Object ProcessId
```

**Formatting.** Run Prettier on new and changed files from the primary checkout with absolute paths:

```bash
cd /e/tka-platform && npx prettier --write /e/worktrees/tka-platform/create-method-previews/<path>
```

Each task's format step lists exactly the files that are safe to format. Hand-edit these four and never run Prettier on them: `src/lib/shared/mandala/services/mandala-guide-image.ts` (tab-indented), `src/lib/shared/transitions/keyframes.css`, `src/lib/shared/attract/components/GhostPointer.svelte`, and `src/lib/shared/landing/data/shape-matrix-hero-pool.ts`. Never run Prettier on `PerformerRing.svelte`, `tunnel-config.ts`, `svg-prop-animator.ts`, or `builder-step-converter.ts` either: they are not Prettier-clean, so formatting them would rewrite lines no task changed.

**Commits.** Run `git status --short` first. Stage and commit only this task's paths, always with a pathspec:

```bash
git add -- <paths>
git commit -m "<message>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- <paths>
```

Never use `git add -A`, `git add .`, a bare `git commit`, `stash`, `reset --hard`, or `checkout --`.

**Port 5173** is Austen's dev server. Never start, stop, or restart it. Probe it with `curl.exe -k -g "https://[::1]:5173/"`.

**Worktree preview server** (Tasks 9 to 19):

1. Resource gate: at least 4096 MB available (`(Get-Counter '\Memory\Available MBytes').CounterSamples[0].CookedValue`) and at most two agent Vite servers running.
2. Plain HTTP: `Test-Path E:/worktrees/tka-platform/create-method-previews/.cert` must print `False`. Without that folder (it is gitignored), the worktree's Vite serves `http://`. Never copy the primary checkout's certificate in: the Fold's Chrome cannot trust it, and `http://localhost` is already a secure context.
3. Add this configuration to `E:/tka-platform/.claude/launch.json` (a tracked file: remove the entry again when the preview stops, and never commit it):

```json
{
  "name": "verify-create-method-previews",
  "runtimeExecutable": "pnpm",
  "runtimeArgs": ["--dir", "E:/worktrees/tka-platform/create-method-previews", "exec", "vite", "--port", "5191", "--host", "127.0.0.1"],
  "port": 5191,
  "url": "http://localhost:5191"
}
```

4. Start it with the in-app browser's `preview_start {name: "verify-create-method-previews"}`. The first load takes about a minute. If 5191 is taken, use the next free port in both places and in every later command that names 5191.
5. For scripted checks (`evaluate_script`, viewport emulation, traces), use the agent Chrome through Chrome DevTools MCP, launched with `scripts/launch-chrome-debug.ps1`. Keep one task-owned tab.

The bench and the worktree preview run signed out on their own origin. Never sign in there.

**Scratch folder.** `<scratch>` means `C:/Users/Austen/AppData/Local/Temp/create-method-previews` (Git Bash: `/c/Users/Austen/AppData/Local/Temp/create-method-previews`). Check scripts, their results, and screenshots live there. Nothing in it is committed.

**Screenshots** are WebP at quality 70: `take_screenshot` with `format: "webp"` and `quality: 70`, or the check scripts' own capture.

**The Fold.** Austen's Galaxy Z Fold6 is reachable over wireless debugging (Task 19). Its Chrome is his personal browser: load only `http://localhost:5191` there (and `http://localhost:5192` for Task 19's production check), drive only the tab the checks open, and never read its storage, cookies, or other tabs. Never change the phone's settings. Austen turns, folds, and wakes it himself.

**Long-frame probe.** Run it with `evaluate_script` after the moment you are screening. It lists every animation frame since first paint that blocked input (a long task over 50ms), with the scripts that ran in it:

```js
async () => {
  const fcp =
    performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0;
  const frames = await new Promise((resolve) => {
    const observer = new PerformanceObserver((list) => {
      observer.disconnect();
      resolve(list.getEntries());
    });
    observer.observe({ type: "long-animation-frame", buffered: true });
    // No callback within a second means no long frame was buffered.
    setTimeout(() => {
      observer.disconnect();
      resolve([]);
    }, 1000);
  });
  return frames
    .filter((frame) => frame.startTime > fcp && frame.blockingDuration > 0)
    .map((frame) => ({
      at: Math.round(frame.startTime),
      ms: Math.round(frame.duration),
      blocking: Math.round(frame.blockingDuration),
      scripts: frame.scripts.map(
        (script) =>
          `${Math.round(script.duration)}ms ${script.invokerType} ${script.sourceFunctionName || script.invoker} ${script.sourceURL}`
      ),
    }));
}
```

A frame "lists" a script when one of its `scripts` strings names that file or function. An empty list passes. Script attribution names entry points only: a callback a scene schedules is attributed to the scene's file, and an awaited continuation to the module that awaited.

**Frame-rate probe.** Run it with `evaluate_script` while the turn you are measuring plays. It counts animation frames for 2.5 seconds and returns frames per second:

```js
async () => {
  if (document.visibilityState !== "visible") {
    return "hidden: bring the agent Chrome window to the front";
  }
  const stamps = [];
  const end = performance.now() + 2500;
  while (performance.now() < end) {
    stamps.push(await new Promise((resolve) => requestAnimationFrame(resolve)));
  }
  return Math.round(((stamps.length - 1) * 1000) / (stamps.at(-1) - stamps[0]));
}
```

A hidden or covered window stops painting, so keep the agent Chrome window visible for both probes.

---

## Spec Corrections

Verified against the code on 2026-10-06. Where the spec and this list differ, this list wins.

1. **The wave's owners.** The band math is `calculateStepWaveBand` in `src/lib/shared/create/utils/grid-calculations.ts`, and the cell keyframe is `stepCascade` in `StepCell.svelte`. The spec named `step-grid-display-state.svelte.ts` and `WorkspaceGrid.svelte`. Task 1 adds `waveBandAt(row, column)` beside the band math and moves `stepCascade` to the global `keyframes.css`. Timing stays in `DEFAULT_ANIMATION_TIMING` (`waveBandDelay` 55, `entranceDuration` 380).
2. **GhostPointer needs a compact size.** Its dot is 28px with an 18 to 40px glow, which buries a 50px strip. Task 2 adds `compact`.
3. **The reveal-frame entry point is needed.** The Shape scene grows a cell and draws its mandala frame by frame. Task 3 adds `createMandalaGuideRevealFrame` beside `renderMandalaGuideImage`.
4. **TunnelArtView needs a decorative mode.** It always shows tap-to-pause, a hover badge, a corner toggle, and a context menu. Task 5 adds `decorative`.
5. **The attract motor cannot drive a preview.** Its `press` resolves real app targets. Scenes create a ghost with `createAttractGhost()`, glide it with `glideTo`, and set `considering` and `pressed` themselves. The first glide appears 60 to 120px from its target, so scenes place the ghost before the first glide.
6. **No crossfade-finished signal exists.** Turns start through `runAfterNamedRouteMorphIdle()`, which waits for the named route morph and an idle turn, plus `METHOD_PREVIEW_TIMING.startDelayMs`.
7. **The Tunnel tool's performer dice runs the full generator.** The preview's dice gives the base performer a sequence from `drawMatrixRealization()`, the same Firebase-free source as the Generate scene, and falls back to the demo sequence turned an eighth (45°), because a quarter turn maps the four-fold Radial ring onto itself.
8. **Demo data import.** Scenes import `$lib/shared/landing/data/demo-sequence.json` directly. `per-visit-demo.ts` pulls in a worker client, so it is not used.
9. **Shape defaults.** The Matrix opens on level 2 with turns 2 for both hands, written as literals in `ShapeMatrixApp.svelte`. Task 4 names them so the Shape scene shows the same corner.
10. **The app's Reduce Motion setting is not where `reducedMotion()` looks.** The setting is `getSettings().reducedMotion`, which `PictographArrivalStage` and `FuseSourceCard` read beside the system query. Nothing in `src` writes `data-motion-preference`, so `reducedMotion()` and the global reduced-motion CSS see only the system setting. The coordinator defaults to `previewMotionReduced()`, which reads both. Scenes need no check of their own: under either setting no turn starts, so every scene stays on its finished picture. Verification covers both paths: DevTools `prefers-reduced-motion` emulation, and `reducedMotion: true` in the `tka-modern-web-settings` localStorage entry on the preview origin. The app-wide CSS gap predates this work and stays out of scope.
11. **The Shape scene's build is the Matrix's own reveal.** `runShapeMatrixGridReveal(host, animator)` in `src/lib/shared/shape-matrix/app/services/shape-matrix-reveal.ts` animates `.rowhead`, `.colhead`, `.cell` and `.cell.sel` inside a host. The scene renders its corner with those class names so the same function builds it, then grows the chosen cell. The `reveal-chosen` highlight styles live in `ShapeMatrixGrid.svelte`'s scoped CSS, so the scene carries its own copy.
12. **A cut scene fades through the tint.** "Crossfades to its finished picture" (spec: Turns) is built as a fade-through in `playSceneTurns()`: the frozen frame fades out over 120ms, the scene settles on its finished picture, and that picture fades in over 200ms. A true crossfade would need a second live copy of every renderer, or a snapshot of canvases that may not allow one. A run that already finished, or reduced motion, settles at once.
13. **Construct's roomy strip holds the start and three steps.** The spec says "up to four" steps. Each step costs one demo tap, at least 560ms (a 300ms minimum glide, then the 260ms tap), so five slots end near 3.2 seconds, past the three-second turn. Four slots end near 2.6 seconds.
14. **TunnelArtView's self-clock ran while paused.** Its frame loop kept running with `playing` false, so a resting Tunnel card would still spend a frame callback on every refresh. Task 14 runs the loop only while the tunnel plays.
15. **Assemble builds the demo's N and M steps.** The blue-then-red points need a step where red moves, and in the opening steps red stands still (Y). The Assemble scene uses steps 4 and 5 (N and M), read through Assemble's own sequence loader, `sequenceToBuilderHydration`, so its props move exactly as on Assemble's grid.
16. **Assemble's prop artwork moves into a service.** `InteractiveGrid.svelte` loads and tints its prop artwork inline. The preview is its second user, so Task 15 first moves that code into `src/lib/features/assemble-lab/services/builder-prop-art.ts`, in a commit of its own. The Assemble tool behaves as before.
17. **One hop length.** `InteractiveGrid` kept the builder's hop duration as a local constant. Task 15 exports it as `BUILDER_HOP_MS` from `svg-prop-animator.ts`, which owns the hop motion, and both users read it.
18. **The front door stays mounted behind a workspace.** `CreateModule` wraps it in `DualSourceCrossfade`, so it stays in the page while a method is open. The board carries `data-playing-method` for the bench and the checks to read, `previewsWanted` mounts the previews the first time the board opens rather than on every Create route, and turns stop whenever the board is not showing.
19. **The Fold trace is a frame record.** The spec asks for a trace on the Fold. Task 19 records the phone's long animation frames, with the scripts behind each, and counts frames per second during each turn, through Chrome's remote debugging connection. Those answer the cost gate directly; a full performance trace pulled from the phone is large and slow.
20. **The bench's switches are buttons.** Checkbox inputs are not used in the app's Svelte files, so the bench's switches (Reduce motion, Guest, and the views) are buttons with `aria-pressed`.

---

## File Map

New, under `src/lib/features/create/shared/`:

| File                                                              | Responsibility                                                                                           |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `state/method-preview-turns.svelte.ts`                            | `createMethodPreviewTurns()`: board order, two rounds, holds, pauses                                     |
| `components/method-previews/method-preview-scenes.ts`             | Scene props contract and the lazy scene registry                                                         |
| `components/method-previews/method-preview-layout.ts`             | Box shape classification and cell fitting                                                                |
| `components/method-previews/method-preview-run.ts`                | Cancellable scene timelines and ghost tap helpers                                                        |
| `components/method-previews/method-preview-demo.ts`               | Demo sequence access and opening steps                                                                   |
| `components/method-previews/method-preview-hold.ts`               | Hover and keyboard holds (Svelte action)                                                                 |
| `components/method-previews/method-preview-compositions.ts`       | Each scene's layout in pixels, with its tuning constants; `transformOnto()` (Task 12)                    |
| `components/method-previews/method-preview-scene-turns.svelte.ts` | `playSceneTurns()`: one cancellable run per turn, and the fade to the finished picture when a run is cut |
| `components/method-previews/method-preview-generate.ts`           | Generate's rolls, wave, and beats                                                                        |
| `components/method-previews/method-preview-shape.ts`              | Shape's Matrix corner and beats                                                                          |
| `components/method-previews/method-preview-fuse.ts`               | Fuse's fused steps, source placement, and beats                                                          |
| `components/method-previews/method-preview-tunnel.ts`             | Tunnel's formation, beats, and the performer's next sequence                                             |
| `components/method-previews/method-preview-assemble.ts`           | Assemble's hops (through Assemble's own sequence loader), grid crop, and point mapping                   |
| `components/method-previews/MethodPreviewFinger.svelte`           | The compact ghost finger a scene draws                                                                   |
| `components/method-previews/MethodPreviewPictograph.svelte`       | One quiet pictograph for scenes                                                                          |
| `components/method-previews/CreateMethodPreview.svelte`           | Reserved box, tint, scene loading, crossfade                                                             |
| `components/method-previews/ConstructScene.svelte`                | Construct scene                                                                                          |
| `components/method-previews/GenerateScene.svelte`                 | Generate scene                                                                                           |
| `components/method-previews/ShapeScene.svelte`                    | Shape scene                                                                                              |
| `components/method-previews/FuseScene.svelte`                     | Fuse scene                                                                                               |
| `components/method-previews/TunnelScene.svelte`                   | Tunnel scene                                                                                             |
| `components/method-previews/AssembleScene.svelte`                 | Assemble scene                                                                                           |

Also new:

- `src/routes/test/create-method-previews/+page.svelte`, the bench, with a front-door view from Task 17.
- `src/lib/features/assemble-lab/services/builder-prop-art.ts`, Assemble's prop artwork moved out of `InteractiveGrid` (Task 15), with `builder-prop-art.test.ts` beside it.
- Tests under `tests/unit/create/`, `tests/unit/shape-matrix/`, `tests/unit/attract/`, and `tests/unit/sequence-viewer/`, with the test helpers `tests/unit/create/FakeMethodScene.svelte`, `FakeMethodPreview.svelte`, `FrontDoorHost.svelte`, and `method-preview-scene-turns-harness.svelte.ts`.

Changed:

| File                                                                 | Change                                                                    |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `src/lib/shared/create/utils/grid-calculations.ts`                   | `waveBandAt()`                                                            |
| `.../sequence-display/components/WorkspaceGrid.svelte`               | Three band sites use `waveBandAt()`                                       |
| `.../sequence-display/components/StepCell.svelte`                    | `stepCascade` keyframes move out                                          |
| `src/lib/shared/transitions/keyframes.css`                           | `stepCascade` keyframes move in                                           |
| `src/lib/shared/attract/components/GhostPointer.svelte`              | `compact` size                                                            |
| `src/lib/shared/mandala/services/mandala-guide-image.ts`             | `createMandalaGuideRevealFrame()`                                         |
| `src/lib/shared/shape-matrix/services/shape-matrix-render.ts`        | `shapeMatrixGuideOptions()`, `mergeCellPaths()`                           |
| `src/lib/shared/shape-matrix/domain/matrix-turn-band.ts`             | Default level and turn constants                                          |
| `src/lib/shared/shape-matrix/app/ShapeMatrixApp.svelte`              | Uses those constants                                                      |
| `src/lib/shared/sequence-viewer/tunnel/TunnelArtView.svelte`         | `decorative` prop; self-clock stops while paused                          |
| `src/lib/features/assemble-lab/components/InteractiveGrid.svelte`    | Prop artwork from `builder-prop-art.ts`; hop length from `BUILDER_HOP_MS` |
| `src/lib/features/assemble-lab/services/svg-prop-animator.ts`        | Exports `BUILDER_HOP_MS` (hand-edited)                                    |
| `src/lib/features/create/shared/components/CreateFrontDoor.svelte`   | Preview slot, icon beside the name, turns, placement CSS                  |
| `docs/architecture/visual-design-canon.md`                           | §15 paragraph                                                             |
| `docs/architecture/canonical-capabilities.md`                        | Preview stage, turn coordinator, and Assemble prop artwork entries        |
| `docs/superpowers/specs/2026-10-06-create-method-previews-design.md` | Chosen composition (Task 16), and any fallback Task 19 takes              |

Only if a cost check calls for it:

| File                                                                                     | Change                                                              |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `src/lib/shared/landing/data/shape-matrix-hero-pool.ts`                                  | The pool build yields between stages (Task 11 Step 10; hand-edited) |
| `src/lib/shared/shape-matrix/services/rotation-style-archetypes.ts`                      | Archetype setup runs in stages (Task 12 Step 10)                    |
| `src/lib/features/create/shared/components/method-previews/TunnelRingScene.svelte` (new) | Replaces `TunnelScene.svelte` (Task 14 Steps 14 to 21)              |

Task 19 decides these on the Fold. It may also take Generate and Tunnel off the home hero's sequence source, or leave Shape on its icon box.

---

### Task 1: One Diagonal Wave

The step grid and the Generate scene must share one wave: the same band math and the same cell keyframe.

**Files:**

- Modify: `src/lib/shared/create/utils/grid-calculations.ts` (the `calculateStepWaveBand` block)
- Modify: `src/lib/features/create/shared/workspace-panel/sequence-display/components/WorkspaceGrid.svelte` (import near line 23, `mandalaRevealSlots` near line 735, timeline cells near line 979, mandala cells near line 1191)
- Modify: `src/lib/features/create/shared/workspace-panel/sequence-display/components/StepCell.svelte` (the `@keyframes stepCascade` block near line 892)
- Modify: `src/lib/shared/transitions/keyframes.css` (after `@keyframes shimmer`, before "REDUCED MOTION SUPPORT")
- Test: `tests/unit/create/step-wave-band.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/create/step-wave-band.test.ts`:

```ts
/**
 * The step grid's generation reveal and the Create front door's Generate
 * preview are one wave: each cell's band is its row plus its column, and
 * every cell enters with the same global `stepCascade` keyframes.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  calculateStepPosition,
  calculateStepWaveBand,
  waveBandAt,
} from "$lib/shared/create/utils/grid-calculations";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const DISPLAY = "src/lib/features/create/shared/workspace-panel/sequence-display/components";

describe("one diagonal wave", () => {
  it("counts a band as zero-based row plus column", () => {
    expect(waveBandAt(0, 0)).toBe(0);
    expect(waveBandAt(0, 3)).toBe(3);
    expect(waveBandAt(2, 1)).toBe(3);
  });

  it("gives every step cell the band of its grid position", () => {
    for (const columns of [1, 3, 4, 8]) {
      for (let index = 0; index < 20; index++) {
        const { row, column } = calculateStepPosition(index, columns);
        expect(calculateStepWaveBand(index, columns)).toBe(
          waveBandAt(row - 1, column - 1)
        );
      }
    }
  });

  it("matches a strip that leads with a start slot to the grid's first row", () => {
    const strip = [0, 1, 2, 3].map((column) => waveBandAt(0, column));
    const grid = [0, ...[0, 1, 2].map((index) => calculateStepWaveBand(index, 4))];
    expect(strip).toEqual(grid);
  });

  it("routes every WorkspaceGrid band through waveBandAt", () => {
    const source = read(`${DISPLAY}/WorkspaceGrid.svelte`);
    expect(source).not.toMatch(/cell\.row - 1 \+ \(cell\.column - 1\)/);
    expect(source).not.toMatch(/rowIndex \+ columnIndex \+ 1/);
    expect(source.match(/waveBandAt\(/g)?.length).toBe(3);
  });

  it("keeps stepCascade global so StepCell and previews share it", () => {
    const keyframes = read("src/lib/shared/transitions/keyframes.css");
    const stepCell = read(`${DISPLAY}/StepCell.svelte`);
    expect(keyframes).toMatch(/@keyframes stepCascade \{/);
    expect(stepCell).not.toMatch(/@keyframes stepCascade/);
    expect(stepCell).toMatch(/animation: stepCascade var\(--step-entrance-duration, 380ms\)/);
    const reducedList = keyframes.slice(keyframes.indexOf("REDUCED MOTION SUPPORT"));
    expect(reducedList).not.toMatch(/stepCascade/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/create/step-wave-band.test.ts`
Expected: FAIL. `waveBandAt` is not exported, so every test errors.

- [ ] **Step 3: Add `waveBandAt` and route the step band through it**

In `grid-calculations.ts`, replace the whole `calculateStepWaveBand` block (its doc comment and function) with:

```ts
/**
 * Which diagonal band a cell sits on: its zero-based row plus its zero-based
 * column, counted out from the grid's top-left cell.
 *
 * The step grid's generation reveal and the Create front door's Generate
 * preview both stagger their cells by this band, so the two waves are one.
 */
export function waveBandAt(row: number, column: number): number {
  return row + column;
}

/**
 * Which diagonal band a step's cell sits on, counted out from the start
 * placement.
 *
 * The generation reveal sweeps one front across the grid rather than filling a
 * list, so cells share a delay when they share a diagonal. Row plus column also
 * means the reveal's length tracks the diagonal (rows + columns) instead of the
 * step count: sixteen steps take one band longer than eight, not twice as long.
 *
 * The start placement occupies row 1, column 1, so it is band 0 and leads the
 * front without needing a case of its own.
 */
export function calculateStepWaveBand(
  stepIndex: number,
  columns: number
): number {
  const { row, column } = calculateStepPosition(stepIndex, columns);
  return waveBandAt(row - 1, column - 1);
}
```

- [ ] **Step 4: Use `waveBandAt` at the three WorkspaceGrid band sites**

Import it (near line 23):

```ts
  import {
    calculateStepPosition,
    calculateStepWaveBand,
    getTimelineWidthMultiplier,
    waveBandAt,
  } from "$lib/shared/create/utils/grid-calculations";
```

In `mandalaRevealSlots` (near line 735), replace `band: cell.row - 1 + (cell.column - 1),` with:

```ts
          band: waveBandAt(cell.row - 1, cell.column - 1),
```

In the timeline rows (near line 979), replace `{@const waveBand = rowIndex + columnIndex + 1}` with:

```svelte
              {@const waveBand = waveBandAt(rowIndex, columnIndex + 1)}
```

In the standard mandala cells (near line 1191), replace `{@const waveBand = cell.row - 1 + (cell.column - 1)}` with:

```svelte
        {@const waveBand = waveBandAt(cell.row - 1, cell.column - 1)}
```

- [ ] **Step 5: Move `stepCascade` to the global keyframes**

In `StepCell.svelte`, delete the two comment blocks that open "Cascade with depth" and "The cell arrives ALONG the wave axis", and the whole `@keyframes stepCascade { ... }` rule after them. Leave `.step-cell.animate` and the reduced-motion block untouched. Put this comment where they were:

```css
  /* stepCascade lives in src/lib/shared/transitions/keyframes.css. The Create
     front door's Generate preview enters its cells with it too, so the two
     waves are one gesture. It is global, so Svelte leaves the name unscoped. */
```

In `keyframes.css`, insert this after the closing brace of `@keyframes shimmer` and before the "REDUCED MOTION SUPPORT" banner. Hand-edit; do not run Prettier on this file.

```css

/**
 * Step cascade - a step cell rising into the plane on the generation wave.
 * Usage: animation: stepCascade var(--step-entrance-duration, 380ms)
 *   cubic-bezier(0.22, 1, 0.36, 1) both; with animation-delay set from the
 *   cell's band (waveBandAt) times --wave-band-delay.
 *
 * Shared by the step grid (StepCell) and the Create front door's Generate
 * preview, so the two waves are one gesture.
 *
 * Scale carries the depth cue and the brief overshoot past 1 gives it
 * something to land against. Transform, opacity and a cheap color filter
 * only: nothing here can reflow a neighbor, and no blur, which forced an
 * offscreen surface for every arriving cell.
 *
 * The cell arrives ALONG the wave axis. The front travels down-right
 * (band = row + column), so starting up-left and settling down-right puts
 * every cell on the same vector as the light passing over it.
 *
 * Not in the reduced-motion list below: each user owns that rule. StepCell
 * collapses the entrance to 0.01ms so its animationend still fires.
 */
@keyframes stepCascade {
  0% {
    opacity: 0;
    transform: translate3d(-11px, -11px, 0) scale(0.88);
    filter: brightness(1.4) saturate(1.3);
  }
  55% {
    opacity: 1;
    /* The landing is the brightest moment. With a 55ms stagger and a 380ms
       entrance, three or four bands are lit at once, so the front reads as
       one bright ridge moving across the grid. */
    filter: brightness(1.32) saturate(1.24);
  }
  75% {
    transform: translate3d(1.5px, 1.5px, 0) scale(1.015);
  }
  100% {
    opacity: 1;
    transform: none;
    filter: brightness(1) saturate(1);
  }
}
```

- [ ] **Step 6: Run the new test and the grid layout tests**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/create/step-wave-band.test.ts tests/unit/create-workspace-grid-layout.test.ts tests/unit/timeline-unit-size-clamp.test.ts`
Expected: PASS for all three files.

- [ ] **Step 7: Format and commit**

`keyframes.css` stays hand-edited; Prettier formats the rest:

```bash
cd /e/tka-platform && npx prettier --write /e/worktrees/tka-platform/create-method-previews/src/lib/shared/create/utils/grid-calculations.ts /e/worktrees/tka-platform/create-method-previews/src/lib/features/create/shared/workspace-panel/sequence-display/components/WorkspaceGrid.svelte /e/worktrees/tka-platform/create-method-previews/src/lib/features/create/shared/workspace-panel/sequence-display/components/StepCell.svelte /e/worktrees/tka-platform/create-method-previews/tests/unit/create/step-wave-band.test.ts
cd /e/worktrees/tka-platform/create-method-previews
git status --short
git add -- tests/unit/create/step-wave-band.test.ts
git commit -m "refactor(create): one diagonal wave for the step grid and previews" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/shared/create/utils/grid-calculations.ts src/lib/features/create/shared/workspace-panel/sequence-display/components/WorkspaceGrid.svelte src/lib/features/create/shared/workspace-panel/sequence-display/components/StepCell.svelte src/lib/shared/transitions/keyframes.css tests/unit/create/step-wave-band.test.ts
```

---

### Task 2: Compact GhostPointer

A 28px dot with a 40px glow covers a whole strip. Previews need a smaller finger with the same look.

**Files:**

- Modify: `src/lib/shared/attract/components/GhostPointer.svelte` (props near line 45, `trailLen` at line 101, root classes near line 105, CSS after the `.ghost.considering .core` rule near line 231)
- Test: `tests/unit/attract/ghost-pointer-compact.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/attract/ghost-pointer-compact.test.ts`:

```ts
/**
 * Create method previews press inside boxes as small as 40px, so the ghost
 * has a compact size: a class the stylesheet sizes off the preview box, and
 * a trail scaled to match.
 */
import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import GhostPointer from "$lib/shared/attract/components/GhostPointer.svelte";

// vitest-setup.ts swaps document.createElement for stubs that are not DOM
// nodes. Mounting a component needs jsdom's own, from document's prototype.
const realCreateElement = Object.getPrototypeOf(document)
  .createElement as typeof document.createElement;

let app: ReturnType<typeof mount> | null = null;
let stubbedCreateElement: typeof document.createElement;

beforeEach(() => {
  stubbedCreateElement = document.createElement;
  document.createElement = realCreateElement.bind(document);
});

afterEach(() => {
  if (app) unmount(app);
  app = null;
  document.body.innerHTML = "";
  document.createElement = stubbedCreateElement;
});

function render(props: Record<string, unknown>) {
  const target = document.createElement("div");
  document.body.append(target);
  app = mount(GhostPointer, { target, props: { x: 10, y: 10, visible: true, ...props } });
  flushSync();
  return target;
}

describe("GhostPointer compact size", () => {
  it("marks the ghost compact", () => {
    const target = render({ compact: true });
    expect(target.querySelector(".ghost")?.classList.contains("compact")).toBe(true);
  });

  it("scales the trail for a compact ghost", () => {
    const target = render({ compact: true, speed: 1 });
    const trail = target.querySelector<HTMLElement>(".trail");
    expect(trail?.style.width).toBe("18px");
  });

  it("keeps the default trail without compact", () => {
    const target = render({ speed: 1 });
    expect(target.querySelector(".ghost")?.classList.contains("compact")).toBe(false);
    expect(target.querySelector<HTMLElement>(".trail")?.style.width).toBe("54px");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/attract/ghost-pointer-compact.test.ts`
Expected: FAIL on the two compact tests (no `compact` class, trail 54px). The default test passes.

- [ ] **Step 3: Add the prop**

Hand-edit `GhostPointer.svelte`. Add `compact = false,` after `stage = false,` in the destructure, and add to the type after the `stage` entry:

```ts
    /** Create method previews: a small finger sized off the preview box. */
    compact?: boolean;
```

Replace the `trailLen` line:

```ts
  const trailLen = $derived(Math.round(speed * (stage ? 96 : compact ? 18 : 54)));
```

Add `class:compact` after `class:considering` on the root `<div class="ghost">`.

- [ ] **Step 4: Add the compact styles**

Insert after the `.ghost.considering .core { ... }` rule:

```css
  /* Create method previews press inside boxes as small as 40px. The size
     follows the preview box (its nearest size container), and the glow
     tightens so it lights the target without covering it. */
  .ghost.compact {
    --size: clamp(14px, 18cqmin, 28px);
  }

  .ghost.compact .core {
    box-shadow:
      0 0 8px color-mix(in srgb, var(--accent, #8b8cff) 65%, transparent),
      0 0 16px color-mix(in srgb, var(--accent, #8b8cff) 30%, transparent);
  }

  .ghost.compact.considering .core {
    box-shadow:
      0 0 12px color-mix(in srgb, var(--accent, #8b8cff) 80%, transparent),
      0 0 24px color-mix(in srgb, var(--accent, #8b8cff) 40%, transparent);
  }
```

`.ghost.compact` outranks the 4K `@media (min-width: 2600px) { .ghost { --size: 44px } }` rule by specificity, so a compact ghost stays sized by its box on 4K.

- [ ] **Step 5: Run the test**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/attract/ghost-pointer-compact.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Format and commit**

`GhostPointer.svelte` stays hand-edited; Prettier formats the test:

```bash
cd /e/tka-platform && npx prettier --write /e/worktrees/tka-platform/create-method-previews/tests/unit/attract/ghost-pointer-compact.test.ts
cd /e/worktrees/tka-platform/create-method-previews
git status --short
git add -- tests/unit/attract/ghost-pointer-compact.test.ts
git commit -m "feat(attract): compact GhostPointer for small preview boxes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/shared/attract/components/GhostPointer.svelte tests/unit/attract/ghost-pointer-compact.test.ts
```

---

### Task 3: Mandala Reveal Frame

The Shape scene grows a matrix cell and draws its mandala start to finish with the guide painter's own reveal. It ends on exactly the tile's picture.

**Files:**

- Modify: `src/lib/shared/mandala/services/mandala-guide-image.ts` (hand-edit, tabs; replace from `const DEFAULT_DEPS` to the end of the file)
- Modify: `src/lib/shared/shape-matrix/services/shape-matrix-render.ts` (imports, `paint()`, `renderCell()`)
- Test: `tests/unit/shape-matrix/mandala-guide-reveal-frame.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/shape-matrix/mandala-guide-reveal-frame.test.ts`:

```ts
/**
 * The Create front door's Shape preview draws a matrix tile's mandala from
 * start to finish. The reveal frame paints with the tile's own options,
 * measures paths for the dash reveal, and lands on the tile's picture: a
 * complete guide, no reveal, at progress 1.
 */
import { describe, expect, it, vi } from "vitest";
import type { MandalaPaths } from "$lib/shared/mandala/domain/mandala-types";
import {
  createMandalaGuideRevealFrame,
  type MandalaGuideImageDependencies,
} from "$lib/shared/mandala/services/mandala-guide-image";
import type {
  MandalaGuidePaintOptions,
  MandalaGuidePaintTarget,
} from "$lib/shared/mandala/services/mandala-guide-painter";
import type { PreparedMandalaPath } from "$lib/shared/mandala/services/types";
import {
  mergeCellPaths,
  renderCell,
  shapeMatrixGuideOptions,
  SHAPE_MATRIX_GUIDE_COLORS,
  SHAPE_MATRIX_GUIDE_STROKE_WIDTH,
} from "$lib/shared/shape-matrix/services/shape-matrix-render";

const left: MandalaPaths = {
  left: [{ d: "M 0 0 C 10 0 10 10 20 10", tipIndex: 0 }],
  right: [],
  purple: [],
};
const right: MandalaPaths = {
  left: [],
  right: [{ d: "M 0 0 C -10 0 -10 -10 -20 -10", tipIndex: 0 }],
  purple: [],
};

function harness() {
  const paints: { target: MandalaGuidePaintTarget; options: MandalaGuidePaintOptions }[] = [];
  const measures: boolean[] = [];
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ({})),
    toDataURL: vi.fn(() => "data:image/png;base64,still"),
  };
  const deps: MandalaGuideImageDependencies = {
    createCanvas: () => canvas as unknown as HTMLCanvasElement,
    prepare: (svgPaths, color, hand, options): PreparedMandalaPath[] => {
      measures.push(options?.measure ?? true);
      return svgPaths.map(() => ({ path2d: {} as Path2D, totalLength: 1, color, hand }));
    },
    paint: (target, options) => {
      paints.push({ target, options });
    },
  };
  return { canvas, deps, paints, measures };
}

const asCanvas = (canvas: object) => canvas as unknown as HTMLCanvasElement;

describe("mandala guide reveal frame", () => {
  it("sizes the canvas like the still and measures paths for the reveal", () => {
    const { canvas, deps, measures } = harness();
    const frame = createMandalaGuideRevealFrame(
      asCanvas(canvas),
      mergeCellPaths(left, right),
      shapeMatrixGuideOptions("both", 120, 100, "extent", { dpr: 2 }),
      deps
    );
    expect(frame).not.toBeNull();
    expect(canvas.width).toBe(240);
    expect(canvas.height).toBe(240);
    expect(measures).toEqual([true, true]);
  });

  it("paints a partial reveal below 1 and the complete guide at 1", () => {
    const { canvas, deps, paints } = harness();
    const frame = createMandalaGuideRevealFrame(
      asCanvas(canvas),
      mergeCellPaths(left, right),
      shapeMatrixGuideOptions("both", 120, 100, "extent", { dpr: 1 }),
      deps
    )!;
    frame.paint(0.4);
    frame.paint(1);
    expect(paints[0]?.options.reveal).toBe(true);
    expect(paints[0]?.options.progress).toBeCloseTo(0.4);
    expect(paints[1]?.options.reveal).toBe(false);
  });

  it("finishes on the tile's own paint options", () => {
    const tile = harness();
    renderCell(left, right, 120, 100, { dpr: 1, deps: tile.deps });
    const reveal = harness();
    createMandalaGuideRevealFrame(
      asCanvas(reveal.canvas),
      mergeCellPaths(left, right),
      shapeMatrixGuideOptions("both", 120, 100, "extent", { dpr: 1 }),
      reveal.deps
    )!.paint(1);
    const still = tile.paints[0]!;
    const done = reveal.paints[0]!;
    expect(done.target.pixelWidth).toBe(still.target.pixelWidth);
    expect(done.options.scale).toBe(still.options.scale);
    expect(done.options.strokeWidth).toBe(SHAPE_MATRIX_GUIDE_STROKE_WIDTH);
    expect(done.options.paths.map((path) => [path.hand, path.color])).toEqual([
      ["left", SHAPE_MATRIX_GUIDE_COLORS.left],
      ["right", SHAPE_MATRIX_GUIDE_COLORS.right],
    ]);
  });

  it("returns null without a size or a 2D context", () => {
    const { canvas, deps } = harness();
    expect(
      createMandalaGuideRevealFrame(
        asCanvas(canvas),
        mergeCellPaths(left, right),
        shapeMatrixGuideOptions("both", 0, 100, "extent"),
        deps
      )
    ).toBeNull();
    const blind = { ...canvas, getContext: () => null };
    expect(
      createMandalaGuideRevealFrame(
        asCanvas(blind),
        mergeCellPaths(left, right),
        shapeMatrixGuideOptions("both", 120, 100, "extent"),
        deps
      )
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/shape-matrix/mandala-guide-reveal-frame.test.ts`
Expected: FAIL. `createMandalaGuideRevealFrame`, `mergeCellPaths`, and `shapeMatrixGuideOptions` are not exported.

- [ ] **Step 3: Add the reveal frame to `mandala-guide-image.ts`**

Hand-edit with tabs. Replace everything from `const DEFAULT_DEPS` to the end of the file with:

```ts
const DEFAULT_DEPS: MandalaGuideImageDependencies = {
	createCanvas: browserCanvas,
	prepare: prepareMandalaHandPaths,
	paint: paintMandalaGuide,
};

interface GuideSurface {
	target: MandalaGuidePaintTarget;
	paint: MandalaGuidePaintOptions;
}

/**
 * Size `canvas` for a square box of `options.size` at the device pixel ratio
 * and prepare the paths the options show. The still and the reveal frame
 * share this, so a finished reveal is the still's exact raster. Only a
 * reveal measures paths: its dash lengths come from real path lengths, and a
 * complete guide never reads them.
 */
function prepareGuideSurface(
	canvas: HTMLCanvasElement,
	paths: MandalaPaths,
	options: MandalaGuideImageOptions,
	prepare: MandalaGuideImageDependencies["prepare"],
	measure: boolean
): GuideSurface | null {
	const size = Math.round(options.size);
	if (!(size > 0)) return null;
	const context = canvas.getContext("2d");
	if (!context) return null;

	const dpr =
		options.dpr ??
		(typeof window !== "undefined" ? (window.devicePixelRatio ?? 1) : 1);
	const pixelSize = Math.max(1, Math.round(size * dpr));
	canvas.width = pixelSize;
	canvas.height = pixelSize;

	const show = options.show ?? "both";
	const prepared: PreparedMandalaPath[] = [];
	if (show === "left" || show === "both") {
		prepared.push(
			...prepare(paths.left, options.leftColor, "left", { measure })
		);
	}
	if (show === "right" || show === "both") {
		prepared.push(
			...prepare(paths.right, options.rightColor, "right", { measure })
		);
	}

	return {
		target: {
			context,
			pixelWidth: pixelSize,
			pixelHeight: pixelSize,
			dpr,
		},
		paint: {
			paths: prepared,
			scale: mandalaGuideScale(paths, { ...options, show }),
			strokeWidth:
				options.strokeWidth ?? DEFAULT_MANDALA_OVERLAY_CONFIG.strokeWidth,
		},
	};
}

/**
 * Paint the guide into a fresh canvas and return it as a data URL. Returns
 * an empty string where no canvas can exist (server render) or the box has
 * no size yet; the consumer renders nothing until it has one.
 */
export function renderMandalaGuideImage(
	paths: MandalaPaths,
	options: MandalaGuideImageOptions,
	deps: MandalaGuideImageDependencies = DEFAULT_DEPS
): string {
	if (!(Math.round(options.size) > 0)) return "";
	const canvas = deps.createCanvas();
	if (!canvas) return "";
	const surface = prepareGuideSurface(
		canvas,
		paths,
		options,
		deps.prepare,
		false
	);
	if (!surface) return "";
	deps.paint(surface.target, surface.paint, masks);
	return canvas.toDataURL("image/png");
}

/** A guide drawing itself into a canvas the caller owns. */
export interface MandalaGuideRevealFrame {
	/**
	 * Paint the guide revealed to `progress` (0..1). At 1 it paints the
	 * complete guide: the pixels `renderMandalaGuideImage` returns for the
	 * same options.
	 */
	paint(progress: number): void;
}

/**
 * The still's progressive twin: the live overlay's reveal (`reveal` and
 * `progress`) at a still's size and fit. The Create front door's Shape
 * preview draws a matrix tile's mandala with it. Returns null where nothing
 * can be painted: no size yet, or no 2D context.
 */
export function createMandalaGuideRevealFrame(
	canvas: HTMLCanvasElement,
	paths: MandalaPaths,
	options: MandalaGuideImageOptions,
	deps: Pick<MandalaGuideImageDependencies, "prepare" | "paint"> = DEFAULT_DEPS
): MandalaGuideRevealFrame | null {
	const surface = prepareGuideSurface(
		canvas,
		paths,
		options,
		deps.prepare,
		true
	);
	if (!surface) return null;
	// Its own scratch masks: a reveal repaints every frame at one size, and the
	// stills' shared masks would be reallocated between sizes.
	const frameMasks = new MandalaOverlapMasks();
	return {
		paint(progress: number): void {
			const complete = progress >= 1;
			deps.paint(
				surface.target,
				{
					...surface.paint,
					reveal: !complete,
					progress: complete ? 1 : Math.max(0, progress),
				},
				frameMasks
			);
		},
	};
}
```

- [ ] **Step 4: Share the tile's options in `shape-matrix-render.ts`**

Extend the guide-image import:

```ts
import {
  mandalaGuideScale,
  renderMandalaGuideImage,
  type MandalaGuideFit,
  type MandalaGuideImageDependencies,
  type MandalaGuideImageOptions,
} from "$lib/shared/mandala/services/mandala-guide-image";
```

Replace the private `paint()` function with:

```ts
/**
 * The guide-image options every Shape Matrix still is painted with. The
 * Create front door's Shape preview reveals a tile with these same options,
 * so its finished drawing is the tile's picture.
 */
export function shapeMatrixGuideOptions(
  show: MandalaHandVisibility,
  sizePx: number,
  tipDx: number,
  fit: MandalaGuideFit,
  options: Pick<ShapeMatrixPaintOptions, "colors" | "dpr"> = {}
): MandalaGuideImageOptions {
  const colors = options.colors ?? SHAPE_MATRIX_GUIDE_COLORS;
  return {
    size: sizePx,
    dpr: options.dpr,
    show,
    leftColor: colors.left,
    rightColor: colors.right,
    strokeWidth: SHAPE_MATRIX_GUIDE_STROKE_WIDTH,
    fit,
    tipDx,
  };
}

function paint(
  paths: MandalaPaths,
  show: MandalaHandVisibility,
  sizePx: number,
  tipDx: number,
  fit: MandalaGuideFit,
  options: ShapeMatrixPaintOptions = {}
): string {
  return renderMandalaGuideImage(
    paths,
    shapeMatrixGuideOptions(show, sizePx, tipDx, fit, options),
    options.deps
  );
}

/** One cell's drawing: the row flower's blue hand over the column flower's red hand. */
export function mergeCellPaths(
  left: MandalaPaths,
  right: MandalaPaths
): MandalaPaths {
  return { left: left.left, right: right.right, purple: [] };
}
```

In `renderCell`, replace the inline `merged` object with the helper:

```ts
  return renderExtentFit(mergeCellPaths(left, right), sizePx, tipDx, options);
```

- [ ] **Step 5: Run the new test and the existing Shape Matrix render tests**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/shape-matrix/mandala-guide-reveal-frame.test.ts tests/unit/shape-matrix/shape-matrix-render.test.ts tests/unit/shape-matrix/shape-matrix-mandala-continuity-contract.test.ts`
Expected: PASS for all three files.

- [ ] **Step 6: Format and commit**

`mandala-guide-image.ts` stays hand-edited; Prettier formats the rest:

```bash
cd /e/tka-platform && npx prettier --write /e/worktrees/tka-platform/create-method-previews/src/lib/shared/shape-matrix/services/shape-matrix-render.ts /e/worktrees/tka-platform/create-method-previews/tests/unit/shape-matrix/mandala-guide-reveal-frame.test.ts
cd /e/worktrees/tka-platform/create-method-previews
git status --short
git add -- tests/unit/shape-matrix/mandala-guide-reveal-frame.test.ts
git commit -m "feat(mandala): reveal frame beside the guide still" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/shared/mandala/services/mandala-guide-image.ts src/lib/shared/shape-matrix/services/shape-matrix-render.ts tests/unit/shape-matrix/mandala-guide-reveal-frame.test.ts
```

---

### Task 4: Shape Matrix Default Corner

**Files:**

- Modify: `src/lib/shared/shape-matrix/domain/matrix-turn-band.ts`
- Modify: `src/lib/shared/shape-matrix/app/ShapeMatrixApp.svelte` (imports, lines 58 to 60)
- Test: `tests/unit/shape-matrix/shape-matrix-default-band.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/shape-matrix/shape-matrix-default-band.test.ts`:

```ts
/**
 * The Matrix opens on one level and turn band. The Create front door's Shape
 * preview shows that same corner, so both read the band from one place.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  matrixTurnsForLevel,
  SHAPE_MATRIX_DEFAULT_LEVEL,
  SHAPE_MATRIX_DEFAULT_TURN,
} from "$lib/shared/shape-matrix/domain/matrix-turn-band";

describe("Shape Matrix default band", () => {
  it("is a turn the default level offers", () => {
    expect(matrixTurnsForLevel(SHAPE_MATRIX_DEFAULT_LEVEL)).toContain(
      SHAPE_MATRIX_DEFAULT_TURN
    );
  });

  it("is what the Matrix app opens on", () => {
    const app = readFileSync(
      resolve(process.cwd(), "src/lib/shared/shape-matrix/app/ShapeMatrixApp.svelte"),
      "utf8"
    );
    expect(app).toMatch(/level: SHAPE_MATRIX_DEFAULT_LEVEL,/);
    expect(app).toMatch(/leftTurn: SHAPE_MATRIX_DEFAULT_TURN,/);
    expect(app).toMatch(/rightTurn: SHAPE_MATRIX_DEFAULT_TURN,/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/shape-matrix/shape-matrix-default-band.test.ts`
Expected: FAIL. The constants are not exported.

- [ ] **Step 3: Add the constants**

Append to `matrix-turn-band.ts`:

```ts
/**
 * The level and turn band the Shape Matrix opens on, for both hands. The
 * Create front door's Shape preview shows the same corner of the matrix.
 */
export const SHAPE_MATRIX_DEFAULT_LEVEL: TurnLevel = 2;
export const SHAPE_MATRIX_DEFAULT_TURN: TurnValue = 2;
```

In `ShapeMatrixApp.svelte`, add the import after the `DEFAULT_THEORY_RATIO` import:

```ts
  import {
    SHAPE_MATRIX_DEFAULT_LEVEL,
    SHAPE_MATRIX_DEFAULT_TURN,
  } from "$lib/shared/shape-matrix/domain/matrix-turn-band";
```

and replace `level: 2,`, `leftTurn: 2,`, `rightTurn: 2,` with:

```ts
      level: SHAPE_MATRIX_DEFAULT_LEVEL,
      leftTurn: SHAPE_MATRIX_DEFAULT_TURN,
      rightTurn: SHAPE_MATRIX_DEFAULT_TURN,
```

- [ ] **Step 4: Run the test and the app state tests**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/shape-matrix/shape-matrix-default-band.test.ts tests/unit/shape-matrix/shape-matrix-app-state.test.ts`
Expected: PASS.

- [ ] **Step 5: Format and commit**

```bash
cd /e/tka-platform && npx prettier --write /e/worktrees/tka-platform/create-method-previews/src/lib/shared/shape-matrix/domain/matrix-turn-band.ts /e/worktrees/tka-platform/create-method-previews/src/lib/shared/shape-matrix/app/ShapeMatrixApp.svelte /e/worktrees/tka-platform/create-method-previews/tests/unit/shape-matrix/shape-matrix-default-band.test.ts
cd /e/worktrees/tka-platform/create-method-previews
git status --short
git add -- tests/unit/shape-matrix/shape-matrix-default-band.test.ts
git commit -m "refactor(shape-matrix): name the default level and turn band" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/shared/shape-matrix/domain/matrix-turn-band.ts src/lib/shared/shape-matrix/app/ShapeMatrixApp.svelte tests/unit/shape-matrix/shape-matrix-default-band.test.ts
```

---

### Task 5: Decorative TunnelArtView

**Files:**

- Modify: `src/lib/shared/sequence-viewer/tunnel/TunnelArtView.svelte` (props near line 29, the `AnimatorCanvas` call near line 257)
- Test: `tests/unit/sequence-viewer/tunnel-art-view-decorative.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/sequence-viewer/tunnel-art-view-decorative.test.ts`:

```ts
/**
 * A decorative tunnel (the Create front door's Tunnel preview) sits inside a
 * card button, so it must offer no controls of its own: no tap to pause, no
 * hover badge, no corner toggle, and no context menu.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/lib/shared/sequence-viewer/tunnel/TunnelArtView.svelte"),
  "utf8"
);

describe("TunnelArtView decorative mode", () => {
  it("declares the prop with a default of false", () => {
    expect(source).toMatch(/decorative = false,/);
    expect(source).toMatch(/decorative\?: boolean;/);
  });

  it("turns off every canvas control when decorative", () => {
    expect(source).toMatch(/tapToToggle=\{!decorative\}/);
    expect(source).toMatch(/hoverHint=\{decorative \? "none" : "badge"\}/);
    expect(source).toMatch(/cornerToggle=\{!decorative\}/);
    expect(source).toMatch(/disableContextMenu=\{decorative\}/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/sequence-viewer/tunnel-art-view-decorative.test.ts`
Expected: FAIL on both tests.

- [ ] **Step 3: Add the prop**

In `TunnelArtView.svelte`, add `decorative = false,` after `onActivePerformerStepsChange,` in the destructure, and add to the type after its `onActivePerformerStepsChange` entry:

```ts
    /** Decorative previews: no tap, hover badge, corner toggle, or context menu. */
    decorative?: boolean;
```

In the `AnimatorCanvas` call, replace

```svelte
        tapToToggle={true}
        hoverHint="badge"
        cornerToggle={true}
```

with

```svelte
        tapToToggle={!decorative}
        hoverHint={decorative ? "none" : "badge"}
        cornerToggle={!decorative}
        disableContextMenu={decorative}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/sequence-viewer/tunnel-art-view-decorative.test.ts`
Expected: PASS.

- [ ] **Step 5: Format, type check, and commit**

Run `npm run check:fast` (after the svelte-check gate). Expected: no new errors in the five files Tasks 1 to 5 touched.

```bash
cd /e/tka-platform && npx prettier --write /e/worktrees/tka-platform/create-method-previews/src/lib/shared/sequence-viewer/tunnel/TunnelArtView.svelte /e/worktrees/tka-platform/create-method-previews/tests/unit/sequence-viewer/tunnel-art-view-decorative.test.ts
cd /e/worktrees/tka-platform/create-method-previews
git status --short
git add -- tests/unit/sequence-viewer/tunnel-art-view-decorative.test.ts
git commit -m "feat(tunnel): decorative TunnelArtView without canvas controls" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/shared/sequence-viewer/tunnel/TunnelArtView.svelte tests/unit/sequence-viewer/tunnel-art-view-decorative.test.ts
```

---

### Task 6: Turn Coordinator

One owner passes the turn around the cards. It knows nothing about drawing: it decides which card plays, for how long, and when to wait.

**Files:**

- Create: `src/lib/features/create/shared/state/method-preview-turns.svelte.ts`
- Test: `tests/unit/create/method-preview-turns.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/create/method-preview-turns.test.ts`:

```ts
/**
 * The Create front door's method cards take turns: board order, two rounds,
 * then rest. A pointer or keyboard focus plays a card now, and the rounds
 * resume after it with the card it cut. Spec:
 * docs/superpowers/specs/2026-10-06-create-method-previews-design.md (Turns).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMethodPreviewTurns,
  type MethodPreviewTurnOptions,
  type MethodPreviewTurns,
} from "$lib/features/create/shared/state/method-preview-turns.svelte";

const TIMING = {
  turnMs: 100,
  gapMs: 10,
  hoverDelayMs: 20,
  readyWaitMs: 50,
  startDelayMs: 5,
  rounds: 2,
};

/** A page that is already quiet: the first turn's countdown starts at once. */
const settled = (go: () => void) => {
  go();
  return () => {};
};

let live: MethodPreviewTurns | null = null;

function setup(
  overrides: Partial<MethodPreviewTurnOptions> = {},
  ready = new Set(["a", "b", "c"])
) {
  live = createMethodPreviewTurns({
    order: () => ["a", "b", "c"],
    isReady: (id) => ready.has(id),
    reducedMotion: () => false,
    defer: settled,
    timing: TIMING,
    ...overrides,
  });
  return { turns: live, ready };
}

/**
 * Run the clock one millisecond at a time up to `untilMs`, calling `at[ms]`
 * first. Records [ms, id] whenever a card starts playing.
 */
function tick(
  turns: MethodPreviewTurns,
  untilMs: number,
  at: Record<number, () => void> = {}
): [number, string][] {
  const plays: [number, string][] = [];
  let last: string | null = null;
  for (let ms = 0; ms <= untilMs; ms++) {
    at[ms]?.();
    const id = turns.playingId;
    if (id !== null && id !== last) plays.push([ms, id]);
    last = id;
    vi.advanceTimersByTime(1);
  }
  return plays;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  live?.dispose();
  live = null;
  vi.useRealTimers();
});

describe("method preview turns", () => {
  it("plays the cards in board order for two rounds, then rests", () => {
    const { turns } = setup();
    turns.start();
    expect(tick(turns, 1000)).toEqual([
      [5, "a"],
      [115, "b"],
      [225, "c"],
      [335, "a"],
      [445, "b"],
      [555, "c"],
    ]);
    expect(turns.playingId).toBeNull();
  });

  it("numbers each turn so a scene can tell a new turn from the last", () => {
    const { turns } = setup();
    turns.start();
    expect(turns.turn).toBe(0);
    tick(turns, 120);
    expect(turns.turn).toBe(2);
  });

  it("waits for a scene that has not loaded, then skips it", () => {
    const { turns } = setup({}, new Set(["a", "c"]));
    turns.start();
    expect(tick(turns, 1000)).toEqual([
      [5, "a"],
      [165, "c"],
      [275, "a"],
      [435, "c"],
    ]);
  });

  it("plays a waiting card as soon as its scene is ready", () => {
    const { turns, ready } = setup({}, new Set(["a", "c"]));
    turns.start();
    const plays = tick(turns, 300, {
      130: () => {
        ready.add("b");
        turns.notifyReady("b");
      },
    });
    expect(plays).toEqual([
      [5, "a"],
      [130, "b"],
      [240, "c"],
    ]);
  });

  it("plays a held card now and replays the card it cut once released", () => {
    const { turns } = setup();
    turns.start();
    const plays = tick(turns, 300, {
      30: () => turns.hold("c"),
      200: () => turns.release("c"),
    });
    expect(plays).toEqual([
      [5, "a"],
      [50, "c"],
      [210, "a"],
    ]);
  });

  it("leaves the playing card alone when it is held, and waits after it", () => {
    const { turns } = setup();
    turns.start();
    const plays = tick(turns, 300, {
      30: () => turns.hold("a"),
      200: () => turns.release("a"),
    });
    expect(plays).toEqual([
      [5, "a"],
      [210, "b"],
    ]);
    expect(turns.turn).toBe(2);
  });

  it("holds the first turn for a card held before it", () => {
    const { turns } = setup();
    turns.start();
    const plays = tick(turns, 400, {
      2: () => turns.hold("b"),
      300: () => turns.release("b"),
    });
    expect(plays).toEqual([
      [22, "b"],
      [310, "a"],
    ]);
  });

  it("plays a held card once its scene loads", () => {
    const { turns, ready } = setup({}, new Set(["a"]));
    turns.start();
    const plays = tick(turns, 200, {
      30: () => turns.hold("b"),
      80: () => {
        ready.add("b");
        turns.notifyReady("b");
      },
    });
    expect(plays).toEqual([
      [5, "a"],
      [80, "b"],
    ]);
  });

  it("still plays a held card after the rounds, without restarting them", () => {
    const { turns } = setup();
    turns.start();
    const plays = tick(turns, 1200, {
      700: () => turns.hold("b"),
      900: () => turns.release("b"),
    });
    expect(plays.slice(6)).toEqual([[720, "b"]]);
  });

  it("pauses while hidden or off screen and resumes with the same card", () => {
    const { turns } = setup();
    turns.start();
    const plays = tick(turns, 200, {
      50: () => turns.setActive(false),
      100: () => turns.setActive(true),
    });
    expect(plays).toEqual([
      [5, "a"],
      [110, "a"],
    ]);
  });

  it("ignores a repeated active signal", () => {
    const { turns } = setup();
    turns.start();
    const plays = tick(turns, 150, { 50: () => turns.setActive(true) });
    expect(plays).toEqual([
      [5, "a"],
      [115, "b"],
    ]);
  });

  it("starts two new rounds from the first card on return", () => {
    const { turns } = setup();
    turns.start();
    tick(turns, 200, { 150: () => turns.stop() });
    expect(turns.playingId).toBeNull();
    turns.start();
    expect(tick(turns, 1000).map(([, id]) => id)).toEqual([
      "a",
      "b",
      "c",
      "a",
      "b",
      "c",
    ]);
  });

  it("plays nothing under reduced motion", () => {
    const { turns } = setup({ reducedMotion: () => true });
    turns.start();
    expect(tick(turns, 500, { 30: () => turns.hold("b") })).toEqual([]);
  });

  it("waits for the page to settle before the first turn", () => {
    const settles: Array<() => void> = [];
    const { turns } = setup({
      defer: (go) => {
        settles.push(go);
        return () => {};
      },
    });
    turns.start();
    expect(tick(turns, 100)).toEqual([]);
    expect(settles).toHaveLength(1);
    settles[0]!();
    expect(tick(turns, 10)).toEqual([[5, "a"]]);
  });

  it("does not start the rounds early when a hold ends before the page settles", () => {
    const { turns } = setup({ defer: () => () => {} });
    turns.start();
    const plays = tick(turns, 100, {
      10: () => turns.hold("a"),
      15: () => turns.release("a"),
    });
    expect(plays).toEqual([]);
  });

  it("ignores a release without a hold", () => {
    const { turns } = setup();
    turns.start();
    expect(tick(turns, 150, { 50: () => turns.release("x") })).toEqual([
      [5, "a"],
      [115, "b"],
    ]);
  });

  it("does nothing after dispose", () => {
    const { turns } = setup();
    turns.dispose();
    turns.start();
    expect(tick(turns, 100)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/create/method-preview-turns.test.ts`
Expected: FAIL. The module does not exist.

- [ ] **Step 3: Write the coordinator**

Create `src/lib/features/create/shared/state/method-preview-turns.svelte.ts`:

```ts
/**
 * The Create front door's method cards take turns playing their previews.
 *
 * One turn passes around the cards in board order. A turn plays one card's
 * scene for about three seconds, then a short gap passes it on. After two
 * rounds every card rests on its finished picture. A pointer resting on a
 * card, or keyboard focus, plays that card now; those extra turns do not
 * count toward the rounds and keep working after them. Automatic turns wait
 * while any card is held, then resume where they left off, replaying the
 * card an extra turn cut short.
 *
 * Spec: docs/superpowers/specs/2026-10-06-create-method-previews-design.md
 * (Turns). Owns order, rounds, holds, and pauses only: scenes own their
 * drawing, and the front door's render gate calls setActive().
 */
import { getSettings } from "$lib/shared/application/state/app-state.svelte";
import { DURATION } from "$lib/shared/transitions/transitions";
import { reducedMotion as systemReducedMotion } from "$lib/shared/transitions/motion";

/**
 * Reduced motion for previews. `reducedMotion()` covers the system setting
 * and the reduced-motion attribute on <html>; the app's own Reduce Motion
 * setting lives in settings and is read beside it, as PictographArrivalStage
 * and FuseSourceCard do (plan: Spec Corrections 10).
 */
export function previewMotionReduced(): boolean {
  return systemReducedMotion() || (getSettings().reducedMotion ?? false);
}

export interface MethodPreviewTiming {
  /** How long one card's scene plays. */
  turnMs: number;
  /** The pause between one card's turn and the next. */
  gapMs: number;
  /** How long a pointer rests on a card, or focus stays, before it plays. */
  hoverDelayMs: number;
  /** How long a turn waits for a scene that has not loaded before skipping it. */
  readyWaitMs: number;
  /** The pause after the page settles before the first turn. */
  startDelayMs: number;
  /** Automatic rounds each time the front door opens. */
  rounds: number;
}

/** The one owner of preview timing. Six cards take about 42 seconds. */
export const METHOD_PREVIEW_TIMING: Readonly<MethodPreviewTiming> =
  Object.freeze({
    turnMs: 3000,
    gapMs: 500,
    hoverDelayMs: 350,
    readyWaitMs: 2500,
    startDelayMs: DURATION.emphasis,
    rounds: 2,
  });

export interface MethodPreviewTurnOptions {
  /** Method ids in board order, read before each turn. */
  order: () => readonly string[];
  /** Whether a card's scene has loaded and drawn its finished picture. */
  isReady: (id: string) => boolean;
  /** Defaults to previewMotionReduced(): the system and app settings. */
  reducedMotion?: () => boolean;
  /**
   * Runs `go` once the page is quiet and returns a cancel function. The front
   * door passes runAfterNamedRouteMorphIdle. Defaults to the next task.
   */
  defer?: (go: () => void) => () => void;
  timing?: Partial<MethodPreviewTiming>;
}

export interface MethodPreviewTurns {
  /** The card playing now, or null between turns and at rest. */
  readonly playingId: string | null;
  /** Counts every turn started, so a scene can tell a new turn from the last. */
  readonly turn: number;
  /** Begin two rounds from the first card: the front door opened or came back. */
  start(): void;
  /** End every turn: a method was chosen or the front door closed. */
  stop(): void;
  /** Pause while the page is hidden or the board is off screen. */
  setActive(active: boolean): void;
  /** A pointer or keyboard focus arrived on a card. */
  hold(id: string): void;
  /** That pointer or focus left. */
  release(id: string): void;
  /** A card's scene finished loading. */
  notifyReady(id: string): void;
  dispose(): void;
}

type TurnKind = "auto" | "extra";

const nextTask = (go: () => void): (() => void) => {
  const id = setTimeout(go, 0);
  return () => clearTimeout(id);
};

export function createMethodPreviewTurns(
  options: MethodPreviewTurnOptions
): MethodPreviewTurns {
  const timing: MethodPreviewTiming = {
    ...METHOD_PREVIEW_TIMING,
    ...options.timing,
  };
  const isReduced = options.reducedMotion ?? previewMotionReduced;
  const defer = options.defer ?? nextTask;

  let playingId = $state<string | null>(null);
  let turn = $state(0);

  let open = false;
  let active = true;
  let disposed = false;
  /** Position in the automatic schedule: rounds times cards. */
  let cursor = 0;
  let roundsDone = false;
  /** Automatic turns move the cursor when they finish; extra turns never do. */
  let playingKind: TurnKind | null = null;
  /** The one pending step: a turn's end, a gap, a start delay, or a wait. */
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** Set while start() waits for the page to settle. */
  let cancelDefer: (() => void) | null = null;
  /** A card whose scene has not loaded yet; its turn waits a while for it. */
  let waitingFor: string | null = null;
  /** Holds per card: a pointer and focus can hold one card at once. */
  const holds = new Map<string, number>();
  let pendingHold: ReturnType<typeof setTimeout> | null = null;

  function clearTimer(): void {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  function schedule(ms: number, step: () => void): void {
    clearTimer();
    timer = setTimeout(step, ms);
  }

  function clearPendingHold(): void {
    if (pendingHold !== null) clearTimeout(pendingHold);
    pendingHold = null;
  }

  function begin(id: string, kind: TurnKind): void {
    playingId = id;
    playingKind = kind;
    turn += 1;
    schedule(timing.turnMs, endTurn);
  }

  function endTurn(): void {
    timer = null;
    if (playingKind === "auto") cursor += 1;
    playingId = null;
    playingKind = null;
    schedule(timing.gapMs, advance);
  }

  function advance(): void {
    timer = null;
    if (!open || !active || disposed || roundsDone || holds.size > 0) return;
    const order = options.order();
    if (order.length === 0 || cursor >= order.length * timing.rounds) {
      roundsDone = true;
      return;
    }
    const id = order[cursor % order.length]!;
    if (!options.isReady(id)) {
      waitingFor = id;
      schedule(timing.readyWaitMs, () => {
        waitingFor = null;
        cursor += 1;
        advance();
      });
      return;
    }
    begin(id, "auto");
  }

  /** An extra turn cuts whatever plays. A cut automatic turn keeps its place. */
  function playExtra(id: string): void {
    clearTimer();
    waitingFor = null;
    begin(id, "extra");
  }

  /** Whether the rounds may move on now: nothing playing, pending, or held. */
  function idle(): boolean {
    return (
      open &&
      active &&
      !disposed &&
      cancelDefer === null &&
      playingId === null &&
      timer === null
    );
  }

  function stop(): void {
    open = false;
    clearTimer();
    cancelDefer?.();
    cancelDefer = null;
    clearPendingHold();
    holds.clear();
    waitingFor = null;
    playingId = null;
    playingKind = null;
  }

  function start(): void {
    if (disposed) return;
    stop();
    cursor = 0;
    roundsDone = false;
    if (isReduced()) return;
    open = true;
    let settledAlready = false;
    const cancel = defer(() => {
      settledAlready = true;
      cancelDefer = null;
      if (open && playingId === null && timer === null) {
        schedule(timing.startDelayMs, advance);
      }
    });
    // A defer that runs at once has already cleared the wait.
    if (!settledAlready) cancelDefer = cancel;
  }

  function setActive(value: boolean): void {
    if (disposed || active === value) return;
    active = value;
    if (!value) {
      // The cut card keeps its place and replays on resume.
      clearTimer();
      clearPendingHold();
      waitingFor = null;
      playingId = null;
      playingKind = null;
      return;
    }
    if (idle()) schedule(timing.gapMs, advance);
  }

  function hold(id: string): void {
    if (disposed || !open || isReduced()) return;
    holds.set(id, (holds.get(id) ?? 0) + 1);
    clearPendingHold();
    pendingHold = setTimeout(() => {
      pendingHold = null;
      if (!active || !open || !holds.has(id)) return;
      if (playingId === id || !options.isReady(id)) return;
      playExtra(id);
    }, timing.hoverDelayMs);
  }

  function release(id: string): void {
    const count = holds.get(id);
    if (!count) return;
    if (count > 1) {
      holds.set(id, count - 1);
      return;
    }
    holds.delete(id);
    clearPendingHold();
    if (holds.size === 0 && idle()) schedule(timing.gapMs, advance);
  }

  function notifyReady(id: string): void {
    if (disposed || !open) return;
    const waited = waitingFor === id;
    if (waited) {
      clearTimer();
      waitingFor = null;
    }
    // A card held before its scene loaded plays as soon as it can.
    if (active && holds.has(id) && pendingHold === null && playingId !== id) {
      playExtra(id);
      return;
    }
    if (waited) advance();
  }

  function dispose(): void {
    stop();
    disposed = true;
  }

  return {
    get playingId() {
      return playingId;
    },
    get turn() {
      return turn;
    },
    start,
    stop,
    setActive,
    hold,
    release,
    notifyReady,
    dispose,
  };
}
```

`release()` clears any pending hold, whichever card it was for. Only one hover delay runs at a time, and a pointer leaving a card means the user moved on.

- [ ] **Step 4: Run the test**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/create/method-preview-turns.test.ts`
Expected: PASS (17 tests).

- [ ] **Step 5: Format and commit**

```bash
cd /e/tka-platform && npx prettier --write /e/worktrees/tka-platform/create-method-previews/src/lib/features/create/shared/state/method-preview-turns.svelte.ts /e/worktrees/tka-platform/create-method-previews/tests/unit/create/method-preview-turns.test.ts
cd /e/worktrees/tka-platform/create-method-previews
git status --short
git add -- src/lib/features/create/shared/state/method-preview-turns.svelte.ts tests/unit/create/method-preview-turns.test.ts
git commit -m "feat(create): turn coordinator for method previews" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/features/create/shared/state/method-preview-turns.svelte.ts tests/unit/create/method-preview-turns.test.ts
```

---

### Task 7: Scene Contract and Helpers

Four small modules every scene shares: the box shapes, a cancellable timeline with demo taps, the demo data, and the lazy scene registry.

**Files:**

- Create: `src/lib/features/create/shared/components/method-previews/method-preview-layout.ts`
- Create: `src/lib/features/create/shared/components/method-previews/method-preview-run.ts`
- Create: `src/lib/features/create/shared/components/method-previews/method-preview-demo.ts`
- Create: `src/lib/features/create/shared/components/method-previews/method-preview-scenes.ts`
- Test: `tests/unit/create/method-preview-layout.test.ts`
- Test: `tests/unit/create/method-preview-run.test.ts`
- Test: `tests/unit/create/method-preview-demo.test.ts`
- Test: `tests/unit/create/method-preview-scenes.test.ts`

- [ ] **Step 1: Write the failing layout test**

Create `tests/unit/create/method-preview-layout.test.ts`:

```ts
/**
 * A preview box takes one of three shapes, and scenes fit their cells to it.
 * The Generate scene staggers its cells with the step grid's wave bands.
 */
import { describe, expect, it } from "vitest";
import {
  classifyPreviewShape,
  gridCellSize,
  rowOfCells,
  slotWaveBand,
} from "$lib/features/create/shared/components/method-previews/method-preview-layout";

describe("preview box shapes", () => {
  it("calls a short wide box a strip", () => {
    expect(classifyPreviewShape(146, 44)).toBe("strip");
  });

  it("calls a tall enough wide box a roomy strip", () => {
    expect(classifyPreviewShape(308, 96)).toBe("roomy");
  });

  it("calls a box near one to one a square", () => {
    expect(classifyPreviewShape(144, 144)).toBe("square");
    expect(classifyPreviewShape(150, 100)).toBe("square");
  });

  it("treats an unsized box as a strip", () => {
    expect(classifyPreviewShape(0, 40)).toBe("strip");
    expect(classifyPreviewShape(120, Number.NaN)).toBe("strip");
  });
});

describe("cell fitting", () => {
  it("fills a strip with full-height cells up to the cap", () => {
    expect(rowOfCells(300, 60, 4, 3, 4)).toEqual({ count: 4, size: 60 });
    expect(rowOfCells(200, 60, 4, 3, 5)).toEqual({ count: 3, size: 60 });
  });

  it("shrinks cells so the minimum count still fits", () => {
    expect(rowOfCells(146, 60, 4, 3, 4)).toEqual({ count: 3, size: 46 });
  });

  it("sizes square grid cells by the tighter side", () => {
    expect(gridCellSize(144, 144, 2, 2, 4)).toBe(70);
    expect(gridCellSize(200, 144, 3, 3, 4)).toBe(45);
  });

  it("returns nothing for an unsized box", () => {
    expect(rowOfCells(0, 60, 4, 3, 4)).toEqual({ count: 0, size: 0 });
    expect(gridCellSize(0, 144, 2, 2, 4)).toBe(0);
  });
});

describe("wave bands for a lead slot and its cells", () => {
  it("runs along a strip one band per slot", () => {
    expect([0, 1, 2, 3].map((slot) => slotWaveBand(slot, 4))).toEqual([
      0, 1, 2, 3,
    ]);
  });

  it("runs diagonally through a square grid", () => {
    expect(
      [0, 1, 2, 3, 4, 5, 6, 7, 8].map((slot) => slotWaveBand(slot, 3))
    ).toEqual([0, 1, 2, 1, 2, 3, 2, 3, 4]);
  });
});
```

- [ ] **Step 2: Write the failing run, demo, and registry tests**

Create `tests/unit/create/method-preview-run.test.ts`:

```ts
/**
 * A scene's turn is one cancellable timeline. Ending the turn ends every
 * wait at once, lifts the demo finger, and runs the scene's cleanups.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  placeGhost,
  SCENE_TAP,
  sceneGhost,
  startSceneRun,
  tapAt,
  type SceneFinger,
} from "$lib/features/create/shared/components/method-previews/method-preview-run";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function fakeFinger() {
  const ghost = { x: 0, y: 0, pressed: false, visible: true, considering: false };
  const glideTo = vi.fn(async (x: number, y: number) => {
    ghost.x = x;
    ghost.y = y;
  });
  return { ghost, glideTo, finger: { ghost, glideTo } as unknown as SceneFinger };
}

describe("scene runs", () => {
  it("finishes a wait when its time passes", async () => {
    const { run } = startSceneRun();
    const done = run.wait(100);
    await vi.advanceTimersByTimeAsync(100);
    await expect(done).resolves.toBe(true);
  });

  it("ends every pending wait at once when the turn ends", async () => {
    const { run, abort } = startSceneRun();
    const first = run.wait(1000);
    const second = run.wait(5000);
    abort();
    await expect(first).resolves.toBe(false);
    await expect(second).resolves.toBe(false);
    expect(run.aborted).toBe(true);
    await expect(run.wait(10)).resolves.toBe(false);
  });

  it("runs cleanups once on abort, and at once when added after it", () => {
    const { run, abort } = startSceneRun();
    const early = vi.fn();
    run.onAbort(early);
    abort();
    abort();
    expect(early).toHaveBeenCalledTimes(1);
    const late = vi.fn();
    run.onAbort(late);
    expect(late).toHaveBeenCalledTimes(1);
  });
});

describe("demo taps", () => {
  it("glides to the point, leans in, presses, and lifts", async () => {
    const { ghost, glideTo, finger } = fakeFinger();
    const { run } = startSceneRun();
    const tap = tapAt(finger, run, 30, 12);
    await vi.advanceTimersByTimeAsync(0);
    expect(glideTo).toHaveBeenCalledWith(30, 12);
    expect(ghost.considering).toBe(true);
    await vi.advanceTimersByTimeAsync(SCENE_TAP.considerMs);
    expect(ghost).toMatchObject({ considering: false, pressed: true });
    await vi.advanceTimersByTimeAsync(SCENE_TAP.pressMs);
    await expect(tap).resolves.toBe(true);
    expect(ghost.pressed).toBe(false);
  });

  it("lets go when the turn ends mid-tap", async () => {
    const { ghost, finger } = fakeFinger();
    const { run, abort } = startSceneRun();
    const tap = tapAt(finger, run, 30, 12);
    await vi.advanceTimersByTimeAsync(SCENE_TAP.considerMs);
    expect(ghost.pressed).toBe(true);
    abort();
    await expect(tap).resolves.toBe(false);
    expect(ghost).toMatchObject({ considering: false, pressed: false });
  });

  it("gives a scene a live finger that vanishes when the turn ends", () => {
    const { run, abort } = startSceneRun();
    const finger = sceneGhost(run, () => null);
    placeGhost(finger, 10, 20);
    expect(finger.ghost).toMatchObject({ x: 10, y: 20, visible: true });
    abort();
    expect(finger.ghost.visible).toBe(false);
    expect(finger.halted()).toBe(true);
  });
});
```

Create `tests/unit/create/method-preview-demo.test.ts`:

```ts
/**
 * Previews draw the home page's demo sequence (MYΩN four times).
 */
import { describe, expect, it } from "vitest";
import {
  DEMO_SEQUENCE,
  openingSteps,
  startPictograph,
} from "$lib/features/create/shared/components/method-previews/method-preview-demo";

describe("method preview demo data", () => {
  it("reads the start placement and the opening steps", () => {
    expect(startPictograph(DEMO_SEQUENCE)?.letter).toBe("γ");
    expect(openingSteps(DEMO_SEQUENCE, 4).map((step) => step.letter)).toEqual([
      "M",
      "Y",
      "Ω",
      "N",
    ]);
    expect(openingSteps(DEMO_SEQUENCE, -1)).toEqual([]);
  });
});
```

Create `tests/unit/create/method-preview-scenes.test.ts`:

```ts
/**
 * Every registered scene belongs to a real Create method. Task 15 extends
 * this to require all six.
 */
import { describe, expect, it } from "vitest";
import { CREATE_TABS } from "$lib/shared/navigation/config/tab-definitions";
import { METHOD_PREVIEW_SCENES } from "$lib/features/create/shared/components/method-previews/method-preview-scenes";

describe("method preview scene registry", () => {
  it("keys scenes by Create method id", () => {
    const methods = new Set(CREATE_TABS.map((tab) => tab.id));
    for (const id of Object.keys(METHOD_PREVIEW_SCENES)) {
      expect(methods.has(id)).toBe(true);
    }
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/create/method-preview-layout.test.ts tests/unit/create/method-preview-run.test.ts tests/unit/create/method-preview-demo.test.ts tests/unit/create/method-preview-scenes.test.ts`
Expected: FAIL. None of the four modules exists.

- [ ] **Step 4: Write the layout module**

Create `src/lib/features/create/shared/components/method-previews/method-preview-layout.ts`:

```ts
/**
 * Box shapes for Create method previews. The front door's container tiers
 * size each box (spec: Placement), and a scene reads its box and composes
 * for one of three shapes. Thresholds are tuned on the bench
 * (/test/create-method-previews).
 */
import { waveBandAt } from "$lib/shared/create/utils/grid-calculations";

export type MethodPreviewShape = "strip" | "roomy" | "square";

/** A box narrower than this (width over height) composes as a square. */
export const SQUARE_MAX_ASPECT = 1.6;

/** A strip at least this tall has room for the roomier composition. */
export const ROOMY_MIN_HEIGHT = 72;

export function classifyPreviewShape(
  width: number,
  height: number
): MethodPreviewShape {
  if (!(width > 0) || !(height > 0)) return "strip";
  if (width / height < SQUARE_MAX_ASPECT) return "square";
  return height >= ROOMY_MIN_HEIGHT ? "roomy" : "strip";
}

/**
 * Fit a row of square cells into a strip: cells as tall as the strip, as
 * many as fit up to `max`. When fewer than `min` fit at full height, the
 * cells shrink so `min` still fit.
 */
export function rowOfCells(
  width: number,
  height: number,
  gap: number,
  min: number,
  max: number
): { count: number; size: number } {
  if (!(width > 0) || !(height > 0)) return { count: 0, size: 0 };
  let size = Math.floor(height);
  let count = Math.min(max, Math.floor((width + gap) / (size + gap)));
  if (count < min) {
    count = min;
    size = Math.floor((width - gap * (min - 1)) / min);
  }
  return { count, size: Math.max(0, size) };
}

/** The largest square cell that fits `columns` by `rows` cells and their gaps. */
export function gridCellSize(
  width: number,
  height: number,
  columns: number,
  rows: number,
  gap: number
): number {
  if (!(width > 0) || !(height > 0) || columns < 1 || rows < 1) return 0;
  const byWidth = (width - gap * (columns - 1)) / columns;
  const byHeight = (height - gap * (rows - 1)) / rows;
  return Math.max(0, Math.floor(Math.min(byWidth, byHeight)));
}

/**
 * The wave band of a slot laid out row by row in `columns` columns. Slot 0
 * is the lead slot: the step grid's start position, the Generate preview's
 * dice. The front starts there, as it does in the step grid.
 */
export function slotWaveBand(slot: number, columns: number): number {
  const width = Math.max(1, Math.floor(columns));
  return waveBandAt(Math.floor(slot / width), slot % width);
}
```

- [ ] **Step 5: Write the run module**

Create `src/lib/features/create/shared/components/method-previews/method-preview-run.ts`:

```ts
/**
 * Scene timelines for Create method previews. A turn runs one scripted
 * timeline. When the turn ends, the timeline stops wherever it is, the demo
 * finger lifts and vanishes, and the scene settles on its finished picture.
 *
 * Taps use the attract ghost's motor (createAttractGhost) and the shared
 * GhostPointer body, the same finger as the Composer page's demos. The
 * attract motor's press resolves real app targets, so scenes tap with
 * tapAt() instead (plan: Spec Corrections 5).
 */
import {
  createAttractGhost,
  type AttractGhost,
} from "$lib/shared/attract/services/attract-ghost.svelte";

export interface SceneRun {
  /** True once the turn ended. A timeline checks it before each step. */
  readonly aborted: boolean;
  /** Wait `ms`. True when the wait finished, false when the turn ended first. */
  wait(ms: number): Promise<boolean>;
  /** Run `cleanup` when the turn ends, or now if it already has. */
  onAbort(cleanup: () => void): void;
}

export function startSceneRun(): { run: SceneRun; abort: () => void } {
  let aborted = false;
  const waits = new Set<(finished: boolean) => void>();
  const cleanups: Array<() => void> = [];

  const run: SceneRun = {
    get aborted() {
      return aborted;
    },
    wait(ms) {
      if (aborted) return Promise.resolve(false);
      return new Promise<boolean>((resolve) => {
        const settle = (finished: boolean) => {
          clearTimeout(timer);
          waits.delete(settle);
          resolve(finished);
        };
        const timer = setTimeout(() => settle(true), Math.max(0, ms));
        waits.add(settle);
      });
    },
    onAbort(cleanup) {
      if (aborted) {
        cleanup();
        return;
      }
      cleanups.push(cleanup);
    },
  };

  function abort(): void {
    if (aborted) return;
    aborted = true;
    for (const settle of [...waits]) settle(false);
    for (const cleanup of cleanups.splice(0)) cleanup();
  }

  return { run, abort };
}

/** The beats of one demo tap, shortened to fit a three-second turn. */
export const SCENE_TAP = Object.freeze({ considerMs: 120, pressMs: 140 });

/** What a tap needs from the ghost: its pose and its glide. */
export type SceneFinger = Pick<AttractGhost, "ghost" | "glideTo">;

/**
 * A demo finger for one turn, in the scene box's coordinates. It moves at
 * once (a preview only plays on screen) and dies with the turn.
 */
export function sceneGhost(
  run: SceneRun,
  getRoot: () => HTMLElement | null
): AttractGhost {
  const { core } = createAttractGhost({ getRoot });
  core.setVisible(true);
  run.onAbort(() => core.kill());
  return core;
}

/**
 * Put the finger at a point without a glide. A ghost's first glide otherwise
 * appears 60 to 120px from its target, outside a small box.
 */
export function placeGhost(finger: SceneFinger, x: number, y: number): void {
  finger.ghost.x = x;
  finger.ghost.y = y;
  finger.ghost.visible = true;
}

/**
 * Glide to a point and tap it: lean in, press, lift. True when the tap
 * landed, false when the turn ended first. The scene acts on true.
 */
export async function tapAt(
  finger: SceneFinger,
  run: SceneRun,
  x: number,
  y: number
): Promise<boolean> {
  const pose = finger.ghost;
  await finger.glideTo(x, y);
  if (run.aborted) return false;
  pose.considering = true;
  const leaned = await run.wait(SCENE_TAP.considerMs);
  pose.considering = false;
  if (!leaned) return false;
  pose.pressed = true;
  const pressed = await run.wait(SCENE_TAP.pressMs);
  pose.pressed = false;
  return pressed;
}
```

- [ ] **Step 6: Write the demo data module**

Create `src/lib/features/create/shared/components/method-previews/method-preview-demo.ts`:

```ts
/**
 * Local data for Create method previews: the home page's 16-step demo
 * sequence (MYΩN four times), already shipped with the landing page.
 * Imported directly; per-visit-demo.ts pulls in a worker client. No
 * Firestore and no workers (spec: Scenes).
 */
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import demoJson from "$lib/shared/landing/data/demo-sequence.json";

export const DEMO_SEQUENCE = demoJson as unknown as SequenceData;

/** A sequence's start placement, under either field name. */
export function startPictograph(
  sequence: SequenceData
): PictographData | null {
  return sequence.startPlacement ?? sequence.startingPlacement ?? null;
}

/** The first `count` steps. */
export function openingSteps(
  sequence: SequenceData,
  count: number
): readonly StepData[] {
  return sequence.steps.slice(0, Math.max(0, count));
}
```

- [ ] **Step 7: Write the scene registry**

Create `src/lib/features/create/shared/components/method-previews/method-preview-scenes.ts`:

```ts
/**
 * The contract every Create method preview scene follows, and the lazy
 * registry the preview stage loads scenes from. Scene modules load by
 * dynamic import after first paint, so the front door's first paint carries
 * no scene code (spec: Performance).
 *
 * Every scene:
 * - draws with the renderers and data its method uses;
 * - draws its finished picture first and calls `onready`, then plays only
 *   while `playing` is true, starting a fresh run for each new `turn`;
 * - when `playing` turns false mid-run, stops at once and settles on the
 *   finished picture (playSceneTurns fades a cut run through the tint);
 * - holds no buttons, links, or focusable elements;
 * - names the method flow it mirrors in its header comment.
 */
import type { Component } from "svelte";
import type { MethodPreviewShape } from "./method-preview-layout";

export interface MethodPreviewSceneProps {
  /** True while it is this card's turn. A scene animates only then. */
  playing: boolean;
  /** The coordinator's turn number. A new number while playing is a new run. */
  turn: number;
  /** Which composition the box takes. */
  shape: MethodPreviewShape;
  /** The box's size in CSS px. */
  width: number;
  height: number;
  /** The method's color, for the finger and highlights. */
  accent: string;
  /** Call once, when the finished picture is drawn and the scene can play. */
  onready: () => void;
}

export type MethodPreviewSceneModule = {
  default: Component<MethodPreviewSceneProps>;
};

/** Create method id (CREATE_TABS) to its scene module. */
export const METHOD_PREVIEW_SCENES: Readonly<
  Record<string, () => Promise<MethodPreviewSceneModule>>
> = {};
```

- [ ] **Step 8: Run the tests**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/create/method-preview-layout.test.ts tests/unit/create/method-preview-run.test.ts tests/unit/create/method-preview-demo.test.ts tests/unit/create/method-preview-scenes.test.ts`
Expected: PASS (all four files).

- [ ] **Step 9: Format, type check, and commit**

```bash
cd /e/tka-platform && npx prettier --write /e/worktrees/tka-platform/create-method-previews/src/lib/features/create/shared/components/method-previews/method-preview-layout.ts /e/worktrees/tka-platform/create-method-previews/src/lib/features/create/shared/components/method-previews/method-preview-run.ts /e/worktrees/tka-platform/create-method-previews/src/lib/features/create/shared/components/method-previews/method-preview-demo.ts /e/worktrees/tka-platform/create-method-previews/src/lib/features/create/shared/components/method-previews/method-preview-scenes.ts /e/worktrees/tka-platform/create-method-previews/tests/unit/create/method-preview-layout.test.ts /e/worktrees/tka-platform/create-method-previews/tests/unit/create/method-preview-run.test.ts /e/worktrees/tka-platform/create-method-previews/tests/unit/create/method-preview-demo.test.ts /e/worktrees/tka-platform/create-method-previews/tests/unit/create/method-preview-scenes.test.ts
```

Run `npm run check:fast` in the worktree (after the svelte-check gate). Expected: no errors in the new files.

```bash
cd /e/worktrees/tka-platform/create-method-previews
git status --short
git add -- src/lib/features/create/shared/components/method-previews/method-preview-layout.ts src/lib/features/create/shared/components/method-previews/method-preview-run.ts src/lib/features/create/shared/components/method-previews/method-preview-demo.ts src/lib/features/create/shared/components/method-previews/method-preview-scenes.ts tests/unit/create/method-preview-layout.test.ts tests/unit/create/method-preview-run.test.ts tests/unit/create/method-preview-demo.test.ts tests/unit/create/method-preview-scenes.test.ts
git commit -m "feat(create): scene contract and helpers for method previews" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/features/create/shared/components/method-previews/method-preview-layout.ts src/lib/features/create/shared/components/method-previews/method-preview-run.ts src/lib/features/create/shared/components/method-previews/method-preview-demo.ts src/lib/features/create/shared/components/method-previews/method-preview-scenes.ts tests/unit/create/method-preview-layout.test.ts tests/unit/create/method-preview-run.test.ts tests/unit/create/method-preview-demo.test.ts tests/unit/create/method-preview-scenes.test.ts
```

---

### Task 8: Preview Box

`CreateMethodPreview` is the box each card hosts. It is reserved and tinted from first paint, loads its scene once the board is idle, and crossfades to the scene when the scene has drawn its finished picture. `MethodPreviewPictograph` is the one quiet pictograph every scene draws with.

**Files:**

- Create: `src/lib/features/create/shared/components/method-previews/MethodPreviewPictograph.svelte`
- Create: `src/lib/features/create/shared/components/method-previews/CreateMethodPreview.svelte`
- Create: `tests/unit/create/FakeMethodScene.svelte`
- Test: `tests/unit/create/create-method-preview.test.ts`

- [ ] **Step 1: Write the stand-in scene**

Create `tests/unit/create/FakeMethodScene.svelte` (beside the existing `PassthroughStub.svelte`):

```svelte
<!-- A stand-in method preview scene. It reports ready on mount, unless a
     test switches that off, and shows the props the preview box passes it. -->
<script module lang="ts">
  /** Tests switch this off to hold a scene before its first picture. */
  export const fakeScene = { reportsReady: true };
</script>

<script lang="ts">
  import { onMount } from "svelte";
  import type { MethodPreviewSceneProps } from "$lib/features/create/shared/components/method-previews/method-preview-scenes";

  let { playing, turn, shape, width, height, accent, onready }: MethodPreviewSceneProps =
    $props();

  onMount(() => {
    if (fakeScene.reportsReady) onready();
  });
</script>

<span
  class="fake-scene"
  data-playing={String(playing)}
  data-turn={String(turn)}
  data-shape={shape}
  data-size={`${width}x${height}`}
  data-accent={accent}
></span>
```

- [ ] **Step 2: Write the failing test**

Create `tests/unit/create/create-method-preview.test.ts`:

```ts
/**
 * The preview box in a Create front door method card: reserved and tinted
 * from first paint, hidden from assistive technology, and swapped to its
 * method's scene once the board is idle and the scene has drawn.
 */
import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CreateMethodPreview from "$lib/features/create/shared/components/method-previews/CreateMethodPreview.svelte";
import FakeMethodScene, { fakeScene } from "./FakeMethodScene.svelte";

// vitest-setup.ts swaps document.createElement for stubs that are not DOM
// nodes. Mounting a component needs jsdom's own, from document's prototype.
const realCreateElement = Object.getPrototypeOf(document)
  .createElement as typeof document.createElement;

/** jsdom has no ResizeObserver. This one reports a 120×48 box at once. */
class BoxObserver {
  constructor(private readonly report: ResizeObserverCallback) {}
  observe(target: Element): void {
    const entry = { target, contentRect: { width: 120, height: 48 } };
    this.report(
      [entry as unknown as ResizeObserverEntry],
      this as unknown as ResizeObserver
    );
  }
  unobserve(): void {}
  disconnect(): void {}
}

const fakeLoader = () => Promise.resolve({ default: FakeMethodScene });

let host: HTMLElement;
let component: ReturnType<typeof mount> | null = null;
let stubbedCreateElement: typeof document.createElement;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("ResizeObserver", BoxObserver);
  stubbedCreateElement = document.createElement;
  document.createElement = realCreateElement.bind(document);
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  if (component) unmount(component);
  component = null;
  host.remove();
  document.createElement = stubbedCreateElement;
  fakeScene.reportsReady = true;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function render(props: Record<string, unknown>): void {
  component = mount(CreateMethodPreview, {
    target: host,
    props: { methodId: "construct", color: "#3b82f6", ...props },
  });
  flushSync();
}

/** Let the idle wait pass (jsdom has no requestIdleCallback, so 180ms) and the scene mount. */
async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(400);
  flushSync();
}

describe("CreateMethodPreview", () => {
  it("reserves a tinted box that assistive technology skips", () => {
    render({ loader: fakeLoader });
    const box = host.querySelector<HTMLElement>(".method-preview");
    expect(box).not.toBeNull();
    expect(box!.hasAttribute("inert")).toBe(true);
    expect(box!.getAttribute("aria-hidden")).toBe("true");
    expect(box!.style.getPropertyValue("--method-color")).toBe("#3b82f6");
    expect(box!.querySelector(".tint")).not.toBeNull();
    expect(box!.querySelector(".fake-scene")).toBeNull();
    expect(
      box!.querySelector("button, a, input, select, textarea, [tabindex]")
    ).toBeNull();
  });

  it("loads the scene once the board is idle and reports ready once", async () => {
    const onready = vi.fn();
    render({ loader: fakeLoader, onready });
    await vi.advanceTimersByTimeAsync(100);
    flushSync();
    expect(host.querySelector(".fake-scene")).toBeNull();
    await settle();
    const scene = host.querySelector<HTMLElement>(".fake-scene");
    expect(scene?.dataset.shape).toBe("strip");
    expect(scene?.dataset.size).toBe("120x48");
    expect(scene?.dataset.accent).toBe("#3b82f6");
    expect(onready).toHaveBeenCalledTimes(1);
    expect(onready).toHaveBeenCalledWith("construct");
  });

  it("passes the turn through once the scene is ready", async () => {
    render({ loader: fakeLoader, playing: true, turn: 3 });
    await settle();
    const scene = host.querySelector<HTMLElement>(".fake-scene");
    expect(scene?.dataset.playing).toBe("true");
    expect(scene?.dataset.turn).toBe("3");
  });

  it("does not play a scene that has not drawn yet", async () => {
    fakeScene.reportsReady = false;
    render({ loader: fakeLoader, playing: true, turn: 3 });
    await settle();
    expect(
      host.querySelector<HTMLElement>(".fake-scene")?.dataset.playing
    ).toBe("false");
  });

  it("keeps the tint for a method without a scene", async () => {
    render({ methodId: "not-a-method" });
    await settle();
    expect(host.querySelector(".tint")).not.toBeNull();
    expect(host.querySelector(".fake-scene")).toBeNull();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/create/create-method-preview.test.ts`
Expected: FAIL. `CreateMethodPreview.svelte` does not exist, so the file errors on import.

- [ ] **Step 4: Write the quiet pictograph**

Create `src/lib/features/create/shared/components/method-previews/MethodPreviewPictograph.svelte`:

```svelte
<script lang="ts">
  /**
   * MethodPreviewPictograph
   *
   * One pictograph in a Create method preview, drawn by the real
   * PictographContainer with every glyph, label, and step number off, so a
   * small cell shows the grid, props, and arrows only. Transitions are off:
   * a scene moves its cells itself and must never wait on a fade. The grid,
   * prop artwork, and colors follow the user's settings, as everywhere else.
   */
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
  import type { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";

  let {
    data,
    visibleHand = null,
    motionStartData = null,
    motionStep = null,
    motionProgress = null,
    arrowOpacity = 1,
    readyEpoch = 0,
    onReady,
  }: {
    data: StepData | PictographData | null;
    /** One hand only, the way Fuse shows its inputs. */
    visibleHand?: HandSide | null;
    /** In-place travel from this pose (Fuse's playback). */
    motionStartData?: PictographData | null;
    motionStep?: StepData | null;
    /** 0 to 1. Null draws the finished pictograph. */
    motionProgress?: number | null;
    /** Arrows fade in with the travel, as on Fuse's own cards. */
    arrowOpacity?: number;
    /**
     * Bump to hear onReady again for the same data. A Generate reroll can
     * leave a cell's step unchanged; a new epoch still reports it ready.
     */
    readyEpoch?: number;
    /** Fires when this data's picture has rendered, once per epoch. */
    onReady?: () => void;
  } = $props();
</script>

<PictographContainer
  pictographData={data}
  disableTransitions
  disableContentTransitions
  showTKA={false}
  showReversals={false}
  showNonRadialPoints={false}
  showHandPoints={false}
  showTnD={false}
  showElemental={false}
  showPropTnD={false}
  showPlacements={false}
  showHandColorKey={false}
  stepNumberOverride={false}
  {visibleHand}
  {motionStartData}
  {motionStep}
  {motionProgress}
  {arrowOpacity}
  {readyEpoch}
  {onReady}
/>
```

- [ ] **Step 5: Write the preview box**

Create `src/lib/features/create/shared/components/method-previews/CreateMethodPreview.svelte`:

```svelte
<script lang="ts">
  /**
   * CreateMethodPreview
   *
   * The live preview in a Create front door method card. Spec:
   * docs/superpowers/specs/2026-10-06-create-method-previews-design.md
   *
   * The box is reserved from first paint and shows the method's tint. Once
   * the board is idle and any route morph has finished, the method's scene
   * loads and draws its finished picture in the hidden layer. When the scene
   * reports ready, the box crossfades from the tint to the scene, so nothing
   * around it moves. Turns arrive from the front door's coordinator as
   * `playing` and `turn`.
   *
   * The box is decorative: inert and hidden from assistive technology, so
   * the card stays one native button with its own name. The host gives it a
   * positioned, sized slot; it fills that slot and is the size container its
   * scene measures against.
   */
  import { onMount } from "svelte";
  import DualSourceCrossfade from "$lib/shared/components/DualSourceCrossfade.svelte";
  import LazyMount from "$lib/shared/components/LazyMount.svelte";
  import { runAfterNamedRouteMorphIdle } from "$lib/shared/transitions/named-route-morph-state.svelte";
  import { classifyPreviewShape } from "./method-preview-layout";
  import {
    METHOD_PREVIEW_SCENES,
    type MethodPreviewSceneModule,
  } from "./method-preview-scenes";

  let {
    methodId,
    color,
    playing = false,
    turn = 0,
    onready,
    loader,
  }: {
    /** A CREATE_TABS id. */
    methodId: string;
    /** The method's color: the tint, and the scene's accent. */
    color: string;
    /** True while it is this card's turn. */
    playing?: boolean;
    /** The coordinator's turn number. */
    turn?: number;
    /** Fires once, when the scene has drawn its finished picture. */
    onready?: (methodId: string) => void;
    /** Test seam. Defaults to the method's registered scene. */
    loader?: () => Promise<MethodPreviewSceneModule>;
  } = $props();

  const sceneLoader = $derived(loader ?? METHOD_PREVIEW_SCENES[methodId]);

  let box = $state<HTMLElement | null>(null);
  let width = $state(0);
  let height = $state(0);
  let load = $state(false);
  let ready = $state(false);

  const shape = $derived(classifyPreviewShape(width, height));

  // A scene draws for its box. A zero-size report (the board hidden for a
  // moment) keeps the last real size, so a loaded scene is never torn down.
  $effect(() => {
    const node = box;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[entries.length - 1]?.contentRect;
      if (!rect) return;
      const nextWidth = Math.floor(rect.width);
      const nextHeight = Math.floor(rect.height);
      if (nextWidth <= 0 || nextHeight <= 0) return;
      width = nextWidth;
      height = nextHeight;
    });
    observer.observe(node);
    return () => observer.disconnect();
  });

  // Scene code stays out of first paint. It loads once the board is idle
  // and any route morph has finished (spec: Performance).
  onMount(() =>
    runAfterNamedRouteMorphIdle(() => {
      load = true;
    })
  );

  function handleReady(): void {
    if (ready) return;
    ready = true;
    onready?.(methodId);
  }
</script>

<span
  class="method-preview"
  bind:this={box}
  inert
  aria-hidden="true"
  style:--method-color={color}
>
  <DualSourceCrossfade active={ready ? "second" : "first"}>
    {#snippet first()}
      <span class="tint"></span>
    {/snippet}
    {#snippet second()}
      {#if sceneLoader && width > 0 && height > 0}
        <LazyMount
          loader={sceneLoader}
          active={load}
          debugName={`create method preview ${methodId}`}
          props={{
            playing: playing && ready,
            turn,
            shape,
            width,
            height,
            accent: color,
            onready: handleReady,
          }}
        />
      {/if}
    {/snippet}
  </DualSourceCrossfade>
</span>

<style>
  .method-preview {
    position: absolute;
    inset: 0;
    display: block;
    overflow: hidden;
    border-radius: inherit;
    container-type: size;
  }

  .tint {
    position: absolute;
    inset: 0;
    background: color-mix(in srgb, var(--method-color) 14%, transparent);
  }
</style>
```

- [ ] **Step 6: Run the test**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/create/create-method-preview.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 7: Format, type check, and commit**

```bash
cd /e/tka-platform && npx prettier --write /e/worktrees/tka-platform/create-method-previews/src/lib/features/create/shared/components/method-previews/MethodPreviewPictograph.svelte /e/worktrees/tka-platform/create-method-previews/src/lib/features/create/shared/components/method-previews/CreateMethodPreview.svelte /e/worktrees/tka-platform/create-method-previews/tests/unit/create/FakeMethodScene.svelte /e/worktrees/tka-platform/create-method-previews/tests/unit/create/create-method-preview.test.ts
```

Run `npm run check:fast` in the worktree (after the svelte-check gate). Expected: no errors in the new files.

```bash
cd /e/worktrees/tka-platform/create-method-previews
git status --short
git add -- src/lib/features/create/shared/components/method-previews/MethodPreviewPictograph.svelte src/lib/features/create/shared/components/method-previews/CreateMethodPreview.svelte tests/unit/create/FakeMethodScene.svelte tests/unit/create/create-method-preview.test.ts
git commit -m "feat(create): reserved preview box for method cards" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/features/create/shared/components/method-previews/MethodPreviewPictograph.svelte src/lib/features/create/shared/components/method-previews/CreateMethodPreview.svelte tests/unit/create/FakeMethodScene.svelte tests/unit/create/create-method-preview.test.ts
```

---

### Task 9: Hover and Keyboard Turns, and the Bench

A mouse or pen resting on a card, or keyboard focus reaching it, asks for that card's turn. One Svelte action owns that mapping for the bench and the front door. The bench then shows every scene at the four box sizes and in the two card compositions Task 16 compares.

**Files:**

- Create: `src/lib/features/create/shared/components/method-previews/method-preview-hold.ts`
- Create: `src/routes/test/create-method-previews/+page.svelte`
- Test: `tests/unit/create/method-preview-hold.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/create/method-preview-hold.test.ts`:

```ts
/**
 * Resting a mouse or pen on a Create method card, or reaching it by
 * keyboard, asks the turn coordinator for that card's turn. Touch never
 * does: on a touch screen a tap opens the method. A click ends a pointer
 * hold, because a locked method's sign-up dialog opens over the card.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { methodPreviewHold } from "$lib/features/create/shared/components/method-previews/method-preview-hold";

// vitest-setup.ts stubs document.createElement; listeners need a real node.
const realCreateElement = Object.getPrototypeOf(document)
  .createElement as typeof document.createElement;

const pointer = (type: string, pointerType: string): Event =>
  Object.assign(new Event(type), { pointerType });

let node: HTMLButtonElement;
let turns: { hold: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> };
let keyboardFocus = false;

beforeEach(() => {
  node = realCreateElement.call(document, "button") as HTMLButtonElement;
  // jsdom cannot tell keyboard focus from pointer focus; the test decides.
  node.matches = (selector: string) =>
    selector === ":focus-visible" ? keyboardFocus : false;
  turns = { hold: vi.fn(), release: vi.fn() };
  keyboardFocus = false;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("methodPreviewHold", () => {
  it("holds a card while a mouse or pen rests on it", () => {
    methodPreviewHold(node, { turns, id: "generate" });
    node.dispatchEvent(pointer("pointerenter", "mouse"));
    expect(turns.hold).toHaveBeenCalledWith("generate");
    node.dispatchEvent(pointer("pointerleave", "mouse"));
    expect(turns.release).toHaveBeenCalledWith("generate");
    node.dispatchEvent(pointer("pointerenter", "pen"));
    expect(turns.hold).toHaveBeenCalledTimes(2);
  });

  it("ignores touch", () => {
    methodPreviewHold(node, { turns, id: "generate" });
    node.dispatchEvent(pointer("pointerenter", "touch"));
    node.dispatchEvent(pointer("pointerleave", "touch"));
    expect(turns.hold).not.toHaveBeenCalled();
    expect(turns.release).not.toHaveBeenCalled();
  });

  it("holds a card reached by keyboard, not one focused by a tap", () => {
    methodPreviewHold(node, { turns, id: "fuse" });
    node.dispatchEvent(new Event("focus"));
    expect(turns.hold).not.toHaveBeenCalled();
    node.dispatchEvent(new Event("blur"));
    keyboardFocus = true;
    node.dispatchEvent(new Event("focus"));
    expect(turns.hold).toHaveBeenCalledWith("fuse");
    node.dispatchEvent(new Event("blur"));
    expect(turns.release).toHaveBeenCalledWith("fuse");
  });

  it("lets go of a pointer hold when the card is clicked", () => {
    methodPreviewHold(node, { turns, id: "assemble" });
    node.dispatchEvent(pointer("pointerenter", "mouse"));
    node.dispatchEvent(new Event("click"));
    expect(turns.release).toHaveBeenCalledWith("assemble");
    node.dispatchEvent(pointer("pointerleave", "mouse"));
    expect(turns.release).toHaveBeenCalledTimes(1);
  });

  it("lets go when destroyed and stops listening", () => {
    const action = methodPreviewHold(node, { turns, id: "tunnel" });
    node.dispatchEvent(pointer("pointerenter", "mouse"));
    action.destroy();
    expect(turns.release).toHaveBeenCalledTimes(1);
    node.dispatchEvent(pointer("pointerenter", "mouse"));
    expect(turns.hold).toHaveBeenCalledTimes(1);
  });

  it("moves a held card's hold to its new id", () => {
    const action = methodPreviewHold(node, { turns, id: "construct" });
    node.dispatchEvent(pointer("pointerenter", "mouse"));
    action.update({ turns, id: "assemble" });
    expect(turns.release).toHaveBeenCalledWith("construct");
    node.dispatchEvent(pointer("pointerenter", "mouse"));
    expect(turns.hold).toHaveBeenLastCalledWith("assemble");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/create/method-preview-hold.test.ts`
Expected: FAIL. The module does not exist.

- [ ] **Step 3: Write the action**

Create `src/lib/features/create/shared/components/method-previews/method-preview-hold.ts`:

```ts
/**
 * Resting a mouse or pen on a Create method card, or reaching it by
 * keyboard, asks the turn coordinator to play that card's preview (spec:
 * Turns). Touch never does: on a touch screen a tap opens the method, and a
 * tap's focus does not match :focus-visible.
 *
 * A click ends a pointer hold. A locked method opens its sign-up dialog over
 * the card, and a pointer under a modal dialog may never report leaving, so
 * waiting for pointerleave could hold the turns for as long as it is open.
 *
 *   <button use:methodPreviewHold={{ turns, id: method.id }}>
 */
import type { MethodPreviewTurns } from "$lib/features/create/shared/state/method-preview-turns.svelte";

export interface MethodPreviewHoldParams {
  turns: Pick<MethodPreviewTurns, "hold" | "release">;
  id: string;
}

function keyboardFocused(node: HTMLElement): boolean {
  try {
    return node.matches(":focus-visible");
  } catch {
    // An engine without :focus-visible gets pointer holds only.
    return false;
  }
}

export function methodPreviewHold(
  node: HTMLElement,
  params: MethodPreviewHoldParams
): { update(next: MethodPreviewHoldParams): void; destroy(): void } {
  let current = params;
  let pointerHeld = false;
  let focusHeld = false;

  const onPointerEnter = (event: Event): void => {
    const kind = (event as PointerEvent).pointerType;
    if (pointerHeld || (kind !== "mouse" && kind !== "pen")) return;
    pointerHeld = true;
    current.turns.hold(current.id);
  };

  const onPointerLeave = (): void => {
    if (!pointerHeld) return;
    pointerHeld = false;
    current.turns.release(current.id);
  };

  const onFocus = (): void => {
    if (focusHeld || !keyboardFocused(node)) return;
    focusHeld = true;
    current.turns.hold(current.id);
  };

  const onBlur = (): void => {
    if (!focusHeld) return;
    focusHeld = false;
    current.turns.release(current.id);
  };

  const letGo = (): void => {
    onPointerLeave();
    onBlur();
  };

  node.addEventListener("pointerenter", onPointerEnter);
  node.addEventListener("pointerleave", onPointerLeave);
  node.addEventListener("click", onPointerLeave);
  node.addEventListener("focus", onFocus);
  node.addEventListener("blur", onBlur);

  return {
    update(next) {
      if (next.id === current.id && next.turns === current.turns) return;
      letGo();
      current = next;
    },
    destroy() {
      letGo();
      node.removeEventListener("pointerenter", onPointerEnter);
      node.removeEventListener("pointerleave", onPointerLeave);
      node.removeEventListener("click", onPointerLeave);
      node.removeEventListener("focus", onFocus);
      node.removeEventListener("blur", onBlur);
    },
  };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/create/method-preview-hold.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Write the bench**

Create `src/routes/test/create-method-previews/+page.svelte`. The `/test` layout already sets `ssr = false` and guards the route out of production.

```svelte
<script lang="ts">
  /**
   * Bench for the Create front door's method previews. Spec:
   * docs/superpowers/specs/2026-10-06-create-method-previews-design.md
   *
   * "Sizes" shows every scene in the four box sizes the front door's tiers
   * produce. "Compositions" shows the two card compositions the composition
   * review compares, at the opened Fold's card sizes. One turn coordinator
   * drives both views, with the front door's hover and keyboard holds.
   */
  import { onMount } from "svelte";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { CREATE_TABS } from "$lib/shared/navigation/config/tab-definitions";
  import CreateMethodPreview from "$lib/features/create/shared/components/method-previews/CreateMethodPreview.svelte";
  import { methodPreviewHold } from "$lib/features/create/shared/components/method-previews/method-preview-hold";
  import {
    createMethodPreviewTurns,
    previewMotionReduced,
  } from "$lib/features/create/shared/state/method-preview-turns.svelte";

  const ORDER = [
    "construct",
    "generate",
    "shape-engine",
    "fuse",
    "tunnel",
    "assemble",
  ];
  const methods = ORDER.flatMap((id) =>
    CREATE_TABS.filter((tab) => tab.id === id)
  );

  const BOXES = [
    { label: "Strip 146×48 (iPhone SE)", width: 146, height: 48 },
    { label: "Roomy strip 308×96 (Fold portrait)", width: 308, height: 96 },
    { label: "Square 144×144 (Fold landscape)", width: 144, height: 144 },
    { label: "Large square 200×200 (desktop)", width: 200, height: 200 },
  ];

  const CARDS = {
    portrait: { label: "Fold portrait 336×207", width: 336, height: 207 },
    landscape: { label: "Fold landscape 394×172", width: 394, height: 172 },
  } as const;
  type CardShape = keyof typeof CARDS;
  type View = "sizes" | "compositions";

  let view = $state<View>("sizes");
  let cardShape = $state<CardShape>("portrait");
  let reduce = $state(false);
  let initialPreference: string | undefined;

  const readyIds = new Set<string>();
  const turns = createMethodPreviewTurns({
    order: () => methods.map((method) => method.id),
    isReady: (id) => readyIds.has(id),
  });

  function handleReady(id: string): void {
    if (readyIds.has(id)) return;
    readyIds.add(id);
    turns.notifyReady(id);
  }

  /** A new view mounts new boxes, so readiness and rounds start over. */
  function showView(next: View): void {
    if (next === view) return;
    view = next;
    readyIds.clear();
    turns.start();
  }

  /** Same boxes at a new size: the scenes re-compose, and rounds restart. */
  function showCardShape(next: CardShape): void {
    cardShape = next;
    turns.start();
  }

  function setMotionAttribute(value: string | undefined): void {
    const root = document.documentElement;
    if (value === undefined) delete root.dataset.motionPreference;
    else root.dataset.motionPreference = value;
  }

  /** Flips the reduced-motion attribute on <html>, which reducedMotion() reads like the system setting. */
  function toggleReduce(): void {
    setMotionAttribute(
      document.documentElement.dataset.motionPreference === "reduce"
        ? undefined
        : "reduce"
    );
    reduce = previewMotionReduced();
    turns.start();
  }

  onMount(() => {
    initialPreference = document.documentElement.dataset.motionPreference;
    reduce = previewMotionReduced();
    turns.start();
    return () => {
      turns.dispose();
      setMotionAttribute(initialPreference);
    };
  });
</script>

<svelte:head>
  <title>Create method previews</title>
</svelte:head>

<main class="bench">
  <header class="bench-bar">
    <h1>Create method previews</h1>
    <div class="bench-controls">
      <button
        type="button"
        aria-pressed={view === "sizes"}
        onclick={() => showView("sizes")}>Sizes</button
      >
      <button
        type="button"
        aria-pressed={view === "compositions"}
        onclick={() => showView("compositions")}>Compositions</button
      >
      <button type="button" onclick={() => turns.start()}>Restart rounds</button>
      <button type="button" aria-pressed={reduce} onclick={toggleReduce}
        >Reduce motion</button
      >
      <output data-testid="turn-status"
        >{turns.playingId ?? "resting"} · turn {turns.turn}</output
      >
    </div>
  </header>

  {#if view === "sizes"}
    <div class="sizes-scroll">
      <table class="sizes">
        <thead>
          <tr>
            <th scope="col">Method</th>
            {#each BOXES as box (box.label)}
              <th scope="col">{box.label}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each methods as method (method.id)}
            <tr>
              <th scope="row">{t(method.labelKey)}</th>
              {#each BOXES as box (box.label)}
                <td>
                  <span
                    class="bench-box"
                    style:width="{box.width}px"
                    style:height="{box.height}px"
                    use:methodPreviewHold={{ turns, id: method.id }}
                  >
                    <CreateMethodPreview
                      methodId={method.id}
                      color={method.color ?? "#8b8cff"}
                      playing={turns.playingId === method.id}
                      turn={turns.turn}
                      onready={handleReady}
                    />
                  </span>
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else}
    <div class="bench-controls">
      {#each Object.entries(CARDS) as [key, card] (key)}
        <button
          type="button"
          aria-pressed={cardShape === key}
          onclick={() => showCardShape(key as CardShape)}>{card.label}</button
        >
      {/each}
    </div>
    <div class="compositions">
      {#each ["inset", "edge"] as composition (composition)}
        <section>
          <h2>
            {composition === "inset" ? "A: inset stage" : "B: edge to edge"}
          </h2>
          <div class="mock-board">
            {#each methods as method (method.id)}
              <button
                type="button"
                class="mock-card"
                class:edge={composition === "edge"}
                class:square={cardShape === "landscape"}
                style:--method-color={method.color ?? "#8b8cff"}
                style:width="{CARDS[cardShape].width}px"
                style:height="{CARDS[cardShape].height}px"
                use:methodPreviewHold={{ turns, id: method.id }}
              >
                <span class="mock-stage">
                  <CreateMethodPreview
                    methodId={method.id}
                    color={method.color ?? "#8b8cff"}
                    playing={turns.playingId === method.id}
                    turn={turns.turn}
                    onready={handleReady}
                  />
                </span>
                <span class="mock-copy">
                  <span class="mock-name">
                    <span class="mock-icon" aria-hidden="true"
                      >{@html method.icon}</span
                    >
                    {t(method.labelKey)}
                  </span>
                  {#if method.descKey}
                    <span class="mock-description">{t(method.descKey)}</span>
                  {/if}
                </span>
              </button>
            {/each}
          </div>
        </section>
      {/each}
    </div>
  {/if}
</main>

<style>
  .bench {
    min-height: 100dvh;
    padding: 16px;
    box-sizing: border-box;
    background: var(--theme-panel-bg, #0f0f14);
    color: var(--theme-text, #f4f4f8);
  }

  .bench-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 16px;
  }

  h1 {
    margin: 0;
    font-size: 1.25rem;
  }

  h2 {
    margin: 0 0 12px;
    font-size: 1rem;
  }

  .bench-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
  }

  .bench-controls button[aria-pressed="true"] {
    outline: 2px solid currentColor;
  }

  .sizes-scroll {
    overflow-x: auto;
  }

  .sizes {
    border-collapse: separate;
    border-spacing: 12px;
  }

  .sizes th {
    text-align: left;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--theme-text-dim, #b8b8c4);
  }

  .bench-box {
    position: relative;
    display: block;
    border-radius: 10px;
    outline: 1px dashed color-mix(in srgb, currentColor 30%, transparent);
  }

  .compositions {
    display: flex;
    flex-wrap: wrap;
    gap: 32px;
  }

  .mock-board {
    display: grid;
    grid-template-columns: repeat(2, max-content);
    gap: 16px 8px;
  }

  /* Mirrors .method-card in the 480-1199px tier of CreateFrontDoor.svelte. */
  .mock-card {
    position: relative;
    box-sizing: border-box;
    display: grid;
    grid-template-rows: minmax(44px, 1fr) auto;
    row-gap: 12px;
    padding: 14px;
    border: 1px solid
      color-mix(in srgb, var(--method-color) 30%, var(--theme-stroke, #2c2c36));
    border-radius: var(--radius-2026-md, 14px);
    background: color-mix(
      in srgb,
      var(--method-color) 11%,
      var(--theme-card-bg, #16161d)
    );
    color: var(--theme-text, #f4f4f8);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .mock-card:focus-visible {
    outline: 3px solid
      color-mix(in srgb, var(--method-color) 76%, var(--theme-text, #fff));
    outline-offset: 2px;
  }

  .mock-stage {
    position: relative;
    display: block;
    min-height: 0;
    border-radius: var(--radius-2026-sm, 10px);
  }

  .mock-card.edge .mock-stage {
    margin: -14px -14px 0;
    border-radius: 13px 13px 0 0;
  }

  .mock-card.square {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .mock-card.square .mock-stage {
    flex: none;
    align-self: stretch;
    aspect-ratio: 1;
    min-width: 44px;
  }

  .mock-card.square.edge .mock-stage {
    margin: -14px 0 -14px -14px;
    border-radius: 13px 0 0 13px;
  }

  .mock-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .mock-name {
    display: flex;
    align-items: center;
    gap: 0.4em;
    font-size: 1.25rem;
    font-weight: 720;
    line-height: 1.15;
  }

  .mock-icon {
    color: var(--method-color);
    font-size: 0.9em;
  }

  .mock-description {
    color: var(--theme-text-dim, #b8b8c4);
    font-size: 14px;
    line-height: 1.42;
    text-wrap: pretty;
  }
</style>
```

- [ ] **Step 6: Format and type check**

```bash
cd /e/tka-platform && npx prettier --write /e/worktrees/tka-platform/create-method-previews/src/lib/features/create/shared/components/method-previews/method-preview-hold.ts /e/worktrees/tka-platform/create-method-previews/src/routes/test/create-method-previews/+page.svelte /e/worktrees/tka-platform/create-method-previews/tests/unit/create/method-preview-hold.test.ts
```

Run `npm run check:fast` in the worktree (after the svelte-check gate). Expected: no errors in the new files.

- [ ] **Step 7: Start the worktree preview and check the empty bench**

Start the preview server as **Before You Start** describes (first use: resource gate, the temporary `launch.json` entry, `preview_start`). Open [http://localhost:5191/test/create-method-previews](http://localhost:5191/test/create-method-previews) in the agent Chrome.

No scene is registered yet, so every box keeps its tint. Run this with `evaluate_script`:

```js
() =>
  [...document.querySelectorAll(".bench-box")].map((box) => {
    const rect = box.firstElementChild.getBoundingClientRect();
    return `${Math.round(rect.width)}x${Math.round(rect.height)}`;
  })
```

Expected: 24 entries, `146x48`, `308x96`, `144x144`, `200x200` six times over. The console shows no errors. The turn status reads `resting · turn 0` after about 30 seconds, because the coordinator skips cards whose scenes never load.

Switch to **Compositions** and check both card shapes: each card keeps its declared size, the name and description are not clipped, and the stage fills the room the text leaves.

- [ ] **Step 8: Commit**

```bash
cd /e/worktrees/tka-platform/create-method-previews
git status --short
git add -- src/lib/features/create/shared/components/method-previews/method-preview-hold.ts src/routes/test/create-method-previews/+page.svelte tests/unit/create/method-preview-hold.test.ts
git commit -m "feat(create): hover and keyboard turns, and the method preview bench" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/features/create/shared/components/method-previews/method-preview-hold.ts src/routes/test/create-method-previews/+page.svelte tests/unit/create/method-preview-hold.test.ts
```

---

### Task 10: Shared Scene Pieces and the Construct Scene

Every scene needs the same four pieces: one run per turn with the fade to the finished picture, a wait that polls a condition, the compact finger, and its layout in pixels. Construct is the first scene built on them.

**Files:**

- Create: `src/lib/features/create/shared/components/method-previews/method-preview-scene-turns.svelte.ts`
- Modify: `src/lib/features/create/shared/components/method-previews/method-preview-run.ts` (append `waitUntil`)
- Create: `src/lib/features/create/shared/components/method-previews/method-preview-compositions.ts`
- Create: `src/lib/features/create/shared/components/method-previews/MethodPreviewFinger.svelte`
- Create: `src/lib/features/create/shared/components/method-previews/ConstructScene.svelte`
- Modify: `src/lib/features/create/shared/components/method-previews/method-preview-scenes.ts` (register Construct)
- Create: `tests/unit/create/method-preview-scene-turns-harness.svelte.ts`
- Test: `tests/unit/create/method-preview-scene-turns.test.ts`
- Modify: `tests/unit/create/method-preview-run.test.ts`
- Test: `tests/unit/create/method-preview-compositions.test.ts`
- Test: `tests/unit/create/method-preview-scene-contract.test.ts`

- [ ] **Step 1: Write the failing scene-turns test**

Create `tests/unit/create/method-preview-scene-turns-harness.svelte.ts`:

```ts
/**
 * Runs playSceneTurns() inside an effect root, the way a scene component
 * calls it during init, with `playing` and `turn` as settable state.
 */
import { flushSync } from "svelte";
import type { SceneRun } from "$lib/features/create/shared/components/method-previews/method-preview-run";
import {
  playSceneTurns,
  type SceneTurnHooks,
} from "$lib/features/create/shared/components/method-previews/method-preview-scene-turns.svelte";

export function sceneTurnsHarness(
  play: (run: SceneRun) => Promise<void>,
  hooks: SceneTurnHooks
) {
  let playing = $state(false);
  let turn = $state(0);
  const dispose = $effect.root(() => {
    playSceneTurns(() => ({ playing, turn }), play, hooks);
  });
  flushSync();
  return {
    set(next: { playing?: boolean; turn?: number }): void {
      if (next.playing !== undefined) playing = next.playing;
      if (next.turn !== undefined) turn = next.turn;
      flushSync();
    },
    dispose,
  };
}
```

Create `tests/unit/create/method-preview-scene-turns.test.ts`:

```ts
/**
 * A Create method preview scene runs one cancellable timeline per turn. A
 * run cut off mid-scene fades through to the finished picture; a run that
 * finished, or reduced motion, settles at once.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SceneRun } from "$lib/features/create/shared/components/method-previews/method-preview-run";
import type { SceneTurnHooks } from "$lib/features/create/shared/components/method-previews/method-preview-scene-turns.svelte";
import { sceneTurnsHarness } from "./method-preview-scene-turns-harness.svelte";

interface FakeAnimation {
  keyframes: Keyframe[];
  onfinish: (() => void) | null;
  cancel: ReturnType<typeof vi.fn>;
}

/** A root whose animate() records each fade instead of running it. */
function fadingRoot() {
  const animations: FakeAnimation[] = [];
  const element = {
    animate: (keyframes: Keyframe[]) => {
      const animation: FakeAnimation = {
        keyframes,
        onfinish: null,
        cancel: vi.fn(),
      };
      animations.push(animation);
      return animation;
    },
  } as unknown as HTMLElement;
  return { element, animations };
}

/** A scene that records its runs. Unless it finishes, it plays until cut. */
function recorder(finishes = false) {
  const runs: SceneRun[] = [];
  const play = async (run: SceneRun): Promise<void> => {
    runs.push(run);
    if (!finishes) await run.wait(60_000);
  };
  return { runs, play };
}

/** Let a finished run's promise chain settle. */
const flushRun = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

let live: ReturnType<typeof sceneTurnsHarness> | null = null;

function setup(
  play: (run: SceneRun) => Promise<void>,
  overrides: Partial<SceneTurnHooks> = {}
) {
  const settle = vi.fn();
  live = sceneTurnsHarness(play, {
    root: () => null,
    settle,
    reducedMotion: () => false,
    ...overrides,
  });
  return { harness: live, settle };
}

afterEach(() => {
  live?.dispose();
  live = null;
});

describe("scene turns", () => {
  it("starts a run when the card starts playing", () => {
    const { runs, play } = recorder();
    const { harness } = setup(play);
    expect(runs).toHaveLength(0);
    harness.set({ playing: true, turn: 1 });
    expect(runs).toHaveLength(1);
  });

  it("ends the last run and starts a fresh one for a new turn", () => {
    const { runs, play } = recorder();
    const { harness } = setup(play);
    harness.set({ playing: true, turn: 1 });
    harness.set({ turn: 2 });
    expect(runs).toHaveLength(2);
    expect(runs[0]!.aborted).toBe(true);
    expect(runs[1]!.aborted).toBe(false);
  });

  it("starts nothing when the turn moves on while another card plays", () => {
    const { runs, play } = recorder();
    const { harness } = setup(play);
    harness.set({ turn: 4 });
    expect(runs).toHaveLength(0);
  });

  it("settles at once when a finished run ends", async () => {
    const { runs, play } = recorder(true);
    const { element, animations } = fadingRoot();
    const { harness, settle } = setup(play, { root: () => element });
    harness.set({ playing: true, turn: 1 });
    await flushRun();
    harness.set({ playing: false });
    expect(runs[0]!.aborted).toBe(true);
    expect(settle).toHaveBeenCalledTimes(1);
    expect(animations).toHaveLength(0);
  });

  it("fades a cut run out, settles, then fades the finished picture in", () => {
    const { runs, play } = recorder();
    const { element, animations } = fadingRoot();
    const { harness, settle } = setup(play, { root: () => element });
    harness.set({ playing: true, turn: 1 });
    harness.set({ playing: false });
    expect(runs[0]!.aborted).toBe(true);
    expect(animations).toHaveLength(1);
    expect(animations[0]!.keyframes).toEqual([{ opacity: 1 }, { opacity: 0 }]);
    expect(settle).not.toHaveBeenCalled();
    animations[0]!.onfinish?.();
    expect(settle).toHaveBeenCalledTimes(1);
    expect(animations).toHaveLength(2);
    expect(animations[1]!.keyframes).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(animations[0]!.cancel).toHaveBeenCalled();
  });

  it("settles a fade still running before the next run starts", () => {
    const { runs, play } = recorder();
    const { element, animations } = fadingRoot();
    const { harness, settle } = setup(play, { root: () => element });
    harness.set({ playing: true, turn: 1 });
    harness.set({ playing: false });
    harness.set({ playing: true, turn: 2 });
    expect(animations[0]!.cancel).toHaveBeenCalled();
    expect(settle).toHaveBeenCalledTimes(1);
    expect(runs).toHaveLength(2);
    animations[0]!.onfinish?.();
    expect(settle).toHaveBeenCalledTimes(1);
  });

  it("settles a cut run at once under reduced motion", () => {
    const { play } = recorder();
    const { element, animations } = fadingRoot();
    const { harness, settle } = setup(play, {
      root: () => element,
      reducedMotion: () => true,
    });
    harness.set({ playing: true, turn: 1 });
    harness.set({ playing: false });
    expect(settle).toHaveBeenCalledTimes(1);
    expect(animations).toHaveLength(0);
  });

  it("ends the run when the scene goes away", () => {
    const { runs, play } = recorder();
    const { harness } = setup(play);
    harness.set({ playing: true, turn: 1 });
    harness.dispose();
    live = null;
    expect(runs[0]!.aborted).toBe(true);
  });
});
```

- [ ] **Step 2: Add the failing `waitUntil` tests**

In `tests/unit/create/method-preview-run.test.ts`, replace the import block with:

```ts
import {
  placeGhost,
  SCENE_TAP,
  sceneGhost,
  startSceneRun,
  tapAt,
  waitUntil,
  type SceneFinger,
} from "$lib/features/create/shared/components/method-previews/method-preview-run";
```

Append at the end of the file:

```ts
describe("waiting on a condition", () => {
  it("resolves true once the condition holds", async () => {
    const { run } = startSceneRun();
    let ready = false;
    setTimeout(() => {
      ready = true;
    }, 100);
    const waiting = waitUntil(run, () => ready, 500);
    await vi.advanceTimersByTimeAsync(150);
    await expect(waiting).resolves.toBe(true);
  });

  it("gives up after its timeout", async () => {
    const { run } = startSceneRun();
    const waiting = waitUntil(run, () => false, 200);
    await vi.advanceTimersByTimeAsync(250);
    await expect(waiting).resolves.toBe(false);
  });

  it("gives up when the turn ends", async () => {
    const { run, abort } = startSceneRun();
    const waiting = waitUntil(run, () => false, 5000);
    abort();
    await expect(waiting).resolves.toBe(false);
  });
});
```

- [ ] **Step 3: Write the failing compositions test**

Create `tests/unit/create/method-preview-compositions.test.ts`. The numbers are the bench's four boxes: the iPhone SE strip, the Fold portrait strip, the Fold landscape square, and the desktop square.

```ts
/**
 * Where each Create method preview scene puts its pieces, in box pixels, for
 * the bench's four boxes: strip 146×48, roomy strip 308×96, square 144×144,
 * and square 200×200.
 */
import { describe, expect, it } from "vitest";
import {
  assembleLayout,
  cellCenter,
  constructLayout,
  fuseLayout,
  generateLayout,
  previewGap,
  shapeCellRect,
  shapeLayout,
  tunnelLayout,
} from "$lib/features/create/shared/components/method-previews/method-preview-compositions";

const at = (x: number, y: number, size: number) => ({ x, y, size });

describe("preview gaps", () => {
  it("grows with the box from 3 to 8px", () => {
    expect(previewGap(146, 48)).toBe(3);
    expect(previewGap(308, 96)).toBe(5);
    expect(previewGap(144, 144)).toBe(7);
    expect(previewGap(200, 200)).toBe(8);
  });

  it("finds a cell's center", () => {
    expect(cellCenter(at(10, 4, 20))).toEqual({ x: 20, y: 14 });
  });
});

describe("Construct", () => {
  it("lines up the start and its steps in a strip", () => {
    expect(constructLayout("strip", 146, 48)).toEqual([
      at(1, 1, 46),
      at(50, 1, 46),
      at(99, 1, 46),
    ]);
    expect(constructLayout("roomy", 308, 96)).toEqual([
      at(0, 11, 73),
      at(78, 11, 73),
      at(156, 11, 73),
      at(234, 11, 73),
    ]);
  });

  it("wraps them two by two in a square", () => {
    expect(constructLayout("square", 144, 144)).toEqual([
      at(0, 0, 68),
      at(75, 0, 68),
      at(0, 75, 68),
      at(75, 75, 68),
    ]);
    expect(constructLayout("square", 200, 200)).toEqual([
      at(0, 0, 96),
      at(104, 0, 96),
      at(0, 104, 96),
      at(104, 104, 96),
    ]);
  });
});

describe("Generate", () => {
  it("puts the dice first in a strip", () => {
    expect(generateLayout("strip", 146, 48)).toEqual({
      dice: at(0, 7, 34),
      cells: [at(37, 7, 34), at(74, 7, 34), at(111, 7, 34)],
      columns: 4,
    });
    expect(generateLayout("roomy", 308, 96)).toEqual({
      dice: at(0, 11, 73),
      cells: [at(78, 11, 73), at(156, 11, 73), at(234, 11, 73)],
      columns: 4,
    });
  });

  it("uses a 3×3 grid only when its cells stay large", () => {
    expect(generateLayout("square", 144, 144)).toEqual({
      dice: at(0, 0, 68),
      cells: [at(75, 0, 68), at(0, 75, 68), at(75, 75, 68)],
      columns: 2,
    });
    const large = generateLayout("square", 200, 200)!;
    expect(large.columns).toBe(3);
    expect(large.dice).toEqual(at(0, 0, 61));
    expect(large.cells).toHaveLength(8);
    expect(large.cells[7]).toEqual(at(138, 138, 61));
  });
});

describe("Shape", () => {
  it("draws the chosen cell in place in a short strip", () => {
    const layout = shapeLayout("strip", 146, 48)!;
    expect(layout).toMatchObject({
      cell: 48,
      x: 1,
      y: 0,
      columns: 2,
      rows: 1,
      columnHeads: false,
      chosen: { row: 0, column: 1 },
      grows: false,
    });
    expect(layout.stage).toEqual(at(97, 0, 48));
  });

  it("grows the chosen cell into a stage beside a roomy corner", () => {
    const layout = shapeLayout("roomy", 308, 96)!;
    expect(layout).toMatchObject({
      cell: 32,
      x: 23,
      y: 0,
      columns: 4,
      rows: 2,
      columnHeads: true,
      chosen: { row: 0, column: 3 },
      grows: true,
    });
    expect(layout.stage).toEqual(at(188, 0, 96));
    expect(shapeCellRect(layout, 0, 3)).toEqual(at(151, 32, 32));
  });

  it("grows the chosen cell over the middle of a square corner", () => {
    const small = shapeLayout("square", 144, 144)!;
    expect(small).toMatchObject({ cell: 48, x: 0, y: 0, columns: 2, rows: 2 });
    expect(small.stage).toEqual(at(48, 48, 96));
    expect(shapeCellRect(small, 0, 1)).toEqual(at(96, 48, 48));
    const large = shapeLayout("square", 200, 200)!;
    expect(large).toMatchObject({ cell: 66, x: 1, y: 1 });
    expect(large.stage).toEqual(at(67, 67, 132));
    expect(shapeCellRect(large, 0, 1)).toEqual(at(133, 67, 66));
  });

  it("falls back to the square corner when a roomy strip is too narrow", () => {
    expect(shapeLayout("roomy", 153, 96)).toEqual({
      cell: 32,
      x: 28,
      y: 0,
      columns: 2,
      rows: 2,
      columnHeads: true,
      chosen: { row: 0, column: 1 },
      stage: at(60, 32, 64),
      grows: true,
    });
  });
});

describe("Fuse", () => {
  it("lines up two blue and two red sources, then two combined cells", () => {
    expect(fuseLayout("strip", 146, 48)).toEqual({
      blue: [at(0, 7, 34), at(37, 7, 34)],
      red: [at(74, 7, 34), at(111, 7, 34)],
      combined: [at(23, 0, 48), at(74, 0, 48)],
    });
    expect(fuseLayout("roomy", 308, 96)).toEqual({
      blue: [at(8, 13, 69), at(82, 13, 69)],
      red: [at(156, 13, 69), at(230, 13, 69)],
      combined: [at(55, 0, 96), at(156, 0, 96)],
    });
  });

  it("stacks blue over red in a square", () => {
    expect(fuseLayout("square", 144, 144)).toEqual({
      blue: [at(25, 0, 43), at(75, 0, 43)],
      red: [at(25, 101, 43), at(75, 101, 43)],
      combined: [at(0, 38, 68), at(75, 38, 68)],
    });
    expect(fuseLayout("square", 200, 200)).toEqual({
      blue: [at(35, 0, 61), at(104, 0, 61)],
      red: [at(35, 139, 61), at(104, 139, 61)],
      combined: [at(0, 52, 96), at(104, 52, 96)],
    });
  });
});

describe("Tunnel", () => {
  it("centers the tunnel in a strip with the dice beside it", () => {
    expect(tunnelLayout("strip", 146, 48)).toEqual({
      stage: at(38, 0, 48),
      dice: at(89, 14, 19),
    });
    expect(tunnelLayout("roomy", 308, 96)).toEqual({
      stage: at(89, 0, 96),
      dice: at(190, 34, 28),
    });
  });

  it("puts the dice in the corner of a square tunnel", () => {
    expect(tunnelLayout("square", 144, 144)).toEqual({
      stage: at(0, 0, 144),
      dice: at(112, 112, 26),
    });
    expect(tunnelLayout("square", 200, 200)).toEqual({
      stage: at(0, 0, 200),
      dice: at(164, 164, 28),
    });
  });
});

describe("Assemble", () => {
  it("centers the grid in any box", () => {
    expect(assembleLayout(146, 48)).toEqual(at(49, 0, 48));
    expect(assembleLayout(308, 96)).toEqual(at(106, 0, 96));
    expect(assembleLayout(200, 200)).toEqual(at(0, 0, 200));
  });
});

describe("an unsized box", () => {
  it("places nothing", () => {
    expect(constructLayout("strip", 0, 48)).toEqual([]);
    expect(generateLayout("strip", 0, 48)).toBeNull();
    expect(shapeLayout("square", 0, 10)).toBeNull();
    expect(fuseLayout("strip", 0, 48)).toBeNull();
    expect(tunnelLayout("strip", 0, 48)).toBeNull();
    expect(assembleLayout(0, 48)).toBeNull();
  });
});
```

- [ ] **Step 4: Write the scene contract test**

Create `tests/unit/create/method-preview-scene-contract.test.ts`. It checks every registered scene's source, so it grows as Tasks 10 to 15 register scenes.

```ts
/**
 * Every registered Create method preview scene is decorative and names the
 * method flow it mirrors (spec: Scenes). The card around it stays one native
 * button, so a scene holds no buttons, links, form fields, or tab stops.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { METHOD_PREVIEW_SCENES } from "$lib/features/create/shared/components/method-previews/method-preview-scenes";

const DIR = "src/lib/features/create/shared/components/method-previews";

const SCENE_FILES: Record<string, string> = {
  construct: "ConstructScene.svelte",
  generate: "GenerateScene.svelte",
  "shape-engine": "ShapeScene.svelte",
  fuse: "FuseScene.svelte",
  tunnel: "TunnelScene.svelte",
  assemble: "AssembleScene.svelte",
};

const INTERACTIVE = [
  /<button\b/,
  /<a\s/,
  /<input\b/,
  /<select\b/,
  /<textarea\b/,
  /tabindex/,
];

describe("method preview scenes", () => {
  it("are decorative and name the flow they mirror", () => {
    for (const id of Object.keys(METHOD_PREVIEW_SCENES)) {
      const file = SCENE_FILES[id];
      expect(file, `scene file for ${id}`).toBeDefined();
      const path = resolve(process.cwd(), DIR, file!);
      expect(existsSync(path), path).toBe(true);
      const source = readFileSync(path, "utf8");
      for (const pattern of INTERACTIVE) {
        expect(source, `${file} ${pattern}`).not.toMatch(pattern);
      }
      expect(source, `${file} names its flow`).toMatch(/Mirrors:/);
    }
  });
});
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/create/method-preview-scene-turns.test.ts tests/unit/create/method-preview-run.test.ts tests/unit/create/method-preview-compositions.test.ts tests/unit/create/method-preview-scene-contract.test.ts`

Expected: FAIL. The scene-turns and compositions modules do not exist, and `waitUntil` is not exported. The contract test passes: no scene is registered yet.

- [ ] **Step 6: Write the scene-turns module**

Create `src/lib/features/create/shared/components/method-previews/method-preview-scene-turns.svelte.ts`:

```ts
/**
 * One cancellable run per turn for a Create method preview scene. A scene
 * calls playSceneTurns() during init. Each time its card starts playing, or
 * a new turn arrives while it plays, the last run ends and a fresh one
 * starts.
 *
 * When a run ends, the scene settles on its finished picture. A run cut off
 * mid-scene (a held card took the turn, or the turn ran out) fades through
 * the tint: the frozen frame fades out, the scene settles, and the finished
 * picture fades in (spec: Turns; plan: Spec Corrections 12). A run that
 * already finished, or reduced motion, settles at once.
 */
import { untrack } from "svelte";
import { previewMotionReduced } from "$lib/features/create/shared/state/method-preview-turns.svelte";
import { startSceneRun, type SceneRun } from "./method-preview-run";

/** The fade through the tint when a run is cut. */
export const SCENE_SETTLE = Object.freeze({ outMs: 120, inMs: 200 });

export interface SceneTurnHooks {
  /** The scene's root element. It fades when a run is cut. */
  root: () => HTMLElement | null;
  /** Show the finished picture. Runs whenever a run ends, so it must be idempotent. */
  settle: () => void;
  /** Defaults to previewMotionReduced(): the system and app settings. */
  reducedMotion?: () => boolean;
}

export function playSceneTurns(
  read: () => { playing: boolean; turn: number },
  play: (run: SceneRun) => Promise<void>,
  hooks: SceneTurnHooks
): void {
  const isReduced = hooks.reducedMotion ?? previewMotionReduced;
  /** The fade of a cut run, until it finishes. */
  let fading: Animation | null = null;

  /** End a fade early: the finished picture shows at full opacity. */
  function finishFade(): void {
    const animation = fading;
    if (!animation) return;
    fading = null;
    animation.cancel();
    hooks.settle();
  }

  function fadeThrough(element: HTMLElement): void {
    const out = element.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: SCENE_SETTLE.outMs,
      easing: "ease-in",
      fill: "forwards",
    });
    fading = out;
    out.onfinish = () => {
      if (fading !== out) return;
      hooks.settle();
      const back = element.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: SCENE_SETTLE.inMs,
        easing: "ease-out",
      });
      out.cancel();
      fading = back;
      back.onfinish = () => {
        if (fading === back) fading = null;
      };
    };
  }

  function end(cut: boolean): void {
    const element = hooks.root();
    if (
      cut &&
      element &&
      typeof element.animate === "function" &&
      !isReduced()
    ) {
      fadeThrough(element);
      return;
    }
    hooks.settle();
  }

  $effect(() => {
    const { playing, turn } = read();
    if (!playing) return;
    void turn;
    const { run, abort } = startSceneRun();
    let finished = false;
    untrack(() => {
      finishFade();
      void (async () => play(run))()
        .catch((error: unknown) => {
          console.error("[method preview] scene run failed", error);
        })
        .finally(() => {
          finished = true;
        });
    });
    return () => {
      const cut = !finished;
      abort();
      untrack(() => end(cut));
    };
  });
}
```

- [ ] **Step 7: Add `waitUntil` to the run module**

Append to `src/lib/features/create/shared/components/method-previews/method-preview-run.ts`:

```ts
/**
 * Poll `check` every `stepMs` until it holds. True when it held in time,
 * false when `timeoutMs` passed first or the turn ended. Scenes use it to
 * wait for a new picture to draw before showing it.
 */
export async function waitUntil(
  run: SceneRun,
  check: () => boolean,
  timeoutMs: number,
  stepMs = 50
): Promise<boolean> {
  let waited = 0;
  while (!check()) {
    if (waited >= timeoutMs) return false;
    if (!(await run.wait(stepMs))) return false;
    waited += stepMs;
  }
  return !run.aborted;
}
```

- [ ] **Step 8: Write the compositions module**

Create `src/lib/features/create/shared/components/method-previews/method-preview-compositions.ts`:

```ts
/**
 * Where each Create method preview scene puts its pieces, in box pixels, for
 * the three box shapes (method-preview-layout.ts). Pure numbers, so tests
 * and the bench (/test/create-method-previews) check them without drawing.
 */
import {
  gridCellSize,
  rowOfCells,
  type MethodPreviewShape,
} from "./method-preview-layout";

/** A square cell: its top-left corner and side, in box pixels. */
export interface CellRect {
  x: number;
  y: number;
  size: number;
}

/** The gap between cells: 5% of the box's short side, from 3 to 8px. */
export function previewGap(width: number, height: number): number {
  return Math.max(3, Math.min(8, Math.round(Math.min(width, height) * 0.05)));
}

export function cellCenter(cell: CellRect): { x: number; y: number } {
  return { x: cell.x + cell.size / 2, y: cell.y + cell.size / 2 };
}

function centeredRow(
  count: number,
  size: number,
  gap: number,
  width: number,
  height: number
): CellRect[] {
  const span = count * size + (count - 1) * gap;
  const x0 = Math.floor((width - span) / 2);
  const y = Math.floor((height - size) / 2);
  return Array.from({ length: count }, (_, index) => ({
    x: x0 + index * (size + gap),
    y,
    size,
  }));
}

/** Cells row by row, the way the step grid wraps. */
function centeredGrid(
  columns: number,
  rows: number,
  size: number,
  gap: number,
  width: number,
  height: number
): CellRect[] {
  const x0 = Math.floor((width - (columns * size + (columns - 1) * gap)) / 2);
  const y0 = Math.floor((height - (rows * size + (rows - 1) * gap)) / 2);
  const cells: CellRect[] = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      cells.push({
        x: x0 + column * (size + gap),
        y: y0 + row * (size + gap),
        size,
      });
    }
  }
  return cells;
}

/** Construct: the start position, then its steps (plan: Spec Corrections 13). */
export const CONSTRUCT_STRIP_SLOTS = Object.freeze({ min: 3, max: 4 });
export const CONSTRUCT_ROOMY_SLOTS = Object.freeze({ min: 4, max: 4 });

export function constructLayout(
  shape: MethodPreviewShape,
  width: number,
  height: number
): CellRect[] {
  const gap = previewGap(width, height);
  if (shape === "square") {
    const size = gridCellSize(width, height, 2, 2, gap);
    return size > 0 ? centeredGrid(2, 2, size, gap, width, height) : [];
  }
  const slots =
    shape === "roomy" ? CONSTRUCT_ROOMY_SLOTS : CONSTRUCT_STRIP_SLOTS;
  const { count, size } = rowOfCells(width, height, gap, slots.min, slots.max);
  return size > 0 ? centeredRow(count, size, gap, width, height) : [];
}

/** Generate: the dice, then the cells it fills. */
export const GENERATE_STRIP_SLOTS = Object.freeze({ min: 4, max: 5 });

/** A square uses a 3×3 grid only while its cells stay at least this large. */
export const GENERATE_MIN_GRID_CELL = 44;

export interface GenerateLayout {
  dice: CellRect;
  cells: CellRect[];
  /** Columns of the slot grid, dice included, for the wave bands. */
  columns: number;
}

export function generateLayout(
  shape: MethodPreviewShape,
  width: number,
  height: number
): GenerateLayout | null {
  const gap = previewGap(width, height);
  let slots: CellRect[] = [];
  let columns = 0;
  if (shape === "square") {
    const wide = gridCellSize(width, height, 3, 3, gap);
    columns = wide >= GENERATE_MIN_GRID_CELL ? 3 : 2;
    const size =
      columns === 3 ? wide : gridCellSize(width, height, 2, 2, gap);
    if (size > 0) {
      slots = centeredGrid(columns, columns, size, gap, width, height);
    }
  } else {
    const { count, size } = rowOfCells(
      width,
      height,
      gap,
      GENERATE_STRIP_SLOTS.min,
      GENERATE_STRIP_SLOTS.max
    );
    columns = count;
    if (size > 0) slots = centeredRow(count, size, gap, width, height);
  }
  const [dice, ...cells] = slots;
  return dice ? { dice, cells, columns } : null;
}

/** Shape: a corner of the matrix and the stage its chosen cell grows into. */
export interface ShapeLayout {
  /** Side of one matrix cell. */
  cell: number;
  /** Top-left of the table. */
  x: number;
  y: number;
  /** Red-hand flower columns and blue-hand flower rows. */
  columns: number;
  rows: number;
  /** Whether red flowers head the columns. A short strip has no room. */
  columnHeads: boolean;
  /** The cell the highlight lands on. */
  chosen: { row: number; column: number };
  /** Where the chosen mandala finishes drawing. */
  stage: CellRect;
  /** False when the stage is the chosen cell itself. */
  grows: boolean;
}

/** A matrix cell's rect. Column heads, when shown, take the first row. */
export function shapeCellRect(
  layout: Pick<ShapeLayout, "cell" | "x" | "y" | "columnHeads">,
  row: number,
  column: number
): CellRect {
  return {
    x: layout.x + (column + 1) * layout.cell,
    y: layout.y + (row + (layout.columnHeads ? 1 : 0)) * layout.cell,
    size: layout.cell,
  };
}

export function shapeLayout(
  shape: MethodPreviewShape,
  width: number,
  height: number
): ShapeLayout | null {
  if (!(width > 0) || !(height > 0)) return null;
  if (shape === "strip") {
    // One blue flower and the cells that fit; the chosen cell draws in place.
    const { count, size } = rowOfCells(width, height, 0, 3, 4);
    if (size <= 0) return null;
    const table = {
      cell: size,
      x: Math.floor((width - count * size) / 2),
      y: Math.floor((height - size) / 2),
      columns: count - 1,
      rows: 1,
      columnHeads: false,
      chosen: { row: 0, column: 1 },
    };
    return { ...table, stage: shapeCellRect(table, 0, 1), grows: false };
  }
  if (shape === "roomy") {
    // The corner on the left, the stage as tall as the box on the right.
    const gap = previewGap(width, height);
    const cell = Math.floor(height / 3);
    const columns = Math.min(4, Math.floor((width - gap - height) / cell) - 1);
    if (cell > 0 && columns >= 2) {
      const x = Math.floor((width - ((columns + 1) * cell + gap + height)) / 2);
      return {
        cell,
        x,
        y: Math.floor((height - 3 * cell) / 2),
        columns,
        rows: 2,
        columnHeads: true,
        chosen: { row: 0, column: columns - 1 },
        stage: {
          x: x + (columns + 1) * cell + gap,
          y: 0,
          size: Math.floor(height),
        },
        grows: true,
      };
    }
  }
  // A 3×3 corner; the chosen cell grows over the 2×2 cells.
  const cell = Math.floor(Math.min(width, height) / 3);
  if (cell <= 0) return null;
  const x = Math.floor((width - 3 * cell) / 2);
  const y = Math.floor((height - 3 * cell) / 2);
  return {
    cell,
    x,
    y,
    columns: 2,
    rows: 2,
    columnHeads: true,
    chosen: { row: 0, column: 1 },
    stage: { x: x + cell, y: y + cell, size: 2 * cell },
    grows: true,
  };
}

/** Fuse: two blue and two red one-hand steps, and the two steps they make. */
export interface FuseLayout {
  blue: CellRect[];
  red: CellRect[];
  combined: CellRect[];
}

export function fuseLayout(
  shape: MethodPreviewShape,
  width: number,
  height: number
): FuseLayout | null {
  if (!(width > 0) || !(height > 0)) return null;
  const gap = previewGap(width, height);
  if (shape === "square") {
    const small = Math.floor((Math.min(width, height) - 2 * gap) / 3);
    const big = Math.min(Math.floor((width - gap) / 2), Math.floor(height / 2));
    if (small <= 0 || big <= 0) return null;
    const pair = (y: number) =>
      centeredRow(2, small, gap, width, small).map((cell) => ({ ...cell, y }));
    return {
      blue: pair(0),
      red: pair(Math.floor(height) - small),
      combined: centeredRow(2, big, gap, width, height),
    };
  }
  const small = Math.min(
    Math.floor(height * 0.72),
    Math.floor((width - 3 * gap) / 4)
  );
  const big = Math.min(Math.floor(height), Math.floor((width - gap) / 2));
  if (small <= 0 || big <= 0) return null;
  const sources = centeredRow(4, small, gap, width, height);
  return {
    blue: sources.slice(0, 2),
    red: sources.slice(2),
    combined: centeredRow(2, big, gap, width, height),
  };
}

/** Tunnel: the tunnel, and the performer dice the finger presses. */
export interface TunnelLayout {
  stage: CellRect;
  dice: CellRect;
}

export function tunnelLayout(
  shape: MethodPreviewShape,
  width: number,
  height: number
): TunnelLayout | null {
  if (!(width > 0) || !(height > 0)) return null;
  const diceSize = (size: number) =>
    Math.max(14, Math.min(28, Math.round(size)));
  if (shape === "square") {
    const size = Math.floor(Math.min(width, height));
    const stage = {
      x: Math.floor((width - size) / 2),
      y: Math.floor((height - size) / 2),
      size,
    };
    const dice = diceSize(size * 0.18);
    const inset = Math.round(size * 0.04);
    return {
      stage,
      dice: {
        x: stage.x + size - inset - dice,
        y: stage.y + size - inset - dice,
        size: dice,
      },
    };
  }
  const gap = previewGap(width, height);
  const size = Math.floor(height);
  const dice = diceSize(height * 0.4);
  const x = Math.floor((width - (size + gap + dice)) / 2);
  return {
    stage: { x, y: 0, size },
    dice: {
      x: x + size + gap,
      y: Math.floor((height - dice) / 2),
      size: dice,
    },
  };
}

/** Assemble: the grid, square and centered. */
export function assembleLayout(
  width: number,
  height: number
): CellRect | null {
  if (!(width > 0) || !(height > 0)) return null;
  const size = Math.floor(Math.min(width, height));
  return {
    x: Math.floor((width - size) / 2),
    y: Math.floor((height - size) / 2),
    size,
  };
}
```

- [ ] **Step 9: Run the tests**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/create/method-preview-scene-turns.test.ts tests/unit/create/method-preview-run.test.ts tests/unit/create/method-preview-compositions.test.ts tests/unit/create/method-preview-scene-contract.test.ts`

Expected: PASS (8 scene-turns tests, 9 run tests, 16 compositions tests, 1 contract test).

- [ ] **Step 10: Write the finger**

Create `src/lib/features/create/shared/components/method-previews/MethodPreviewFinger.svelte`:

```svelte
<script lang="ts">
  /**
   * MethodPreviewFinger
   *
   * The demo finger in a Create method preview: the shared GhostPointer at
   * its compact size, posed by the scene's ghost (sceneGhost() in
   * method-preview-run.ts). Render it inside the scene's positioned root;
   * the pose is in root pixels. Its glow takes the scene's --accent.
   */
  import GhostPointer from "$lib/shared/attract/components/GhostPointer.svelte";
  import type { GhostState } from "$lib/shared/attract/services/attract-ghost.svelte";

  let { pose }: { pose: GhostState | null } = $props();
</script>

{#if pose}
  <GhostPointer
    compact
    x={pose.x}
    y={pose.y}
    pressed={pose.pressed}
    visible={pose.visible}
    speed={pose.speed}
    heading={pose.heading}
    considering={pose.considering}
    parked={false}
    dimmed={false}
  />
{/if}
```

- [ ] **Step 11: Write the Construct scene**

Create `src/lib/features/create/shared/components/method-previews/ConstructScene.svelte`:

```svelte
<script lang="ts">
  /**
   * ConstructScene
   *
   * Mirrors: Construct. A tap picks the start position (BuildStartPlacement),
   * then each tap in the option picker (OptionPicker) adds the next step to
   * the step grid (WorkspaceGrid). Steps enter with the step grid's own
   * stepCascade keyframes and DEFAULT_ANIMATION_TIMING.
   *
   * Finished picture: the demo sequence's start position and its first
   * steps, in a row in a strip and wrapped 2×2 in a square.
   */
  import type { GhostState } from "$lib/shared/attract/services/attract-ghost.svelte";
  import { DEFAULT_ANIMATION_TIMING } from "$lib/features/create/shared/workspace-panel/sequence-display/domain/models/step-grid-display-models";
  import MethodPreviewFinger from "./MethodPreviewFinger.svelte";
  import MethodPreviewPictograph from "./MethodPreviewPictograph.svelte";
  import { cellCenter, constructLayout } from "./method-preview-compositions";
  import {
    DEMO_SEQUENCE,
    openingSteps,
    startPictograph,
  } from "./method-preview-demo";
  import {
    placeGhost,
    sceneGhost,
    tapAt,
    type SceneRun,
  } from "./method-preview-run";
  import { playSceneTurns } from "./method-preview-scene-turns.svelte";
  import type { MethodPreviewSceneProps } from "./method-preview-scenes";

  type SlotPhase = "waiting" | "entering";

  let {
    playing,
    turn,
    shape,
    width,
    height,
    accent,
    onready,
  }: MethodPreviewSceneProps = $props();

  const start = startPictograph(DEMO_SEQUENCE);
  const steps = openingSteps(DEMO_SEQUENCE, 3);

  let root = $state<HTMLElement | null>(null);
  let pose = $state.raw<GhostState | null>(null);
  /** One phase per slot while a run builds; empty means every slot rests. */
  let phases = $state.raw<SlotPhase[]>([]);
  const readySlots = new Set<number>();

  const slots = $derived(constructLayout(shape, width, height));

  function slotData(index: number) {
    return index === 0 ? start : (steps[index - 1] ?? null);
  }

  function handleReady(index: number): void {
    readySlots.add(index);
    if (readySlots.size >= slots.length) onready();
  }

  function settle(): void {
    pose = null;
    phases = [];
  }

  async function play(run: SceneRun): Promise<void> {
    const cells = slots;
    const first = cells[0];
    if (!first) return;
    phases = cells.map(() => "waiting");
    const finger = sceneGhost(run, () => root);
    pose = finger.ghost;
    const lead = cellCenter(first);
    placeGhost(finger, lead.x + first.size * 0.35, lead.y + first.size * 0.3);
    for (const [index, cell] of cells.entries()) {
      const target = cellCenter(cell);
      if (!(await tapAt(finger, run, target.x, target.y))) return;
      phases = phases.map((phase, slot) => (slot === index ? "entering" : phase));
    }
    if (!(await run.wait(DEFAULT_ANIMATION_TIMING.entranceDuration))) return;
    settle();
  }

  playSceneTurns(() => ({ playing, turn }), play, {
    root: () => root,
    settle,
  });
</script>

<div
  class="scene"
  bind:this={root}
  style:--accent={accent}
  style:--step-entrance-duration="{DEFAULT_ANIMATION_TIMING.entranceDuration}ms"
  data-phase={phases.length > 0 ? "building" : "rest"}
>
  {#each slots as cell, index (index)}
    <div
      class="slot"
      class:waiting={phases[index] === "waiting"}
      class:entering={phases[index] === "entering"}
      style:left="{cell.x}px"
      style:top="{cell.y}px"
      style:width="{cell.size}px"
      style:height="{cell.size}px"
    >
      <div class="art">
        <MethodPreviewPictograph
          data={slotData(index)}
          onReady={() => handleReady(index)}
        />
      </div>
    </div>
  {/each}
  <MethodPreviewFinger {pose} />
</div>

<style>
  .scene {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .slot {
    position: absolute;
    border-radius: 6px;
  }

  /* An empty slot waits as a faint outline in the method color. */
  .slot.waiting {
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 45%, transparent);
  }

  .art {
    position: absolute;
    inset: 0;
  }

  .slot.waiting .art {
    opacity: 0;
  }

  /* The step grid's entrance (StepCell's .step-cell.animate). */
  .slot.entering .art {
    animation: stepCascade var(--step-entrance-duration, 380ms)
      cubic-bezier(0.22, 1, 0.36, 1) both;
  }
</style>
```

- [ ] **Step 12: Register the scene**

In `method-preview-scenes.ts`, replace the registry with:

```ts
/** Create method id (CREATE_TABS) to its scene module. */
export const METHOD_PREVIEW_SCENES: Readonly<
  Record<string, () => Promise<MethodPreviewSceneModule>>
> = {
  construct: () => import("./ConstructScene.svelte"),
};
```

- [ ] **Step 13: Run the tests again**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/create/method-preview-scenes.test.ts tests/unit/create/method-preview-scene-contract.test.ts`

Expected: PASS. The contract test now reads `ConstructScene.svelte`.

- [ ] **Step 14: Format and type check**

```bash
cd /e/tka-platform && npx prettier --write /e/worktrees/tka-platform/create-method-previews/src/lib/features/create/shared/components/method-previews/method-preview-scene-turns.svelte.ts /e/worktrees/tka-platform/create-method-previews/src/lib/features/create/shared/components/method-previews/method-preview-run.ts /e/worktrees/tka-platform/create-method-previews/src/lib/features/create/shared/components/method-previews/method-preview-compositions.ts /e/worktrees/tka-platform/create-method-previews/src/lib/features/create/shared/components/method-previews/MethodPreviewFinger.svelte /e/worktrees/tka-platform/create-method-previews/src/lib/features/create/shared/components/method-previews/ConstructScene.svelte /e/worktrees/tka-platform/create-method-previews/src/lib/features/create/shared/components/method-previews/method-preview-scenes.ts /e/worktrees/tka-platform/create-method-previews/tests/unit/create/method-preview-scene-turns-harness.svelte.ts /e/worktrees/tka-platform/create-method-previews/tests/unit/create/method-preview-scene-turns.test.ts /e/worktrees/tka-platform/create-method-previews/tests/unit/create/method-preview-run.test.ts /e/worktrees/tka-platform/create-method-previews/tests/unit/create/method-preview-compositions.test.ts /e/worktrees/tka-platform/create-method-previews/tests/unit/create/method-preview-scene-contract.test.ts
```

Run `npm run check:fast` in the worktree (after the svelte-check gate). Expected: no errors in the new or changed files.

- [ ] **Step 15: Check Construct on the bench**

Reload [http://localhost:5191/test/create-method-previews](http://localhost:5191/test/create-method-previews) in the agent Chrome (start the preview server first if it stopped). In the Sizes view, the Construct row's four boxes crossfade from the tint to their finished pictures within a few seconds of load. Run with `evaluate_script`:

```js
() =>
  [...document.querySelectorAll(".bench-box")]
    .slice(0, 4)
    .map((box) => box.querySelectorAll(".slot").length)
```

Expected: `[3, 4, 4, 4]`.

Right after the reload, `wait_for` the text `construct ·` and take two screenshots of the Construct row about one second apart. For the second round, `wait_for` the text `generate ·`, then `construct ·` again, and take a second pair. Expected: the compact finger taps the start slot, then each step slot in order; empty slots show a faint blue outline; each step enters with the step grid's diagonal drift; the finger is gone by the end and every slot shows its pictograph. Hover a Construct box with the mouse mid-turn of another row's card, then move to a different card: the cut scene dims out and fades back in on its finished picture. The console shows no errors.

- [ ] **Step 16: Commit**

```bash
cd /e/worktrees/tka-platform/create-method-previews
git status --short
git add -- src/lib/features/create/shared/components/method-previews/method-preview-scene-turns.svelte.ts src/lib/features/create/shared/components/method-previews/method-preview-run.ts src/lib/features/create/shared/components/method-previews/method-preview-compositions.ts src/lib/features/create/shared/components/method-previews/MethodPreviewFinger.svelte src/lib/features/create/shared/components/method-previews/ConstructScene.svelte src/lib/features/create/shared/components/method-previews/method-preview-scenes.ts tests/unit/create/method-preview-scene-turns-harness.svelte.ts tests/unit/create/method-preview-scene-turns.test.ts tests/unit/create/method-preview-run.test.ts tests/unit/create/method-preview-compositions.test.ts tests/unit/create/method-preview-scene-contract.test.ts
git commit -m "feat(create): Construct method preview and shared scene pieces" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/features/create/shared/components/method-previews/method-preview-scene-turns.svelte.ts src/lib/features/create/shared/components/method-previews/method-preview-run.ts src/lib/features/create/shared/components/method-previews/method-preview-compositions.ts src/lib/features/create/shared/components/method-previews/MethodPreviewFinger.svelte src/lib/features/create/shared/components/method-previews/ConstructScene.svelte src/lib/features/create/shared/components/method-previews/method-preview-scenes.ts tests/unit/create/method-preview-scene-turns-harness.svelte.ts tests/unit/create/method-preview-scene-turns.test.ts tests/unit/create/method-preview-run.test.ts tests/unit/create/method-preview-compositions.test.ts tests/unit/create/method-preview-scene-contract.test.ts
```

---

### Task 11: Generate Scene

The dice is pressed, the last roll fades, and a new real sequence washes in with the step grid's own diagonal wave.

**Files:**

- Create: `src/lib/features/create/shared/components/method-previews/method-preview-generate.ts`
- Create: `src/lib/features/create/shared/components/method-previews/GenerateScene.svelte`
- Modify: `src/lib/features/create/shared/components/method-previews/method-preview-scenes.ts` (register Generate)
- Test: `tests/unit/create/method-preview-generate.test.ts`
- Modify only if Step 10 finds a long frame in the pool build: `src/lib/shared/landing/data/shape-matrix-hero-pool.ts` (hand-edit; the file is not Prettier-clean, so never run Prettier on it)

- [ ] **Step 1: Write the failing test**

Create `tests/unit/create/method-preview-generate.test.ts`:

```ts
/**
 * The Generate preview's rolls and wave. Each turn shows a new real roll;
 * when none came, turns step through the demo sequence. Cells wash in with
 * the step grid's band and stagger, the dice holding the lead slot.
 */
import { describe, expect, it } from "vitest";
import { calculateStepWaveBand } from "$lib/shared/create/utils/grid-calculations";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { DEFAULT_ANIMATION_TIMING } from "$lib/features/create/shared/workspace-panel/sequence-display/domain/models/step-grid-display-models";
import { DEMO_SEQUENCE } from "$lib/features/create/shared/components/method-previews/method-preview-demo";
import {
  FIRST_ROLL,
  generateCellDelayMs,
  generateRevealMs,
  nextRoll,
  rollStep,
} from "$lib/features/create/shared/components/method-previews/method-preview-generate";

/** A four-step roll cut from the demo sequence, standing in for a fresh draw. */
const fresh: SequenceData = {
  ...DEMO_SEQUENCE,
  steps: DEMO_SEQUENCE.steps.slice(4, 8),
};

describe("Generate rolls", () => {
  it("rests first on the demo sequence's opening steps", () => {
    expect(FIRST_ROLL).toEqual({ sequence: DEMO_SEQUENCE, offset: 0 });
    expect(rollStep(FIRST_ROLL, 0)).toBe(DEMO_SEQUENCE.steps[0]);
    expect(rollStep(FIRST_ROLL, 2)).toBe(DEMO_SEQUENCE.steps[2]);
  });

  it("wraps around a roll shorter than the cells", () => {
    expect(rollStep({ sequence: fresh, offset: 0 }, 5)).toBe(fresh.steps[1]);
  });

  it("shows nothing for an empty sequence", () => {
    const empty: SequenceData = { ...DEMO_SEQUENCE, steps: [] };
    expect(rollStep({ sequence: empty, offset: 0 }, 0)).toBeNull();
  });

  it("shows a fresh roll from its first step", () => {
    expect(nextRoll(FIRST_ROLL, fresh, 3)).toEqual({
      sequence: fresh,
      offset: 0,
    });
  });

  it("steps through the demo sequence when no roll came", () => {
    expect(nextRoll(FIRST_ROLL, null, 3)).toEqual({
      sequence: DEMO_SEQUENCE,
      offset: 3,
    });
    expect(
      nextRoll({ sequence: DEMO_SEQUENCE, offset: 15 }, null, 3)
    ).toEqual({ sequence: DEMO_SEQUENCE, offset: 2 });
  });

  it("goes back to the demo sequence's opening after a fresh roll", () => {
    expect(nextRoll({ sequence: fresh, offset: 0 }, null, 3)).toEqual(
      FIRST_ROLL
    );
  });
});

describe("the Generate wave", () => {
  it("staggers each cell by its band, the dice in the lead slot", () => {
    expect([0, 1, 2].map((index) => generateCellDelayMs(index, 4))).toEqual([
      55, 110, 165,
    ]);
    expect([0, 1, 2].map((index) => generateCellDelayMs(index, 2))).toEqual([
      55, 55, 110,
    ]);
  });

  it("matches the step grid's first row in a strip", () => {
    for (let index = 0; index < 3; index++) {
      expect(generateCellDelayMs(index, 4)).toBe(
        calculateStepWaveBand(index, 4) *
          DEFAULT_ANIMATION_TIMING.waveBandDelay
      );
    }
  });

  it("lasts until the last cell has landed", () => {
    expect(generateRevealMs(3, 4)).toBe(545);
    expect(generateRevealMs(8, 3)).toBe(600);
    expect(generateRevealMs(3, 2)).toBe(490);
    expect(generateRevealMs(0, 4)).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/create/method-preview-generate.test.ts`

Expected: FAIL. The module `method-preview-generate` does not exist.

- [ ] **Step 3: Write the rolls and wave module**

Create `src/lib/features/create/shared/components/method-previews/method-preview-generate.ts`:

```ts
/**
 * The Generate preview's rolls and wave (GenerateScene.svelte). Pure, so
 * tests check them without drawing.
 */
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import { DEFAULT_ANIMATION_TIMING } from "$lib/features/create/shared/workspace-panel/sequence-display/domain/models/step-grid-display-models";
import { DEMO_SEQUENCE } from "./method-preview-demo";
import { slotWaveBand } from "./method-preview-layout";

/** How long the last roll fades before the next washes in. */
export const GENERATE_CLEAR_MS = 150;

/** How long a turn waits for the new roll's cells to draw. */
export const GENERATE_READY_WAIT_MS = 600;

/** What the cells show: a sequence, from one of its steps on. */
export interface GenerateRoll {
  sequence: SequenceData;
  offset: number;
}

/** The resting picture before the first turn: the demo sequence's opening. */
export const FIRST_ROLL: Readonly<GenerateRoll> = Object.freeze({
  sequence: DEMO_SEQUENCE,
  offset: 0,
});

/** The step cell `index` shows, wrapping around a short roll. */
export function rollStep(roll: GenerateRoll, index: number): StepData | null {
  const steps = roll.sequence.steps;
  if (steps.length === 0) return null;
  return steps[(roll.offset + index) % steps.length] ?? null;
}

/**
 * The roll a turn shows. A fresh draw shows from its first step. Without
 * one, turns step through the demo sequence a window at a time, starting
 * over at its opening after a fresh roll.
 */
export function nextRoll(
  current: GenerateRoll,
  fresh: SequenceData | null,
  cellCount: number
): GenerateRoll {
  if (fresh && fresh.steps.length > 0) return { sequence: fresh, offset: 0 };
  const length = DEMO_SEQUENCE.steps.length;
  if (current.sequence !== DEMO_SEQUENCE || length === 0) {
    return { sequence: DEMO_SEQUENCE, offset: 0 };
  }
  return {
    sequence: DEMO_SEQUENCE,
    offset: (current.offset + Math.max(1, cellCount)) % length,
  };
}

/**
 * When cell `index` starts entering: its wave band times the step grid's
 * stagger. The dice holds slot 0, so cell `index` sits in slot `index + 1`.
 */
export function generateCellDelayMs(index: number, columns: number): number {
  return (
    slotWaveBand(index + 1, columns) * DEFAULT_ANIMATION_TIMING.waveBandDelay
  );
}

/** From the start of the wash until its last cell has landed. */
export function generateRevealMs(cellCount: number, columns: number): number {
  if (cellCount <= 0) return 0;
  return (
    generateCellDelayMs(cellCount - 1, columns) +
    DEFAULT_ANIMATION_TIMING.entranceDuration
  );
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/create/method-preview-generate.test.ts`

Expected: PASS (9 tests).

- [ ] **Step 5: Write the Generate scene**

Create `src/lib/features/create/shared/components/method-previews/GenerateScene.svelte`:

```svelte
<script lang="ts">
  /**
   * GenerateScene
   *
   * Mirrors: Generate. The Generate button (GenerateButtonCard) rolls a
   * whole sequence, and the step grid (WorkspaceGrid) washes it in with its
   * diagonal wave. Each cell's band is its row plus its column (waveBandAt),
   * staggered by DEFAULT_ANIMATION_TIMING, and every cell enters with the
   * step grid's stepCascade keyframes. The dice holds the lead slot, where
   * the step grid's start position sits.
   *
   * Each turn shows a real sequence from drawMatrixRealization(), the
   * Firebase-free source behind the home hero, drawn in the background
   * between turns. When that source fails, turns step through the demo
   * sequence instead.
   *
   * Finished picture: the dice and the latest roll's opening steps. Before
   * the first turn, the demo sequence's.
   */
  import { onDestroy } from "svelte";
  import type { GhostState } from "$lib/shared/attract/services/attract-ghost.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import FontAwesomeIcon from "$lib/shared/foundation/ui/FontAwesomeIcon.svelte";
  import { runAtBackgroundPriority } from "$lib/shared/foundation/utils/background-scheduling";
  import { drawMatrixRealization } from "$lib/shared/landing/data/shape-matrix-hero-pool";
  import { DEFAULT_ANIMATION_TIMING } from "$lib/features/create/shared/workspace-panel/sequence-display/domain/models/step-grid-display-models";
  import MethodPreviewFinger from "./MethodPreviewFinger.svelte";
  import MethodPreviewPictograph from "./MethodPreviewPictograph.svelte";
  import { cellCenter, generateLayout } from "./method-preview-compositions";
  import {
    FIRST_ROLL,
    GENERATE_CLEAR_MS,
    GENERATE_READY_WAIT_MS,
    generateCellDelayMs,
    generateRevealMs,
    nextRoll,
    rollStep,
    type GenerateRoll,
  } from "./method-preview-generate";
  import {
    placeGhost,
    sceneGhost,
    tapAt,
    waitUntil,
    type SceneRun,
  } from "./method-preview-run";
  import { playSceneTurns } from "./method-preview-scene-turns.svelte";
  import type { MethodPreviewSceneProps } from "./method-preview-scenes";

  type Phase = "rest" | "clearing" | "entering";

  let {
    playing,
    turn,
    shape,
    width,
    height,
    accent,
    onready,
  }: MethodPreviewSceneProps = $props();

  let root = $state<HTMLElement | null>(null);
  let pose = $state.raw<GhostState | null>(null);
  let phase = $state<Phase>("rest");
  let roll = $state.raw<GenerateRoll>(FIRST_ROLL);
  /** Bumped with each roll, so every cell reports ready for its new step. */
  let epoch = $state(0);

  const layout = $derived(generateLayout(shape, width, height));

  /** Cells that have drawn the current roll. */
  const readyCells = new Set<number>();
  let announced = false;
  /** The next turn's roll, drawn in the background. */
  let fresh: SequenceData | null = null;
  let drawing = false;
  let sourceFailed = false;
  let disposed = false;

  onDestroy(() => {
    disposed = true;
  });

  function drawNextRoll(): void {
    if (disposed || drawing || fresh || sourceFailed) return;
    drawing = true;
    runAtBackgroundPriority(() => {
      void drawMatrixRealization()
        .then((draw) => {
          if (!draw) sourceFailed = true;
          else if (!disposed) fresh = draw.sequence;
        })
        .catch((error: unknown) => {
          sourceFailed = true;
          console.warn(
            "[method preview] Generate could not draw a sequence",
            error
          );
        })
        .finally(() => {
          drawing = false;
        });
    });
  }

  function handleCellReady(index: number): void {
    readyCells.add(index);
    const count = layout?.cells.length ?? 0;
    if (announced || count === 0 || readyCells.size < count) return;
    announced = true;
    onready();
    drawNextRoll();
  }

  function settle(): void {
    pose = null;
    phase = "rest";
    drawNextRoll();
  }

  async function play(run: SceneRun): Promise<void> {
    const box = layout;
    const last = box?.cells[box.cells.length - 1];
    if (!box || !last) return;
    const finger = sceneGhost(run, () => root);
    pose = finger.ghost;
    const start = cellCenter(last);
    placeGhost(finger, start.x, start.y);
    const dice = cellCenter(box.dice);
    if (!(await tapAt(finger, run, dice.x, dice.y))) return;
    phase = "clearing";
    if (!(await run.wait(GENERATE_CLEAR_MS))) return;
    const drawn = fresh;
    fresh = null;
    roll = nextRoll(roll, drawn, box.cells.length);
    readyCells.clear();
    epoch += 1;
    // A cell still drawing after the wait washes in when it is ready.
    await waitUntil(
      run,
      () => readyCells.size >= box.cells.length,
      GENERATE_READY_WAIT_MS
    );
    if (run.aborted) return;
    finger.ghost.visible = false;
    phase = "entering";
    if (!(await run.wait(generateRevealMs(box.cells.length, box.columns)))) {
      return;
    }
    settle();
  }

  playSceneTurns(() => ({ playing, turn }), play, {
    root: () => root,
    settle,
  });
</script>

<div
  class="scene"
  bind:this={root}
  style:--accent={accent}
  style:--step-entrance-duration="{DEFAULT_ANIMATION_TIMING.entranceDuration}ms"
  style:--clear-duration="{GENERATE_CLEAR_MS}ms"
  data-phase={phase}
>
  {#if layout}
    <span
      class="dice"
      class:pressed={pose?.pressed ?? false}
      style:left="{layout.dice.x}px"
      style:top="{layout.dice.y}px"
      style:width="{layout.dice.size}px"
      style:height="{layout.dice.size}px"
      style:font-size="{Math.round(layout.dice.size * 0.5)}px"
    >
      <FontAwesomeIcon icon="dice" style="solid" ariaHidden />
    </span>
    {#each layout.cells as cell, index (index)}
      <div
        class="cell"
        style:left="{cell.x}px"
        style:top="{cell.y}px"
        style:width="{cell.size}px"
        style:height="{cell.size}px"
        style:--reveal-delay="{generateCellDelayMs(index, layout.columns)}ms"
      >
        <MethodPreviewPictograph
          data={rollStep(roll, index)}
          readyEpoch={epoch}
          onReady={() => handleCellReady(index)}
        />
      </div>
    {/each}
  {/if}
  <MethodPreviewFinger {pose} />
</div>

<style>
  .scene {
    position: relative;
    width: 100%;
    height: 100%;
  }

  /* The Generate button's dice (GenerateButtonCard): its green, its glyph. */
  .dice {
    position: absolute;
    display: grid;
    place-items: center;
    border-radius: 24%;
    color: var(--theme-text, #fff);
    background: var(--semantic-success, #22c55e);
    box-shadow:
      0 2px 6px
        color-mix(in srgb, var(--semantic-success, #22c55e) 40%, transparent),
      inset 0 1px 0 var(--theme-stroke-strong, rgba(255, 255, 255, 0.24));
    transition: transform 140ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  .dice.pressed {
    transform: scale(0.9);
  }

  .cell {
    position: absolute;
  }

  /* The last roll fades out. Only this phase transitions, so the way back
     never fights the entrance below. */
  .scene[data-phase="clearing"] .cell {
    opacity: 0;
    transition: opacity var(--clear-duration, 150ms) ease-in;
  }

  /* The step grid's entrance, band by band (StepCell's .step-cell.animate). */
  .scene[data-phase="entering"] .cell {
    animation: stepCascade var(--step-entrance-duration, 380ms)
      cubic-bezier(0.22, 1, 0.36, 1) both;
    animation-delay: var(--reveal-delay, 0ms);
  }
</style>
```

- [ ] **Step 6: Register the scene**

In `method-preview-scenes.ts`, replace the registry with:

```ts
/** Create method id (CREATE_TABS) to its scene module. */
export const METHOD_PREVIEW_SCENES: Readonly<
  Record<string, () => Promise<MethodPreviewSceneModule>>
> = {
  construct: () => import("./ConstructScene.svelte"),
  generate: () => import("./GenerateScene.svelte"),
};
```

- [ ] **Step 7: Run the registry and contract tests**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/create/method-preview-scenes.test.ts tests/unit/create/method-preview-scene-contract.test.ts tests/unit/create/method-preview-generate.test.ts`

Expected: PASS. The contract test now also reads `GenerateScene.svelte`.

- [ ] **Step 8: Format and type check**

```bash
cd /e/tka-platform && npx prettier --write /e/worktrees/tka-platform/create-method-previews/src/lib/features/create/shared/components/method-previews/method-preview-generate.ts /e/worktrees/tka-platform/create-method-previews/src/lib/features/create/shared/components/method-previews/GenerateScene.svelte /e/worktrees/tka-platform/create-method-previews/src/lib/features/create/shared/components/method-previews/method-preview-scenes.ts /e/worktrees/tka-platform/create-method-previews/tests/unit/create/method-preview-generate.test.ts
```

Run `npm run check:fast` in the worktree (after the svelte-check gate). Expected: no errors in the new or changed files.

- [ ] **Step 9: Check Generate on the bench**

Reload [http://localhost:5191/test/create-method-previews](http://localhost:5191/test/create-method-previews) in the agent Chrome. Generate is the second row of the Sizes view, so its boxes are `.bench-box` 4 to 7. Once its boxes have faded in from the tint, run with `evaluate_script`:

```js
() =>
  [...document.querySelectorAll(".bench-box")]
    .slice(4, 8)
    .map((box) => [
      box.querySelectorAll(".dice").length,
      box.querySelectorAll(".cell").length,
    ])
```

Expected: `[[1, 3], [1, 3], [1, 3], [1, 8]]`.

While the status still reads `construct · …`, record the cells' signature:

```js
() =>
  [...document.querySelectorAll(".bench-box")]
    .slice(4, 8)
    .map((box) =>
      [...box.querySelectorAll(".cell")]
        .map((cell) => cell.innerHTML.length)
        .join("/")
    )
```

Use `wait_for` on the text `generate ·` and take two screenshots of the Generate row during the turn. Expected: the compact finger glides to the green dice and presses it (the dice dips), the cells fade, and the new roll washes in from the top-left cell outward in the step grid's diagonal drift; the 200×200 box shows the 3×3 wave. When the status has moved past `generate · …`, run the signature snippet again. Expected: all four signatures differ from the first run, because the turn showed a new roll. The console shows no errors and no `Generate could not draw a sequence` warning.

- [ ] **Step 10: Screen the cost at 4× CPU**

With DevTools MCP `emulate` set `cpuThrottlingRate: 4`, reload the bench, `wait_for` the text `generate ·`, then wait 4 seconds so the turn and the next background roll both run. Run the long-frame probe (Before You Start) with `evaluate_script`.

Expected: no frame lists a script from `GenerateScene`, `method-preview`, `background-scheduling`, `shape-matrix-hero-pool`, `deck-variation`, `flower-signature`, or `filter-flower-axis`. Set `cpuThrottlingRate: 1` again.

If a frame lists `shape-matrix-hero-pool` (the pool's one-time build), hand-edit `loadPool()` in `src/lib/shared/landing/data/shape-matrix-hero-pool.ts` so its build yields between stages. Add the import beside the others:

```ts
import { yieldToScheduler } from "$lib/shared/foundation/utils/background-scheduling";
```

Then replace the body of the IIFE inside `loadPool()`, from `const [wordsRaw, edges] = await Promise.all([` through `return { idx, edges, cells };`, with:

```ts
      const [wordsRaw, edges] = await Promise.all([
        fetch(BASE_WORDS_URL).then((r) => {
          if (!r.ok) throw new Error(`hero base words ${r.status}`);
          return r.json() as Promise<Record<string, unknown>[]>;
        }),
        loadDiamondEdges(),
      ]);
      // Each stage is its own task, so a phone never blocks input for the
      // whole build (Create method previews' cost gate).
      await yieldToScheduler();
      const idx = buildBaseIndex(wordsRaw.map((w) => hydrateSequence(w)));
      await yieldToScheduler();

      const axis = buildFlowerAxis();
      await yieldToScheduler();
      const diamond = applyFilter(
        axis,
        { style: "all", turns: new Set(ALLOWED_TURNS), ori: "all", grid: "diamond" },
        true,
      );
      await yieldToScheduler();
      const box = applyFilter(
        axis,
        { style: "all", turns: new Set(ALLOWED_TURNS), ori: "all", grid: "box" },
        true,
      );
      const cells: Cell[] = [];
      for (const left of diamond) for (const right of diamond) cells.push({ left, right, grid: "diamond" });
      for (const left of box) for (const right of box) cells.push({ left, right, grid: "box" });

      return { idx, edges, cells };
```

Run the pool's own tests. The contract test walks the pool's static imports, so it also proves the new import kept the home page Firebase-free:

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/shape-matrix-hero-pool.test.ts tests/unit/shape-matrix-hero-pool-contract.test.ts tests/unit/landing/home-first-visit-firebase.test.ts`
Expected: PASS for all three files, as before the edit.

Reload and run the screen again. A frame that remains (one stage over 50ms, or a draw's `applyVariationDescriptor`) is not fixed here: note its scripts and duration for Task 19, where the Fold decides. Add `src/lib/shared/landing/data/shape-matrix-hero-pool.ts` to Step 11's paths only if you edited it.

- [ ] **Step 11: Commit**

```bash
cd /e/worktrees/tka-platform/create-method-previews
git status --short
git add -- src/lib/features/create/shared/components/method-previews/method-preview-generate.ts src/lib/features/create/shared/components/method-previews/GenerateScene.svelte src/lib/features/create/shared/components/method-previews/method-preview-scenes.ts tests/unit/create/method-preview-generate.test.ts
git commit -m "feat(create): Generate method preview" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/features/create/shared/components/method-previews/method-preview-generate.ts src/lib/features/create/shared/components/method-previews/GenerateScene.svelte src/lib/features/create/shared/components/method-previews/method-preview-scenes.ts tests/unit/create/method-preview-generate.test.ts
```

---

### Task 12: Shape Scene

The Shape preview is a corner of the page the Shape Matrix opens on. Each turn plays the Matrix's own Surprise reveal over it, the finger taps the chosen tile, and the tile grows into a stage where its mandala draws itself. The corner is traced with the user's props and painted in their hand colors, so it is the Matrix's own picture.

**Files:**

- Create: `src/lib/features/create/shared/components/method-previews/method-preview-shape.ts`
- Create: `src/lib/features/create/shared/components/method-previews/ShapeScene.svelte`
- Modify: `src/lib/features/create/shared/components/method-previews/method-preview-compositions.ts` (append `transformOnto`, which Fuse also uses)
- Modify: `src/lib/features/create/shared/components/method-previews/method-preview-scenes.ts` (the registry)
- Test: `tests/unit/create/method-preview-shape.test.ts`
- Modify only if Step 10's screen trips on it: `src/lib/shared/shape-matrix/services/rotation-style-archetypes.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/create/method-preview-shape.test.ts`:

```ts
/**
 * The Create front door's Shape preview shows the corner of the page the
 * Shape Matrix opens on, then grows the chosen tile into its stage. Its
 * beats sit on the Matrix's own Surprise reveal and must fit in one turn.
 */
import { describe, expect, it } from "vitest";
import { METHOD_PREVIEW_TIMING } from "$lib/features/create/shared/state/method-preview-turns.svelte";
import {
  shapeCellRect,
  shapeLayout,
  transformOnto,
} from "$lib/features/create/shared/components/method-previews/method-preview-compositions";
import { SCENE_TAP } from "$lib/features/create/shared/components/method-previews/method-preview-run";
import {
  SHAPE_PREVIEW_TIMING,
  shapeCorner,
} from "$lib/features/create/shared/components/method-previews/method-preview-shape";
import { SHAPE_MATRIX_REVEAL } from "$lib/shared/shape-matrix/app/services/shape-matrix-reveal";
import {
  buildShapeMatrixAxis,
  flowerKey,
} from "$lib/shared/shape-matrix/domain/flower-signature";

/** The attract ghost's shortest glide (glide() in attract-ghost.svelte.ts). */
const MIN_GLIDE_MS = 300;

describe("Shape preview corner", () => {
  const axis = buildShapeMatrixAxis();

  it("shows the band the Matrix opens on: blue rows, red columns", () => {
    const corner = shapeCorner(axis, { rows: 2, columns: 4 });
    expect(corner.rows.map(flowerKey)).toEqual([
      "pro-2-in-diamond",
      "pro-2-out-diamond",
    ]);
    expect(corner.columns.map(flowerKey)).toEqual([
      "pro-2-in-diamond",
      "pro-2-out-diamond",
      "anti-2-in-diamond",
      "anti-2-out-diamond",
    ]);
  });

  it("never asks for more flowers than the band holds", () => {
    const corner = shapeCorner(axis, { rows: 6, columns: 6 });
    expect(corner.rows).toHaveLength(4);
    expect(corner.columns).toHaveLength(4);
  });

  it("fills every layout's corner, chosen tile included", () => {
    for (const [shape, width, height] of [
      ["strip", 146, 48],
      ["roomy", 308, 96],
      ["roomy", 153, 96],
      ["square", 144, 144],
      ["square", 200, 200],
    ] as const) {
      const layout = shapeLayout(shape, width, height)!;
      const corner = shapeCorner(axis, layout);
      expect(corner.rows).toHaveLength(layout.rows);
      expect(corner.columns).toHaveLength(layout.columns);
      expect(layout.chosen.row).toBeLessThan(corner.rows.length);
      expect(layout.chosen.column).toBeLessThan(corner.columns.length);
    }
  });
});

describe("Shape preview grow", () => {
  /** The transform that lays the stage over the chosen tile before it grows. */
  function chosenToStage(shape: "strip" | "roomy" | "square", width: number, height: number) {
    const layout = shapeLayout(shape, width, height)!;
    const tile = shapeCellRect(layout, layout.chosen.row, layout.chosen.column);
    return transformOnto(layout.stage, tile);
  }

  it("starts the roomy stage on the chosen tile", () => {
    expect(chosenToStage("roomy", 308, 96)).toBe(
      "translate(-37px, 32px) scale(0.3333)"
    );
  });

  it("starts the square stage on the chosen tile", () => {
    expect(chosenToStage("square", 144, 144)).toBe(
      "translate(48px, 0px) scale(0.5)"
    );
  });

  it("does not move a stage that is the chosen tile", () => {
    expect(chosenToStage("strip", 146, 48)).toBe(
      "translate(0px, 0px) scale(1)"
    );
  });
});

describe("Shape preview beats", () => {
  it("lands the tap as the Matrix lights the chosen crossing", () => {
    const earliestTap =
      SHAPE_PREVIEW_TIMING.fingerLeavesMs +
      MIN_GLIDE_MS +
      SCENE_TAP.considerMs +
      SCENE_TAP.pressMs;
    expect(earliestTap).toBe(SHAPE_MATRIX_REVEAL.chosen.at);
  });

  it("finishes drawing with half a second of the turn to spare", () => {
    const end =
      SHAPE_MATRIX_REVEAL.chosen.at +
      SHAPE_PREVIEW_TIMING.growDelayMs +
      SHAPE_PREVIEW_TIMING.drawMs;
    expect(end).toBeLessThanOrEqual(METHOD_PREVIEW_TIMING.turnMs - 500);
  });
});
```

The half second covers a glide longer than the shortest one and the settle.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/create/method-preview-shape.test.ts`

Expected: FAIL. `method-preview-shape` does not exist, and the compositions module has no `transformOnto`.

- [ ] **Step 3: Write the corner module and the shared transform**

Append to `src/lib/features/create/shared/components/method-previews/method-preview-compositions.ts`:

```ts
/**
 * The transform that draws an element laid out at `box` over `target`
 * (transform-origin at the top left). Scenes move a picture from one cell
 * to another with it: Shape's stage starts over the chosen tile, and Fuse's
 * sources land on their fused cell.
 */
export function transformOnto(box: CellRect, target: CellRect): string {
  const scale =
    box.size > 0 ? Number((target.size / box.size).toFixed(4)) : 1;
  return `translate(${target.x - box.x}px, ${target.y - box.y}px) scale(${scale})`;
}
```

Create `src/lib/features/create/shared/components/method-previews/method-preview-shape.ts`:

```ts
/**
 * The Create front door's Shape preview: the corner of the Shape Matrix it
 * shows and the scene's beats around the Matrix's own reveal. Pure, so tests
 * check them without drawing.
 */
import { applyFilter } from "$lib/shared/shape-matrix/domain/filter-flower-axis";
import type { Flower } from "$lib/shared/shape-matrix/domain/flower-signature";
import {
  matrixFiltersForTurns,
  SHAPE_MATRIX_DEFAULT_TURN,
} from "$lib/shared/shape-matrix/domain/matrix-turn-band";
import type { ShapeLayout } from "./method-preview-compositions";

/**
 * The scene's beats, in milliseconds from the start of its turn. The corner
 * rebuilds on the Matrix's own schedule (SHAPE_MATRIX_REVEAL); these fit the
 * finger, the grow, and the draw around it.
 */
export const SHAPE_PREVIEW_TIMING = Object.freeze({
  /** The finished stage fades out as the corner rebuilds. */
  stageOutMs: 150,
  /**
   * When the finger leaves for the chosen tile. A tap takes at least 560ms
   * (the ghost's shortest glide, 300ms, then SCENE_TAP), so it lands as the
   * Matrix lights the chosen crossing (SHAPE_MATRIX_REVEAL.chosen.at).
   */
  fingerLeavesMs: 240,
  /** From the tap to the tile starting to grow. */
  growDelayMs: 100,
  growMs: 360,
  /** The mandala draws from its first stroke to the finished tile. */
  drawMs: 1300,
});

/** The flowers on the corner's rows (blue hand) and columns (red hand). */
export interface ShapeCorner {
  rows: Flower[];
  columns: Flower[];
}

/**
 * The top-left corner of the page the Matrix opens on: the default turn band
 * on both axes, filtered the way the Matrix filters it, as many flowers as
 * the layout holds.
 */
export function shapeCorner(
  axis: Flower[],
  layout: Pick<ShapeLayout, "rows" | "columns">
): ShapeCorner {
  const filters = matrixFiltersForTurns(
    SHAPE_MATRIX_DEFAULT_TURN,
    SHAPE_MATRIX_DEFAULT_TURN
  );
  return {
    rows: applyFilter(axis, filters.left, false).slice(0, layout.rows),
    columns: applyFilter(axis, filters.right, false).slice(0, layout.columns),
  };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/create/method-preview-shape.test.ts`

Expected: PASS (8 tests).

- [ ] **Step 5: Write the Shape scene**

Create `src/lib/features/create/shared/components/method-previews/ShapeScene.svelte`:

```svelte
<script lang="ts">
  /**
   * ShapeScene
   *
   * Mirrors: Shape (the Shape Matrix). A Surprise roll rebuilds the matrix
   * with the Matrix's own reveal (runShapeMatrixGridReveal): the rows land,
   * then the columns, then the crossings, then the chosen crossing lights
   * with the two headers that name it. The finger taps that tile, which
   * grows into the stage as the Matrix's tile-to-hero morph does, and its
   * mandala draws itself with the guide painter's reveal
   * (createMandalaGuideRevealFrame). The finished drawing is the tile's own
   * picture.
   *
   * The corner is the page the Matrix opens on (SHAPE_MATRIX_DEFAULT_TURN),
   * traced with the user's props and painted in their hand colors. The table
   * keeps the Matrix's class names (rowhead, colhead, cell, sel) because the
   * reveal finds its targets by them.
   *
   * Finished picture: the corner with its chosen tile marked, and that
   * tile's mandala complete on the stage.
   */
  import { onDestroy, onMount, tick } from "svelte";
  import type { GhostState } from "$lib/shared/attract/services/attract-ghost.svelte";
  import { getSettings } from "$lib/shared/application/state/app-state.svelte";
  import { yieldToScheduler } from "$lib/shared/foundation/utils/background-scheduling";
  import {
    createMandalaGuideRevealFrame,
    type MandalaGuideRevealFrame,
  } from "$lib/shared/mandala/services/mandala-guide-image";
  import {
    runShapeMatrixGridReveal,
    SHAPE_MATRIX_REVEAL_CHOSEN_CLASS,
    type RevealAnimator,
  } from "$lib/shared/shape-matrix/app/services/shape-matrix-reveal";
  import ShapeMatrixMandalaArt from "$lib/shared/shape-matrix/components/ShapeMatrixMandalaArt.svelte";
  import {
    flowerKey,
    type Flower,
  } from "$lib/shared/shape-matrix/domain/flower-signature";
  import { propPairFromLegacy } from "$lib/shared/shape-matrix/domain/prop-pair";
  import {
    cellArtworkSrc,
    headerArtworkSrc,
    shapeMatrixArtworkPainterForColors,
  } from "$lib/shared/shape-matrix/services/shape-matrix-artwork";
  import {
    loadShapeMatrix,
    type ShapeMatrixData,
  } from "$lib/shared/shape-matrix/services/shape-matrix-flowers";
  import {
    mergeCellPaths,
    shapeMatrixGuideOptions,
  } from "$lib/shared/shape-matrix/services/shape-matrix-render";
  import MethodPreviewFinger from "./MethodPreviewFinger.svelte";
  import {
    cellCenter,
    shapeCellRect,
    shapeLayout,
    transformOnto,
  } from "./method-preview-compositions";
  import {
    placeGhost,
    sceneGhost,
    tapAt,
    type SceneRun,
  } from "./method-preview-run";
  import { playSceneTurns } from "./method-preview-scene-turns.svelte";
  import type { MethodPreviewSceneProps } from "./method-preview-scenes";
  import { SHAPE_PREVIEW_TIMING, shapeCorner } from "./method-preview-shape";

  /** The Matrix reveal's easing. */
  const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

  let {
    playing,
    turn,
    shape,
    width,
    height,
    accent,
    onready,
  }: MethodPreviewSceneProps = $props();

  let root = $state<HTMLElement | null>(null);
  let table = $state<HTMLTableElement | null>(null);
  let stage = $state<HTMLElement | null>(null);
  let canvas = $state<HTMLCanvasElement | null>(null);
  let pose = $state.raw<GhostState | null>(null);
  let data = $state.raw<ShapeMatrixData | null>(null);
  /** Tiles with artwork so far, in reveal order. Each paints in its own task. */
  let paintedTiles = $state(0);

  const layout = $derived(shapeLayout(shape, width, height));
  const corner = $derived(
    data && layout ? shapeCorner(data.axis, layout) : null
  );
  // The Matrix's stills follow the user's saved hand colors (ShapeMatrixGrid).
  const painter = $derived(
    shapeMatrixArtworkPainterForColors(getSettings().primaryPropColors)
  );
  const headCount = $derived(
    corner && layout
      ? corner.rows.length + (layout.columnHeads ? corner.columns.length : 0)
      : 0
  );

  let disposed = false;
  let announced = false;
  /** True while a turn draws the stage; the finished picture waits. */
  let revealing = false;
  let frame: MandalaGuideRevealFrame | null = null;
  let frameKey = "";
  /** Animations and timers a turn started, so settle can end them. */
  let animations: Animation[] = [];
  let timers: ReturnType<typeof setTimeout>[] = [];

  function track(
    element: Element,
    keyframes: Keyframe[],
    options: KeyframeAnimationOptions
  ): Animation | null {
    const target = element as HTMLElement;
    if (typeof target.animate !== "function") return null;
    const animation = target.animate(keyframes, options);
    animations.push(animation);
    return animation;
  }

  /** The Matrix reveal's animator, recording what it starts. */
  const tracker: RevealAnimator = {
    animate: (element, keyframes, options) => {
      track(element, keyframes, options);
    },
    // No turn starts under reduced motion (plan: Spec Corrections 10).
    reducedMotion: () => false,
    setTimeout: (fn, ms) => {
      const id = setTimeout(fn, ms);
      timers.push(id);
      return id;
    },
  };

  function stopTracked(): void {
    for (const animation of animations) animation.cancel();
    for (const id of timers) clearTimeout(id);
    animations = [];
    timers = [];
  }

  function cellOrder(row: number, column: number): number {
    return headCount + row * (corner?.columns.length ?? 0) + column;
  }

  function isChosen(row: number, column: number): boolean {
    return row === layout?.chosen.row && column === layout?.chosen.column;
  }

  /** The chosen tile's row flower (blue hand) and column flower (red hand). */
  function chosenPair(): { left: Flower; right: Flower } | null {
    const box = layout;
    if (!corner || !box) return null;
    const left = corner.rows[box.chosen.row];
    const right = corner.columns[box.chosen.column];
    return left && right ? { left, right } : null;
  }

  /**
   * The stage's reveal frame for the chosen tile. It is made again when the
   * box, the props, or the colors change; its finished paint is the tile's
   * picture at the stage's size.
   */
  function stageFrame(): MandalaGuideRevealFrame | null {
    const target = canvas;
    const box = layout;
    const matrix = data;
    const pair = chosenPair();
    if (!target || !box || !matrix || !pair) return null;
    const colors = getSettings().primaryPropColors ?? undefined;
    const dpr =
      typeof window !== "undefined" ? (window.devicePixelRatio ?? 1) : 1;
    // The stage's 1px border sits inside its box.
    const size = box.stage.size - 2;
    const key = [
      size,
      dpr,
      matrix.geometryKey,
      matrix.props.left,
      matrix.props.right,
      flowerKey(pair.left),
      flowerKey(pair.right),
      colors?.left,
      colors?.right,
    ].join("|");
    if (key !== frameKey) {
      frameKey = key;
      frame = createMandalaGuideRevealFrame(
        target,
        mergeCellPaths(
          matrix.left.get(flowerKey(pair.left))!,
          matrix.right.get(flowerKey(pair.right))!
        ),
        shapeMatrixGuideOptions("both", size, matrix.clubTipDx, "extent", {
          colors,
          dpr,
        })
      );
    }
    return frame;
  }

  // The finished stage follows the box, the props, and the colors.
  $effect(() => {
    const finished = stageFrame();
    if (finished && !revealing) finished.paint(1);
  });

  onMount(() => {
    void prepare();
  });

  onDestroy(() => {
    disposed = true;
    stopTracked();
  });

  /**
   * Load the matrix the way the Matrix does, for the user's props. A
   * flower's paths are built on first use and each tile paints a raster, so
   * both happen one per task: the board never stalls for the whole corner.
   */
  async function prepare(): Promise<void> {
    let matrix: ShapeMatrixData;
    try {
      matrix = await loadShapeMatrix(propPairFromLegacy(getSettings()));
    } catch (error) {
      console.warn("[method preview] Shape could not load the matrix", error);
      return;
    }
    const box = layout;
    if (disposed || !box) return;
    const warm = shapeCorner(matrix.axis, box);
    const builds = [
      ...warm.rows.map((flower) => () => matrix.left.get(flowerKey(flower))),
      ...warm.columns.map(
        (flower) => () => matrix.right.get(flowerKey(flower))
      ),
    ];
    for (const build of builds) {
      build();
      await yieldToScheduler();
      if (disposed) return;
    }
    data = matrix;
    await tick();
    const tiles =
      headCount + (corner ? corner.rows.length * corner.columns.length : 0);
    for (let count = 1; count <= tiles; count++) {
      paintedTiles = count;
      await tick();
      await yieldToScheduler();
      if (disposed) return;
    }
    // Any later corner (a resized box) paints at once.
    paintedTiles = Number.POSITIVE_INFINITY;
    await tick();
    const finished = stageFrame();
    if (!finished || announced) return;
    finished.paint(1);
    announced = true;
    onready();
  }

  function settle(): void {
    stopTracked();
    revealing = false;
    pose = null;
    root
      ?.querySelectorAll(`.${SHAPE_MATRIX_REVEAL_CHOSEN_CLASS}`)
      .forEach((element) =>
        element.classList.remove(SHAPE_MATRIX_REVEAL_CHOSEN_CLASS)
      );
    stageFrame()?.paint(1);
  }

  /** Draw the stage's mandala from its first stroke to the finished tile. */
  function drawStage(run: SceneRun): Promise<boolean> {
    return new Promise((resolve) => {
      if (typeof requestAnimationFrame !== "function") {
        resolve(true);
        return;
      }
      const startedAt = performance.now();
      let id = 0;
      const step = (now: number) => {
        const progress = Math.min(
          1,
          Math.max(0, (now - startedAt) / SHAPE_PREVIEW_TIMING.drawMs)
        );
        stageFrame()?.paint(progress);
        if (progress >= 1) {
          resolve(true);
          return;
        }
        id = requestAnimationFrame(step);
      };
      id = requestAnimationFrame(step);
      run.onAbort(() => {
        cancelAnimationFrame(id);
        resolve(false);
      });
    });
  }

  async function play(run: SceneRun): Promise<void> {
    const box = layout;
    const host = table;
    const stageBox = stage;
    if (!box || !host || !stageBox || !stageFrame()) return;
    revealing = true;
    const chosenRect = shapeCellRect(box, box.chosen.row, box.chosen.column);
    const chosen = cellCenter(chosenRect);
    const finger = sceneGhost(run, () => root);
    pose = finger.ghost;
    placeGhost(
      finger,
      Math.max(0, chosen.x - box.cell * 0.6),
      Math.min(height, chosen.y + box.cell * 0.45)
    );

    // The finished stage steps aside while the corner rebuilds.
    const stageOut = track(stageBox, [{ opacity: 1 }, { opacity: 0 }], {
      duration: SHAPE_PREVIEW_TIMING.stageOutMs,
      easing: "ease-in",
      fill: "forwards",
    });
    runShapeMatrixGridReveal(host, tracker);

    if (!(await run.wait(SHAPE_PREVIEW_TIMING.fingerLeavesMs))) return;
    if (!(await tapAt(finger, run, chosen.x, chosen.y))) return;
    if (!(await run.wait(SHAPE_PREVIEW_TIMING.growDelayMs))) return;

    // The tapped tile grows into the stage and its mandala draws itself. The
    // Matrix morphs a tile into its hero with a page-wide view transition;
    // the preview moves its own stage, starting over the tile.
    finger.ghost.visible = false;
    stageFrame()?.paint(0);
    track(
      stageBox,
      [
        { opacity: 0, transform: transformOnto(box.stage, chosenRect) },
        { opacity: 1, offset: 0.35 },
        { opacity: 1, transform: "none" },
      ],
      { duration: SHAPE_PREVIEW_TIMING.growMs, easing: EASE }
    );
    stageOut?.cancel();
    if (!(await drawStage(run))) return;
    settle();
  }

  playSceneTurns(() => ({ playing, turn }), play, {
    root: () => root,
    settle,
  });
</script>

<div class="scene" bind:this={root} style:--accent={accent}>
  {#if layout && corner && data}
    {@const matrix = data}
    <table
      class="matrix"
      bind:this={table}
      style:left="{layout.x}px"
      style:top="{layout.y}px"
      style:--cell="{layout.cell}px"
      style:--columns={corner.columns.length + 1}
    >
      {#if layout.columnHeads}
        <thead>
          <tr>
            <th class="corner"></th>
            {#each corner.columns as flower, column (column)}
              <th class="colhead">
                {#if corner.rows.length + column < paintedTiles}
                  <ShapeMatrixMandalaArt
                    instant
                    paint={(size) =>
                      headerArtworkSrc(matrix, flower, "right", size, painter)}
                    artKey={`right:${flowerKey(flower)}`}
                  />
                {/if}
              </th>
            {/each}
          </tr>
        </thead>
      {/if}
      <tbody>
        {#each corner.rows as rowFlower, row (row)}
          <tr>
            <th class="rowhead">
              {#if row < paintedTiles}
                <ShapeMatrixMandalaArt
                  instant
                  paint={(size) =>
                    headerArtworkSrc(matrix, rowFlower, "left", size, painter)}
                  artKey={`left:${flowerKey(rowFlower)}`}
                />
              {/if}
            </th>
            {#each corner.columns as columnFlower, column (column)}
              <td class="cell-td">
                <span class="cell" class:sel={isChosen(row, column)}>
                  {#if cellOrder(row, column) < paintedTiles}
                    <span class="artwork">
                      <ShapeMatrixMandalaArt
                        instant
                        paint={(size) =>
                          cellArtworkSrc(
                            matrix,
                            rowFlower,
                            columnFlower,
                            size,
                            painter
                          )}
                        artKey={`${flowerKey(rowFlower)}__${flowerKey(columnFlower)}`}
                      />
                    </span>
                  {/if}
                </span>
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
  {#if layout}
    <div
      class="stage"
      bind:this={stage}
      style:left="{layout.stage.x}px"
      style:top="{layout.stage.y}px"
      style:width="{layout.stage.size}px"
      style:height="{layout.stage.size}px"
    >
      <canvas bind:this={canvas}></canvas>
    </div>
  {/if}
  <MethodPreviewFinger {pose} />
</div>

<style>
  .scene {
    position: relative;
    width: 100%;
    height: 100%;
  }

  /* Grid tracks, not table layout: every tile is exactly --cell, so tiles
     sit where the composition put them. The table elements stay because the
     reveal finds a tile's row with closest("tr"). Its own stacking context
     keeps the chosen tile's ring under the stage. */
  .matrix {
    position: absolute;
    z-index: 0;
    display: grid;
    grid-template-columns: repeat(var(--columns), var(--cell));
    grid-auto-rows: var(--cell);
    margin: 0;
    border-spacing: 0;
  }

  .matrix thead,
  .matrix tbody,
  .matrix tr {
    display: contents;
  }

  .matrix th,
  .matrix td {
    box-sizing: border-box;
    width: var(--cell);
    height: var(--cell);
    padding: 0;
  }

  /* The Matrix's headers and tiles (ShapeMatrixGrid). */
  .corner {
    border-right: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-card-bg, #111922);
  }

  .colhead {
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-card-bg, #111922);
  }

  .rowhead {
    border-right: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-card-bg, #111922);
  }

  .colhead,
  .rowhead,
  .cell {
    transition:
      background var(--duration-fast, 150ms) var(--transition-easing, ease),
      box-shadow var(--duration-fast, 150ms) var(--transition-easing, ease);
  }

  .cell {
    position: relative;
    display: block;
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
  }

  .artwork {
    position: absolute;
    inset: 0;
    display: block;
  }

  /* The chosen crossing: the Matrix's wash and ring, in the method color. */
  .cell.sel {
    z-index: 2;
    background: color-mix(in srgb, var(--accent) 16%, transparent);
  }

  .cell.sel::after {
    content: "";
    position: absolute;
    inset: 1px;
    z-index: 2;
    border: 2px solid var(--accent);
    border-radius: 3px;
    pointer-events: none;
  }

  /* The Surprise reveal names the chosen crossing (ShapeMatrixGrid). */
  .rowhead:global(.reveal-chosen) {
    background: color-mix(
      in srgb,
      var(--prop-blue, #2e3192) 34%,
      var(--theme-card-bg, #111922)
    );
    box-shadow: inset 0 0 0 2px var(--prop-blue-text, #818cf8);
  }

  .colhead:global(.reveal-chosen) {
    background: color-mix(
      in srgb,
      var(--prop-red, #ed1c24) 26%,
      var(--theme-card-bg, #111922)
    );
    box-shadow: inset 0 0 0 2px var(--prop-red-text, #f87171);
  }

  .cell:global(.reveal-chosen) {
    z-index: 3;
    background: color-mix(in srgb, var(--accent) 22%, transparent);
    box-shadow: inset 0 0 0 2px var(--accent);
  }

  /* The stage the chosen tile grows into, like the Matrix's detail hero. */
  .stage {
    position: absolute;
    z-index: 1;
    box-sizing: border-box;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
    border-radius: 4px;
    background: var(--theme-card-bg, #111922);
    transform-origin: 0 0;
  }

  .stage::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 55%, transparent);
    pointer-events: none;
  }

  .stage canvas {
    display: block;
    width: 100%;
    height: 100%;
  }

  @media (prefers-reduced-motion: reduce) {
    .colhead,
    .rowhead,
    .cell {
      transition: none;
    }
  }
</style>
```

- [ ] **Step 6: Register the scene**

In `method-preview-scenes.ts`, replace the registry with:

```ts
/** Create method id (CREATE_TABS) to its scene module. */
export const METHOD_PREVIEW_SCENES: Readonly<
  Record<string, () => Promise<MethodPreviewSceneModule>>
> = {
  construct: () => import("./ConstructScene.svelte"),
  generate: () => import("./GenerateScene.svelte"),
  "shape-engine": () => import("./ShapeScene.svelte"),
};
```

- [ ] **Step 7: Run the registry, contract, and Shape tests**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/create/method-preview-scenes.test.ts tests/unit/create/method-preview-scene-contract.test.ts tests/unit/create/method-preview-shape.test.ts`

Expected: PASS. The contract test now also reads `ShapeScene.svelte`.

- [ ] **Step 8: Format and type check**

```bash
cd /e/tka-platform && npx prettier --write /e/worktrees/tka-platform/create-method-previews/src/lib/features/create/shared/components/method-previews/method-preview-compositions.ts /e/worktrees/tka-platform/create-method-previews/src/lib/features/create/shared/components/method-previews/method-preview-shape.ts /e/worktrees/tka-platform/create-method-previews/src/lib/features/create/shared/components/method-previews/ShapeScene.svelte /e/worktrees/tka-platform/create-method-previews/src/lib/features/create/shared/components/method-previews/method-preview-scenes.ts /e/worktrees/tka-platform/create-method-previews/tests/unit/create/method-preview-shape.test.ts
```

Run `npm run check:fast` in the worktree (after the svelte-check gate). Expected: no errors in the new or changed files.

- [ ] **Step 9: Check Shape on the bench**

Reload [http://localhost:5191/test/create-method-previews](http://localhost:5191/test/create-method-previews) in the agent Chrome. Shape is the third row of the Sizes view, so its boxes are `.bench-box` 8 to 11. Once they have faded in from the tint, run with `evaluate_script`:

```js
() =>
  [...document.querySelectorAll(".bench-box")]
    .slice(8, 12)
    .map((box) => [
      box.querySelectorAll(".rowhead").length,
      box.querySelectorAll(".colhead").length,
      box.querySelectorAll(".cell").length,
      box.querySelectorAll(".cell.sel").length,
      box.querySelectorAll(".stage canvas").length,
      box.querySelectorAll(".mandala-art img").length,
    ])
```

Expected: `[[1, 0, 2, 1, 1, 3], [2, 4, 8, 1, 1, 14], [2, 2, 4, 1, 1, 8], [2, 2, 4, 1, 1, 8]]`.

Use `wait_for` on the text `shape-engine ·` and take two screenshots of the Shape row about 0.8 seconds apart. Expected: the blue row flowers slide in from the left, the red column flowers drop in, and the crossings brighten; the chosen tile lights with a blue row head and a red column head; the compact finger taps it; the tile grows into the stage and its mandala draws stroke by stroke. In the square boxes the stage covers the four crossings; in the 308×96 box it stands beside the corner. The finger is gone by the end, and the highlights fade.

When the status has moved past `shape-engine · …`, check that the finished stage is the tile's own picture. In the 146×48 box the stage and the chosen tile are the same size:

```js
() => {
  const box = document.querySelectorAll(".bench-box")[8];
  const stage = box.querySelector(".stage canvas").toDataURL("image/png");
  return stage === box.querySelector(".cell.sel img").src;
}
```

Expected: `true`. If it is `false`, zoom a screenshot of that box: a visible difference between the stage and the tile is a defect in Task 3's reveal frame, so fix it there before going on. The console shows no errors and no `Shape could not load the matrix` warning.

- [ ] **Step 10: Screen the cost at 4× CPU**

With DevTools MCP `emulate` set `cpuThrottlingRate: 4`, reload the bench, `wait_for` the text `shape-engine ·`, then wait 3 seconds so the build and a full turn have run. Run the long-frame probe (Before You Start) with `evaluate_script`.

Expected: no frame lists a script from `ShapeScene`, `method-preview`, `shape-matrix-flowers`, `shape-matrix-artwork`, `shape-matrix-render`, `mandala-guide`, `rotation-style-archetypes`, `deck-composer`, `deck-variation`, `build-flower-sequence`, or `mandala-geometry-calculator`.

Then read each flower's path build (a development-only measure):

```js
() =>
  performance
    .getEntriesByType("measure")
    .filter((entry) => entry.name.startsWith("shape-matrix:path:"))
    .map((entry) => `${entry.name.split(":").pop()} ${Math.round(entry.duration)}ms`)
```

Expected: every build under 50ms. Set `cpuThrottlingRate: 1` again.

If a frame lists `rotation-style-archetypes`, `deck-composer`, or `deck-variation` (the archetypes every Matrix load resolves once), split that setup into stages inside its owner, `src/lib/shared/shape-matrix/services/rotation-style-archetypes.ts`. This file is Prettier-clean. Add the import beside the others:

```ts
import { yieldToScheduler } from "$lib/shared/foundation/utils/background-scheduling";
```

Replace `classifyRotationStyleMembers` with these three functions, so the synchronous callers keep their exact behavior:

```ts
/** Each base word's TnD family, by sequence id. */
function rotationStyleFamilies(
  normalizedBases: SequenceData[],
  grid: RotationGridMode
): Map<string, string> {
  const seedClasses = buildTnDSeedClasses(normalizedBases);
  const familyBySeed = new Map<string, string>();
  for (const family of getTnDFamilyOptions(seedClasses, [grid])) {
    for (const entry of family.entries) {
      familyBySeed.set(entry.sequenceId, family.familyId);
    }
  }
  return familyBySeed;
}

function groupRotationStyleMembers(
  normalizedBases: SequenceData[],
  familyBySeed: Map<string, string>
): Map<RotationStyle, ClassifiedRotationStyleMember[]> {
  const baseById = new Map(normalizedBases.map((base) => [base.id, base]));
  const byStyle = new Map<RotationStyle, ClassifiedRotationStyleMember[]>();
  for (const [seedId, familyId] of familyBySeed) {
    const sequence = baseById.get(seedId);
    if (!sequence) continue;
    const style = classifyRotationStyle(sequence);
    const members = byStyle.get(style) ?? [];
    members.push({ seq: sequence, familyId });
    byStyle.set(style, members);
  }
  return byStyle;
}

export function classifyRotationStyleMembers(
  bases: SequenceData[],
  grid: RotationGridMode
): Map<RotationStyle, ClassifiedRotationStyleMember[]> {
  const normalizedBases = bases.map(normalizeLegacySequence);
  return groupRotationStyleMembers(
    normalizedBases,
    rotationStyleFamilies(normalizedBases, grid)
  );
}
```

In `resolveRotationStyleArchetypes`, replace

```ts
  const byStyle = classifyRotationStyleMembers(bases, grid);
  const archetypes: RotationStyleArchetype[] = [];

  for (const style of ROTATION_STYLE_ORDER) {
    const members = byStyle.get(style) ?? [];
    if (members.length === 0) continue;
```

with

```ts
  // One stage per task, so a phone never blocks input for the whole set
  // (Create method previews' cost gate).
  const normalizedBases = bases.map(normalizeLegacySequence);
  await yieldToScheduler();
  const familyBySeed = rotationStyleFamilies(normalizedBases, grid);
  await yieldToScheduler();
  const byStyle = groupRotationStyleMembers(normalizedBases, familyBySeed);
  const archetypes: RotationStyleArchetype[] = [];

  for (const style of ROTATION_STYLE_ORDER) {
    const members = byStyle.get(style) ?? [];
    if (members.length === 0) continue;
    await yieldToScheduler();
```

Run Prettier on the file (same command form as Step 8) and the tests that read the archetypes:

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/animation-engine/mandala-guide-tip-parity.test.ts tests/unit/shape-matrix/shape-matrix-motion-path-options.test.ts tests/unit/shape-matrix/shape-matrix-app-boundary.test.ts src/lib/shared/shape-matrix/services/__tests__/solve-prop-relationship-phase.test.ts`

Expected: PASS, as before the edit. Reload and run the screen again. A frame that remains (one stage alone over 50ms, or one flower's build) is not fixed here: note its scripts and duration for Task 19, where the Fold decides. Add `src/lib/shared/shape-matrix/services/rotation-style-archetypes.ts` to Step 11's paths only if you edited it.

- [ ] **Step 11: Commit**

```bash
cd /e/worktrees/tka-platform/create-method-previews
git status --short
git add -- src/lib/features/create/shared/components/method-previews/method-preview-compositions.ts src/lib/features/create/shared/components/method-previews/method-preview-shape.ts src/lib/features/create/shared/components/method-previews/ShapeScene.svelte src/lib/features/create/shared/components/method-previews/method-preview-scenes.ts tests/unit/create/method-preview-shape.test.ts
git commit -m "feat(create): Shape method preview" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/features/create/shared/components/method-previews/method-preview-compositions.ts src/lib/features/create/shared/components/method-previews/method-preview-shape.ts src/lib/features/create/shared/components/method-previews/ShapeScene.svelte src/lib/features/create/shared/components/method-previews/method-preview-scenes.ts tests/unit/create/method-preview-shape.test.ts
```

---

### Task 13: Fuse Scene

The Fuse preview shows the demo sequence's blue hand and red hand apart, one hand per pictograph, the way Fuse's source cards show its inputs. They slide together into two fused steps, which then play once through Fuse's own motion seam: the props travel their real paths and the arrows reveal with the motion, as on Fuse's cards. There is no finger; Fuse fuses on its own.

Every source starts at its step's start pose with its arrows hidden, which is the frame Fuse's compact source card shows at progress 0. When a blue half and a red half land on the same cell, they make exactly the fused step at progress 0, so the fused cell takes over without a jump.

**Files:**

- Create: `src/lib/features/create/shared/components/method-previews/method-preview-fuse.ts`
- Create: `src/lib/features/create/shared/components/method-previews/FuseScene.svelte`
- Modify: `src/lib/features/create/shared/components/method-previews/method-preview-scenes.ts` (the registry)
- Test: `tests/unit/create/method-preview-fuse.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/create/method-preview-fuse.test.ts`:

```ts
/**
 * The Create front door's Fuse preview: a blue path and a red path, one hand
 * each, slide together and play once as one two-hand sequence. Each source
 * must land exactly on its fused cell, and the beats must fit in one turn.
 */
import { describe, expect, it } from "vitest";
import { METHOD_PREVIEW_TIMING } from "$lib/features/create/shared/state/method-preview-turns.svelte";
import { fuseLayout } from "$lib/features/create/shared/components/method-previews/method-preview-compositions";
import {
  DEMO_SEQUENCE,
  startPictograph,
} from "$lib/features/create/shared/components/method-previews/method-preview-demo";
import {
  FUSE_PREVIEW_TIMING,
  fuseFrames,
  fuseSources,
} from "$lib/features/create/shared/components/method-previews/method-preview-fuse";

const at = (x: number, y: number, size: number) => ({ x, y, size });

describe("Fuse preview frames", () => {
  it("plays the demo's first two steps through Fuse's motion seam", () => {
    const frames = fuseFrames(DEMO_SEQUENCE, 2);
    expect(frames.map((frame) => frame.step)).toEqual(
      DEMO_SEQUENCE.steps.slice(0, 2)
    );
    expect(frames[0]?.motionStartData).toBe(startPictograph(DEMO_SEQUENCE));
    expect(frames[1]?.motionStartData).toBe(DEMO_SEQUENCE.steps[0]);
    expect(frames.map((frame) => frame.motionProgress)).toEqual([0, 0]);
  });
});

describe("Fuse preview sources", () => {
  it("lands the blue and red half of each step on one fused cell", () => {
    expect(fuseSources(fuseLayout("strip", 146, 48)!)).toEqual([
      {
        key: "left:0",
        hand: "left",
        step: 0,
        rect: at(0, 7, 34),
        slide: "translate(23px, -7px) scale(1.4118)",
      },
      {
        key: "left:1",
        hand: "left",
        step: 1,
        rect: at(37, 7, 34),
        slide: "translate(37px, -7px) scale(1.4118)",
      },
      {
        key: "right:0",
        hand: "right",
        step: 0,
        rect: at(74, 7, 34),
        slide: "translate(-51px, -7px) scale(1.4118)",
      },
      {
        key: "right:1",
        hand: "right",
        step: 1,
        rect: at(111, 7, 34),
        slide: "translate(-37px, -7px) scale(1.4118)",
      },
    ]);
  });

  it("merges a square's blue row and red row into the fused row", () => {
    expect(
      fuseSources(fuseLayout("square", 144, 144)!).map(
        (source) => source.slide
      )
    ).toEqual([
      "translate(-25px, 38px) scale(1.5814)",
      "translate(0px, 38px) scale(1.5814)",
      "translate(-25px, -63px) scale(1.5814)",
      "translate(0px, -63px) scale(1.5814)",
    ]);
  });
});

describe("Fuse preview beats", () => {
  it("plays both fused steps with half a second of the turn to spare", () => {
    const timing = FUSE_PREVIEW_TIMING;
    const end =
      timing.clearMs +
      timing.sourcesInMs +
      timing.slideMs +
      timing.mergeMs +
      2 * timing.stepMs;
    expect(end).toBeLessThanOrEqual(METHOD_PREVIEW_TIMING.turnMs - 500);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/create/method-preview-fuse.test.ts`

Expected: FAIL. `method-preview-fuse` does not exist.

- [ ] **Step 3: Write the Fuse module**

Create `src/lib/features/create/shared/components/method-previews/method-preview-fuse.ts`:

```ts
/**
 * The Create front door's Fuse preview: the fused steps it plays, where each
 * one-hand source sits and lands, and the scene's beats. Pure, so tests check
 * them without drawing.
 */
import {
  resolveFusePictographMotionFrame,
  type FusePictographMotionFrame,
} from "$lib/features/fuse/services/fuse-pictograph-motion-frame";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import {
  transformOnto,
  type CellRect,
  type FuseLayout,
} from "./method-preview-compositions";

/** The scene's beats, in milliseconds, in the order they play. */
export const FUSE_PREVIEW_TIMING = Object.freeze({
  /** The finished fused steps fade out. */
  clearMs: 150,
  /** The blue and red sources fade in, apart. */
  sourcesInMs: 300,
  /** They slide together, each half onto its fused cell. */
  slideMs: 520,
  /** The fused cells take over from the halves. */
  mergeMs: 120,
  /** Each fused step plays. */
  stepMs: 650,
});

/**
 * The opening steps, each at the start of its travel, through Fuse's own
 * motion seam: the step, the pose its props leave from (the start position
 * for the first step), and the progress Fuse's cards play on.
 */
export function fuseFrames(
  sequence: SequenceData,
  count: number
): FusePictographMotionFrame[] {
  const frames: FusePictographMotionFrame[] = [];
  for (let index = 0; index < count; index++) {
    const frame = resolveFusePictographMotionFrame(sequence, index);
    if (frame) frames.push(frame);
  }
  return frames;
}

/** One hand of one step, before it fuses. */
export interface FuseSource {
  key: string;
  hand: HandSide;
  /** The fused step this source is one hand of. */
  step: number;
  rect: CellRect;
  /** The transform that lands it on its fused cell. */
  slide: string;
}

/** The blue sources, then the red ones, each paired with its fused cell. */
export function fuseSources(layout: FuseLayout): FuseSource[] {
  const side = (hand: HandSide, rects: CellRect[]): FuseSource[] =>
    rects.flatMap((rect, step) => {
      const target = layout.combined[step];
      return target
        ? [
            {
              key: `${hand}:${step}`,
              hand,
              step,
              rect,
              slide: transformOnto(rect, target),
            },
          ]
        : [];
    });
  return [
    ...side(HandSide.LEFT, layout.blue),
    ...side(HandSide.RIGHT, layout.red),
  ];
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/create/method-preview-fuse.test.ts`

Expected: PASS (4 tests).

- [ ] **Step 5: Write the Fuse scene**

Create `src/lib/features/create/shared/components/method-previews/FuseScene.svelte`:

```svelte
<script lang="ts">
  /**
   * FuseScene
   *
   * Mirrors: Fuse. Its two source cards hold a blue path and a red path, one
   * hand each (FuseSourceCard draws them with PictographContainer's
   * visibleHand), and Fuse plays the pair as one two-hand sequence. Here the
   * demo sequence's blue hand and red hand stand apart, slide together, and
   * the fused steps play once through Fuse's motion seam
   * (resolveFusePictographMotionFrame): the props travel from the pose before
   * each step and the arrows reveal with the motion, as on Fuse's own cards.
   *
   * Each source shows its step at the start of its travel, so a blue half and
   * a red half on one cell make that fused step exactly, and the fused cell
   * takes over without a jump.
   *
   * Finished picture: the fused steps, both hands, with their arrows.
   */
  import MethodPreviewPictograph from "./MethodPreviewPictograph.svelte";
  import { fuseLayout } from "./method-preview-compositions";
  import { DEMO_SEQUENCE } from "./method-preview-demo";
  import {
    FUSE_PREVIEW_TIMING,
    fuseFrames,
    fuseSources,
  } from "./method-preview-fuse";
  import type { SceneRun } from "./method-preview-run";
  import { playSceneTurns } from "./method-preview-scene-turns.svelte";
  import type { MethodPreviewSceneProps } from "./method-preview-scenes";

  /** The step grid's entrance easing. */
  const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

  let {
    playing,
    turn,
    shape,
    width,
    height,
    accent,
    onready,
  }: MethodPreviewSceneProps = $props();

  const frames = fuseFrames(DEMO_SEQUENCE, 2);

  let root = $state<HTMLElement | null>(null);
  let fusedRow = $state<HTMLElement | null>(null);
  let phase = $state<"rest" | "fusing">("rest");
  /** Each fused step's travel, 0 to 1. Null rests on the finished step. */
  let progress = $state.raw<(number | null)[]>(frames.map(() => null));

  const layout = $derived(fuseLayout(shape, width, height));
  const sources = $derived(layout ? fuseSources(layout) : []);

  const readyCells = new Set<string>();
  let announced = false;
  /** Animations a turn started, so settle can end them. */
  let animations: Animation[] = [];

  function handleReady(cell: string): void {
    readyCells.add(cell);
    if (announced || readyCells.size < sources.length + frames.length) {
      return;
    }
    announced = true;
    onready();
  }

  function track(
    element: Element,
    keyframes: Keyframe[],
    options: KeyframeAnimationOptions
  ): Animation | null {
    const target = element as HTMLElement;
    if (typeof target.animate !== "function") return null;
    const animation = target.animate(keyframes, options);
    animations.push(animation);
    return animation;
  }

  function settle(): void {
    for (const animation of animations) animation.cancel();
    animations = [];
    progress = frames.map(() => null);
    phase = "rest";
  }

  /** Play one fused step: its props travel from the pose before it. */
  function travel(run: SceneRun, index: number): Promise<boolean> {
    return new Promise((resolve) => {
      if (typeof requestAnimationFrame !== "function") {
        resolve(true);
        return;
      }
      const startedAt = performance.now();
      let id = 0;
      const step = (now: number) => {
        const value = Math.min(
          1,
          Math.max(0, (now - startedAt) / FUSE_PREVIEW_TIMING.stepMs)
        );
        progress = progress.map((current, cell) =>
          cell === index ? value : current
        );
        if (value >= 1) {
          resolve(true);
          return;
        }
        id = requestAnimationFrame(step);
      };
      id = requestAnimationFrame(step);
      run.onAbort(() => {
        cancelAnimationFrame(id);
        resolve(false);
      });
    });
  }

  async function play(run: SceneRun): Promise<void> {
    const host = root;
    const fused = fusedRow;
    if (!host || !fused) return;
    const pieces = [...host.querySelectorAll<HTMLElement>(".source")];
    if (pieces.length === 0 || pieces.length !== sources.length) return;
    const timing = FUSE_PREVIEW_TIMING;
    phase = "fusing";

    // The finished fused steps step aside, and their props go back to the
    // start of their travel while no one sees them.
    const out = track(fused, [{ opacity: 1 }, { opacity: 0 }], {
      duration: timing.clearMs,
      easing: "ease-in",
      fill: "forwards",
    });
    if (!(await run.wait(timing.clearMs))) return;
    progress = frames.map(() => 0);

    // The blue path and the red path appear apart, one hand each.
    for (const piece of pieces) {
      track(piece, [{ opacity: 0 }, { opacity: 1 }], {
        duration: timing.sourcesInMs,
        easing: "ease-out",
        fill: "forwards",
      });
    }
    if (!(await run.wait(timing.sourcesInMs))) return;

    // They slide together: the blue and red half of each step land on one cell.
    for (const [index, piece] of pieces.entries()) {
      const slide = sources[index]?.slide;
      if (!slide) continue;
      track(piece, [{ transform: "none" }, { transform: slide }], {
        duration: timing.slideMs,
        easing: EASE,
        fill: "forwards",
      });
    }
    if (!(await run.wait(timing.slideMs))) return;

    // The halves become the fused steps.
    track(fused, [{ opacity: 0 }, { opacity: 1 }], {
      duration: timing.mergeMs,
      easing: "ease-out",
      fill: "forwards",
    });
    out?.cancel();
    for (const piece of pieces) {
      track(piece, [{ opacity: 1 }, { opacity: 0 }], {
        duration: timing.mergeMs,
        easing: "ease-in",
        fill: "forwards",
      });
    }
    if (!(await run.wait(timing.mergeMs))) return;

    // The fused steps play once.
    for (const index of frames.keys()) {
      if (!(await travel(run, index))) return;
    }
    settle();
  }

  playSceneTurns(() => ({ playing, turn }), play, {
    root: () => root,
    settle,
  });
</script>

<div
  class="scene"
  bind:this={root}
  style:--accent={accent}
  data-phase={phase}
>
  {#if layout}
    <div class="fused" bind:this={fusedRow}>
      {#each frames as frame, index (index)}
        {@const cell = layout.combined[index]}
        {#if cell}
          <div
            class="cell"
            style:left="{cell.x}px"
            style:top="{cell.y}px"
            style:width="{cell.size}px"
            style:height="{cell.size}px"
          >
            <MethodPreviewPictograph
              data={frame.step}
              motionStartData={frame.motionStartData}
              motionProgress={progress[index] ?? null}
              arrowOpacity={progress[index] ?? 1}
              onReady={() => handleReady(`fused:${index}`)}
            />
          </div>
        {/if}
      {/each}
    </div>
    {#each sources as source (source.key)}
      {@const frame = frames[source.step]}
      {#if frame}
        <div
          class="cell source"
          style:left="{source.rect.x}px"
          style:top="{source.rect.y}px"
          style:width="{source.rect.size}px"
          style:height="{source.rect.size}px"
        >
          <MethodPreviewPictograph
            data={frame.step}
            visibleHand={source.hand}
            motionStartData={frame.motionStartData}
            motionProgress={0}
            arrowOpacity={0}
            onReady={() => handleReady(source.key)}
          />
        </div>
      {/if}
    {/each}
  {/if}
</div>

<style>
  .scene {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .fused {
    position: absolute;
    inset: 0;
  }

  .cell {
    position: absolute;
  }

  /* The one-hand sources rest out of sight; a turn brings them in. */
  .source {
    opacity: 0;
    transform-origin: 0 0;
  }
</style>
```

- [ ] **Step 6: Register the scene**

In `method-preview-scenes.ts`, replace the registry with:

```ts
/** Create method id (CREATE_TABS) to its scene module. */
export const METHOD_PREVIEW_SCENES: Readonly<
  Record<string, () => Promise<MethodPreviewSceneModule>>
> = {
  construct: () => import("./ConstructScene.svelte"),
  generate: () => import("./GenerateScene.svelte"),
  "shape-engine": () => import("./ShapeScene.svelte"),
  fuse: () => import("./FuseScene.svelte"),
};
```

- [ ] **Step 7: Run the registry, contract, and Fuse tests**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/create/method-preview-scenes.test.ts tests/unit/create/method-preview-scene-contract.test.ts tests/unit/create/method-preview-fuse.test.ts`

Expected: PASS. The contract test now also reads `FuseScene.svelte`.

- [ ] **Step 8: Format and type check**

```bash
cd /e/tka-platform && npx prettier --write /e/worktrees/tka-platform/create-method-previews/src/lib/features/create/shared/components/method-previews/method-preview-fuse.ts /e/worktrees/tka-platform/create-method-previews/src/lib/features/create/shared/components/method-previews/FuseScene.svelte /e/worktrees/tka-platform/create-method-previews/src/lib/features/create/shared/components/method-previews/method-preview-scenes.ts /e/worktrees/tka-platform/create-method-previews/tests/unit/create/method-preview-fuse.test.ts
```

Run `npm run check:fast` in the worktree (after the svelte-check gate). Expected: no errors in the new or changed files.

- [ ] **Step 9: Check Fuse on the bench**

Reload [http://localhost:5191/test/create-method-previews](http://localhost:5191/test/create-method-previews) in the agent Chrome. Fuse is the fourth row of the Sizes view, so its boxes are `.bench-box` 12 to 15. Once they have faded in from the tint, run with `evaluate_script`:

```js
() =>
  [...document.querySelectorAll(".bench-box")]
    .slice(12, 16)
    .map((box) => [
      box.querySelectorAll(".fused .cell").length,
      box.querySelectorAll(".source").length,
      box.querySelectorAll(".pictograph-container").length,
    ])
```

Expected: `[[2, 4, 6], [2, 4, 6], [2, 4, 6], [2, 4, 6]]`.

Use `wait_for` on the text `fuse ·` and take three screenshots of the Fuse row, one right after another. Expected: the fused steps dim out; two cells with a lone blue prop and two with a lone red prop appear apart, side by side in the strips and as a blue row over a red row in the squares; they slide together in pairs and become two fused cells with both props; then the first step's props travel as its arrows draw in, then the second step's. Zoom one screenshot on the 308×96 box: the halves sit exactly on the fused cells, and nothing jumps when the fused cells take over.

When the status has moved past `fuse · …`, run:

```js
() =>
  [...document.querySelectorAll(".bench-box")]
    .slice(12, 16)
    .map((box) => [
      box.querySelector(".scene").dataset.phase,
      getComputedStyle(box.querySelector(".fused")).opacity,
      [...box.querySelectorAll(".source")]
        .map((source) => getComputedStyle(source).opacity)
        .join(" "),
    ])
```

Expected: every box gives `["rest", "1", "0 0 0 0"]`. The console shows no errors.

- [ ] **Step 10: Screen the cost at 4× CPU**

With DevTools MCP `emulate` set `cpuThrottlingRate: 4`, reload the bench, `wait_for` the text `fuse ·`, then wait 3 seconds so a whole turn has played. Run the long-frame probe (Before You Start) with `evaluate_script`.

Expected: no frame lists a script from `FuseScene`, `method-preview`, `PictographContainer`, `pictograph-motion-positioner`, or `fuse-pictograph-motion-frame`. Set `cpuThrottlingRate: 1` again. A frame that lists one of them is the per-frame prop placement Fuse's own compact cards also run: note its scripts and duration for Task 19, where the Fold decides.

- [ ] **Step 11: Commit**

```bash
cd /e/worktrees/tka-platform/create-method-previews
git status --short
git add -- src/lib/features/create/shared/components/method-previews/method-preview-fuse.ts src/lib/features/create/shared/components/method-previews/FuseScene.svelte src/lib/features/create/shared/components/method-previews/method-preview-scenes.ts tests/unit/create/method-preview-fuse.test.ts
git commit -m "feat(create): Fuse method preview" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/features/create/shared/components/method-previews/method-preview-fuse.ts src/lib/features/create/shared/components/method-previews/FuseScene.svelte src/lib/features/create/shared/components/method-previews/method-preview-scenes.ts tests/unit/create/method-preview-fuse.test.ts
```

---

### Task 14: Tunnel Scene

A real tunnel plays in the card: the Tunnel's own renderer (`TunnelArtView`) with the Radial formation, four performers. The finger presses the base performer's dice, the stage fades, the performer takes a new sequence, and the tunnel redraws and plays until the turn ends. Then it stops on that frame.

`TunnelArtView` kept its frame loop running even while paused, so Steps 1 to 6 first stop its self-clock between plays, in a commit of their own. A resting Tunnel card is then a stopped canvas, as the spec requires.

The live tunnel must pass the cost gate (Step 12 here, and the Fold in Task 19). If it does not, Steps 14 to 21 replace it with the ring fallback the spec names. Skip Steps 14 to 21 when Step 12 passed and Task 19 has not sent you back.

**Files:**

- Create: `src/lib/features/create/shared/components/method-previews/method-preview-tunnel.ts`
- Create: `src/lib/features/create/shared/components/method-previews/TunnelScene.svelte`
- Modify: `src/lib/shared/sequence-viewer/tunnel/TunnelArtView.svelte` (the self-clock, the `onMount` block after `const effSpeed`)
- Modify: `src/lib/features/create/shared/components/method-previews/method-preview-scenes.ts` (the registry)
- Test: `tests/unit/create/method-preview-tunnel.test.ts`
- Test: `tests/unit/sequence-viewer/tunnel-art-view-self-clock.test.ts`
- Only in Steps 14 to 21: create `src/lib/features/create/shared/components/method-previews/TunnelRingScene.svelte`, rewrite `method-preview-tunnel.ts` and its test, edit `tests/unit/create/method-preview-scene-contract.test.ts`, and remove `TunnelScene.svelte`.

This task reads `PerformerRing.svelte` and `tunnel-config.ts` but never edits them. Neither is Prettier-clean, so never run Prettier on them.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/create/method-preview-tunnel.test.ts`:

```ts
/**
 * The Create front door's Tunnel preview: the Tunnel's own Radial formation,
 * the sequence its performer takes when the dice is pressed, and the beats.
 * When no draw came, the sequence turns an eighth, because a quarter turn
 * maps a four-fold ring onto itself and the tunnel would look the same.
 */
import { describe, expect, it } from "vitest";
import { rotateSequenceGeometry } from "$lib/shared/create/services/sequence-derived-fields";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { getPreset } from "$lib/shared/sequence-viewer/tunnel/tunnel-config";
import { builtInTunnelPresetRecipe } from "$lib/shared/sequence-viewer/tunnel/tunnel-preset-recipe";
import { METHOD_PREVIEW_TIMING } from "$lib/features/create/shared/state/method-preview-turns.svelte";
import { DEMO_SEQUENCE } from "$lib/features/create/shared/components/method-previews/method-preview-demo";
import { SCENE_TAP } from "$lib/features/create/shared/components/method-previews/method-preview-run";
import {
  TUNNEL_PREVIEW_PRESET,
  TUNNEL_PREVIEW_TIMING,
  nextTunnelSequence,
} from "$lib/features/create/shared/components/method-previews/method-preview-tunnel";

/** The attract ghost's shortest glide (attract-ghost.svelte.ts). */
const SHORTEST_GLIDE_MS = 300;

/** A four-step draw cut from the demo sequence, standing in for a fresh one. */
const fresh: SequenceData = {
  ...DEMO_SEQUENCE,
  steps: DEMO_SEQUENCE.steps.slice(4, 8),
};

describe("Tunnel preview formation", () => {
  it("is the Tunnel's own Radial preset: four performers", () => {
    expect(getPreset(TUNNEL_PREVIEW_PRESET)?.config.fold).toBe(4);
    expect(builtInTunnelPresetRecipe(TUNNEL_PREVIEW_PRESET)).not.toBeNull();
  });
});

describe("the performer's next sequence", () => {
  it("is a fresh draw when one came", () => {
    expect(nextTunnelSequence(DEMO_SEQUENCE, fresh)).toBe(fresh);
  });

  it("turns the current sequence an eighth when no draw came", () => {
    const turned = nextTunnelSequence(DEMO_SEQUENCE, null);
    expect(turned).toEqual(rotateSequenceGeometry(DEMO_SEQUENCE, 1));
    // The demo's first blue motion starts at west; an eighth clockwise is northwest.
    expect(turned.steps[0]?.motions[HandSide.LEFT]?.startLocation).toBe("nw");
    expect(turned.gridMode).toBe("box");
  });

  it("turns the current sequence when the draw came back empty", () => {
    const empty: SequenceData = { ...DEMO_SEQUENCE, steps: [] };
    expect(nextTunnelSequence(DEMO_SEQUENCE, empty)).toEqual(
      rotateSequenceGeometry(DEMO_SEQUENCE, 1)
    );
  });
});

describe("Tunnel preview beats", () => {
  it("leaves the new tunnel at least a second of the turn", () => {
    const timing = TUNNEL_PREVIEW_TIMING;
    const tap = SHORTEST_GLIDE_MS + SCENE_TAP.considerMs + SCENE_TAP.pressMs;
    expect(
      timing.leadMs + tap + timing.fadeOutMs + timing.fadeInMs
    ).toBeLessThanOrEqual(METHOD_PREVIEW_TIMING.turnMs - 1000);
  });
});
```

Create `tests/unit/sequence-viewer/tunnel-art-view-self-clock.test.ts`:

```ts
/**
 * TunnelArtView's self-clock advances the playhead only while the tunnel
 * plays, and keeps no frame loop while paused. A paused tunnel (a gallery
 * preview, or a Create method preview between turns) then costs no frames.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(
    process.cwd(),
    "src/lib/shared/sequence-viewer/tunnel/TunnelArtView.svelte"
  ),
  "utf8"
);

describe("TunnelArtView self-clock", () => {
  it("starts its frame loop only while playing", () => {
    expect(source).toMatch(/if \(!playing \|\| stepCount === 0\) return;/);
  });

  it("no longer ticks through pauses", () => {
    expect(source).not.toMatch(/if \(stepCount > 0 && playing\)/);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/create/method-preview-tunnel.test.ts tests/unit/sequence-viewer/tunnel-art-view-self-clock.test.ts`

Expected: FAIL. `method-preview-tunnel` does not exist, and both self-clock tests fail on today's loop.

- [ ] **Step 3: Write the Tunnel module**

Create `src/lib/features/create/shared/components/method-previews/method-preview-tunnel.ts`:

```ts
/**
 * The Create front door's Tunnel preview (TunnelScene.svelte): its formation,
 * its beats, and the sequence the performer takes when its dice is pressed.
 * Pure, so tests check them without drawing.
 */
import { rotateSequenceGeometry } from "$lib/shared/create/services/sequence-derived-fields";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

/** The Tunnel's own Radial preset (TUNNEL_PRESETS): four performers. */
export const TUNNEL_PREVIEW_PRESET = "radial";

/** The scene's beats, in milliseconds, in the order they play. */
export const TUNNEL_PREVIEW_TIMING = Object.freeze({
  /** The tunnel plays before the finger comes in. */
  leadMs: 700,
  /** The stage fades out once the dice is pressed. */
  fadeOutMs: 180,
  /** The longest the scene waits for the new tunnel to build and paint. */
  buildWaitMs: 1200,
  /** The new tunnel fades in. */
  fadeInMs: 260,
});

/**
 * The performer's next sequence: a fresh draw when one came, else the
 * current sequence turned an eighth. A quarter turn would map the four-fold
 * ring onto itself and look the same.
 */
export function nextTunnelSequence(
  current: SequenceData,
  fresh: SequenceData | null
): SequenceData {
  if (fresh && fresh.steps.length > 0) return fresh;
  return rotateSequenceGeometry(current, 1);
}
```

- [ ] **Step 4: Stop the self-clock while paused**

In `src/lib/shared/sequence-viewer/tunnel/TunnelArtView.svelte`, replace the `onMount` block that follows `const effSpeed = $derived(...)`:

```ts
  onMount(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      if (stepCount > 0 && playing) {
        currentStep = ((currentStep - 1 + dt * effSpeed) % loopSteps) + 1;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(readyFrame);
    };
  });
```

with:

```ts
  // The self-clock runs only while playing, so a paused tunnel (a gallery
  // preview, or a Create method preview between turns) keeps no frame loop.
  // Each tick reads the speed and loop length without tracking them, so only
  // playing and the step count restart the loop.
  $effect(() => {
    if (!playing || stepCount === 0) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.max(0, now - last) / 1000;
      last = now;
      currentStep = ((currentStep - 1 + dt * effSpeed) % loopSteps) + 1;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });

  onMount(() => () => cancelAnimationFrame(readyFrame));
```

`onMount` stays imported; it now only cancels a pending canvas-ready frame. `Math.max(0, ...)` keeps the first tick from stepping backward when the frame's timestamp is a little earlier than the loop's start.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/create/method-preview-tunnel.test.ts tests/unit/sequence-viewer/tunnel-art-view-self-clock.test.ts tests/unit/sequence-viewer/tunnel-art-view-decorative.test.ts`

Expected: PASS (5 Tunnel tests, 2 self-clock tests, 2 decorative tests).

- [ ] **Step 6: Format and commit the self-clock**

```bash
cd /e/tka-platform && npx prettier --write /e/worktrees/tka-platform/create-method-previews/src/lib/shared/sequence-viewer/tunnel/TunnelArtView.svelte /e/worktrees/tka-platform/create-method-previews/tests/unit/sequence-viewer/tunnel-art-view-self-clock.test.ts
```

Run `npm run check:fast` in the worktree (after the svelte-check gate). Expected: no errors in `TunnelArtView.svelte`.

```bash
cd /e/worktrees/tka-platform/create-method-previews
git status --short
git add -- src/lib/shared/sequence-viewer/tunnel/TunnelArtView.svelte tests/unit/sequence-viewer/tunnel-art-view-self-clock.test.ts
git commit -m "perf(tunnel): stop the self-clock while paused" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/shared/sequence-viewer/tunnel/TunnelArtView.svelte tests/unit/sequence-viewer/tunnel-art-view-self-clock.test.ts
```

The Tunnel module and its test stay uncommitted until Step 13.

- [ ] **Step 7: Write the Tunnel scene**

Create `src/lib/features/create/shared/components/method-previews/TunnelScene.svelte`:

```svelte
<script lang="ts">
  /**
   * TunnelScene
   *
   * Mirrors: Tunnel. The tunnel is the real TunnelArtView, set up the way the
   * tunnel gallery's TunnelDetailPreview sets one up: its own effects,
   * visibility, and animation settings, and a controller that saves nothing.
   * The formation is Radial from TUNNEL_PRESETS, with the grid and the trail
   * overlay off. TunnelArtView's self-clock runs only while its playing prop
   * is on, and that prop follows this card's turn, so between turns the
   * canvas is still.
   *
   * The dice is the one on the base performer's card in the Tunnel tool
   * (TunnelPerformerCard): the accent dice that gives that performer a new
   * sequence. The new sequence comes from drawMatrixRealization(), the
   * Firebase-free source behind the home hero, drawn in the background
   * between turns. When that source fails, the performer's sequence turns an
   * eighth instead, so the tunnel still redraws.
   *
   * Finished picture: the redrawn tunnel, still. Before the first turn, the
   * demo sequence's tunnel.
   */
  import { onDestroy, tick } from "svelte";
  import { TrailMode } from "$lib/shared/animation-engine/domain/types/trail-types";
  import { createAnimationSettingsState } from "$lib/shared/animation-engine/state/animation-settings-state.svelte";
  import { AnimationVisibilityStateManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
  import type { GhostState } from "$lib/shared/attract/services/attract-ghost.svelte";
  import { DEFAULT_EFFECTS_CONFIG } from "$lib/shared/effects/domain/defaults";
  import { setEffectsConfigContext } from "$lib/shared/effects/state/effects-config-context";
  import { createEffectsConfigState } from "$lib/shared/effects/state/effects-config-state.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import FontAwesomeIcon from "$lib/shared/foundation/ui/FontAwesomeIcon.svelte";
  import { runAtBackgroundPriority } from "$lib/shared/foundation/utils/background-scheduling";
  import { drawMatrixRealization } from "$lib/shared/landing/data/shape-matrix-hero-pool";
  import { DEFAULT_VIEWER_CUSTOM_COLORS } from "$lib/shared/sequence-viewer/domain/viewer-custom-colors";
  import type { ViewerPlaybackState } from "$lib/shared/sequence-viewer/domain/viewer-prop-groups";
  import { createViewerCustomColorState } from "$lib/shared/sequence-viewer/state/viewer-custom-colors-state.svelte";
  import TunnelArtView from "$lib/shared/sequence-viewer/tunnel/TunnelArtView.svelte";
  import { TunnelViewController } from "$lib/shared/sequence-viewer/tunnel/tunnel-view-controller.svelte";
  import { DEFAULT_TUNNEL_VIEW_STATE } from "$lib/shared/sequence-viewer/tunnel/tunnel-view-state";
  import MethodPreviewFinger from "./MethodPreviewFinger.svelte";
  import { cellCenter, tunnelLayout } from "./method-preview-compositions";
  import { DEMO_SEQUENCE } from "./method-preview-demo";
  import {
    placeGhost,
    sceneGhost,
    tapAt,
    waitUntil,
    type SceneRun,
  } from "./method-preview-run";
  import { playSceneTurns } from "./method-preview-scene-turns.svelte";
  import type { MethodPreviewSceneProps } from "./method-preview-scenes";
  import {
    TUNNEL_PREVIEW_PRESET,
    TUNNEL_PREVIEW_TIMING,
    nextTunnelSequence,
  } from "./method-preview-tunnel";

  let {
    playing,
    turn,
    shape,
    width,
    height,
    accent,
    onready,
  }: MethodPreviewSceneProps = $props();

  // Per-instance state, as TunnelDetailPreview does: nothing here reads or
  // writes the viewer's saved settings. Trails are off in both owners, the
  // effects config (tip effects) and the animation settings (trail mode).
  const effects = createEffectsConfigState(
    { ...DEFAULT_EFFECTS_CONFIG, tipEffectMap: {}, activeEffect: "none" },
    { persist: false }
  );
  setEffectsConfigContext(effects);

  const visibility = new AnimationVisibilityStateManager({ ephemeral: true });
  visibility.setGridMode("none");

  const settings = createAnimationSettingsState({ ephemeral: true });
  settings.setTrailMode(TrailMode.OFF);

  let sequence = $state.raw<SequenceData>(DEMO_SEQUENCE);

  // Its own color state, so the controller neither takes colors staged for
  // the viewer nor saves any.
  const controller = new TunnelViewController({
    getSequence: () => sequence,
    initialViewState: DEFAULT_TUNNEL_VIEW_STATE,
    persistViewState: false,
    visibilityManager: visibility,
    customColorState: createViewerCustomColorState({
      ...DEFAULT_VIEWER_CUSTOM_COLORS,
    }),
  });
  controller.applyPreset(TUNNEL_PREVIEW_PRESET);
  controller.active = true;

  // TunnelArtView reads only playback.animationState.sequenceData and falls
  // back to its sequence prop when that is undefined (TunnelDetailPreview's stub).
  const playback = {
    animationState: { sequenceData: undefined },
  } as unknown as ViewerPlaybackState;

  let root = $state<HTMLElement | null>(null);
  let pose = $state.raw<GhostState | null>(null);
  let canvasReady = $state(false);
  /** The stage fades out while the performer takes its new sequence. */
  let stageHidden = $state(false);
  /** Show the stage again once the tunnel has built and painted. */
  let revealWhenReady = $state(false);
  let step = $state(1);

  const layout = $derived(tunnelLayout(shape, width, height));

  let announced = false;
  /** The next turn's sequence, drawn in the background. */
  let fresh: SequenceData | null = null;
  let drawing = false;
  let sourceFailed = false;
  let disposed = false;

  onDestroy(() => {
    disposed = true;
  });

  function drawNext(): void {
    if (disposed || drawing || fresh || sourceFailed) return;
    drawing = true;
    runAtBackgroundPriority(() => {
      void drawMatrixRealization()
        .then((draw) => {
          if (!draw) sourceFailed = true;
          else if (!disposed) fresh = draw.sequence;
        })
        .catch((error: unknown) => {
          sourceFailed = true;
          console.warn(
            "[method preview] Tunnel could not draw a sequence",
            error
          );
        })
        .finally(() => {
          drawing = false;
        });
    });
  }

  // The card is ready once the first tunnel has built and painted.
  $effect(() => {
    if (announced || !canvasReady || !controller.layersReady) return;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        announced = true;
        onready();
        drawNext();
      });
    });
    return () => cancelAnimationFrame(frame);
  });

  // A hidden stage shows again two frames after its tunnel has built, so the
  // canvas has painted the new performers before anyone sees them.
  $effect(() => {
    if (!revealWhenReady || !canvasReady || !controller.layersReady) return;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        revealWhenReady = false;
        stageHidden = false;
      });
    });
    return () => cancelAnimationFrame(frame);
  });

  // A sequence the tunnel cannot build gives way to the demo sequence.
  $effect(() => {
    const error = controller.buildError;
    if (error === null || sequence === DEMO_SEQUENCE) return;
    console.warn("[method preview] Tunnel could not build a sequence", error);
    sequence = DEMO_SEQUENCE;
  });

  function settle(): void {
    pose = null;
    if (stageHidden) revealWhenReady = true;
    drawNext();
  }

  async function play(run: SceneRun): Promise<void> {
    const box = layout;
    if (!box) return;
    const timing = TUNNEL_PREVIEW_TIMING;
    // The tunnel plays a moment before the finger comes in.
    if (!(await run.wait(timing.leadMs))) return;
    const finger = sceneGhost(run, () => root);
    pose = finger.ghost;
    const start = cellCenter(box.stage);
    placeGhost(finger, start.x, start.y);
    const dice = cellCenter(box.dice);
    if (!(await tapAt(finger, run, dice.x, dice.y))) return;
    // The stage fades out, and the performer takes its new sequence unseen.
    stageHidden = true;
    if (!(await run.wait(timing.fadeOutMs))) return;
    sequence = nextTunnelSequence(sequence, fresh);
    fresh = null;
    step = 1;
    // Let the controller start its rebuild, so the reveal waits for it.
    await tick();
    if (run.aborted) return;
    finger.ghost.visible = false;
    revealWhenReady = true;
    await waitUntil(run, () => !stageHidden, timing.buildWaitMs);
    if (run.aborted) return;
    if (!(await run.wait(timing.fadeInMs))) return;
    pose = null;
  }

  playSceneTurns(() => ({ playing, turn }), play, {
    root: () => root,
    settle,
  });
</script>

<div
  class="scene"
  bind:this={root}
  style:--accent={accent}
  style:--fade-out="{TUNNEL_PREVIEW_TIMING.fadeOutMs}ms"
  style:--fade-in="{TUNNEL_PREVIEW_TIMING.fadeInMs}ms"
  data-stage={stageHidden ? "hidden" : "shown"}
>
  {#if layout}
    <div
      class="tunnel"
      style:left="{layout.stage.x}px"
      style:top="{layout.stage.y}px"
      style:width="{layout.stage.size}px"
      style:height="{layout.stage.size}px"
    >
      <TunnelArtView
        decorative
        {sequence}
        {playback}
        {controller}
        animationSettingsState={settings}
        visibilityManager={visibility}
        {playing}
        bind:currentStep={step}
        stageFit="contain"
        onCanvasReady={(canvas) => (canvasReady = canvas !== null)}
      />
    </div>
    <span
      class="dice"
      class:pressed={pose?.pressed ?? false}
      style:left="{layout.dice.x}px"
      style:top="{layout.dice.y}px"
      style:width="{layout.dice.size}px"
      style:height="{layout.dice.size}px"
      style:font-size="{Math.round(layout.dice.size * 0.5)}px"
    >
      <FontAwesomeIcon icon="dice" style="solid" ariaHidden />
    </span>
  {/if}
  <MethodPreviewFinger {pose} />
</div>

<style>
  .scene {
    position: relative;
    width: 100%;
    height: 100%;
  }

  /* The tunnel's own dark tile, rounded like the tunnel gallery's stage. */
  .tunnel {
    position: absolute;
    overflow: hidden;
    border-radius: 12%;
    transition: opacity var(--fade-in, 260ms) ease-out;
  }

  .scene[data-stage="hidden"] .tunnel {
    opacity: 0;
    transition: opacity var(--fade-out, 180ms) ease-in;
  }

  /* The performer card's dice (TunnelPerformerCard's primary PanelButton):
     the theme accent and its glyph. */
  .dice {
    position: absolute;
    display: grid;
    place-items: center;
    border-radius: 22%;
    color: var(--theme-text-on-accent, #fff);
    background: var(--theme-accent, var(--accent));
    box-shadow: 0 2px 6px
      color-mix(in srgb, var(--theme-accent, var(--accent)) 40%, transparent);
    transition: transform 140ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  .dice.pressed {
    transform: scale(0.9);
  }
</style>
```

Why `await tick()`: `waitUntil` checks at once, and the controller sets `layersReady` to false only when its rebuild effect runs. `tick()` flushes that effect first, so the reveal never shows the last tunnel's layers.

- [ ] **Step 8: Register the scene**

In `method-preview-scenes.ts`, replace the registry with:

```ts
/** Create method id (CREATE_TABS) to its scene module. */
export const METHOD_PREVIEW_SCENES: Readonly<
  Record<string, () => Promise<MethodPreviewSceneModule>>
> = {
  construct: () => import("./ConstructScene.svelte"),
  generate: () => import("./GenerateScene.svelte"),
  "shape-engine": () => import("./ShapeScene.svelte"),
  fuse: () => import("./FuseScene.svelte"),
  tunnel: () => import("./TunnelScene.svelte"),
};
```

- [ ] **Step 9: Run the registry, contract, and Tunnel tests**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/create/method-preview-scenes.test.ts tests/unit/create/method-preview-scene-contract.test.ts tests/unit/create/method-preview-tunnel.test.ts`

Expected: PASS. The contract test now also reads `TunnelScene.svelte`.

- [ ] **Step 10: Format and type check**

```bash
cd /e/tka-platform && npx prettier --write /e/worktrees/tka-platform/create-method-previews/src/lib/features/create/shared/components/method-previews/method-preview-tunnel.ts /e/worktrees/tka-platform/create-method-previews/src/lib/features/create/shared/components/method-previews/TunnelScene.svelte /e/worktrees/tka-platform/create-method-previews/src/lib/features/create/shared/components/method-previews/method-preview-scenes.ts /e/worktrees/tka-platform/create-method-previews/tests/unit/create/method-preview-tunnel.test.ts
```

Run `npm run check:fast` in the worktree (after the svelte-check gate). Expected: no errors in the new or changed files.

- [ ] **Step 11: Check Tunnel on the bench**

Reload [http://localhost:5191/test/create-method-previews](http://localhost:5191/test/create-method-previews) in the agent Chrome. Tunnel is the fifth row of the Sizes view, so its boxes are `.bench-box` 16 to 19. Once they have faded in from the tint, run with `evaluate_script`:

```js
() =>
  [...document.querySelectorAll(".bench-box")]
    .slice(16, 20)
    .map((box) => [
      box.querySelectorAll(".tunnel-art").length,
      box.querySelectorAll(".dice").length,
      (box.querySelector(".tunnel canvas")?.width ?? 0) > 0,
      box.querySelectorAll(
        "button, a[href], input, select, textarea, [tabindex]"
      ).length,
      box.querySelectorAll("[role=alert]").length,
    ])
```

Expected: `[[1, 1, true, 0, 0], [1, 1, true, 0, 0], [1, 1, true, 0, 0], [1, 1, true, 0, 0]]`. Each box holds one tunnel and one dice, the canvas has drawn, the decorative tunnel offers no controls, and no tunnel failed to build.

Use `wait_for` on the text `tunnel ·`, then at once run this observer:

```js
async () => {
  const scenes = [...document.querySelectorAll(".bench-box")]
    .slice(16, 20)
    .map((box) => box.querySelector(".scene"));
  const seen = scenes.map((scene) => [scene?.dataset.stage]);
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      const index = scenes.indexOf(record.target);
      if (index >= 0) seen[index].push(record.target.dataset.stage);
    }
  });
  for (const scene of scenes) {
    if (scene) {
      observer.observe(scene, {
        attributes: true,
        attributeFilter: ["data-stage"],
      });
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 3200));
  observer.disconnect();
  return seen.map((values) => values.join(">"));
}
```

Expected: `["shown>hidden>shown", "shown>hidden>shown", "shown>hidden>shown", "shown>hidden>shown"]`. Every tunnel faded out at the press and came back with its new sequence inside the turn.

When the second round reaches Tunnel, `wait_for` the text `tunnel ·` again and take two screenshots of the Tunnel row, the second about 1.5 seconds after the first. Expected: in the first, four-performer tunnels play, and the compact finger glides from a tunnel's center to the accent dice; in the second, a different tunnel plays. In the strips and the roomy box the dice sits beside the tunnel; in the squares it sits in the tunnel's bottom-right corner. The console shows no errors and neither `Tunnel could not draw a sequence` nor `Tunnel could not build a sequence`.

- [ ] **Step 12: Run the Tunnel cost gate**

The spec gives Tunnel the hardest gate: it holds 60 fps in its turn, adds no main-thread task over 50 ms, and costs no frames between turns. Four tunnels play at once in the Sizes row, so run at 1× CPU: the four stand in for one tunnel on a slower phone. Task 19 measures the real card on the Fold.

1. Check that DevTools MCP `emulate` has `cpuThrottlingRate: 1`. Reload the bench, `wait_for` the text `tunnel ·`, and at once run the frame-rate probe (Before You Start) with `evaluate_script`. Expected: 57 or more.
2. When the status has moved past `tunnel · …`, run the long-frame probe (Before You Start). Expected: no frame lists a script from `TunnelScene`, `TunnelArtView`, `AnimatorCanvas`, `CanvasSurface`, `animation-render-loop`, `canvas-2d-animation-renderer`, `canvas2d/`, `tunnel-view-controller`, `tunnel-layer-builder`, or `sequence-transforms`. On the bench the four tunnels build in the same task when the page loads; a load-time frame whose scripts are only those builds passes when a quarter of its duration is under 50 ms, because the front door builds one tunnel.
3. Right after, run the rest probe:

```js
async () => {
  const original = window.requestAnimationFrame;
  let calls = 0;
  window.requestAnimationFrame = (callback) => {
    if (
      /TunnelArtView|AnimatorCanvas|CanvasSurface|animation-render-loop/.test(
        new Error().stack ?? ""
      )
    ) {
      calls += 1;
    }
    return original.call(window, callback);
  };
  await new Promise((resolve) => setTimeout(resolve, 1000));
  window.requestAnimationFrame = original;
  return calls;
}
```

Expected: `0`. A resting tunnel keeps no frame loop.

4. Check that the tunnels draw on 2D canvases, with no WebGL (the fire, charcoal, and LED overlays stay off):

```js
() =>
  [...document.querySelectorAll(".bench-box")]
    .slice(16, 20)
    .flatMap((box) => [...box.querySelectorAll("canvas")])
    .map((canvas) => canvas.getContext("2d") !== null)
```

Expected: every entry is `true`.

5. Check that nothing reached Firebase:

```js
() =>
  performance
    .getEntriesByType("resource")
    .map((entry) => entry.name)
    .filter((name) => /firestore|firebaseio|identitytoolkit/.test(name))
```

Expected: `[]`.

If any check fails, write down which one and its numbers (the frame rate, the long frame's scripts and duration, or the rest count). Commit in Step 13 anyway, then continue with Step 14. The final report names the fallback and why it was taken.

- [ ] **Step 13: Commit**

```bash
cd /e/worktrees/tka-platform/create-method-previews
git status --short
git add -- src/lib/features/create/shared/components/method-previews/method-preview-tunnel.ts src/lib/features/create/shared/components/method-previews/TunnelScene.svelte src/lib/features/create/shared/components/method-previews/method-preview-scenes.ts tests/unit/create/method-preview-tunnel.test.ts
git commit -m "feat(create): Tunnel method preview" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/features/create/shared/components/method-previews/method-preview-tunnel.ts src/lib/features/create/shared/components/method-previews/TunnelScene.svelte src/lib/features/create/shared/components/method-previews/method-preview-scenes.ts tests/unit/create/method-preview-tunnel.test.ts
```

#### Only when the gate fails: the performer ring

Steps 14 to 21 run when Step 12 failed, or when Task 19 finds the live tunnel too costly on the Fold. The spec's fallback is the real `PerformerRing` from Stage settings, whose accent halo marks the base performer, beside the dice and that performer's step strip. Pressing the dice re-rolls the performer, and the strip washes in again with the step grid's wave. It uses Generate's slots: the ring takes the lead slot, the dice the next, and the steps the rest. The `TunnelArtView` self-clock commit stays; it helps every paused tunnel.

- [ ] **Step 14: Write the failing fallback tests**

Replace `tests/unit/create/method-preview-tunnel.test.ts` with:

```ts
/**
 * The Create front door's Tunnel preview: the Tunnel's own Radial formation,
 * the sequence its performer takes when the dice is pressed, and the beats.
 * When no draw came, the sequence turns an eighth, because a quarter turn
 * maps a four-fold ring onto itself and the tunnel would look the same.
 *
 * The preview shows the performer ring from Stage settings beside the dice
 * and the performer's steps, in Generate's slots, and the steps wash in with
 * the step grid's wave after the ring and the dice.
 */
import { describe, expect, it } from "vitest";
import { rotateSequenceGeometry } from "$lib/shared/create/services/sequence-derived-fields";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { getPreset } from "$lib/shared/sequence-viewer/tunnel/tunnel-config";
import { builtInTunnelPresetRecipe } from "$lib/shared/sequence-viewer/tunnel/tunnel-preset-recipe";
import { DEMO_SEQUENCE } from "$lib/features/create/shared/components/method-previews/method-preview-demo";
import {
  TUNNEL_PREVIEW_PRESET,
  nextTunnelSequence,
  tunnelRingCellDelayMs,
  tunnelRingLayout,
  tunnelRingRevealMs,
} from "$lib/features/create/shared/components/method-previews/method-preview-tunnel";

/** A four-step draw cut from the demo sequence, standing in for a fresh one. */
const fresh: SequenceData = {
  ...DEMO_SEQUENCE,
  steps: DEMO_SEQUENCE.steps.slice(4, 8),
};

const at = (x: number, y: number, size: number) => ({ x, y, size });

describe("Tunnel preview formation", () => {
  it("is the Tunnel's own Radial preset: four performers", () => {
    expect(getPreset(TUNNEL_PREVIEW_PRESET)?.config.fold).toBe(4);
    expect(builtInTunnelPresetRecipe(TUNNEL_PREVIEW_PRESET)).not.toBeNull();
  });
});

describe("the performer's next sequence", () => {
  it("is a fresh draw when one came", () => {
    expect(nextTunnelSequence(DEMO_SEQUENCE, fresh)).toBe(fresh);
  });

  it("turns the current sequence an eighth when no draw came", () => {
    const turned = nextTunnelSequence(DEMO_SEQUENCE, null);
    expect(turned).toEqual(rotateSequenceGeometry(DEMO_SEQUENCE, 1));
    // The demo's first blue motion starts at west; an eighth clockwise is northwest.
    expect(turned.steps[0]?.motions[HandSide.LEFT]?.startLocation).toBe("nw");
    expect(turned.gridMode).toBe("box");
  });

  it("turns the current sequence when the draw came back empty", () => {
    const empty: SequenceData = { ...DEMO_SEQUENCE, steps: [] };
    expect(nextTunnelSequence(DEMO_SEQUENCE, empty)).toEqual(
      rotateSequenceGeometry(DEMO_SEQUENCE, 1)
    );
  });
});

describe("the performer ring layout", () => {
  it("puts the ring and the dice in Generate's first slots, then the steps", () => {
    expect(tunnelRingLayout("strip", 146, 48)).toEqual({
      ring: at(0, 7, 34),
      dice: at(37, 7, 34),
      cells: [at(74, 7, 34), at(111, 7, 34)],
      columns: 4,
    });
    expect(tunnelRingLayout("square", 144, 144)).toEqual({
      ring: at(0, 0, 68),
      dice: at(75, 0, 68),
      cells: [at(0, 75, 68), at(75, 75, 68)],
      columns: 2,
    });
  });

  it("has no layout for an empty box", () => {
    expect(tunnelRingLayout("strip", 0, 48)).toBeNull();
  });

  it("washes the steps in after the ring and the dice", () => {
    expect([0, 1].map((index) => tunnelRingCellDelayMs(index, 4))).toEqual([
      110, 165,
    ]);
    expect([0, 1].map((index) => tunnelRingCellDelayMs(index, 2))).toEqual([
      55, 110,
    ]);
    expect(tunnelRingRevealMs(2, 4)).toBe(545);
    expect(tunnelRingRevealMs(2, 2)).toBe(490);
    expect(tunnelRingRevealMs(0, 4)).toBe(0);
  });
});
```

The live tunnel's beats test goes: the ring scene uses Generate's beats.

- [ ] **Step 15: Run it to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/create/method-preview-tunnel.test.ts`

Expected: FAIL. `tunnelRingLayout`, `tunnelRingCellDelayMs`, and `tunnelRingRevealMs` are not exported.

- [ ] **Step 16: Rewrite the Tunnel module for the ring**

Replace `src/lib/features/create/shared/components/method-previews/method-preview-tunnel.ts` with:

```ts
/**
 * The Create front door's Tunnel preview (TunnelRingScene.svelte): its
 * formation, where the performer ring, the dice, and the performer's steps
 * sit, their wave, and the sequence the performer takes when its dice is
 * pressed. Pure, so tests check them without drawing.
 */
import { rotateSequenceGeometry } from "$lib/shared/create/services/sequence-derived-fields";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { generateLayout, type CellRect } from "./method-preview-compositions";
import { generateCellDelayMs, generateRevealMs } from "./method-preview-generate";
import type { MethodPreviewShape } from "./method-preview-layout";

/** The Tunnel's own Radial preset (TUNNEL_PRESETS): four performers. */
export const TUNNEL_PREVIEW_PRESET = "radial";

/**
 * The performer's next sequence: a fresh draw when one came, else the
 * current sequence turned an eighth. A quarter turn would map the four-fold
 * ring onto itself and look the same.
 */
export function nextTunnelSequence(
  current: SequenceData,
  fresh: SequenceData | null
): SequenceData {
  if (fresh && fresh.steps.length > 0) return fresh;
  return rotateSequenceGeometry(current, 1);
}

/** The performer ring, its dice, and the performer's steps. */
export interface TunnelRingLayout {
  ring: CellRect;
  dice: CellRect;
  cells: CellRect[];
  /** Columns of the slot grid, ring and dice included, for the wave bands. */
  columns: number;
}

/** Generate's slots: the ring takes the lead slot and the dice the next. */
export function tunnelRingLayout(
  shape: MethodPreviewShape,
  width: number,
  height: number
): TunnelRingLayout | null {
  const slots = generateLayout(shape, width, height);
  const [dice, ...cells] = slots?.cells ?? [];
  return slots && dice
    ? { ring: slots.dice, dice, cells, columns: slots.columns }
    : null;
}

/** When step cell `index` starts entering: the ring and dice hold slots 0 and 1. */
export function tunnelRingCellDelayMs(index: number, columns: number): number {
  return generateCellDelayMs(index + 1, columns);
}

/** From the start of the wash until its last cell has landed. */
export function tunnelRingRevealMs(cellCount: number, columns: number): number {
  return cellCount > 0 ? generateRevealMs(cellCount + 1, columns) : 0;
}
```

- [ ] **Step 17: Run the test**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/create/method-preview-tunnel.test.ts`

Expected: PASS (7 tests).

- [ ] **Step 18: Write the ring scene**

Create `src/lib/features/create/shared/components/method-previews/TunnelRingScene.svelte`:

```svelte
<script lang="ts">
  /**
   * TunnelRingScene
   *
   * Mirrors: Tunnel, through its Stage settings. The ring is the real
   * PerformerRing that Stage settings draws for a formation, here Radial from
   * TUNNEL_PRESETS; its accent halo marks the base performer. Beside it sit
   * the dice from that performer's card (TunnelPerformerCard) and the
   * performer's opening steps. Pressing the dice gives the performer a new
   * sequence, and its steps wash in with the step grid's diagonal wave
   * (waveBandAt, DEFAULT_ANIMATION_TIMING, the stepCascade keyframes).
   *
   * The Tunnel card shows this ring because the live tunnel (TunnelScene)
   * did not pass the cost gate.
   *
   * Each turn's sequence comes from drawMatrixRealization(), the
   * Firebase-free source behind the home hero, drawn in the background
   * between turns. When that source fails, turns step through the demo
   * sequence instead.
   *
   * Finished picture: the ring, the dice, and the latest sequence's opening
   * steps. Before the first turn, the demo sequence's.
   */
  import { onDestroy } from "svelte";
  import type { GhostState } from "$lib/shared/attract/services/attract-ghost.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import FontAwesomeIcon from "$lib/shared/foundation/ui/FontAwesomeIcon.svelte";
  import { runAtBackgroundPriority } from "$lib/shared/foundation/utils/background-scheduling";
  import { drawMatrixRealization } from "$lib/shared/landing/data/shape-matrix-hero-pool";
  import PerformerRing from "$lib/shared/sequence-viewer/tunnel/PerformerRing.svelte";
  import {
    DEFAULT_CONFIG,
    getPreset,
  } from "$lib/shared/sequence-viewer/tunnel/tunnel-config";
  import { DEFAULT_ANIMATION_TIMING } from "$lib/features/create/shared/workspace-panel/sequence-display/domain/models/step-grid-display-models";
  import MethodPreviewFinger from "./MethodPreviewFinger.svelte";
  import MethodPreviewPictograph from "./MethodPreviewPictograph.svelte";
  import { cellCenter } from "./method-preview-compositions";
  import {
    FIRST_ROLL,
    GENERATE_CLEAR_MS,
    GENERATE_READY_WAIT_MS,
    nextRoll,
    rollStep,
    type GenerateRoll,
  } from "./method-preview-generate";
  import {
    placeGhost,
    sceneGhost,
    tapAt,
    waitUntil,
    type SceneRun,
  } from "./method-preview-run";
  import { playSceneTurns } from "./method-preview-scene-turns.svelte";
  import type { MethodPreviewSceneProps } from "./method-preview-scenes";
  import {
    TUNNEL_PREVIEW_PRESET,
    tunnelRingCellDelayMs,
    tunnelRingLayout,
    tunnelRingRevealMs,
  } from "./method-preview-tunnel";

  type Phase = "rest" | "clearing" | "entering";

  let {
    playing,
    turn,
    shape,
    width,
    height,
    accent,
    onready,
  }: MethodPreviewSceneProps = $props();

  const formation = getPreset(TUNNEL_PREVIEW_PRESET)?.config ?? DEFAULT_CONFIG;

  let root = $state<HTMLElement | null>(null);
  let pose = $state.raw<GhostState | null>(null);
  let phase = $state<Phase>("rest");
  let roll = $state.raw<GenerateRoll>(FIRST_ROLL);
  /** Bumped with each roll, so every cell reports ready for its new step. */
  let epoch = $state(0);

  const layout = $derived(tunnelRingLayout(shape, width, height));

  /** Cells that have drawn the current roll. */
  const readyCells = new Set<number>();
  let announced = false;
  /** The next turn's sequence, drawn in the background. */
  let fresh: SequenceData | null = null;
  let drawing = false;
  let sourceFailed = false;
  let disposed = false;

  onDestroy(() => {
    disposed = true;
  });

  function drawNext(): void {
    if (disposed || drawing || fresh || sourceFailed) return;
    drawing = true;
    runAtBackgroundPriority(() => {
      void drawMatrixRealization()
        .then((draw) => {
          if (!draw) sourceFailed = true;
          else if (!disposed) fresh = draw.sequence;
        })
        .catch((error: unknown) => {
          sourceFailed = true;
          console.warn(
            "[method preview] Tunnel could not draw a sequence",
            error
          );
        })
        .finally(() => {
          drawing = false;
        });
    });
  }

  function handleCellReady(index: number): void {
    readyCells.add(index);
    const count = layout?.cells.length ?? 0;
    if (announced || count === 0 || readyCells.size < count) return;
    announced = true;
    onready();
    drawNext();
  }

  function settle(): void {
    pose = null;
    phase = "rest";
    drawNext();
  }

  async function play(run: SceneRun): Promise<void> {
    const box = layout;
    const last = box?.cells[box.cells.length - 1];
    if (!box || !last) return;
    const finger = sceneGhost(run, () => root);
    pose = finger.ghost;
    const start = cellCenter(last);
    placeGhost(finger, start.x, start.y);
    const dice = cellCenter(box.dice);
    if (!(await tapAt(finger, run, dice.x, dice.y))) return;
    phase = "clearing";
    if (!(await run.wait(GENERATE_CLEAR_MS))) return;
    const drawn = fresh;
    fresh = null;
    roll = nextRoll(roll, drawn, box.cells.length);
    readyCells.clear();
    epoch += 1;
    // A cell still drawing after the wait washes in when it is ready.
    await waitUntil(
      run,
      () => readyCells.size >= box.cells.length,
      GENERATE_READY_WAIT_MS
    );
    if (run.aborted) return;
    finger.ghost.visible = false;
    phase = "entering";
    if (
      !(await run.wait(tunnelRingRevealMs(box.cells.length, box.columns)))
    ) {
      return;
    }
    settle();
  }

  playSceneTurns(() => ({ playing, turn }), play, {
    root: () => root,
    settle,
  });
</script>

<div
  class="scene"
  bind:this={root}
  style:--accent={accent}
  style:--step-entrance-duration="{DEFAULT_ANIMATION_TIMING.entranceDuration}ms"
  style:--clear-duration="{GENERATE_CLEAR_MS}ms"
  data-phase={phase}
>
  {#if layout}
    <span
      class="ring"
      style:left="{layout.ring.x}px"
      style:top="{layout.ring.y}px"
      style:width="{layout.ring.size}px"
      style:height="{layout.ring.size}px"
    >
      <PerformerRing
        config={formation}
        size={layout.ring.size}
        animate={false}
      />
    </span>
    <span
      class="dice"
      class:pressed={pose?.pressed ?? false}
      style:left="{layout.dice.x}px"
      style:top="{layout.dice.y}px"
      style:width="{layout.dice.size}px"
      style:height="{layout.dice.size}px"
      style:font-size="{Math.round(layout.dice.size * 0.5)}px"
    >
      <FontAwesomeIcon icon="dice" style="solid" ariaHidden />
    </span>
    {#each layout.cells as cell, index (index)}
      <div
        class="cell"
        style:left="{cell.x}px"
        style:top="{cell.y}px"
        style:width="{cell.size}px"
        style:height="{cell.size}px"
        style:--reveal-delay="{tunnelRingCellDelayMs(index, layout.columns)}ms"
      >
        <MethodPreviewPictograph
          data={rollStep(roll, index)}
          readyEpoch={epoch}
          onReady={() => handleCellReady(index)}
        />
      </div>
    {/each}
  {/if}
  <MethodPreviewFinger {pose} />
</div>

<style>
  .scene {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .ring {
    position: absolute;
    display: grid;
    place-items: center;
  }

  /* The performer card's dice (TunnelPerformerCard's primary PanelButton):
     the theme accent and its glyph. */
  .dice {
    position: absolute;
    display: grid;
    place-items: center;
    border-radius: 22%;
    color: var(--theme-text-on-accent, #fff);
    background: var(--theme-accent, var(--accent));
    box-shadow: 0 2px 6px
      color-mix(in srgb, var(--theme-accent, var(--accent)) 40%, transparent);
    transition: transform 140ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  .dice.pressed {
    transform: scale(0.9);
  }

  .cell {
    position: absolute;
  }

  /* The last roll fades out. Only this phase transitions, so the way back
     never fights the entrance below. */
  .scene[data-phase="clearing"] .cell {
    opacity: 0;
    transition: opacity var(--clear-duration, 150ms) ease-in;
  }

  /* The step grid's entrance, band by band (StepCell's .step-cell.animate). */
  .scene[data-phase="entering"] .cell {
    animation: stepCascade var(--step-entrance-duration, 380ms)
      cubic-bezier(0.22, 1, 0.36, 1) both;
    animation-delay: var(--reveal-delay, 0ms);
  }
</style>
```

- [ ] **Step 19: Point the registry and the contract test at the ring**

In `method-preview-scenes.ts`, change the Tunnel entry to:

```ts
  tunnel: () => import("./TunnelRingScene.svelte"),
```

In `tests/unit/create/method-preview-scene-contract.test.ts`, change the Tunnel entry of `SCENE_FILES` to:

```ts
  tunnel: "TunnelRingScene.svelte",
```

Remove the live scene, which Step 13 committed:

```bash
cd /e/worktrees/tka-platform/create-method-previews
git rm -- src/lib/features/create/shared/components/method-previews/TunnelScene.svelte
```

- [ ] **Step 20: Test, format, type check, and check the ring on the bench**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/create/method-preview-scenes.test.ts tests/unit/create/method-preview-scene-contract.test.ts tests/unit/create/method-preview-tunnel.test.ts`

Expected: PASS. The contract test now reads `TunnelRingScene.svelte`.

```bash
cd /e/tka-platform && npx prettier --write /e/worktrees/tka-platform/create-method-previews/src/lib/features/create/shared/components/method-previews/method-preview-tunnel.ts /e/worktrees/tka-platform/create-method-previews/src/lib/features/create/shared/components/method-previews/TunnelRingScene.svelte /e/worktrees/tka-platform/create-method-previews/src/lib/features/create/shared/components/method-previews/method-preview-scenes.ts /e/worktrees/tka-platform/create-method-previews/tests/unit/create/method-preview-tunnel.test.ts /e/worktrees/tka-platform/create-method-previews/tests/unit/create/method-preview-scene-contract.test.ts
```

Run `npm run check:fast` in the worktree (after the svelte-check gate). Expected: no errors in the new or changed files.

Reload the bench. Once the Tunnel row has faded in from the tint, run with `evaluate_script`:

```js
() =>
  [...document.querySelectorAll(".bench-box")]
    .slice(16, 20)
    .map((box) => [
      box.querySelectorAll(".ring svg").length,
      box.querySelectorAll(".dice").length,
      box.querySelectorAll(".cell").length,
      box.querySelectorAll("canvas").length,
    ])
```

Expected: `[[1, 1, 2, 0], [1, 1, 2, 0], [1, 1, 2, 0], [1, 1, 7, 0]]`.

Use `wait_for` on the text `tunnel ·` and take two screenshots of the Tunnel row during the turn. Expected: four performer pairs sit on the ring, one with the accent halo; the compact finger glides to the accent dice and presses it (the dice dips); the step cells fade, and the new sequence washes in from the cell beside the dice outward in the step grid's diagonal drift. The console shows no errors.

With DevTools MCP `emulate` set `cpuThrottlingRate: 4`, reload the bench, `wait_for` the text `tunnel ·`, then wait 4 seconds so the turn and the next background draw both run. Run the long-frame probe. Expected: no frame lists a script from `TunnelRingScene`, `PerformerRing`, `method-preview`, `background-scheduling`, or `shape-matrix-hero-pool`. Set `cpuThrottlingRate: 1` again. A frame that lists one of them goes to Task 19, where the Fold decides.

- [ ] **Step 21: Commit the fallback**

```bash
cd /e/worktrees/tka-platform/create-method-previews
git status --short
git add -- src/lib/features/create/shared/components/method-previews/method-preview-tunnel.ts src/lib/features/create/shared/components/method-previews/TunnelRingScene.svelte src/lib/features/create/shared/components/method-previews/method-preview-scenes.ts tests/unit/create/method-preview-tunnel.test.ts tests/unit/create/method-preview-scene-contract.test.ts
git commit -m "feat(create): Tunnel preview falls back to the performer ring" -m "The live tunnel did not pass the method preview cost gate." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/features/create/shared/components/method-previews/method-preview-tunnel.ts src/lib/features/create/shared/components/method-previews/TunnelRingScene.svelte src/lib/features/create/shared/components/method-previews/TunnelScene.svelte src/lib/features/create/shared/components/method-previews/method-preview-scenes.ts tests/unit/create/method-preview-tunnel.test.ts tests/unit/create/method-preview-scene-contract.test.ts
```

---

### Task 15: Assemble Scene

On Assemble's own grid (its `GridSvg`, diamond), the finger taps two points and blue hops to each along Assemble's own arc (`SvgPropAnimator`, one builder hop long). Then the hands switch: blue stays on its start point as the dimmed ghost, red appears on its own start point, and red hops to two tapped points while the ghost repeats blue's hops in sync, the way `InteractiveGrid` animates its ghost. Both props then rest on their final points, as on Assemble's Complete phase.

The hops are the demo's N and M steps (steps 4 and 5), read through Assemble's own sequence loader, `sequenceToBuilderHydration`. In the opening steps red stands still (Y), so it would add no points. The props begin on their start points, as after each hand's first tap: a turn has room for four taps, not six.

The preview is the second user of two things inside `InteractiveGrid`: the prop artwork loading and the hop length. Steps 1 to 6 first move them out, in a commit of their own: the artwork into a new Assemble service, `builder-prop-art.ts`, and the hop length into `svg-prop-animator.ts`, which owns the hop motion. The Assemble tool behaves as before.

**Files:**

- Create: `src/lib/features/assemble-lab/services/builder-prop-art.ts`
- Create: `src/lib/features/assemble-lab/services/builder-prop-art.test.ts` (next to its code, like `builder-motion-geometry.test.ts`)
- Modify: `src/lib/features/assemble-lab/components/InteractiveGrid.svelte` (the animator import, the prop imports under the trust-boundary comment, `ANIMATION_DURATION_MS`, and everything from `withUserColor` through the prop-loading effect)
- Modify: `src/lib/features/assemble-lab/services/svg-prop-animator.ts` (export `BUILDER_HOP_MS`; hand-edit it)
- Create: `src/lib/features/create/shared/components/method-previews/method-preview-assemble.ts`
- Create: `src/lib/features/create/shared/components/method-previews/AssembleScene.svelte`
- Modify: `src/lib/features/create/shared/components/method-previews/method-preview-scenes.ts` (the registry)
- Test: `tests/unit/create/method-preview-assemble.test.ts`
- Modify: `tests/unit/create/method-preview-scenes.test.ts`

`svg-prop-animator.ts` and `builder-step-converter.ts` are not Prettier-clean. Never run Prettier on them; edit `svg-prop-animator.ts` by hand, and only read `builder-step-converter.ts`.

- [ ] **Step 1: Write the failing prop artwork test**

Create `src/lib/features/assemble-lab/services/builder-prop-art.test.ts`:

```ts
/**
 * Assemble's prop artwork follows the settings the pictographs draw with.
 * InteractiveGrid and the Create front door's Assemble preview load it inside
 * effects, so every setting has to be read before the first await.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { normalizeFanAppearance } from "$lib/shared/pictograph/prop/domain/fan-appearance";
import type { PropRenderData } from "$lib/shared/pictograph/prop/domain/models/prop-render-data";
import { applyHandColorOverride } from "$lib/shared/pictograph/prop/domain/prop-preview-color";
import { normalizePropLook } from "$lib/shared/pictograph/prop/domain/prop-look";
import { normalizeTriangleGrip } from "$lib/shared/pictograph/prop/domain/triangle-appearance";
import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { getMotionColor } from "$lib/shared/utils/svg-color-utils";
import {
  loadBuilderPropArt,
  type BuilderPropSettings,
} from "./builder-prop-art";

const { loadPropSvg } = vi.hoisted(() => ({ loadPropSvg: vi.fn() }));

vi.mock("$lib/shared/pictograph/prop/services/prop-svg-loader", () => ({
  propSvgLoader: { loadPropSvg },
}));

/** Staff artwork as the loader paints it: in the default blue. */
const SOURCE = `<path fill="${getMotionColor(HandSide.LEFT, "dark")}" d="M0 0h252.8v77.8H0z"/>`;

function art(svgContent = SOURCE): PropRenderData {
  return {
    position: { x: 0, y: 0 },
    rotation: 0,
    svgData: {
      svgContent,
      viewBox: { width: 252.8, height: 77.8 },
      center: { x: 126.4, y: 38.9 },
    },
    loaded: true,
    error: null,
  };
}

beforeEach(() => {
  loadPropSvg.mockReset();
});

describe("loadBuilderPropArt", () => {
  it("reads every setting before its first await", () => {
    loadPropSvg.mockReturnValue(new Promise(() => {}));
    const read = new Set<string>();
    const settings = new Proxy<BuilderPropSettings>(
      {
        leftPropType: PropType.STAFF,
        primaryPropColors: { left: "#00ff00", right: "#ff00ff" },
      },
      {
        get(target, key, receiver) {
          read.add(String(key));
          return Reflect.get(target, key, receiver);
        },
      }
    );
    void loadBuilderPropArt(HandSide.LEFT, settings);
    expect([...read].sort()).toEqual([
      "fanAppearance",
      "leftPropType",
      "primaryPropColors",
      "propArtwork",
      "triangleGrip",
    ]);
  });

  it("draws the hand's own prop type in the pictographs' look", async () => {
    loadPropSvg.mockResolvedValue(art());
    await loadBuilderPropArt(HandSide.RIGHT, {
      leftPropType: PropType.STAFF,
      rightPropType: PropType.FAN,
    });
    expect(loadPropSvg).toHaveBeenCalledTimes(1);
    const [, motion, useGridVersion, options] = loadPropSvg.mock.calls[0] ?? [];
    expect(motion).toMatchObject({
      propType: PropType.FAN,
      hand: HandSide.RIGHT,
    });
    expect(useGridVersion).toBe(false);
    expect(options).toEqual({
      propLook: normalizePropLook(undefined),
      fanAppearance: normalizeFanAppearance(undefined),
      triangleGrip: normalizeTriangleGrip(undefined),
    });
  });

  it("repaints the artwork in the hand's chosen color", async () => {
    loadPropSvg.mockResolvedValue(art());
    const result = await loadBuilderPropArt(HandSide.LEFT, {
      primaryPropColors: { left: "#00ff00", right: "#ff00ff" },
    });
    expect(result.svgData?.svgContent).toBe(
      applyHandColorOverride(SOURCE, HandSide.LEFT, PropType.STAFF, "#00ff00")
    );
    expect(result.svgData?.svgContent).toContain('fill="#00ff00"');
    expect(result.svgData?.center).toEqual({ x: 126.4, y: 38.9 });
  });

  it("keeps the loader's artwork when no color is chosen", async () => {
    const loaded = art();
    loadPropSvg.mockResolvedValue(loaded);
    expect(await loadBuilderPropArt(HandSide.LEFT, {})).toBe(loaded);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/features/assemble-lab/services/builder-prop-art.test.ts`

Expected: FAIL, because `./builder-prop-art` does not exist.

- [ ] **Step 3: Write the prop artwork service**

Create `src/lib/features/assemble-lab/services/builder-prop-art.ts`:

```ts
/**
 * The prop artwork Assemble's grid draws for each hand: the user's prop type
 * and look, fan build and triangle grip, painted in the user's hand color.
 * InteractiveGrid draws it on Assemble's grid, and the Create front door's
 * Assemble preview draws the same artwork.
 *
 * Trust boundary: callers inject svgData.svgContent with {@html}. It comes
 * from propSvgLoader (bundled static prop SVGs), never user or external
 * input.
 */
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { normalizeFanAppearance } from "$lib/shared/pictograph/prop/domain/fan-appearance";
import type { PropRenderData } from "$lib/shared/pictograph/prop/domain/models/prop-render-data";
import { applyHandColorOverride } from "$lib/shared/pictograph/prop/domain/prop-preview-color";
import { normalizePropLook } from "$lib/shared/pictograph/prop/domain/prop-look";
import { normalizeTriangleGrip } from "$lib/shared/pictograph/prop/domain/triangle-appearance";
import { propSvgLoader } from "$lib/shared/pictograph/prop/services/prop-svg-loader";
import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { AppSettings } from "$lib/shared/settings/domain/app-settings";

/** The settings Assemble's prop artwork follows. */
export type BuilderPropSettings = Pick<
  AppSettings,
  | "leftPropType"
  | "rightPropType"
  | "primaryPropColors"
  | "propArtwork"
  | "fanAppearance"
  | "triangleGrip"
>;

/** The prop type a hand holds. */
export function builderPropType(
  settings: BuilderPropSettings,
  hand: HandSide
): PropType {
  return (
    (hand === HandSide.LEFT ? settings.leftPropType : settings.rightPropType) ??
    PropType.STAFF
  );
}

/**
 * Load one hand's artwork. Every setting is read before the first await, and
 * the loader reads the theme before its own, so an effect that calls this
 * reloads the artwork whenever any of them changes.
 */
export async function loadBuilderPropArt(
  hand: HandSide,
  settings: BuilderPropSettings
): Promise<PropRenderData> {
  const propType = builderPropType(settings, hand);
  const color =
    hand === HandSide.LEFT
      ? settings.primaryPropColors?.left
      : settings.primaryPropColors?.right;
  // Draw the look the pictographs draw (PictographContainer passes the
  // same options), so the stage and the Start pictograph show one prop.
  const appearance = {
    propLook: normalizePropLook(settings.propArtwork),
    fanAppearance: normalizeFanAppearance(settings.fanAppearance),
    triangleGrip: normalizeTriangleGrip(settings.triangleGrip),
  };
  const data = await propSvgLoader.loadPropSvg(
    { positionX: 0, positionY: 0, rotationAngle: 0 },
    createMotionData({ propType, hand }),
    false,
    appearance
  );
  // The loader paints the default hand color. Repaint with the user's chosen
  // color so the stage matches the pictographs (PropSvg does the same).
  if (!color || !data.svgData) return data;
  return {
    ...data,
    svgData: {
      ...data.svgData,
      svgContent: applyHandColorOverride(
        data.svgData.svgContent,
        hand,
        propType,
        color
      ),
    },
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/features/assemble-lab/services/builder-prop-art.test.ts`

Expected: PASS (4 tests).

- [ ] **Step 5: Point the Assemble grid at the shared code**

In `src/lib/features/assemble-lab/services/svg-prop-animator.ts`, edit by hand. After the line `const GRID_RADIUS = 143.1; // distance from center to hand points`, add a blank line and:

```ts
/** One builder hop: a tap on Assemble's grid, and the Create front door's Assemble preview. */
export const BUILDER_HOP_MS = 400;
```

In `src/lib/features/assemble-lab/components/InteractiveGrid.svelte`, make four edits.

1. Replace the animator import:

```ts
  import {
    getBuilderMotionPathD,
    SvgPropAnimator,
  } from "../services/svg-prop-animator";
```

with:

```ts
  import {
    BUILDER_HOP_MS,
    getBuilderMotionPathD,
    SvgPropAnimator,
  } from "../services/svg-prop-animator";
```

2. Replace the trust-boundary comment and the six prop imports under it:

```ts
  // Prop SVG rendering.
  // Trust boundary: svgData.svgContent below is injected via {@html}. The source
  // is this internal propSvgLoader service (bundled static prop SVGs), never user
  // or external input, so it is a trusted, non-XSS surface — no sanitization pass.
  import { propSvgLoader } from "$lib/shared/pictograph/prop/services/prop-svg-loader";
  import { applyHandColorOverride } from "$lib/shared/pictograph/prop/domain/prop-preview-color";
  import { normalizePropLook } from "$lib/shared/pictograph/prop/domain/prop-look";
  import { normalizeFanAppearance } from "$lib/shared/pictograph/prop/domain/fan-appearance";
  import { normalizeTriangleGrip } from "$lib/shared/pictograph/prop/domain/triangle-appearance";
  import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
```

with:

```ts
  // Prop SVG rendering.
  // Trust boundary: svgData.svgContent below is injected via {@html}. The source
  // is loadBuilderPropArt, which reads the internal propSvgLoader service
  // (bundled static prop SVGs), never user or external input, so it is a
  // trusted, non-XSS surface with no sanitization pass.
  import { loadBuilderPropArt } from "../services/builder-prop-art";
```

Leave the imports after them (`PropRotAngleManager` through `motionDuration`) as they are; `getSettings`, `PropType`, and `PropRenderData` are still used.

3. Replace:

```ts
  // Animation duration in ms
  const ANIMATION_DURATION_MS = 400;
```

with:

```ts
  // One builder hop (svg-prop-animator.ts owns its length)
  const ANIMATION_DURATION_MS = BUILDER_HOP_MS;
```

4. Keep the `currentLeftPropType` and `currentRightPropType` deriveds. Delete everything after them from the comment `// The loader paints the default hand color. Repaint with the user's chosen` (the `withUserColor` function) through the closing `});` of the effect that begins with `// Load prop SVGs reactively when prop type, look or hand color changes in settings`, and put this in its place:

```ts
  // Load each hand's prop artwork, and reload it when the prop type, look or
  // hand color changes in settings: loadBuilderPropArt reads them all before
  // it waits, so this effect tracks every one.
  $effect(() => {
    const settings = getSettings();
    loadBuilderPropArt(HandSide.LEFT, settings)
      .then((data) => {
        leftPropData = data;
      })
      .catch(() => {
        /* SVG unavailable; fallback circle renders */
      });
    loadBuilderPropArt(HandSide.RIGHT, settings)
      .then((data) => {
        rightPropData = data;
      })
      .catch(() => {
        /* SVG unavailable; fallback circle renders */
      });
  });
```

Check that nothing else in the file uses the removed names. Each command prints nothing:

```bash
cd /e/worktrees/tka-platform/create-method-previews
grep -n "withUserColor\|createMotionData\|normalizePropLook\|normalizeFanAppearance\|normalizeTriangleGrip\|applyHandColorOverride\|propSvgLoader\.\|import { propSvgLoader" src/lib/features/assemble-lab/components/InteractiveGrid.svelte
grep -n "= 400;" src/lib/features/assemble-lab/components/InteractiveGrid.svelte
```

- [ ] **Step 6: Test, format, type check, and commit the refactor**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/features/assemble-lab`

Expected: PASS, the 4 new tests and every existing assemble-lab test, including `svg-prop-animator.test.ts`. If an existing test fails, run the same file in the primary checkout (`cd /e/tka-platform`, read-only) before changing anything: a failure there too is not this task's, so note it for the final report and continue.

```bash
cd /e/tka-platform && npx prettier --write /e/worktrees/tka-platform/create-method-previews/src/lib/features/assemble-lab/services/builder-prop-art.ts /e/worktrees/tka-platform/create-method-previews/src/lib/features/assemble-lab/services/builder-prop-art.test.ts /e/worktrees/tka-platform/create-method-previews/src/lib/features/assemble-lab/components/InteractiveGrid.svelte
```

Run `npm run check:fast` in the worktree (after the svelte-check gate). Expected: no errors in `builder-prop-art.ts`, `InteractiveGrid.svelte`, or `svg-prop-animator.ts`.

Look over `git diff -- src/lib/features/assemble-lab/components/InteractiveGrid.svelte` once: Prettier must have changed only the lines you edited. Then commit:

```bash
cd /e/worktrees/tka-platform/create-method-previews
git status --short
git add -- src/lib/features/assemble-lab/services/builder-prop-art.ts src/lib/features/assemble-lab/services/builder-prop-art.test.ts src/lib/features/assemble-lab/components/InteractiveGrid.svelte src/lib/features/assemble-lab/services/svg-prop-animator.ts
git commit -m "refactor(assemble): share the grid's prop artwork and hop length" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/features/assemble-lab/services/builder-prop-art.ts src/lib/features/assemble-lab/services/builder-prop-art.test.ts src/lib/features/assemble-lab/components/InteractiveGrid.svelte src/lib/features/assemble-lab/services/svg-prop-animator.ts
```

This step has no browser check. The Assemble tool and Fuse's path builder (`FusePathBuilderDialog`, the other screen that draws `InteractiveGrid`) both need an account, and agents never sign in. Step 15 loads the same artwork through the same service on the bench, and Task 21 looks at the real Assemble tool on the primary server after integration when the agent browser is already signed in there. The final report says how the tool was checked.

- [ ] **Step 7: Write the failing Assemble test**

Create `tests/unit/create/method-preview-assemble.test.ts`:

```ts
/**
 * The Create front door's Assemble preview: the hops come from Assemble's own
 * sequence loader, the crop keeps every grid point whole, and the finger's
 * taps land on Assemble's own hit targets. The beats fit four taps and the
 * last hop into a turn.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { deriveBuilderMotionGeometry } from "$lib/features/assemble-lab/services/builder-motion-geometry";
import { BUILDER_HOP_MS } from "$lib/features/assemble-lab/services/svg-prop-animator";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  HandSide,
  Orientation,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { METHOD_PREVIEW_TIMING } from "$lib/features/create/shared/state/method-preview-turns.svelte";
import {
  ASSEMBLE_CROP,
  ASSEMBLE_STEPS,
  ASSEMBLE_VIEW_BOX,
  assembleHops,
  assemblePoint,
  standingHop,
} from "$lib/features/create/shared/components/method-previews/method-preview-assemble";
import { DEMO_SEQUENCE } from "$lib/features/create/shared/components/method-previews/method-preview-demo";
import { SCENE_TAP } from "$lib/features/create/shared/components/method-previews/method-preview-run";

/** The attract ghost's shortest glide (attract-ghost.svelte.ts). */
const SHORTEST_GLIDE_MS = 300;

function at(x: number, y: number, size: number) {
  return { x, y, size };
}

function expectPoint(
  point: { x: number; y: number } | null,
  x: number,
  y: number
): void {
  expect(point).not.toBeNull();
  expect(point?.x).toBeCloseTo(x, 2);
  expect(point?.y).toBeCloseTo(y, 2);
}

describe("Assemble preview hops", () => {
  it("are the demo's N and M steps, blue then red", () => {
    expect(assembleHops(DEMO_SEQUENCE, HandSide.LEFT)).toEqual([
      {
        startLocation: GridLocation.EAST,
        endLocation: GridLocation.NORTH,
        rotationDirection: RotationDirection.CLOCKWISE,
        turnCount: 1,
        startOrientation: Orientation.IN,
        endOrientation: Orientation.IN,
      },
      {
        startLocation: GridLocation.NORTH,
        endLocation: GridLocation.EAST,
        rotationDirection: RotationDirection.CLOCKWISE,
        turnCount: 0,
        startOrientation: Orientation.IN,
        endOrientation: Orientation.IN,
      },
    ]);
    expect(assembleHops(DEMO_SEQUENCE, HandSide.RIGHT)).toEqual([
      {
        startLocation: GridLocation.SOUTH,
        endLocation: GridLocation.WEST,
        rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
        turnCount: 1,
        startOrientation: Orientation.IN,
        endOrientation: Orientation.IN,
      },
      {
        startLocation: GridLocation.WEST,
        endLocation: GridLocation.SOUTH,
        rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
        turnCount: 1,
        startOrientation: Orientation.IN,
        endOrientation: Orientation.OUT,
      },
    ]);
  });

  it("bring blue back to the pose it started in, so the ghost starts where blue ended", () => {
    const [first, last] = assembleHops(DEMO_SEQUENCE, HandSide.LEFT);
    expect(last?.endLocation).toBe(first?.startLocation);
    expect(last?.endOrientation).toBe(first?.startOrientation);
  });

  it("read a float the way Assemble does", () => {
    const floated: SequenceData = {
      ...DEMO_SEQUENCE,
      steps: DEMO_SEQUENCE.steps.map((step, index) => {
        const left = step.motions[HandSide.LEFT];
        if (index !== ASSEMBLE_STEPS.from || !left) return step;
        return {
          ...step,
          motions: {
            ...step.motions,
            [HandSide.LEFT]: { ...left, turns: "fl" as const },
          },
        };
      }),
    };
    expect(assembleHops(floated, HandSide.LEFT)[0]?.turnCount).toBe(-0.5);
  });

  it("can stand a prop on its start pose", () => {
    const [first] = assembleHops(DEMO_SEQUENCE, HandSide.RIGHT);
    expect(first).toBeDefined();
    const hop = standingHop(first!);
    expect(hop).toMatchObject({
      startLocation: GridLocation.SOUTH,
      endLocation: GridLocation.SOUTH,
      turnCount: 0,
      startOrientation: Orientation.IN,
      endOrientation: Orientation.IN,
    });
    const geometry = deriveBuilderMotionGeometry(
      hop.startLocation,
      hop.endLocation,
      hop.startOrientation,
      hop.rotationDirection,
      hop.turnCount
    );
    expect(geometry.isSamePoint).toBe(true);
    expect(geometry.staffRotationDelta).toBeCloseTo(0);
  });
});

describe("Assemble preview grid", () => {
  it("crops to the grid with every point whole", () => {
    expect(ASSEMBLE_VIEW_BOX).toBe("135 135 680 680");
    const svg = readFileSync(
      resolve(process.cwd(), "static/images/grid/diamond_grid.svg"),
      "utf8"
    );
    const circles = [...svg.matchAll(/<circle\b[^>]*>/g)].map(([tag]) => {
      const read = (name: string) =>
        Number(new RegExp(`\\b${name}="([\\d.]+)"`).exec(tag)?.[1]);
      return { cx: read("cx"), cy: read("cy"), r: read("r") };
    });
    expect(circles.length).toBeGreaterThan(0);
    const low = ASSEMBLE_CROP.origin;
    const high = ASSEMBLE_CROP.origin + ASSEMBLE_CROP.size;
    for (const { cx, cy, r } of circles) {
      expect(Math.min(cx, cy) - r).toBeGreaterThanOrEqual(low);
      expect(Math.max(cx, cy) + r).toBeLessThanOrEqual(high);
    }
  });

  it("places Assemble's points in the card", () => {
    const square = at(0, 0, 200);
    expectPoint(assemblePoint(square, GridLocation.NORTH), 100, 57.91);
    expectPoint(assemblePoint(square, GridLocation.EAST), 142.09, 100);
    expectPoint(assemblePoint(square, GridLocation.SOUTH), 100, 142.09);
    expectPoint(assemblePoint(square, GridLocation.WEST), 57.91, 100);
    expectPoint(assemblePoint(at(49, 0, 48), GridLocation.NORTH), 73, 13.9);
  });

  it("has no point the diamond lacks", () => {
    expect(assemblePoint(at(0, 0, 200), GridLocation.NORTHEAST)).toBeNull();
  });
});

describe("Assemble preview beats", () => {
  it("lets each hop land before the finger presses again", () => {
    expect(SHORTEST_GLIDE_MS + SCENE_TAP.considerMs).toBeGreaterThanOrEqual(
      BUILDER_HOP_MS
    );
  });

  it("fits four taps and the last hop in a turn, with room for slower glides", () => {
    const tap = SHORTEST_GLIDE_MS + SCENE_TAP.considerMs + SCENE_TAP.pressMs;
    expect(4 * tap + BUILDER_HOP_MS).toBeLessThanOrEqual(
      METHOD_PREVIEW_TIMING.turnMs - 300
    );
  });
});
```

The 300 ms left over is for slower glides: the finger glides up to about a quarter longer in big boxes, so the scene finishes inside its turn in boxes up to about 296 px. A larger card gets cut at the end of its turn, which fades to the finished picture.

- [ ] **Step 8: Run it to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/create/method-preview-assemble.test.ts`

Expected: FAIL, because `method-preview-assemble` does not exist.

- [ ] **Step 9: Write the Assemble module**

Create `src/lib/features/create/shared/components/method-previews/method-preview-assemble.ts`:

```ts
/**
 * The Create front door's Assemble preview: the steps it builds, the crop of
 * Assemble's grid it shows, and where the grid's points sit in the card
 * (spec: Scenes, Assemble).
 *
 * The hops come from Assemble's own sequence loader, so a float reads as
 * Assemble's float (-0.5 turns) and the props move exactly as they do on
 * Assemble's grid. They are the demo's N and M steps: in the opening steps
 * red stands still (Y), so it would add no points.
 */
import { sequenceToBuilderHydration } from "$lib/features/assemble-lab/services/builder-step-converter";
import type { BuilderStep } from "$lib/features/assemble-lab/state/assemble-state-types";
import { getHitTargets } from "$lib/shared/assemble-lab/services/grid-hit-target-calculator";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  GridMode,
  type GridLocation,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type { CellRect } from "./method-preview-compositions";

/** The demo steps Assemble builds: N and M (steps 4 and 5). */
export const ASSEMBLE_STEPS = Object.freeze({ from: 3, count: 2 });

/** The center of Assemble's 950-unit grid space (SvgPropAnimator, the hit targets). */
const GRID_CENTER = 475;
/** The grid's outer points sit 300 units out with a 25-unit radius; 15 more is margin. */
const CROP_HALF = 340;

/** The square of Assemble's grid space the card shows. */
export const ASSEMBLE_CROP = Object.freeze({
  origin: GRID_CENTER - CROP_HALF,
  size: CROP_HALF * 2,
});

export const ASSEMBLE_VIEW_BOX = `${ASSEMBLE_CROP.origin} ${ASSEMBLE_CROP.origin} ${ASSEMBLE_CROP.size} ${ASSEMBLE_CROP.size}`;

/** One hand's hops over the steps Assemble builds, as Assemble loads them. */
export function assembleHops(
  sequence: SequenceData,
  hand: HandSide
): BuilderStep[] {
  const { leftSteps, rightSteps } = sequenceToBuilderHydration(sequence);
  const steps = hand === HandSide.LEFT ? leftSteps : rightSteps;
  return steps.slice(
    ASSEMBLE_STEPS.from,
    ASSEMBLE_STEPS.from + ASSEMBLE_STEPS.count
  );
}

/** A hop that stays on its start point with no turns: the prop's start pose. */
export function standingHop(hop: BuilderStep): BuilderStep {
  return {
    ...hop,
    endLocation: hop.startLocation,
    endOrientation: hop.startOrientation,
    turnCount: 0,
  };
}

/**
 * Where a diamond point sits in the card, given the box the grid fills. Null
 * when the diamond has no such point.
 */
export function assemblePoint(
  box: CellRect,
  location: GridLocation
): { x: number; y: number } | null {
  const target = getHitTargets(GridMode.DIAMOND).find(
    (candidate) => candidate.location === location
  );
  if (!target) return null;
  const scale = box.size / ASSEMBLE_CROP.size;
  return {
    x: box.x + (target.x - ASSEMBLE_CROP.origin) * scale,
    y: box.y + (target.y - ASSEMBLE_CROP.origin) * scale,
  };
}
```

- [ ] **Step 10: Run it to verify it passes**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/create/method-preview-assemble.test.ts`

Expected: PASS (9 tests).

- [ ] **Step 11: Write the Assemble scene**

Create `src/lib/features/create/shared/components/method-previews/AssembleScene.svelte`:

```svelte
<script lang="ts">
  /**
   * AssembleScene
   *
   * Mirrors: Assemble. The grid is Assemble's own GridSvg (diamond), cropped
   * to its points and framed like Assemble's builder. The props are the
   * artwork Assemble's grid draws (loadBuilderPropArt: the user's prop type,
   * look and hand colors), and every hop is Assemble's own arc motion
   * (SvgPropAnimator, one builder hop long). The hops are the demo's N and M
   * steps, read through Assemble's own sequence loader (assembleHops).
   *
   * Blue adds its points first: the finger taps each point and blue hops to
   * it, glowing like InteractiveGrid's active prop. Then the hands switch:
   * blue stays on its start point as InteractiveGrid's dimmed ghost, red
   * appears on its own start point, and as red hops to each tapped point the
   * ghost repeats blue's hop for that beat, as InteractiveGrid animates its
   * ghost. The props begin on their start points, as after each hand's first
   * tap: a turn has room for four taps, not six. Rest poses come from the
   * same animator at zero length, so nothing jumps when a hop lands.
   *
   * InteractiveGrid itself is not reused: it takes taps and needs a live
   * Assemble state.
   *
   * Finished picture: as on Assemble's Complete phase, both props rest on
   * their final points (blue on east, red on south) at InteractiveGrid's prop
   * opacity. Long props (600-unit artwork) are clipped at the frame.
   */
  import { onDestroy } from "svelte";
  import { loadBuilderPropArt } from "$lib/features/assemble-lab/services/builder-prop-art";
  import {
    BUILDER_HOP_MS,
    SvgPropAnimator,
  } from "$lib/features/assemble-lab/services/svg-prop-animator";
  import type { BuilderStep } from "$lib/features/assemble-lab/state/assemble-state-types";
  import { getSettings } from "$lib/shared/application/state/app-state.svelte";
  import type { GhostState } from "$lib/shared/attract/services/attract-ghost.svelte";
  import GridSvg from "$lib/shared/pictograph/grid/components/GridSvg.svelte";
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import type { PropRenderData } from "$lib/shared/pictograph/prop/domain/models/prop-render-data";
  import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import MethodPreviewFinger from "./MethodPreviewFinger.svelte";
  import {
    ASSEMBLE_VIEW_BOX,
    assembleHops,
    assemblePoint,
    standingHop,
  } from "./method-preview-assemble";
  import { assembleLayout } from "./method-preview-compositions";
  import { DEMO_SEQUENCE } from "./method-preview-demo";
  import {
    placeGhost,
    sceneGhost,
    tapAt,
    type SceneRun,
  } from "./method-preview-run";
  import { playSceneTurns } from "./method-preview-scene-turns.svelte";
  import type { MethodPreviewSceneProps } from "./method-preview-scenes";

  // Trust boundary: the artwork below is injected with {@html}. It comes from
  // loadBuilderPropArt, which reads propSvgLoader's bundled static prop SVGs,
  // never user or external input (InteractiveGrid's own note).

  let { playing, turn, width, height, accent, onready }: MethodPreviewSceneProps =
    $props();

  /** InteractiveGrid's fallback circle, shown when a prop's artwork is missing. */
  const FALLBACK_RADIUS = 28;

  const blueHops = assembleHops(DEMO_SEQUENCE, HandSide.LEFT);
  const redHops = assembleHops(DEMO_SEQUENCE, HandSide.RIGHT);
  const blueAnimator = new SvgPropAnimator();
  const redAnimator = new SvgPropAnimator();

  let root = $state<HTMLElement | null>(null);
  let pose = $state.raw<GhostState | null>(null);
  /** rest: the finished picture. blue, red: that hand is adding its points. */
  let phase = $state<"rest" | "blue" | "red">("rest");
  let gridLoaded = $state(false);
  let blueArt = $state.raw<PropRenderData | null>(null);
  let redArt = $state.raw<PropRenderData | null>(null);
  let blueSettled = $state(false);
  let redSettled = $state(false);
  let blueGroup = $state<SVGGElement | null>(null);
  let redGroup = $state<SVGGElement | null>(null);

  const layout = $derived(assembleLayout(width, height));

  let running = false;
  let announced = false;

  onDestroy(() => {
    blueAnimator.cancel();
    redAnimator.cancel();
  });

  // The artwork Assemble's grid draws, reloaded when the prop settings change.
  $effect(() => {
    const settings = getSettings();
    let current = true;
    loadBuilderPropArt(HandSide.LEFT, settings)
      .then((data) => {
        if (current) blueArt = data;
      })
      .catch(() => {
        /* SVG unavailable; the fallback circle shows */
      })
      .finally(() => {
        if (current) blueSettled = true;
      });
    loadBuilderPropArt(HandSide.RIGHT, settings)
      .then((data) => {
        if (current) redArt = data;
      })
      .catch(() => {
        /* SVG unavailable; the fallback circle shows */
      })
      .finally(() => {
        if (current) redSettled = true;
      });
    return () => {
      current = false;
    };
  });

  /** Where a prop's artwork turns about: 0,0 for the fallback circle. */
  function centerOf(art: PropRenderData | null): { x: number; y: number } {
    return art?.svgData?.center ?? { x: 0, y: 0 };
  }

  /** Stand a prop on the start or the end of a hand's hops, at once. */
  function place(
    animator: SvgPropAnimator,
    element: SVGGElement | null,
    hops: readonly BuilderStep[],
    art: PropRenderData | null,
    at: "start" | "end"
  ): void {
    const hop = at === "start" ? hops[0] : hops.at(-1);
    if (!element || !hop) return;
    void animator.animate({
      ...(at === "start" ? standingHop(hop) : hop),
      element,
      durationMs: 0,
      propCenter: centerOf(art),
    });
  }

  /** The finished picture: both props on their final points. */
  function placeFinished(): void {
    place(blueAnimator, blueGroup, blueHops, blueArt, "end");
    place(redAnimator, redGroup, redHops, redArt, "end");
  }

  // Show the finished picture before the first turn, and again when new
  // artwork arrives between turns. The card is ready once the grid and both
  // props are in.
  $effect(() => {
    if (!gridLoaded || !blueSettled || !redSettled) return;
    if (!blueGroup || !redGroup) return;
    // Read before the running check, so new artwork reruns this at rest.
    void blueArt;
    void redArt;
    if (running) return;
    placeFinished();
    if (announced) return;
    announced = true;
    onready();
  });

  function settle(): void {
    blueAnimator.cancel();
    redAnimator.cancel();
    running = false;
    pose = null;
    phase = "rest";
    placeFinished();
  }

  async function play(run: SceneRun): Promise<void> {
    const box = layout;
    const blue = blueGroup;
    const red = redGroup;
    if (!box || !blue || !red) return;
    running = true;
    // The clear: red fades out, and blue stands on its start point.
    phase = "blue";
    place(blueAnimator, blue, blueHops, blueArt, "start");
    const finger = sceneGhost(run, () => root);
    pose = finger.ghost;
    const first = blueHops[0];
    const start = first ? assemblePoint(box, first.startLocation) : null;
    if (start) placeGhost(finger, start.x, start.y);

    // Blue adds its points: each tap sends blue along Assemble's arc.
    let landed: Promise<void> = Promise.resolve();
    for (const step of blueHops) {
      const point = assemblePoint(box, step.endLocation);
      if (!point || !(await tapAt(finger, run, point.x, point.y))) return;
      landed = blueAnimator.animate({
        ...step,
        element: blue,
        durationMs: BUILDER_HOP_MS,
        propCenter: centerOf(blueArt),
      });
    }

    // The hands switch once blue lands: blue stays on its start point as the
    // dimmed ghost, and red appears on its own.
    const switched = landed.then(() => {
      if (run.aborted) return;
      place(blueAnimator, blue, blueHops, blueArt, "start");
      place(redAnimator, red, redHops, redArt, "start");
      phase = "red";
    });

    // Red adds its points, and the ghost repeats blue's hop for that beat.
    let last: Promise<unknown> = switched;
    for (const [index, step] of redHops.entries()) {
      const point = assemblePoint(box, step.endLocation);
      if (!point || !(await tapAt(finger, run, point.x, point.y))) return;
      await switched;
      if (run.aborted) return;
      const ghost = blueHops[index];
      last = Promise.all([
        redAnimator.animate({
          ...step,
          element: red,
          durationMs: BUILDER_HOP_MS,
          propCenter: centerOf(redArt),
        }),
        ghost
          ? blueAnimator.animate({
              ...ghost,
              element: blue,
              durationMs: BUILDER_HOP_MS,
              propCenter: centerOf(blueArt),
            })
          : undefined,
      ]);
    }
    finger.ghost.visible = false;
    await last;
    if (run.aborted) return;
    settle();
  }

  playSceneTurns(() => ({ playing, turn }), play, {
    root: () => root,
    settle,
  });
</script>

<div class="scene" bind:this={root} style:--accent={accent} data-phase={phase}>
  {#if layout}
    <svg
      class="grid"
      viewBox={ASSEMBLE_VIEW_BOX}
      style:left="{layout.x}px"
      style:top="{layout.y}px"
      style:width="{layout.size}px"
      style:height="{layout.size}px"
      aria-hidden="true"
    >
      <GridSvg
        gridMode={GridMode.DIAMOND}
        onLoaded={() => (gridLoaded = true)}
        onError={(message) =>
          console.warn("[method preview] Assemble could not load its grid", message)}
      />
      <g class="prop blue" bind:this={blueGroup}>
        <g class="art">
          {#if blueArt?.svgData}
            {@html blueArt.svgData.svgContent}
          {:else}
            <circle r={FALLBACK_RADIUS} class="fallback" />
          {/if}
        </g>
      </g>
      <g class="prop red" bind:this={redGroup}>
        <g class="art">
          {#if redArt?.svgData}
            {@html redArt.svgData.svgContent}
          {:else}
            <circle r={FALLBACK_RADIUS} class="fallback" />
          {/if}
        </g>
      </g>
    </svg>
  {/if}
  <MethodPreviewFinger {pose} />
</div>

<style>
  .scene {
    position: relative;
    width: 100%;
    height: 100%;
  }

  /* Assemble's builder frame (InteractiveGrid's border), on a corner scaled
     to the card. The outline keeps the grid's box the size the points were
     placed for. */
  .grid {
    position: absolute;
    display: block;
    overflow: hidden;
    border-radius: 12%;
    outline: 1px solid
      var(
        --assemble-builder-stroke,
        var(--theme-stroke, rgba(255, 255, 255, 0.12))
      );
    outline-offset: -1px;
  }

  /* InteractiveGrid's prop opacity at rest (its Complete phase). The
     animator owns each prop's transform, so only opacity transitions. */
  .prop {
    opacity: 0.85;
    pointer-events: none;
    transition: opacity var(--duration-fast, 150ms) ease-out;
  }

  /* The hand adding its points shows at full strength and glows, like
     InteractiveGrid's active prop. */
  .scene[data-phase="blue"] .prop.blue,
  .scene[data-phase="red"] .prop.red {
    opacity: 1;
  }

  .scene[data-phase="blue"] .prop.blue .art {
    filter: drop-shadow(0 0 6px var(--prop-blue, #2e8bf0));
  }

  .scene[data-phase="red"] .prop.red .art {
    filter: drop-shadow(0 0 6px var(--prop-red, #ed1c24));
  }

  /* Red has no points yet while blue adds its own. */
  .scene[data-phase="blue"] .prop.red {
    opacity: 0;
  }

  /* InteractiveGrid's dimmed ghost. */
  .scene[data-phase="red"] .prop.blue {
    opacity: 0.35;
  }

  .prop.blue .fallback {
    fill: var(--prop-blue, #2e8bf0);
  }

  .prop.red .fallback {
    fill: var(--prop-red, #ed1c24);
  }
</style>
```

The beats at the shortest glides, from the start of the turn: the finger appears on blue's start point (east) and taps north at 560 ms, and blue hops there by 960. It taps east at 1120, and blue hops back by 1520, when the hands switch; the finger is already on west by then. It taps west at 1680 (red and the ghost hop until 2080) and south at 2240, and the last hops land at 2640, when the scene settles.

Why the art reads come before `if (running) return;`: an effect tracks only what its last run read. Without them, a run that returned early during a turn would leave the effect deaf to new artwork after the turn.

Why `await switched` sits inside the loop: the finger may finish tapping red's first point before blue's last hop lands; red never moves before the hands switch.

A grid that fails to load leaves the card unready, so the turns pass it by, as they do any card that is not ready.

- [ ] **Step 12: Register the scene and require all six**

In `method-preview-scenes.ts`, replace the registry with:

```ts
/** Create method id (CREATE_TABS) to its scene module. */
export const METHOD_PREVIEW_SCENES: Readonly<
  Record<string, () => Promise<MethodPreviewSceneModule>>
> = {
  construct: () => import("./ConstructScene.svelte"),
  generate: () => import("./GenerateScene.svelte"),
  "shape-engine": () => import("./ShapeScene.svelte"),
  fuse: () => import("./FuseScene.svelte"),
  tunnel: () => import("./TunnelScene.svelte"),
  assemble: () => import("./AssembleScene.svelte"),
};
```

If Task 14 took the ring fallback, keep its line instead: `tunnel: () => import("./TunnelRingScene.svelte"),`.

Replace the whole of `tests/unit/create/method-preview-scenes.test.ts` with:

```ts
/**
 * Every Create method has a preview scene, keyed by its method id, and every
 * scene belongs to a real Create method.
 */
import { describe, expect, it } from "vitest";
import { CREATE_TABS } from "$lib/shared/navigation/config/tab-definitions";
import { METHOD_PREVIEW_SCENES } from "$lib/features/create/shared/components/method-previews/method-preview-scenes";

describe("method preview scene registry", () => {
  it("has a scene for every Create method, and only those", () => {
    expect(Object.keys(METHOD_PREVIEW_SCENES).sort()).toEqual(
      CREATE_TABS.map((tab) => tab.id).sort()
    );
  });
});
```

- [ ] **Step 13: Run the registry, contract, and Assemble tests**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/create/method-preview-scenes.test.ts tests/unit/create/method-preview-scene-contract.test.ts tests/unit/create/method-preview-assemble.test.ts`

Expected: PASS (1 registry test, 1 contract test, 9 Assemble tests). The contract test now reads all six scene files.

- [ ] **Step 14: Format and type check**

```bash
cd /e/tka-platform && npx prettier --write /e/worktrees/tka-platform/create-method-previews/src/lib/features/create/shared/components/method-previews/method-preview-assemble.ts /e/worktrees/tka-platform/create-method-previews/src/lib/features/create/shared/components/method-previews/AssembleScene.svelte /e/worktrees/tka-platform/create-method-previews/src/lib/features/create/shared/components/method-previews/method-preview-scenes.ts /e/worktrees/tka-platform/create-method-previews/tests/unit/create/method-preview-assemble.test.ts /e/worktrees/tka-platform/create-method-previews/tests/unit/create/method-preview-scenes.test.ts
```

Run `npm run check:fast` in the worktree (after the svelte-check gate). Expected: no errors in the new or changed files.

- [ ] **Step 15: Check Assemble on the bench**

Reload [http://localhost:5191/test/create-method-previews](http://localhost:5191/test/create-method-previews) in the agent Chrome. Assemble is the sixth row of the Sizes view, so its boxes are `.bench-box` 20 to 23. Once they have faded in from the tint, run with `evaluate_script`:

```js
() =>
  [...document.querySelectorAll(".bench-box")]
    .slice(20, 24)
    .map((box) => [
      box.querySelectorAll(".grid-container").length,
      box.querySelectorAll(".prop").length,
      box.querySelectorAll(".prop .fallback").length,
      [...box.querySelectorAll(".prop")].every((prop) =>
        prop.style.transform.startsWith("translate(")
      ),
      box.querySelectorAll(
        "button, a[href], input, select, textarea, [tabindex]"
      ).length,
    ])
```

Expected: `[[1, 2, 0, true, 0], [1, 2, 0, true, 0], [1, 2, 0, true, 0], [1, 2, 0, true, 0]]`. Each box holds one grid and two props, both props drew their artwork (no fallback circle), the animator placed them, and the scene offers no controls.

Use `wait_for` on the text `assemble ·`, then at once run this observer:

```js
async () => {
  const scenes = [...document.querySelectorAll(".bench-box")]
    .slice(20, 24)
    .map((box) => box.querySelector(".scene"));
  const seen = scenes.map((scene) => [scene?.dataset.phase]);
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      const index = scenes.indexOf(record.target);
      if (index >= 0) seen[index].push(record.target.dataset.phase);
    }
  });
  for (const scene of scenes) {
    if (scene) {
      observer.observe(scene, {
        attributes: true,
        attributeFilter: ["data-phase"],
      });
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 3200));
  observer.disconnect();
  return seen.map((values) => values.join(">"));
}
```

Expected: `["blue>red>rest", "blue>red>rest", "blue>red>rest", "blue>red>rest"]`. A leading `rest>` is fine if the observer started before the turn. Every box added blue's points, switched hands, and settled inside the turn.

Then run:

```js
() =>
  [...document.querySelectorAll(".bench-box")]
    .slice(20, 24)
    .map((box) => {
      const at = (prop) =>
        prop.style.transform
          .match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/)
          ?.slice(1, 3)
          .map((value) => Number(value).toFixed(1))
          .join(",");
      return [
        box.querySelector(".scene").dataset.phase,
        [...box.querySelectorAll(".prop")]
          .map((prop) => getComputedStyle(prop).opacity)
          .join(" "),
        at(box.querySelector(".prop.blue")),
        at(box.querySelector(".prop.red")),
      ];
    })
```

Expected: every box gives `["rest", "0.85 0.85", "618.1,475.0", "475.0,618.1"]`: the finished picture, blue on the east point and red on the south point.

When the second round reaches Assemble, `wait_for` the text `assemble ·` again, take a screenshot of the Assemble row at once, and another about 1.5 seconds later. Expected: in the first, the grid's four hand points and four outer points sit whole inside each box's frame, red is gone, blue glows on the east point or partway along its arc, and the compact finger is on the grid; in the second, red glows on or between the west and south points and blue is the dim ghost. Zoom one screenshot on the 200×200 box: the props are the default staffs in blue and red, and the finger presses on grid points. The console shows no errors and no `Assemble could not load its grid`.

- [ ] **Step 16: Screen the cost**

1. Check that DevTools MCP `emulate` has `cpuThrottlingRate: 1`. Reload the bench, `wait_for` the text `assemble ·`, and at once run the frame-rate probe (Before You Start) with `evaluate_script`. Expected: 57 or more.
2. Set `cpuThrottlingRate: 4`, reload, `wait_for` the text `assemble ·`, and at once run this turn probe, which records only the frames of Assemble's turn:

```js
async () => {
  const start = performance.now();
  const frames = [];
  const observer = new PerformanceObserver((list) =>
    frames.push(...list.getEntries())
  );
  observer.observe({ type: "long-animation-frame" });
  await new Promise((resolve) => setTimeout(resolve, 3000));
  observer.disconnect();
  return frames
    .filter((frame) => frame.blockingDuration > 0)
    .map((frame) => ({
      at: Math.round(frame.startTime - start),
      ms: Math.round(frame.duration),
      blocking: Math.round(frame.blockingDuration),
      scripts: frame.scripts.map(
        (script) =>
          `${Math.round(script.duration)}ms ${script.invokerType} ${script.sourceFunctionName || script.invoker} ${script.sourceURL}`
      ),
    }));
}
```

Expected: no frame lists a script from `AssembleScene`, `svg-prop-animator`, `builder-prop-art`, `GridSvg`, `prop-svg-loader`, or `method-preview`. Set `cpuThrottlingRate: 1` again. A frame that lists one of them: note its scripts and duration for Task 19, where the Fold decides.

3. When the status has moved past `assemble · …`, run this rest probe:

```js
async () => {
  const original = window.requestAnimationFrame;
  let calls = 0;
  window.requestAnimationFrame = (callback) => {
    if (/svg-prop-animator|AssembleScene/.test(new Error().stack ?? "")) {
      calls += 1;
    }
    return original.call(window, callback);
  };
  await new Promise((resolve) => setTimeout(resolve, 1000));
  window.requestAnimationFrame = original;
  return calls;
}
```

Expected: `0`. A resting Assemble card keeps no frame loop.

4. Check that nothing reached Firebase:

```js
() =>
  performance
    .getEntriesByType("resource")
    .map((entry) => entry.name)
    .filter((name) => /firestore|firebaseio|identitytoolkit/.test(name))
```

Expected: `[]`.

- [ ] **Step 17: Commit**

```bash
cd /e/worktrees/tka-platform/create-method-previews
git status --short
git add -- src/lib/features/create/shared/components/method-previews/method-preview-assemble.ts src/lib/features/create/shared/components/method-previews/AssembleScene.svelte src/lib/features/create/shared/components/method-previews/method-preview-scenes.ts tests/unit/create/method-preview-assemble.test.ts tests/unit/create/method-preview-scenes.test.ts
git commit -m "feat(create): Assemble method preview" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/features/create/shared/components/method-previews/method-preview-assemble.ts src/lib/features/create/shared/components/method-previews/AssembleScene.svelte src/lib/features/create/shared/components/method-previews/method-preview-scenes.ts tests/unit/create/method-preview-assemble.test.ts tests/unit/create/method-preview-scenes.test.ts
```

---

### Task 16: Composition Review

The spec's Verification item 3 compares two compositions on the bench, with the real scenes, before the front door changes. **A** puts the preview inside the card's padding as an inset stage. **B** runs the preview to the card's edge. A separate reviewer judges frames of both against rubric VR-1, and the chosen composition goes into the spec. Task 18 builds A; its last step adds B's rules when B wins.

**Files:**

- Modify: `src/routes/test/create-method-previews/+page.svelte` (badges, a Guest switch, the app theme, labeled sections, B's strip below the badge)
- Modify: `docs/superpowers/specs/2026-10-06-create-method-previews-design.md` (a `### Composition` subsection at the end of **Placement**, just before `## Scenes`)
- Frames, not committed: `<scratch>/composition-review/*.webp`

- [ ] **Step 1: Give the mock cards the real badges and theme**

The reviewer must see what the front door will show: the **Last used** badge, the **Free account** badges a guest sees, and the app's colors. Make these edits to `src/routes/test/create-method-previews/+page.svelte`.

Add two imports after the `t` import:

```ts
import LastUsedBadge from "$lib/shared/components/LastUsedBadge.svelte";
import { isTabAccessible } from "$lib/shared/auth/domain/guest-access-config";
```

After `let initialPreference: string | undefined;` add:

```ts
/** The front door marks the last used method; Generate stands in for it. */
const LAST_USED = "generate";
let guest = $state(false);

/** As a guest, methods outside the guest tier carry the Free account badge. */
function lockedFor(id: string): boolean {
  return guest && !isTabAccessible("create", id, "guest");
}
```

At the start of the `onMount` callback, before `initialPreference = ...`, add:

```ts
// This route renders outside the app shell, so nothing has set the theme
// variables the cards paint with. Reading the device's saved background
// keeps the cards in the app's palette.
void import("$lib/shared/settings/utils/background-theme-calculator").then(
  ({ ensureThemeApplied }) => ensureThemeApplied()
);
```

In the Compositions view's card-shape controls, after the `{#each Object.entries(CARDS) ...}` block's `{/each}`, add:

```svelte
      <button
        type="button"
        aria-pressed={guest}
        onclick={() => (guest = !guest)}>Guest</button
      >
```

Label each section so the accessibility snapshot exposes it as a region. Replace:

```svelte
        <section>
          <h2>
```

with:

```svelte
        <section aria-labelledby={`composition-${composition}`}>
          <h2 id={`composition-${composition}`}>
```

In each mock card, directly before `<span class="mock-stage">`, add:

```svelte
                {#if lockedFor(method.id)}
                  <LastUsedBadge label={t("create_ui_account_badge")} />
                {:else if method.id === LAST_USED}
                  <LastUsedBadge />
                {/if}
```

The badge is absolutely positioned, so it takes no grid cell and no flex slot. In the `.mock-card` rule, add this as the first declaration, followed by a blank line:

```css
    --last-used-badge-accent: var(--method-color);
```

Replace the `.mock-card.edge .mock-stage` rule with:

```css
  /* The badge overhangs the top border by 11px each way, so B's strip
     starts just below it and runs to the side borders. */
  .mock-card.edge .mock-stage {
    margin: -2px -14px 0;
    border-radius: 0;
  }
```

The `.mock-card.square.edge .mock-stage` rule stays: B's square runs top to bottom on the left, away from the badge.

- [ ] **Step 2: Format, type check, and look**

```bash
cd /e/tka-platform && npx prettier --write /e/worktrees/tka-platform/create-method-previews/src/routes/test/create-method-previews/+page.svelte
```

Run `npm run check:fast` in the worktree (after the svelte-check gate). Expected: no errors in the bench.

Reload [http://localhost:5191/test/create-method-previews](http://localhost:5191/test/create-method-previews) in the agent Chrome, open **Compositions**, and press **Guest**. Expected: the cards use the app's dark palette; Generate shows **Last used**; Fuse, Tunnel, and Assemble show **Free account**; each badge sits on its card's top border in the method color; in B the strip starts just below the badge.

- [ ] **Step 3: Capture the frames**

```powershell
New-Item -ItemType Directory -Force C:/Users/Austen/AppData/Local/Temp/create-method-previews/composition-review
```

Use Chrome DevTools MCP on one task-owned page. Open it with `new_page {url: "http://localhost:5191/test/create-method-previews"}` and pass its `pageId` to every call below. Take a fresh `take_snapshot` before each `click`, because the uids change when the bench re-renders.

**Readiness probe.** Run it with `evaluate_script` before every resting frame. Expected: `"ready"`.

```js
async () => {
  const deadline = performance.now() + 30000;
  while (
    document.querySelectorAll(".mock-card .source.active .scene").length < 12
  ) {
    if (performance.now() > deadline) return "timed out";
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return "ready";
}
```

**Capturing a frame.** `take_snapshot`, find the regions **A: inset stage** and **B: edge to edge**, then:

- `take_screenshot {pageId, uid: <A region uid>, format: "webp", quality: 70, filePath: "C:/Users/Austen/AppData/Local/Temp/create-method-previews/composition-review/a-<frame>.webp"}`
- the same with the B region and `b-<frame>.webp`.

**Mid-turn frames.** With **Reduce motion** unpressed, `wait_for {pageId, text: ["construct ·"], timeout: 60000}` (or `shape-engine ·`, `tunnel ·`), then `evaluate_script` with `() => new Promise((resolve) => setTimeout(resolve, 1500))` and `waitForStableDom: false`, then capture A and B at once. Each card plays twice in the two rounds; if a wait misses its card, press **Restart rounds** and wait again.

Capture these 14 frames, in this order:

| Frame                 | `emulate` viewport                     | Card button            | State                                                    |
| --------------------- | -------------------------------------- | ---------------------- | -------------------------------------------------------- |
| `portrait-rest`       | `707x823x2.625,mobile,touch`           | Fold portrait 336×207  | **Reduce motion** pressed, readiness probe               |
| `portrait-construct`  | same                                   | same                   | **Reduce motion** unpressed, 1.5 s into Construct's turn |
| `portrait-shape`      | same                                   | same                   | 1.5 s into Shape's turn (`shape-engine ·`)               |
| `portrait-tunnel`     | same                                   | same                   | 1.5 s into Tunnel's turn                                 |
| `landscape-rest`      | `823x707x2.625,mobile,touch,landscape` | Fold landscape 394×172 | **Reduce motion** pressed, readiness probe               |
| `landscape-construct` | same                                   | same                   | **Reduce motion** unpressed, 1.5 s into Construct's turn |
| `guest-portrait-rest` | `707x823x2.625,mobile,touch`           | Fold portrait 336×207  | **Guest** and **Reduce motion** pressed, readiness probe |

Start with `emulate {pageId, viewport: "707x823x2.625,mobile,touch"}` and a click on **Compositions**. When done, press **Guest** and **Reduce motion** again so both read unpressed.

```powershell
(Get-ChildItem C:/Users/Austen/AppData/Local/Temp/create-method-previews/composition-review/*.webp).Count
```

Expected: `14`.

- [ ] **Step 4: Dispatch the reviewer**

Dispatch one read-only reviewer with the Agent tool: `subagent_type: "general-purpose"`, `model: "opus"`, `description: "Review card compositions"`. Send this brief exactly. Add nothing about why either composition was built or which one you expect to win: the reviewer sees the brief and the frames before any builder rationale.

```text
You are a separate visual reviewer. The review is read-only: do not edit or create files, do not run commands that change anything, and do not open a browser.

Read these first:
- E:/worktrees/tka-platform/create-method-previews/docs/architecture/visual-review.md (rubric VR-1 and the output template)
- E:/worktrees/tka-platform/create-method-previews/docs/architecture/visual-design-canon.md, section 15 (the Create front door tiles)

Surface: the Create front door of Flow Arts Composer, a choreography tool for flow artists (staff, poi, and other props). It asks "How do you want to create?" and offers six method cards: Construct, Generate, Shape, Fuse, Tunnel, and Assemble. Each card is one button with the method's color, icon, name, and a one-line description. New: each card also holds a small live preview that acts out the method with the app's own renderers and data. The cards take turns playing their previews for two rounds, then each rests on its finished picture.

Audience: a newcomer choosing how to create.
Main task: pick a creation method.
Real content: the six real cards, with their real names, descriptions, colors, badges, and previews.

Owner constraints, from Austen, the owner, on 2026-10-06:
- He does not want "crappy animations that are completely detached from our whole system".
- The icons are "very small when I look at it on my Fold 6".
- He wants an "intuitive animation which immediately establishes what happens inside that specific tab".
- Card sizes differ by device, so the preview must leave room for the text.

Success criteria:
- Each card still reads as one button, and its name and description stay legible and unclipped.
- The preview reads as part of its card and shows what the method does at the Fold's card size.
- The Last used and Free account badges stay legible and unobstructed.
- Cards in a row line up.

Two compositions, same content:
- A, inset stage: the preview sits inside the card's padding.
- B, edge to edge: the preview runs to the card's edge.

Rubric: VR-1. Research checked: 2026-09-21. Calibration: NOT CALIBRATED (2026-09-21). Independence: separate reviewer.

Frames: WebP files in C:/Users/Austen/AppData/Local/Temp/create-method-previews/composition-review/. Files starting with a- show A; files starting with b- show B. Each frame shows one composition's six cards on the bench route /test/create-method-previews, whose mock cards mirror the front door's 480-1199 px tier at the opened Galaxy Z Fold 6's card sizes.

| Frames | Viewport (CSS px) | DPR | Card | State |
| --- | --- | --- | --- | --- |
| a-portrait-rest, b-portrait-rest | 707x823 | 2.625 | 336x207 | reduced motion: every card on its finished picture |
| a-portrait-construct, b-portrait-construct | 707x823 | 2.625 | 336x207 | 1.5 s into Construct's turn |
| a-portrait-shape, b-portrait-shape | 707x823 | 2.625 | 336x207 | 1.5 s into Shape's turn |
| a-portrait-tunnel, b-portrait-tunnel | 707x823 | 2.625 | 336x207 | 1.5 s into Tunnel's turn |
| a-landscape-rest, b-landscape-rest | 823x707 | 2.625 | 394x172 | reduced motion |
| a-landscape-construct, b-landscape-construct | 823x707 | 2.625 | 394x172 | 1.5 s into Construct's turn |
| a-guest-portrait-rest, b-guest-portrait-rest | 707x823 | 2.625 | 336x207 | as a guest: Fuse, Tunnel, and Assemble carry Free account; reduced motion |

Generate carries Last used in every frame.

You cannot see interactions, motion between frames, other viewports, or the live page. Mark anything that would need them as unassessed.

Output: the visual-review.md template once for A and once for B, then a recommendation of A or B in two or three sentences that names its main tradeoff.
```

- [ ] **Step 5: Choose**

Read the review. Choose the composition it recommends, unless its report shows a hard-gate failure in that one (clipped text, a covered badge, a preview unreadable at the Fold's size) that the other avoids. Then choose the other and note why.

If the chosen composition has a material concern with a bounded correction, ask Austen before any correction round with AskUserQuestion: **Fix and re-review (Recommended)**, one bench edit, a new set of frames, and one more opus review; or **Keep it as it is**. Run at most two correction rounds. After the second, a remaining tradeoff goes to Austen as a question.

Send Austen the two mid-turn portrait frames with SendUserFile (`status: "proactive"`), `a-portrait-construct.webp` and `b-portrait-construct.webp`, with a one-line caption naming the choice, for example "A (inset stage) and B (edge to edge) mid-turn at the Fold's card size; the review chose A." Do not wait for a reply.

- [ ] **Step 6: Write the choice into the spec**

In `docs/superpowers/specs/2026-10-06-create-method-previews-design.md`, insert a subsection at the end of **Placement**, after the bullet that ends "Nothing around it moves." and before `## Scenes`. Use the paragraph for the chosen composition.

If A:

```md
### Composition

**A, inset stage.** The preview sits inside the card's padding with the small
corner radius, like the icon box it replaces. The card's tint and border frame
it, and the badge never touches it.
```

If B:

```md
### Composition

**B, edge to edge.** The preview runs to the card's border. A strip starts
just below the badge's overhang and spans the card's full width; a square runs
from the top border to the bottom border on the card's left. The card's tint
and border frame the text.
```

Then, for either:

```md
Review: separate reviewer, rubric VR-1, research checked 2026-09-21, reviewer
not calibrated. Frames: the bench at 707×823 and 823×707, DPR 2.625, resting
and mid-turn, signed out and as a guest.

| Dimension                   | A   | B   |
| --------------------------- | --- | --- |
| Project specificity         |     |     |
| Hierarchy                   |     |     |
| Grouping and spacing        |     |     |
| Real evidence and artifacts |     |     |
| Craft                       |     |     |
| Product continuity          |     |     |
```

Fill each cell with the reviewer's status for that dimension and composition: `supported`, `unassessed`, or `concern:` followed by the reviewer's observation in a few words. Under the table, add one sentence naming the main tradeoff the reviewer gave for the choice.

- [ ] **Step 7: Format and commit**

```bash
cd /e/tka-platform && npx prettier --write /e/worktrees/tka-platform/create-method-previews/docs/superpowers/specs/2026-10-06-create-method-previews-design.md
cd /e/worktrees/tka-platform/create-method-previews
git status --short
git add -- src/routes/test/create-method-previews/+page.svelte docs/superpowers/specs/2026-10-06-create-method-previews-design.md
git commit -m "docs(create): choose the method preview card composition" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/routes/test/create-method-previews/+page.svelte docs/superpowers/specs/2026-10-06-create-method-previews-design.md
```

---

### Task 17: Front Door Bench View and Baseline

Task 18 rebuilds the front door's layout. First, measure today's board at every viewport and in two locales, so the check after Task 18 can prove nothing regressed: no new scrolling, no clipped or resized text, no preview smaller than today's icon box, and no slower first paint. A signed-out `/create` shows only one board, so the bench gains a view that renders the real `CreateFrontDoor` with two to six methods, a Last used badge, and the guest badges.

**Files:**

- Modify: `src/routes/test/create-method-previews/+page.svelte` (a `front-door` view chosen by URL)
- Create, not committed: `<scratch>/front-door-check.mjs`
- Baseline, not committed: `<scratch>/front-door/before.json`, `<scratch>/front-door/before-shots/`, `<scratch>/front-door/timing-before.json`

- [ ] **Step 1: Add the front door view**

Make these edits to `src/routes/test/create-method-previews/+page.svelte`.

In the header comment, after the sentence that ends "with the front door's hover and keyboard holds.", add:

```ts
   *
   * `?view=front-door` renders the real front door alone, for the layout
   * check: `count` (2 to 6 methods, in board order), `guest=1` (Free
   * account badges), and `last` (a method id, or `none`; default Generate).
```

After `import { onMount } from "svelte";` add:

```ts
import { page } from "$app/state";
```

After the `CREATE_TABS` import add:

```ts
import CreateFrontDoor from "$lib/features/create/shared/components/CreateFrontDoor.svelte";
```

Replace `type View = "sizes" | "compositions";` with:

```ts
type View = "sizes" | "compositions" | "front-door";

// Each check loads the page fresh, so the URL is read once.
const params = page.url.searchParams;
const frontDoorCount = Math.min(
  6,
  Math.max(2, Number(params.get("count") ?? 6) || 6)
);
const frontDoorLastParam = params.get("last") ?? "generate";
const frontDoorLast =
  frontDoorLastParam === "none" ? null : frontDoorLastParam;
const frontDoorMethods = methods.slice(0, frontDoorCount);
const frontDoorLocked: ReadonlySet<string> = new Set(
  params.get("guest") === "1"
    ? frontDoorMethods
        .filter((method) => !isTabAccessible("create", method.id, "guest"))
        .map((method) => method.id)
    : []
);
```

Replace `let view = $state<View>("sizes");` with:

```ts
let view = $state<View>(
  params.get("view") === "front-door" ? "front-door" : "sizes"
);
```

In `onMount`, replace:

```ts
    reduce = previewMotionReduced();
    turns.start();
    return () => {
```

with:

```ts
    reduce = previewMotionReduced();
    // The front door view runs the real front door's own turns.
    if (view !== "front-door") turns.start();
    return () => {
```

Replace the line `<main class="bench">` with:

```svelte
{#if view === "front-door"}
  <div class="front-door-frame">
    <CreateFrontDoor
      methods={frontDoorMethods}
      lockedMethodIds={frontDoorLocked}
      active={true}
      source="direct"
      lastUsedMode={frontDoorLast}
      onSelect={() => {}}
      onLockedSelect={() => {}}
    />
  </div>
{:else}
  <main class="bench">
```

Replace the closing `</main>` line with:

```svelte
  </main>
{/if}
```

Add this rule at the end of the `<style>` block:

```css
  /* The front door view gives the board the whole window. */
  .front-door-frame {
    position: fixed;
    inset: 0;
    background: var(--theme-panel-bg, #0f0f14);
    color: var(--theme-text, #f4f4f8);
  }
```

- [ ] **Step 2: Format, type check, and look**

```bash
cd /e/tka-platform && npx prettier --write /e/worktrees/tka-platform/create-method-previews/src/routes/test/create-method-previews/+page.svelte
```

Run `npm run check:fast` in the worktree (after the svelte-check gate). Expected: no errors in the bench.

Open [http://localhost:5191/test/create-method-previews?view=front-door&count=5&guest=1](http://localhost:5191/test/create-method-previews?view=front-door&count=5&guest=1) in the agent Chrome. Expected: today's front door fills the window with five cards, Generate shows **Last used**, Fuse and Tunnel show **Free account**, and the console shows no errors.

- [ ] **Step 3: Write the layout check**

Create `C:/Users/Austen/AppData/Local/Temp/create-method-previews/front-door-check.mjs`. It drives the agent Chrome over the DevTools protocol with Node's built-in `fetch` and `WebSocket`, opens each page in a fresh browser context (signed out, empty storage), and sets the locale through the `PARAGLIDE_LOCALE` cookie the app reads.

```js
// front-door-check.mjs: measures the Create front door's cards in the agent
// Chrome across viewports and locales, and compares a run with a baseline.
//
//   node front-door-check.mjs --out <file.json> [--shots <dir>] [--only a,b]
//     [--locales en,de] [--block-scenes] [--compare <baseline.json>]
//   node front-door-check.mjs --timing --out <file.json> [--compare <baseline.json>]
//
// Needs the worktree preview on http://localhost:5191 and the agent Chrome
// on port 9222 (scripts/launch-chrome-debug.ps1) with its window visible:
// a hidden window stops painting, so the check refuses to run.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const BASE = "http://localhost:5191";
const DEBUG = "http://127.0.0.1:9222";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const median = (values) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

const VIEWPORTS = [
  { name: "375x667", width: 375, height: 667, dpr: 2, mobile: true },
  { name: "369x850", width: 369, height: 850, dpr: 2.625, mobile: true },
  { name: "707x823", width: 707, height: 823, dpr: 2.625, mobile: true },
  { name: "823x707", width: 823, height: 707, dpr: 2.625, mobile: true },
  { name: "960x412", width: 960, height: 412, dpr: 2, mobile: true },
  { name: "820x1180", width: 820, height: 1180, dpr: 2, mobile: true },
  { name: "1440x900", width: 1440, height: 900, dpr: 1, mobile: false },
  { name: "1920x1080", width: 1920, height: 1080, dpr: 1, mobile: false },
  { name: "2560x1440", width: 2560, height: 1440, dpr: 1, mobile: false },
  { name: "3840x2160", width: 3840, height: 2160, dpr: 1, mobile: false },
  // A 1440x900 laptop at 200% browser zoom.
  { name: "zoom200-720x450", width: 720, height: 450, dpr: 2, mobile: false },
];

const BENCH = "/test/create-method-previews?view=front-door";
const TARGETS = [
  { name: "create", path: "/create" },
  { name: "bench-6", path: `${BENCH}&count=6&last=generate` },
  { name: "bench-6-guest", path: `${BENCH}&count=6&last=generate&guest=1` },
  { name: "bench-5", path: `${BENCH}&count=5&last=generate` },
  { name: "bench-4", path: `${BENCH}&count=4&last=generate` },
  { name: "bench-3", path: `${BENCH}&count=3&last=generate` },
  { name: "bench-2", path: `${BENCH}&count=2&last=generate` },
];

// Runs in the page: the board and every card's boxes, once fonts are in.
async function measure() {
  const deadline = performance.now() + 60000;
  while (!document.querySelector(".method-card")) {
    if (performance.now() > deadline) {
      throw new Error("No .method-card within 60 s");
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await document.fonts.ready;
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const rect = (element) => {
    if (!element) return null;
    const box = element.getBoundingClientRect();
    return { x: box.x, y: box.y, w: box.width, h: box.height };
  };
  const board = document.querySelector("section.front-door");
  return {
    visibility: document.visibilityState,
    locale: document.documentElement.lang,
    board: rect(board),
    overflowY: board.scrollHeight - board.clientHeight,
    overflowX: board.scrollWidth - board.clientWidth,
    cards: [...document.querySelectorAll(".method-card")].map((card) => {
      // Before the previews, the icon box is the stage.
      const stage =
        card.querySelector(".method-stage") ??
        card.querySelector(".method-icon");
      const name = card.querySelector(".method-name");
      const description = card.querySelector(".method-description");
      return {
        id: card.dataset.methodId,
        card: rect(card),
        stage: rect(stage),
        preview: rect(card.querySelector(".method-preview")),
        iconInStage: Boolean(
          stage &&
            (stage.classList.contains("method-icon") ||
              stage.querySelector(".method-icon"))
        ),
        copy: rect(card.querySelector(".method-copy")),
        name: rect(name),
        badge: rect(card.querySelector(".last-used-badge")),
        nameFont: name ? getComputedStyle(name).fontSize : null,
        descriptionFont: description
          ? getComputedStyle(description).fontSize
          : null,
        clipped: [name, description].some(
          (element) =>
            element !== null &&
            (element.scrollWidth > element.clientWidth + 1 ||
              element.scrollHeight > element.clientHeight + 1)
        ),
      };
    }),
  };
}

// Runs in the page before any of its scripts: when the cards appear, and
// every long animation frame.
function prelude() {
  window.__cardsAt = null;
  window.__loaf = [];
  new MutationObserver((records, observer) => {
    if (!document.querySelector(".method-card")) return;
    window.__cardsAt = performance.now();
    observer.disconnect();
  }).observe(document, { childList: true, subtree: true });
  new PerformanceObserver((list) => {
    for (const frame of list.getEntries()) {
      window.__loaf.push({
        start: frame.startTime,
        duration: frame.duration,
        blocking: frame.blockingDuration,
        scripts: frame.scripts.map(
          (script) =>
            `${script.sourceURL} ${script.sourceFunctionName || script.invoker}`
        ),
      });
    }
  }).observe({ type: "long-animation-frame", buffered: true });
}

// Runs in the page: first paint, the cards, and the long frames that block
// input in the eight seconds after first paint.
async function timing() {
  const deadline = performance.now() + 60000;
  while (!window.__cardsAt) {
    if (performance.now() > deadline) {
      throw new Error("No .method-card within 60 s");
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await new Promise((resolve) => setTimeout(resolve, 9000));
  const fcp = performance.getEntriesByName("first-contentful-paint")[0]
    ?.startTime;
  if (fcp === undefined) throw new Error("No first-contentful-paint entry");
  return {
    cardsAt: window.__cardsAt,
    fcp,
    frames: window.__loaf.filter(
      (frame) =>
        frame.start > fcp && frame.start < fcp + 8000 && frame.blocking > 0
    ),
  };
}

async function connect() {
  let version;
  try {
    version = await (await fetch(`${DEBUG}/json/version`)).json();
  } catch {
    throw new Error(
      `No agent Chrome on ${DEBUG}. Start it with scripts/launch-chrome-debug.ps1.`
    );
  }
  const socket = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener(
      "error",
      () => reject(new Error(`Cannot open the DevTools socket on ${DEBUG}`)),
      { once: true }
    );
  });
  let nextId = 0;
  const pending = new Map();
  const listeners = new Set();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id === undefined) {
      for (const listener of [...listeners]) listener(message);
      return;
    }
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) {
      waiter.reject(new Error(`${waiter.method}: ${message.error.message}`));
    } else {
      waiter.resolve(message.result);
    }
  });
  function send(method, params = {}, sessionId) {
    nextId += 1;
    const id = nextId;
    socket.send(
      JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })
    );
    return new Promise((resolve, reject) =>
      pending.set(id, { method, resolve, reject })
    );
  }
  function on(method, sessionId, handler) {
    const listener = (message) => {
      if (message.method === method && message.sessionId === sessionId) {
        handler(message.params);
      }
    };
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
  function waitFor(method, sessionId, timeoutMs) {
    return new Promise((resolve, reject) => {
      const off = on(method, sessionId, (params) => {
        clearTimeout(timer);
        off();
        resolve(params);
      });
      const timer = setTimeout(() => {
        off();
        reject(new Error(`Timed out waiting for ${method}`));
      }, timeoutMs);
    });
  }
  return { send, on, waitFor, close: () => socket.close() };
}

async function openPage(cdp, locale) {
  const { browserContextId } = await cdp.send("Target.createBrowserContext", {
    disposeOnDetach: true,
  });
  const { targetId } = await cdp.send("Target.createTarget", {
    url: "about:blank",
    browserContextId,
  });
  const { sessionId } = await cdp.send("Target.attachToTarget", {
    targetId,
    flatten: true,
  });
  for (const domain of ["Page", "Runtime", "Network"]) {
    await cdp.send(`${domain}.enable`, {}, sessionId);
  }
  await cdp.send(
    "Emulation.setFocusEmulationEnabled",
    { enabled: true },
    sessionId
  );
  await cdp.send("Page.bringToFront", {}, sessionId);
  await cdp.send(
    "Network.setCookie",
    { name: "PARAGLIDE_LOCALE", value: locale, url: BASE },
    sessionId
  );
  return { browserContextId, targetId, sessionId };
}

async function closePage(cdp, page) {
  await cdp.send("Target.closeTarget", { targetId: page.targetId });
  await cdp.send("Target.disposeBrowserContext", {
    browserContextId: page.browserContextId,
  });
}

async function evaluate(cdp, page, expression) {
  const { result, exceptionDetails } = await cdp.send(
    "Runtime.evaluate",
    { expression, awaitPromise: true, returnByValue: true },
    page.sessionId
  );
  if (exceptionDetails) {
    throw new Error(
      exceptionDetails.exception?.description ?? exceptionDetails.text
    );
  }
  return result.value;
}

async function navigate(cdp, page, url) {
  const loaded = cdp.waitFor("Page.loadEventFired", page.sessionId, 60000);
  loaded.catch(() => {});
  const { errorText } = await cdp.send("Page.navigate", { url }, page.sessionId);
  if (errorText) throw new Error(`Navigation failed: ${errorText}`);
  await loaded;
}

async function ensureVisible(cdp, page) {
  const state = () => evaluate(cdp, page, "document.visibilityState");
  if ((await state()) === "visible") return;
  await cdp.send("Page.bringToFront", {}, page.sessionId);
  await sleep(500);
  if ((await state()) !== "visible") {
    throw new Error(
      "The agent Chrome window is hidden or fully covered. Bring it to the front and run again."
    );
  }
}

async function emulate(cdp, page, viewport) {
  await cdp.send(
    "Emulation.setDeviceMetricsOverride",
    {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: viewport.dpr,
      mobile: viewport.mobile,
    },
    page.sessionId
  );
  await cdp.send(
    "Emulation.setTouchEmulationEnabled",
    viewport.mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false },
    page.sessionId
  );
}

async function screenshot(cdp, page, file) {
  const { data } = await cdp.send(
    "Page.captureScreenshot",
    { format: "webp", quality: 70 },
    page.sessionId
  );
  writeFileSync(file, Buffer.from(data, "base64"));
}

async function runLayouts(cdp) {
  const locales = (option("--locales") ?? "en,de").split(",");
  const only = option("--only")?.split(",");
  const shots = option("--shots");
  if (shots) mkdirSync(shots, { recursive: true });
  const jobs = [];
  for (const locale of locales) {
    for (const target of TARGETS) {
      for (const viewport of VIEWPORTS) {
        const key = `${target.name}|${viewport.name}|${locale}`;
        if (!only || only.every((part) => key.includes(part))) {
          jobs.push({ key, locale, target, viewport });
        }
      }
    }
  }
  const results = {};
  let done = 0;
  for (const locale of locales) {
    const localeJobs = jobs.filter((job) => job.locale === locale);
    if (localeJobs.length === 0) continue;
    const page = await openPage(cdp, locale);
    try {
      if (flag("--block-scenes")) {
        // The previews' scene modules fail to load, as on a flaky network.
        await cdp.send(
          "Fetch.enable",
          { patterns: [{ urlPattern: "*/method-previews/*Scene.svelte*" }] },
          page.sessionId
        );
        cdp.on("Fetch.requestPaused", page.sessionId, ({ requestId }) => {
          void cdp.send(
            "Fetch.failRequest",
            { requestId, errorReason: "BlockedByClient" },
            page.sessionId
          );
        });
      }
      for (const { key, target, viewport } of localeJobs) {
        done += 1;
        console.log(`${done}/${jobs.length} ${key}`);
        await emulate(cdp, page, viewport);
        try {
          await navigate(cdp, page, BASE + target.path);
        } catch (error) {
          results[key] = { error: error.message };
          continue;
        }
        await ensureVisible(cdp, page);
        try {
          const measured = await evaluate(cdp, page, `(${measure})()`);
          if (!String(measured.locale).startsWith(locale)) {
            throw new Error(`the page reports lang "${measured.locale}"`);
          }
          results[key] = measured;
          if (shots) {
            const file = join(shots, `${key.replaceAll("|", "_")}.webp`);
            await screenshot(cdp, page, file);
            if (measured.overflowY > 0) {
              await evaluate(
                cdp,
                page,
                `document.querySelector("section.front-door").scrollTo(0, 1e6)`
              );
              await sleep(300);
              await screenshot(cdp, page, file.replace(/\.webp$/, "_end.webp"));
            }
          }
        } catch (error) {
          results[key] = { error: error.message };
        }
      }
    } finally {
      await closePage(cdp, page);
    }
  }
  return results;
}

async function runTiming(cdp) {
  const page = await openPage(cdp, "en");
  try {
    await emulate(cdp, page, {
      width: 707,
      height: 823,
      dpr: 2.625,
      mobile: true,
    });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 }, page.sessionId);
    await cdp.send(
      "Page.addScriptToEvaluateOnNewDocument",
      { source: `(${prelude})()` },
      page.sessionId
    );
    const runs = [];
    for (let run = 0; run < 6; run += 1) {
      await navigate(cdp, page, `${BASE}/create`);
      await ensureVisible(cdp, page);
      const sample = await evaluate(cdp, page, `(${timing})()`);
      console.log(
        `run ${run}: cards at ${Math.round(sample.cardsAt)} ms, first paint at ${Math.round(sample.fcp)} ms${run === 0 ? " (warm-up, not counted)" : ""}`
      );
      if (run > 0) runs.push(sample);
    }
    for (const frame of runs.flatMap((run) => run.frames)) {
      if (frame.scripts.some((script) => /method-previews|Scene\.svelte/.test(script))) {
        console.log(
          `FOLD CHECK ${Math.round(frame.duration)} ms frame, ${Math.round(frame.blocking)} ms blocking: ${frame.scripts.join(" | ")}`
        );
      }
    }
    return {
      cardsAt: median(runs.map((run) => run.cardsAt)),
      fcp: median(runs.map((run) => run.fcp)),
      runs,
    };
  } finally {
    await closePage(cdp, page);
  }
}

function overlap(a, b) {
  if (!a || !b) return 0;
  const width = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return width > 0 && height > 0 ? Math.min(width, height) : 0;
}

function inside(inner, outer, tolerance) {
  return Boolean(
    inner &&
      outer &&
      inner.x >= outer.x - tolerance &&
      inner.y >= outer.y - tolerance &&
      inner.x + inner.w <= outer.x + outer.w + tolerance &&
      inner.y + inner.h <= outer.y + outer.h + tolerance
  );
}

const minSide = (box) => (box ? Math.min(box.w, box.h) : 0);
const spread = (values) => Math.max(...values) - Math.min(...values);

function compareLayouts(current, baseline) {
  const failures = [];
  for (const [key, now] of Object.entries(current)) {
    const before = baseline[key];
    if (now.error) {
      failures.push(`${key}: ${now.error}`);
      continue;
    }
    if (!before || before.error) {
      failures.push(`${key}: no baseline`);
      continue;
    }
    const allowedY = Math.max(0, before.overflowY) + 1;
    if (now.overflowY > allowedY) {
      failures.push(
        `${key}: the board scrolls ${Math.round(now.overflowY)} px; it scrolled ${Math.round(Math.max(0, before.overflowY))} px`
      );
    }
    if (now.overflowX > 0) {
      failures.push(`${key}: the board scrolls sideways by ${now.overflowX} px`);
    }
    const beforeById = new Map(before.cards.map((card) => [card.id, card]));
    for (const card of now.cards) {
      const was = beforeById.get(card.id);
      const label = `${key} ${card.id}`;
      if (!was) {
        failures.push(`${label}: no baseline card`);
        continue;
      }
      if (!inside(card.copy, card.card, 0.5)) {
        failures.push(`${label}: the text leaves the card`);
      }
      if (overlap(card.stage, card.copy) > 0.5) {
        failures.push(`${label}: the stage overlaps the text`);
      }
      if (overlap(card.badge, card.stage) > 0.5) {
        failures.push(`${label}: the badge overlaps the stage`);
      }
      if (minSide(card.stage) < minSide(was.stage) - 0.5) {
        failures.push(
          `${label}: the stage is ${minSide(card.stage).toFixed(1)} px, smaller than the ${minSide(was.stage).toFixed(1)} px icon box`
        );
      }
      if (
        card.nameFont !== was.nameFont ||
        card.descriptionFont !== was.descriptionFont
      ) {
        failures.push(
          `${label}: type changed from ${was.nameFont}/${was.descriptionFont} to ${card.nameFont}/${card.descriptionFont}`
        );
      }
      if (card.clipped) failures.push(`${label}: text is clipped`);
      if (!card.iconInStage && minSide(card.preview) < 1) {
        failures.push(`${label}: the stage holds neither the icon nor a preview`);
      }
    }
    // Cards that share a top edge share a stage size and a name line.
    const rows = new Map();
    for (const card of now.cards) {
      const top = Math.round(card.card.y);
      rows.set(top, [...(rows.get(top) ?? []), card]);
    }
    for (const [top, row] of rows) {
      if (row.length < 2) continue;
      if (
        spread(row.map((card) => card.stage.w)) > 1 ||
        spread(row.map((card) => card.stage.h)) > 1
      ) {
        failures.push(`${key} row at ${top}: the stages differ in size`);
      }
      if (spread(row.map((card) => card.name.y)) > 1) {
        failures.push(`${key} row at ${top}: the names do not line up`);
      }
    }
  }
  return failures;
}

function compareTiming(current, baseline) {
  const failures = [];
  for (const metric of ["cardsAt", "fcp"]) {
    const now = current.timing[metric];
    const before = baseline.timing?.[metric];
    if (before === undefined) {
      failures.push(`timing: no baseline ${metric}`);
    } else if (now > before * 1.1 + 100) {
      failures.push(
        `timing: median ${metric} ${Math.round(now)} ms; the baseline was ${Math.round(before)} ms`
      );
    }
  }
  return failures;
}

let cdp;
try {
  cdp = await connect();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
try {
  const timingRun = flag("--timing");
  const results = timingRun
    ? { timing: await runTiming(cdp) }
    : await runLayouts(cdp);
  const out = option("--out");
  if (out) {
    mkdirSync(dirname(out), { recursive: true });
    const merged = existsSync(out) ? JSON.parse(readFileSync(out, "utf8")) : {};
    writeFileSync(out, JSON.stringify(Object.assign(merged, results), null, 2));
  }
  if (timingRun) {
    console.log(
      `median cards at ${Math.round(results.timing.cardsAt)} ms, first paint at ${Math.round(results.timing.fcp)} ms`
    );
  } else {
    console.log(`Measured ${Object.keys(results).length} entries`);
  }
  const baselinePath = option("--compare");
  if (baselinePath) {
    const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
    const failures = timingRun
      ? compareTiming(results, baseline)
      : compareLayouts(results, baseline);
    for (const failure of failures) console.log(`FAIL ${failure}`);
    console.log(
      failures.length === 0 ? "PASS: no regressions" : `${failures.length} failures`
    );
    process.exitCode = failures.length === 0 ? 0 : 1;
  }
} finally {
  cdp.close();
}
```

`measure`, `prelude`, and `timing` run in the page: the script sends their source text, so they may use only browser globals.

- [ ] **Step 4: Smoke-test the check**

The agent Chrome window must be visible for every run of this script. From Git Bash:

```bash
cd /c/Users/Austen/AppData/Local/Temp/create-method-previews && node front-door-check.mjs --only "707x823,|en" --out front-door/smoke.json
```

Expected: seven progress lines, then `Measured 7 entries`. Then:

```bash
cd /c/Users/Austen/AppData/Local/Temp/create-method-previews && node -e "const r=require('./front-door/smoke.json'); for (const [k,v] of Object.entries(r)) console.log(k, v.error ?? v.cards.map(c=>c.id+' '+Math.round(c.stage.w)+'x'+Math.round(c.stage.h)+(c.iconInStage?' icon':'')).join(', '))"
```

Expected: no entry shows an error; `create` lists six cards and each bench entry its count; every stage is today's icon box, about `44x44`, marked `icon`. Delete `front-door/smoke.json` afterwards.

- [ ] **Step 5: Record the layout baseline**

154 page loads, about 12 minutes. Run it with the Bash tool's `run_in_background` (or `timeout: 600000` and a second run with `--only` for what remains):

```bash
cd /c/Users/Austen/AppData/Local/Temp/create-method-previews && node front-door-check.mjs --out front-door/before.json --shots front-door/before-shots
```

Expected: the last line is `Measured 154 entries`. Check for errors:

```bash
cd /c/Users/Austen/AppData/Local/Temp/create-method-previews && node -e "const r=require('./front-door/before.json'); const bad=Object.entries(r).filter(([,v])=>v.error); console.log(Object.keys(r).length+' entries, '+bad.length+' errors'); for (const [k,v] of bad) console.log(k, v.error)"
```

Expected: `154 entries, 0 errors`. Rerun any failed key with `--only` and `--out front-door/before.json`, which merges into the file. Open three of the shots (`create_375x667_en.webp`, `bench-6_707x823_de.webp`, `bench-3_1440x900_en.webp`) to confirm each shows today's front door, not a sign-in page or a blank board.

- [ ] **Step 6: Record the timing baseline**

```bash
cd /c/Users/Austen/AppData/Local/Temp/create-method-previews && node front-door-check.mjs --timing --out front-door/timing-before.json
```

Expected: six run lines (the first marked warm-up), then a median line, and no `FOLD CHECK` lines, because no preview exists yet. Run nothing heavy on the machine meanwhile; the numbers compare against Task 18's run.

- [ ] **Step 7: Commit the bench view**

```bash
cd /e/worktrees/tka-platform/create-method-previews
git status --short
git add -- src/routes/test/create-method-previews/+page.svelte
git commit -m "test(create): real front door view on the method preview bench" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/routes/test/create-method-previews/+page.svelte
```

---

### Task 18: Front Door Wiring

The real front door gets a stage in every card, the turn coordinator, and the render gate. The CSS below is composition A, the stage inside the card's padding. If Task 16 chose composition B, Step 5 adds the rules that take each stage to the card's edges; nothing else changes.

**Files:**

- Modify: `src/lib/features/create/shared/components/CreateFrontDoor.svelte` (whole file)
- Create: `tests/unit/create/FakeMethodPreview.svelte`
- Create: `tests/unit/create/FrontDoorHost.svelte`
- Test: `tests/unit/create/create-front-door-previews.test.ts`
- Rerun unchanged: `tests/unit/create/create-front-door-locked-methods.test.ts`

- [ ] **Step 1: Write the stand-ins**

The real preview box loads scene modules that jsdom cannot draw, so the front door tests swap in a stand-in. Create `tests/unit/create/FakeMethodPreview.svelte`:

```svelte
<!-- Stands in for CreateMethodPreview in front door tests. It reports ready
     on mount and shows the props the front door passes it. -->
<script lang="ts">
  import { onMount } from "svelte";

  let {
    methodId,
    color,
    playing = false,
    turn = 0,
    onready,
  }: {
    methodId: string;
    color: string;
    playing?: boolean;
    turn?: number;
    onready?: (methodId: string) => void;
  } = $props();

  onMount(() => {
    onready?.(methodId);
  });
</script>

<span
  class="fake-preview"
  data-method={methodId}
  data-color={color}
  data-playing={String(playing)}
  data-turn={String(turn)}
></span>
```

CreateModule mounts the front door before it first shows and then flips its `active` prop. Create `tests/unit/create/FrontDoorHost.svelte` to do the same:

```svelte
<!-- Mounts the Create front door closed, as CreateModule does, and lets a
     test open and close it. -->
<script lang="ts">
  import type { Section } from "$lib/shared/navigation/domain/types";
  import CreateFrontDoor from "$lib/features/create/shared/components/CreateFrontDoor.svelte";

  let {
    methods,
    lockedMethodIds,
    lastUsedMode = null,
    onSelect,
    onLockedSelect,
  }: {
    methods: Section[];
    lockedMethodIds?: ReadonlySet<string>;
    lastUsedMode?: string | null;
    onSelect: (methodId: string) => void;
    onLockedSelect?: (methodId: string) => void;
  } = $props();

  let active = $state(false);

  export function setActive(value: boolean): void {
    active = value;
  }
</script>

<CreateFrontDoor
  {methods}
  {lockedMethodIds}
  {active}
  source="direct"
  {lastUsedMode}
  {onSelect}
  {onLockedSelect}
/>
```

- [ ] **Step 2: Write the failing test**

Create `tests/unit/create/create-front-door-previews.test.ts`:

```ts
// @vitest-environment jsdom

/**
 * The Create front door's cards host live previews of their methods. Every
 * card reserves its stage, the previews mount when the board first opens,
 * the cards take turns once the page settles, and choosing a method or
 * closing the board ends the turns. Names, order, and analytics stay as
 * they were. Spec:
 * docs/superpowers/specs/2026-10-06-create-method-previews-design.md
 */
import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Section } from "$lib/shared/navigation/domain/types";
import { CREATE_TABS } from "$lib/shared/navigation/config/tab-definitions";
import { t } from "$lib/shared/i18n/i18n.svelte.js";
import { METHOD_PREVIEW_SCENES } from "$lib/features/create/shared/components/method-previews/method-preview-scenes";
import { METHOD_PREVIEW_TIMING } from "$lib/features/create/shared/state/method-preview-turns.svelte";

const analytics = vi.hoisted(() => ({
  logCreateFrontDoorViewed: vi.fn(),
  logCreateMethodSelected: vi.fn(),
}));

vi.mock(
  "$lib/features/create/shared/services/create-entry-analytics",
  () => analytics
);
vi.mock("$lib/shared/application/get-haptic-feedback", () => ({
  getHapticFeedback: () => ({ trigger: vi.fn() }),
}));
// The real preview box loads scene modules jsdom cannot draw. The stand-in
// reports ready on mount and shows the props it was given.
vi.mock(
  "$lib/features/create/shared/components/method-previews/CreateMethodPreview.svelte",
  async () => ({
    default: (await import("./FakeMethodPreview.svelte")).default,
  })
);

const { default: FrontDoorHost } = await import("./FrontDoorHost.svelte");

// vitest-setup.ts swaps document.createElement for canvas stubs that are not
// DOM nodes. Mounting a component needs jsdom's own, from document's prototype.
const realCreateElement = Object.getPrototypeOf(document)
  .createElement as typeof document.createElement;

/** Every method, in board order. */
const ALL = [
  "construct",
  "generate",
  "shape-engine",
  "fuse",
  "tunnel",
  "assemble",
];
const WITH_SCENES = ALL.filter((id) =>
  Object.hasOwn(METHOD_PREVIEW_SCENES, id)
);

/** runAfterNamedRouteMorphIdle waits this long without requestIdleCallback, as in jsdom. */
const IDLE_FALLBACK_MS = 180;
const FIRST_TURN_MS = IDLE_FALLBACK_MS + METHOD_PREVIEW_TIMING.startDelayMs;
const TURN_CYCLE_MS =
  METHOD_PREVIEW_TIMING.turnMs + METHOD_PREVIEW_TIMING.gapMs;

function methodsFor(ids: string[]): Section[] {
  return ids.map((id) => {
    const tab = CREATE_TABS.find((candidate) => candidate.id === id);
    if (!tab) throw new Error(`Unknown Create tab ${id}`);
    return tab;
  });
}

describe("Create front door, method previews", () => {
  let host: HTMLElement;
  let frontDoor: ReturnType<typeof mount> | null = null;
  let stubbedCreateElement: typeof document.createElement;
  const onSelect = vi.fn();
  const onLockedSelect = vi.fn();

  function render({
    methods = methodsFor(ALL),
    locked = [],
    lastUsedMode = null,
  }: {
    methods?: Section[];
    locked?: string[];
    lastUsedMode?: string | null;
  } = {}): void {
    frontDoor = mount(FrontDoorHost, {
      target: host,
      props: {
        methods,
        lockedMethodIds: new Set(locked),
        lastUsedMode,
        onSelect,
        onLockedSelect,
      },
    });
    flushSync();
  }

  /** CreateModule shows and hides the board through its `active` prop. */
  function setOpen(open: boolean): void {
    frontDoor?.setActive(open);
    flushSync();
  }

  /** Run the clock, then let the DOM catch up with the turns it moved. */
  function advance(ms: number): void {
    vi.advanceTimersByTime(ms);
    flushSync();
  }

  function playingMethod(): string | null {
    return (
      host
        .querySelector(".method-index")
        ?.getAttribute("data-playing-method") ?? null
    );
  }

  function card(methodId: string): HTMLButtonElement {
    const button = host.querySelector<HTMLButtonElement>(
      `[data-method-id="${methodId}"]`
    );
    if (!button) throw new Error(`No card for ${methodId}`);
    return button;
  }

  function preview(methodId: string): HTMLElement | null {
    return host.querySelector<HTMLElement>(
      `.fake-preview[data-method="${methodId}"]`
    );
  }

  beforeEach(() => {
    vi.useFakeTimers();
    stubbedCreateElement = document.createElement;
    document.createElement = realCreateElement.bind(document);
    host = document.createElement("div");
    document.body.append(host);
    onSelect.mockReset();
    onLockedSelect.mockReset();
    analytics.logCreateFrontDoorViewed.mockReset();
    analytics.logCreateMethodSelected.mockReset();
  });

  afterEach(() => {
    if (frontDoor) unmount(frontDoor);
    frontDoor = null;
    host.remove();
    document.createElement = stubbedCreateElement;
    delete document.documentElement.dataset.motionPreference;
    vi.useRealTimers();
  });

  it("reserves a stage in every card and mounts the previews when the board first opens", () => {
    render();

    expect(host.querySelectorAll(".method-stage")).toHaveLength(ALL.length);
    expect(host.querySelector(".fake-preview")).toBeNull();

    setOpen(true);

    expect(WITH_SCENES.length).toBeGreaterThan(0);
    const previews = [...host.querySelectorAll<HTMLElement>(".fake-preview")];
    expect(previews.map((element) => element.dataset.method)).toEqual(
      WITH_SCENES
    );
    for (const element of previews) {
      const tab = CREATE_TABS.find(
        (candidate) => candidate.id === element.dataset.method
      );
      expect(element.dataset.color).toBe(tab?.color);
    }
  });

  it("keeps each card one button named by its words", () => {
    render();
    setOpen(true);

    for (const id of ALL) {
      const button = card(id);
      const stage = button.querySelector(".method-stage");
      expect(stage?.getAttribute("aria-hidden")).toBe("true");
      expect(stage?.textContent?.trim()).toBe("");
      expect(
        stage?.querySelector("a, button, input, select, textarea, [tabindex]")
      ).toBeNull();
      const tab = CREATE_TABS.find((candidate) => candidate.id === id);
      expect(button.querySelector(".method-name")?.textContent?.trim()).toBe(
        t(tab?.labelKey ?? "")
      );
      expect(button.getAttribute("aria-label")).toBeNull();
    }
    for (const id of WITH_SCENES) {
      expect(
        card(id).querySelector(".method-name .method-glyph")?.getAttribute(
          "aria-hidden"
        )
      ).toBe("true");
    }
  });

  it("starts the turns in board order once the page has settled", () => {
    render();
    setOpen(true);

    advance(FIRST_TURN_MS - 1);
    expect(playingMethod()).toBeNull();

    advance(1);
    expect(playingMethod()).toBe("construct");
    expect(preview("construct")?.dataset.playing).toBe("true");

    advance(TURN_CYCLE_MS);
    expect(playingMethod()).toBe("generate");
    expect(preview("construct")?.dataset.playing).toBe("false");
  });

  it("ends the turns when a method is chosen", () => {
    render();
    setOpen(true);
    advance(FIRST_TURN_MS);
    expect(playingMethod()).toBe("construct");

    card("generate").click();
    flushSync();

    expect(onSelect).toHaveBeenCalledWith("generate");
    expect(playingMethod()).toBeNull();
    advance(TURN_CYCLE_MS * 3);
    expect(playingMethod()).toBeNull();
  });

  it("keeps the turns going when a guest taps a locked method", () => {
    render({ locked: ["fuse"] });
    setOpen(true);
    advance(FIRST_TURN_MS);

    card("fuse").click();
    flushSync();

    expect(onLockedSelect).toHaveBeenCalledWith("fuse");
    expect(onSelect).not.toHaveBeenCalled();
    expect(playingMethod()).toBe("construct");
    advance(TURN_CYCLE_MS);
    expect(playingMethod()).toBe("generate");
  });

  it("shows every finished picture and plays nothing under reduced motion", () => {
    document.documentElement.dataset.motionPreference = "reduce";
    render();
    setOpen(true);

    expect(host.querySelectorAll(".fake-preview")).toHaveLength(
      WITH_SCENES.length
    );
    advance(FIRST_TURN_MS + TURN_CYCLE_MS * 2);
    expect(playingMethod()).toBeNull();
  });

  it("ends the turns when the board closes and starts over when it opens again", () => {
    render();
    setOpen(true);
    advance(FIRST_TURN_MS);
    expect(playingMethod()).toBe("construct");

    setOpen(false);
    expect(playingMethod()).toBeNull();
    // The previews stay mounted behind the workspace.
    expect(host.querySelectorAll(".fake-preview")).toHaveLength(
      WITH_SCENES.length
    );
    advance(TURN_CYCLE_MS * 2);
    expect(playingMethod()).toBeNull();

    setOpen(true);
    advance(FIRST_TURN_MS - 1);
    expect(playingMethod()).toBeNull();
    advance(1);
    expect(playingMethod()).toBe("construct");
  });

  it("reports the view once and the choice as before", () => {
    render({ lastUsedMode: "generate" });
    setOpen(true);
    advance(FIRST_TURN_MS);

    expect(analytics.logCreateFrontDoorViewed).toHaveBeenCalledTimes(1);
    expect(analytics.logCreateFrontDoorViewed).toHaveBeenCalledWith({
      source: "direct",
      methodCount: ALL.length,
    });

    card("generate").click();

    expect(analytics.logCreateMethodSelected).toHaveBeenCalledWith({
      method: "generate",
      source: "direct",
      isLastUsed: true,
      isLocked: false,
    });
  });

  it("keeps the icon box, and skips the turn, for a method without a scene", () => {
    const [construct] = methodsFor(["construct"]);
    if (!construct) throw new Error("No Construct tab");
    render({
      methods: [
        ...methodsFor(["construct", "generate"]),
        { ...construct, id: "sketch" },
      ],
    });
    setOpen(true);

    const sketch = card("sketch");
    expect(sketch.querySelector(".method-stage .method-icon")).not.toBeNull();
    expect(sketch.querySelector(".method-glyph")).toBeNull();
    expect(preview("sketch")).toBeNull();

    advance(FIRST_TURN_MS);
    expect(playingMethod()).toBe("construct");
    advance(TURN_CYCLE_MS);
    expect(playingMethod()).toBe("generate");
    advance(TURN_CYCLE_MS);
    expect(playingMethod()).toBe("construct");
  });
});
```

The last test borrows Construct's label and icon for an id with no scene, the case any method falls into if Task 19 takes its icon fallback.

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/create/create-front-door-previews.test.ts`
Expected: FAIL, 8 failed and 1 passed. Today's front door has no stages, previews, or turns; the analytics test passes already because it guards behavior that must not change.

- [ ] **Step 4: Write the front door**

Replace `src/lib/features/create/shared/components/CreateFrontDoor.svelte` with:

```svelte
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { onMount, untrack } from "svelte";
  import type { Section } from "$lib/shared/navigation/domain/types";
  import type { CreateFrontDoorSource } from "$lib/shared/navigation/state/navigation-state.svelte";
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import { getSettings } from "$lib/shared/application/state/app-state.svelte";
  import LastUsedBadge from "$lib/shared/components/LastUsedBadge.svelte";
  import {
    createRenderActivityGate,
    renderGateTarget,
  } from "$lib/shared/render-gating/render-activity-gate";
  import { runAfterNamedRouteMorphIdle } from "$lib/shared/transitions/named-route-morph-state.svelte";
  import {
    logCreateFrontDoorViewed,
    logCreateMethodSelected,
  } from "../services/create-entry-analytics";
  import { createMethodPreviewTurns } from "../state/method-preview-turns.svelte";
  import CreateMethodPreview from "./method-previews/CreateMethodPreview.svelte";
  import { methodPreviewHold } from "./method-previews/method-preview-hold";
  import { METHOD_PREVIEW_SCENES } from "./method-previews/method-preview-scenes";

  const METHOD_ORDER = new Map([
    ["construct", 0],
    ["generate", 1],
    ["shape-engine", 2],
    ["fuse", 3],
    ["tunnel", 4],
    ["assemble", 5],
  ]);

  const NO_LOCKED_METHODS: ReadonlySet<string> = new Set();

  let {
    methods,
    lockedMethodIds = NO_LOCKED_METHODS,
    active,
    source,
    lastUsedMode = null,
    onSelect,
    onLockedSelect,
  }: {
    methods: Section[];
    /** Methods a guest can see but needs a free account to open. They keep
     *  their place in the bento so the board never changes shape at sign-in. */
    lockedMethodIds?: ReadonlySet<string>;
    active: boolean;
    source: CreateFrontDoorSource;
    lastUsedMode?: string | null;
    onSelect: (methodId: string) => void;
    onLockedSelect?: (methodId: string) => void;
  } = $props();

  const orderedMethods = $derived(
    [...methods].sort(
      (a, b) =>
        (METHOD_ORDER.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
        (METHOD_ORDER.get(b.id) ?? Number.MAX_SAFE_INTEGER)
    )
  );
  let wasActive = false;
  let haptics: ReturnType<typeof getHapticFeedback> | null = null;

  // Each card shows its method at work, and the cards take turns (spec:
  // docs/superpowers/specs/2026-10-06-create-method-previews-design.md).
  // A method without a preview scene keeps its icon box.
  function hasScene(methodId: string): boolean {
    return Object.hasOwn(METHOD_PREVIEW_SCENES, methodId);
  }

  /** Cards whose scene has drawn its finished picture. */
  const readyIds = new Set<string>();

  const turns = createMethodPreviewTurns({
    order: () =>
      orderedMethods
        .filter((method) => hasScene(method.id))
        .map((method) => method.id),
    isReady: (methodId) => readyIds.has(methodId),
    defer: runAfterNamedRouteMorphIdle,
  });

  function handleReady(methodId: string): void {
    readyIds.add(methodId);
    turns.notifyReady(methodId);
  }

  // Turns pause while the page is hidden or the board is off screen.
  const previewGate = createRenderActivityGate({
    name: "create-method-previews",
  });

  // CreateModule keeps the front door mounted behind a workspace, so the
  // previews mount the first time the board opens, not on every Create route.
  let previewsWanted = $state(false);

  // The system setting reports changes through its media query.
  let systemMotion = $state(0);
  const appReducedMotion = $derived(getSettings().reducedMotion ?? false);

  onMount(() => {
    try {
      haptics = getHapticFeedback();
    } catch {
      // A browser without haptics still gets the complete button interaction.
    }

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotionChange = (): void => {
      systemMotion += 1;
    };
    motionQuery.addEventListener("change", onMotionChange);

    turns.setActive(previewGate.active);
    const unsubscribe = previewGate.subscribe((value) =>
      turns.setActive(value)
    );

    return () => {
      motionQuery.removeEventListener("change", onMotionChange);
      unsubscribe();
      previewGate.dispose();
      turns.dispose();
    };
  });

  // Opening the board starts two rounds and closing it ends them. A change
  // to either reduce-motion setting starts over, so the turns stop at once
  // when motion is reduced and come back when it is not.
  $effect(() => {
    const open = active;
    void systemMotion;
    void appReducedMotion;
    untrack(() => {
      if (!open) {
        turns.stop();
        return;
      }
      previewsWanted = true;
      turns.start();
    });
  });

  $effect(() => {
    if (active && !wasActive) {
      logCreateFrontDoorViewed({
        source,
        methodCount: orderedMethods.length,
      });
    }
    wasActive = active;
  });

  function selectMethod(methodId: string, trigger: HTMLButtonElement): void {
    const locked = lockedMethodIds.has(methodId);
    haptics?.trigger("selection");
    logCreateMethodSelected({
      method: methodId,
      source,
      isLastUsed: !locked && methodId === lastUsedMode,
      isLocked: locked,
    });
    trigger.blur();
    if (locked) {
      onLockedSelect?.(methodId);
      return;
    }
    // Choosing a method ends the turns.
    turns.stop();
    onSelect(methodId);
  }

  function accessibleName(method: Section): string | undefined {
    const values = {
      name: t(method.labelKey),
      description: t(method.descKey),
    };
    if (lockedMethodIds.has(method.id)) {
      return t("create_ui_account_method", values);
    }
    if (method.id === lastUsedMode) {
      return t("create_ui_last_used_method", values);
    }
    return undefined;
  }
</script>

<section class="front-door" aria-labelledby="create-front-door-title">
  <div class="front-door-inner" class:two-methods={orderedMethods.length === 2}>
    <header class="front-door-header">
      <h1 id="create-front-door-title">
        {t("create_ui_how_do_you_want_to_create")}
      </h1>
    </header>

    <div
      class="method-index"
      role="list"
      aria-label={t("create_ui_creation_methods")}
      data-method-count={orderedMethods.length}
      data-playing-method={turns.playingId}
      use:renderGateTarget={previewGate}
    >
      {#each orderedMethods as method (method.id)}
        <!-- On the two-column phone board Construct leads with its own row
             only when that leaves the rest in even pairs. -->
        <div
          class="method-item"
          class:primary-method={method.id === "construct" ||
            method.id === "generate"}
          class:default-method={method.id === "construct" &&
            orderedMethods.length % 2 === 1}
          role="listitem"
        >
          <button
            type="button"
            class="method-card"
            data-method-id={method.id}
            style:--method-color={method.color ?? "var(--theme-accent)"}
            aria-label={accessibleName(method)}
            onclick={(event) => selectMethod(method.id, event.currentTarget)}
            use:methodPreviewHold={{ turns, id: method.id }}
          >
            {#if lockedMethodIds.has(method.id)}
              <LastUsedBadge label={t("create_ui_account_badge")} />
            {:else if method.id === lastUsedMode}
              <LastUsedBadge />
            {/if}

            <span class="method-stage" aria-hidden="true">
              {#if hasScene(method.id)}
                {#if previewsWanted}
                  <CreateMethodPreview
                    methodId={method.id}
                    color={method.color ?? "var(--theme-accent)"}
                    playing={turns.playingId === method.id}
                    turn={turns.turn}
                    onready={handleReady}
                  />
                {/if}
              {:else}
                <span class="method-icon">{@html method.icon}</span>
              {/if}
            </span>

            <span class="method-copy">
              <span class="method-name"
                >{#if hasScene(method.id)}<span
                    class="method-glyph"
                    aria-hidden="true">{@html method.icon}</span
                  >{/if}{t(method.labelKey)}</span
              >
              {#if method.descKey}
                <span class="method-description">{t(method.descKey)}</span>
              {/if}
            </span>
          </button>
        </div>
      {/each}
    </div>
  </div>
</section>

<style>
  .front-door {
    width: 100%;
    height: 100%;
    overflow: auto;
    container: create-entry / size;
  }

  .front-door-inner {
    width: calc(100% - clamp(20px, 3cqi, 80px));
    min-height: 100%;
    margin: 0 auto;
    padding-block: clamp(20px, 4cqh, 52px);
    box-sizing: border-box;
    display: grid;
    grid-template-rows: auto minmax(min-content, 1fr);
    gap: clamp(16px, 2.5cqh, 24px);
  }

  .front-door-header {
    width: 100%;
  }

  h1 {
    margin: 0;
    color: var(--theme-text);
    font-size: var(--font-size-3xl, 1.875rem);
    font-weight: 720;
    line-height: 1.08;
    letter-spacing: -0.025em;
    text-wrap: balance;
  }

  /* Each card holds a stage for its preview, then its words. A strip stage
     sits above the words and takes the room its row has; a square stage
     sits beside them (spec: Placement). --preview-min is a strip's least
     height and --preview-side a square's side. Each tier sets both from the
     room its cards have, and a square never makes its card taller. */
  .method-index {
    --preview-min: 40px;
    --preview-side: clamp(40px, 9cqh, 62px);

    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    /* A card takes two rows, its stage and its words. Cards side by side
       share both, so their stages match and their names line up. */
    grid-auto-rows: 1fr auto;
    column-gap: 8px;
    row-gap: 16px;
    width: 100%;
    padding-top: 12px;
    box-sizing: border-box;
  }

  .method-item {
    min-width: 0;
    grid-row: span 2;
    display: grid;
    grid-template-rows: subgrid;
    grid-template-columns: minmax(0, 1fr);
  }

  .method-item.default-method {
    grid-column: 1 / -1;
  }

  .method-card {
    --last-used-badge-accent: var(--method-color);

    position: relative;
    grid-row: 1 / -1;
    width: 100%;
    min-width: 0;
    display: grid;
    grid-template-rows: subgrid;
    grid-template-columns: minmax(0, 1fr);
    row-gap: 12px;
    column-gap: 12px;
    padding: 14px;
    box-sizing: border-box;
    border: 1px solid
      color-mix(in srgb, var(--method-color) 30%, var(--theme-stroke));
    border-radius: var(--radius-2026-md, 14px);
    background: color-mix(
      in srgb,
      var(--method-color) 11%,
      var(--theme-card-bg)
    );
    color: var(--theme-text);
    text-align: left;
    cursor: pointer;
    transition:
      background-color var(--transition-normal),
      border-color var(--transition-normal);
  }

  /* Construct, alone on its row, sets its square beside its words. */
  .method-item.default-method .method-card {
    min-height: 92px;
    grid-template-rows: none;
    grid-template-columns: var(--preview-side) minmax(0, 1fr);
    align-items: center;
  }

  .method-card:hover {
    background: color-mix(
      in srgb,
      var(--method-color) 18%,
      var(--theme-card-bg)
    );
    border-color: color-mix(
      in srgb,
      var(--method-color) 58%,
      var(--theme-stroke-strong)
    );
  }

  .method-card:active {
    background: color-mix(
      in srgb,
      var(--method-color) 22%,
      var(--theme-card-bg)
    );
  }

  .method-card:focus-visible {
    z-index: 1;
    outline: 3px solid
      color-mix(in srgb, var(--method-color) 76%, var(--theme-text));
    outline-offset: 2px;
  }

  .method-stage {
    position: relative;
    grid-row: 1;
    grid-column: 1;
    display: grid;
    align-items: center;
    justify-items: start;
    min-width: 0;
    min-height: var(--preview-min);
    border-radius: var(--radius-2026-sm, 10px);
  }

  .method-item.default-method .method-stage {
    width: var(--preview-side);
    aspect-ratio: 1;
    min-height: 0;
    justify-items: center;
  }

  /* A method without a preview scene keeps its icon box in the stage. */
  .method-icon {
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    border: 1px solid
      color-mix(in srgb, var(--method-color) 42%, var(--theme-stroke));
    border-radius: var(--radius-2026-sm, 10px);
    background: color-mix(
      in srgb,
      var(--method-color) 20%,
      var(--theme-card-bg)
    );
    color: var(--method-color);
    font-size: var(--font-size-base, 1rem);
    flex: 0 0 auto;
  }

  .method-copy {
    grid-row: 2;
    grid-column: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .method-item.default-method .method-copy {
    grid-row: 1;
    grid-column: 2;
  }

  .method-name {
    color: var(--theme-text);
    font-size: var(--font-size-lg, 1.125rem);
    font-weight: 720;
    line-height: 1.15;
  }

  /* The method's icon stays beside its name. */
  .method-glyph {
    display: inline-block;
    margin-inline-end: 0.4em;
    color: var(--method-color);
    font-size: 0.9em;
  }

  .method-description {
    color: var(--theme-text-dim);
    font-size: var(--font-size-min, 14px);
    line-height: 1.42;
    text-wrap: pretty;
  }

  @container create-entry (min-width: 480px) and (max-width: 1199px) {
    .front-door-inner {
      width: calc(100% - 28px);
    }

    .method-index {
      --preview-min: clamp(44px, 6cqi, 56px);
      --preview-side: clamp(56px, 12cqi, 102px);
    }

    .method-card {
      --settings-method-icon-size: clamp(44px, 6cqi, 56px);
      column-gap: 14px;
      padding: 14px;
    }

    .method-item.default-method .method-card {
      min-height: 132px;
    }

    .method-icon {
      width: var(--settings-method-icon-size);
      height: var(--settings-method-icon-size);
      font-size: var(--font-size-lg, 1.125rem);
    }

    .method-name {
      font-size: clamp(1.125rem, 2.8cqi, 1.5rem);
    }

    .method-description {
      font-size: clamp(14px, 1.9cqi, 1rem);
    }
  }

  /* A landscape board is short, so every card sets its square beside its
     words and the rows share the height. */
  @container create-entry (min-width: 480px) and (max-width: 1199px) and (orientation: landscape) {
    .method-index {
      --preview-side: clamp(49px, min(18cqi, 20cqh), 140px);
      grid-auto-rows: minmax(min-content, 1fr);
    }

    .method-item {
      grid-row: auto;
      display: flex;
    }

    .method-card,
    .method-item.default-method .method-card {
      min-height: 132px;
      grid-template-rows: none;
      grid-template-columns: var(--preview-side) minmax(0, 1fr);
      align-items: start;
    }

    .method-stage,
    .method-item.default-method .method-stage {
      width: var(--preview-side);
      aspect-ratio: 1;
      min-height: 0;
      justify-items: center;
    }

    .method-copy,
    .method-item.default-method .method-copy {
      grid-row: 1;
      grid-column: 2;
    }
  }

  @container create-entry (max-width: 619px) {
    .two-methods .method-index {
      --preview-side: clamp(48px, 16cqi, 74px);
      grid-template-columns: minmax(0, 1fr);
      grid-auto-rows: 1fr;
    }

    .two-methods .method-item {
      grid-column: 1 / -1;
      grid-row: auto;
      display: flex;
    }

    .two-methods .method-card,
    .two-methods .method-item.default-method .method-card {
      min-height: 112px;
      grid-template-rows: none;
      grid-template-columns: var(--preview-side) minmax(0, 1fr);
      align-items: center;
      column-gap: 16px;
      padding: 18px;
    }

    .two-methods .method-stage,
    .two-methods .method-item.default-method .method-stage {
      width: var(--preview-side);
      aspect-ratio: 1;
      min-height: 0;
      justify-items: center;
    }

    .two-methods .method-copy,
    .two-methods .method-item.default-method .method-copy {
      grid-row: 1;
      grid-column: 2;
    }
  }

  /* Foldables keep two readable columns. Four secondary cards only fit
     once each card has room for its stage, padding, and description. */
  @container create-entry (min-width: 1200px) {
    .front-door-inner {
      width: calc(100% - clamp(48px, 6cqi, 160px));
      max-width: 1440px;
      grid-template-rows: auto auto;
      align-content: center;
      gap: 28px;
      padding-block: 40px;
    }

    /* Two primary cards fill the first row and the secondary cards share
       the second, so no card ever wraps alone. Three methods sit in one
       row of three. */
    .method-index {
      --preview-min: clamp(64px, 11cqh, 180px);
      --preview-side: clamp(72px, 9.5cqi, 134px);
      grid-template-columns: repeat(12, minmax(0, 1fr));
      grid-auto-rows: auto;
      column-gap: 20px;
      row-gap: 28px;
    }

    h1 {
      font-size: clamp(2.5rem, 3cqi, 3rem);
    }

    .method-item.primary-method {
      grid-column: span 6;
    }

    .method-item:not(.primary-method),
    .method-index[data-method-count="3"] .method-item {
      grid-column: span 4;
    }

    .method-index[data-method-count="4"] .method-item:not(.primary-method) {
      grid-column: span 6;
    }

    .method-index[data-method-count="6"] .method-item:not(.primary-method) {
      grid-column: span 3;
    }

    .method-card {
      --settings-method-icon-size: 48px;
      row-gap: 20px;
      column-gap: 20px;
      padding: 28px;
      background: color-mix(
        in srgb,
        var(--method-color) 6%,
        var(--theme-card-bg)
      );
    }

    /* Primary cards, and all three cards of a three-method board, set the
       square beside their words. */
    .method-item.primary-method .method-card,
    .method-index[data-method-count="3"] .method-card {
      min-height: 200px;
      grid-template-rows: none;
      grid-template-columns: var(--preview-side) minmax(0, 1fr);
      align-items: start;
      column-gap: 24px;
      padding: 32px;
    }

    .method-item.primary-method .method-card {
      --settings-method-icon-size: 72px;
      background: color-mix(
        in srgb,
        var(--method-color) 11%,
        var(--theme-card-bg)
      );
    }

    .method-item.primary-method .method-stage,
    .method-index[data-method-count="3"] .method-stage {
      width: var(--preview-side);
      aspect-ratio: 1;
      min-height: 0;
      justify-items: center;
    }

    .method-item.primary-method .method-copy,
    .method-index[data-method-count="3"] .method-copy {
      grid-row: 1;
      grid-column: 2;
    }

    .method-icon {
      width: var(--settings-method-icon-size);
      height: var(--settings-method-icon-size);
      font-size: 1.25rem;
    }

    .primary-method .method-icon {
      font-size: 1.75rem;
    }

    .method-copy {
      gap: 8px;
    }

    .method-name {
      font-size: 1.5rem;
    }

    .primary-method .method-name {
      font-size: 2rem;
    }

    .method-description {
      font-size: 1rem;
      max-width: 38ch;
      text-wrap: pretty;
    }

    .primary-method .method-description {
      font-size: 1.125rem;
    }
  }

  /* A larger window adds breathing room around the decision. It doesn't
     enlarge the controls or separate related choices across the monitor. */
  @container create-entry (min-width: 2000px) {
    .front-door-inner {
      max-width: 1600px;
    }
  }

  @container create-entry (max-height: 640px) and (min-width: 760px) {
    .front-door-inner {
      width: calc(100% - 28px);
      gap: 8px;
      padding-block: 6px 8px;
    }

    h1 {
      font-size: var(--font-size-3xl, 1.875rem);
    }

    .method-index {
      --preview-side: clamp(36px, 20cqh, 86px);
      grid-auto-rows: minmax(min-content, 1fr);
      column-gap: 6px;
      row-gap: 16px;
    }

    .method-item {
      grid-row: auto;
      display: flex;
    }

    .method-card,
    .method-item.primary-method .method-card,
    .method-item.default-method .method-card,
    .method-index[data-method-count="3"] .method-card {
      min-height: 104px;
      grid-template-rows: none;
      grid-template-columns: var(--preview-side) minmax(0, 1fr);
      align-items: start;
      column-gap: 10px;
      padding: 8px 12px;
    }

    .method-stage,
    .method-item.primary-method .method-stage,
    .method-item.default-method .method-stage,
    .method-index[data-method-count="3"] .method-stage {
      width: var(--preview-side);
      aspect-ratio: 1;
      min-height: 0;
      justify-items: center;
    }

    .method-copy,
    .method-item.primary-method .method-copy,
    .method-item.default-method .method-copy,
    .method-index[data-method-count="3"] .method-copy {
      grid-row: 1;
      grid-column: 2;
      gap: 2px;
    }

    .method-icon {
      width: 36px;
      height: 36px;
      font-size: var(--font-size-base, 1rem);
    }

    .primary-method .method-icon {
      font-size: var(--font-size-base, 1rem);
    }

    .method-name,
    .primary-method .method-name {
      font-size: var(--font-size-lg, 1.125rem);
    }

    .method-description,
    .primary-method .method-description {
      font-size: var(--font-size-min, 14px);
      line-height: 1.25;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .method-card {
      transition: none;
    }
  }
</style>
```

What changed against today's file, so a reviewer can check each part:

- Script: the scene check, the coordinator (its quiet-page wait is `runAfterNamedRouteMorphIdle`, the same wait the preview box uses before loading its scene), the render gate, `previewsWanted`, the reduce-motion restart, and `turns.stop()` on a choice. Haptics, analytics, and the accessible names are as they were.
- Markup: the board carries `data-playing-method` (the bench and the checks read it) and the render gate. Each card carries the hold action. The icon box became the stage, and the icon moved beside the name as an `aria-hidden` glyph.
- CSS: each card is a two-row subgrid of the board, so cards side by side share a stage height and a name line. Wherever a tier set the icon box's size, it now sets `--preview-min` or `--preview-side`, capped so the square fits inside the card's old least height: 92 px holds 62, 132 holds 102, 112 holds 74, 200 holds 134, and 104 holds 86. Type, colors, hover, focus, and transitions are unchanged.

- [ ] **Step 5: Composition B only: take the stages to the card edges**

Skip this step if Task 16 chose composition A.

Append these rules after the `prefers-reduced-motion` rule, at the end of the `<style>` block. They come after every tier, so they replace the stage's inset and size wherever it applies:

```css
  /* Composition B: each stage meets its card's edges. A strip stops 12px
     below the top edge, clear of the badge's 11px overhang; a square
     becomes a panel down the card's left side. */
  .method-stage {
    margin: -2px -14px 0;
    border-radius: 0;
  }

  .method-item.default-method .method-stage {
    align-self: stretch;
    width: auto;
    aspect-ratio: auto;
    margin: -14px 0 -14px -14px;
    border-radius: calc(var(--radius-2026-md, 14px) - 1px) 0 0
      calc(var(--radius-2026-md, 14px) - 1px);
  }

  @container create-entry (min-width: 480px) and (max-width: 1199px) and (orientation: landscape) {
    .method-stage,
    .method-item.default-method .method-stage {
      align-self: stretch;
      width: auto;
      aspect-ratio: auto;
      margin: -14px 0 -14px -14px;
      border-radius: calc(var(--radius-2026-md, 14px) - 1px) 0 0
        calc(var(--radius-2026-md, 14px) - 1px);
    }
  }

  @container create-entry (max-width: 619px) {
    .two-methods .method-stage,
    .two-methods .method-item.default-method .method-stage {
      align-self: stretch;
      width: auto;
      aspect-ratio: auto;
      margin: -18px 0 -18px -18px;
      border-radius: calc(var(--radius-2026-md, 14px) - 1px) 0 0
        calc(var(--radius-2026-md, 14px) - 1px);
    }
  }

  @container create-entry (min-width: 1200px) {
    .method-stage {
      margin: -16px -28px 0;
    }

    .method-item.primary-method .method-stage,
    .method-index[data-method-count="3"] .method-stage {
      align-self: stretch;
      width: auto;
      aspect-ratio: auto;
      margin: -32px 0 -32px -32px;
      border-radius: calc(var(--radius-2026-md, 14px) - 1px) 0 0
        calc(var(--radius-2026-md, 14px) - 1px);
    }
  }

  @container create-entry (max-height: 640px) and (min-width: 760px) {
    .method-stage,
    .method-item.primary-method .method-stage,
    .method-item.default-method .method-stage,
    .method-index[data-method-count="3"] .method-stage {
      align-self: stretch;
      width: auto;
      aspect-ratio: auto;
      margin: -8px 0 -8px -12px;
      border-radius: calc(var(--radius-2026-md, 14px) - 1px) 0 0
        calc(var(--radius-2026-md, 14px) - 1px);
    }
  }
```

Each margin cancels that tier's card padding: 14 px by default and in the 480 to 1199 tiers, 18 px on a two-method phone board, 28 px for a strip and 32 px for a square at 1200 and up, and 8 px by 12 px on a short screen. A panel taller than it is wide still takes the square composition, because `classifyPreviewShape` calls any box under 1.6 to 1 a square.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/create/create-front-door-previews.test.ts tests/unit/create/create-front-door-locked-methods.test.ts`
Expected: PASS (9 tests and 4 tests). The locked-method test mounts the real preview box; in jsdom it stays a tint because nothing reports a size, which is all that test needs.

- [ ] **Step 7: Format and type check**

```bash
cd /e/tka-platform && npx prettier --write /e/worktrees/tka-platform/create-method-previews/src/lib/features/create/shared/components/CreateFrontDoor.svelte /e/worktrees/tka-platform/create-method-previews/tests/unit/create/FakeMethodPreview.svelte /e/worktrees/tka-platform/create-method-previews/tests/unit/create/FrontDoorHost.svelte /e/worktrees/tka-platform/create-method-previews/tests/unit/create/create-front-door-previews.test.ts
```

Run `npm run check:fast` in the worktree (after the svelte-check gate). Expected: no errors in the changed files. Rerun Step 6 if Prettier changed the test or the component.

- [ ] **Step 8: Compare the layout with the baseline**

Steps 8 to 11 need the worktree preview on port 5191 (Before You Start) and the agent Chrome window visible. 154 page loads, about 12 minutes; run it with the Bash tool's `run_in_background`:

```bash
cd /c/Users/Austen/AppData/Local/Temp/create-method-previews && node front-door-check.mjs --out front-door/after.json --shots front-door/after-shots --compare front-door/before.json
```

Expected: `Measured 154 entries`, then `PASS: no regressions`. The check fails a card whose board scrolls further than before, whose text is clipped or leaves the card, whose stage overlaps its words or badge or is smaller than today's icon box, whose type changed, or whose row-mates differ in stage size or name line.

On a failure, change only that tier's `--preview-min` or `--preview-side`. Lower the clamp's upper bound for scrolling, clipping, or text leaving the card. Raise its lower bound for a stage smaller than the icon box. A stage size or name line that differs within a row means that row's cards are not sharing the subgrid rows (strips) or `--preview-side` (squares). Never shrink type or drop a description. After any CSS change, rerun the whole command, because one tier's clamp reaches several viewports.

Open four shots to check what the numbers cannot: `create_369x850_en.webp`, `bench-6_707x823_de.webp`, `bench-5_1440x900_en.webp`, and `bench-2_375x667_en.webp`. Each stage should hold a finished picture or its tint, never an empty box or a scene spilling past its stage.

- [ ] **Step 9: Compare with the scenes blocked**

A scene that fails to load must leave its stage tinted and the board unchanged. One locale is enough here, because the stage's size never depends on the scene:

```bash
cd /c/Users/Austen/AppData/Local/Temp/create-method-previews && node front-door-check.mjs --block-scenes --locales en --out front-door/after-blocked.json --compare front-door/before.json
```

Expected: `Measured 77 entries`, then `PASS: no regressions`.

- [ ] **Step 10: Compare the timing**

Run nothing heavy on the machine meanwhile:

```bash
cd /c/Users/Austen/AppData/Local/Temp/create-method-previews && node front-door-check.mjs --timing --out front-door/timing-after.json --compare front-door/timing-before.json
```

Expected: `PASS: no regressions`: the cards appear, and the page first paints, no later than the baseline allows (10 percent plus 100 ms). Copy any `FOLD CHECK` lines into the task notes. They name long frames with preview code in them, under 4x CPU slowdown; Task 19 measures those on the Fold, where the cost gate is decided.

- [ ] **Step 11: Look at it**

With the Chrome DevTools MCP, in the agent Chrome (never sign in there):

1. `new_page` at http://localhost:5191/test/create-method-previews?view=front-door&count=6, then `emulate` with viewport `707x823x2.625,mobile,touch`.
2. `evaluate_script` with this function, which records the turn order over one round (the call takes about 25 seconds):

```js
async () => {
  const board = document.querySelector(".method-index");
  const order = [];
  const end = performance.now() + 30000;
  while (performance.now() < end && order.length < 6) {
    const id = board?.getAttribute("data-playing-method");
    if (id && order.at(-1) !== id) order.push(id);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return order;
}
```

Expected: `["construct", "generate", "shape-engine", "fuse", "tunnel", "assemble"]`. An empty list means the gate saw a hidden page: bring the agent Chrome window to the front and run it again.

3. `take_screenshot` with `format: "webp"`, `quality: 70`, and `filePath` `C:/Users/Austen/AppData/Local/Temp/create-method-previews/front-door/look-bench-707x823.webp`, then open it. Every card shows its finished picture, and each icon sits beside its name.
4. `navigate_page` to http://localhost:5191/create, `emulate` with viewport `1440x900x1`, and run the step 2 function again. It lists the board's methods in board order; on a board of fewer than six, the list ends with Construct starting the second round. Take the same screenshot as `look-create-1440x900.webp`.
5. `list_console_messages`: no errors or warnings from the front door, the preview box, or a scene.

- [ ] **Step 12: Commit**

```bash
cd /e/worktrees/tka-platform/create-method-previews
git status --short
git add -- src/lib/features/create/shared/components/CreateFrontDoor.svelte tests/unit/create/FakeMethodPreview.svelte tests/unit/create/FrontDoorHost.svelte tests/unit/create/create-front-door-previews.test.ts
git commit -m "feat(create): live method previews on the Create front door" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/features/create/shared/components/CreateFrontDoor.svelte tests/unit/create/FakeMethodPreview.svelte tests/unit/create/FrontDoorHost.svelte tests/unit/create/create-front-door-previews.test.ts
```

---

### Task 19: Fold, Motion, and Network Checks

This task runs the spec's remaining checks on the finished front door and settles the fallbacks the spec leaves to the phone. It covers Verification 4 to 7: the real Fold (open in both orientations, and the cover screen); the motion checks (a full round on desktop and on the Fold, hover and keyboard replays, a turn cut mid-scene, a return from a method, and both reduce-motion settings); the Fold frame record against the cost gate (Spec Correction 19); and a clean console with no Firestore requests from the front door. Task 18 Step 8 already ran the seven viewports and 200% zoom, and Task 18's tests cover the selection analytics.

Run this task in the main session, not in a subagent: it asks Austen to handle his phone.

The checks are Node scripts in `<scratch>` that speak the DevTools protocol, like Task 17's layout check. `live-check.mjs` drives the agent Chrome. On the Fold, `fold-eval.mjs` runs one small probe at a time in the single tab it opened, and `fold-summary.mjs` judges three loads with previews against three loads with every scene blocked. Before this plan was written, the tools ran against a mock front door with planted faults: the clean mock passed, and each planted fault (a long frame in Generate's turn, a slow tunnel turn, a frame request at rest) failed with its own line.

Each check prints one line per finding and ends with a verdict:

- `PASS`: the check held.
- `FAIL`: a defect, or a cost over the gate. Step 14 says what to do.
- `NOTE`: context that decides nothing, such as a measured value within its limit, a long frame the page also has without previews, or a console message main also shows.
- `UNDECIDED` (Fold checks only): the runs cannot decide, for example because the screen went off. Fix the cause and run again.

**Files:**

- Create, not committed, in `<scratch>`: `cdp.mjs`, `live-check.mjs`, `fold-eval.mjs`, `fold-prelude.js`, `fold-round.js`, `fold-rest.js`, `fold-turn.js`, `fold-layout.js`, `fold-forget-sw.js`, `fold-summary.mjs`, `fold-run.sh`, `fold-shot.mjs`
- Results, not committed: `<scratch>/live/` and `<scratch>/fold/`
- Modify only when Step 14 sends you there: the files of Task 11 Step 10, Task 12 Step 10, or Task 14 Steps 14 to 21; `GenerateScene.svelte` and the Tunnel card's scene (Step 16); `method-preview-scenes.ts` and `tests/unit/create/method-preview-scenes.test.ts` (Step 18); and the spec (Steps 16 and 18)

Run the commands from `<scratch>` in Git Bash unless a step says PowerShell. Keep the worktree preview on port 5191 running, and keep the agent Chrome (port 9222) visible with the pointer off its window: a real pointer over it sends hover events of its own.

- [ ] **Step 1: Write the DevTools client**

Create `C:/Users/Austen/AppData/Local/Temp/create-method-previews/cdp.mjs`. It is the DevTools plumbing that `live-check.mjs` and `fold-eval.mjs` share: one socket with numbered requests and event listeners, a tab in a fresh signed-out browser context, navigation that waits for the load event, viewport emulation, WebP screenshots, and a visibility check that stops a run when the window is hidden. It works on a browser socket (the agent Chrome) or on one tab's own socket (the Fold).

```js
// cdp.mjs: a small DevTools protocol client for the Create method preview
// checks (live-check.mjs and fold-eval.mjs). Node 24 has fetch and WebSocket
// built in.
import { writeFileSync } from "node:fs";

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Opens one DevTools socket: a browser's, or a single page's. */
export async function connectSocket(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener(
      "error",
      () => reject(new Error(`Cannot open the DevTools socket ${url}`)),
      { once: true }
    );
  });
  let nextId = 0;
  const pending = new Map();
  const listeners = new Set();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id === undefined) {
      for (const listener of [...listeners]) listener(message);
      return;
    }
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) {
      waiter.reject(new Error(`${waiter.method}: ${message.error.message}`));
    } else {
      waiter.resolve(message.result);
    }
  });
  socket.addEventListener("close", () => {
    for (const waiter of pending.values()) {
      waiter.reject(new Error(`${waiter.method}: the DevTools socket closed`));
    }
    pending.clear();
  });
  function send(method, params = {}, sessionId) {
    nextId += 1;
    const id = nextId;
    const reply = new Promise((resolve, reject) =>
      pending.set(id, { method, resolve, reject })
    );
    socket.send(
      JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })
    );
    return reply;
  }
  // A page socket's events carry no session id, so `undefined` matches them.
  function on(method, sessionId, handler) {
    const listener = (message) => {
      if (message.method === method && message.sessionId === sessionId) {
        handler(message.params);
      }
    };
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
  function waitFor(method, sessionId, timeoutMs) {
    return new Promise((resolve, reject) => {
      const off = on(method, sessionId, (params) => {
        clearTimeout(timer);
        off();
        resolve(params);
      });
      const timer = setTimeout(() => {
        off();
        reject(new Error(`Timed out waiting for ${method}`));
      }, timeoutMs);
    });
  }
  return { send, on, waitFor, close: () => socket.close() };
}

/** The browser socket of a Chrome started with remote debugging. */
export async function connectBrowser(debug) {
  let version;
  try {
    version = await (await fetch(`${debug}/json/version`)).json();
  } catch {
    throw new Error(
      `No Chrome on ${debug}. Start the agent Chrome with scripts/launch-chrome-debug.ps1.`
    );
  }
  return connectSocket(version.webSocketDebuggerUrl);
}

/**
 * A blank tab in a fresh browser context (signed out, empty storage), with
 * the locale cookie the app reads. Needs a browser socket.
 */
export async function openPage(cdp, base, locale = "en") {
  const { browserContextId } = await cdp.send("Target.createBrowserContext", {
    disposeOnDetach: true,
  });
  const { targetId } = await cdp.send("Target.createTarget", {
    url: "about:blank",
    browserContextId,
  });
  const { sessionId } = await cdp.send("Target.attachToTarget", {
    targetId,
    flatten: true,
  });
  for (const domain of ["Page", "Runtime", "Network", "Log"]) {
    await cdp.send(`${domain}.enable`, {}, sessionId);
  }
  await cdp.send(
    "Emulation.setFocusEmulationEnabled",
    { enabled: true },
    sessionId
  );
  await cdp.send("Page.bringToFront", {}, sessionId);
  await cdp.send(
    "Network.setCookie",
    { name: "PARAGLIDE_LOCALE", value: locale, url: base },
    sessionId
  );
  return { browserContextId, targetId, sessionId };
}

export async function closePage(cdp, page) {
  await cdp.send("Target.closeTarget", { targetId: page.targetId });
  await cdp.send("Target.disposeBrowserContext", {
    browserContextId: page.browserContextId,
  });
}

/** `page` is openPage()'s result, or `{}` on a page socket. */
export async function evaluate(cdp, page, expression) {
  const { result, exceptionDetails } = await cdp.send(
    "Runtime.evaluate",
    { expression, awaitPromise: true, returnByValue: true },
    page.sessionId
  );
  if (exceptionDetails) {
    throw new Error(
      exceptionDetails.exception?.description ?? exceptionDetails.text
    );
  }
  return result.value;
}

export async function navigate(cdp, page, url) {
  const loaded = cdp.waitFor("Page.loadEventFired", page.sessionId, 60000);
  loaded.catch(() => {});
  const { errorText } = await cdp.send("Page.navigate", { url }, page.sessionId);
  if (errorText) throw new Error(`Navigation failed: ${errorText}`);
  await loaded;
}

export async function reload(cdp, page) {
  const loaded = cdp.waitFor("Page.loadEventFired", page.sessionId, 60000);
  loaded.catch(() => {});
  await cdp.send("Page.reload", {}, page.sessionId);
  await loaded;
}

export async function ensureVisible(cdp, page, hint) {
  const state = () => evaluate(cdp, page, "document.visibilityState");
  if ((await state()) === "visible") return;
  await cdp.send("Page.bringToFront", {}, page.sessionId);
  await sleep(500);
  if ((await state()) !== "visible") {
    throw new Error(
      hint ??
        "The agent Chrome window is hidden or fully covered. Bring it to the front and run again."
    );
  }
}

export async function emulate(cdp, page, viewport) {
  await cdp.send(
    "Emulation.setDeviceMetricsOverride",
    {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: viewport.dpr,
      mobile: viewport.mobile,
    },
    page.sessionId
  );
  await cdp.send(
    "Emulation.setTouchEmulationEnabled",
    viewport.mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false },
    page.sessionId
  );
}

export async function screenshot(cdp, page, file) {
  const { data } = await cdp.send(
    "Page.captureScreenshot",
    { format: "webp", quality: 70 },
    page.sessionId
  );
  writeFileSync(file, Buffer.from(data, "base64"));
}
```

- [ ] **Step 2: Write the live check**

Create `<scratch>/live-check.mjs`. Its modes:

- `rounds` opens the page in a fresh signed-out tab at 1440x900 and loads it twice: the first load lets the dev server compile the scenes, so no card misses its first turn. On the second load it records each change of the playing card, from before the page's own scripts run, and stops once the turns have rested for 5 seconds. It checks the board order, two full rounds in that order, the rest, a finished picture on every card, and no finger left showing. A console problem or Firebase request whose stack names preview code fails. On `/create`, every other console problem is checked against a list recorded on main (`--known`); on the bench, any console problem fails. `--shots <dir>` saves one picture 900 ms into each card's first turn.
- `console` records the distinct console problems on a page for 12 seconds and writes them to a file: the list `rounds --known` reads.
- `interact` runs four checks on `/create`. A: hovering a card plays it at once, the cut card puts its finger away, and the cut card plays next. B: keyboard focus plays a card and holds the turns while focus stays, and the turns go on once focus leaves the cards. C: a locked card opens the account dialog, the turns go on behind it, and Escape closes it; the dialog is never filled in. D: choosing a method ends the turns, and coming back through All methods starts them again from the first card. It moves the mouse and presses keys through the DevTools protocol.
- `reduce-system`, `reduce-app`, and `control` load the page at the open Fold's viewport with the system setting emulated (`prefers-reduced-motion: reduce`), with the app's own Reduce Motion setting (`reducedMotion: true` in the `tka-modern-web-settings` entry, written before the page's scripts run, in the fresh context only), or with neither. Under either setting no turn may start and every preview must show its finished picture; the control must start turns.

```js
// live-check.mjs: watches the Create front door's method previews in the
// agent Chrome over the DevTools protocol.
//
//   node live-check.mjs rounds [--base <origin>] [--path <route>]
//     [--shots <dir>] [--known <file.json>]
//   node live-check.mjs console --base <origin> --path <route> --out <file.json>
//   node live-check.mjs interact [--base <origin>]
//   node live-check.mjs reduce-system|reduce-app|control [--base <origin>]
//     [--path <route>]
//
// --base defaults to http://localhost:5191 and --path to the bench's front
// door. Write the route without its leading slash (--path create).
//
// Needs the agent Chrome on port 9222 (scripts/launch-chrome-debug.ps1) with
// its window visible. Keep the pointer off that window while a check runs:
// a real pointer over it sends hover events of its own.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  closePage,
  connectBrowser,
  emulate,
  ensureVisible,
  evaluate,
  navigate,
  openPage,
  reload,
  screenshot,
  sleep,
} from "./cdp.mjs";

const DEBUG = "http://127.0.0.1:9222";
const BENCH = "/test/create-method-previews?view=front-door&count=6";
const DESKTOP = { width: 1440, height: 900, dpr: 1, mobile: false };
const FOLD_OPEN = { width: 707, height: 823, dpr: 2.625, mobile: true };
const ROUNDS = 2;
const FIREBASE_HOST =
  /(?:^|\.)(?:firestore|firebaseio|identitytoolkit|securetoken|firebaseinstallations|firebasestorage)\./;
// The previews' own code. A problem or request it starts is theirs.
const PREVIEW_CODE =
  /method-previews\/|method-preview-turns|CreateFrontDoor\.svelte/;

const [mode, ...rest] = process.argv.slice(2);
const option = (name) => {
  const at = rest.indexOf(name);
  return at >= 0 ? rest[at + 1] : undefined;
};
const base = (option("--base") ?? "http://localhost:5191").replace(/\/+$/, "");
// Git Bash rewrites an argument that starts with "/" into a Windows path, so
// --path takes the route without its leading slash: --path create.
const pathArg = option("--path");
if (pathArg && /^[A-Za-z]:[\\/]/.test(pathArg)) {
  console.error(`--path became ${pathArg}; pass it without the leading slash`);
  process.exit(2);
}
const path =
  mode === "interact"
    ? "/create"
    : pathArg
      ? `/${pathArg.replace(/^\/+/, "")}`
      : BENCH;
const onBench = path.startsWith("/test/");

// Runs in the page before its scripts: every change of the playing card.
function recordTurns() {
  window.__turns = [];
  new MutationObserver((records) => {
    for (const record of records) {
      const id = record.target.getAttribute("data-playing-method");
      const last = window.__turns.at(-1);
      if ((last && last.id === id) || (!last && id === null)) continue;
      window.__turns.push({ id, at: performance.now() });
    }
  }).observe(document, {
    subtree: true,
    attributes: true,
    attributeFilter: ["data-playing-method"],
  });
}

// Runs in the page before its scripts: the app's own reduce-motion setting.
function appReducedMotion(origin) {
  if (location.origin !== origin) return;
  try {
    const key = "tka-modern-web-settings";
    const saved = JSON.parse(localStorage.getItem(key) ?? "{}");
    localStorage.setItem(
      key,
      JSON.stringify({ ...saved, reducedMotion: true })
    );
  } catch {
    // Storage is blocked; the check then fails on its own.
  }
}

// Runs in the page: the cards that hold a preview, in turn order.
async function previewOrder() {
  const deadline = performance.now() + 60000;
  while (!document.querySelector(".method-index .method-preview")) {
    if (performance.now() > deadline) {
      throw new Error("No .method-preview within 60 s");
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return [...document.querySelectorAll(".method-index .method-card")]
    .filter((card) => card.querySelector(".method-preview"))
    .map((card) => card.dataset.methodId);
}

// Runs in the page: the board right now. A preview is finished when the
// source it shows holds the scene, not the color tint.
function boardState() {
  const finished = (preview) => {
    const crossfade = preview.querySelector(".dual-source");
    const shown = crossfade
      ? [...crossfade.querySelectorAll(":scope > .source.active")]
      : [];
    return (
      shown.length > 0 &&
      shown.every(
        (source) =>
          source.firstElementChild !== null && !source.querySelector(".tint")
      )
    );
  };
  const cardOf = (element) =>
    element.closest(".method-card")?.dataset.methodId ?? null;
  const previews = [
    ...document.querySelectorAll(".method-index .method-preview"),
  ];
  const door = document.querySelector("section.front-door");
  const wrapper = door?.closest(".source");
  return {
    now: performance.now(),
    turns: window.__turns ?? [],
    playing:
      document
        .querySelector(".method-index")
        ?.getAttribute("data-playing-method") ?? null,
    previews: previews.length,
    finished: previews.filter(finished).length,
    finishedIds: previews.filter(finished).map(cardOf),
    ghostIds: [...document.querySelectorAll(".method-index .ghost")].map(
      cardOf
    ),
    // The bench has no workspace around the board, so its board is open.
    doorOpen: Boolean(door) && (!wrapper || wrapper.classList.contains("active")),
  };
}

// Runs in the page: each card, in DOM order.
function cardList() {
  return [...document.querySelectorAll(".method-index .method-card")].map(
    (card) => ({
      id: card.dataset.methodId,
      previewed: card.querySelector(".method-preview") !== null,
      locked:
        card.querySelector(".last-used-badge")?.textContent.trim() ===
        "Free account",
    })
  );
}

// Runs in the page: an element's center, and whether a click there lands on it.
function centerOf(selector) {
  const element = document.querySelector(selector);
  if (!element) return null;
  const box = element.getBoundingClientRect();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const hit = document.elementFromPoint(x, y);
  return { x, y, hits: hit !== null && element.contains(hit) };
}

// Runs in the page: the sidebar's way back to the methods.
function clickAllMethods() {
  const label = (element) => element.textContent.replace(/\s+/g, " ").trim();
  const control = [
    ...document.querySelectorAll(
      'button, a, [role="button"], [role="tab"], [role="menuitem"], [role="option"]'
    ),
  ].find(
    (element) =>
      (label(element) === "All methods" ||
        element.getAttribute("aria-label") === "All creation methods") &&
      element.getBoundingClientRect().width > 0 &&
      element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
  );
  if (!control) return false;
  control.click();
  return true;
}

const starts = (state) => state.turns.filter((turn) => turn.id !== null);
const cardSelector = (id) => `.method-index .method-card[data-method-id="${id}"]`;
const HEADING = "#create-front-door-title";

function normalize(text) {
  return String(text)
    .replace(/https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?/g, "<origin>")
    .replace(/[?&](?:v|t)=[\w.-]+/g, "")
    .replace(/:\d+:\d+/g, "")
    .replace(/chunk-[A-Z0-9]{8}/g, "chunk-*")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
}

function stackUrls(stack) {
  const urls = [];
  for (let part = stack; part; part = part.parent) {
    for (const frame of part.callFrames ?? []) urls.push(frame.url);
  }
  return urls;
}

/** Console problems, page errors, and Firebase requests, with the code
 *  that started each one. */
async function watch(cdp, page) {
  const problems = [];
  const firebase = [];
  await cdp.send(
    "Runtime.setAsyncCallStackDepth",
    { maxDepth: 32 },
    page.sessionId
  );
  cdp.on("Runtime.consoleAPICalled", page.sessionId, (event) => {
    if (!["error", "warning", "assert"].includes(event.type)) return;
    problems.push({
      kind: event.type,
      text: event.args
        .map((arg) => arg.value ?? arg.description ?? arg.type)
        .join(" "),
      urls: stackUrls(event.stackTrace),
    });
  });
  cdp.on("Runtime.exceptionThrown", page.sessionId, ({ exceptionDetails }) => {
    problems.push({
      kind: "exception",
      text: exceptionDetails.exception?.description ?? exceptionDetails.text,
      urls: [exceptionDetails.url, ...stackUrls(exceptionDetails.stackTrace)],
    });
  });
  cdp.on("Log.entryAdded", page.sessionId, ({ entry }) => {
    if (entry.level !== "error" && entry.level !== "warning") return;
    problems.push({
      kind: `log ${entry.level}`,
      text: entry.url ? `${entry.text} ${entry.url}` : entry.text,
      urls: [entry.url, ...stackUrls(entry.stackTrace)],
    });
  });
  cdp.on("Network.requestWillBeSent", page.sessionId, (event) => {
    let host = "";
    try {
      host = new URL(event.request.url).hostname;
    } catch {
      return;
    }
    if (!FIREBASE_HOST.test(host)) return;
    firebase.push({
      url: event.request.url.split("?")[0],
      urls: [event.initiator.url, ...stackUrls(event.initiator.stack)],
    });
  });
  return { problems, firebase };
}

const fromPreviews = (item) =>
  item.urls.some((url) => url && PREVIEW_CODE.test(url)) ||
  PREVIEW_CODE.test(item.text ?? "");

async function addPrelude(cdp, page, source) {
  await cdp.send(
    "Page.addScriptToEvaluateOnNewDocument",
    { source },
    page.sessionId
  );
}

async function state(cdp, page) {
  return evaluate(cdp, page, `(${boardState})()`);
}

/** Polls the board until `test` holds; null when `ms` runs out. */
async function waitForState(cdp, page, test, ms) {
  const deadline = Date.now() + ms;
  for (;;) {
    const now = await state(cdp, page);
    if (test(now)) return now;
    if (Date.now() > deadline) return null;
    await sleep(100);
  }
}

const allFinished = (now) => now.previews > 0 && now.finished === now.previews;

async function mouseMove(cdp, page, point) {
  await cdp.send(
    "Input.dispatchMouseEvent",
    { type: "mouseMoved", x: point.x, y: point.y },
    page.sessionId
  );
}

async function click(cdp, page, point) {
  await mouseMove(cdp, page, point);
  for (const type of ["mousePressed", "mouseReleased"]) {
    await cdp.send(
      "Input.dispatchMouseEvent",
      { type, x: point.x, y: point.y, button: "left", clickCount: 1 },
      page.sessionId
    );
  }
}

async function press(cdp, page, key) {
  const code = { Tab: 9, Escape: 27 }[key];
  const event = {
    key,
    code: key,
    windowsVirtualKeyCode: code,
    nativeVirtualKeyCode: code,
  };
  await cdp.send(
    "Input.dispatchKeyEvent",
    { type: "rawKeyDown", ...event },
    page.sessionId
  );
  await cdp.send(
    "Input.dispatchKeyEvent",
    { type: "keyUp", ...event },
    page.sessionId
  );
}

async function pointAt(cdp, page, selector) {
  const point = await evaluate(
    cdp,
    page,
    `(${centerOf})(${JSON.stringify(selector)})`
  );
  if (!point) throw new Error(`No ${selector} on the page`);
  if (!point.hits) throw new Error(`Something covers the center of ${selector}`);
  return point;
}

function report(lines) {
  for (const line of lines) console.log(line);
  const failed = lines.filter((line) => line.startsWith("FAIL")).length;
  console.log(failed === 0 ? "PASS" : `${failed} failures`);
  process.exitCode = failed === 0 ? 0 : 1;
}

async function runRounds(cdp) {
  const knownFile = option("--known");
  const known = new Set(
    knownFile ? JSON.parse(readFileSync(knownFile, "utf8")) : []
  );
  const shots = option("--shots");
  if (shots) mkdirSync(shots, { recursive: true });
  const page = await openPage(cdp, base);
  const lines = [];
  try {
    await emulate(cdp, page, DESKTOP);
    const seen = await watch(cdp, page);
    await addPrelude(cdp, page, `(${recordTurns})()`);
    // The first load compiles the scenes. The second load is the one
    // watched, so no card misses its turn while the dev server compiles.
    await navigate(cdp, page, base + path);
    await ensureVisible(cdp, page);
    await evaluate(cdp, page, `(${previewOrder})()`);
    await waitForState(cdp, page, allFinished, 60000);
    await reload(cdp, page);
    await ensureVisible(cdp, page);
    const order = await evaluate(cdp, page, `(${previewOrder})()`);
    const expected = order.length * ROUNDS;
    const begun = Date.now();
    let now;
    let shot = 0;
    for (;;) {
      now = await state(cdp, page);
      const started = starts(now);
      if (shots && shot < Math.min(started.length, order.length)) {
        // One picture about 900 ms into each card's first turn.
        const turn = started[shot];
        await sleep(Math.max(0, 900 - (now.now - turn.at)));
        await screenshot(cdp, page, join(shots, `${shot + 1}-${turn.id}.webp`));
        shot += 1;
        continue;
      }
      const last = now.turns.at(-1);
      const quiet = last ? now.now - last.at : now.now;
      if (last?.id === null && quiet >= (started.length >= expected ? 5000 : 8000)) {
        break;
      }
      if (started.length === 0 && Date.now() - begun > 20000) break;
      if (Date.now() - begun > 90000) break;
      await sleep(200);
    }
    const ids = starts(now).map((turn) => turn.id);
    lines.push(`order: ${order.join(", ")}`);
    lines.push(`turns: ${ids.join(", ")}`);
    const lengths = now.turns
      .slice(0, -1)
      .map((turn, index) => ({ turn, end: now.turns[index + 1].at }))
      .filter(({ turn }) => turn.id !== null)
      .map(({ turn, end }) => Math.round(end - turn.at));
    if (lengths.length > 0) {
      lines.push(
        `turn lengths: ${Math.min(...lengths)} to ${Math.max(...lengths)} ms`
      );
    }
    if (lengths.some((length) => length < 2700 || length > 3600)) {
      lines.push(`NOTE a turn ran outside 2700 to 3600 ms: ${lengths.join(", ")}`);
    }
    if (order.length === 0) lines.push("FAIL no card shows a preview");
    if (ids.length !== expected) {
      lines.push(`FAIL ${ids.length} turns started; expected ${expected}`);
    }
    for (let round = 0; round < ROUNDS; round += 1) {
      const got = ids.slice(round * order.length, (round + 1) * order.length);
      if (got.join() !== order.join()) {
        lines.push(`FAIL round ${round + 1} went ${got.join(", ") || "nowhere"}`);
      }
    }
    const last = now.turns.at(-1);
    if (!last || last.id !== null || now.now - last.at < 5000) {
      lines.push("FAIL the turns did not come to rest");
    }
    if (now.finished !== now.previews) {
      lines.push(
        `FAIL ${now.previews - now.finished} of ${now.previews} previews show no finished picture at rest`
      );
    }
    if (now.ghostIds.length > 0) {
      lines.push(`FAIL a finger remains at rest on ${now.ghostIds.join(", ")}`);
    }
    const texts = new Map();
    for (const problem of seen.problems) {
      const text = `${problem.kind}: ${normalize(problem.text)}`;
      const mine = fromPreviews(problem);
      texts.set(text, (texts.get(text) ?? false) || mine);
    }
    for (const [text, mine] of texts) {
      const bare = text.slice(text.indexOf(": ") + 2);
      if (mine) {
        lines.push(`FAIL preview code reported ${text}`);
      } else if (known.has(bare)) {
        lines.push(`NOTE also on main: ${text}`);
      } else if (onBench) {
        lines.push(`FAIL the bench reported ${text}`);
      } else {
        lines.push(`NOTE not seen on main: ${text}`);
      }
    }
    for (const url of new Set(seen.firebase.map((request) => request.url))) {
      const mine = seen.firebase.some(
        (request) => request.url === url && fromPreviews(request)
      );
      lines.push(
        mine
          ? `FAIL preview code requested ${url}`
          : `NOTE a Firebase request not started by preview code: ${url}`
      );
    }
  } finally {
    await closePage(cdp, page);
  }
  report(lines);
}

async function runConsole(cdp) {
  const out = option("--out");
  if (!out) throw new Error("console needs --out <file.json>");
  const page = await openPage(cdp, base);
  let seen;
  try {
    await emulate(cdp, page, DESKTOP);
    seen = await watch(cdp, page);
    await navigate(cdp, page, base + path);
    await ensureVisible(cdp, page);
    await sleep(12000);
  } finally {
    await closePage(cdp, page);
  }
  const list = [
    ...new Set(seen.problems.map((problem) => normalize(problem.text))),
  ].sort();
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(list, null, 2));
  console.log(`${list.length} distinct problems on ${base}${path}`);
  for (const text of list) console.log(`  ${text}`);
}

/** A reloaded board with every preview finished and the pointer parked. */
async function freshBoard(cdp, page) {
  await reload(cdp, page);
  await ensureVisible(cdp, page);
  await evaluate(cdp, page, `(${previewOrder})()`);
  if (!(await waitForState(cdp, page, allFinished, 30000))) {
    throw new Error("The previews did not finish within 30 s");
  }
  await mouseMove(cdp, page, await pointAt(cdp, page, HEADING));
  return evaluate(cdp, page, `(${cardList})()`);
}

// A: hovering a card plays it at once, cuts the running turn, and the cut
// turn plays next.
async function hoverCheck(cdp, page, lines) {
  const cards = await freshBoard(cdp, page);
  const first = await waitForState(cdp, page, (now) => now.playing !== null, 8000);
  if (!first) {
    lines.push("FAIL A: no turn started within 8 s");
    return;
  }
  const cut = first.playing;
  const target = cards.find(
    (card) => card.previewed && card.id !== cut && first.finishedIds.includes(card.id)
  )?.id;
  if (!target) {
    lines.push("FAIL A: no other card is ready");
    return;
  }
  await mouseMove(cdp, page, await pointAt(cdp, page, cardSelector(target)));
  const hovered = Date.now();
  const playing = await waitForState(cdp, page, (now) => now.playing === target, 1200);
  if (!playing) {
    lines.push(`FAIL A: hovering ${target} did not play it within 1.2 s`);
    return;
  }
  lines.push(`PASS A: hovering ${target} played it after ${Date.now() - hovered} ms`);
  const cleared = await waitForState(
    cdp,
    page,
    (now) => !now.ghostIds.includes(cut),
    1000
  );
  lines.push(
    cleared
      ? `PASS A: ${cut} put its finger away`
      : `FAIL A: ${cut} still shows its finger 1 s after the cut`
  );
  const mark = playing.turns.length;
  await mouseMove(cdp, page, await pointAt(cdp, page, HEADING));
  const next = await waitForState(
    cdp,
    page,
    (now) => now.turns.slice(mark).some((turn) => turn.id !== null),
    6000
  );
  const nextId = next?.turns.slice(mark).find((turn) => turn.id !== null).id;
  lines.push(
    nextId === cut
      ? `PASS A: ${cut} played again after the hover`
      : `FAIL A: after the hover the next turn was ${nextId ?? "none within 6 s"}; expected ${cut}`
  );
}

// B: a focused card plays, holds the turns while focus stays, and lets them
// go on blur.
async function focusCheck(cdp, page, lines) {
  const cards = await freshBoard(cdp, page);
  if (!(await waitForState(cdp, page, (now) => now.playing !== null, 8000))) {
    lines.push("FAIL B: no turn started within 8 s");
    return;
  }
  await click(cdp, page, await pointAt(cdp, page, HEADING));
  await press(cdp, page, "Tab");
  await press(cdp, page, "Tab");
  const focus = () =>
    evaluate(cdp, page, "document.activeElement?.dataset?.methodId ?? null");
  const second = cards[1];
  if ((await focus()) !== second.id) {
    lines.push(`FAIL B: two Tabs from the heading focused ${await focus()}; expected ${second.id}`);
    return;
  }
  if (second.previewed) {
    const playing = await waitForState(
      cdp,
      page,
      (now) => now.playing === second.id,
      1200
    );
    if (!playing) {
      lines.push(`FAIL B: focusing ${second.id} did not play it within 1.2 s`);
      return;
    }
    lines.push(`PASS B: focusing ${second.id} played it`);
    const ended = await waitForState(
      cdp,
      page,
      (now) => now.playing === null,
      4500
    );
    if (!ended) {
      lines.push(`FAIL B: the focused turn of ${second.id} did not end`);
      return;
    }
    await sleep(4000);
    const held = await state(cdp, page);
    lines.push(
      starts(held).length === starts(ended).length
        ? "PASS B: no turn started for 4 s while focus stayed"
        : `FAIL B: ${starts(held).at(-1).id} started while ${second.id} had focus`
    );
  } else {
    lines.push(`SKIP B: ${second.id} has no preview`);
  }
  await press(cdp, page, "Tab");
  const third = cards[2];
  if ((await focus()) !== third.id) {
    lines.push(`FAIL B: Tab moved focus to ${await focus()}; expected ${third.id}`);
    return;
  }
  if (third.previewed) {
    const playing = await waitForState(
      cdp,
      page,
      (now) => now.playing === third.id,
      1200
    );
    lines.push(
      playing
        ? `PASS B: focusing ${third.id} played it`
        : `FAIL B: focusing ${third.id} did not play it within 1.2 s`
    );
  }
  const mark = (await state(cdp, page)).turns.length;
  await click(cdp, page, await pointAt(cdp, page, HEADING));
  const resumed = await waitForState(
    cdp,
    page,
    (now) =>
      now.turns
        .slice(mark)
        .some((turn) => turn.id !== null && turn.id !== third.id),
    6000
  );
  lines.push(
    resumed
      ? "PASS B: the turns went on after focus left the cards"
      : "FAIL B: no turn started within 6 s after focus left the cards"
  );
}

// C: a locked card opens the account dialog, the turns go on behind it, and
// Escape closes it. The dialog is never filled in.
async function lockedCheck(cdp, page, lines) {
  const cards = await freshBoard(cdp, page);
  const locked = cards.find((card) => card.locked);
  if (!locked) {
    lines.push("SKIP C: no card shows the Free account badge");
    return;
  }
  const dialogOpen = () =>
    evaluate(
      cdp,
      page,
      'document.querySelector("dialog.contextual-auth-shell[open]") !== null'
    );
  await click(cdp, page, await pointAt(cdp, page, cardSelector(locked.id)));
  let open = false;
  for (let waited = 0; waited <= 2000 && !open; waited += 100) {
    open = await dialogOpen();
    if (!open) await sleep(100);
  }
  if (!open) {
    lines.push(`FAIL C: choosing ${locked.id} did not open the account dialog within 2 s`);
    return;
  }
  lines.push(`PASS C: choosing ${locked.id} opened the account dialog`);
  const before = starts(await state(cdp, page)).length;
  await mouseMove(cdp, page, { x: 5, y: 5 });
  const moved = await waitForState(
    cdp,
    page,
    (now) => starts(now).length > before,
    5000
  );
  lines.push(
    moved
      ? "PASS C: the turns went on behind the dialog"
      : "FAIL C: no turn started within 5 s behind the dialog"
  );
  await press(cdp, page, "Escape");
  for (let waited = 0; waited <= 2000 && open; waited += 100) {
    open = await dialogOpen();
    if (open) await sleep(100);
  }
  lines.push(
    open
      ? "FAIL C: Escape did not close the account dialog within 2 s"
      : "PASS C: Escape closed the account dialog"
  );
}

// D: choosing a method ends the turns; coming back to the methods starts
// them again from the first card.
async function chooseCheck(cdp, page, lines) {
  const cards = await freshBoard(cdp, page);
  const chosen = cards.find((card) => card.previewed && !card.locked);
  const first = cards.find((card) => card.previewed);
  if (!chosen) {
    lines.push("SKIP D: no open card has a preview");
    return;
  }
  await click(cdp, page, await pointAt(cdp, page, cardSelector(chosen.id)));
  const hidden = await waitForState(cdp, page, (now) => !now.doorOpen, 3000);
  if (!hidden) {
    lines.push(`FAIL D: choosing ${chosen.id} did not hide the front door within 3 s`);
    return;
  }
  await sleep(3000);
  const later = await state(cdp, page);
  lines.push(
    starts(later).length === starts(hidden).length && later.playing === null
      ? `PASS D: choosing ${chosen.id} ended the turns`
      : `FAIL D: a turn ran after ${chosen.id} was chosen`
  );
  const mark = later.turns.length;
  if (!(await evaluate(cdp, page, `(${clickAllMethods})()`))) {
    lines.push(
      "SKIP D: no visible All methods control; check the way back by hand in DevTools"
    );
    return;
  }
  const back = await waitForState(
    cdp,
    page,
    (now) =>
      now.doorOpen && now.turns.slice(mark).some((turn) => turn.id !== null),
    4000
  );
  const nextId = back?.turns.slice(mark).find((turn) => turn.id !== null).id;
  lines.push(
    nextId === first.id
      ? `PASS D: back at the methods, ${first.id} played first`
      : `FAIL D: back at the methods, the first turn was ${nextId ?? "none within 4 s"}; expected ${first.id}`
  );
}

async function runInteract(cdp) {
  const page = await openPage(cdp, base);
  const lines = [];
  try {
    await emulate(cdp, page, DESKTOP);
    await addPrelude(cdp, page, `(${recordTurns})()`);
    await navigate(cdp, page, base + path);
    await ensureVisible(cdp, page);
    for (const check of [hoverCheck, focusCheck, lockedCheck, chooseCheck]) {
      try {
        await check(cdp, page, lines);
      } catch (error) {
        lines.push(`FAIL ${check.name}: ${error.message}`);
      }
    }
  } finally {
    await closePage(cdp, page);
  }
  report(lines);
}

async function runMotion(cdp) {
  const page = await openPage(cdp, base);
  const lines = [];
  try {
    await emulate(cdp, page, FOLD_OPEN);
    if (mode === "reduce-system") {
      await cdp.send(
        "Emulation.setEmulatedMedia",
        { features: [{ name: "prefers-reduced-motion", value: "reduce" }] },
        page.sessionId
      );
    }
    if (mode === "reduce-app") {
      await addPrelude(
        cdp,
        page,
        `(${appReducedMotion})(${JSON.stringify(base)})`
      );
    }
    await addPrelude(cdp, page, `(${recordTurns})()`);
    await navigate(cdp, page, base + path);
    await ensureVisible(cdp, page);
    await evaluate(cdp, page, `(${previewOrder})()`);
    const settled = await waitForState(cdp, page, allFinished, 30000);
    await sleep(8000);
    const now = await state(cdp, page);
    const count = starts(now).length;
    lines.push(`${mode}: ${count} turns, ${now.finished} of ${now.previews} previews finished`);
    if (!settled) lines.push("FAIL the previews did not finish within 30 s");
    if (mode === "control") {
      if (count === 0) lines.push("FAIL no turn started with motion allowed");
    } else {
      if (count > 0) lines.push(`FAIL ${count} turns started with motion reduced`);
      if (now.finished !== now.previews) {
        lines.push("FAIL a preview shows no finished picture");
      }
      if (now.ghostIds.length > 0) lines.push("FAIL a finger is showing");
    }
  } finally {
    await closePage(cdp, page);
  }
  report(lines);
}

const runs = {
  rounds: runRounds,
  console: runConsole,
  interact: runInteract,
  "reduce-system": runMotion,
  "reduce-app": runMotion,
  control: runMotion,
};
if (!runs[mode]) {
  console.error(
    "Usage: node live-check.mjs <rounds|console|interact|reduce-system|reduce-app|control> [--base <origin>] [--path <path>] [--shots <dir>] [--known <file.json>] [--out <file.json>]"
  );
  process.exit(2);
}
let cdp;
try {
  cdp = await connectBrowser(DEBUG);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
try {
  await runs[mode](cdp);
} catch (error) {
  console.error(`FAIL ${error.message}`);
  process.exitCode = 1;
} finally {
  cdp.close();
}
```

Check that both files parse:

```bash
cd /c/Users/Austen/AppData/Local/Temp/create-method-previews && node --check cdp.mjs && node --check live-check.mjs
```

Expected: no output.

- [ ] **Step 3: Watch two rounds on the bench**

```bash
cd /c/Users/Austen/AppData/Local/Temp/create-method-previews && node live-check.mjs rounds --shots live/bench-shots
```

Expected, after about a minute:

```
order: construct, generate, shape-engine, fuse, tunnel, assemble
turns: construct, generate, shape-engine, fuse, tunnel, assemble, construct, generate, shape-engine, fuse, tunnel, assemble
turn lengths: A to B ms
PASS
```

A and B, the shortest and longest turn, sit near 3000. `NOTE a turn ran outside 2700 to 3600 ms` means a turn ended early or late; it decides nothing alone, but look at that card's picture. Open the six pictures in `live/bench-shots/` (`1-construct.webp` to `6-assemble.webp`) with the Read tool: each shows its card mid-turn, with a finger only on the playing card.

- [ ] **Step 4: Watch two rounds on the Create tab, against main**

A signed-out `/create` loads the app's own start-up code, Firebase included, so its console is compared with main's. Record main's first, on Austen's dev server. Only read from it: never start, stop, or restart it.

```bash
curl.exe -k -g -s -I "https://[::1]:5173/" | head -1
```

Expected: `HTTP/2 200`. If it fails, skip the comparison: run the `rounds` command below without `--known`, and read each `NOTE not seen on main` line yourself.

```bash
cd /c/Users/Austen/AppData/Local/Temp/create-method-previews && node live-check.mjs console --base https://localhost:5173 --path create --out live/known-5173.json
```

Expected: `N distinct problems on https://localhost:5173/create`, then the list, which may be empty.

```bash
cd /c/Users/Austen/AppData/Local/Temp/create-method-previews && node live-check.mjs rounds --path create --known live/known-5173.json
```

Expected: the signed-out board's methods in `order`, each of them twice in `turns`, and `PASS`. The NOTE lines mean:

- `NOTE also on main: ...`: main shows the same message, so it is not this work's.
- `NOTE not seen on main: ...`: read it. If its text names the front door, a preview, or a scene, it is this work's: fix it. Otherwise (a message that differs from load to load, such as a timing warning), list it in the report.
- `NOTE a Firebase request not started by preview code: <url>`: the app's own Firebase start-up on `/create`. Expected; the check has already cleared the previews of it.

`FAIL preview code reported ...` and `FAIL preview code requested <url>` are this work's: fix the cause (the spec allows no Firestore from the front door) and run the check again.

- [ ] **Step 5: Hover, keyboard, a locked card, and the way back**

```bash
cd /c/Users/Austen/AppData/Local/Temp/create-method-previews && node live-check.mjs interact
```

Expected, after about a minute, on the signed-out board (Fuse is the first card a guest cannot open):

```
PASS A: hovering generate played it after N ms
PASS A: construct put its finger away
PASS A: construct played again after the hover
PASS B: focusing generate played it
PASS B: no turn started for 4 s while focus stayed
PASS B: focusing shape-engine played it
PASS B: the turns went on after focus left the cards
PASS C: choosing fuse opened the account dialog
PASS C: the turns went on behind the dialog
PASS C: Escape closed the account dialog
PASS D: choosing construct ended the turns
PASS D: back at the methods, construct played first
PASS
```

N is under 1200 (the hover delay is 350 ms). A `SKIP` line means the board lacked what that check needs (no locked card, or no visible All methods control): run that check by hand with the DevTools MCP and say so in the report. A FAIL is a behavior defect. Write a failing test for it first, in `tests/unit/create/method-preview-turns.test.ts` for timing and holds or in `tests/unit/create/create-front-door-previews.test.ts` for the board's wiring, then fix it and run the check again.

- [ ] **Step 6: Both reduce-motion settings**

```bash
cd /c/Users/Austen/AppData/Local/Temp/create-method-previews && node live-check.mjs reduce-system --path create && node live-check.mjs reduce-app --path create && node live-check.mjs control --path create
```

Expected:

```
reduce-system: 0 turns, P of P previews finished
PASS
reduce-app: 0 turns, P of P previews finished
PASS
control: T turns, P of P previews finished
PASS
```

P is the number of cards with a preview, and T is above 0. The control shows that the two reduced runs held still because of the setting, not because turns never start at that viewport.

- [ ] **Step 7: Write the Fold runner**

Create `<scratch>/fold-eval.mjs`. It never touches the Fold's other tabs: `--open` creates one tab with `PUT /json/new` and saves its id in a target file, every probe connects to that tab's own socket (never the browser's), and `--close` closes that tab. Before a probe it can install a `--prelude` (a script that runs before the page's own on the next load), disable the HTTP cache and bypass the service worker (`--no-cache`), fail the requests that match a pattern (`--block`, for the loads without previews), and reload. It then checks that the page is visible, runs the probe with any `--arg` values, and writes the result to `--out`. Everything it turns on is turned off again before it disconnects. `--emulate` makes the agent Chrome stand in for the Fold: the open Fold's viewport and a 4x slower CPU.

```js
// fold-eval.mjs: runs one probe in the Create tab this check opened in the
// Fold's Chrome, through `adb forward tcp:9223 localabstract:chrome_devtools_remote`.
// It talks only to that tab: it never lists the phone's tabs and never opens
// the browser socket.
//
//   node fold-eval.mjs --open <url> [--debug <origin>] [--target <file>]
//   node fold-eval.mjs --close [--debug <origin>] [--target <file>]
//   node fold-eval.mjs <probe.js> [--debug <origin>] [--target <file>]
//     [--emulate] [--navigate <url> | --reload] [--prelude <file.js>]
//     [--block <pattern,pattern>] [--no-cache] [--arg key=value]... [--out <file>]
//
// --emulate makes the agent Chrome stand in for the Fold: the open Fold's
// viewport and a 4x slower CPU. Emulation ends with each call, so a stand-in
// passes it on every call.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { connectSocket, emulate, ensureVisible, evaluate, navigate, reload } from "./cdp.mjs";

const FOLD_OPEN = { width: 707, height: 823, dpr: 2.625, mobile: true };

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};
const debug = option("--debug") ?? "http://127.0.0.1:9223";
const targetFile = option("--target") ?? "fold/target.json";
const source = (file) => readFileSync(file, "utf8").trim().replace(/;$/, "");

async function request(url, method = "GET") {
  const response = await fetch(url, { method });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${url}: ${response.status} ${text}`);
  }
  // Chrome labels every reply as JSON, but activate and close answer in
  // plain text ("Target activated").
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

if (flag("--open")) {
  const url = option("--open");
  const target = await request(
    `${debug}/json/new?${encodeURIComponent(url)}`,
    "PUT"
  );
  mkdirSync(dirname(targetFile), { recursive: true });
  writeFileSync(targetFile, JSON.stringify(target, null, 2));
  await request(`${debug}/json/activate/${target.id}`);
  console.log(`Opened ${url} as tab ${target.id}`);
  process.exit(0);
}

if (!existsSync(targetFile)) {
  console.error(`No ${targetFile}. Open the tab first with --open <url>.`);
  process.exit(1);
}
const target = JSON.parse(readFileSync(targetFile, "utf8"));

if (flag("--close")) {
  await request(`${debug}/json/close/${target.id}`);
  rmSync(targetFile);
  console.log(`Closed tab ${target.id}`);
  process.exit(0);
}

const probeFile = args[0];
if (!probeFile || probeFile.startsWith("--")) {
  console.error("Usage: node fold-eval.mjs <probe.js> [options]; see the header.");
  process.exit(2);
}
const probeArgs = {};
args.forEach((arg, index) => {
  if (arg !== "--arg") return;
  const [key, ...value] = args[index + 1].split("=");
  probeArgs[key] = value.join("=");
});

const cdp = await connectSocket(target.webSocketDebuggerUrl);
const page = {};
let preludeId;
let blocked = 0;
try {
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  if (flag("--emulate")) {
    await emulate(cdp, page, FOLD_OPEN);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  }
  if (option("--prelude")) {
    ({ identifier: preludeId } = await cdp.send(
      "Page.addScriptToEvaluateOnNewDocument",
      { source: `(${source(option("--prelude"))})()` }
    ));
  }
  if (flag("--no-cache") || option("--block")) {
    // Without the cache every load asks the server for its modules, so a
    // blocked scene cannot come from the cache instead. A production build's
    // service worker keeps its own copy of the app's modules, so requests
    // skip it too.
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await cdp.send("Network.setBypassServiceWorker", { bypass: true });
  }
  if (option("--block")) {
    const patterns = option("--block")
      .split(",")
      .map((urlPattern) => ({ urlPattern }));
    cdp.on("Fetch.requestPaused", undefined, ({ requestId }) => {
      blocked += 1;
      void cdp.send("Fetch.failRequest", {
        requestId,
        errorReason: "BlockedByClient",
      });
    });
    await cdp.send("Fetch.enable", { patterns });
  }
  if (option("--navigate")) await navigate(cdp, page, option("--navigate"));
  if (flag("--reload")) await reload(cdp, page);
  await ensureVisible(
    cdp,
    page,
    "The Create tab is hidden. Unlock the phone, unfold it, and bring Chrome to the front, then run again."
  );
  const result = await evaluate(
    cdp,
    page,
    `(${source(probeFile)})(${JSON.stringify(probeArgs)})`
  );
  if (option("--block") && blocked === 0) {
    console.warn("WARNING: --block matched no request");
  }
  const text = JSON.stringify(result, null, 2);
  if (option("--out")) {
    mkdirSync(dirname(option("--out")), { recursive: true });
    writeFileSync(option("--out"), text);
    console.log(`Wrote ${option("--out")}${option("--block") ? ` (${blocked} blocked)` : ""}`);
  } else {
    console.log(text);
  }
} finally {
  if (option("--block")) await cdp.send("Fetch.disable").catch(() => {});
  if (flag("--no-cache") || option("--block")) {
    await cdp
      .send("Network.setCacheDisabled", { cacheDisabled: false })
      .catch(() => {});
    await cdp
      .send("Network.setBypassServiceWorker", { bypass: false })
      .catch(() => {});
  }
  if (preludeId) {
    await cdp
      .send("Page.removeScriptToEvaluateOnNewDocument", { identifier: preludeId })
      .catch(() => {});
  }
  cdp.close();
}
```

- [ ] **Step 8: Write the probes**

Each probe is one function that `fold-eval.mjs` runs in the page.

`fold-prelude.js` runs before the page's own scripts on each measured load. It records every long animation frame with the scripts that ran in it, when the cards appear, each change of the playing card, when each scene module arrives, and every frame the display draws: a 2 px square that changes on each frame keeps the display at its full rate, so the frame count is the page's own. It also asks for a screen wake lock, so the phone stays on while the probes run.

```js
// fold-prelude.js: fold-eval.mjs installs this before the page's own scripts
// (--prelude). It records what the probes read back.
() => {
  // The default buffer of 250 entries fills before the scenes load.
  performance.setResourceTimingBufferSize(5000);
  // The probes' own frame counters use the browser's rAF, so a wrapper
  // installed by fold-rest.js never counts them.
  window.__origRAF = window.requestAnimationFrame.bind(window);
  // A 2 px square that changes every frame keeps the display at its full
  // rate, so the frames in __ticks are the frames the page made. It starts
  // with the document, because adding it costs one slow repaint, which must
  // land before any turn. fold-round.js stops it, and it stops itself after
  // 90 s.
  window.__ticks = [];
  window.__ticking = true;
  const ticker = document.createElement("div");
  ticker.style.cssText =
    "position:fixed;left:0;bottom:0;width:2px;height:2px;z-index:2147483647;pointer-events:none;background:#000";
  const tick = (time) => {
    if (!window.__ticking || time > 90000) {
      ticker.remove();
      return;
    }
    window.__ticks.push(time);
    ticker.style.background = window.__ticks.length % 2 ? "#010101" : "#000";
    window.__origRAF(tick);
  };
  document.addEventListener(
    "DOMContentLoaded",
    () => {
      document.body.append(ticker);
      window.__origRAF(tick);
    },
    { once: true }
  );
  // A page hidden at any moment paints nothing and times nothing.
  window.__hidden = document.visibilityState !== "visible";
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") window.__hidden = true;
  });
  // Every long animation frame, with the scripts that ran in it. A script
  // with no file is one the DevTools connection injected: this prelude's
  // frame counter, or the probe being run.
  window.__loaf = [];
  new PerformanceObserver((list) => {
    for (const frame of list.getEntries()) {
      window.__loaf.push({
        at: frame.startTime,
        ms: frame.duration,
        blocking: frame.blockingDuration,
        scripts: frame.scripts.map(
          (script) =>
            `${Math.round(script.duration)}ms ${script.invokerType} ${script.sourceFunctionName || script.invoker} ${script.sourceURL || "(no file)"}`
        ),
      });
    }
  }).observe({ type: "long-animation-frame", buffered: true });
  // When the cards appear.
  window.__cardsAt = null;
  new MutationObserver((records, observer) => {
    if (!document.querySelector(".method-card")) return;
    window.__cardsAt = performance.now();
    observer.disconnect();
  }).observe(document, { childList: true, subtree: true });
  // Every change of the playing card.
  window.__turns = [];
  new MutationObserver((records) => {
    for (const record of records) {
      const id = record.target.getAttribute("data-playing-method");
      const last = window.__turns.at(-1);
      if ((last && last.id === id) || (!last && id === null)) continue;
      window.__turns.push({ id, at: performance.now() });
    }
  }).observe(document, {
    subtree: true,
    attributes: true,
    attributeFilter: ["data-playing-method"],
  });
  // When each scene module arrived (dev: Name.svelte; build: Name.hash.js).
  window.__sceneLoads = [];
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const match = /\/(\w+Scene)(?:\.svelte\b|[.-][\w-]{6,}\.js)/.exec(
        entry.name
      );
      if (match) {
        window.__sceneLoads.push({
          scene: match[1],
          at: Math.round(entry.startTime),
          end: Math.round(entry.responseEnd),
        });
      }
    }
  }).observe({ type: "resource", buffered: true });
  // The screen stays on while the probes run; the phone drops the lock
  // when the tab closes.
  navigator.wakeLock?.request("screen").catch(() => {});
}
```

`fold-round.js` follows one load from first paint until 30 seconds have passed and every card's first turn is at least 2.5 seconds old (60 seconds at most). It returns the frame times, the turns, when each card first showed its finished picture, when each scene module arrived, and the long frames of the first 30 seconds.

```js
// fold-round.js: one load of the Create front door, from first paint until
// every card has had its first turn. Run it through fold-eval.mjs with
// --prelude fold-prelude.js and --reload.
async () => {
  if (!window.__turns || !window.__ticks) {
    throw new Error(
      "Run fold-round.js with --prelude fold-prelude.js and --reload"
    );
  }
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const until = async (read, ms, what) => {
    const deadline = performance.now() + ms;
    for (;;) {
      const value = read();
      if (value) return value;
      if (performance.now() > deadline) {
        throw new Error(`No ${what} within ${ms / 1000} s`);
      }
      await sleep(100);
    }
  };
  const fcp = (
    await until(
      () => performance.getEntriesByName("first-contentful-paint")[0],
      60000,
      "first-contentful-paint"
    )
  ).startTime;
  await until(() => document.querySelector(".method-index"), 60000, "board");
  await until(
    () => document.querySelector(".method-index .method-preview"),
    2000,
    "preview"
  ).catch(() => null);
  const order = [...document.querySelectorAll(".method-index .method-card")]
    .filter((card) => card.querySelector(".method-preview"))
    .map((card) => card.dataset.methodId);

  // A preview is finished when the source it shows holds the scene.
  const finished = (preview) => {
    const crossfade = preview.querySelector(".dual-source");
    const shown = crossfade
      ? [...crossfade.querySelectorAll(":scope > .source.active")]
      : [];
    return (
      shown.length > 0 &&
      shown.every(
        (source) =>
          source.firstElementChild !== null && !source.querySelector(".tint")
      )
    );
  };
  const ready = {};
  for (;;) {
    const now = performance.now();
    for (const preview of document.querySelectorAll(
      ".method-index .method-preview"
    )) {
      const id = preview.closest(".method-card")?.dataset.methodId;
      if (id && ready[id] === undefined && finished(preview)) {
        ready[id] = Math.round(now);
      }
    }
    const firsts = order.map((id) =>
      window.__turns.find((turn) => turn.id === id)
    );
    const allPlayed =
      order.length > 0 &&
      firsts.every((turn) => turn !== undefined && now >= turn.at + 2500);
    if (
      now >= fcp + 30000 &&
      (allPlayed || window.__turns.length === 0)
    ) {
      break;
    }
    if (now >= fcp + 60000) break;
    await sleep(250);
  }
  // The prelude's frame counter stops here.
  window.__ticking = false;
  const stoppedAt = performance.now();

  // A turn lasts until the playing card next changes.
  const turns = [];
  window.__turns.forEach((turn, index) => {
    if (turn.id === null) return;
    const next = window.__turns[index + 1];
    turns.push({
      id: turn.id,
      at: Math.round(turn.at),
      end: next ? Math.round(next.at) : null,
    });
  });
  return {
    hidden: window.__hidden,
    fcp: Math.round(fcp),
    stoppedAt: Math.round(stoppedAt),
    cardsAt: window.__cardsAt === null ? null : Math.round(window.__cardsAt),
    order,
    turns,
    ready,
    sceneLoads: window.__sceneLoads,
    // Every frame from first paint on, so fold-summary.mjs can count frames
    // over any stretch, in these runs and in the runs without previews.
    ticks: window.__ticks
      .filter((time) => time >= fcp)
      .map((time) => Math.round(time * 10) / 10),
    frames: window.__loaf
      .filter(
        (frame) =>
          frame.at > fcp && frame.at <= fcp + 30000 && frame.blocking > 0
      )
      .map((frame) => ({
        at: Math.round(frame.at),
        ms: Math.round(frame.ms),
        blocking: Math.round(frame.blocking),
        scripts: frame.scripts,
      })),
  };
}
```

`fold-rest.js` waits for the turns to come to rest (5 seconds with no turn, after at least one turn), then watches for 1.5 seconds: animation frame requests (from preview code, with their stacks, and from anything else), running animations on the board, and fingers still showing.

```js
// fold-rest.js: what still runs once the turns are over. Waits for 5 s with
// no turn after the rounds, then watches for 1.5 s.
async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const playingNow = () =>
    document
      .querySelector(".method-index")
      ?.getAttribute("data-playing-method") ?? null;
  const started = performance.now();
  // Without fold-prelude.js's record, the probe has to see a turn itself.
  let seen = 0;
  let current = playingNow();
  let lastChange = started;
  for (;;) {
    const now = performance.now();
    const playing = playingNow();
    if (playing !== current) {
      if (playing !== null) seen += 1;
      current = playing;
      lastChange = now;
    }
    const turnsSeen = window.__turns
      ? window.__turns.filter((turn) => turn.id !== null).length
      : seen;
    const lastTurn = window.__turns?.at(-1)?.at ?? lastChange;
    const quietSince = Math.max(lastTurn, lastChange, started);
    if (playing === null && turnsSeen > 0 && now - quietSince >= 5000) break;
    if (now - started > 120000) break;
    await sleep(100);
  }
  const turnsSeen = window.__turns
    ? window.__turns.filter((turn) => turn.id !== null).length
    : seen;

  // Every rAF request in the next 1.5 s, sorted by whether preview code
  // (a scene, its helpers, or a renderer the scenes drive) made it.
  const PREVIEW =
    /method-previews\/|method-preview-turns|CreateFrontDoor|\w+Scene[.-]|GhostPointer|attract-ghost|animation-render-loop|canvas-2d-animation-renderer|AnimatorCanvas|CanvasSurface|sequence-viewer\/tunnel\/|TunnelArtView|svg-prop-animator|shape-matrix-reveal/;
  const original = window.requestAnimationFrame;
  const plain = window.__origRAF ?? original.bind(window);
  let calls = 0;
  let otherCalls = 0;
  const stacks = [];
  const otherStacks = [];
  window.requestAnimationFrame = function (callback) {
    const limit = Error.stackTraceLimit;
    Error.stackTraceLimit = 50;
    const stack = new Error().stack ?? "";
    Error.stackTraceLimit = limit;
    if (PREVIEW.test(stack)) {
      calls += 1;
      if (stacks.length < 3) stacks.push(stack);
    } else {
      otherCalls += 1;
      if (otherStacks.length < 3) otherStacks.push(stack);
    }
    return original.call(window, callback);
  };
  const ticks = [];
  const begin = performance.now();
  const tick = (time) => {
    ticks.push(time);
    if (performance.now() - begin < 1500) plain(tick);
  };
  plain(tick);
  await sleep(1500);
  window.requestAnimationFrame = original;

  const animations = document
    .getAnimations()
    .filter(
      (animation) =>
        animation.playState === "running" &&
        animation.effect?.target?.closest?.(".method-index")
    )
    .map((animation) => {
      const target = animation.effect.target;
      return `${animation.animationName ?? animation.id ?? "animation"} on ${target.tagName.toLowerCase()}.${[...target.classList].join(".")}`;
    });
  return {
    turnsSeen,
    calls,
    otherCalls,
    stacks,
    otherStacks,
    restingFps: Math.round((ticks.length / 1.5) * 10) / 10,
    runningAnimations: animations.length,
    animations: animations.slice(0, 5),
    ghosts: document.querySelectorAll(".method-index .ghost").length,
    hidden: window.__hidden ?? document.visibilityState !== "visible",
  };
}
```

`fold-turn.js` scrolls a card to the middle of the screen, waits for its turn, and returns 700 ms into it, so a screenshot taken right after shows the card mid-turn.

```js
// fold-turn.js: waits for a card's turn to start (--arg id=<method>, or any
// card), then returns 700 ms into it, so a screenshot taken next shows the
// card mid-turn. A turn already under way counts only in its first 700 ms.
// A named card is scrolled to the middle of the screen first, so a card
// below the fold is in the picture.
async (args) => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const playingNow = () =>
    document
      .querySelector(".method-index")
      ?.getAttribute("data-playing-method") ?? null;
  const wanted = (id) => id !== null && (!args.id || id === args.id);
  const deadline = performance.now() + 60000;
  while (args.id) {
    const card = document.querySelector(
      `.method-card[data-method-id="${args.id}"]`
    );
    if (card) {
      card.scrollIntoView({ block: "center", behavior: "instant" });
      break;
    }
    if (performance.now() > deadline) {
      throw new Error(`No card for ${args.id} within 60 s`);
    }
    await sleep(50);
  }
  let previous = playingNow();
  let startedAt = null;
  if (wanted(previous) && window.__turns) {
    const turn = window.__turns.at(-1);
    if (turn?.id === previous && performance.now() - turn.at < 700) {
      startedAt = turn.at;
    }
  }
  while (startedAt === null) {
    if (performance.now() > deadline) {
      throw new Error(`No turn for ${args.id ?? "any card"} within 60 s`);
    }
    await sleep(50);
    const current = playingNow();
    if (current !== previous && wanted(current)) startedAt = performance.now();
    previous = current;
  }
  await sleep(Math.max(0, startedAt + 700 - performance.now()));
  return {
    playing: playingNow(),
    hidden: document.visibilityState !== "visible",
  };
}
```

`fold-layout.js` checks the board's boxes on the phone, without a baseline: no sideways scroll, text inside its card and clear of the stage, the badge clear of the stage, no clipped text, each stage holding its icon or a preview, and each row's stages and names in line.

```js
// fold-layout.js: the front door's boxes on the phone, checked on their own
// (no baseline): text inside its card and clear of the stage, every stage
// showing its icon or a preview, and each row's stages and names in line.
async () => {
  const deadline = performance.now() + 60000;
  while (!document.querySelector(".method-card")) {
    if (performance.now() > deadline) {
      throw new Error("No .method-card within 60 s");
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await document.fonts.ready;
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const rect = (element) => {
    if (!element) return null;
    const box = element.getBoundingClientRect();
    return { x: box.x, y: box.y, w: box.width, h: box.height };
  };
  const board = document.querySelector("section.front-door");
  const cards = [...document.querySelectorAll(".method-card")].map((card) => {
    const stage =
      card.querySelector(".method-stage") ?? card.querySelector(".method-icon");
    const name = card.querySelector(".method-name");
    const description = card.querySelector(".method-description");
    return {
      id: card.dataset.methodId,
      card: rect(card),
      stage: rect(stage),
      preview: rect(card.querySelector(".method-preview")),
      iconInStage: Boolean(
        stage &&
          (stage.classList.contains("method-icon") ||
            stage.querySelector(".method-icon"))
      ),
      copy: rect(card.querySelector(".method-copy")),
      name: rect(name),
      badge: rect(card.querySelector(".last-used-badge")),
      clipped: [name, description].some(
        (element) =>
          element !== null &&
          (element.scrollWidth > element.clientWidth + 1 ||
            element.scrollHeight > element.clientHeight + 1)
      ),
    };
  });
  const overlap = (a, b) => {
    if (!a || !b) return 0;
    const width = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const height = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return width > 0 && height > 0 ? Math.min(width, height) : 0;
  };
  const inside = (inner, outer) =>
    Boolean(
      inner &&
        outer &&
        inner.x >= outer.x - 0.5 &&
        inner.y >= outer.y - 0.5 &&
        inner.x + inner.w <= outer.x + outer.w + 0.5 &&
        inner.y + inner.h <= outer.y + outer.h + 0.5
    );
  const spread = (values) => Math.max(...values) - Math.min(...values);
  const failures = [];
  const notes = [];
  const overflowY = board.scrollHeight - board.clientHeight;
  const overflowX = board.scrollWidth - board.clientWidth;
  if (overflowY > 0) notes.push(`the board scrolls ${overflowY} px`);
  if (overflowX > 0) failures.push(`the board scrolls sideways by ${overflowX} px`);
  for (const card of cards) {
    if (!inside(card.copy, card.card)) failures.push(`${card.id}: the text leaves the card`);
    if (overlap(card.stage, card.copy) > 0.5) failures.push(`${card.id}: the stage overlaps the text`);
    if (overlap(card.badge, card.stage) > 0.5) failures.push(`${card.id}: the badge overlaps the stage`);
    if (card.clipped) failures.push(`${card.id}: text is clipped`);
    if (!card.iconInStage && (!card.preview || Math.min(card.preview.w, card.preview.h) < 1)) {
      failures.push(`${card.id}: the stage holds neither the icon nor a preview`);
    }
  }
  const rows = new Map();
  for (const card of cards) {
    const top = Math.round(card.card.y);
    rows.set(top, [...(rows.get(top) ?? []), card]);
  }
  for (const [top, row] of rows) {
    if (row.length < 2) continue;
    if (
      spread(row.map((card) => card.stage.w)) > 1 ||
      spread(row.map((card) => card.stage.h)) > 1
    ) {
      failures.push(`row at ${top}: the stages differ in size`);
    }
    if (spread(row.map((card) => card.name.y)) > 1) {
      failures.push(`row at ${top}: the names do not line up`);
    }
  }
  return {
    viewport: `${innerWidth}x${innerHeight}`,
    hidden: document.visibilityState !== "visible",
    cards: cards.map(
      (card) =>
        `${card.id} stage ${Math.round(card.stage.w)}x${Math.round(card.stage.h)}`
    ),
    failures,
    notes,
  };
}
```

`fold-forget-sw.js` removes the service worker and the caches that the production build leaves on its own test origin (Step 17). It refuses to run on any other origin.

```js
// fold-forget-sw.js: removes what the production build left on its own test
// origin, the same cleanup the app's dev mode runs in src/hooks.client.ts:
// its service worker and the caches that worker filled. Run it in the
// check's own tab on http://localhost:5192, and nowhere else.
async () => {
  if (location.origin !== "http://localhost:5192") {
    throw new Error(`Refusing to clear ${location.origin}`);
  }
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    registrations.map((registration) => registration.unregister())
  );
  const names = await caches.keys();
  await Promise.all(names.map((name) => caches.delete(name)));
  return { workers: registrations.length, caches: names.length };
}
```

Check that every file parses:

```bash
cd /c/Users/Austen/AppData/Local/Temp/create-method-previews && for file in fold-eval.mjs fold-prelude.js fold-round.js fold-rest.js fold-turn.js fold-layout.js fold-forget-sw.js; do node --check "$file" || echo "BAD $file"; done
```

Expected: no output.

- [ ] **Step 9: Write the summary, the run script, and the screenshot tool**

`fold-summary.mjs` judges three loads with previews against three loads with every scene module blocked. A blocked load is the same page without previews: the same board and tinted boxes, and no scene code. It decides five things:

- **Long frames.** Each long frame (one that blocked input) in a load with previews is charged to an owner. A frame that ran a scene's own code is that scene's: Construct, Generate, Shape, Fuse, Tunnel, Assemble, or Pool (the home hero's sequence source and the filters it uses). A frame the blocked loads also show, at about the same time, is the page's own and only noted. Any other frame before every finished picture is in is Loading; after that, it is the playing card's. A scene, Pool, or Loading fails when its frames come in two of the three loads. Shared preview code, and frames with no script (Rendering), fail only when they come in two loads with previews and in fewer than two without.
- **Frame rate.** Each card's first turn holds at least 57 frames per second (the 60 fps gate, less the display's own jitter). When the blocked loads ran slower over the same stretch, the card fails only if it is more than 2 below them.
- **Cards on screen.** The cards appear no later than 10 percent plus 100 ms after they do in the blocked loads.
- **Finished pictures.** Every card shows its finished picture in at least two loads.
- **Rest.** After the rounds, preview code asks for no animation frame, no animation runs, and no finger shows.

Each FAIL line names its owner and lists the frames behind it: each frame's time after first paint, its length, when it came (before every finished picture was in, during a card's turn, or between turns), and its scripts. The summary also writes `<prefix>-summary.json`. It exits 0 for PASS, 1 for FAIL, and 2 for UNDECIDED.

```js
// fold-summary.mjs: decides the Fold checks from three fold-round runs with
// the previews and three with every scene blocked.
//
//   node fold-summary.mjs <prefix> --baseline <prefix> [--rest <file.json>]
//
// Reads <prefix>-1.json to <prefix>-3.json and the same for the baseline,
// prints each finding, and writes <prefix>-summary.json. Exit 0 is PASS,
// 1 is FAIL, and 2 means the runs cannot decide (a hidden page, or a run of
// the wrong kind): run them again.
import { readFileSync, writeFileSync } from "node:fs";

// Who owns the code behind a long frame, by the file each script came from.
// Pool comes first because its Shape Matrix filters also match the Shape
// pattern.
const GROUPS = [
  [
    "Pool",
    /shape-matrix-hero-pool|shape-matrix-realizations|background-scheduling|deck-variation|deck-composer|filter-flower-axis|flower-signature/,
  ],
  [
    "Shape",
    /ShapeScene|method-preview-shape|shape-matrix|mandala|build-flower-sequence/,
  ],
  [
    "Tunnel",
    /TunnelScene|TunnelRingScene|method-preview-tunnel|sequence-viewer\/tunnel\//,
  ],
  ["Construct", /ConstructScene/],
  ["Generate", /GenerateScene|method-preview-generate/],
  ["Fuse", /FuseScene|method-preview-fuse|fuse-pictograph-motion-frame/],
  [
    "Assemble",
    /AssembleScene|method-preview-assemble|builder-prop-art|svg-prop-animator/,
  ],
  [
    "Shared",
    /method-previews\/|method-preview-turns|CreateFrontDoor|animation-render-loop|canvas-2d-animation-renderer|CanvasSurface|AnimatorCanvas|prop-svg-loader|GridSvg|PictographContainer|attract-ghost|GhostPointer|grid-calculations/,
  ],
];
// A scene's own code, and the pool Generate and Tunnel draw from.
const SCENE_GROUPS = new Set([
  "Pool",
  "Shape",
  "Tunnel",
  "Construct",
  "Generate",
  "Fuse",
  "Assemble",
]);
// These exist only with the previews, so they fail on their own. Shared,
// Rendering, and Other fail only when the loads without previews lack them.
const PREVIEW_GROUPS = new Set([...SCENE_GROUPS, "Loading"]);
const CARD_GROUPS = {
  construct: "Construct",
  generate: "Generate",
  "shape-engine": "Shape",
  fuse: "Fuse",
  tunnel: "Tunnel",
  assemble: "Assemble",
};
const FPS_FLOOR = 57;
// Two frames that start this close, counted from first paint, are the same
// frame in a load with previews and a load without.
const SAME_TIME_MS = 500;
// fold-round.js looks for finished pictures every 250 ms.
const SAMPLE_MS = 250;

const args = process.argv.slice(2);
const option = (name) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};
const prefix = args[0];
const baselinePrefix = option("--baseline");
if (!prefix || prefix.startsWith("--") || !baselinePrefix) {
  console.error(
    "Usage: node fold-summary.mjs <prefix> --baseline <prefix> [--rest <file.json>]"
  );
  process.exit(2);
}

const read = (file) => {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    return { unreadable: `${file}: ${error.message}` };
  }
};
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};
const seconds = (run, time) => `+${((time - run.fcp) / 1000).toFixed(1)} s`;

const runs = [1, 2, 3].map((n) => read(`${prefix}-${n}.json`));
const baseline = [1, 2, 3].map((n) => read(`${baselinePrefix}-${n}.json`));
const invalid = [];
const checkRun = (run, name) => {
  if (run.unreadable) invalid.push(run.unreadable);
  else if (!Array.isArray(run.ticks)) {
    invalid.push(`${name}: written by an older fold-round.js`);
  } else if (run.hidden) invalid.push(`${name}: the page was hidden`);
  else if (run.cardsAt === null) invalid.push(`${name}: no card appeared`);
};
runs.forEach((run, index) => {
  const name = `${prefix}-${index + 1}`;
  checkRun(run, name);
  if (!run.unreadable && run.turns?.length === 0) {
    invalid.push(`${name}: no turn played`);
  }
});
baseline.forEach((run, index) => {
  const name = `${baselinePrefix}-${index + 1}`;
  checkRun(run, name);
  if (!run.unreadable && run.turns?.length > 0) {
    invalid.push(`${name}: turns played, so a scene was not blocked`);
  }
});
const rest = option("--rest") ? read(option("--rest")) : null;
if (rest?.unreadable) invalid.push(rest.unreadable);
else if (rest?.hidden) invalid.push(`${option("--rest")}: the page was hidden`);
else if (rest && rest.turnsSeen === 0) {
  invalid.push(`${option("--rest")}: no turn was seen before the rest`);
}
if (invalid.length > 0) {
  for (const reason of invalid) console.log(`UNDECIDED ${reason}`);
  process.exit(2);
}

const groupOf = (script) =>
  GROUPS.find(([, pattern]) => pattern.test(script))?.[0] ?? "Other";
// A script with no file is the probes' own (fold-prelude.js marks it), and
// the page's code always comes from a file. The probes' work is too small to
// make a frame long by itself, so a frame is judged by its other scripts, and
// one with none counts as a frame with no script, by when it came.
const pageScripts = (frame) =>
  frame.scripts.filter((script) => !script.endsWith(" (no file)"));
const groupsOf = (frame) => {
  const scripts = pageScripts(frame);
  return scripts.length === 0
    ? new Set(["Rendering"])
    : new Set(scripts.map(groupOf));
};
const kindOf = (frame) => [...groupsOf(frame)].sort().join("+");

// The card playing during a frame. A turn recorded inside the frame wins:
// its start is noted only after the work that began it.
const playingDuring = (run, frame) =>
  (
    run.turns.find(
      (turn) => turn.at >= frame.at && turn.at <= frame.at + frame.ms
    ) ??
    run.turns.find(
      (turn) =>
        turn.at <= frame.at && (turn.end === null || frame.at < turn.end)
    )
  )?.id ?? null;
// When every card showed its finished picture, or null if one never did.
const loadedAt = (run) => {
  const times = run.order.map((id) => run.ready[id]);
  return times.length > 0 && times.every((time) => time !== undefined)
    ? Math.max(...times) + SAMPLE_MS
    : null;
};
// A frame the loads without previews also show at about the same time
// belongs to the page: its own load, or the probes.
const alsoWithout = (run, frame) =>
  baseline.filter((base) =>
    base.frames.some(
      (other) =>
        kindOf(other) === kindOf(frame) &&
        Math.abs(other.at - base.fcp - (frame.at - run.fcp)) <= SAME_TIME_MS
    )
  ).length >= 2;
// Who a long frame in a run with previews is charged to. Scene code is
// charged by its file. Other code is charged by when it ran. Until every
// finished picture is in, it is the scenes' load: LazyMount mounts a scene
// inside its own callback, so the file names the loader, not the scene.
// After that, in a card's turn, it is that card's: a scene works inside the
// shared turn timer and the renderers it drives.
const ownersOf = (run, frame) => {
  const groups = groupsOf(frame);
  const scenes = [...groups].filter((group) => SCENE_GROUPS.has(group));
  if (scenes.length > 0) return { owners: new Set(scenes), by: "file" };
  if (alsoWithout(run, frame)) return { owners: groups, by: "page" };
  const loaded = loadedAt(run);
  if (loaded === null || frame.at < loaded) {
    return { owners: new Set(["Loading"]), by: "load" };
  }
  const card = CARD_GROUPS[playingDuring(run, frame)];
  return card
    ? { owners: new Set([card]), by: "turn" }
    : { owners: groups, by: "file" };
};

const failures = [];
const notes = [];

// Long frames, by owner.
const presence = (list, ownersFor) => {
  const counts = new Map();
  for (const run of list) {
    const groups = new Set(
      run.frames.flatMap((frame) => [...ownersFor(run, frame)])
    );
    for (const group of groups) counts.set(group, (counts.get(group) ?? 0) + 1);
  }
  return counts;
};
const withPreviews = presence(runs, (run, frame) => ownersOf(run, frame).owners);
const without = presence(baseline, (run, frame) => groupsOf(frame));
const groups = {};
for (const [group, count] of withPreviews) {
  const before = without.get(group) ?? 0;
  groups[group] = { runs: count, baselineRuns: before };
  const failing = PREVIEW_GROUPS.has(group)
    ? count >= 2
    : count >= 2 && before < 2;
  const line = `${group}: long frames in ${count} of 3 runs (${before} of 3 without previews)`;
  if (!failing) {
    notes.push(line);
    continue;
  }
  const details = [];
  runs.forEach((run, index) => {
    for (const frame of run.frames) {
      const { owners, by } = ownersOf(run, frame);
      if (!owners.has(group)) continue;
      let why = "";
      if (by === "file") {
        const loaded = loadedAt(run);
        const playing = playingDuring(run, frame);
        why =
          loaded === null || frame.at < loaded
            ? ", before every finished picture was in"
            : playing
              ? `, during ${playing}'s turn`
              : ", between turns";
      }
      if (by === "turn") why = `, counted by ${playingDuring(run, frame)}'s turn`;
      if (by === "load") {
        const loading = run.order.filter(
          (id) => run.ready[id] === undefined || run.ready[id] > frame.at
        );
        why =
          loading.length > 0
            ? `, while these scenes loaded: ${loading.join(", ")}`
            : ", as the last finished picture came in";
      }
      details.push(
        `  run ${index + 1} ${seconds(run, frame.at)}: ${frame.ms} ms frame, ${frame.blocking} ms blocking${why}`
      );
      for (const script of frame.scripts) details.push(`      ${script}`);
    }
  });
  failures.push([line, ...details].join("\n"));
}
const pageFrames = runs.flatMap((run, index) =>
  run.frames
    .filter((frame) => ownersOf(run, frame).by === "page")
    .map((frame) => `run ${index + 1} ${seconds(run, frame.at)}`)
);
if (pageFrames.length > 0) {
  notes.push(
    `${pageFrames.length} long frames also come at the same time without previews, so they count as the page's own: ${pageFrames.join(", ")}`
  );
}

// Frames per second over a stretch, in ms after first paint.
const fpsOver = (run, from, to) => {
  const start = Math.max(run.fcp + from, run.ticks[0] ?? Infinity);
  const end = Math.min(run.fcp + to, run.stoppedAt);
  if (end - start < 1000) return null;
  const frames = run.ticks.filter((time) => time >= start && time < end).length;
  return Math.round((frames / (end - start)) * 10000) / 10;
};
// Each card's first turn, against the loads without previews over the same
// stretch: a page still loading drops frames with or without previews.
const fps = {};
const cards = [...new Set(runs.flatMap((run) => run.order))];
for (const card of cards) {
  const stretches = runs.flatMap((run) => {
    const turn = run.turns.find((each) => each.id === card);
    return turn
      ? [
          {
            run,
            from: turn.at - run.fcp,
            to: (turn.end ?? run.stoppedAt) - run.fcp,
          },
        ]
      : [];
  });
  const values = stretches
    .map(({ run, from, to }) => fpsOver(run, from, to))
    .filter((value) => value !== null);
  const reference = stretches
    .flatMap(({ from, to }) => baseline.map((base) => fpsOver(base, from, to)))
    .filter((value) => value !== null);
  fps[card] = { values, without: reference };
  if (values.length < 2) {
    failures.push(`${card}: a full first turn in ${values.length} of 3 runs`);
    continue;
  }
  const value = median(values);
  const before = reference.length > 0 ? median(reference) : null;
  const line = `${card}: ${value} frames per second in its first turn (${values.join(", ")})${before === null ? "" : `; ${before} without previews over the same stretch`}`;
  if (value < FPS_FLOOR && (before === null || value < before - 2)) {
    failures.push(`${line}; the floor is ${FPS_FLOOR}`);
  } else {
    notes.push(line);
  }
}

// The cards are tappable as soon as without previews.
const cardsAt = {
  runs: median(runs.map((run) => run.cardsAt)),
  baseline: median(baseline.map((run) => run.cardsAt)),
};
const tappableLine = `cards on screen at ${cardsAt.runs} ms; ${cardsAt.baseline} ms without previews`;
if (cardsAt.runs > cardsAt.baseline * 1.1 + 100) failures.push(tappableLine);
else notes.push(tappableLine);

// Each card's finished picture, after first paint.
for (const card of cards) {
  const times = runs
    .filter((run) => run.ready[card] !== undefined)
    .map((run) => run.ready[card] - run.fcp);
  if (times.length < 2) {
    failures.push(`${card}: no finished picture in ${3 - times.length} of 3 runs`);
  } else {
    notes.push(
      `${card}: finished picture ${Math.round(median(times))} ms after first paint`
    );
  }
}

// Nothing runs at rest.
if (rest) {
  if (rest.calls > 0) {
    failures.push(
      [
        `at rest, preview code asked for ${rest.calls} frames in 1.5 s`,
        ...rest.stacks.map(
          (stack) => `  ${stack.split("\n").slice(1, 6).join(" | ")}`
        ),
      ].join("\n")
    );
  }
  if (rest.runningAnimations > 0) {
    failures.push(
      `at rest, ${rest.runningAnimations} animations run: ${rest.animations.join(", ")}`
    );
  }
  if (rest.ghosts > 0) failures.push(`at rest, ${rest.ghosts} fingers show`);
  if (rest.otherCalls > 0) {
    notes.push(
      `at rest, other code asked for ${rest.otherCalls} frames: ${rest.otherStacks[0]?.split("\n").slice(1, 4).join(" | ")}`
    );
  }
  if (rest.restingFps < FPS_FLOOR) {
    notes.push(`at rest the display ran at ${rest.restingFps} frames per second`);
  }
}

for (const note of notes) console.log(`NOTE ${note}`);
for (const failure of failures) console.log(`FAIL ${failure}`);
const verdict = failures.length === 0 ? "PASS" : "FAIL";
console.log(verdict);
writeFileSync(
  `${prefix}-summary.json`,
  JSON.stringify({ verdict, failures, notes, groups, fps, cardsAt, rest }, null, 2)
);
process.exitCode = verdict === "PASS" ? 0 : 1;
```

`fold-run.sh` runs one full set: a warm-up load, three loads with previews and no cache, the rest probe, three loads with every scene blocked, then the summary. Its extra options go to every `fold-eval.mjs` call. Set `FOLD_BLOCK` when a build names its scene modules some other way (Step 17).

```bash
#!/usr/bin/env bash
# fold-run.sh: the Fold's cost checks for one setup.
#
#   bash fold-run.sh <label> [fold-eval options...]
#
# A warm-up load, three measured loads with the previews, the rest probe,
# three loads with every scene blocked, then fold-summary.mjs. The extra
# options (--debug, --target, --emulate) go to every fold-eval call.
set -euo pipefail
cd "$(dirname "$0")"
label="$1"
shift
# The scene modules to block in the runs without previews. Set FOLD_BLOCK
# when a build names its scene chunks some other way.
BLOCK="${FOLD_BLOCK:-*ConstructScene*,*GenerateScene*,*ShapeScene*,*FuseScene*,*TunnelScene*,*TunnelRingScene*,*AssembleScene*}"
mkdir -p fold
node fold-eval.mjs fold-round.js "$@" --prelude fold-prelude.js --reload --out "fold/$label-warmup.json"
for run in 1 2 3; do
  node fold-eval.mjs fold-round.js "$@" --prelude fold-prelude.js --reload --no-cache --out "fold/$label-round-$run.json"
done
node fold-eval.mjs fold-rest.js "$@" --out "fold/$label-rest.json"
for run in 1 2 3; do
  node fold-eval.mjs fold-round.js "$@" --prelude fold-prelude.js --reload --no-cache --block "$BLOCK" --out "fold/$label-none-$run.json"
done
node fold-summary.mjs "fold/$label-round" --baseline "fold/$label-none" --rest "fold/$label-rest.json"
```

`fold-shot.mjs` takes one screenshot of one Fold display over adb, scales it to 1080 px wide, and saves it as WebP at quality 70 with `sharp` from the primary checkout.

```js
// fold-shot.mjs: one screenshot of one Fold display, saved as WebP.
//
//   node fold-shot.mjs <serial> <display-id> <out.webp>
//
// Display ids come from `adb -s <serial> shell dumpsys SurfaceFlinger --display-id`.
import { execFile } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { promisify } from "node:util";

const ADB = "C:/Users/Austen/AppData/Local/Android/Sdk/platform-tools/adb.exe";
// sharp is installed in the primary checkout.
const sharp = createRequire("E:/tka-platform/package.json")("sharp");

const [serial, display, out] = process.argv.slice(2);
if (!out) {
  console.error("Usage: node fold-shot.mjs <serial> <display-id> <out.webp>");
  process.exit(2);
}
const { stdout } = await promisify(execFile)(
  ADB,
  ["-s", serial, "exec-out", "screencap", "-p", "-d", display],
  { encoding: "buffer", maxBuffer: 128 * 1024 * 1024 }
);
const image = sharp(stdout);
const { width, height } = await image.metadata();
mkdirSync(dirname(out), { recursive: true });
await image
  .resize({ width: 1080, withoutEnlargement: true })
  .webp({ quality: 70 })
  .toFile(out);
console.log(`${out}: ${width}x${height} screen, ${stdout.length} bytes raw`);
```

```bash
cd /c/Users/Austen/AppData/Local/Temp/create-method-previews && node --check fold-summary.mjs && node --check fold-shot.mjs && bash -n fold-run.sh
```

Expected: no output.

- [ ] **Step 10: Rehearse on the stand-in**

The agent Chrome, slowed 4x at the open Fold's viewport, stands in for the phone. This run tests the tools and the setup; its numbers are leads, not the gate.

```bash
cd /c/Users/Austen/AppData/Local/Temp/create-method-previews && node fold-eval.mjs --open http://localhost:5191/create --debug http://127.0.0.1:9222 --target fold/standin-target.json
```

Expected: `Opened http://localhost:5191/create as tab <id>`. Run the set with the Bash tool's `run_in_background`, then wait for its notification (about 6 minutes; foreground sleeps are blocked):

```bash
cd /c/Users/Austen/AppData/Local/Temp/create-method-previews && bash fold-run.sh standin --debug http://127.0.0.1:9222 --target fold/standin-target.json --emulate > fold/standin-run.log 2>&1
```

Read `fold/standin-run.log`. Expected: eight `Wrote` lines (the warm-up, three loads with previews, the rest, and three blocked loads, which end in `(N blocked)` with N above 0), then the summary's NOTE and FAIL lines and its verdict.

- `UNDECIDED ... the page was hidden`: the agent Chrome window was covered or minimized. Bring it to the front and run the set again.
- `UNDECIDED ... turns played, so a scene was not blocked`, or `WARNING: --block matched no request`: a scene module's URL does not match the block list. Find its name in `sceneLoads` in that load's JSON, add a pattern for it to `FOLD_BLOCK` (comma separated, with `*` wildcards, as in `fold-run.sh`), and run the set again.
- A FAIL: note its owner and frames as a lead for the Fold. Change no code for a stand-in FAIL unless the Fold cannot be reached (Step 11).

Close the tab:

```bash
cd /c/Users/Austen/AppData/Local/Temp/create-method-previews && node fold-eval.mjs --close --debug http://127.0.0.1:9222 --target fold/standin-target.json
```

Expected: `Closed tab <id>`.

- [ ] **Step 11: Connect the Fold**

Austen's Galaxy Z Fold6 (model `SM_F956U`) is paired for wireless debugging. Find it before asking him anything, and never scan ports for it:

```bash
ADB=/c/Users/Austen/AppData/Local/Android/Sdk/platform-tools/adb.exe
"$ADB" devices -l
"$ADB" mdns services
```

- `devices -l` lists `model:SM_F956U` in the state `device`: it is connected.
- `mdns services` lists an `_adb-tls-connect._tcp` entry: run `"$ADB" connect <address it gives>`, then `devices -l` again.
- Both are empty, and `devices` shows no device at all (so no other session's device is cut off): restart adb with its other mDNS backend and look again.

```bash
ADB=/c/Users/Austen/AppData/Local/Android/Sdk/platform-tools/adb.exe
"$ADB" kill-server
ADB_MDNS_OPENSCREEN=1 "$ADB" start-server
"$ADB" mdns services
```

If `connect` fails to authenticate, the phone no longer trusts this PC, and pairing codes are Austen's to enter. Ask him with AskUserQuestion to open Wireless debugging on the phone, choose Pair device with pairing code, and run the command below in his own terminal with the address that dialog shows, typing the code when asked. Put the command in your message in its own `bash` block. Options: "Paired, try again (Recommended)" and "Skip the Fold (use the slowed-down stand-in)".

```bash
C:/Users/Austen/AppData/Local/Android/Sdk/platform-tools/adb.exe pair <address shown on the phone>
```

If the phone still does not answer, ask with AskUserQuestion: "Your Fold doesn't answer over wireless debugging. On the phone, check that Wireless debugging is on and that it is on the same Wi-Fi as this PC." Options: "Done, try again (Recommended)" and "Skip the Fold (use the slowed-down stand-in)".

If he skips, the stand-in is the evidence. Decide Step 14 from `fold/standin-round-summary.json`, pass `--debug http://127.0.0.1:9222 --emulate` to every later `fold-eval.mjs` and `fold-run.sh` call with a `standin` label, skip Steps 12, 13, 15, and 19 and every adb line, and say in the report that the phone was not checked. Task 18 Step 8's pictures at 707x823, 823x707, and 369x850 then stand in for Step 19's.

Once the phone is connected, save its serial for the later steps (shell variables do not carry over between commands):

```bash
cd /c/Users/Austen/AppData/Local/Temp/create-method-previews
ADB=/c/Users/Austen/AppData/Local/Android/Sdk/platform-tools/adb.exe
SERIAL=$("$ADB" devices -l | awk '/model:SM_F956U/ {print $1; exit}')
printf 'ADB=%s\nSERIAL=%s\n' "$ADB" "$SERIAL" > fold/env.sh
cat fold/env.sh
```

Expected: `SERIAL=` followed by the phone's address and port, or an `adb-` name.

- [ ] **Step 12: Open the Create tab on the Fold**

```bash
cd /c/Users/Austen/AppData/Local/Temp/create-method-previews && source fold/env.sh
"$ADB" -s "$SERIAL" reverse tcp:5191 tcp:5191
"$ADB" -s "$SERIAL" shell am start -n com.android.chrome/com.google.android.apps.chrome.Main
"$ADB" -s "$SERIAL" forward tcp:9223 localabstract:chrome_devtools_remote
node fold-eval.mjs --open http://localhost:5191/create
"$ADB" -s "$SERIAL" shell dumpsys SurfaceFlinger --display-id
```

`reverse` lets the phone reach the worktree preview at `http://localhost:5191`, a secure context, so nothing needs a certificate. `am start` brings Chrome up, and `--open` puts the check's own tab in front. Expected: `Opened http://localhost:5191/create as tab <id>`, then the phone's displays. When this plan was written, the open screen was `4630946165277524611` and the cover `4630947194243491972`; Step 13 confirms which is which.

- [ ] **Step 13: Run the cost checks on the Fold**

Ask Austen with AskUserQuestion: "The Create tab is open in your Fold's Chrome. Unfold the phone, unlock it, and leave Chrome on that tab. Then set it down and don't touch it for about 10 minutes; I'll say when it's free. If the screen dims, tap the 'How do you want to create?' heading, never a card." Options: "Ready (Recommended)" and "Skip the Fold (use the slowed-down stand-in)". On Skip, follow Step 11's skip path.

When he is ready, look at what the open screen shows, so no run measures a covered page:

```bash
cd /c/Users/Austen/AppData/Local/Temp/create-method-previews && source fold/env.sh && node fold-shot.mjs "$SERIAL" 4630946165277524611 fold/check-open.webp
```

Expected: about `1856x2160 screen`. Open the picture with the Read tool: it shows the Create tab. If the size is different or adb reports no such display, shoot each id `dumpsys` listed until one reports about 1856x2160; that one is the open screen. If a picture shows anything but the Create tab or a dark screen (a notification, another app, the lock screen), delete it at once, tell Austen only that the phone was not on the Create tab, and ask again. Save both ids. These are the ids from when this plan was written; if `dumpsys` listed others, put in the open screen's id and the other id as the cover:

```bash
cd /c/Users/Austen/AppData/Local/Temp/create-method-previews && printf 'INNER=%s\nCOVER=%s\n' 4630946165277524611 4630947194243491972 >> fold/env.sh
```

Run the set with `run_in_background` and wait for its notification (about 6 minutes):

```bash
cd /c/Users/Austen/AppData/Local/Temp/create-method-previews && bash fold-run.sh fold > fold/fold-run.log 2>&1
```

Read `fold/fold-run.log`. If it ends in UNDECIDED, or a call stopped with the hidden-tab message:

- `the page was hidden`, or the hidden-tab message: the screen went off or Chrome lost the front. Ask the readiness question again, then run the set again.
- `turns played, so a scene was not blocked`: Step 10's fix.
- `no turn played` in the loads with previews: check whether the phone asks pages for reduced motion, with the command below.

```bash
cd /c/Users/Austen/AppData/Local/Temp/create-method-previews && printf '%s\n' '() => matchMedia("(prefers-reduced-motion: reduce)").matches' > fold/motion.js && node fold-eval.mjs fold/motion.js
```

`true` means the phone's Remove animations setting is on, so the previews rightly hold still. Never change a phone setting yourself. Ask Austen with AskUserQuestion: "Your Fold has Remove animations turned on (Accessibility, Visibility enhancements), so the previews hold still and the check can't measure them." Options: "Turned it off, try again (Recommended)" and "Skip the Fold (use the slowed-down stand-in)". After the run, tell him he can turn it back on. `false` means something else stopped the turns: treat it as a behavior FAIL (Step 14, item 1).

A finished set ends in `PASS` or `FAIL`. Keep `fold/fold-run.log` and `fold/fold-round-summary.json` for the report.

- [ ] **Step 14: Decide from the result**

PASS: go to Step 19.

FAIL: tell Austen the result in two or three plain sentences (what the phone showed, and what happens next), and that the phone is free until the next readiness question. Then work through the FAIL lines in this order:

1. **Behavior**: `no finished picture`, or `at rest` frames, animations, or fingers. These are defects. Write a failing test first (in a Step 5 test file or the scene's own test), fix the cause, and run the set again.
2. **Loading**, or `<card>: a full first turn in N of 3 runs`: find the scene behind it with Step 15, then treat it as that scene's FAIL below.
3. **Pool or Shape**: take the planned remedy first, then run the set again as `fold-2` (`bash fold-run.sh fold-2 > fold/fold-2-run.log 2>&1`, with `run_in_background`).
   - Pool: Task 11 Step 10 (the pool build yields between stages).
   - Shape: Task 12 Step 10 (the archetype setup runs in stages).

   A Pool frame `during shape-engine's turn`, or one whose scripts list `rotation-style-archetypes`, is Shape's.

4. **Any cost FAIL left** (a scene's long frames or frame rate, Shared, Rendering, Other, or `cards on screen`): the dev server runs unbundled modules with development checks, so measure a production build before changing anything (Step 17).
5. **A FAIL that stays in production:**
   - Pool: Step 16 (Generate and Tunnel step through the demo sequence).
   - Tunnel: Task 14 Steps 14 to 21 (the ring), without asking: the spec names that fallback. If Pool also failed, apply Step 16's ring edits to `TunnelRingScene.svelte` before measuring.
   - Shape: Step 18 (Austen chooses).
   - Anything else: find the cause in the FAIL's scripts and fix it as a defect. If no fix brings it under the gate, ask Austen with AskUserQuestion whether that card keeps its live preview or shows its icon, with the measured numbers, as in Step 18.

   After each change, measure production again as `prod-2`, `prod-3`, and so on (Step 17, with the new label).

Ask the Step 13 readiness question before every new set on the phone.

- [ ] **Step 15: Find the scene behind a loading cost**

Block one scene at a time on the phone and see which one takes the loading frames away. Ask the Step 13 readiness question first (about 5 minutes), then run with `run_in_background`:

```bash
cd /c/Users/Austen/AppData/Local/Temp/create-method-previews
for scene in ConstructScene GenerateScene ShapeScene FuseScene TunnelScene TunnelRingScene AssembleScene; do
  node fold-eval.mjs fold-round.js --prelude fold-prelude.js --reload --no-cache --block "*$scene*" --out "fold/bisect-$scene.json"
done > fold/bisect.log 2>&1
```

A scene the registry does not load prints `WARNING: --block matched no request`; ignore its file. Then list the long frames that came before the last finished picture, in the three loads with every scene and in each load without one scene:

```bash
cd /c/Users/Austen/AppData/Local/Temp/create-method-previews && node -e '
const { readFileSync } = require("node:fs");
for (const file of process.argv.slice(1)) {
  const run = JSON.parse(readFileSync(file, "utf8"));
  const times = Object.values(run.ready);
  const loaded = times.length > 0 ? Math.max(...times) : Infinity;
  const early = run.frames.filter((frame) => frame.at < loaded);
  const blocking = early.reduce((sum, frame) => sum + frame.blocking, 0);
  console.log(`${file}: ${early.length} long frames before the last finished picture, ${blocking} ms blocking`);
}' fold/fold-round-1.json fold/fold-round-2.json fold/fold-round-3.json fold/bisect-*.json
```

Expected: one line per file. The scene whose absence drops most of the loading frames, compared with the three `fold-round` loads, is the cost: treat it as that scene's FAIL in Step 14. If no single scene accounts for them, the cost is the shared preview code: treat it as Shared.

- [ ] **Step 16: Take Generate and Tunnel off the hero's sequence source**

Only when Pool still fails in production. Generate and the Tunnel card then step through the demo sequence, which both scenes already fall back to, so no turn draws a sequence in the background. `nextRoll` and `nextTunnelSequence` keep their `drawn` parameter, which their tests cover; every caller now passes `null`.

In `src/lib/features/create/shared/components/method-previews/GenerateScene.svelte` (Prettier may have wrapped some of these lines; match them by content):

1. In the header comment, replace:

```ts
   * Each turn shows a real sequence from drawMatrixRealization(), the
   * Firebase-free source behind the home hero, drawn in the background
   * between turns. When that source fails, turns step through the demo
   * sequence instead.
```

with:

```ts
   * Each turn steps to the next stretch of the demo sequence. Drawing real
   * sequences from the home hero's source cost long frames on a Galaxy Z
   * Fold6.
```

2. Remove these four imports:

```ts
  import { onDestroy } from "svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import { runAtBackgroundPriority } from "$lib/shared/foundation/utils/background-scheduling";
  import { drawMatrixRealization } from "$lib/shared/landing/data/shape-matrix-hero-pool";
```

3. Remove the background draw: everything from the comment `/** The next turn's roll, drawn in the background. */` through the closing brace of `function drawNextRoll()`. That takes out `fresh`, `drawing`, `sourceFailed`, `disposed`, and the `onDestroy` call with them.
4. Remove the two `drawNextRoll();` lines: in `handleCellReady`, after `onready();`, and in `settle`, after `phase = "rest";`.
5. In `play`, replace:

```ts
    const drawn = fresh;
    fresh = null;
    roll = nextRoll(roll, drawn, box.cells.length);
```

with:

```ts
    roll = nextRoll(roll, null, box.cells.length);
```

If the registry's `tunnel` line imports `TunnelScene.svelte` (the live tunnel), edit `src/lib/features/create/shared/components/method-previews/TunnelScene.svelte`:

1. In the header comment, replace:

```ts
   * sequence. The new sequence comes from drawMatrixRealization(), the
   * Firebase-free source behind the home hero, drawn in the background
   * between turns. When that source fails, the performer's sequence turns an
   * eighth instead, so the tunnel still redraws.
```

with:

```ts
   * sequence: the performer's sequence turned an eighth, so the tunnel
   * redraws. Drawing real sequences from the home hero's source cost long
   * frames on a Galaxy Z Fold6.
```

2. Replace `import { onDestroy, tick } from "svelte";` with `import { tick } from "svelte";`.
3. Remove these two imports, and keep the `SequenceData` import, which `sequence` still uses:

```ts
  import { runAtBackgroundPriority } from "$lib/shared/foundation/utils/background-scheduling";
  import { drawMatrixRealization } from "$lib/shared/landing/data/shape-matrix-hero-pool";
```

4. Remove everything from `/** The next turn's sequence, drawn in the background. */` through the closing brace of `function drawNext()`.
5. Remove the two `drawNext();` lines: in the `$effect` that announces the card ready, after `onready();`, and in `settle`, after `if (stageHidden) revealWhenReady = true;`.
6. In `play`, replace:

```ts
    sequence = nextTunnelSequence(sequence, fresh);
    fresh = null;
```

with:

```ts
    sequence = nextTunnelSequence(sequence, null);
```

If the registry's `tunnel` line imports `TunnelRingScene.svelte` (the ring), edit `src/lib/features/create/shared/components/method-previews/TunnelRingScene.svelte`:

1. In the header comment, replace:

```ts
   * Each turn's sequence comes from drawMatrixRealization(), the
   * Firebase-free source behind the home hero, drawn in the background
   * between turns. When that source fails, turns step through the demo
   * sequence instead.
```

with:

```ts
   * Each turn steps to the next stretch of the demo sequence. Drawing real
   * sequences from the home hero's source cost long frames on a Galaxy Z
   * Fold6.
```

2. Remove the same four imports as in `GenerateScene.svelte` (`onDestroy`, `SequenceData`, `runAtBackgroundPriority`, and `drawMatrixRealization`).
3. Remove everything from `/** The next turn's sequence, drawn in the background. */` through the closing brace of `function drawNext()`.
4. Remove the two `drawNext();` lines: in `handleCellReady`, after `onready();`, and in `settle`, after `phase = "rest";`.
5. In `play`, replace the three lines that start with `const drawn = fresh;` with:

```ts
    roll = nextRoll(roll, null, box.cells.length);
```

Check that nothing in the edited scenes still draws:

```bash
cd /e/worktrees/tka-platform/create-method-previews && grep -n "drawMatrixRealization\|runAtBackgroundPriority\|fresh\|drawNext\|onDestroy" src/lib/features/create/shared/components/method-previews/GenerateScene.svelte src/lib/features/create/shared/components/method-previews/Tunnel*Scene.svelte
```

Expected: no output.

In `docs/superpowers/specs/2026-10-06-create-method-previews-design.md`, replace the Data paragraph under Scenes:

```markdown
Data is local. Scenes use the 16-step demo sequence the home page already
ships (`demo-sequence.json`) and `drawMatrixRealization()`, the Firebase-free
source of real Shape Matrix sequences behind the home hero. No Firestore
reads, no workers.
```

with:

```markdown
Data is local. Scenes use the 16-step demo sequence the home page already
ships (`demo-sequence.json`). No Firestore reads, no workers. Generate and
Tunnel first drew real Shape Matrix sequences from `drawMatrixRealization()`,
the home hero's source; the Fold check found that it added long frames
between turns, so they step through the demo sequence instead.
```

Under Generate, replace:

```markdown
CSS animation delay. Each turn rolls a different real sequence from
`drawMatrixRealization()`; if that source fails, turns step through the demo
sequence instead. The dice is drawn as a plain glyph for `GhostPointer` to
press, never a real button.
```

with:

```markdown
CSS animation delay. Each turn steps to the next stretch of the demo
sequence (see Data above). The dice is drawn as a plain glyph for
`GhostPointer` to press, never a real button.
```

In the Discovery table, change the owner cell of the `Sequences without Firebase` row from `` `demo-sequence.json`, `drawMatrixRealization()` `` to `` `demo-sequence.json` ``. Prettier realigns the table.

Run the scene tests:

```bash
cd /e/worktrees/tka-platform/create-method-previews && npx vitest run --config tests/config/vitest.config.ts tests/unit/create/method-preview-generate.test.ts tests/unit/create/method-preview-tunnel.test.ts tests/unit/create/method-preview-scene-contract.test.ts tests/unit/create/method-preview-scenes.test.ts
```

Expected: PASS. Format the edited files (the Tunnel line names whichever scene you edited):

```bash
cd /e/tka-platform && npx prettier --write /e/worktrees/tka-platform/create-method-previews/src/lib/features/create/shared/components/method-previews/GenerateScene.svelte /e/worktrees/tka-platform/create-method-previews/src/lib/features/create/shared/components/method-previews/TunnelScene.svelte /e/worktrees/tka-platform/create-method-previews/docs/superpowers/specs/2026-10-06-create-method-previews-design.md
```

With the ring, put `TunnelRingScene.svelte` in place of `TunnelScene.svelte` in that command and in the commit below. Run `npm run check:fast` in the worktree (after the svelte-check gate). Expected: no errors in the edited scenes. Then run `node live-check.mjs rounds` from `<scratch>` (Expected: `PASS`), and watch one Generate turn and one Tunnel turn on the bench: Generate's new steps wash in, and the tunnel redraws turned an eighth (with the ring, the performer's steps wash in anew).

Commit:

```bash
cd /e/worktrees/tka-platform/create-method-previews
git status --short
git add -- src/lib/features/create/shared/components/method-previews/GenerateScene.svelte src/lib/features/create/shared/components/method-previews/TunnelScene.svelte docs/superpowers/specs/2026-10-06-create-method-previews-design.md
git commit -m "perf(create): method previews step through the demo sequence" -m "Drawing from the home hero's sequence source cost long frames on a Galaxy Z Fold6." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/features/create/shared/components/method-previews/GenerateScene.svelte src/lib/features/create/shared/components/method-previews/TunnelScene.svelte docs/superpowers/specs/2026-10-06-create-method-previews-design.md
```

Then measure production again (Step 17, next label).

- [ ] **Step 17: Measure a production build**

The dev server serves unbundled modules with development checks, so a cost FAIL that remains on it is measured again on a production build before any fallback.

Check memory and the agent servers, in PowerShell:

```powershell
(Get-Counter '\Memory\Available MBytes').CounterSamples[0].CookedValue
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'vite\\bin\\vite\.js' } | Select-Object ProcessId, CommandLine
```

Expected: at least 10240 MB (a build needs more than a server). The list includes Austen's server on 5173, which is not an agent server. If two agent Vite servers already run besides this task's 5191 preview, stop the 5191 preview with `preview_stop` for this step and start it again afterward: no more than two may run.

Build in the worktree, in PowerShell (up to 10 minutes; give the call a 600000 ms timeout):

```powershell
Set-Location E:/worktrees/tka-platform/create-method-previews
npm run build:fast
git status --short
```

Expected: the build finishes without errors, and `git status --short` prints nothing (the build writes only ignored folders). If the build fails for a reason outside this work, the dev result stands: say so in the report and go to Step 14's item 5 with the dev FAILs.

Check how the build named the scene modules:

```bash
ls /e/worktrees/tka-platform/create-method-previews/.svelte-kit/output/client/_app/immutable/chunks | grep Scene
```

Expected: one `<Name>Scene.<hash>.js` per registered scene. If the build named them some other way, put `FOLD_BLOCK=<patterns>` (comma separated, with `*` wildcards) in front of the `fold-run.sh` command below. If a scene shares its file with other code, blocking it would block that code too, so take the dev result for that scene and say so.

Add this configuration to `E:/tka-platform/.claude/launch.json` (never commit it), and start it with `preview_start {name: "verify-create-method-previews-prod"}`. If port 5192 is taken, use the next free port here and in every command below.

```json
{
  "name": "verify-create-method-previews-prod",
  "runtimeExecutable": "pnpm",
  "runtimeArgs": ["--dir", "E:/worktrees/tka-platform/create-method-previews", "exec", "vite", "preview", "--port", "5192", "--host", "127.0.0.1", "--strictPort"],
  "port": 5192,
  "url": "http://localhost:5192"
}
```

Open the Create tab on the phone:

```bash
cd /c/Users/Austen/AppData/Local/Temp/create-method-previews && source fold/env.sh
"$ADB" -s "$SERIAL" reverse tcp:5192 tcp:5192
node fold-eval.mjs --open http://localhost:5192/create --target fold/prod-target.json
```

Ask the Step 13 readiness question, then run the set with `run_in_background`:

```bash
cd /c/Users/Austen/AppData/Local/Temp/create-method-previews && bash fold-run.sh prod --target fold/prod-target.json > fold/prod-run.log 2>&1
```

The production build registers the app's service worker, which keeps its own copy of the hashed modules. The `--open` load installs it, and the measured and blocked loads bypass it (`fold-eval.mjs` turns on `Network.setBypassServiceWorker` with `--no-cache` and `--block`), so every load fetches its modules. When a rebuild changes the worker, the app reloads the page once to hand it to the new one (`applyWaitingSwUpdateBeforeStart` in `src/lib/shared/offline/services/sw-update-manager.ts`). If a run stops with `Execution context was destroyed` or a navigation error, that reload cut it short: run the set once more.

Read `fold/prod-run.log` and go back to Step 14's item 5. Each later production set repeats this step with the next label (`prod-2`, `prod-3`): stop the 5192 preview, build, start it again, and run the set with the new label in both the command and its log name.

When production is settled, clean up the test origin and the tab:

```bash
cd /c/Users/Austen/AppData/Local/Temp/create-method-previews && source fold/env.sh
node fold-eval.mjs fold-forget-sw.js --target fold/prod-target.json
node fold-eval.mjs --close --target fold/prod-target.json
"$ADB" -s "$SERIAL" reverse --remove tcp:5192
```

Expected: a result with the number of service workers and caches removed, then `Closed tab <id>`. Stop the production preview with `preview_stop` and remove its entry from `launch.json`. On the stand-in, pass `--debug http://127.0.0.1:9222 --emulate` to the `fold-eval.mjs` and `fold-run.sh` calls, use `--target fold/prod-standin-target.json`, and skip the adb lines.

- [ ] **Step 18: Ask about Shape, if it still fails**

Only when Shape still fails in production after Task 12 Step 10. Ask Austen with AskUserQuestion, giving the measured numbers in plain words: how long the longest Shape frames held the phone up, and how many seconds after the page appeared. Options, with the recommended one first and marked "(Recommended)":

- "Keep Shape's live preview": recommend it only if every Shape frame came within 5 seconds of first paint and each blocked input for under 100 ms, a short hitch while the page settles.
- "Shape keeps its icon": the card shows its icon box as it does today; the scene stays in the code for a later attempt.

On "Keep Shape's live preview", note his choice and the numbers for the report, and go on.

On "Shape keeps its icon":

1. Replace the whole of `tests/unit/create/method-preview-scenes.test.ts` with:

```ts
/**
 * Every Create method but Shape has a preview scene, keyed by its method id,
 * and every scene belongs to a real Create method. Shape shows its icon: its
 * matrix build cost too much on a Galaxy Z Fold6.
 */
import { describe, expect, it } from "vitest";
import { CREATE_TABS } from "$lib/shared/navigation/config/tab-definitions";
import { METHOD_PREVIEW_SCENES } from "$lib/features/create/shared/components/method-previews/method-preview-scenes";

describe("method preview scene registry", () => {
  it("has a scene for every Create method but Shape, and only those", () => {
    expect(Object.keys(METHOD_PREVIEW_SCENES).sort()).toEqual(
      CREATE_TABS.map((tab) => tab.id)
        .filter((id) => id !== "shape-engine")
        .sort()
    );
  });
});
```

2. Run it to verify it fails:

```bash
cd /e/worktrees/tka-platform/create-method-previews && npx vitest run --config tests/config/vitest.config.ts tests/unit/create/method-preview-scenes.test.ts
```

Expected: FAIL, because the registry still has `shape-engine`.

3. In `src/lib/features/create/shared/components/method-previews/method-preview-scenes.ts`, replace the line `"shape-engine": () => import("./ShapeScene.svelte"),` with:

```ts
  // Shape shows its icon: its matrix build cost too much on a Galaxy Z
  // Fold6. ShapeScene.svelte stays for a later attempt.
```

4. At the end of the spec's Shape section (after the paragraph that ends "so Shape opens faster afterward."), add this paragraph, with the measured numbers in place of the two N values:

```markdown
On a Galaxy Z Fold6, building the matrix corner blocked the page for up to
N ms at a time, N seconds after it appeared, in a production build. Austen
chose to keep Shape's icon box until that build is cheaper. The scene,
`ShapeScene.svelte`, stays for that attempt.
```

5. Run the registry, contract, and front door tests:

```bash
cd /e/worktrees/tka-platform/create-method-previews && npx vitest run --config tests/config/vitest.config.ts tests/unit/create/method-preview-scenes.test.ts tests/unit/create/method-preview-scene-contract.test.ts tests/unit/create/create-front-door-previews.test.ts tests/unit/create/create-method-preview.test.ts
```

Expected: PASS. The front door test's case for an id with no scene covers Shape's card.

6. Format, type check, and look:

```bash
cd /e/tka-platform && npx prettier --write /e/worktrees/tka-platform/create-method-previews/src/lib/features/create/shared/components/method-previews/method-preview-scenes.ts /e/worktrees/tka-platform/create-method-previews/tests/unit/create/method-preview-scenes.test.ts /e/worktrees/tka-platform/create-method-previews/docs/superpowers/specs/2026-10-06-create-method-previews-design.md
```

Run `npm run check:fast` in the worktree (after the svelte-check gate). Expected: no errors. Run `node live-check.mjs rounds` from `<scratch>`. Expected: `order` and `turns` without `shape-engine`, and `PASS`. On the bench, the Shape card shows its icon box.

7. Commit:

```bash
cd /e/worktrees/tka-platform/create-method-previews
git status --short
git add -- src/lib/features/create/shared/components/method-previews/method-preview-scenes.ts tests/unit/create/method-preview-scenes.test.ts docs/superpowers/specs/2026-10-06-create-method-previews-design.md
git commit -m "feat(create): Shape's front door card keeps its icon" -m "Its matrix build cost too much on a Galaxy Z Fold6." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/features/create/shared/components/method-previews/method-preview-scenes.ts tests/unit/create/method-preview-scenes.test.ts docs/superpowers/specs/2026-10-06-create-method-previews-design.md
```

Then measure production again (Step 17, next label).

- [ ] **Step 19: Pictures of each posture**

These pictures go to Austen, whose phone can't open links, and they are the spec's check on the real Fold. The production check (Step 17) may have left another tab in front, so open the Create tab again:

```bash
cd /c/Users/Austen/AppData/Local/Temp/create-method-previews && node fold-eval.mjs --close && node fold-eval.mjs --open http://localhost:5191/create
```

Expected: `Closed tab <id>`, then `Opened http://localhost:5191/create as tab <id>`. If you told Austen the phone was free after the last set, ask the Step 13 readiness question again. Each picture load runs with the prelude, whose wake lock keeps the screen on between pictures; its 2 px frame counter sits in the bottom-left corner. The open screen in portrait first:

```bash
cd /c/Users/Austen/AppData/Local/Temp/create-method-previews && source fold/env.sh
for id in assemble tunnel fuse shape-engine generate construct; do
  node fold-eval.mjs fold-turn.js --prelude fold-prelude.js --reload --arg id=$id
  node fold-shot.mjs "$SERIAL" "$INNER" "fold/open-$id.webp"
done
node fold-eval.mjs fold-rest.js --out fold/open-rest.json
node fold-shot.mjs "$SERIAL" "$INNER" fold/open-rest.webp
node fold-eval.mjs fold-layout.js --out fold/open-layout.json
```

Leave `shape-engine` out of the list if Shape kept its icon. Construct comes last, so the board is back at the top for the picture at rest. Expected: each `fold-shot` line reports about `1856x2160 screen`. Open the pictures with the Read tool: each `open-<id>.webp` shows its card mid-turn, and `open-rest.webp` shows the cards on their finished pictures. `fold/open-layout.json` has an empty `failures` list, and `fold/open-rest.json` shows `calls`, `runningAnimations`, and `ghosts` at 0. A layout failure is a defect in Task 18's placement CSS: fix it, then take this posture's pictures again.

Then the open screen in landscape. Ask with AskUserQuestion: "Please turn the open Fold sideways, with Chrome still on the Create tab, and set it down again." Options: "Done (Recommended)" and "Skip landscape". If the page does not turn, the phone's auto-rotate is off; it is his to turn on, or he can skip.

```bash
cd /c/Users/Austen/AppData/Local/Temp/create-method-previews && source fold/env.sh
node fold-eval.mjs fold-turn.js --prelude fold-prelude.js --reload --arg id=construct
node fold-shot.mjs "$SERIAL" "$INNER" fold/landscape-turn.webp
node fold-eval.mjs fold-rest.js --out fold/landscape-rest.json
node fold-shot.mjs "$SERIAL" "$INNER" fold/landscape-rest.webp
node fold-eval.mjs fold-layout.js --out fold/landscape-layout.json
```

Expected: about `2160x1856 screen`, the same picture checks, and an empty `failures` list.

Then the cover screen. Ask with AskUserQuestion: "Please fold the phone closed and keep Chrome on the Create tab on the outside screen (if Chrome asks, swipe up to keep using it)." Options: "Done (Recommended)" and "Skip the cover screen".

```bash
cd /c/Users/Austen/AppData/Local/Temp/create-method-previews && source fold/env.sh
node fold-eval.mjs fold-turn.js --prelude fold-prelude.js --reload --arg id=construct
node fold-shot.mjs "$SERIAL" "$COVER" fold/cover-turn.webp
node fold-eval.mjs fold-rest.js --out fold/cover-rest.json
node fold-shot.mjs "$SERIAL" "$COVER" fold/cover-rest.webp
node fold-eval.mjs fold-layout.js --out fold/cover-layout.json
```

Expected: about `968x2376 screen`, the same checks, and an empty `failures` list. On the cover, a note in `notes` that the board scrolls is expected. If a picture comes out black or another size, Chrome is not on the cover screen: ask again. Tell Austen the phone is free.

- [ ] **Step 20: Clean up, and check again if code changed**

```bash
cd /c/Users/Austen/AppData/Local/Temp/create-method-previews && source fold/env.sh
node fold-eval.mjs --close
"$ADB" -s "$SERIAL" reverse --remove tcp:5191
"$ADB" -s "$SERIAL" forward --remove tcp:9223
```

Expected: `Closed tab <id>`. Leave the phone's pairing and adb connection as they are.

If this task changed code (Steps 14 to 18), run the full test list:

```bash
cd /e/worktrees/tka-platform/create-method-previews && npx vitest run --config tests/config/vitest.config.ts src/lib/features/assemble-lab/services/builder-prop-art.test.ts tests/unit/attract/ghost-pointer-compact.test.ts tests/unit/create/create-front-door-locked-methods.test.ts tests/unit/create/create-front-door-previews.test.ts tests/unit/create/create-method-preview.test.ts tests/unit/create/method-preview-assemble.test.ts tests/unit/create/method-preview-compositions.test.ts tests/unit/create/method-preview-demo.test.ts tests/unit/create/method-preview-fuse.test.ts tests/unit/create/method-preview-generate.test.ts tests/unit/create/method-preview-hold.test.ts tests/unit/create/method-preview-layout.test.ts tests/unit/create/method-preview-run.test.ts tests/unit/create/method-preview-scene-contract.test.ts tests/unit/create/method-preview-scene-turns.test.ts tests/unit/create/method-preview-scenes.test.ts tests/unit/create/method-preview-shape.test.ts tests/unit/create/method-preview-tunnel.test.ts tests/unit/create/method-preview-turns.test.ts tests/unit/create/step-wave-band.test.ts tests/unit/sequence-viewer/tunnel-art-view-decorative.test.ts tests/unit/sequence-viewer/tunnel-art-view-self-clock.test.ts tests/unit/shape-matrix/mandala-guide-reveal-frame.test.ts tests/unit/shape-matrix/shape-matrix-default-band.test.ts
```

Expected: PASS. Then run `npm run check:fast` in the worktree (after the svelte-check gate; expected: no errors) and `node live-check.mjs rounds` from `<scratch>` (expected: `PASS`).

- [ ] **Step 21: Write down the results**

Write these in the task notes for the final report: the Fold's verdict and its NOTE lines (each card's frame rate, when the cards appeared, and when each finished picture came in); each FAIL, what was done about it, and the verdict measured after; whether the stand-in replaced the phone; the fallbacks taken (Steps 16 and 18, or Task 14's ring); the results of Steps 3 to 6; and the posture pictures in `fold/` (`open-*.webp`, `landscape-*.webp`, `cover-*.webp`). Task 21 sends Austen the pictures.

---

### Task 20: Canon and Capability Records

The canon gets one paragraph on the previews, and the capability list gets the three owners this work set up or extended, so the next search finds them.

**Files:**

- Modify: `docs/architecture/visual-design-canon.md` (§15, Create Front Door)
- Modify: `docs/architecture/canonical-capabilities.md` (the search vocabulary table)

- [ ] **Step 1: Add the canon paragraph**

In `docs/architecture/visual-design-canon.md`, §15 has this paragraph:

```markdown
Each method remains a complete button with one useful description. Its icon,
restrained whole-surface tint, and full perimeter border carry its tab color.
The tiles do not use list-row chevrons, blur, decorative edge strips, or
invented workflow graphics.
```

Add a blank line and the paragraph below after it, before the paragraph that starts "On desktop, the chooser uses". Pick the version that matches what Task 19 left: the live tunnel or the performer ring, and Shape live or on its icon.

Live tunnel, Shape live:

```markdown
Each tile also holds a live preview drawn with its method's own renderers and
data: Construct's pictographs and demo taps, Generate's diagonal wave, the
Shape Matrix's mandala reveal, Fuse's one-hand paths, the real tunnel, and
Assemble's grid and hops. They show each method's real output, so they are not
invented workflow graphics. The previews take turns in board order for two
rounds, then rest on finished pictures. Only the playing preview animates, and
reduced motion leaves every preview on its finished picture. The icon sits
beside the method name in the method color, and every tile keeps its
description: a preview never explains a method alone.
```

Performer ring, Shape live:

```markdown
Each tile also holds a live preview drawn with its method's own renderers and
data: Construct's pictographs and demo taps, Generate's diagonal wave, the
Shape Matrix's mandala reveal, Fuse's one-hand paths, the Tunnel tool's
performer ring, and Assemble's grid and hops. They show each method's real
output, so they are not invented workflow graphics. The previews take turns in
board order for two rounds, then rest on finished pictures. Only the playing
preview animates, and reduced motion leaves every preview on its finished
picture. The icon sits beside the method name in the method color, and every
tile keeps its description: a preview never explains a method alone.
```

Live tunnel, Shape on its icon:

```markdown
Each tile but Shape also holds a live preview drawn with its method's own
renderers and data: Construct's pictographs and demo taps, Generate's diagonal
wave, Fuse's one-hand paths, the real tunnel, and Assemble's grid and hops.
Shape keeps its icon box until its matrix build costs less on phones. The
previews show each method's real output, so they are not invented workflow
graphics. They take turns in board order for two rounds, then rest on finished
pictures. Only the playing preview animates, and reduced motion leaves every
preview on its finished picture. The icon sits beside the method name in the
method color, and every tile keeps its description: a preview never explains a
method alone.
```

Performer ring, Shape on its icon:

```markdown
Each tile but Shape also holds a live preview drawn with its method's own
renderers and data: Construct's pictographs and demo taps, Generate's diagonal
wave, Fuse's one-hand paths, the Tunnel tool's performer ring, and Assemble's
grid and hops. Shape keeps its icon box until its matrix build costs less on
phones. The previews show each method's real output, so they are not invented
workflow graphics. They take turns in board order for two rounds, then rest on
finished pictures. Only the playing preview animates, and reduced motion
leaves every preview on its finished picture. The icon sits beside the method
name in the method color, and every tile keeps its description: a preview
never explains a method alone.
```

- [ ] **Step 2: Add the capability rows**

In `docs/architecture/canonical-capabilities.md`, the search vocabulary table ends with the row that starts `| page stage, section glide, fly-through`. Add these three rows right after it. Prettier pads the cells in Step 3. Each first cell must stay within 131 characters and each second cell within 602, the table's column widths; a longer cell would make Prettier widen the whole table.

```markdown
| live preview in a choice card, card preview, preview stage, method preview, game preview, animated button card | Two consumers, no shared stage yet: Play's `features/learn/play/components/previews/` with `preview-map.ts` (shown by `GameCard`) and Create's `features/create/shared/components/method-previews/CreateMethodPreview.svelte`. Each draws a decorative stage with real renderers inside a button card and shows a finished picture under reduced motion. A third consumer extracts a shared stage from these two. Decision: compose; record the second use. |
| take turns, one card at a time, round robin, spotlight, attract loop, board order, hover hold, preview turns | `features/create/shared/state/method-preview-turns.svelte.ts`: `createMethodPreviewTurns()` passes one turn around the cards in board order for two rounds, then rests; hover and keyboard focus hold a card. `previewMotionReduced()` reads both the system setting and the app's Reduce Motion setting. Hidden and off-screen pauses stay with `shared/render-gating/render-activity-gate.ts`. Closest match kept separate: `LiveSlots` (`features/creators/components/profile/stage/live-slots.svelte.ts`) grants concurrent live tiles by viewport distance. Decision: create. |
| Assemble prop artwork, builder prop, prop hop, hop length, Assemble grid props | `features/assemble-lab/services/builder-prop-art.ts`: `builderPropType()` and `loadBuilderPropArt()` give each hand the user's prop type, look, and hand color for Assemble's `InteractiveGrid` and the Create front door's Assemble preview. `BUILDER_HOP_MS` in `features/assemble-lab/services/svg-prop-animator.ts` is the one hop length both use. Decision: extend these owners. |
```

- [ ] **Step 3: Format and check**

```bash
cd /e/tka-platform && npx prettier --write /e/worktrees/tka-platform/create-method-previews/docs/architecture/visual-design-canon.md /e/worktrees/tka-platform/create-method-previews/docs/architecture/canonical-capabilities.md
```

```bash
cd /e/worktrees/tka-platform/create-method-previews && git diff --numstat -- docs/architecture
```

Expected:

```
3	0	docs/architecture/canonical-capabilities.md
10	0	docs/architecture/visual-design-canon.md
```

The canon count is 11 with Shape on its icon. Any deletion in the capabilities file means a cell widened the table: shorten that cell and run both commands again. Then check the added lines for dashes and, in the canon, for lines past 80 columns:

```bash
cd /e/worktrees/tka-platform/create-method-previews && git diff -U0 -- docs/architecture | grep "^+[^+]" | grep -n "—\|–"; git diff -U0 -- docs/architecture/visual-design-canon.md | grep "^+[^+]" | awk 'length($0) > 81'
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
cd /e/worktrees/tka-platform/create-method-previews
git status --short
git add -- docs/architecture/visual-design-canon.md docs/architecture/canonical-capabilities.md
git commit -m "docs(create): record the method previews in the canon and capabilities" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- docs/architecture/visual-design-canon.md docs/architecture/canonical-capabilities.md
```

---

### Task 21: Integrate and Deliver

This task merges the branch into local `main` with the guarded finish command, checks the new front door on Austen's dev server, and hands it to him. Run it in the main session: it ends in the in-app browser and may need Austen. It pushes nothing and deploys nothing.

**Files:**

- Modify, never commit: `E:/tka-platform/.claude/launch.json` (take out this work's preview entries)

- [ ] **Step 1: Bring the branch up to date with main**

```bash
cd /e/worktrees/tka-platform/create-method-previews && git status --short && git rev-parse HEAD && git merge --no-edit main
```

Expected: no status lines, the current commit's hash, then `Already up to date.` or the merge's summary. If the merge stops on conflicts, resolve each file so both sides' changes survive, run that area's tests, then `git add -- <each resolved path>` and `git commit --no-edit`.

See what main brought, with the hash printed above:

```bash
cd /e/worktrees/tka-platform/create-method-previews && git diff --stat <hash printed above> HEAD -- src tests packages
```

No output means nothing to check again. Otherwise rerun the full test list from Task 19 Step 20, `npm run check:fast` (after the svelte-check gate), and `node live-check.mjs rounds` from `<scratch>`, and fix what fails before going on.

- [ ] **Step 2: Stop the worktree preview**

1. Call `preview_list`, then `preview_stop` for the `verify-create-method-previews` server, and for `verify-create-method-previews-prod` if Task 19 left it running.
2. Read `E:/tka-platform/.claude/launch.json` and remove the configurations named `verify-create-method-previews` and `verify-create-method-previews-prod`. Keep the JSON valid, with no trailing comma.
3. Check that the file is back as it was:

```bash
git -C /e/tka-platform diff --stat -- .claude/launch.json
```

Expected: no output. If it lists changes, they belong to another session's entries: leave them.

4. Close the agent Chrome pages this work opened (`list_pages`, then `close_page` for this work's page ids only). Leave every other page alone.

- [ ] **Step 3: Run the guarded finish**

The finish runs the full `npm run check` in the worktree, so check the resource budget first, in PowerShell:

```powershell
(Get-Counter '\Memory\Available MBytes').CounterSamples[0].CookedValue
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'svelte-check' } | Select-Object ProcessId, CommandLine
```

Expected: at least 4096, and no `svelte-check` process. If one is running, wait for it to end; never stop another task's process.

Run the finish from the primary checkout, in PowerShell, with `run_in_background` (the check can take several minutes), and wait for its notification:

```powershell
Set-Location E:/tka-platform
npm run wt:finish -- codex/create-method-previews --route /create
```

Expected, at the end:

```
    ✔ merged codex/create-method-previews into local main
    ✔ removed worktree E:/worktrees/tka-platform/create-method-previews
    ✔ deleted branch codex/create-method-previews
DELIVER_IN_APP_BROWSER=https://localhost:5173/create
```

The scripts and pictures in `<scratch>` stay; they were never in the worktree.

If the finish stops, the branch and worktree stay as they were:

- `task worktree is dirty`: run `git status --short` in the worktree, commit this work's changes with a pathspec, and run the finish again.
- `npm run check` or the compile gate reports an error in this branch's files: fix it in the worktree, run that file's tests, commit with a pathspec, and run the finish again.
- `does not contain current local main` or `main moved while checks ran`: repeat Step 1, then this step.
- `primary checkout has overlapping uncommitted paths`: another session is editing those files in the primary checkout. Do not touch them. Deliver a preview instead (below), and tell Austen which files overlap.
- Any other failure outside this work: deliver a preview instead.

To deliver a preview, add the `verify-create-method-previews` configuration from Before You Start back to `launch.json`, start it with `preview_start`, run `node live-check.mjs rounds --path create --known live/known-5173.json` from `<scratch>` (expected: `PASS`), and open [http://localhost:5191/create](http://localhost:5191/create) in the in-app browser. Keep that server and tab running after the final report, which says "Preview ready" and names the blocker. Skip Steps 4 to 6.

- [ ] **Step 4: Check the new front door on Austen's dev server**

Only read from the server on port 5173: never start, stop, or restart it.

```bash
curl.exe -k -g -s -I "https://[::1]:5173/" | head -1
```

Expected: `HTTP/2 200`.

```bash
cd /c/Users/Austen/AppData/Local/Temp/create-method-previews && node live-check.mjs rounds --base https://localhost:5173 --path create --known live/known-5173.json
```

Expected: `PASS`, as in Task 19 Step 4. If it reports `FAIL no card shows a preview`, the dev server is still serving the old front door. Ask Austen with AskUserQuestion: "The new Create cards are on main, but your dev server is still showing the old ones. Could you restart it from Agent Hub?" Options: "Restarted, check again (Recommended)" and "Leave it; I'll look later". On the second, say in the report that the dev server was not checked after the merge.

- [ ] **Step 5: Open it for Austen**

1. `preview_start {url: "https://localhost:5173/create"}` opens the page in the in-app browser.
2. `read_page`: the heading "How do you want to create?" sits above the method cards.
3. `javascript_tool` with `[".method-card", ".method-preview"].map((s) => document.querySelectorAll(".method-index " + s).length)`: two equal numbers, or one fewer preview if Shape kept its icon.
4. `computer {action: "screenshot"}` while a card plays, as the proof for the report.

Leave the tab open after the final report.

- [ ] **Step 6: Look at Assemble on main**

Assemble's grid now draws its props through `builder-prop-art.ts` and times its hops with `BUILDER_HOP_MS` (Task 15). If the agent Chrome is already signed in, look at it once on main: `new_page` at https://localhost:5173/create, choose Assemble, `take_snapshot` (the grid's points are buttons in it), `click` three of them, and `take_screenshot`. Each tap adds a prop that hops to its point in the hand's color, as before this work. If the page asks for an account, close the page without signing in: the report then says the tool was checked by `builder-prop-art.test.ts` and Task 15's checks only. Close the page when done.

- [ ] **Step 7: Send Austen the pictures**

His phone can't open links, so send pictures with `SendUserFile` (status `proactive`, display `render`), with a one-line caption. From the Fold: `<scratch>/fold/open-rest.webp`, `open-generate.webp`, `open-tunnel.webp`, `landscape-rest.webp`, `cover-rest.webp`, and `cover-turn.webp`, leaving out any posture he skipped. If the Fold was skipped, send `<scratch>/front-door/after-shots/create_707x823_en.webp`, `create_823x707_en.webp`, and `create_369x850_en.webp` instead, and say they come from the desktop stand-in.

- [ ] **Step 8: Report**

Open with two or three plain sentences a non-programmer can follow: what changed on the Create screen, why it helps, and where it landed ("On main", with a link on plain words to [https://localhost:5173/create](https://localhost:5173/create)), and that nothing was pushed or deployed. Keep file paths, commit hashes, and command flags out of the report. Then, briefly:

- How it ran on the Fold, from Task 19 Step 21: each card's frame rate, how soon the cards appeared, and any FAIL and what fixed it. If the stand-in replaced the phone, say so and why.
- Which fallbacks Task 19 took: Generate and Tunnel stepping through the demo sequence, the performer ring, or Shape keeping its icon. If Shape kept its icon, say that its scene and helpers stay in the code, unused, for a later attempt.
- Both reduce-motion settings (the phone's and the app's) stop the turns. The app's wider reduced-motion styling gap was there before this work and is untouched.
- A change in behavior: clicking a card ends a hover hold.
- Assemble's prop artwork and hop length now live in one shared place that the Assemble tool and its preview both use, and how the tool was checked (Step 6).
- The spec's required ownership reports, in plain words: the preview stage composes the existing pictograph, ghost finger, crossfade, and render gate pieces; the new turn coordinator is the owner for taking turns (the closest existing piece hands out several live tiles at once by distance, so it did not fit); the Shape preview reuses the mandala guide's reveal (say whether its reveal-frame entry point was added); and the Generate preview shares the step grid's diagonal wave.
- Any console message `/create` showed that main did not (Task 19 Step 4).
- The in-app browser tab stays open on the page.
