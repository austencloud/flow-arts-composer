---
status: active
value: null
effort: null
work_state: blocked
remaining: Collect Austen's per-gate visual feedback on the remaining sequence viewer transitions, starting with the recorded review pass.
depends_on: 'external: Austen per-gate visual feedback'
plan_path: ''
tags: []
last_triaged: '2026-10-07'
---

# Remaining sequence viewer gates: review pass

Date: 2026-09-05. This records implementation and measurements, not Austen's
approval. Existing review decisions are unchanged.

## Changes

- Restored the shared animator inspector rail to vertical centering. Six
  reserved slots keep Effects, Props, Motion, and Display in the same positions
  when 2D and Tunnel have different additional sections.
- Replaced the Post Studio hard workspace swap with the existing
  `DualSourceCrossfade` and pane keep-alive. The viewer survives the visit; the
  studio draft survives departure. Hidden playback is paused.
- Replaced Practice's full-width sideways entrance with a 16px vertical entrance
  alongside its existing height allocation. Collapsed controls are inert.
- Added round-trip and interruption replays for Post Studio, the inspector,
  Practice, and the mode switchers. All nine gates now have replay controls.
  The switcher tour enumerates every directed pair of currently available modes.
- Added workspace measurements: stage identity, studio partial-opacity frames,
  Practice height, and duplicate selected-mode buttons.
- Fixed standalone-frame startup: configure its QR dependency before Card mounts,
  announce readiness only after real controls exist, and recover the parent/frame
  handshake after reloads. Selecting a gate also updates its URL.

## Measured evidence

The stable isolated tour at 1440 × 900 covered all 30 directed pairs among
Side by Side, 2D, 3D, Card, Tunnel, and Performances. It completed in 39,863ms
with 1,090 samples, one viewer-stage identity, and zero samples with duplicate
selected-mode buttons.

At that same size, the common inspector buttons retained exactly the same
vertical positions between 2D and Tunnel: 288.33, 352.33, 416.33, and 480.33px.
Measured displacement was **0px** for all four buttons.

Live primary-server checks before access availability changed:

| Replay                   | Frames | Stage identities | Additional evidence                              |
| ------------------------ | -----: | ---------------: | ------------------------------------------------ |
| 2D → Studio → 2D         |     65 |                1 | 8 partial-opacity frames; no duplicate selection |
| Studio rapid reversal    |     41 |                1 | 9 partial-opacity frames; no duplicate selection |
| Inspector open/close     |     87 |                1 | no duplicate selection                           |
| Inspector rapid reversal |     64 |                1 | no duplicate selection                           |
| Practice from 2D         |     84 |                1 | maximum Practice allocation 128px                |

Responsive inspection covered 375 × 667, 960 × 412, 820 × 1180,
1440 × 900, 1920 × 1080, 2560 × 1440, and 3840 × 2160. Replays included
Practice on compact layouts and inspector/Tunnel reversals on desktop layouts.
The compact layouts intentionally use compact controls rather than a desktop
inspector. WebP captures are retained locally in
`E:/tka-platform-viewer-gates-evidence`. Windows browser capture scaling creates
extra margins, and the 4K capture contains tiled artifacts; DOM viewport and
overflow measurements were used alongside inspection, not inferred from those
capture artifacts.

At 1440 × 900 with native reduced-motion emulation, the rapid switcher replay
completed with 55 samples, zero duplicate selected-mode samples, and no
horizontal overflow. It returned to 2D.

## Checks and limits

- The initial focused viewer run passed 261 tests with one stale ready-gate
  expectation; after updating that expectation, the gate/replay tests passed.
- The final invalidated checks passed: four files, 32 tests (gate availability,
  replay coverage, orchestration contracts, and keep-alive behavior).
- Svelte check after the startup/reload fixes: zero errors and zero warnings.
- Cold 3D dependency optimization reloaded the preview and invalidated early
  tours. Those partial runs are not included in the 30-pair result. Teardown
  during those reloads also produced a Three.js warmup error; this pass does not
  claim to fix that independent warmup issue.
- Post Studio was unavailable under the isolated origin's normal access gate.
  Its live 2D round-trip and reversal are verified; ready-3D and compact Studio
  entry remain review coverage gaps. No authentication or access gate was
  bypassed. Replay availability is not a claim that every environment supports
  every mode, nor that every gate has met its full approval contract.
- No export, upload, purchase, or gate-approval action was performed.

The next step is Austen's per-gate visual feedback, starting with the remaining
unapproved gates. Their existing notes and decisions remain the authority.
