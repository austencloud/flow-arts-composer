---
status: active
value: 2
effort: XS
remaining: "The resolver and the three presentations shipped in 21335f9da - do NOT rebuild them. Three acceptance items are unresolved, each needing a decision rather than code first: (1) the five-action desktop rail ceiling is broken at seven entries; Focus avatar has a documented later decision in 2026-09-05-avatar-camera-recovery.md, Presets has none, and neither document names or retires the ceiling. (2) The compact gate is implemented as 500px unconditional / 544px only under 1100px width, not the flat 34rem this spec states - a 1600x540 workspace resolves overlay in code and compact in the text; decide which is right and align them. (3) The 'always-visible playback timeline' clause has no owner: SceneControlWorkspace.svelte:52 leaves that to the host and nothing asserts host compliance. Also unrecorded: runtime verification of the production surfaces and the seven-viewport sweep."
depends_on: ""
plan_path: "docs/superpowers/plans/active/2026-08-21-adaptive-scene-control-workspace-plan.md"
tags: [3d, scene-controls, unresolved-acceptance, needs-product-decision]
last_triaged: 2026-09-13
---

# Adaptive Scene Control Workspace

**Status:** Implemented (implementing commit `21335f9da`, 2026-08-23 — two days
after the date this header originally claimed), with three acceptance items
UNRESOLVED. Stays in `active/` — see the open items at the end of this header.
Corrected 2026-09-13 during spec reconciliation.

**Reconciliation evidence (2026-09-13):** the pure resolver is
`src/lib/shared/3d/domain/scene-control-layout.ts`, with the three presentations
`compact | overlay | docked`, `DOCK_MIN_WIDTH = 1680` (105rem),
`MIN_DOCKED_STAGE_WIDTH = 960`, and the inspector clamped between 520 and 1100px
at 0.32 of the workspace. Presentation resolves from the measured workspace, not
the viewport. `tests/unit/3d-viewer/scene-control-layout.test.ts`: 7 tests pass,
covering the shallow-inspector case, the reserved-canvas rule and the 4K cap.
Compact bottom sheets, the Save Scene backdrop/Escape/button dismissal paths,
and the single shared `scene-prop-catalog.ts` consumed by both the picker and
Prop Studio are all present.

**UNRESOLVED acceptance items (2026-09-13).** Three stated constraints are not
met by the shipped code. Partial supersession evidence exists for one of them
and none for the other two, so all three stay open and discoverable.

1. _"The desktop scene rail contains no more than five primary actions:
   Performers, Formation, Camera, Scene, Save."_ The rail carries **seven**
   non-admin entries today (`SceneControlRail.svelte`: Performers, Formation,
   Focus avatar `:129`, Camera, Scene, Presets `:163`, Save scene `:173`).

   Evidence for each addition, which differs:
   - **Focus avatar** has a documented later decision.
     `2026-09-05-avatar-camera-recovery.md` — the spec created by `cfb54c17b`
     itself — says in its scope paragraph to "Compose it in `SceneControlRail`
     and `MobileSceneControls`", and records the control measured at all seven
     viewport tiers. So the addition was deliberate and written down.
   - **Presets** has none. `34c0f135b` (_feat(3d): add adaptive controls and
     scene presets_) created this design's own implementation plan,
     `plans/active/2026-08-21-adaptive-scene-control-workspace-plan.md`, in the
     same commit — but that plan says only "Convert the scene rail to a
     controlled top-level tool rail" and never raises or waives the count.

   **Neither document names this five-action ceiling or supersedes it.** A later
   spec that composes one more control into the rail is evidence that control
   was wanted; it is not evidence that the ceiling was retired. Whether the
   ceiling still holds is a product call for the owner — recorded here so the
   question stays findable, not resolved by reconciliation.

2. _Compact gate._ This document says "width below 48rem, **or** height below
   34rem". The code forces compact on height alone only at 500px
   (`scene-control-layout.ts:30-32` `CRITICALLY_SHALLOW_HEIGHT`); the 544px
   (34rem) gate applies only together with width below `COMPACT_LANDSCAPE_WIDTH`
   (1100). A 1600x540 workspace resolves to `overlay` in code and `compact`
   under this text. No document records the narrowing.

3. _"The shared playback timeline is always visible at the bottom when a loaded
   sequence reports playable steps."_ `SceneControlWorkspace.svelte` owns no
   timeline — `:52` explicitly leaves room for host-owned chrome below the rail.
   Nothing in the repository asserts that every host complies, so this clause is
   neither implemented nor testable where it was written.

## Outcome

The 3D viewer has one scene-control architecture with three presentations. It
does not force the same geometry onto a 4K workspace and an iPhone SE.

- A wide workspace opens an inline inspector on the right. The 3D canvas gives
  that inspector real layout space and reframes the cast inside the remaining
  stage.
- A constrained desktop or tablet opens the same inspector as a light-dismiss
  right overlay.
- A phone or short landscape workspace removes the side rail and opens focused
  drill-down pages from a bottom action bar.

The application/view rail remains on the left. Playback remains at the bottom.
Scene editing lives on the right on desktop and behind the bottom action bar on
compact workspaces. Top-center space remains available for scene status and
transient feedback.

Workspace commands remain at the top right, but they do not create a
full-width toolbar across the scene. Change Sequence, Export, Immersive, and
Exit form an intrinsic command cluster aligned to the scene rail and use the
same scene-chrome button primitive. Sequence identity remains an independent
top-left HUD element.

## Control taxonomy

The desktop scene rail contains no more than five primary actions:

1. Performers
2. Formation
3. Camera
4. Scene
5. Save

Admin-only developer controls may follow a separator. Prop, plane, effort,
effect, avatar, and sequence controls remain performer categories. They do not
become additional top-level rail buttons.

The desktop rail is grouped by meaning rather than distributed at equal
intervals. Performer and Formation form the subject group, Camera and Scene
form the shot/world group, and Save plus admin-only utilities occupy the bottom
utility group.

Selecting a performer changes the scope of edits. It does not open the
inspector by itself. Opening Performers is an explicit top-level action.

## Presentation resolution

Presentation is resolved from the measured 3D workspace, not the browser
viewport or a device label.

- `compact`: width below 48rem, or height below 34rem
- `docked`: width at least 105rem, the calculated panel still leaves the
  minimum viable stage width, and the active editor benefits from a persistent
  work column
- `overlay`: every intermediate workspace

The inspector width is fluid and capped. It grows horizontally on 4K instead
of making controls taller or stretching buttons to fill arbitrary tracks.

Inspector height follows the active editor. Camera, Formation, and Scene stay
content-sized until their content reaches the available viewport height. The
Performer editor may use more of a tall workspace, but it does so with a
category column beside the active editor rather than a full-height empty card.
Every inspector has a viewport cap and becomes scrollable only when its real
content exceeds that cap.

The Avatar category is a complete editor inside the Performer workspace. It
contains the live focused-avatar preview, description, explicit apply action,
and keyboard-aware avatar grid. Opening a second modal from the dock or compact
sheet is not part of this flow.

Performer and Developer tools may reserve a dock on wide workspaces because
their editors use that column. Camera, Formation, and Scene remain compact
overlays even when a dock would technically fit. A shallow editor must not
create a full-height empty reservation beside the stage.

## Ownership

- `viewer-3d-state.svelte.ts` remains the state owner for performers, camera,
  formation, environment, and scene settings.
- Existing performer and scene control components remain behavior owners.
- `SceneControlWorkspace.svelte` owns only composition, active top-level tool,
  measured presentation, dismissal, and the amount of canvas width reserved by
  a wide dock.
- A pure layout resolver owns the width/height arithmetic and is unit tested.

No second state manager, parallel setting implementation, or duplicate mobile
control body is introduced.

The physical prop list has one shared 3D catalog consumed by both the Performer
inspector and Prop Studio. A pictograph registry may provide labels and artwork,
but it does not decide which physical 3D choices appear. The renderer's `HAND`
sentinel remains compatible with saved settings and is presented separately as
"Bare hands", never as a physical prop.

## Compact interaction

The compact action bar exposes Performer and Scene as labeled buttons. Each
opens a bottom sheet.

The performer sheet starts with scope selection and category choices. Choosing
Avatar, Sequence, Prop, Planes, Effort, or Effects replaces the sheet body with
that focused editor and a Back button. The scene sheet follows the same pattern
for Scene, Formation, and Camera.

Short landscape workspaces keep the bottom-sheet presentation even when their
width exceeds 48rem. Height is part of the capability gate.

## Layout and motion

Opening a docked Performer or Developer inspector reserves the inspector, rail,
and seam widths from the 3D canvas. The canvas transition and inspector reveal
share the emphasis duration. Reduced-motion users receive an immediate layout
change.

Opening an overlay never changes canvas geometry. A pointer press outside it or
Escape dismisses it. Interacting with a portalled modal opened from the
inspector does not dismiss the inspector behind the modal.

Buttons retain the 44px interaction floor. Desktop rail buttons are compact,
consistent squares. Category controls size to their content or capped grid
tracks; equal-width stretching is used only where stable tab geometry is
necessary.

The shared playback timeline is always visible at the bottom when a loaded
sequence reports playable steps. Stage and standalone viewer hosts must not
clip it or replace it with a second play-button implementation.

Save Scene provides three equivalent dismissal paths: a visible close button,
Escape, and a pointer press and release on the modal backdrop. Interactions
inside the modal or a nested portalled surface do not dismiss it.

## Verification contract

- Pure tests cover presentation resolution, panel width, and reserved canvas
  width.
- Type checking covers all production consumers.
- Runtime verification covers the production `/stage/scene` route, full viewer,
  split viewer, standalone fullscreen, and the mobile 3D harness. An isolated
  harness cannot substitute for the production Stage route.
- Visual verification covers 1920x1080, 2560x1440, 3840x2160, 1440x900,
  820x1180, 960x412, and 375x667.
- Wide verification proves the canvas is narrower for a docked Performer
  editor and remains full-width for shallow Camera, Formation, and Scene
  inspectors.
- Compact verification proves the side rail is absent, sheet navigation has a
  reachable Back/Close path, and the sheet body owns scrolling.
- Production-route verification proves playback is visible after sequence
  selection; every physical prop choice resolves through the shared 3D catalog;
  and Save Scene closes through its button, backdrop, and Escape.
