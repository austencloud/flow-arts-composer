---
status: active
value: null
effort: null
remaining: "Verify Post Studio Composition and Time Mapping against src/lib/shared/animation-engine/timeline/services/step-grid-calculator.ts before resuming implementation. Prior recorded remainder: Resolve the unused preset repository, rights-cleared audio, and whole-Compose persistence; verify current export gates."
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: unverified
---
# Post Studio Composition and Time Mapping

**Date:** 2026-08-13

**Status:** Gates 1 through 3 are implemented. Gate 4 has synchronized original-audio export, tempo-driven sequence playback, and an explicit Instagram-music path. Gate 5 has deterministic MP4 export; the preset-first surface was replaced by two picked slots (`fb6e64c945`, per the 2026-08-15 slots design), which left `media-composition-preset-repository.ts` (the durable Dexie+Firestore preset store) with no callers — re-point it at slot arrangements or retire it before claiming persistence. Rights-cleared track mixing, whole-Compose serialization, and any persistence of the studio's editing state remain. The rendered post now flows into the share sheet (2026-08-23); before that the studio ended at a Download link.

**Capability owner:** Shared media composition

**Related work:** [Social Post Handoff Design](./2026-08-09-social-post-handoff-design.md), [Post Share Sheet Handoff](./2026-08-10-post-share-sheet-handoff.md), [Meta Posting Checklist](../../../reference/meta-posting-e2e-checklist.md)

## Decision

Build Post Studio as a focused view of one shared media-composition project. Compose and Post Studio will edit the same project model at different levels of detail.

Post Studio is not a miniature copy of Compose and it is not an Instagram editor clone. It owns the parts TKA can render exactly: layout, timing, crop, trim, card styling, animation, transitions, original or rights-cleared audio, and reusable presets. Instagram-only choices remain part of the handoff or publishing step.

The first reference preset is a 9:16 performance breakdown:

- The upper half plays a performance video during the first half.
- The upper half crossfades to the TKA animation during the second half.
- The lower half shows the choreo card for the full post.
- The card highlight and animation position follow the same sequence time map as the performance video.
- Original video audio remains available. A rights-cleared music track can replace or mix with it.
- The arrangement can be saved as a reusable preset whose source roles are rebound for the next sequence.

This reference is the acceptance fixture for the composition engine. It is not a one-off effect.

## Product outcome

From any shareable TKA artifact, a person can open Post Studio and see the actual vertical frame that TKA will export. They can choose a preset, replace sources, adjust crop and timing, preview transitions, set audio, save the arrangement, and then either publish through an eligible Meta connection or finish the post in Instagram.

From Compose, Share sends the whole current composition into Post Studio. It must not silently share only the first sequence.

The experience must make four facts obvious:

1. What pixels TKA will render.
2. What audio TKA will render.
3. Which Instagram fields TKA can send directly.
4. Which remaining choices happen inside Instagram.

## Scope

### Included

- A versioned spatial and temporal media-composition model.
- 9:16 presets built from video, TKA animation, choreo card, image, and audio sources.
- Regions, clips, crop, trim, playback rate, stacking, and crossfades.
- A sequence time map that can align video, animation, and card highlighting.
- Manual beat annotation plus assisted tempo and motion candidates.
- Original video audio and user-provided rights-cleared audio.
- Preview and export driven by the same frame evaluator.
- Reusable structure presets with source-role bindings.
- Post Studio entry from Share and full-composition entry from Compose.
- Capability-aware Instagram handoff and direct publishing.
- A research gate for Meta's 2026 Instagram Audio API.

### Not included in the first implementation

- Rebuilding Instagram's complete native editor.
- Claiming access to Instagram's full licensed or trending music catalog.
- Autonomous selection of copyrighted music.
- Multi-track effects processing beyond gain, fades, trim, and source mixing.
- A general desktop nonlinear editor.
- Replacing the TKA animation renderer.
- A second video encoder or renderer stack.

## Diligence findings

This is not a blank slate. The repository already contains useful pieces, but they do not yet share one time model or one render path.

### Capability ledger

| Existing capability                | Evidence                                                                                                                                                                                                       | Decision                              | Reason                                                                                                                                                                                        |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Audio BPM analysis                 | `src/lib/features/compose/compose/phases/audio/bpm-analyzer.ts`                                                                                                                                                | Extend                                | It performs real Web Audio decoding and confidence-based BPM analysis. It finds tempo, not beat phase or downbeats, and currently has no production caller or tests.                          |
| Constant-tempo beat grid           | `src/lib/shared/animation-engine/timeline/services/step-grid-calculator.ts`                                                                                                                                    | Extend                                | Its pure conversion and snap math are useful. Time-signature behavior and boundary cases need tests before it becomes shared canon.                                                           |
| Video beat map                     | `src/lib/shared/video-collaboration/domain/collaborative-video.ts`                                                                                                                                             | Migrate and extend                    | `StepMap` already persists timestamps on uploaded videos. It needs versioning, validation, fractional interpolation, inverse mapping, and explicit boundary rules.                            |
| Manual video beat editor           | `src/lib/shared/sequence-viewer/components/step-mapping/StepMapEditor.svelte` and `StepMapTimeline.svelte`                                                                                                     | Reuse interaction patterns            | Tap placement, drag adjustment, and even-spacing reset are proven. The UI stays feature-specific until the shared time-map contract exists.                                                   |
| Video-driven card highlighting     | `src/lib/shared/sequence-viewer/state/viewer-playback-presentation-state.svelte.ts` and `src/lib/features/video/video-lab/views/SyncedPlaybackView.svelte`                                                     | Extend                                | This proves the user value. It currently resolves only an integer highlighted beat and does not drive full animation interpolation.                                                           |
| Variable-duration animation timing | `src/lib/shared/animation-engine/services/step-calculator.ts`                                                                                                                                                  | Reuse                                 | This is the strongest existing owner for sequence time and displayed-beat semantics. Export and preview must call the same conversion path.                                                   |
| Animation export                   | `src/lib/features/compose/services/video-export-orchestrator.ts`, `src/lib/shared/animation-engine/services/background-video-encoder.ts`, and `src/lib/shared/animation-engine/workers/video-export.worker.ts` | Extend                                | It already provides deterministic offscreen rendering and Mediabunny encoding. It is video-only today and duplicates part of the time-to-beat calculation.                                    |
| Timeline editing                   | `src/lib/features/compose/timeline/` and `src/lib/shared/animation-engine/timeline/`                                                                                                                           | Compose from selected parts           | Snap, trim, resize, and waveform interaction patterns are useful. The current project is sequence-only, localStorage-based, and built around module singletons. It is not the new data owner. |
| Waveform display                   | `src/lib/features/compose/timeline/components/TimelineAudioTrack.svelte`                                                                                                                                       | Reuse library and interaction pattern | WaveSurfer is already installed. The component's automatic beat analysis is a placeholder and must not be presented as working analysis.                                                      |
| Crop and snip                      | `src/lib/features/landing-preview/`                                                                                                                                                                            | Extract domain math, adapt UI         | Normalized crop and second-based trim already work for curation. CSS preview math must be reconciled with export pixel transforms before reuse.                                               |
| Compose layout cells               | `src/lib/shared/animation-engine/domain/compose-types.ts`                                                                                                                                                      | Migrate                               | Existing cells cover video, animation, image, card, and 3D viewer. They do not describe temporal clips, transitions, source URLs, or durable source revisions.                                |
| Compose persistence                | `CompositionSyncer` and current Dexie/Firestore path                                                                                                                                                           | Extend                                | It is a better persistence base than Timeline localStorage. It needs versioned schemas and migration adapters.                                                                                |
| Tempo controls                     | `BpmChips.svelte`, `TempoControl.svelte`, and `BpmQuickPopover.svelte`                                                                                                                                         | Extract behavior owner                | Tap tempo, clamping, and presets are duplicated. A fourth tempo control is forbidden. Canonical limits come from shared animation timing constants.                                           |
| Motion segmentation                | `src/lib/features/train/prop-tracking-lab/services/beat-segmenter-3d.ts`                                                                                                                                       | Compose as optional evidence          | Motion holds and confidence can suggest performance anchors. Motion detection and audio tempo detection remain distinct producers of time-map candidates.                                     |
| Practice metronome                 | Existing Web Audio metronome                                                                                                                                                                                   | Keep separate                         | It schedules practice clicks. It is not an export audio track or a media mixer.                                                                                                               |
| Write music player                 | Existing `MusicPlayer`                                                                                                                                                                                         | Keep separate                         | Its media loading and error patterns are useful, but it does not own composition timing or export.                                                                                            |
| UI crossfade transition            | Shared Svelte crossfade primitive                                                                                                                                                                              | Keep separate                         | A DOM transition cannot define exported pixel blending. Media crossfade math needs a pure render owner.                                                                                       |

### Gaps that require a new shared owner

- No versioned project combines spatial regions, temporal clips, audio, and source bindings.
- No validated map converts between media seconds and fractional sequence position.
- No pure evaluator produces the same render plan for interactive preview and export.
- No export path decodes video sources, composites them with animation and cards, and preserves audio.
- No durable preset expresses role-based source replacement.
- No central eligibility contract tells the share UI which Meta capabilities are actually available.

## One project, two editing surfaces

The shared model is named `MediaCompositionProject` to avoid collision with the existing sequence-composition domain model.

Compose is the broad authoring surface. It can expose arbitrary regions, more cells, detailed source selection, and future editing tools.

Post Studio is the publishing surface. It starts from a small set of good vertical presets and exposes the controls required to finish one post. Advanced controls can reveal the underlying regions and clips without changing the model.

```text
Compose ───────────────┐
                      ├─> MediaCompositionProject ─> frame evaluator ─> preview
Share from an artifact ┘                                      └───────> export
                                                                      └> publish or handoff
```

There is one serialized project and one evaluation contract. The two surfaces may use different view state, selection state, and control density.

## Project model

The exact TypeScript names can change during the contract gate, but the semantic fields are required.

```ts
interface MediaCompositionProjectV1 {
  schemaVersion: 1;
  id: string;
  ownerId: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  output: OutputFormat;
  duration: DurationPolicy;
  sources: MediaSource[];
  regions: LayoutRegion[];
  clips: MediaClip[];
  transitions: MediaTransition[];
  timeMaps: SequenceTimeMapV1[];
  audioMix: AudioMix;
  targetOverrides: PublishTargetOverrides;
}
```

### Output format

The output records exact width, height, frame rate, background, and color behavior. Presets use a 9:16 default, but the engine is not hard-coded to one aspect ratio.

### Sources

A source is a durable reference, not a live DOM element.

Supported source roles are:

- Performance video, preferably a `CollaborativeVideo` reference with duration, storage identity, linked sequence, and time map.
- TKA sequence animation, identified by sequence ID plus revision or immutable snapshot.
- Choreo card, identified by the same sequence revision and versioned card settings.
- Image.
- Original video audio.
- User-owned or otherwise rights-cleared audio.

Saved projects must remain reproducible. A mutable sequence ID without a revision, hash, or snapshot is insufficient for an exported project.

### Regions

A region records normalized frame bounds, z-order, clipping, fit mode, background, transform, and safe-area behavior. Normalized geometry allows the same project to be evaluated at preview and export resolutions.

Crop, contain, and cover calculations belong to a pure transform module. The landing-preview crop UI can feed this model once its CSS behavior and export math produce the same rectangle.

### Clips

A clip binds one source to one region over a project-time interval. It records:

- Project start and end seconds.
- Source in and out points.
- Playback rate and loop policy.
- Opacity and transform envelopes where supported.
- Optional time-map and sync-group references.
- Incoming and outgoing transition references.

The model uses project seconds as the serialization unit. Musical labels are derived through a time map rather than stored as ambiguous beat indexes.

### Duration

A project can follow one source, follow the mixed audio, or use a fixed duration. The reference preset follows the performance video unless the user overrides it.

## Sequence time map

The existing `StepMap` becomes an input migration format. The shared owner is a versioned, validated `SequenceTimeMap`.

```ts
interface SequenceTimeMapV1 {
  schemaVersion: 1;
  id: string;
  sequenceRef: SequenceRevisionRef;
  mediaSourceId: string;
  anchors: SequenceTimeAnchor[];
  source:
    | "manual"
    | "tempo-grid"
    | "audio-detected"
    | "motion-detected"
    | "hybrid";
  boundaryPolicy: "clamp";
  confidence?: number;
  updatedAt: number;
}

interface SequenceTimeAnchor {
  mediaTimeSeconds: number;
  sequencePosition: number;
  confidence?: number;
}
```

`sequencePosition` uses the animation engine convention, including the start pose. The migration adapter must explicitly translate the old `beatTimestamps[0]` meaning into that convention. It must not assume that array index zero means animation position zero.

### Mapping rules

- Anchors are strictly increasing in both media time and sequence position.
- Duplicate or reversed anchors are invalid.
- Between anchors, mapping is piecewise linear.
- Before the first and after the last anchor, the initial policy is clamp.
- Both directions are supported: media time to sequence position, and sequence position to media time.
- Fractional sequence positions are preserved.
- Integer card highlighting is derived from the fractional position using the existing displayed-beat rules.
- Variable-duration TKA steps remain owned by the animation engine. The time map aligns external media to sequence position; it does not replace step-duration math.

### Candidate generation

Candidate producers remain separate and feed one review UI:

- Manual taps and marker dragging from the current Step Map editor.
- Even spacing from BPM plus a user-confirmed start offset.
- Audio BPM analysis with visible confidence.
- Future audio onset and downbeat analysis.
- Motion-hold candidates from the video-to-notation pipeline.

The current BPM analyzer can estimate tempo. It cannot establish the first downbeat reliably by itself. Automatic alignment must show uncertainty and make phase adjustment easy.

## Frame evaluation and preview parity

A pure evaluator is the central behavior owner:

```ts
evaluateCompositionFrame(project, projectTimeSeconds) => RenderPlan
```

The render plan contains active visual layers, decoded source times, transforms, opacity, transition weights, animation position, card highlight, and active audio envelopes.

Both preview and export consume this evaluator. UI components may cache or schedule work, but they may not invent their own timing formulas.

For the reference composition:

1. Project time resolves the active upper and lower clips.
2. Performance-video local time resolves through the sequence time map.
3. The same fractional sequence position drives animation and card state.
4. During the midpoint transition, outgoing video weight falls from 1 to 0 while animation weight rises from 0 to 1.
5. The card remains fully visible below throughout.

Transition curves are pure numeric functions. They are not Svelte DOM transitions.

## Media pipeline

Extend the existing Mediabunny export path. Do not introduce FFmpeg, Remotion, or a second encoding stack for this capability.

Mediabunny already supports the required building blocks:

- Timestamped video decoding through `VideoSampleSink`.
- Crop, scale, rotate, contain, and cover behavior through `CanvasSink`.
- Canvas frames as an encoded video source.
- Decoded and encoded audio sources.
- Audio sample output suitable for an MP4 track.

The target pipeline is:

```text
video decode ─┐
animation ────┼─> shared RenderPlan ─> compositing canvas ─> video encoder ─┐
card render ──┘                                                            ├─> MP4
audio sources ─> trim, gain, fades, mix ─> audio encoder ──────────────────┘
```

The existing deterministic animation export, midpoint frame sampling, and frame-parity fixture remain in place. Its duplicated private time-to-beat calculation should be removed only after the shared evaluator has equivalent tests.

## Audio and music

Audio has two distinct lanes.

### Rendered audio

TKA can render and preview:

- Original audio from the performance video.
- User-uploaded audio for which the user has the necessary rights.
- Meta Sound Collection media only when current Meta terms and API delivery explicitly permit the intended use and local rendering.

The first mixer supports source trim, gain, mute, fade-in, fade-out, and two-source mixing. Its waveform and beat markers are derived views of the same timeline.

Automatic music setup means:

- Estimate tempo and confidence.
- Suggest sequence or transition alignment against the chosen track.
- Let the user set or correct the first beat.
- Recalculate cuts and transition positions visibly.
- Preserve the binding rule in a preset when the audio role is reusable.

It does not mean choosing copyrighted music without the user or hiding uncertainty in analysis.

### Instagram-attached audio

Instagram audio attached at publish time is target metadata, not a baked composition track.

Meta's June 1, 2026 platform changelog announces an Instagram Audio API for apps using Facebook Login. It describes search and retrieval of original sounds and royalty-free Meta Sound Collection music for Reels. The current TKA connection uses Instagram Login, so this is not a small UI addition. It may require a Facebook Login connection path, revised permissions, review, and account migration.

The Audio API gets its own proof gate before product design relies on it. That spike must verify against current official Meta documentation:

- Required login type and permissions.
- Eligible Instagram account types.
- Search, preview, attribution, and attachment fields.
- Catalog differences from Instagram's native music picker.
- Volume and original-audio mixing controls.
- Preview URL lifetime and whether local preview can match published output.
- App Review and business verification requirements.

Until that proof is complete, the product offers three honest choices:

1. Keep original sound.
2. Add a rights-cleared track in TKA.
3. Finish music in Instagram.

The third option remains valuable even if the Audio API is adopted because Instagram's native catalog and editing tools are broader than an external publishing API.

## Post Studio interaction

### Entry

Opening Share displays the current artifact immediately, then offers an Edit post control. Compose has a Share control that serializes the whole current composition into the shared project model.

### Preset-first surface

The first view shows four visual presets in a compact two-by-two picker. The reference performance-breakdown preset is one of them. Selecting a preset updates the central 9:16 preview immediately.

The normal editing path contains:

- The exact output preview with Instagram safe-zone overlays.
- Source tiles for video, animation, card, and audio.
- Crop and fit controls for the selected region.
- A duration strip with clip edges and transition handles.
- A beat-alignment strip when a video or audio time map exists.
- Original sound, cleared track, or finish-in-Instagram audio choices.
- Cover-frame selection.
- Save as preset.

An advanced disclosure can show the underlying region and clip structure. It is still editing the same project.

### Presets

A preset stores structure and binding rules, not the current post's concrete media.

Example binding rules for the reference preset:

- `performance-video` binds to the selected uploaded video.
- `linked-sequence` binds from that video's `sequenceId` when present.
- `animation` and `card` bind to the linked sequence revision.
- Project duration follows the performance video.
- The upper transition begins at 50 percent of project duration.
- The lower card remains active for the full duration.
- Original sound is enabled when the performance video contains audio.

If a required role cannot resolve, the preset remains visible but identifies the missing source and disables export until it is supplied.

## Instagram capability boundaries

Post Studio must not show one undifferentiated Connect Instagram promise.

### Connection status

The original `Meta couldn't complete that` failure was traced to a deployed Instagram secret version that did not match the configured app ID. Meta described the failed exchange as a redirect-URI problem even though the callback URI was unchanged. The matching secret and callbacks are now deployed, and the connection for `@tkaflowarts` survives reload with Graph-validated long-lived credentials.

The client and callback classify app-configuration, denied-consent, expired-code, and professional-account failures separately. Secrets and access tokens remain excluded from browser logs, UI messages, screenshots, and Firestore mirrors.

The acceptance result is not merely a successful redirect. A valid professional-account connection survives reload, reports its actual publishing capabilities, refreshes where Meta permits it, and produces an actionable recovery message when the account or app is ineligible.

### Everyone

- Can render or download a post.
- Can use the mobile handoff when supported.
- Can finish native music, stickers, filters, text, and effects in Instagram.

### Eligible direct-publishing accounts

- See direct publishing after the app and account pass a capability check.
- See only fields verified for the current API and media type.
- Keep a persisted connection until token refresh or Meta policy requires user action.
- Receive actionable connection errors with the Meta response code and recovery step.

Personal accounts must not be left at a dead direct-connect button once eligibility is known. They keep the handoff path.

OAuth must not retry indefinitely in the background. Authorization codes are short-lived and single-use, and login can require human consent. The app may safely retry idempotent status checks and token refresh where Meta permits it, but a failed authorization returns to an explicit reconnect action.

### API-attached audio accounts

This capability appears only after the Audio API proof gate confirms the required Facebook Login connection and the account passes runtime eligibility checks.

## Persistence and migration

Use strict Zod schemas with an explicit `schemaVersion` and migration functions.

Migration inputs include:

- Compose cell layouts.
- Timeline projects.
- Collaborative-video `StepMap` records.
- Landing-preview crop and snip data.

Migration must be non-destructive. Existing records remain readable while new projects are created in the versioned format.

The shared state follows the project factory plus Svelte context pattern. Each open editor receives its own state instance. Module-level composition, playback, or selection singletons are not allowed.

Durable projects and presets use the existing Dexie and Firestore composition synchronization path after its schema is extended. Blob URLs and Timeline localStorage are not durable media identities.

## Proposed code ownership

The contract gate should establish a shared capability under a neutral path such as:

```text
src/lib/shared/media-composition/
  domain/
    media-source-schema.ts
    media-layout-schema.ts
    media-composition-schema.ts
    media-composition-preset-schema.ts
    sequence-time-map.ts
  state/
    media-composition-state.svelte.ts
    media-composition-context.ts
  services/
    frame-evaluator.ts
    source-resolver.ts
    audio-mix-evaluator.ts
    project-migrations.ts
```

Expected consumers and extensions:

- Share sheet and Post Studio components consume the shared state.
- Compose converts current cells into the shared project and later edits it directly.
- Collaborative video adapts `StepMap` to `SequenceTimeMap`.
- Timeline interaction modules are refactored to accept injected project state instead of the current singleton.
- The animation export path consumes the shared evaluator and gains decoded video and audio sources.
- Meta publishing receives verified target options and, in a later gate, eligible audio attachment metadata.
- CSP receives the required `media-src` policy before uploaded-video playback is re-enabled.

## Implementation gates

Every gate ends with a visible or executable artifact and Austen's review. Approval of this document authorizes only the next agreed gate, not the full sequence automatically.

### Parallel prerequisite: Meta connection proof

- Reproduce the current connection failure with callback and function diagnostics.
- Verify app mode, redirect URI identity, requested permissions, account eligibility, and deployed function configuration.
- Prove token persistence and capability lookup across a reload.
- Replace the generic failure with a classified recovery message.

**Proof:** One successful persistent connection on an eligible test account, plus recorded ineligible-account and denied-consent paths with no secrets in logs.

#### Meta connection implementation record

On 2026-08-13 the three newest Instagram publishing handshakes completed for
`@tkaflowarts`. The token-free Firestore mirrors persisted the connection, the
two stored long-lived credentials both passed a fresh `/{version}/me` identity
request, and `refreshMetaPublishTokens` was confirmed active. The earlier token
exchange failures stopped after the deployed Instagram secret advanced to the
version matching the configured app ID; Meta had described that mismatch as a
redirect-URI failure even though the live callback URI remained unchanged.

The callback and client now classify app-configuration and professional-account
failures separately so neither path falls back to an unactionable retry loop.
`metaConnectCallback`, `instagramAuthCallback`, and the token-refresh function
are active. The scoped callback deployment and a fresh post-deploy identity
check both completed successfully.

### Gate 1: Contract and time map

- Define strict project, preset, source, region, clip, transition, and time-map schemas.
- Implement pure time-map interpolation, inverse mapping, validation, and old `StepMap` migration.
- Reconcile animation position conventions in tests.
- Extract one tempo behavior owner for clamping, presets, and tap tempo.

**Proof:** Unit tests plus a diagnostic table showing media seconds, fractional sequence position, displayed card beat, and animation time for the reference map.

#### Gate 1 implementation record

The contract now includes strict versioned schemas for media sources, layout regions, clips, transitions, projects, role-based presets, and sequence time maps. Legacy `StepMap` records migrate through an explicit start-pose convention and refuse incomplete timestamp sets. Video and rights-cleared audio can both own time maps.

Tempo behavior now has one owner at `src/lib/shared/animation-engine/domain/tempo-behavior.ts`. The existing BPM controls retain their presentations while sharing presets, bounds, tap history, clamping, and tap-tempo calculation.

The reference diagnostic uses variable animation durations of 1, 2, 1, and 0.5 units, plus a 0.75-unit start pose:

| Media seconds | Sequence position | Displayed card beat | Animation time |
| ------------: | ----------------: | ------------------: | -------------: |
|             0 |                 0 |                   0 |              0 |
|           0.5 |               0.5 |                   0 |          0.375 |
|             1 |                 1 |                   1 |           0.75 |
|          1.25 |               1.5 |                   1 |           1.25 |
|          1.75 |               2.5 |                   2 |           2.75 |
|          2.25 |               3.5 |                   3 |           4.25 |
|           3.5 |                 5 |                   4 |           5.25 |

Verification on 2026-08-13: 28 focused tests passed across four files. Scoped TypeScript validation passed for the final contract and timing modules. The three edited tempo presenters passed scoped Svelte diagnostics. The repository-wide fast check failed on unrelated active work in other modules; none of its reported diagnostics referenced the Gate 1 files.

### Gate 2: Static Post Studio composition

- Build the preset-first 9:16 surface with real source bindings.
- Render video, card, and animation regions without temporal transitions.
- Add crop, contain, cover, and safe-zone overlays.

**Proof:** Browser screenshots at the required desktop, tablet, and phone viewports, plus pixel-coordinate fixtures for crop math.

#### Gate 2 implementation record

Post Studio now binds four role-based layouts to the published sequence's real
card, animation render, and linked performance video when present. Its 9:16
preview, source readiness, Instagram guides, and Crop/Fit/Stretch controls share
one state factory and one pixel-fit owner. Browser proof covers 1440, 1920,
2560, 3840, tablet, 960-by-412 landscape, and 375-pixel phone layouts. The
focused composition suite includes 33 passing tests, the scoped Svelte check has
no diagnostics, the browser console is clean, and Lighthouse accessibility is 100.

### Gate 3: Temporal clips and crossfade

- Add the duration strip, clip trim, source in/out, and midpoint crossfade.
- Drive card and animation from the video's fractional sequence time map.
- Keep all visible layers on the shared frame evaluator.

**Proof:** A frame strip before, during, and after the transition, plus interactive playback of the reference composition.

#### Gate 3 implementation record

The reference performance layout now plays performance in the upper region,
crossfades to the sequence animation through the 44-to-56-percent overlap, and
keeps the choreo card visible in the lower region for the complete duration.
The editor exposes the shared clock through play, pause, scrubbing, clip lanes,
editable start/end trim handles, and the visible transition overlap. The same
sequence time map drives the live animation position and choreo-card highlight.
Preview layers and export both read the pure frame evaluator used by the timing
tests. A real linked performance video proved the start, midpoint crossfade, and
end states in both preview and decoded MP4 frames.

### Gate 4: Audio and beat alignment

- Decode original video audio.
- Add rights-cleared audio sources, gain, trim, fades, and waveform.
- Connect the existing BPM analyzer to the shared candidate model.
- Add first-beat correction and confidence feedback.

**Proof:** An exported reference MP4 with audible synchronized audio, alignment tests, and a visible uncertainty state for a low-confidence fixture.

#### Gate 4 implementation record

Post Studio can keep the original performance-video sound or export silently so
the person can use Instagram's native music picker. Original audio is decoded
through the existing Mediabunny input path, transcoded to 48 kHz stereo AAC, and
muxed into the same H.264 MP4 as the composed frames. The browser decoded the
proof export as 5.717 seconds, two channels, and 48,000 Hz.

When no saved manual time map exists, the editor labels and uses an even tempo
grid instead of implying that automatic beat detection succeeded. Rights-cleared
uploads, waveform editing, gain/fades, BPM confidence, and first-beat correction
remain the unfinished part of this gate.

### Gate 5: Export parity and presets

- Encode mixed visual and audio output through the existing Mediabunny pipeline.
- Save and reapply role-based presets.
- Migrate Compose sharing from first-sequence-only to whole composition.

**Proof:** Decoded export frames match preview at selected timestamps within the defined pixel tolerance; audio drift stays within one output video frame; a saved preset is rebound to a second sequence without rebuilding it.

#### Gate 5 implementation record

The shared frame compositor now renders video or image sources, live sequence
animation canvases, choreo-card highlight states, normalized fit/transforms,
stacking, and crossfades into the existing background encoder. The production
share-sheet proof returned a 1080 by 1920, 7.967-second MP4 and automatically
selected it as the active Video artifact. Encoder backpressure bounds the queue
to six full-resolution frames so long renders remain cancellable and responsive.

Role-bound layouts save locally first in Dexie and sync to the owner's private
Firestore collection. The owner-only rule passed the full 92-test Firestore
suite and is deployed. A live authenticated write/read returned the saved name,
two regions, two clips, and a server timestamp; the same layout reappeared after
reload. Compose already exposes the canonical Share button and Post Share Sheet
for its current playable sequence. Serializing an arbitrary multi-cell Compose
project into this shared model remains unfinished.

#### Post Studio correction record, 2026-08-14

Sequence-only presets now derive their duration from the sequence engine's
variable beat durations and a visible BPM control. The default is 60 BPM because
one engine duration unit equals one second at that rate. The 17-unit acceptance
sequence therefore previews at 17.0 seconds instead of being compressed into an
unrelated eight-second fixture. Setting 90 BPM recalculates the same composition
to 11.3 seconds without changing its clip structure.

The normal surface keeps playback and tempo visible while the clip ruler,
handles, and scrubber sit behind Advanced timing. Crop, Fit, and Stretch appear
only for external media. Placement values now use one shared numeric control
that supports pointer scrubbing, keyboard adjustment, and exact entry. The word
in the top bar uses the canonical TKA glyph renderer. The live choreo-card layer
receives the same resolved QR, mandala, layout, and visibility options as the
share export. Sound controls appear only after the selected performance source
is proven to contain a decodable audio track.

Browser proof covered 3840 by 2160, 2560 by 1440, 1920 by 1080, 1440 by 900,
tablet portrait, 960 by 412 landscape, and 375 by 667 phone layouts. The desktop
surface has no document overflow or unintended scrolling. Phone Canvas, Edit,
and Timing views fit their controls without horizontal clipping; the dedicated
Timing view exposes the full advanced timeline.

#### Catalog video alignment audit, 2026-08-14

The persisted sequence-to-video workflow already owns the first version of this
capability. `CollaborativeVideo` records carry both `sequenceId` and an optional
`StepMap`. `VideoPanel` loads those records with `getVideosForSequence`, opens
the existing `StepMapEditor`, and persists marker changes through
`updateStepMap`. The editor already supports tap placement, seeking, draggable
markers, and an even-spacing reset.

The sequence-viewer entry point was behind a kill switch for two documented
reasons: R2 playback was missing from `media-src`, and opening the video panel
replaced the viewer canvas. Both blockers are now resolved. The required R2
origins are covered by the CSP and its focused regression test, while the
current viewer shell places the video editor beside the canvas. The existing
upload and beat-mapping action can therefore be restored without creating a
second video catalog or editor.

Post Studio already queries the same database videos, but its selection adapter
currently reduces a `CollaborativeVideo` to URL, duration, and label. That drops
the record ID and saved `beatMap`. Post Studio consequently creates an even
tempo grid even when a manually mapped performance exists. This is the missing
handoff. The synchronization path after that handoff is already present:

```text
CollaborativeVideo.beatMap
  -> migrateLegacyStepMap
  -> SequenceTimeMap
  -> frame evaluator
  -> animation position + choreo-card highlight
  -> preview and exported MP4
```

The next implementation slice must preserve the selected collaborative-video
identity, migrate its complete legacy map through the existing adapter, and
bind the resulting `SequenceTimeMap` to the composition. It must visibly label
the alignment as Saved manual map, Assisted candidate, Even timing, or Unmapped.
Changing videos must replace the entire binding so a map from one performance
cannot leak into another.

The marker workspace will evolve the existing `StepMapEditor` and
`StepMapTimeline`; it will not introduce another timeline or timestamp schema.
The normal view pairs the performance video with the synchronized card and a
pictograph strip. Mark next, tap-to-place, drag, seek, keyboard nudge, undo, and
save are the primary controls. A WaveSurfer waveform can be added as a derived
lane using the installed library and established cleanup pattern. The existing
BPM analyzer may propose a tempo grid with confidence, but a visible first-beat
offset remains mandatory because tempo detection does not establish phase.
Motion holds may become a second suggestion source later. Manual anchors remain
the saved truth.

This bridge is complete only when one real database video with intentionally
uneven timing can be selected in Post Studio, scrubbed across every saved
marker, and shown to drive the same pictograph highlight and animation position
in the live preview and decoded export. Focused tests must also prove legacy-map
migration, missing and incomplete map behavior, video-identity replacement, and
the absence of cross-video timing leakage.

### Gate 6: Instagram delivery

- Consume the proven Meta connection and publishing capability on a real eligible account.
- Show capability-aware direct publish versus handoff.
- Run the Instagram Audio API spike against current official documentation and app settings.
- Add API audio only if preview and publishing behavior can be stated accurately.

**Proof:** Real phone handoff, real direct Reel on a test account, token reconnection behavior, actionable failure states, and an Audio API proof report.

## Verification contract

### Silent logic tests

- Time-map monotonic validation, interpolation, inverse mapping, and clamping.
- Old `StepMap` migration and start-pose convention.
- Constant and variable-duration sequence mapping.
- Transition endpoints, midpoint, and curve behavior.
- Crop, contain, cover, and normalized-to-pixel transforms.
- Clip trim, playback-rate, and source-time calculations.
- Audio gain and fade envelopes.
- Project and preset serialization, migrations, and role rebinding.
- Meta capability-state transitions and reconnect behavior.

### Visual and media proof

- Required viewport screenshots for every visual gate.
- Reference-composition frame strip at start, transition entry, midpoint, transition exit, and end.
- Preview versus decoded-export frame comparison.
- Long playback and export drift measurement.
- Mobile playback with real uploaded video after CSP correction.
- Real Instagram handoff and direct-publish verification where eligible.

## Risks and controls

| Risk                                                 | Control                                                                                                                             |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Preview and export disagree                          | One pure frame evaluator and timestamp fixtures feed both.                                                                          |
| Beat indexing shifts by one                          | Explicit start-pose convention and migration tests.                                                                                 |
| BPM looks correct but phase is wrong                 | BPM creates candidates only; first-beat correction remains visible.                                                                 |
| Uploaded video works locally but fails in production | Add and verify `media-src` CSP before restoring the feature flag.                                                                   |
| Presets retain stale content                         | Store role bindings separately from concrete source references.                                                                     |
| Existing timeline state leaks across editors         | Replace module singletons with state factories and context.                                                                         |
| Music creates rights exposure                        | Render only original or rights-cleared audio; keep native catalog selection in Instagram unless Meta explicitly authorizes API use. |
| Meta audio support changes                           | Runtime capability checks and an official-documentation proof gate.                                                                 |
| Direct connect excludes some users                   | Keep download and handoff available to everyone; reveal direct features by verified capability.                                     |
| A polished editor hides a weak exporter              | Each editing gate includes encoded-output proof, not preview-only approval.                                                         |

## Rejected approaches

- Building a tiny full Compose inside Share.
- Copying the current Timeline project and singleton state as the new owner.
- Using a Svelte transition as media crossfade logic.
- Adding another encoder before extending the installed Mediabunny stack.
- Treating estimated BPM as a complete beat map.
- Baking Instagram licensed music into exported files without explicit rights and API support.
- Showing every Instagram-looking option when the API cannot deliver it.
- Retrying OAuth authorization in a loop.

## Current recommendations

1. Approve `MediaCompositionProject` as the shared data owner for Compose and Post Studio.
2. Start implementation with the time-map and schema contract, not the editor UI.
3. Use the performance-breakdown arrangement as the permanent acceptance fixture.
4. Make original audio and user-cleared music the first TKA-rendered music path.
5. Keep Finish in Instagram as a first-class path for native music and decorations.
6. Investigate the 2026 Instagram Audio API only after the current Meta connection path is proven, because it appears to require Facebook Login while TKA currently uses Instagram Login.

## Research references

Repository evidence is listed in the capability ledger. External sources checked for this design:

- [Mediabunny media sinks](https://mediabunny.dev/guide/media-sinks)
- [Mediabunny media sources](https://mediabunny.dev/guide/media-sources)
- [Instagram Help: Access to the licensed music library](https://www.facebook.com/help/instagram/402084904469945)
- [Instagram Help: What audio can be used in a Reel](https://www.facebook.com/help/329208821595430)
- [Meta Music Guidelines](https://www.facebook.com/legal/music_guidelines)
- [Instagram Platform changelog](https://developers.facebook.com/docs/instagram-platform/changelog)
- [Instagram Platform changelog mirror used during Meta rate limiting](https://releasebot.io/updates/meta/instagram-platform)

The official Meta changelog was rate-limited during this diligence pass. The June 1, 2026 Audio API entry was cross-checked through a current changelog mirror, but exact endpoint and permission behavior remains intentionally gated on direct official-document verification during Gate 6.
