---
status: active
value: null
effort: null
remaining: "Verify environment catalog normalization and 2D-pair migration against current 3D Studio and saved scene code."
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: unverified
---
# 3D Studio and Environment Separation

**Date:** 2026-08-21  
**Status:** Approved for implementation

## Outcome

The application background and a 3D scene environment are independent choices.
Changing a scene never repaints the application, and changing the application
theme never changes an open or saved scene.

The existing Stage module becomes **3D Studio**, the production home for 3D
authoring. Its stable module id remains `stage` so saved navigation, feature
flags, and deep links continue to work.

3D Studio has two products:

1. **Scene** — load one sequence, art-direct its performers, environment,
   camera, effects, and playback, save the scene, and export a 3D video.
2. **Stage** — build a multi-performer performance with sequence lanes,
   formations, movement marks, and one authoritative playhead.

Create remains the source-artifact workspace. Sequence and Tunnel creation stay
there. Sequence Viewer keeps its reduced 3D viewing mode. Browse remains the
collection owner for saved scenes.

## Why this boundary

The 3D environment is document state. The application background is a user
preference. Their initial catalogs may deliberately contain matching art, but
matching names do not make them one setting.

The repository already has one shared 3D runtime and two authoring scales:

```text
Create                          3D Studio
sequence / tunnel artifacts -> Scene: art direction + render
                            -> Stage: multi-performer performance

Browse                          Sequence Viewer
saved artifact collection       reduced viewing consumer
```

Adding a Create 3D tab would put lightweight 3D authoring in Create while the
advanced version remained in Stage. Renaming and expanding Stage gives both
workflows one discoverable home without adding another top-level module.

## Capability ownership

Search vocabulary: `backgroundType`, `environment`, `scene`, `viewer-3d`,
`StageChoreography`, `SaveSceneModal`, `export3DAnimation`, `Viewer3DFullscreen`.

- **Create** `SceneEnvironmentId` and the 3D environment catalog in
  `shared/3d/environments/domain`. This is the canonical identity used by 3D
  state and saved artifacts.
- **Keep separate** `BackgroundType` in application settings. It remains the
  canonical 2D application-theme preference.
- **Extend** `viewer-3d-state.svelte.ts` so persistent and isolated viewers own
  a mutable environment id. The persistent viewer stores it in its own
  `tka-viewer3d-*` namespace.
- **Extend** `StageChoreography` so Stage documents own an environment id.
- **Reuse** `Environment3D` as the rendering owner. A registry adapter maps the
  independent environment id to the renderer's current background-key input
  until that input is renamed in a later renderer-only cleanup.
- **Extend** `SceneSelectorPopover` into a controlled or context-backed shared
  picker. It never reads or writes application settings.
- **Reuse** `Viewer3DFullscreen`, the adaptive scene-control workspace,
  `SequencePickerModal`, playback state, saved-scene capture, and the existing
  3D export pipeline.
- **Compose** those owners in the new Scene tab. Do not copy viewer controls,
  renderer state, or export algorithms into `features/stage`.

## Environment catalog

`SceneEnvironmentId` is intentionally a different TypeScript domain from
`BackgroundType`. The initial environment ids keep the existing slugs so old
saved data translates without guessing.

Each environment definition contains:

```ts
interface SceneEnvironmentDefinition {
  id: SceneEnvironmentId;
  label: string;
  icon: string;
  rendererKey: BackgroundType;
  pairedBackgroundId?: BackgroundType;
}
```

`pairedBackgroundId` supports art-direction parity and first-use migration. It
does not synchronize either setting. A future 3D-only environment adds a new
definition without adding a 2D background; a future 2D-only background requires
no 3D placeholder.

## Persistence and migration

### Viewer draft

- `tka-viewer3d-environment` stores the persistent viewer's environment.
- When that key is absent, the first persistent viewer maps the current 2D
  background through `pairedBackgroundId`, stores the result, and becomes
  independent from then on.
- Seeded preview viewers remain isolated and never write the persistent key.

### Saved scenes

- Scene snapshots advance to version 3 and store `scene.environmentId`.
- Versions 1 and 2 continue to accept `scene.backgroundType`; normalization
  maps it through the environment catalog.
- Capturing a scene reads the viewer environment, not `settingsService`.
- Applying or opening a scene writes viewer-local environment state only. It
  never calls `updateSetting("backgroundType", ...)` and no longer needs a
  settings checkpoint for the environment group.

### Stage documents

- `StageChoreography.environmentId` is document state.
- Existing in-memory/default Stage documents map the user's current background
  once when the state factory is constructed.
- Stage environment changes participate in Stage undo/redo and never affect
  application settings.

## 3D Studio navigation

The `stage` module keeps its id and becomes **3D Studio**.

| Tab id | Label | Product |
| --- | --- | --- |
| `scene` | Scene | Standalone single-sequence 3D scene and video authoring |
| `editor` | Stage | Multi-performer performance authoring |

The old `editor` id remains valid. Scene is first and becomes the default for a
new 3D Studio visit.

The Scene tab starts with a real source picker rather than silently choosing a
catalog entry. It accepts one-shot handoffs from saved scenes and sequence
surfaces. A loaded scene exposes source replacement, save, playback, immersive
view, and the existing adaptive scene controls.

The Lab `viewer-3d` tab and loader are removed after the Scene tab is live.

## Export boundary

The Scene tab must use the existing offline 3D exporter and export progress
presentation. `features/stage` may own the button and session composition, but
it must not add a second encoder, frame sampler, camera buffer, or WebGL capture
path.

Stage-specific export remains a follow-up because a `StageChoreography` has a
different multi-clip sampling contract. The module boundary is ready for it;
this implementation does not claim that a single-sequence export can encode a
Stage document.

## Risks

1. Ocean post-processing and scene audio currently read the global background
   as a fallback. Every production 3D consumer must move to viewer or Stage
   environment state or it will silently render mixed scenes.
2. Saved-scene version migration must preserve versions 1 and 2 from Firestore
   and local storage.
3. The shared checkout contains active Stage and adaptive-control work. Changes
   must extend the current files without reverting that work.
4. 3D initialization is expensive. Scene and Stage tabs lazy-load and only the
   active tab mounts a WebGL canvas.
5. Module relabeling must not change the stable `stage` id or feature flag.

## Verification contract

### Automated

- Environment catalog normalization and 2D-pair migration.
- Persistent viewer environment round-trip.
- Seeded viewer isolation.
- Saved-scene v1/v2 to v3 compatibility and v3 round-trip.
- Applying a saved scene does not call or require the application background
  owner.
- Stage environment state, undo, and redo.
- 3D Studio tab routing and absence of the Lab viewer entry.

### Runtime

1. Set a visible 2D background, open 3D Studio, and choose a different 3D
   environment. The application background remains unchanged.
2. Reload 3D Studio. Its environment persists independently.
3. Change the application background while the Scene tab is open. The 3D
   environment remains unchanged.
4. Save, close, and reopen a scene. Environment, camera, performers, playback,
   and export reproduce the authored result.
5. Open Stage, change its environment, and return to Scene. Both documents keep
   their own choices.
6. Verify Scene and Stage at 1920×1080, 2560×1440, 3840×2160, 1440×900,
   820×1180, 960×412, and 375×667 with no new console or WebGL errors.
