# Composer native viewer bridge v1

The Composer web rail sends JSON strings through Pixel Streaming 2 `UIInteraction`.
The native host returns JSON strings through `Response`. Each message has `v: 1`,
`session` (an opaque web connection ID), `revision` (a nonnegative authored-scene
revision), and `type`. Commands also have a unique `id` and optional `payload`.
Results have `type: "result"`, `replyTo` equal to the command ID, `ok`, `state`,
and, on failure, `error: { code, message }`. Every result includes the complete
current native state. The host can emit `type: "state"` when native input
changes selection, placement, camera, or playback. Only a `hello` command may
establish or replace the active session. Commands from other sessions or older
revisions return `stale_session` or `stale_revision` without changing the scene.

`hello` returns a `state` object with:

```json
{
  "capabilities": {
    "maxPerformers": 1,
    "characterIds": ["ch01"],
    "propIds": ["staff", "fan"],
    "cameraModes": ["snap", "orbit", "pan", "zoom", "preset", "focus"],
    "playbackActions": ["pause", "resume", "restart", "rate"]
  },
  "performers": [{
    "performerId": "performer-0", "characterId": "ch01", "propId": "staff",
    "position": { "x": 0, "z": 0 }, "facingAngle": 0
  }],
  "selectedPerformerId": "performer-0",
  "camera": {
    "position": { "x": 0, "y": 2.3, "z": 5.2 },
    "target": { "x": 0, "y": 1.1, "z": 0 },
    "fov": 50, "mode": "orbit", "gestureComplete": true
  },
  "playback": {
    "preparedClip": {
      "id": "ch01/staff/A", "title": "Staff practice loop",
      "provenance": "sealed family capture; not an exact Composer score"
    },
    "status": "playing", "rate": 1, "phase": 0
  }
}
```

The example above shows the legacy practice scene. The current host advertises
up to eight performers and the character and prop catalogs actually installed.
Composer sends `composerOwned: true` when binding its cast, so new actors wait for
their authored motion instead of playing a practice loop. Unsupported choices
return `unsupported_asset`, `cast_limit`, or `unsupported_action` and preserve the
previous actor. The native environment remains the studio.

When the performer is removed or its assets are unavailable, `performers` is
empty, `selectedPerformerId` is `null`, and `playback` is
`{ "preparedClip": null, "status": "unavailable", "rate": 1, "phase": 0 }`.
`camera.fov` is the Unreal camera's **horizontal** field of view in degrees.
The web placement adapter derives vertical field of view from the displayed
video aspect ratio: `2 * atan(tan(fov / 2) / aspect)`.

Commands:

| `type` | `payload` | Effect |
| --- | --- | --- |
| `hello` | `{}` | Begin/reconcile a session and report readiness and complete state. |
| `setPerformer` | `{performerId, characterId, propId, position:{x,z}, facingAngle, composerOwned?, effect?}` | Create or update a stable performer. Asset replacements are validated before replacing the previous actor. `effect` accepts `none`, `fire`, or `led` and survives runtime motion imports. |
| `removePerformer` | `{performerId}` | Remove the actor, preserving the empty stage. |
| `select` | `{performerId}` | Select an existing performer, or `null` to clear. |
| `camera` | `{position:{x,y,z}, target:{x,y,z}}` (or explicit `mode:"snap"`), `{mode:"orbit", deltaX, deltaY}`, `{mode:"pan", deltaX, deltaY}`, `{mode:"zoom", delta}`, `{mode:"preset", preset}`, or `{mode:"focus", performerId}` | Move the one native camera and return its authoritative pose. Presets: `front`, `back`, `left`, `right`, `top`, `threeQuarter`. Delta values are normalized viewport units. |
| `playback` | `{action:"pause"|"resume"|"restart"}` or `{action:"rate", rate}` | Control only the declared prepared clip. Rate range is 0.5–1.75. |
| `beginMotion` | `{performerId, transferId, totalChunks, totalBytes}` | Reserve one transfer slot, with a maximum of 64 MiB of UTF-8 JSON. |
| `motionChunk` | `{transferId, index, data}` | Add a numbered chunk of at most 24,000 UTF-16 code units. Do not split surrogate pairs. |
| `commitMotion` | `{transferId}` | Validate and install the complete shared runtime motion bundle. Failure preserves the previous motion. |
| `playback` | `{action:"sync", performers:[{performerId,seconds}], playing,rate}` | Atomically seek named performers and synchronize play state/rate. Composer converts its fractional steps to captured seconds. |

A new `hello` invalidates an incomplete transfer. Transfers are serialized by the
browser and drained once started, even if the desired score changes. A performer
waiting for its first import has `preparedClip: null` and `status: "unavailable"`.
Installed runtime clip metadata identifies the actual sequence. Playback rates
outside the native range, variable-duration steps, and independent performer
clocks use paused native sampling driven by Composer's clock.

Composer coordinates are meters, Y up, with the performer facing +Z at angle
zero. The host maps a point `(x,y,z)` to Unreal centimetres `(100*z,-100*x,100*y)`.
A positive Composer yaw becomes a negative Unreal yaw around +Z after this
mapping. Results reverse that conversion and report `facingAngle` in radians.
Every accepted numeric field must be finite. The host rejects malformed data,
unknown IDs, and out-of-range values instead of silently substituting assets.

Only Composer stores authored state and undo history. The native result is an
acknowledgment and observed scene state; applying it in the web layer must not
generate another command or another undo entry. Native viewport gestures may
emit `state` updates. Web controls retain pointer and keyboard ownership outside
the streamed viewport.
