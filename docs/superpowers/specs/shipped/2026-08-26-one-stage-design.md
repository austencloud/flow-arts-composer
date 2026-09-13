---
status: shipped
value: 5
effort: L
remaining: "None. Phases 1-7 shipped 2026-08-26. Open gap: the app shell has no 4K root-font ramp, so /stage type does not step at 3840 (see the handoff)."
tags: [stage, 3d, formations, unification]
last_triaged: 2026-08-26
---

# One Stage — Design

**Status:** Shipped 2026-08-26. Moved out of `active/` on 2026-09-13; its
frontmatter has read `status: shipped` with all seven ledger boxes checked since
2026-08-26, so the file was only ever open by location.

**Reconciliation evidence (2026-09-13):** `2686a4cb8` (_one stage: delete the
tabs, put the drill on the floor_) deletes `StageViewer.svelte`,
`SceneStudio.svelte`, and `StageSidebar.svelte` — none exist today.
`STAGE_TABS` in `src/lib/shared/navigation/config/tab-definitions.ts:1200` holds
exactly one entry (`scene`). The word "phrase" survives only as `SPACING_PHRASES`
in `domain/tika-capabilities/arrange-formation.ts`, which is TIKA language
parsing, not the retired stage vocabulary. `Mark[]` survives only inside
`domain/formation-migration.ts`, which is the legacy-read path this design kept
on purpose. The 4K root-font gap recorded at the end of this document remains
open and belongs to the app shell, not to Stage.

**Date:** 2026-08-26
**Supersedes the Stage half of:** `shipped/2026-08-23-stage-formation-choreography-design.md`
(its Phase 5 proof pass becomes Phase 7 here)

## 1. The problem

Austen, 2026-08-25, looking at `/stage/editor`:

> Why do I have so fewer controls here in the stage editor then I have in the
> other 3D places why is all hiding behind this stage setup button ... I thought
> we were landing on a unified experience for whenever you're at a stage ... I
> don't know what to do I don't know what the first thing I'm supposed to do ...
> I don't know what paths anyone is supposed to be walking on I don't know what
> comes next I don't know who designed this and I don't know where to go from
> here so I'm just going to click away

Every complaint traces to one structural fact.

## 2. What is actually wrong

`SceneControlWorkspace` is the canonical 3D control surface: a right-edge rail
carrying Performers, Formation, Camera, Scene and Presets, adaptive across
docked / overlay / compact. Its consumers are the sequence viewer's 3D pane,
the standalone fullscreen viewer, the Film Director, the ocean scene — **and
Stage's own Scene tab**, through `SceneStudio` → `Viewer3DFullscreen`.

Stage's choreography editor is the only 3D surface in the app that does not
host it. `StageModule.svelte:150`:

```
{#if activeTab === "scene"}  <SceneStudio />          <- full shared rail
{:else}                      <hand-rolled 2 buttons>  <- the choreography editor
```

The rail is not missing by oversight, it is **structurally impossible** there.
Every tool in the rail reads `getViewer3DContext()`. `StageViewer.svelte`
mounts `Scene3D` directly, creates its own `createAvatarInstanceState` per
performer through `makeStandaloneDeps()`, and never establishes that context.
It also hardcodes exactly what the rail exists to control: both props forced to
`PropType.STAFF`, `showEffects={false}`, `showGrid={false}`, `visiblePlanes`
locked to WALL, and a camera fully derived from stage bounds with no user
input. Mounting the rail over it would have produced five tools that do
nothing.

One layer deeper: `performer-manager.svelte.ts` already owns formations. It has
`formationManager`, `beginLayoutTransition`, `cancelFormationTransition`, and a
comment reading *"Resolve every performer's destination under the active
formation."* Performers already walk between formations in the shared viewer.
Stage built a third implementation of that.

So Stage is not a separate thing that needs a rail bolted on. **Stage is the
canonical 3D viewer plus exactly one capability nothing else has: formations
pinned to beats, with authored arrive-by counts.** The shared viewer transitions
*now*; Stage transitions *on count 48, over 16*. That is the entire real delta.
Cast, per-performer props and effects, camera, environment, presets and save
were all duplicated from something that already worked.

The rest of the list falls out:

| Complaint | Cause |
| --- | --- |
| "I don't know what paths anyone is supposed to be walking on" | `StageModule.svelte:64` mounts the drill chart only when `cameraMode !== "orbit"`. Orbit is the default. The default view has no path visualization at all. |
| "I don't know what these phrases you're referring to" | `stage-choreography-state.svelte.ts:115,123` seed clip labels "Opening phrase" / "Second phrase". Placeholder vocabulary borrowed from music, sitting where the sequence name belongs. |
| "I don't know how clear it is to change a sequence" | The lane never names its sequence, and the editor has no change-sequence affordance. `Viewer3DFullscreen` already has one in its HUD. |
| "I don't know what the first thing I'm supposed to do" | `SceneStudio` has an empty state with one primary action. The editor has none. |
| Two owners for the shape picker | `StageSidebar`'s Shape section and the rail's Formation tool both drive `FormationSelector`. |

## 3. The target

One Stage. No tab split.

- **The stage itself** — the canonical 3D viewer, cast standing in their opening
  set, walking paths drawn on the floor beneath them.
- **Right edge** — `SceneControlWorkspace`, identical to every other 3D surface.
- **Top HUD** — `Viewer3DFullscreen`'s existing chrome: word glyph, Change
  sequence, Export, Immersive.
- **Host chrome** — the timeline along the bottom and the drill chart as a
  raisable layer, both positioned clear of the rail via the workspace's
  `leftOffset` / `bottomOffset` reservations. The convention the Director
  established: **the rail owns the right edge, the host owns everywhere else.**
- **Empty state** — one primary action, "Choose choreography".

### Vocabulary

`formation` is overloaded, and the two meanings separate cleanly along Austen's
own marching-band model:

- **Formation** (rail tool) — arrange the cast into a shape, now.
- **Set** (Stage timeline) — that shape, on that count, arrived at over that
  many counts. "Set" is the drill term and is already what the properties panel
  says.

"Phrase" is deleted. A clip is labelled with its sequence's name.

## 4. Architecture

### 4.1 The driver seam

`Viewer3DScene.svelte:672` renders every performer from the performer's own
state:

```
position={performer.position}
facingAngle={performer.facingAngle}
isMoving={performer.isMoving}
moveSpeed={performer.moveSpeed}
moveDirection={performer.moveDirection}
```

and `AvatarInstanceState` exposes `position` as a directly-mutated `$state`
object, plus `setFacingAngle` and `setTravel({direction, speed, moving})` — the
latter documented as existing for *"scripted blocking"*, added for the Director.

So Stage's entire 419-line `StageViewer` collapses to a driver that, per beat,
for each performer writes position, facing, travel, and the active clip's step.
Nothing else.

### 4.2 Two additive seams on the shared components

`Viewer3DScene`'s `useTask` drives every performer's step from one shared
`currentStep` plus a constant `performerStepOffsets[i]`. That cannot express
Stage's model, where performers hold *different sequences* on their own lanes.
And there is no way for a host to add world geometry, which the floor paths
need.

Two optional props, threaded `Viewer3DFullscreen` → `Viewer3DCanvas` →
`Viewer3DScene`, each defaulting to exactly today's behaviour:

1. **`performerSteps?: readonly number[] | null`** — when supplied, the scene
   uses `performerSteps[i]` instead of computing the step from
   `currentStep + offset`. Generic: any host with independent per-performer
   timelines needs it, the Director included.
2. **`worldChildren?: Snippet`** — rendered inside the scene root, for host
   world geometry. `Scene3D` already takes `children` this way; this forwards
   the same affordance through the canonical canvas.

These extend the canonical owner rather than forking it. Another session is
actively evolving `SceneControlWorkspace`; nothing here modifies it.

### 4.3 Where rail edits go

Following the Director's documented rule — *"Edits go to the film document,
never to the performer manager"* — Stage splits by kind:

- **Look edits** (avatar, prop, effort, effects, planes, staff length) go
  straight to the performer manager. Stage does not re-populate those.
- **Document edits** go to the choreography document:
  - Cast size: Stage owns `performers`, so it observes and mirrors.
  - **Formation tool: reseeds the active set.** Stage watches
    `viewer.activeFormation`, writes the preset into the current set, and
    cancels the viewer's own transition — because Stage owns position over
    time. This makes the rail's Formation tool do the right thing in Stage and
    lets `StageSidebar`'s duplicate Shape section be deleted.

### 4.4 What is deleted

`StageViewer.svelte`, the hand-rolled `.scene-rail`, the `stage-inspector`
popover, `StageSidebar`'s Performers / Shape / Environment sections (all three
now owned by the rail), the `activeTab === "scene"` branch, and the second
Stage tab.

`SetProperties`, `CountStepper`, `FormationOverlay`, `StageTimeline`,
`active-formation.ts`, and the beat-pinned formation model all survive — that
is the part worth keeping.

## 5. Phases

- [x] **1. Shared seams.** `performerSteps` and `worldChildren` threaded through
      Fullscreen → Canvas → Scene, defaults preserving current behaviour. Unit
      test for the step-source branch.
- [x] **2. Stage hosts the canonical viewer.** Stage establishes
      `setViewer3DContext(createViewer3DState(...))`, mounts
      `Viewer3DFullscreen`, and drives performers from the formation frames.
      `StageViewer.svelte` deleted.
- [x] **3. One surface.** The `activeTab` branch and `SceneStudio`'s separate
      existence collapse into the merged Stage, keeping its sequence picker,
      export and empty state. `STAGE_TABS` drops to one entry.
- [x] **4. Host chrome around the rail.** Timeline and drill chart repositioned
      against `leftOffset` / `bottomOffset`; hand-rolled rail and sidebar
      sections deleted; rail Formation wired to reseed the active set.
- [x] **5. Floor paths.** Walking paths drawn on the stage floor through
      `worldChildren`, visible in the default view.
- [x] **6. Vocabulary and first run.** Clip labels take the sequence's name;
      "phrase" removed; empty state with one primary action.
- [x] **7. Proof.** The reverse-triangle demo — final 16 counts of a 64-step
      sequence, downstage-centre performer stepping backward while the two back
      performers step forward — plus the seven-viewport visual sweep, tests, and
      `npm run check`.

## 6. Acceptance

Landing on Stage shows a cast on a stage with visible paths, the same rail as
every other 3D surface, and one obvious action when empty. No mode toggle hides
the work. The word "phrase" appears nowhere. The reverse-triangle demo plays.

## 7. What shipped (2026-08-26)

One Stage, no tabs. `STAGE_TABS` holds a single entry, `SceneStudio.svelte`,
`StageViewer.svelte`, and `StageSidebar.svelte` are gone, and the surface is the
3D scene with the shared `SceneControlWorkspace` rail, the drill chart, and the
timeline as layers over it.

**The reverse-triangle demo is the default document.** Three performers — a
triangle takes three, and a fourth lands on the formation's own mean depth,
where the closing move would leave them standing still while everyone else
walks. Line at count 0, triangle arriving on 32 over 16 counts, and the triangle
turned inside out arriving on 64 over 16 counts.

`reverseDepth` mirrors through the formation's OWN mean depth, not the middle of
the stage. Through the stage they look the same only while the formation happens
to be centred there; a triangle sitting downstage would be thrown to the back
wall instead of turned inside out where it stands.

Verified on the drill chart, which labels AUDIENCE at the top and BACKSTAGE at
the bottom: at count 64 the downstage performer carries a down arrow and the two
upstage performers carry up arrows. Judge formation direction from the chart,
never from the 3D frame — the default camera looks from the backstage side, so
screen-bottom is backstage and the move reads inverted.

**Seven-viewport sweep** (1920, 2560, 3840, 1440x900, 820x1180, 960x412,
375x667) found three real responsive defects that no test or typecheck could
see, all fixed:

1. The closing set's chip was clipped by the end of the timeline track. The
   track now reserves trailing room, takes the grid slack through
   `minmax(--timeline-width, 1fr)`, and caps the beat-grid gradient so the lines
   still stop on the last count.
2. The beat readout vanished below 560px — hiding, not recomposing. It moves to
   its own row instead.
3. The first-run card overflowed at 375 and collided with the compact
   Performer/Scene bar. Its offset was pinned to clear a performer spine that
   is not rendered below the shared 768x544 scene-control breakpoint; the deeper
   offset is now paid in the matching container query, and the card is bounded
   by its panel and scrolls inside itself.

**Known gap, deliberately not taken on here:** at 4K@100% the Stage's type does
not step. The app shell has no root-font ramp — `src/app.css` scopes it to
`html:has(.mkt-shell)`, `html:has(.legal-container)`, and `html:has(.qft-app)`
at the 1680 seam. A Stage-only ramp would grow the timeline while leaving the
shared rail small beside it, which is worse than the current uniform small. The
fix is shell-wide, through the same `html:has(...)` mechanism, and belongs to
whoever takes on the app shell's 4K story.
