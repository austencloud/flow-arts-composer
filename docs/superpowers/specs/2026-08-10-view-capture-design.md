# View Capture — copy a view, replay a view

**Date:** 2026-08-10
**Status:** approved (Austen, 2026-08-10)
**Scope:** shared module + dev endpoint + one root-layout listener, so U works on every route

> **Revised 2026-08-10, same day.** First built into the First Fire graybox
> route alone. Austen pressed P on `/browse/gallery` and nothing happened:
> *"it did not copy the state ... I would have expected to press P and then
> press control V and copy the coordinates directly."* "When I see something in
> the app" means any route. The handler moved to the root layout and the module
> moved out of `3d/`, because most of the app is not a room.

## The problem

Austen walks a 3D room, sees a wall that is wrong, and has no way to hand that
wall to an agent. Describing a viewpoint in words is lossy: "the spiky bit near
the second court" does not locate a camera. The agent then guesses at a
position, screenshots something adjacent, and reports on a frame that is not the
one the complaint was about.

His ask (2026-08-10): *"when I see something in the app I can like copy a json
instantly that shows not only the thing that I'm looking at as an image but also
the exact coordinates and how you can take a look at that exact coordinates ...
so that you can autonomously put yourself there take a screenshot and see if the
image was fixed after you apply the adjustment."*

> **Revised 2026-09-27.** The trigger moved from `P` to `U`. Bare `P` is also
> the prop-picker drawer's own shortcut (`register-global-shortcuts.ts`), so
> every press of P silently overwrote the clipboard with a debug capture on
> the live site as well as in dev, on top of whatever else P was supposed to
> do. `U` collides with nothing registered anywhere in the app. The listener
> is now dev-only too: `$app/environment`'s `dev` keeps it out of production
> entirely, since a debug tool has no business running for a real visitor.
> The account of the original design below still says `P` in places, because
> that was the key at the time; read it as history, not as the current
> binding.

Two halves, and both are required. The image proves what he saw. The pose lets
the agent stand in the same spot after a change and compare like for like.

## What already exists (reuse, not create)

- `UnifiedCameraController` already emits `onRotationChange(yaw, pitch)` and
  accepts `externalYaw` / `externalPitch`. Reading and replaying a pose needs no
  change to `@austencloud/camera-3d`.
- `FirstFireGrayboxWalkScene.svelte` already has a `?camera=<id>` teleport that
  stands the player at a locked camera and bumps `cameraRevision` to remount the
  controller. `?view=` composes with that seam instead of inventing a second one.
- `src/routes/api/dev/save-pictograph/+server.ts` is the established dev-only
  write endpoint: `dev` guard returning 403, base64 body, `fs.writeFileSync`
  under `static/`. The capture endpoint is its sibling, not a new pattern.
- The diagnostic-clipboard workflow (`feedback_diagnostic_clipboard_workflow`)
  already prescribes serialize-to-JSON-then-`navigator.clipboard.writeText`
  with a `console.log` fallback. This is that workflow applied to a camera.

## Design

### `src/lib/shared/review/view-capture.ts`

The shared module. Scene-agnostic — it knows about a pose, a canvas, and a
clipboard, and nothing about First Fire.

```ts
interface ViewPose { x: number; y: number; z: number; yaw: number; pitch: number }

encodeViewParam(pose: ViewPose): string          // base64url JSON
parseViewParam(search: string): ViewPose | null  // null on absent/corrupt
captureView(options): Promise<ViewCapture>       // POST, assemble, copy
```

`parseViewParam` returns `null` rather than throwing on corrupt input: a
mistyped URL should drop you at the spawn point, not white-screen the route.

`captureView` writes the assembled JSON to the clipboard and returns it. The
returned object is what a caller shows in a toast; the clipboard is what Austen
pastes.

### `src/routes/api/dev/view-capture/+server.ts`

`dev`-guarded POST, 403 in production. Writes
`static/captures/<sceneId>/<ISO timestamp>.png` and returns both:

- `path` — the served URL, so the frame can be opened in the browser pane
- `absolutePath` — the disk path, so the agent can `Read` the image directly

`static/captures/` is gitignored. These are throwaway review frames, not
assets, and they must never enter a build.

### Global handler, per-scene registration

`ViewCaptureListener.svelte` mounts once in `src/routes/+layout.svelte` and owns
the U key everywhere. A 3D scene calls `registerViewSource({sceneId, pose,
canvas, state})` in `onMount` and returns the disposer; the listener uses it
when one is registered.

With no registered source - the gallery, the library, any 2D page - U captures
the page instead: URL, route, viewport, scroll, and the element under the
cursor with its DOM path, text and identifying `data-*`. No image there. A DOM
page has no single canvas to read, and the honest alternatives (a screen-share
picker on every press, or shipping a rasteriser) cost more than they return
when Austen can already take a screenshot himself. The identifiers are the part
he cannot paste by hand.

### Scene wiring (First Fire)

- `+page.svelte` passes `createRenderer` to Threlte's `<Canvas>` with
  `preserveDrawingBuffer: true`. Without it `toDataURL` returns a blank frame,
  because the default WebGL context is free to discard the buffer after
  compositing.
- `FirstFireGrayboxWalkScene.svelte` tracks live pitch from
  `onRotationChange`, applies `?view=` on mount exactly where `?camera=`
  applies, and registers its pose source with the global listener.
- Trigger: **`U`** plus a "Copy view" button in the review HUD. `C` is crouch,
  `V` is the mode toggle and `G` is grab in the camera controller, so those are
  unavailable, and `P` collided with the prop-picker drawer's own shortcut. The
  button exists because a keystroke alone is not discoverable
  (`clickables-look-like-buttons.md`).

### The replay URL is the current URL plus `view=`

Built from `window.location`, not from a hardcoded route. `?shell=bare`,
`?proof=2`, and any future mode survive into the replay, so the agent lands in
the room state Austen was in rather than a default one.

### Payload

```json
{
  "scene": "first-fire-graybox",
  "frame": "E:/tka-platform/static/captures/first-fire-graybox/2026-08-10T18-42-11-204Z.png",
  "frameUrl": "/captures/first-fire-graybox/2026-08-10T18-42-11-204Z.png",
  "replay": "https://localhost:5173/test/first-fire-graybox?shell=bare&view=eyJ4Ijot",
  "camera": { "x": -14.2, "y": 1.72, "z": -9.4, "yaw": 2.361, "pitch": -0.18 },
  "viewport": { "width": 1920, "height": 1080 },
  "state": { "phase": "orbit", "shrine": "dj" }
}
```

`state` is an opaque record the calling scene supplies. First Fire passes its
review phase and displayed shrine; another scene passes whatever identifies its
moment. The module does not interpret it.

## Failure behaviour

Each failure degrades to the most useful remaining payload rather than
cancelling the capture. The pose is the part the agent cannot reconstruct, so
the pose always survives.

| Failure | Result |
|---|---|
| No canvas, or `toDataURL` throws | JSON without `frame`, plus `frameError` |
| Endpoint 403 (production) or 500 | JSON without `frame`, plus `frameError` |
| `navigator.clipboard` blocked or absent | `console.log("[view-capture]", json)` |

## Verification

1. Unit test: `encodeViewParam` → `parseViewParam` round-trips a pose exactly,
   and `parseViewParam` returns `null` for absent, empty, and corrupt input.
2. Live: Austen copies a view of a wall. The agent opens the `replay` URL in the
   Browser pane and reads back the camera pose from the running scene. The
   measured yaw/pitch/position must match the copied JSON to three decimals
   before the loop is claimed to work.

Both are required. The round-trip test cannot prove the controller actually
adopted the pose, and the live check cannot prove the encoding is stable.

## Deliberately out of scope

No capture gallery, no saved-view list, no annotation, no diffing of two frames.
The request is copy-and-paste and that is the entire loop. Other walk scenes
adopt the pose half with one `registerViewSource` call each; until they do, U
still captures their page.
