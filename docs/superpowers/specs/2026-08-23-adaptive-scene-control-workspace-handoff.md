# Adaptive Scene Control Workspace — Handoff (2026-08-23)

## Mission

Finish and land the adaptive controls redesign for the production 3D Scene
Studio. The work makes desktop scene editing a coherent right-side workspace,
uses horizontal room on wide displays, keeps shallow tools from reserving an
empty dock, and gives phones a focused bottom-sheet flow. The current governing
document is the [Adaptive Scene Control Workspace](active/2026-08-21-adaptive-scene-control-workspace-design.md).
The older Performer Hub Rethink plan is useful history, but its avatar-modal
direction was explicitly superseded by Austen's 2026-08-22 inline-editor call.

## Done — verified

No implementation item qualifies as landed yet. The scene-control implementation
is still uncommitted in the shared `main` working tree, so there is no truthful
implementation commit SHA to cite. `fca6c4a2b7` was the `HEAD` before this
handoff and belongs to an unrelated Tunnel Creator handoff. The verified
working-tree evidence is recorded under **In flight** and must not be described
as merged or shipped.

## Believed done — unverified

- The shared scene-control workspace is wired into the production Stage and
  fullscreen viewer hosts, but the full host matrix in the active spec was not
  rerun after the final inline-avatar change.
- Camera, Formation, and Scene were visually verified as content-sized overlays
  during the 2026-08-22 pass. That verification preceded the final avatar edit
  and should be repeated before landing the whole implementation.
- Playback, inspector scrolling, mobile drill-down navigation, and all three
  Save Scene dismissal paths were exercised during the earlier workspace pass.
  No durable screenshots or test artifact was committed, so treat these as
  requiring a fresh pickup audit.
- The original Performer Hub Rethink plan left natural-pose thumbnail generation
  and the sequence-picker preview task marked incomplete. They are not silently
  part of this handoff's approved scope; inspect current product behavior and ask
  Austen only if repository evidence cannot resolve whether they still matter.

## In flight

Work is on `main` in the primary checkout at `E:\tka-platform`. No branch or
worktree was created. The implementation files are uncommitted among a very
large shared dirty tree. Never stage or commit the directory broadly.

The core candidate file set for this workspace work is below. Audit each diff
against `fca6c4a2b7` before committing because several tracked files may also
contain changes from parallel sessions.

- Governing design: `docs/superpowers/specs/active/2026-08-21-adaptive-scene-control-workspace-design.md`
- Workspace composition: `SceneControlWorkspace.svelte`,
  `SceneControlRail.svelte`, `SceneControlInspector.svelte`, and
  `SceneChromeButton.svelte` under
  `src/lib/shared/3d/components/controls/`
- Performer composition: `PerformerInspectorContent.svelte`,
  `PerformerHub.svelte`, `PerformerHubDetail.svelte`,
  `PerformerSpine.svelte`, `performer-hub-types.ts`, and
  `PropFamilyPicker.svelte`
- Inline avatar editor: `avatar-select/AvatarSelectWorkspace.svelte` and the
  compatibility wrapper `avatar-select/AvatarSelectModal.svelte`
- Compact presentation: `MobileSceneControls.svelte`,
  `MobileSceneEverythingSheet.svelte`, `MobileScenePerformerSheet.svelte`, and
  `controls/BottomSheet.svelte`
- Viewer/route integration: `Viewer3DFullscreen.svelte`,
  `src/lib/features/stage/StageModule.svelte`, and
  `src/lib/features/scene-3d-collection/components/SaveSceneModal.svelte`
- Pure owners and focused tests: `src/lib/shared/3d/domain/scene-control-layout.ts`,
  `tests/unit/3d-viewer/scene-control-layout.test.ts`,
  `src/lib/shared/3d/domain/scene-prop-catalog.ts`, and
  `src/lib/shared/3d/domain/scene-prop-catalog.test.ts`

Current working-tree verification:

- `pnpm vitest run tests/unit/3d-viewer/scene-control-layout.test.ts src/lib/shared/3d/domain/scene-prop-catalog.test.ts`
  passed on 2026-08-23: 2 files and 7 tests passed in 211 ms.
- `curl.exe -k -s -o NUL -w "%{http_code}" https://localhost:5173/stage/scene`
  returned `200` on 2026-08-23.
- At a DevTools-emulated 2560×1440 viewport on 2026-08-22, the Avatar category
  rendered a 607 px inline workspace inside an 886 px inspector: 236 px live
  preview plus a 355 px picker. No dialog or `Change avatar` button existed.
  Focusing Y-Bot produced `selected=y-bot`, `applied=x-bot`, and the action
  `Use this avatar`; applying it produced `applied=y-bot` and
  `This avatar is active`, still without a dialog.
- At 375×667 on 2026-08-22, the same editor resolved to one 318 px column,
  `documentElement.scrollWidth` equaled `clientWidth`, and no dialog opened.
  The sheet body owned vertical scrolling. Browser console inspection returned
  no warnings or errors.
- Local visual evidence currently exists at
  `C:\Users\Austen\AppData\Local\Temp\performer-avatar-inline-wide.png`,
  `C:\Users\Austen\AppData\Local\Temp\performer-avatar-inline-phone.png`, and
  `C:\Users\Austen\AppData\Local\Temp\performer-avatar-inline-phone-scrolled.png`.
  These are temporary files, not committed artifacts.
- `pnpm check:fast` ran on 2026-08-22 and remained globally red with 379 errors
  and 22 warnings from the shared repository. Grepping the captured output found
  no diagnostic naming `AvatarSelectWorkspace`, `AvatarSelectModal`,
  `PerformerHubDetail`, `SceneControlWorkspace`, `scene-control-layout`, or
  `scene-prop-catalog`. The log is
  `%TEMP%\performer-avatar-inline-check.txt` on this machine.

## Loose ends (ranked)

1. Run the `pickup` workflow and audit the candidate implementation set file by
   file. Separate this task's coherent diff from parallel-session edits before
   any implementation commit. Use explicit pathspecs for every commit.
2. Repeat the active spec's production-route visual matrix at 1920×1080,
   2560×1440, 3840×2160, 1440×900, 820×1180, 960×412, and 375×667. Cover the
   production Stage route, full viewer, split viewer, standalone fullscreen,
   and compact harness. Preserve screenshots in a durable evidence directory if
   the implementation is going to be called done.
3. On a no-sequence 375×667 state, the `No sequence loaded` card visually sat
   above the open Performer sheet in the screenshot. Determine whether this is
   an existing empty-state stacking bug or a workspace regression. Do not hide
   it merely to improve the screenshot.
4. Recheck playback with a real loaded sequence, including Play → Pause state,
   timeline progress, and compact controls. The current 2026-08-23 route probe
   only proves the application shell serves.
5. Recheck Save Scene dismissal by visible X, Escape, and backdrop press, plus
   portalled-dialog dismissal guards in the Performer dock.
6. Decide whether `AvatarSelectModal.svelte` still has a legitimate external
   consumer. It now wraps the same inline workspace for compatibility; do not
   delete it until meaning-based search proves it is unused and no planned host
   needs a top-layer presentation.
7. Keep the global check baseline visible. Fix only diagnostics introduced by
   this implementation; the other 379 errors and 22 warnings belong to the
   shared repository unless separately assigned.

## Decisions already made

- On 2026-08-21, Austen approved a responsive architecture with genuinely
  different desktop and phone patterns. Wide workspaces use a right-side work
  column; phones use bottom-sheet drill-down pages.
- On 2026-08-22, Austen rejected tall, narrow Performer controls that occluded
  the cast while leaving horizontal room unused. Wide editors must grow
  horizontally and remain content-led vertically.
- On 2026-08-22, Austen accepted the top-right command cluster and right-side
  scene rail direction, provided their buttons share one visual language and
  shallow tools do not create an empty full-height dock.
- Performer and Developer tools may reserve dock width on a wide workspace.
  Camera, Formation, and Scene remain light-dismiss overlays because their
  editors are shallow.
- The prop picker consumes the physical 3D catalog shared with Prop Studio.
  `HAND` is presented separately as `Bare hands / No visible 3D prop`, never as
  a physical hand prop.
- Playback remains a bottom transport and must be available whenever a loaded
  sequence has playable steps.
- Save Scene requires a visible close button, Escape dismissal, and backdrop
  dismissal.
- On 2026-08-22, Austen explicitly replaced the avatar modal workflow. The
  Avatar category itself now contains the live preview, description, explicit
  apply action, and keyboard-aware grid. Do not restore a `Change avatar`
  button or force a second modal from this panel.

## Gotchas

- `/lab/viewer-3d` is not a registered Lab tab and falls back to the saved Lab
  destination, often Themes. Test the real product at `/stage/scene`; do not
  diagnose that redirect as server caching.
- Port 5173 is Austen's HTTPS/2 dev server. Use
  `https://localhost:5173/...`, never `http://`, and never start, stop, restart,
  or kill that server.
- The shared checkout is extremely dirty and contains staged deletions and
  unrelated edits. `git add -A`, directory staging, a bare `git commit`, reset,
  checkout, and cleanup operations are unsafe.
- Browser verification must use the shared debug Chrome launcher and one
  task-owned background tab with a fixed page ID. Clear emulation and close only
  that tab afterward.
- HMR can close the open inspector. Reopen Performers and then Avatar before
  assuming the inline editor failed to render.
- `AvatarSelectWorkspace.svelte` deliberately puts `container-type` on an
  outer shell and applies the query to the inner grid. Moving the query
  container onto the grid itself breaks its self-contained compact behavior.
- The avatar grid changes focused preview first and applies only through the
  explicit action. Do not turn focus traversal into immediate avatar loading;
  the 180 ms preview settle avoids thrashing the expensive live model.
- The phone screenshot used a no-sequence state, which exposed the stacking
  issue described above. The avatar editor itself still measured correctly and
  had no horizontal overflow.
