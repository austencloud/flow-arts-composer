# Film Autosave, Render Card, Local Retention — Implementation Plan

Date: 2026-09-01 · Branch: `claude/film-autosave` · Worktree: `E:/worktrees/tka-platform/film-autosave`

## Problem

In the Sequence Viewer's 3D pane, Record Scene runs two passes: Pass 1 samples the live
camera into a `CameraKeyframeBuffer` (60 Hz); Pass 2 re-renders offline at a fixed
60 fps timestep (deterministic). After Pass 2 the film exists only as a blob URL in
`VideoPreviewPanel`. "Done" revokes it and the keyframes are garbage. Also, Stop goes
straight into Pass 2 using whatever `ExportPopover` settings happen to be set, which
the user may never have opened.

## Decisions (approved by Austen 2026-09-01)

1. **Always, silently, save the film recipe** (scene snapshot + camera keyframes +
   render options) into the existing 3D scene collection at Stop, before rendering.
   Pass 2 is deterministic, so the recipe reproduces the film at any resolution later.
2. **Automatically retain rendered files locally** (IndexedDB, capped) so "Done" is not
   destructive.
3. **Cloud upload stays opt-in** via the existing Save button → performance-video
   pipeline (Firebase Storage + Firestore `videos/`), which every surface already reads.
4. **Insert a compact render card between Stop and Pass 2**: duration, preset row
   (Draft / Final / Cinema, or Custom), estimated render time, Render, Re-record.
   Remembers last choice. Draft-then-final is the intended loop.

## Ownership (never-hand-roll evidence)

| Capability | Owner | Relationship |
|---|---|---|
| Camera keyframes | `shared/video-export/domain/camera-keyframe.ts` (`CameraKeyframeBuffer`) | **Extend**: serialize/thin + rehydrate |
| Saved 3D scenes | `features/scene-3d-collection/*` (`Collected3DScene`, `scene3dCollectionState`, `captureScene3DSnapshot`, `captureScene3DPoster`) | **Extend**: optional `film` block on the entry |
| Render options | `shared/animation-panel/state/export-options-state.svelte.ts` (`getExportOptionsState`) | **Reuse**: presets write through its setters |
| Single-select preset row | `shared/ui/components/SegmentedControl.svelte` | **Reuse** (chip-primitives rule) |
| Pass 1/2 orchestration | `shared/sequence-viewer/components/export-coordinator.svelte.ts` | **Extend**: render-card gate + recipe save + retention |
| Recording overlay UI | `shared/sequence-viewer/components/Recording3DOverlay.svelte` | **Extend**: new "pending render" phase |
| Offline render | `sequenceModalExporter.export3DAnimation` | **Reuse** unchanged |
| Local video blobs | pattern: `shared/video/services/video-cache.ts` (raw IndexedDB) | **Create** `rendered-film-store.ts` — video-cache is keyed by remote URL and semantically a download cache, so a sibling store with its own DB is the honest owner |
| Cloud performance video | `shared/video-collaboration/*` (`uploadService.uploadAssociatedVideo`, `createVideoFromUpload`, `saveSequenceVideo`) | **Reuse** |
| Stage Studio handoff | `features/scene-3d-collection/services/open-3d-scene.ts` (`openScene3DInStudio`, `consumeSceneStudioHandoff`) + `features/stage/scene/services/create-scene-video-export.svelte.ts` | **Extend**: film keyframes ride the handoff; render uses them instead of `captureStatic` |

## Phase 1 — Domain: film recipe

**Files**
- `src/lib/shared/video-export/domain/camera-keyframe.ts`
  - `export function compactCameraKeyframes(keyframes, opts = { sampleHz: 30, precision: 4 }): CameraKeyframe[]`
    — thins to ≤ sampleHz (always keeps first and last), rounds numbers to `precision`
    decimals. 60 s at 30 Hz ≈ 1800 frames ≈ 150 KB JSON; Firestore doc limit is 1 MB,
    so also **hard-cap at 6000 keyframes** (drop rate further if exceeded).
  - `static CameraKeyframeBuffer.fromKeyframes(keyframes: readonly CameraKeyframe[]): CameraKeyframeBuffer`
    — rehydrates for Pass 2 (`duration` getter must work).
- `src/lib/features/scene-3d-collection/domain/scene-3d-collection-types.ts`
  - Add:
    ```ts
    export type FilmCameraMode = "free" | "auto-orbit";
    export interface Scene3DFilmRender {
      fps: number; resolution: number; quality: "standard" | "cinema";
      includeStartPosition: boolean; includeEndHold: boolean;
    }
    export interface Scene3DFilm {
      version: 1;
      recordedAt: number;
      durationSeconds: number;
      cameraMode: FilmCameraMode;
      keyframes: CameraKeyframe[];
      render: Scene3DFilmRender;   // options chosen for the first render
      autoSaved: boolean;          // true = written by the Stop hook, eligible for pruning
    }
    ```
    `Collected3DScene.film?: Scene3DFilm` + `Scene3DFilmSchema` (zod; keyframes as
    tuples of numbers) + add to `Collected3DSceneSchema`.
  - `export function scene3DHasFilm(scene): boolean`.
- `src/lib/features/scene-3d-collection/domain/__tests__/scene-3d-collection-types.test.ts`
  — round-trip a film entry through the schema; reject a film with 0 keyframes.
- New `src/lib/shared/video-export/domain/__tests__/camera-keyframe.test.ts` —
  `compactCameraKeyframes` keeps first/last, respects sampleHz, hard cap; `fromKeyframes`
  duration matches.

## Phase 2 — Auto-save the recipe at Stop

**New** `src/lib/features/scene-3d-collection/services/save-film-recipe.ts`
```ts
export const MAX_AUTOSAVED_FILMS = 12;
export async function saveFilmRecipe(input: {
  viewer3DState: Viewer3DState;
  sequence: SequenceData | null;
  bpm: number | undefined;
  keyframes: readonly CameraKeyframe[];
  cameraMode: FilmCameraMode;
  render: Scene3DFilmRender;
}): Promise<Collected3DScene | null>
```
- Ensures the collection is started: `authState.user?.uid ? ensureStarted(uid) : initLocal()`
  (same pattern as `PresetsPanel.svelte:35`).
- `captureScene3DSnapshot(viewer, { bpm, groups: all on })`, `captureScene3DPoster`,
  `steps` from the sequence, `sourceWord` via `simplifyRepeatedWord`
  (simplified-word-display rule), name `${word} — film` (fallback `"Film"`).
- `film.keyframes = compactCameraKeyframes(keyframes)`, `autoSaved: true`.
- `scene3dCollectionState.add(...)`. Then prune: among entries with `film?.autoSaved`,
  keep the newest `MAX_AUTOSAVED_FILMS`, `remove()` the rest. Renaming an entry
  (existing `rename`) should flip `autoSaved` to false — do that in `rename` for this
  collection via a small wrapper in this service or by patching `film` in
  `Scene3DCollectionModule.svelte`'s rename path. Pick the least invasive; document.
- Never throws: catch, `console.warn("[FilmRecipe] …")`, return null. The render must
  never be blocked by a save failure.

**Coordinator** (`export-coordinator.svelte.ts`, 3D branch): after
`cameraKeyframes.stopRecording()` and the `recordedDuration <= 0` guard, and BEFORE
Pass 2, call `saveFilmRecipe(...)` and hold the returned entry id in
`let lastFilmEntryId = $state<string | null>(null)`. Camera mode: `useOrbit ? "auto-orbit" : "free"`.

## Phase 3 — Render card between Stop and Pass 2

**Presets** — new `src/lib/shared/video-export/domain/film-render-presets.ts`
```ts
export const FILM_RENDER_PRESETS = [
  { id: "draft",  label: "Draft",  fps: 30, resolution: 720,  quality: "standard" },
  { id: "final",  label: "Final",  fps: 60, resolution: 1080, quality: "standard" },
  { id: "cinema", label: "Cinema", fps: 60, resolution: 2160, quality: "cinema"   },
] as const;
export function matchFilmRenderPreset(opts): FilmRenderPresetId | "custom"
export function estimateFilmRenderSeconds(durationSeconds, opts): number
```
Estimate = frames × per-frame cost; per-frame cost table by resolution (720: 0.03 s,
1080: 0.05, 2160: 0.16, 4320: 0.6) × (quality === "cinema" ? 6 : 1). Label as
"about N s / N min". These are honest heuristics; say so in a comment.

**Coordinator gate** — replace the direct fall-through into Pass 2 with:
```ts
let pendingFilmRender = $state<{ durationSeconds: number } | null>(null);
let resolvePendingRender: ((go: boolean) => void) | null = null;
// after recipe save:
pendingFilmRender = { durationSeconds: recordedDuration };
const go = await new Promise<boolean>((r) => { resolvePendingRender = r; });
pendingFilmRender = null; resolvePendingRender = null;
if (!go) { showToast("Recording kept in your scenes — render it any time", "info"); return false; }
const opts = exportOptions.getVideoOptions(); // re-read AFTER the card, not before Pass 1
```
Expose `pendingFilmRender`, `handleConfirmFilmRender()`, `handleDiscardFilmRender()`
through: coordinator return → `viewer-orchestrator-context.ts` (interface) →
`viewer-orchestrator-context-state.svelte.ts` (wiring, mirror `recordingElapsed`) →
`viewer-shell-interaction-state.svelte.ts` (with `dependencies.captureScanAction`
names `film_render_confirm` / `film_render_discard`, mirror `handleStopRecording`).

Note: the "Recording" UI (`isRecording3D`) must be false while the card shows, and
`sequenceModalExporter.state.isExporting` is still false there — the card is its own
phase. Verify `RecordSceneChrome`'s `isExporting` prop hides/disables the pill during
the card (pass `ctx.isExporting || !!ctx.pendingFilmRender`).

**UI** — new `src/lib/shared/sequence-viewer/components/record-scene/RenderFilmCard.svelte`
- Props: `durationSeconds`, `onRender`, `onDiscard`, `exportOptions` (the
  `getExportOptionsState()` handle, so the preset row writes through
  `setVideoFps/setVideoResolution/setVideoQuality`; the choice persists as last-used).
- Layout (fits inside the existing `.export-card` styling of `Recording3DOverlay`):
  title "Render your film", meta line "{m:ss} recorded · {preset detail}", a
  `SegmentedControl` with Draft / Final / Cinema (+ a "Custom" option shown only when
  current options match none; selecting a preset writes the options), estimated
  render time line (tabular-nums, ghost-sized so it does not shift), primary
  `Render` button (`data-save-shortcut` not needed), secondary `Re-record`.
  Enter = Render, Escape = Re-record. Focus the Render button on mount.
- Buttons look like buttons (rule). No checkboxes. Duration tokens from `DURATION`.
- Mount it from `Recording3DOverlay.svelte` as a third branch:
  `{#if pendingRender}` → full-screen overlay with the card (same `.overlay` shell as
  the export progress). Add props `pendingRender`, `onConfirmRender`, `onDiscardRender`
  and wire them in `SequenceViewerShell.svelte:947`.

## Phase 4 — Local retention of rendered films

**New** `src/lib/shared/video-export/services/rendered-film-store.ts`
- Raw IndexedDB (`DB_NAME = "tka-rendered-films"`, store `films`, keyPath `id`,
  index `createdAt`). Mirror `video-cache.ts` structure; no new dependency.
- Record: `{ id: string; filmEntryId: string | null; sequenceId: string | null; word: string; blob: Blob; mimeType: string; byteSize: number; render: Scene3DFilmRender; durationSeconds: number; createdAt: number }`.
- API: `putRenderedFilm(record)`, `getRenderedFilm(id)`, `listRenderedFilms()` (newest
  first, no blobs — use a projection or read then strip), `getRenderedFilmsForEntry(filmEntryId)`,
  `deleteRenderedFilm(id)`, `pruneRenderedFilms({ maxCount: 8, maxBytes: 600 * 1024 * 1024 })`
  (LRU by createdAt). SSR/unavailable → all functions no-op/return empty.
- Unit test with `fake-indexeddb` if already a devDependency (`grep package.json`);
  otherwise test the pure prune-selection helper only.

**Coordinator**: after Pass 2 success (`exported3DOk`), `fetch(previewBlobUrl).blob()`
and `putRenderedFilm({...})` linked to `lastFilmEntryId`, then `pruneRenderedFilms()`.
Fire-and-forget with warn on failure.

**Collection module** (`Scene3DCollectionModule.svelte` detail view): for an entry
with `film`, add a "Film" badge on the card (`FilterChipBase`-style chip is overkill —
a small badge span is display-only and allowed) and, in `detail-actions`:
- If a retained render exists for this entry (query the store on open): inline
  `<video>` preview (reuse `VideoPreviewPanel` with `saveLabel="Save"`,
  `onRedownload` → `shareOrDownloadBlob`, `onDismiss` hides the preview).
- Always: `Render film` button → `openScene3DFilmInStudio(scene)` (Phase 5).
- Keep `Open in 3D Studio` and `Apply look` as they are.

## Phase 5 — Re-render a saved film in Stage Studio

- `open-3d-scene.ts`: extend `SceneStudioHandoff` with `film?: Scene3DFilm` and add
  `openScene3DFilmInStudio(scene)` = `openScene3DInStudio` + film in the handoff.
  `consumeSceneStudioHandoff` returns it.
- `features/stage/StageModule.svelte`: if `handoff.film`, pass it to the exporter and
  auto-open the scene export modal in a "film ready" state (find the modal open state;
  if wiring the auto-open is invasive, a toast with an action "Render film" that opens
  the modal is acceptable — say which you did).
- `create-scene-video-export.svelte.ts`: `render(sequence, bpm, film?: Scene3DFilm)` —
  when `film` is present use `CameraKeyframeBuffer.fromKeyframes(film.keyframes)` and
  `totalDurationSeconds = film.durationSeconds` instead of `captureStatic` + computed
  duration. Show the same `RenderFilmCard` presets in `SceneExportModal` when a film
  is present (reuse the component; do not fork).

## Phase 6 — Cloud save (opt-in) from the preview panel

Scope check first: `VideoPreviewPanel`'s Save button today = download/share. Add a
second action only if `VIDEO_UPLOAD_ENABLED` (viewer-feature-flags) and the user is a
full account: `Save to sequence` → `uploadService.uploadAssociatedVideo(sequence.id, file, …)`
+ `createVideoFromUpload` + `saveSequenceVideo` (store add), mirroring
`VideoUploadSheet.svelte:193-249` minus the file picker. Implement as a small service
`shared/video-collaboration/services/upload-rendered-film.ts` and a new optional
`onSaveToCloud` prop on `VideoPreviewPanel` (button rendered only when provided).
Wire in `SequenceViewerShell.svelte:1029` only. If `uploadService` acquisition
(`getVideoUploader`/R2 uploader) turns out to be gated or absent in this host, stop
and report rather than inventing a path.

## Verification (per verification-protocol + visual-verification-mandatory)

- `npm run check:fast` clean for touched files; `npx vitest run` on the new/changed
  test files with output pasted.
- Visual: `/sequence/<id>` in 3D, Record Scene → Stop → render card at 1920×1080,
  1440×900, 960×412, 375×667 (the card is a viewer overlay; 2560/3840 too if cheap).
  Screenshot the card, the collection detail with the Film badge and retained
  preview, and the Stage Studio re-render entry.
- Runtime proof: after a render, `indexedDB` has one record in `tka-rendered-films`;
  the scene collection has a new entry with `film.keyframes.length > 0`.

## Ledger

- [x] P1 domain + tests
- [x] P2 recipe autosave at Stop + pruning
- [x] P3 render card + gate + context plumbing
- [x] P4 rendered-film store + retention + collection preview
- [x] P5 Stage Studio re-render from film
- [x] P6 cloud save opt-in
- [x] checks + visual pass + commit (explicit pathspec) + wt:finish
