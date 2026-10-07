---
status: backlog
value: null
effort: null
work_state: unverified
remaining: Reconcile prototype screen-take sources with Post Studio ownership and verify the output contract before implementation.
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
---

# Post Studio Screen Take Source

**Status:** Backlog, direction approved
**Decision date:** 2026-09-04
**Prototype branch:** `codex/portrait-director` at `9fbaa6396d`

## Outcome

Post Studio gains a Screen Take acquisition flow for producing portrait video from a live, same-origin TKA page. A movable 9:16 camera directs the part of the desktop page that becomes the take. The resulting H.264 MP4 enters Post Studio as ordinary external video, where the existing composition tools remain responsible for layout, timing, other sources, and final output.

The capture tool runs in desktop Chrome. The artifact is intended for iPhone playback and social posting; running the capture workflow on an iPhone is not part of this design.

## Capability Ownership

Search terms reviewed: `portrait`, `screen capture`, `page capture`, `record scene`, `MediaRecorder`, `getDisplayMedia`, `RestrictionTarget`, `video export`, `Post Studio`, `Film Director`, and `promo generator`.

- `shared/media-composition/` and Post Studio own the 1080x1920 composition, external-media presentation, timeline, and final export.
- `shared/animation-engine/services/background-video-encoder.ts` owns H.264 encoding, MP4 muxing, backpressure, and worker lifecycle.
- `shared/video-export/services/canvas-frame-capturer.ts` owns canvas-frame handoff to the encoder.
- `shared/video-record/services/video-recorder.ts` remains the camera-performance recorder. Screen capture has a different permission, source, framing, and lifecycle contract.
- `/test/film-director` remains the 3D scene-direction and film-language owner. It does not become a DOM page recorder.
- A feature-local Screen Take adapter under `features/promo-generator/` owns current-tab permission, Element Capture restriction, portrait-camera math, crop composition, and take cleanup. It should stay feature-local until a second non-Post-Studio consumer exists.

Relationship:

- **Reuse** the background encoder and canvas frame capturer.
- **Extend** Post Studio's external-media acquisition so a locally captured take can enter the existing video path.
- **Create** only the page-capture adapter and movable portrait camera, because no current owner captures an arbitrary interactive TKA route.
- **Retire** the standalone `PortraitDirectorModule` product shell and `/demo/portrait-director` route rather than establishing a second Director product.

## Product Path

```text
Post Studio
  -> Add Screen Take
  -> same-origin TKA page in the capture stage
  -> current-tab permission and Element Capture restriction
  -> movable 9:16 crop camera
  -> CanvasFrameCapturer
  -> BackgroundVideoEncoder
  -> H.264 MP4 take
  -> Post Studio external-media source
```

The capture permission prompt remains mandatory on every take. The flow may prefer the current tab, but it must never bypass the browser picker or silently fall back to recording the director controls.

## Prototype Material to Reconcile

Selectively carry forward from `codex/portrait-director`:

- normalized 9:16 crop and camera-following math;
- pointer dead zone, pointer-directed framing, and anchored wheel zoom;
- current-tab capture restriction and explicit support checks;
- bounded encoder queue, frame accounting, duration cap, and cleanup behavior;
- focused camera and state tests.

Do not carry forward wholesale:

- the standalone module, rail, workbench, or demo route;
- duplicate export-format controls already owned by Post Studio;
- a second video library, timeline, or Director identity;
- assumptions that desktop capture APIs work on iPhone Safari.

## Output Contract

- Default output: 1080x1920, 30 fps, H.264 in progressive MP4.
- Optional high-resolution take: 2160x3840 only after measured desktop encoder and memory proof.
- Final encoding must route through the shared codec selector so profile and level remain compatible with the target dimensions and platform.
- The take must be playable in an iPhone Safari `<video playsinline>` element before the feature is considered complete.
- Post Studio may re-compose or re-encode the take, but the acquisition flow must not introduce a parallel final-export pipeline.

## Risks

- Element Capture is a desktop-Chrome capability, so this source needs an honest unsupported state elsewhere.
- Current-tab selection is user-controlled; choosing the wrong surface must fail before countdown or recording.
- The source iframe must stay same-origin so the camera controller can observe page interaction safely.
- A live captured page can drop frames. The take must report submitted and skipped frames rather than claiming deterministic capture.
- 4K portrait frames are expensive. High-resolution capture stays gated on measured queue, memory, and encode behavior.

## Verification

1. Unit tests preserve exact 9:16 crop geometry, bounds, zoom direction, and refresh-rate-independent camera following.
2. Source-contract tests prove that Screen Take imports the shared frame capturer and background encoder and does not instantiate a parallel encoder or muxer.
3. A desktop Chrome runtime pass records a same-origin interactive route after selecting the current tab.
4. Frame inspection proves that the Post Studio chrome, capture instructions, dimmer, and camera outline are absent from the take.
5. The generated file reports the requested dimensions, frame rate, H.264 codec, and MP4 container.
6. The 1080x1920 take plays inline on a physical iPhone and survives the intended social-app handoff.
7. Cancellation, permission denial, wrong-surface selection, source termination, duration limit, and encoder failure each leave no live capture tracks or workers.

## Research Basis

- Chrome documents Element Capture as available in Chrome 132 and later on desktop only: <https://developer.chrome.com/docs/web-platform/element-capture>
- WebKit documents MP4 with H.264 as a supported Safari recording and playback path: <https://webkit.org/blog/11353/mediarecorder-api/>
