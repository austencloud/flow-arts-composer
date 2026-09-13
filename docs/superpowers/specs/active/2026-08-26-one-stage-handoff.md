---
status: active
value: 4
effort: S
remaining: "Two open items: the app shell's 4K root-font ramp, and the wedged :5173 dev server (Agent Hub restart)."
tags: [stage, 3d, handoff, 4k]
last_triaged: 2026-08-26
---

# One Stage — Handoff

**Landed:** `2686a4cb8f` — "one stage: delete the tabs, put the drill on the floor"
**Spec:** `shipped/2026-08-26-one-stage-design.md` (status shipped, phases 1-7 ticked)

## What is done

All seven phases. `STAGE_TABS` holds one entry, `SceneStudio.svelte`,
`StageViewer.svelte` and `StageSidebar.svelte` are deleted, the Stage
establishes the viewer context itself and mounts `Viewer3DFullscreen`, and the
shared `SceneControlWorkspace` rail is on the surface rather than behind a Stage
Setup button.

Two seams were added to the shared 3D host chain and default to current
behaviour everywhere else:

- `performerSteps` — a resolved per-performer step, for hosts whose lanes run
  independent clocks. `resolvePerformerStepSource` in
  `src/lib/shared/3d/domain/performer-step-timing.ts` owns the branch; the
  shared clock is still the default.
- `worldChildren` — a Snippet rendered in the performer coordinate frame. The
  Stage draws its walking paths and arrival rings through it
  (`StageFloorPaths.svelte`).

## Evidence

- `npx vitest run --dir tests/unit/stage` — 63/63 across 12 files.
- `npm run check` — 0 errors, 0 warnings.
- Seven-viewport sweep on `/test/stage`: 1920, 2560, 3840, 1440x900, 820x1180,
  960x412, 375x667. Three responsive defects found and fixed (see the spec's
  section 7).
- Reverse-triangle demo read off the drill chart at counts 48 and 64.

## The two things left

### 1. The app shell has no 4K root-font ramp

At 4K@100% (3840) the Stage's composition is correct but its type does not step.
That is not a Stage bug: `src/app.css:793-810` scopes the 16px→24px ramp to
`html:has(.mkt-shell)`, `html:has(.legal-container)` and `html:has(.qft-app)` at
the 1680 seam. The app shell is in none of them, so nothing inside the app ramps.

A Stage-only ramp was deliberately NOT added. It would grow the timeline and the
drill chart while leaving the shared `SceneControlWorkspace` rail at its
un-ramped size beside them — the exact disjointed-4K failure
`.claude/rules/4k-native-layout.md` exists to prevent, and worse than the
current uniform small. The fix is shell-wide, through the same `html:has(...)`
mechanism, and belongs to whoever takes on the app shell's 4K story.

### 2. :5173 is wedged (pre-existing, not from this work)

`curl -k -g 'https://[::1]:5173/stage'` returns 200 — the server answers — but
every client-side boot lands on `/browse/explore/sequences` and renders
"Initialization Failed / Internal Error". Verified again at the end of this
session. Per `.claude/rules/never-start-the-dev-server.md` the remedy is
Austen's Agent Hub restart button, not an agent-run `vite`.

## Two things to know before touching the Stage

**The Stage module is admin-gated.** `module:stage` has no entry in
`CORE_USER_MODULES` (`src/lib/shared/auth/domain/models/feature-flag.ts:80`), so
`getDefaultFeatureRole` falls through to its secure default of `admin`. A
signed-out browser is filtered out of `getModuleDefinitions()` entirely and the
app renders `create` instead — which is what a headless verification profile
sees, and why `/test/stage` exists as the harness. This is correct gating, not a
bug. Austen, signed in as admin, gets the real route.

**Judge formation direction from the drill chart, never from the 3D frame.** The
chart labels AUDIENCE at the top and BACKSTAGE at the bottom. The default 3D
camera looks from the backstage side, so screen-bottom is backstage and every
front-to-back move reads inverted in the viewport. `stageToWorld({x,z})` is
`{x: x - width/2, z: depth/2 - z}`.
