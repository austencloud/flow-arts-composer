---
status: active
value: null
effort: null
work_state: blocked
remaining: Obtain Austen's visual decisions on gates 5-9, starting with the measured Post Studio gate 6 contract.
depends_on: 'external: Austen visual approval of viewer transition gates 5-9'
plan_path: ''
tags: []
last_triaged: '2026-10-07'
---

# Sequence Viewer Transition Orchestration

**Status:** Active, advancing one visual approval gate at a time

## Objective

Every main Sequence Viewer transition should read as one physical action. The
old surface remains understandable while the workspace travels to its new
shape, the incoming surface appears when it is ready, and a second selection
mid-transition continues from the visible frame instead of jumping to an old
endpoint.

This work does not add a second animation system. It routes each geometry and
content change through the shared motion owners already used elsewhere in the
app.

## Canonical ownership

| Change                                              | Owner                                                                                |
| --------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Split allocation, rail presence, inspector presence | `PanelGroup`                                                                         |
| Cheap content or label swap                         | `Crossfade`                                                                          |
| Heavy viewer surface swap                           | Existing mounted-layer pattern in `ViewerMotionSurface` and `ViewerCompanionSurface` |
| Canvas backing size across hidden/revealed panes    | `CanvasResizer`, keyed from the shared `inert` accessibility boundary                |
| Multi-element Practice recomposition                | `createLayoutMotion()` where panel allocation alone cannot carry the change          |
| Timing and reduced motion                           | `DURATION`, `motionDuration()`, and global `--transition-*` tokens                   |

`SequenceViewerShell` remains the overall chrome owner. `ViewerSplitPane`
remains the owner of the two-pane stage. The review route composes production
components and never becomes another viewer implementation.

## Transition gates

Work proceeds in this order. A gate is not complete until Austen approves the
live production transition in the review surface and that approval date is
recorded.

| Gate | Transition                                               | Baseline                 | Target |
| ---- | -------------------------------------------------------- | ------------------------ | ------ |
| 1    | Side by Side ⇄ 2D / Card, including inspector allocation | D                        | A+     |
| 2    | 2D ⇄ 3D, including first open                            | B+ repeat / C first open | A+     |
| 3    | 2D / 3D ⇄ Tunnel                                         | B                        | A+     |
| 4    | Card ⇄ left-side modes                                   | D                        | A+     |
| 5    | Viewer stage ⇄ Performances                              | D                        | A+     |
| 6    | Viewer stage ⇄ Post Studio                               | D                        | A+     |
| 7    | Card ⇄ Motion inspector content and collapse behavior    | C-                       | A+     |
| 8    | Practice enter, setup ⇄ running, and exit                | C+                       | A+     |
| 9    | Desktop rail and mobile bottom-bar active-state motion   | C                        | A+     |

Later gates may share infrastructure established by an earlier gate, but they
do not broaden the current gate's behavior without their own review.

## Durable visual review surface

`/test/sequence-viewer-transitions` is the acceptance surface. It uses the real
`SequenceViewerOrchestrator` and `SequenceViewerShell` against a deterministic
local sequence. The outer review page supplies:

- the gate list and current approval state;
- exact viewport frames for the required responsive families;
- manual replay through the production controls;
- automatic A ⇄ B replay through those same controls;
- rapid interruption and reduced-motion checks;
- acceptance criteria and a browser-persisted approval timestamp;
- a direct-frame URL for full-size inspection and browser capture.

The page stores local review state only. Austen's explicit approval in the task
is the authoritative sign-off; after approval, the timestamp is also copied
into this document so it survives browser storage and future machines.

## Gate 1 contract

Side by Side ⇄ single-view uses `PanelGroup` to keep both panes mounted while
their allocation changes from 1:1 to 1:0 or 0:1. The outgoing pane fades on the
same shared clock. Mobile portrait changes row allocation, while landscape and
desktop change column allocation. Responsive direction changes settle without
first-paint animation. The surrounding export inspector joins and leaves through
the same canonical panel owner, so the stage and inspector read as one continuous
workspace recomposition instead of overlapping grid and split-pane animations.

Acceptance requires:

1. Side by Side → 2D and Side by Side → Card show continuous geometry.
2. The reverse transitions restore the split without a blank or doubled frame.
3. 2D → Side by Side → Card triggered rapidly never jumps backward.
4. Both panes preserve their mounted state and playback/card progress.
5. Reduced motion removes all spatial interpolation and hands the old and new
   workspace pixels across with a short opacity-only dissolve.
6. No overflow, unreadable scaling, or stranded controls at the required
   375×667, 960×412, 820×1180, 1440×900, 1920×1080, 2560×1440, and 3840×2160
   viewports.
7. The Card settings keep their destination wrapping and vertical composition
   while the inspector dock opens and closes; only the dock reveal and the
   canonical content fade move.
8. A hidden animation pane retains its last readable canvas backing store, so
   the returning mandala is never magnified from collapsed geometry.

## Risks and controls

- Canvas and card content can remeasure repeatedly during structural motion.
  The panes remain mounted and clipped by `PanelGroup`; runtime capture must
  confirm that resize work does not blur or hitch.
- A zero-sized pane must also be `inert` and non-interactive. Visual hiding is
  not an accessibility boundary.
- Hidden 3D and video surfaces must eventually pause expensive work without
  losing their retained state. That belongs to their later gates.
- Review instrumentation must click the production mode controls. Directly
  changing `viewerState` would bypass the behavior being approved.

## Verification per gate

Each gate requires focused unit tests for silent state and interruption bugs,
one scoped type/check pass, console inspection, and live review at every
reachable required viewport. Visual evidence must exercise both endpoints, a
normal transition, rapid interruption, and reduced motion.

### Gate 1 evidence · 2026-08-28

- The stage split and surrounding export inspector both route through
  `PanelGroup`; no feature-local grid timing remains in this handoff.
- Austen's visual passes caught two different midpoint collapses that endpoint
  checks missed. The first came from the outer inspector/split allocation. The
  second survived that repair: the contained Card itself changed Auto layout
  from `4×3` to `5×2` and back while the workspace moved. At 960×412 the new
  height/aspect trace measured the visual falling from about 421×351 to 421×203
  and its aspect jumping from 1.20 to 2.15.
- The geometry trace now samples Card width, height, aspect, selected viewer
  mode, resolved columns/rows, and the transition layout lease. It distinguishes
  visible deformation from internal ResizeObserver work covered by the reduced
  motion snapshot dissolve.
- The repair leases the last readable Auto grid for the entire Card visit. It
  releases only after the return transition has actually settled: the shared
  `DURATION.emphasis` clock for full motion, or `ViewTransition.finished` for
  reduced motion, followed by two paints for ResizeObserver to publish the final
  contained dimensions. Auto remains container-aware outside that visit.
- The final 960×412 full-motion replay reported a 350×292 minimum Card visual,
  aspect 1.20–1.20, a single `4×3` layout, zero squashed frames, zero tiny Card
  or Animation frames, and no viewport overflow.
- The final 960×412 reduced-motion replay reported a 421×351 minimum Card
  visual, aspect 1.20–1.20, a single `4×3` layout, zero visible squashed frames,
  zero dissolve-covered Card reflow frames, and an opacity-only dissolve.
- The wide-screen reverse-leg trace exposed a separate axis race. At 1440×900,
  the temporary inspector made the focused stage portrait-shaped, so the inner
  split changed `horizontal → vertical → horizontal` while Card returned. Its
  pane height fell 847→515→847 px and the rendered Card fell
  581×839→381×550→581×839 even though the Card's center traveled monotonically.
- `ViewerSplitPane` now retains the last meaningful Side-by-Side axis through a
  focused visit and the shared emphasis-duration release. The export dock leads
  the returning split by `STAGGER.normal`, giving the two nested `PanelGroup`
  allocations one continuous visual handoff instead of competing for the same
  pixels. The stable Card Auto-layout lease also spans a 2D focus visit, so a
  rapid 2D → split → Card interruption cannot publish a transient `2×5` grid.
- The corrected 1440×900 Card return keeps one horizontal axis, a constant
  581×839 Card visual, and a 530→1124 px center path with zero size dip,
  backtrack, overshoot, tiny frames, or squashed frames. The 1920, 2560, and
  3840 desktop replays likewise report zero visual-size dip and zero travel
  reversal. The interrupted replay holds `3×4` with zero tiny or squashed
  frames.
- Austen's reduced-motion pass exposed a real browser deadlock. The dissolve
  update callback waited for two animation frames, but Chromium suppresses
  painting while that callback is open. The viewer therefore appeared frozen
  until the browser's safety timeout aborted the transition and exposed the
  destination all at once. The callback now publishes the Svelte destination
  synchronously and never waits on paint. A rapid reversal skips the stale
  dissolve before starting the new one.
- The review replay no longer trusts a fixed sleep. It waits for the actual rail
  selection, fails if the commit exceeds the gate timeout, and records every
  commit latency. At 1440×900 the reduced Card round trip commits in `56 ms`
  and `70 ms`; the rapid 2D → split → Card → split sequence commits each choice
  in `69–113 ms`, with zero tiny Card or Animation frames.
- The seven-size full-motion sweep retained the canonical `4×3` Card on compact
  frames and `3×4` Card on desktop frames without viewport overflow. The review
  page remains positioned on the reported 1440×900 full-motion case for
  Austen's visual confirmation.
- Austen's next visual pass exposed a separate inspector-content reflow: the
  settings were `width: 100%` while the dock grew from zero, so chip wrapping
  and auto vertical centering made the controls appear oversized before they
  collapsed into place. The shell now keeps the settings at the tier's final
  sidebar width and lets `PanelGroup` reveal that stable composition. Their
  entrance uses the shared reduced-motion-aware fade/drift helper.
- The review trace now samples the Card settings width, height, opacity, and
  vertical center. At 1440×900, both entrance and exit hold `560×396` with zero
  width, height, or center drift. The 1920×1080, 2560×1440, and 3840×2160 runs
  likewise report zero reflow at their `800`, `800`, and `1000` px dock tiers.
- Austen's next wide-screen pass caught a canvas-backing artifact that pane
  geometry alone could not reveal. While Card was focused, the hidden animation
  wrapper measured `48 px`; its ResizeObserver rebuilt the mandala at that size.
  On the return frame the `48 px` raster was stretched across `630 px`, a
  measured `13.13×` magnification that made the guide lines look temporarily
  heavy.
- `CanvasResizer` now treats an `inert` ancestor as the canonical hidden-surface
  boundary. It retains the last readable raster while hidden, then rebuilds
  only after the shared emphasis-duration reveal has settled. Reduced motion
  uses the same rule with the existing `40 ms` observation settle, so it gains
  no spatial motion or delayed mode commit.
- The gate now records mandala backing size, displayed size, scale, and
  magnified-frame count. Full and reduced Card returns at 1440×900 both report
  `1.00×` maximum scale and zero magnified frames. Full-motion checks at
  960×412, 1920×1080, and 3840×2160 report the same result, with zero tiny
  Animation frames and no runtime warnings or errors.
- The iPhone SE pass exposed review-harness instability rather than a new
  production pane collapse. The frame initialized as desktop until `onMount`,
  reused the same live iframe while device dimensions changed, and treated only
  `aria-pressed` controls as committed even though the mobile bottom bar uses
  its active class. The frame now starts from the real client width, each
  viewport selection receives a fresh exact-size preview, and the replay gate
  recognizes both production selection signals. The outer review surface owns
  a `100dvh` scroll container, so its geometry report and decision controls are
  reachable despite the app shell's global overflow boundary.
- Two consecutive cold 375×667 full-motion Card round trips started vertical
  with Side by Side selected and completed `split → card → split`. Both reported
  a stable `4×3` Card, zero squashed frames, zero magnified mandala frames, and a
  `1.00×` mandala return. The reduced-motion run completed in `1044 ms` with 32
  dissolve frames, zero squashed frames, and no viewport overflow.
- The final iPhone SE polish pass put the contained Card width and vertical
  travel on one sampled clock. Before the repair, focus width settled at
  `183 ms` while the Card continued rising until `316 ms`, a `133 ms` split in
  the gesture. The sizing owner now captures the Side-by-Side Card box, targets
  the focused box for the forward leg, and restores the captured box from the
  same event that reveals the returning split. The last visible gate trace
  measured focus width/rise settling within `16 ms` and return width/fall
  starting together and settling within `21 ms`. Three consecutive mobile
  round trips stayed within `0–30 ms` at settle, with zero squashed or magnified
  frames. The 1440×900 regression replay retained its constant `562×839` Card
  visual and monotonic horizontal slide.
- A cold Card replay after leaving the hidden pane in another mode reproduced
  the intermittent rising-cell failure as a stale `5×2 → 4×3` Auto-layout
  change. The Card briefly measured `375×186` at a `2.02` aspect and logged 43
  squashed frames. The shell had accepted a wide, shallow layout report from
  the collapsing hidden Card, then leased it on the next Card visit.
- The lease source now remembers only Auto layouts reported from a contained
  Card box whose width and height both meet `MIN_VIEWER_PANE_REVEAL_SIZE`.
  Collapsing hidden-pane measurements still reach current-layout consumers but
  cannot replace the next visit's stable shape. Cold and stale-mode iPhone SE
  replays now hold `4×3` at a `322×280` minimum with zero squashed frames; direct
  cell-boundary sampling found zero upward-overflow frames. The complete
  responsive sweep holds `4×3` on compact frames and `3×4` on desktop through
  3840×2160, with zero squashed frames. Reduced motion records 36 opacity-only
  dissolve frames and the same stable `4×3` Card.
- Austen's screenshot then exposed an internal motion layer the outer Card-box
  trace could not see. The `4×3` lease stayed stable, but all eight step-cell
  wrappers ran their own page-space FLIP while the parent Card moved. The first
  instrumented replay reproduced 34 transformed-cell frames: the cells appeared
  to keep rising, overlapped their neighbors, then snapped back when FLIP ended.
- The Card sizing owner now suppresses cell FLIP for the existing
  `containSizeMotion` lifetime. Reduced motion keeps that non-visual suppression
  signal through the opacity dissolve and its final ResizeObserver paints; the
  global reduced-motion rule still collapses all spatial interpolation. Eight
  consecutive full-motion and eight reduced-motion iPhone SE round trips report
  zero transformed-cell frames and zero squashed frames. The seven-viewport
  sweep through 3840×2160 reports the same result.
- Fifty focused tests pass and `svelte-check` reports zero errors and zero
  warnings. The production build currently stops on the unrelated existing
  `@austencloud/scene-3d` package export mismatch for `propFinishState`.

## Gate 2 contract

2D ⇄ 3D uses the existing mounted layers in `ViewerMotionSurface`. A first 3D
request mounts and prepares the scene behind the still-live 2D canvas. The 3D
layer becomes presentable only after its ready event, then the two surfaces
crossfade on the shared emphasis clock. Later switches use the same path with an
already-ready scene. No keyed remount or second surface-switching abstraction is
introduced.

Reduced motion keeps the stage geometry fixed. The two overlapping motion
surfaces retain only the canonical opacity handoff, while the outer workspace
uses the existing reduced-motion View Transition dissolve. Compact viewports
that fail the production 3D shortest-side gate remain layout-only review sizes.

Acceptance requires:

1. The live 2D frame remains visible for the entire first 3D preparation.
2. The first visible 3D frame is ready and never exposes its loading curtain.
3. Warm 2D ⇄ 3D round trips use the same opacity clock in both directions.
4. Rapid reversals expose neither a blank stage nor an unready 3D surface.
5. Reduced motion has no spatial interpolation and retains a short opacity-only
   handoff.
6. Every viewport passes overflow and responsive-axis checks; transition replay
   runs only where the canonical production 3D gate passes.

### Gate 2 evidence · 2026-08-30

- The cold 1440×900 full-motion replay kept 2D visible for 82 sampled preparation
  frames, then crossed through five sampled opacity frames. It reported zero
  blank frames, zero unready 3D frames, zero visible loading-curtain frames, and
  the expected `2D → 3D → 2D` surface path.
- The warm 1440×900 replay reported seven crossfade frames and the same zero-
  defect counts. The rapid reversal trace traveled
  `2D → 3D → 2D → 3D → 2D` through 14 crossfade frames without exposing a blank
  or unready stage.
- The global reduced-motion rule initially collapsed the inner surface opacity
  change to `0.01 ms`; instrumentation caught the resulting snap even though the
  outer workspace dissolve was present. The two canonical mounted motion layers
  now retain only `opacity` and delayed `visibility` on `--duration-normal`.
- A cold 1440×900 reduced-motion replay held 2D for 48 sampled preparation
  frames, used seven crossfade frames and 25 outer dissolve frames, and reported
  zero blank, unready, or loading-curtain frames. The warm replay used eight
  inner crossfade frames and 30 dissolve frames.
- Tablet 820×1180 passed in its vertical panel composition with nine full-motion
  crossfade frames and 13 reduced-motion crossfade frames. Native 3840×2160
  passed in its horizontal composition with four full-motion and seven reduced-
  motion crossfade frames. Both reported zero blank, unready, and loading-
  curtain frames.
- The complete 375×667 through 3840×2160 sweep reported no viewport overflow.
  The 375×667 and 960×412 sizes correctly withhold 3D under the shared
  `fits3DViewport()` predicate; the review surface disables impossible replays
  and labels those sizes as responsive-layout checks.
- Austen's visual pass then caught a one-frame mandala twitch after the returning
  2D surface appeared settled. The 1920×1080 trace reproduced the hidden 2D
  stage expanding from `940 px` to `1740 px`, rebuilding its mandala backing at
  the hidden geometry, then rebuilding again `79 ms` after the pane was fully
  opaque and back at `940 px`.
- The existing mounted motion layers are now true `inert` boundaries while
  hidden, so `CanvasResizer` retains the last readable backing store through the
  temporary 3D allocation and resumes only after the shared settle clock. The
  layer opacity and width lease now share `DURATION.emphasis`; no new crossfade
  or resize owner was introduced.
- The polished 1920×1080 replay records 11 full-motion crossfade frames and six
  reduced-motion crossfade frames with zero late 2D backing changes. Rapid
  reversal records nine overlap frames and the full
  `2D → 3D → 2D → 3D → 2D` path with the same zero count. Tablet records 13/7
  full/reduced overlap frames and 4K records 12/13, all without blank, unready,
  loading-curtain, overflow, or late-backing frames.
- Fifty-six focused tests pass, `svelte-check` reports zero errors and zero
  warnings, `git diff --check` is clean, and the in-app browser console reports
  no warnings or errors.
- Austen approved the final 1920×1080 full-motion handoff and measured trace at
  16:27 CDT on 2026-08-30, with no remaining visual notes. Gate 2 is complete.

## Gate 3 contract

2D and Tunnel are two presentations of one shell-owned `AnimatorCanvas`, not
two canvases that crossfade. `ViewerSplitPane` owns the shared
`TunnelViewController`; `ViewerMotionSurface` feeds that controller's performers,
effects, spectrum, grid, and save actions into the already-mounted Animator.
Entering Tunnel blooms the additional performer layers over the live 2D base.
Exiting reverses the same envelope. The playback clock, backing store, base prop
state, and canvas DOM identity never change.

The outer `PanelGroup` inspector also remains mounted on desktop. The existing
Animation settings and `ArtSettingsPanel` stay alive in stacked content layers;
the art settings node is reparented into the shell-owned inspector slot without
remounting. Their opacity changes while the inspector's width and DOM identity
stay fixed. Compact layouts retain the production bottom-dock composition, so
desktop inspector identity is not treated as a mobile invariant.

3D remains a genuinely different renderer and therefore keeps the canonical
ready-frame surface crossfade. Its destination is a fully composed Tunnel:
Tunnel layers snap to their completed internal state before the 3D crossfade,
then reset only after the outgoing canvas is hidden. This prevents the old
double fade where 3D opacity and Tunnel-layer opacity moved at the same time.
Reduced motion snaps the internal layer envelope and lets the existing
opacity-only workspace View Transition provide the accessible dissolve.

Acceptance requires:

1. 2D ⇄ Tunnel retains one Animator DOM identity, one backing store, and one
   playback clock for the complete round trip.
2. Desktop 2D ⇄ Tunnel retains one outer inspector identity and never exposes
   duplicate active settings content.
3. Full-motion 2D entry, exit, and interruption use the canonical emphasis
   clock and a staggered per-layer opacity envelope.
4. 3D ⇄ Tunnel has one surface-opacity owner; its fully composed Tunnel
   destination never double-fades, blanks, or appears unready.
5. Reduced motion uses the existing opacity-only workspace dissolve, with no
   internal spatial animation or delayed state swap.
6. Every required viewport passes overflow, responsive-axis, canvas singleton,
   readiness, and late-backing checks. The 3D replay remains disabled where the
   production viewport gate does not pass.

### Gate 3 evidence · 2026-08-30

- The architecture gate now assigns stable DOM identities to the persistent
  Animator and desktop inspector on every sampled frame. It also counts live
  Animator canvases and active settings panels, so a remount or duplicate can no
  longer hide behind a visually plausible fade.
- The fresh 1440×900 2D round trip records 12 layer-bloom frames, a fixed
  `700 px` stage and canvas, and the expected
  `2D base → 2D base + Tunnel layers → Tunnel → … → 2D base` path. It reports
  zero Animator remounts, inspector remounts, non-singleton canvases, duplicate
  settings, blank frames, unready frames, double fades, and late backing changes.
- The rapid-reversal trace records 23 reversible layer-bloom frames through
  `animation → tunnel → animation → tunnel → animation`, with the same zero
  defect counts and zero-millisecond mode commits.
- Reduced motion records zero internal bloom frames and 18 workspace-dissolve
  frames. The Animator and inspector identities remain stable, and the surface
  path collapses cleanly to `2D base → Tunnel → 2D base`.
- The first shared-renderer 3D replay exposed six double-fade frames because the
  3D surface and the Tunnel layers were both changing opacity. The corrected
  handoff precomposes Tunnel before the surface crossfade and holds it intact on
  exit. Its rerun reports zero bloom, double-fade, blank, unready, remount,
  duplicate, and late-backing frames, with a zero-millisecond ready handoff.
- The 375×667 mobile replay uses its intentional vertical/bottom-dock
  composition and reports a fixed `375 px` Tunnel display, zero overflow, and
  zero canvas/remount/readiness defects. Native 3840×2160 reports a fixed
  `2660 px` stage and `2107 px` Tunnel display with the same zero counts.
- Forty-seven focused tests pass, `svelte-check` reports zero errors and zero
  warnings, `git diff --check` is clean, and the final in-app-browser run emits
  no console warning or error. Gate 3 is ready for Austen's visual review.

## Gate 4 contract

Card and the motion modes are persistent surfaces inside the same nested
`PanelGroup` workspace. A direct Card selection never routes through Side by
Side, and a direct motion selection never remounts the Card, Animator, or outer
inspector. The selected pane allocation and inspector allocation publish in the
same mode mutation, so the Card edge, stage edge, and settings content describe
one structural change.

The Card's Auto layout and last readable contained box are leased through the
handoff. While its panel track is narrower than that box, the fixed Card is
clipped by the canonical panel wrapper instead of being flex-compressed. This
keeps every pictograph cell square and stationary while the Card is progressively
covered or revealed. The existing Side-by-Side focus motion keeps its approved
behavior; motion-mode restoration uses a distinct containment phase because it
starts behind a zero-sized track.

Card, 2D, and Tunnel retain the desktop inspector track while their persistent
content layers crossfade. 3D owns its full stage and intentionally releases the
inspector track while its preparation surface and scene take over; the track
closes and reopens monotonically without losing its DOM identity. Compact
layouts keep the production bottom-dock composition. Reduced motion removes the
spatial interpolation and uses the existing workspace snapshot dissolve.

Acceptance requires:

1. Card ⇄ 2D, Card ⇄ 3D, and Card ⇄ Tunnel use direct mode paths with no
   Side-by-Side intermediate frame.
2. Card, Animator, and desktop inspector retain one DOM identity through every
   round trip and rapid reversal.
3. A visible Card never falls below the readable floor, changes aspect through
   a sliver, or transforms its cells while the panel track moves.
4. Card and stage center/allocation paths are monotonic in both directions,
   with no backtrack or endpoint overshoot.
5. Card/2D/Tunnel settings crossfade without a blank inspector; 3D's inspector
   release and return remain monotonic on the structural clock.
6. Reduced motion has no spatial tween, no blank workspace, and no delayed
   state commit outside the canonical dissolve.
7. Every required viewport passes overflow, responsive-axis, identity, blank,
   squash, transformed-cell, and travel checks. 3D remains disabled where the
   production viewport capability gate does not pass.

### Gate 4 evidence · 2026-09-01

- The first instrumented 1440×900 replay exposed the real failure: the Card's
  panel collapsed to `6 px` while the live Card remained above `0.5` opacity.
  The trace counted 22 squashed frames and two blank-inspector frames even
  though the endpoints looked correct.
- Card settings now remain in the shell-owned inspector layer, so Card, Motion,
  and Tunnel controls trade places without removing the inspector content tree.
  Card-to-2D and Card-to-Tunnel each record four crossfade frames, zero blank
  inspector frames, and a fixed `560 px` desktop inspector.
- Motion-mode restoration now reuses the existing Card containment lease and
  disables flex compression while the track is below the leased box. The final
  1440×900 Card-to-2D replay records zero squashed frames, zero transformed-cell
  frames, and the direct `card → animation → card` path. Card travel is
  `530 → 885 → 530 px`; stage allocation is `26 → 700 → 1 px`. Every leg has
  zero backtrack and zero overshoot.
- Card-to-Tunnel records the direct `card → tunnel → card` path with the same
  zero remount, blank, squash, transform, backtrack, and overshoot counts.
  Card-to-first-3D retains all three DOM identities and the honest 3D preparation
  surface; its inspector closes `560 → 4 px` and reopens `4 → 560 px`
  monotonically while the 3D stage takes the released space.
- Rapid reversal records `card → animation → card → tunnel → card` with zero
  intermediate split, remount, blank-workspace, blank-inspector, squash, or
  transformed-cell frames. Reduced motion records 35 workspace-dissolve frames
  with the same zero defect counts and no spatial Card layout change.
- The full 375×667, 960×412, 820×1180, 1440×900, 1920×1080, 2560×1440, and
  3840×2160 sweep reports no viewport overflow. Every reachable Card-to-2D
  replay records zero remount, blank, squash, transform, backtrack, and
  overshoot counts; 375×667 and 960×412 correctly withhold 3D through the shared
  viewport capability predicate.
- Forty-two focused tests pass, `svelte-check` reports zero errors and zero
  warnings, `git diff --check` is clean, and the final in-app-browser console
  contains no warnings or errors. Gate 4 is ready for Austen's visual review.
- Austen approved the final Card-to-motion handoff on 2026-09-01 with no
  remaining visual notes. Gate 4 is complete.

## Gate 5 contract

Performance browsing is a two-pane workspace, governed by
[`2026-09-01-performance-two-pane-workspace-design.md`](../2026-09-01-performance-two-pane-workspace-design.md).
`SequenceViewerShell` keeps one outer stage track and one inspector track
mounted through the mode change. Inside the stage track, the motion stage and
`PerformanceStage` are persistent sibling sources of one `DualSourceCrossfade`;
selecting Performances changes which source is active and, on the same mode
commit, the inspector track changes its information from Motion settings to
`PerformanceInspector`.

The seam between those two tracks travels. Performances owns its own inspector
profile (`performance` in `viewer-shell-model.ts`, default 400 px, bounds
360–900 px) and its own width token (`--performance-sidebar-width`,
`clamp(380px, 24vw, 520px)`), narrower than the effects inspector because the
take list is a column and the video is landscape. `PanelGroup` slides the seam
from the Motion width to the Performances width on the structural clock while
the stage sources and inspector contents crossfade on the same emphasis
duration, which is the Gate 1 and Gate 4 vocabulary rather than a flat
dissolve. The Performances inspector is composed at its destination width
before the mode changes and is revealed through the moving clip, so nothing
rewraps mid-glide. A seam the person has dragged by hand keeps that width for
the session. Nominal desktop travel: 180 px at 1440×900, 339 px at 1920×1080,
280 px at 2560×1440, and 480 px at 3840×2160.

The first version of this workspace shared one inspector allocation between
Motion and Performances. Austen reviewed it on 2026-09-01 and found it read as
a plain crossfade next to the approved gates; the travelling seam is the
response.

One `performance-workspace-state` owns selection, the single registered player,
upload and timing-map work mode, deletion, and the shared playhead. Upload and
timing mapping are focused full-workspace editors that reuse that owner and
return to the still-mounted browse workspace. The inactive source stays inert:
the motion stage receives paused playback while Performances owns the
workspace, and the hidden Performance player is paused and released when the
motion stage returns. A performance whose poster has painted counts as a
visually ready destination; the transition does not wait for decoded video.

Full motion uses the canonical emphasis clock with the standard crossfade
profile. Reduced motion removes local interpolation and lets the existing named
viewer snapshot dissolve carry the state change, with final geometry committed
immediately.

Narrow layouts stack the stage above a bounded inspector.
`ViewerWorkspacePanels` receives `--performance-inspector-height` as the
inspector's explicit stacked destination, the inspector owns its own list
scroll, and no Performance capability disappears on mobile.

Acceptance requires:

1. The outer stage, the motion stage, `PerformanceStage`, and the inspector
   track each retain one DOM identity through 2D, ready 3D, and
   rapid-reversal round trips.
2. The two stage sources keep complementary opacity, with no blank or
   double-opaque frame.
3. Both stage sources occupy the same stage box on every sampled frame, and
   that box grows or shrinks with the seam rather than after it.
4. The stage and desktop inspector allocations travel monotonically on the
   structural clock in both directions, with zero backtrack and zero overshoot,
   and the inspector changes contents without a visible layout change inside
   its moving clip.
5. Exactly one Performance player exists at any time, and the inactive source
   neither drives media playback nor the shared sequence playhead.
6. Reduced motion uses the existing opacity-only workspace dissolve with no
   delayed mode commit or spatial tween.
7. Every required viewport passes overflow, responsive-axis, identity,
   readiness, opacity, layer-size, and allocation-travel checks. 3D remains
   disabled where the production viewport capability gate does not pass.

### Gate 5 evidence · 2026-09-01

- The production shell now holds exactly one persistent motion-stage layer and
  one persistent performance-gallery layer. The instrumented 1920×1080 2D
  round trip records 15 crossfade frames, zero remounts, zero blank frames,
  zero double-opaque frames, zero unready-gallery frames, `0.000` opacity
  complement drift, and `0 px` layer-width mismatch.
- At 1920×1080 the stage expands `932 → 1740 px` while the inspector closes
  `800 → 1 px`, then both reverse monotonically to their starting allocation.
  Every leg reports zero backtrack and zero overshoot.
- The ready-3D round trip records 15 crossfade frames through
  `animation-3d → videos → animation-3d`, with a fixed `1260 px` stage and the
  same zero-defect identity, opacity, readiness, and layer-size counts.
- Rapid reversal travels
  `animation → videos → animation → videos → animation` through 35 sampled
  crossfade frames without a blank, remount, double-opaque frame, readiness
  failure, opacity drift, or layer-size mismatch.
- Reduced motion commits each endpoint inside the existing viewer snapshot
  dissolve. The mounted layers snap to `Stage → Performances → Stage`, preserve
  both identities, and report zero blank, double-opaque, readiness, opacity,
  and layer-size defects.
- The 375×667 mobile replay uses its intentional vertical composition and
  records 18 crossfade frames with a fixed stage allocation. The complete
  375×667, 960×412, 820×1180, 1440×900, 1920×1080, 2560×1440, and 3840×2160
  sweep reports no viewport overflow. Every replay records zero remount,
  blank, double-opaque, unready, opacity-drift, width-mismatch, backtrack, and
  overshoot defects.
- Sixty-two focused tests pass, `svelte-check` reports zero errors and zero
  warnings, `git diff --check` is clean, and the final in-app-browser console
  contains no warnings or errors. Gate 5 is ready for Austen's visual review.

- The two-pane redesign (`46a1007dc6`, merged by `889bc92a87`) replaced the
  whole-body gallery with `PerformanceStage` plus a persistent
  `PerformanceInspector`. Its final full-motion 2D replay recorded zero
  viewer-stage, Performance-stage, or inspector remounts; zero blank,
  double-opaque, unready, or visible inspector-layout-change frames; one
  maximum Performance player; and `0 px` layer-width mismatch along
  `Motion stage → both → Performance stage → both → Motion stage`. Rapid
  reversal, reduced motion, and a 20,660 ms cold 3D round trip kept the same
  zero counts and one player. The seven-size sweep reported no viewport
  overflow. 55 focused tests, `svelte-check` (0 errors, 0 warnings), and the
  repository finish gate were green before integration.
- Re-audit on 2026-09-01 (pickup): the configured Vitest run passed 223/223
  across the 29 sequence-viewer and shell-contract files, and
  `https://localhost:5173/test/sequence-viewer-transitions?gate=performances`
  returned HTTP 200 from the integrated `main` checkout.

### Gate 5 evidence · 2026-09-01 (seam travel)

- Austen's 2026-09-01 review read the shared-allocation version as a plain
  crossfade. Performances now owns a `performance` inspector profile
  (`400 px` default, `360–900 px` bounds) and the
  `--performance-sidebar-width` token (`clamp(380px, 24vw, 520px)`), so the
  existing `PanelGroup` structural clock slides the stage/inspector seam while
  `DualSourceCrossfade` swaps the sources. No new motion owner was added.
- Full-motion 2D round trips on the worktree server, measured through the
  review harness at every required viewport, all report zero viewer-stage,
  Performance-stage, and inspector remounts; zero blank, double-opaque,
  unready, and visible inspector-layout-change frames; one maximum player;
  `0 px` layer-width mismatch; no viewport overflow; and monotonic allocation
  travel with `0 px` backtrack and `0 px` overshoot on every leg:

  | Viewport  | Stage travel   | Inspector travel | Crossfade frames |
  | --------- | -------------- | ---------------- | ---------------- |
  | 1440×900  | 692 → 872 px   | 560 → 380 px     | 15               |
  | 1920×1080 | 932 → 1271 px  | 800 → 461 px     | 18               |
  | 2560×1440 | 1572 → 1852 px | 800 → 520 px     | 13               |
  | 3840×2160 | 2652 → 3132 px | 1000 → 520 px    | 16               |
  | 820×1180  | vertical axis  | vertical axis    | 17               |
  | 960×412   | vertical axis  | vertical axis    | 9                |
  | 375×667   | vertical axis  | vertical axis    | 16               |

- Rapid reversal at 1440×900 travels
  `animation → videos → animation → videos → animation` through 30 crossfade
  frames with the same zero counts. Reduced motion commits through 21
  workspace-dissolve frames, zero crossfade frames, and the same seam
  endpoints (`692 → 872 px` stage, `560 → 380 px` inspector) with zero
  backtrack or overshoot. The ready-3D round trip
  (`animation-3d → videos → animation-3d`, 7,546 ms) records 16 crossfade
  frames, a `1260 → 872 → 1260 px` stage, and zero defects.
- Endpoint frames at 1440×900, 3840×2160, and 375×667 were inspected: the
  Performances inspector composes at its destination width on desktop and
  the mobile vertical composition is unchanged.
- Focused Vitest (`tests/config/vitest.config.ts`): 29 files, 229 tests pass,
  including the new narrower-inspector model test and the updated
  orchestration contract. Prettier and `git diff --check` are clean. Gate 5
  remains ready for Austen's visual review.

### Gate 4 follow-up · 2026-09-02 (inspector content drift)

Austen reported that switching between Card and Tunnel made the right-hand
pane's contents shift up and to the right before settling. Instrumented first,
then fixed.

- The harness now measures **content drift** per settings surface: the spread
  of a panel's width, its horizontal origin, and its first content block's top
  across every frame the surface was actually readable. A panel composed at its
  destination width and revealed through `PanelGroup`'s moving clip reports
  zero on all three axes. `longestSampleGap` was added alongside it so a starved
  measurement host cannot be mistaken for smooth motion.
- Baseline at 1440×900 reproduced the complaint: **art settings drift of 77 px
  width and 77 px origin**, and **card settings drift of 4 px** on both. The art
  panel is portaled into its layer as an absolutely positioned host at
  `width: 100%`, so it stretched and rewrapped on every frame of the seam
  animation. The Card pin was keyed to `.export-panel-container.card-settings`,
  a mode-conditional class Svelte removes the instant the mode changes, so the
  departing Card panel dropped to its intrinsic width and then followed the
  closing seam.
- Both surfaces now pin their destination width on the **persistent layer**,
  matching what the Effects and Performances layers already did. The art host is
  additionally right-anchored (`left: auto; right: 0`) at
  `--export-sidebar-width`, and the Card panel pins `--card-sidebar-width` on
  `.card-settings-layer`. The `data-manually-sized="true"` overrides are
  preserved on both, so dragging the seam still resizes the panel.
- Post-fix `card-tunnel` replays report `0 px` drift on both surfaces at every
  desktop viewport, with zero Card/Animator/inspector remounts, zero blank,
  squashed, or transformed-cell frames, and monotonic seam travel:

  | Viewport  | Art drift | Card drift | Longest sample gap |
  | --------- | --------- | ---------- | ------------------ |
  | 1440×900  | 0 px      | 0 px       | 58 ms              |
  | 1920×1080 | 0 px      | 0 px       | 71 ms              |
  | 2560×1440 | 0 px      | 0 px       | 64 ms              |
  | 3840×2160 | 0 px      | 0 px       | 483 ms (host)      |
  | 820×1180  | n/a       | n/a        | 57 ms              |
  | 960×412   | n/a       | n/a        | 84 ms              |
  | 375×667   | n/a       | n/a        | 82 ms              |

  The three narrow viewports report `n/a` because mobile has no desktop
  inspector layer. The 4K sample gap is emulation-host jank, not product
  motion: 2560 and 1920 measured 64 ms and 71 ms in the same pass.

- The orchestration contract test now asserts that all four persistent
  inspector layers pin a destination width and keep their manual-resize
  override, so a future layer cannot silently go back to `width: 100%`.
- Focused Vitest (`tests/config/vitest.config.ts`): 28 files, 224 tests pass.
  Prettier and `git diff --check` are clean.

### Inspector follow-up · 2026-09-02 (seam anchoring and track surface)

Austen reviewed the content-drift fix and reported a second defect on the same
transition: _"when I go to tunnel mode there's a brief moment where the panel on
the left is occluding the left edge of the right panel so that you can't see the
selectors."_ Instrumented first, then fixed.

**What the instrument was missing.** The Gate 4 follow-up measured whether a
panel moved. It could not see a panel that stayed perfectly still while the clip
box in front of it cut a column off. Two measurements were added:

- **Inspector reveal**, per layer: the band of the panel cut off by the clip
  box's left edge, the band cut off by its right edge, and the band of the clip
  box with no panel behind it, each with the milliseconds it was on screen.
- **Inspector surface step**: the widest _lighter strip_ the track showed within
  a single frame. The track is cut at every panel edge, each band composites the
  layer fill and the panel fill actually read from the DOM, and bands are
  compared with the strongest band in the same frame. A crossfade that dims the
  whole track uniformly scores zero; only a hard-edged step is reported.

**What they found at 1920×1080 on the pre-fix build.**

- `art reveal: 261 px left cut · 290 ms`. The arriving Tunnel inspector was
  pinned to the viewport edge while the seam was still travelling, so its
  leading label and selector column sat outside the clip for a third of a
  second. That is precisely the reported symptom.
- `Inspector surface step: 167 px · 190 ms`. `.export-panel-container` paints
  `rgba(0, 0, 0, 0.75)`. A band that no panel reached was therefore a genuine
  25%-transparent window onto the moving workspace: a lighter vertical strip
  that appeared, held, and vanished.

**Why hand-anchoring cannot fix it.** The track is narrower than the arriving
panel for the whole time the seam travels. Anchoring every layer to the viewport
edge keeps content still but cuts the leading column, which is the reported bug.
Anchoring every layer to the seam shows the leading column but drags a
_departing_ fading panel sideways, which is the bug the previous follow-up
fixed. Neither anchor is right for both directions.

**The fix.** Two independent changes:

1. **Automatic start margins.** Every composed panel now carries
   `margin-left: auto`. When the panel fits the track the margin absorbs the
   free space and the panel stays pinned at the viewport edge, so a departing
   surface fades without sliding. When the panel is wider than the track there
   is no free space, the margin collapses to zero, and the panel is revealed
   from the seam with its overflow spilling past the viewport edge where the cut
   cannot be seen. One declaration, both directions correct.
2. **The layer owns the surface.** Each `.inspector-content-layer` paints the
   inspector fill across the whole track and the panel inside paints none, so a
   band the panel does not reach is never a lighter strip. The resting composite
   is unchanged: container `0.75` over layer `0.75` is the same `0.9375` as
   container `0.75` over panel `0.75`. `.art-settings-layer` carries
   `--theme-card-bg` rather than `--theme-panel-bg`, because that is the token
   its panel used.

**Post-fix, Gate 4 `card-tunnel` full-motion replays.** Every desktop viewport
reports `0 px` art left cut and `0 px · 0.00 alpha · 0 ms` surface step:

| Viewport  | Art left cut | Surface step | Art drift (origin) | Card drift (origin) |
| --------- | ------------ | ------------ | ------------------ | ------------------- |
| 1440×900  | 0 px         | 0 px         | 539 px             | 1 px                |
| 1920×1080 | 0 px         | 0 px         | 252 px             | 1 px                |
| 2560×1440 | 0 px         | 0 px         | 157 px             | 5 px                |
| 3840×2160 | 0 px         | 0 px         | 324 px             | 1 px                |

Art's origin figure is now the _intended_ motion, not the defect: width drift
and vertical drift are both `0 px`, so the panel translates rigidly with the
seam and is revealed as a drawer rather than rewrapping. The 2560 Card figure of
`5 px` is `clamp(480px, 28vw, 640px)` capping at `640 px` against a `636 px`
track, not motion.

**Anchor resolution, measured in the production viewer at a 799 px track.** The
rule is deterministic and was read back from computed style rather than assumed:

| Layer           | Panel width | Resolved `margin-left` | Result                    |
| --------------- | ----------- | ---------------------- | ------------------------- |
| Motion settings | 800 px      | `0px`                  | revealed from the seam    |
| Performances    | 461 px      | `338.5px`              | pinned at the screen edge |
| Card settings   | 538 px      | `261.7px`              | pinned at the screen edge |

**No regression on approved gates.** Gate 7 (Export inspector) replays
`Inspector surface step: 0 px · 0.00 alpha · 0 ms` and
`motion reveal: 0 px left cut · 1 px right cut · 0 px undrawn`; the 1 px right
cut is the 800 px Motion panel spilling past a 799 px track, off the screen edge.
Gate 5's motion could not be replayed in this checkout: the harness fixture has
no performance video, so the viewer never commits `videos` mode and the trace
records `Mode path: animation` with zero crossfade frames. Gate 5's inspector
behaviour is covered by the anchor table above, which is the only thing this
change alters there.

**Checks.** The orchestration contract test now asserts that all four composed
panels carry `margin-left: auto`, that the layer paints `--theme-panel-bg`, and
that the panels reset their own background, so a future layer cannot silently go
back to a hand-anchored edge. Focused Vitest
(`tests/config/vitest.config.ts`, `tests/unit/sequence-viewer` plus
`viewer-shell-model`): 29 files, 231 tests pass. Prettier and
`git diff --check` are clean.

### Card follow-up · 2026-09-02 (late size burst on Card ⇄ Performances)

Austen reported that after returning to Card the animation completed with the
Card still narrower than its container, and the last thing that happened was an
instant jump to full width. Instrumented first, then fixed.

**Why the existing trace could not see it.** Two gaps. The harness had no
`card-performances` command at all, so that pair was never replayed. And every
trace stopped when the last mode step returned, which `chooseMode` does one
emphasis (370 ms) after the commit — while the Card's contained box stays pinned
for 480 ms. The trace ended 110 ms before the event it needed to record.

**What was added.**

- A `card-performances` replay command, and a `settle` phase that keeps sampling
  for `DURATION.emphasis * 2 + DURATION.normal + 200` after the last step so the
  pin's release is inside the recorded window.
- `data-contain-size-motion` is now sampled per frame, and a **Card size pin
  release** metric grades the frames after the pin's last frame: the largest
  single-frame width step, total travel, frames and milliseconds to settle, and
  the container fill ratio before and after. Everything after the pin is
  untransitioned by construction, so a large step there is a jump rather than
  motion. A trace whose Card never pinned reports nothing rather than a zero, so
  an absent measurement cannot read as a pass.

**What it found.** The Card is width-constrained only where `fitWidth` applies,
which is why the burst was invisible on the wide viewports and obvious on the
narrow ones:

| Viewport    | Pinned content width | Root width | At pin release                                      |
| ----------- | -------------------- | ---------- | --------------------------------------------------- |
| 820×1180    | 666 px               | 740 px     | 666 → 740 in 1 frame (t = 948 ms), fill 0.90 → 1.00 |
| 375×667     | 336 px               | 375 px     | 336 → 375 in 1 frame (t = 984 ms), fill 0.90 → 1.00 |
| 1920 / 2560 | height-constrained   | —          | 0 px — height never changes                         |

**Root cause, two compounding defects.**

1. `splitContainedSize` was captured only on a `focus` transition (Side-by-Side →
   Card) but was used as the pinned output for `return` **and** `restore`. A
   Performances → Card `restore` therefore held the Card at a size measured in a
   different layout for the whole animation, guaranteeing residual distance at
   the end.
2. The width and height transition lives only on
   `.choreo-card-root[data-contain-size-motion]`. A fixed 480 ms timer cleared
   that attribute, and the effect watching it recomputed the box in the same
   tick, so whatever distance remained was crossed in one untransitioned frame.

**The fix.**

- The frozen-size branch is gone. The contained box now follows the container
  throughout, so the width and height transitions carry it to its destination.
  The protection the pin actually existed for — a pencil-thin Card solved
  against a destination track that has not opened yet — is now a
  `MIN_MEASURABLE_MOTION_SIZE` (240 px) sliver guard that holds the last painted
  box for that frame only, instead of freezing the whole transition.
- The pin outlives the workspace allocation by one emphasis and is released on
  two settled paints, versioned so an interrupting transition cancels the
  pending release. A ResizeObserver delivery landing on the frame the clock
  expires is still carried by the transition it was measured under.

**Post-fix, `card-performances` at every required viewport:** `Card size pin
release: 0 px step · 0 px over 0 frames · 0 ms`, `Mode path: card → videos →
card`, `Squashed Card frames: 0`, `Card remounts: 0`. At 375×667 the width now
eases 305 → 375 over ~180 ms and reaches its destination 33 ms _before_ the pin
releases.

**No regression on the other Gate 4 commands or Gate 1.** `card-2d`,
`card-tunnel`, and `card-stage-interrupt` all report a `0 px` pin release step.
The sliver protection still holds: `card-stage-interrupt` and `gate1-card` at
1920 report a minimum Card box of 705 × 1019 px with zero tiny or squashed
frames, and `gate1-card` at 375 reports 336 × 280 px with zero tiny frames.

The Card-playback pin tests that landed on `main` while this was in flight
encoded the old 480 ms lifetime and a same-tick release; they now assert the
extended lifetime and the settled-paint release, plus a new case proving an
interrupting transition cancels the pending release rather than clearing its own
pin.

**Checks.** The orchestration contract test asserts the frozen size is gone, the
sliver floor and its two guards are present, the extended pin lifetime and its
cancellation are wired, and the harness carries the settle tail, the
`card-performances` command, the sampled attribute, and the released-pin
readout. Focused Vitest (`tests/config/vitest.config.ts`,
`tests/unit/sequence-viewer` plus `viewer-shell-model` and
`sequence-viewer-escape-ownership`): 29 files, 234 tests pass on the branch
merged up to `main`, with `svelte-check` reporting 0 errors and 0 warnings.

### Follow-up · the Card climbing in from below the fold (2026-09-02)

**Report.** "As I switch to a card from performances it seems as the card seems
to jump up from below as though it was hiding below the screen."

**Root cause: a held dock swapping a length for a keyword.**
`SequenceViewerShell` supplies `stackedInspectorSize` as
`var(--performance-inspector-height)` in Performances and `"auto"` in Card.
`ViewerWorkspacePanels` forwards it as the `export-inspector-stacked` panel's
`preferredSize`, which `PanelGroup` renders as
`flex-grow: 0; flex-shrink: 0; flex-basis: <value>` — a **held** panel, whose
basis alone is its size.

CSS has no interpolable midpoint between a length and a content keyword, so
`flex-basis: 480px -> auto` is a discrete change and the whole outer group
re-laid out in **one frame**: the dock went `[741.3, 480] -> [1220.7, 0.7]` and
`viewer-stage` went `688.7 -> 1168`. That single frame relocated the collapsed
`preview` column — which holds the Card — 479.3 px downward, to top 1220.7 in a
1221 px viewport. The inner `flex-grow` animation then swept the Card up roughly
820 px from off-screen. The reported climb was real, and it was the dock's snap
that put the Card below the fold to climb from.

**The fix: a measured-endpoint basis handoff, owned by `PanelGroup`.** The
decision logic moved to `src/lib/shared/panels/panel-flex.ts`, so it is testable
without a layout engine. `needsMeasuredBasisHandoff` fires only when **both**
endpoints are held; a panel with a live flex share keeps today's behaviour,
because there its basis is not its size and pinning it would fight the share.
When it fires, `$effect.pre` measures the start box before the DOM update, the
post-DOM effect reads the destination through a forced synchronous layout, pins
the start with `transition: none`, reflows, and animates to the measured target
in pixels. `transitionend` hands the declarative basis back so a content-sized
dock resumes following its contents. Reduced motion opts out entirely, and a
`DURATION.emphasis + DURATION.instant` safety settle covers a dropped
`transitionend`.

**Measured on the real route** (`/sequence/EHWE`, 1118×1221 — the in-app pane's
exact viewport):

| Run                  | Dock max step | Dock moving frames | Card centre max step              | Card ever offscreen                           |
| -------------------- | ------------- | ------------------ | --------------------------------- | --------------------------------------------- |
| Performances -> Card | 74.8 px       | **17** (was 1)     | 19.1 px (was a 479.3 px teleport) | **no** (was yes)                              |
| Card -> Performances | 74.9 px       | 17                 | 31.7 px                           | departure only, clipped by `overflow: hidden` |
| 2D Animation -> Card | 0 px          | 0                  | 92.4 px                           | unchanged from before the fix                 |

Post-fix basis frames: `480px -> 476.0 -> 461.7 -> 431.6 -> 380.0 -> 307.1 ->
231.8 -> 170.4 -> 123.5 -> 88.4 -> 62.1 -> 42.1 -> 27.2 -> 16.3 -> 8.6 -> 3.8 ->
1.26 -> auto`. The trailing `auto` is the proof the declarative basis is handed
back rather than frozen at whatever pixel value it landed on.

**No regression on the other held-panel consumers.** They are
`ViewerWorkspacePanels`, `ViewerSplitPane`, `StageModule`, and
`ShapeMatrixAppShell`. At 1920×1080 the desktop `export-inspector` already
transitioned over 14–16 frames for Card <-> 2D (537.6 <-> 800) and Card <->
Performances (537.6 <-> 460.8), and it still does: the desktop path's declarative
basis **string** is identical across modes (`var(--active-inspector-width)`) and
only the variable's value changes, so `needsMeasuredBasisHandoff` returns false
and CSS keeps handling it natively. Confirmed by reading the inline style
mid-flight — `inlineBasis: "var(--active-inspector-width)"`, computed 705.453 px
mid-interpolation.

**New instrument.** `transition-geometry-trace.ts` gained `summarizeDockCollapse`
and the harness readout `Dock collapse: <step> px step · <travel> px over
<frames> frames · <ms> ms`, flagged when a collapse of more than 24 px completes
in a single frame. The pre-existing `Card arrival` filter was also relaxed: it
had required a measurable panel height, which discarded exactly the frames where
the Card is parked in a collapsed panel — the frames that carry this defect. Both
readouts return `null` when the trace contains no held-dock resize, which is the
honest result for a replay whose dock mounts and unmounts through `flexPresence`
rather than changing its basis.

**Checks.** `tests/unit/panel-flex.test.ts` covers the precedence order (fixed >
preferred > flex share) and every handoff decision, including the two directions
of this dock swap and the four cases that must stay false. The orchestration
contract test now asserts the ownership move and the handoff wiring rather than
the old inline `fixedSize` line. Vitest (`tests/config/vitest.config.ts`): 30
files, 243 tests pass. `svelte-check`: 0 errors, 0 warnings. Resting composition
captured at all seven required viewports — 375×667, 960×412, 820×1180, 1440×900,
1920×1080, 2560×1440, 3840×2160 — and is unchanged, which the implementation
guarantees by construction: the inline basis exists only for the duration of the
transition.

### Gate 5 · Card arrives at its destination size (2026-09-03)

Follow-on to the dock-collapse fix above. With the dock's basis handoff landed,
one defect remained on the Card's own geometry: entering Card from a mode whose
Card pane was collapsed (Tunnel, Performances, 2D Animation) painted the Card as
a speck and grew it over roughly 375 ms.

**Cause.** The Card was never given a transition. It was dragged along by its
container: entering Card animates the image pane's `flex-grow` from 0 to 1, and
the Card's aspect-fit solve read that live, still-opening geometry as if it were
the final box. The first solve therefore ran against a few pixels of pane. An
interrupted outgoing transition compounded it — the element stayed painted at
that sliver while `containedWidth/Height` were unchanged, so nothing detected a
size change and the incoming transition flew out of the speck.

**Fix — solve against the box the pane is heading toward.**

1. `resolveViewerPaneDestinationBox()` in `viewer-panel-layout.ts` turns the
   split's measured size plus the layout's decided allocation into the pane's
   destination box.
2. That resolved box is remembered in a module-scope memo in the same file,
   keyed `focus|split` and qualified by viewport. Module scope is required:
   `ViewerSplitPane` mounts inside a `DualSourceCrossfade` source, so a mode
   change creates a fresh instance and component-local state is empty on exactly
   the transitions that need it. The resolved _box_ is remembered rather than the
   stage and the allocation separately, because for the first frames of a mode
   change the allocation still describes the mode being left; recombining it with
   a settled stage yields a box the Card never occupies.
3. Only a layout that actually shows the Card may teach the memo
   (`splitConfig.leftPane/rightPane === "card"`). Tunnel focuses the same pane but
   keeps the dock open, so its stage is several hundred pixels narrower and would
   otherwise poison the focused entry.
4. The write is debounced 180 ms. The motion flag clears while the pane is still
   easing, so an undebounced write relearns a mid-animation size.
5. `choreo-card-sizing-state.svelte.ts` solves against that box whenever the pane
   is still opening, decided from **geometry** (container below 92 % of the
   destination) rather than from the motion flag alone — the incoming Card can
   mount a frame after the flag clears and still find a sliver. Host chrome is
   learned from settled frames as a clamped inset, for both the content box (the
   aspect-fit solve) and the container box (the grid pickers), so the column and
   start-placement choice is aimed at the destination too.
6. When a transition was interrupted and left the Card painted unreadably small,
   `data-contain-size-jump` suppresses the size transition for one DOM commit so
   the Card is _placed_ at its destination instead of flying to it. The decision
   reads `getBoundingClientRect`, not state, because painted size and state size
   diverge in exactly that case.
7. The un-released Card entry lease in `viewer-shell-layout-state.svelte.ts` was
   removed. With the destination box in hand there is no sliver for the picker to
   choose a wide, shallow grid from, and the lease pinned the Side-by-Side grid
   onto the focused Card for the whole visit.

**Measured on the real route** (`/sequence/EHWE`, warm entries, distinct painted
sizes counted per rAF from the click to settle):

| Viewport  | Tunnel -> Card      | Performances -> Card | 2D -> Card | Side by Side -> Card   |
| --------- | ------------------- | -------------------- | ---------- | ---------------------- |
| 375×667   | 1 frame @ 312×502   | 1 frame              | 1 frame    | 355×280 -> 312×502     |
| 960×412   | 1 frame @ 869×232   | 1 frame              | 1 frame    | 430×334 -> 869×232     |
| 820×1180  | 1 frame @ 694×1119  | 1 frame              | 1 frame    | 714×555 -> 694×1119    |
| 1440×900  | 1 frame @ 521×839   | 1 frame              | 1 frame    | 535×416 -> 521×839     |
| 1920×1080 | 1 frame @ 1176×915  | 1 frame              | 1 frame    | 633×1019 -> 1176×915   |
| 2560×1440 | 1 frame @ 1713×1332 | 1 frame              | 1 frame    | 856×1379 -> 1713×1332  |
| 3840×2160 | 1 frame @ 2699×2099 | 1 frame              | 1 frame    | 1303×2099 -> 2699×2099 |

"1 frame" means the first painted frame is already the settled size — the pane
opens around a Card that never changes size. Before the fix the same entries read
`29×68` and `19×53` growing across 8–9 frames.

Side by Side is deliberately different and is left animating. There the Card is
already mounted and readable at its real half-pane size, so its size change is a
true structural change with something to animate from, which
`no-layout-shift.md` requires be animated rather than snapped.

**Checks.** `tests/unit/sequence-viewer/viewer-panel-layout.test.ts`: 15 tests
pass, including five for `resolveViewerPaneDestinationBox` (focused pane, both
split directions, uneven allocation, collapsing pane, unmeasured split).
`svelte-check`: 0 errors, 0 warnings. No horizontal overflow at any of the seven
viewports.

### Gate 3 follow-up · 2026-09-03 (2D ⇄ Tunnel choreography)

Rapid reversals exposed two clocks where the transition should have had one. The
Tunnel reveal started before its asynchronous formation build was guaranteed to
exist, so completed copies could join an already-visible canvas in one frame.
The ordinary 2D grid also ran on the renderer's separate 250/200 ms visibility
fade while Tunnel layers used the viewer's 280 ms reveal. The grid, props, and
formation therefore looked like several effects triggered near each other rather
than one transformation.

The viewer now prepares Tunnel layers while 2D remains active. Readiness remains
an instrumented invariant rather than a prerequisite of the reveal tween: gating
the tween on the asynchronous flag created a circular handoff in which Tunnel
mode committed at zero reveal and the layer list could never become visible. The
same reversible progress drives every Tunnel copy and the 2D grid alpha. An
authored Tunnel grid stays visible; otherwise the 2D grid leaves as the copies
arrive. The existing renderer fade remains the default for every caller that does
not supply this viewer-owned opacity.

The Gate 3 trace now reads the painted boundary directly: layer readiness/count,
minimum and maximum layer alpha, and grid alpha. It grades reveal-before-ready
frames, late asynchronous layer arrivals, alpha discontinuities, duplicate
canvases, and the existing backing/identity invariants. The first trustworthy
1440 × 900 stress reversal measured:

| Measure                                |   Result |
| -------------------------------------- | -------: |
| Reveal before layers ready             | 0 frames |
| Late layer arrivals                    |        0 |
| Largest Tunnel-layer alpha step        |     0.04 |
| Largest grid alpha step                |     0.04 |
| Animator remounts / duplicate canvases |    0 / 0 |

The responsive replay completed at all seven contract viewports. Backgrounded
phone emulations produced coarse frame gaps, so alpha-step alarms are suppressed
when the trace itself reports a sample gap above 80 ms; readiness, late-arrival,
and singleton checks remain exact regardless of cadence. `svelte-check` reports
0 errors and 0 warnings. The sequence-viewer and animation-engine suites pass 61
files / 432 tests, including the new reversible grid-curve cases and orchestration
contract.

Follow-up review showed that continuity alone was not enough: seven prepared
layers were starting inside the first 24% of the reveal, and at 78% progress
their measured alpha occupied a narrow band. The copies therefore read as one
group pop even though the numbers were technically interpolating. The formation
now uses the canonical dramatic clock, spreads center-out starts across 62% of
that clock, and gives each layer smoothstep shoulders. The ordinary 2D grid
clears during the opening 38%, leaving the middle and outer performers room to
arrive as distinct overlapping waves. A new `Layer cascade spread` metric fails
traces whose moving layers never separate by at least 0.35 alpha. The seven-layer
unit sample measures more than 0.45 spread at the midpoint, remains monotonic
from center to edge, and reverses by retracing the same master progress.

#### Pixel correction · 2026-09-04

The alpha-only follow-up above did not prove that the canvas painted a
choreographed entrance. The production review fixture has one additional
performer pair, so its measured layer-to-layer spread is necessarily zero. More
importantly, the renderer did not begin generating that pair's prop sprites
until the visible additional-layer array became non-empty. A reveal clock could
therefore advance while there was nothing drawable, then display both completed
sprites together. The state trace passed a curve that the pixels never had the
resources to paint.

The animation engine now accepts a preparation-only additional-layer list. It
loads and reports those sprites while the visible list remains empty, and the
viewer waits for both prepared geometry and loaded sprites before moving the
reversible reveal away from zero. The instrument records requested and loaded
texture counts and fails any frame whose reveal precedes its drawable sprites.

Opacity is no longer asked to impersonate choreography. Each additional pair
starts transparent at the live red/blue pair, then peels through canvas space
into its authored Tunnel position while gaining opacity. The ordinary pair and
the copy therefore have a visible relationship even in the one-copy fixture.
Canvas-space interpolation avoids a direction flip when moving props straddle
the angular 180-degree seam. The same per-copy progress folds the pair back into
the live props on a rapid reversal. The phrase uses the canonical emphasis plus
normal clock (480 ms), with no feature-local duration or easing.

Pixel capture at 820 x 1180, with playback held, records the reveal at blends
`0.000`, `0.087`, `0.561`, `0.920`, `0.997`, and `1.000`: the purple/green pair
is tucked under the red/blue pair in the first frame, visibly separates in the
intermediate frames, and reaches the opposite formation edge at rest. The DOM
instrument records the same trip as `0.000 -> 2.000` grid-radius units over 30
painted frames in 500 ms. A 1440 x 900 rapid reversal reports:

| Measure                       | Result                             |
| ----------------------------- | ---------------------------------- |
| Reveal before textures        | 0 frames                           |
| Spatial peel during reversals | 20 frames                          |
| Largest layer alpha step      | 0.11                               |
| Largest grid alpha step       | 0.19                               |
| Blank frames                  | 0                                  |
| Mode path                     | 2D -> Tunnel -> 2D -> Tunnel -> 2D |

The settled Tunnel was visually checked with native emulation at 375 x 667,
960 x 412, 820 x 1180, 1440 x 900, 1920 x 1080, 2560 x 1440, and 3840 x 2160.
Every viewport reports zero horizontal overflow; the compact controls remain
present at 820 x 1180. The sequence-viewer and focused animation-engine checks
pass 30 files / 254 tests, and `svelte-check` reports 0 errors and 0 warnings.

#### Ensemble-arrival correction · 2026-09-04

Austen's visual review rejected the result above: the additional props still
arrived as a clump near the end instead of becoming legible throughout the
phrase. That judgment was correct. The previous trace proved that opacity state
changed, but it did not prove what the canvas painted. Its supposed pixel probe
queried `canvas[data-animation-layer="mandala"]`; the production Animator canvas
had no such marker, so the replay could fail its ready-canvas wait without
producing pixel evidence. The statement above that this fixture had one
additional pair is also superseded. The current review sequence prepares seven
additional layers.

The timing was mathematically backloaded. `ViewerMotionSurface` eased the master
clock with `cubicInOut`; `resolveTunnelLayerProgress` then eased each copy a
second time with smoothstep and distributed their starts across 62% of the same
clock. The grid completed its own departure inside the opening 38%. At the
phrase midpoint only four of seven layers reached 10% opacity, mean layer alpha
was 21%, and two layers had not started. The grid had already gone. The state
was continuous, but the composition withheld most of its information until the
last beat.

An 820 x 1180 source-buffer trace confirmed the perceptual failure. The primary
canvas still contained zero Tunnel-spectrum sample pixels at master progress
0.196. Its first substantial colored signal arrived around progress 0.563, then
rose to roughly 78% of the sampled peak by progress 0.899. This is the late pop
Austen described.

The corrected phrase has one ease and a small depth offset:

1. The shared 480 ms `Tween` uses the canonical `cubicOut` ease. Layer progress
   is linear within that already-eased clock, so there is no second easing
   shoulder.
2. Seven starts span 18% rather than 62%. The farthest copy crosses 10% opacity
   by master progress 0.262; at one quarter of elapsed time all seven copies are
   participating with at least 49% opacity and 53% mean opacity.
3. The ordinary 2D grid is the exact complement of the same eased clock. It
   remains present while the ensemble becomes legible, then yields as the
   formation takes ownership.
4. The Canvas2D owner marks its primary canvas as
   `data-animation-layer="props"`. During a trace, the harness arms a
   document-level capture that survives a `DualSourceCrossfade` canvas swap.
   The renderer records each additional prop only after its `drawImage`
   completes, including the host progress, count drawn, count at perceptible
   alpha, and mean painted alpha. It retains the bounded render-frame history
   so an outer review sampler starved by the browser cannot collapse the phrase
   to one apparent step. There are no telemetry writes during ordinary
   playback. The grade fails visibly as `Painted prop arrival: unavailable` if
   the renderer boundary cannot be read.

The new Gate 3 acceptance contract requires all layers to be perceptible by 35%
master progress and at least 35% mean layer opacity near halfway. At the renderer
boundary, every additional prop must be perceptible by 35% progress, mean
painted alpha must reach at least 15% by quarter progress and 35% by halfway,
and the reveal must contain at least four independently rendered growth frames.
Timing spread must remain between 0.08 and 0.28 so the copies retain depth
without becoming seven serial disclosures. Rapid reversal still retraces the
same per-layer progress and uses one opacity owner.

#### Formation-trail correction · 2026-09-04

The spatial peel made a second ownership error visible. Additional props now
travel from the live pair into their Tunnel formation, but the interpolated prop
coordinates were also sent to every trail recorder. The trail engines correctly
joined those samples, painting temporary source-to-target squiggles behind the
copies. Formation travel is stage composition, not authored choreography, so it
must remain visible without entering trail history.

Each additional layer now carries an explicit formation-transition marker and a
trail-capture suppression marker. `TrailCapturer`, the Canvas2D overlay, and the
WebGL2 overlay all enforce that boundary at capture time. Existing painted
overlay accumulators keep fading naturally; only the moving copy's live rings
are reset. When the copy settles, capture resumes from one fresh point at its
destination, so no connector can be drawn across the transition. The legacy
array renderer has no path-break marker and therefore clears only that copy's
buffer when suppression changes. The base red/blue pair remains unaffected.

Gate 3 now instruments the behavior at both ends of the contract:

- `Trail-safe formation` counts any frame in which a moving copy was not marked
  capture-suppressed.
- `Formation trail captures` counts points that actually entered an overlay ring
  while a layer reported formation travel. The counter is armed only by the
  review harness, so ordinary playback pays no telemetry-write cost.

At 820 × 1180 a direct production-frame probe caught the peel at blend `0.744`
with one moving layer and one suppressed layer. The full replay recorded 17
spatial-peel frames, zero unguarded frames, and zero formation captures. A rapid
reversal recorded 59 peel frames with the same two zeroes. The complete viewport
pass remained clean:

| Viewport    | Moving frames sampled | Unguarded frames | Formation captures | Horizontal overflow |
| ----------- | --------------------: | ---------------: | -----------------: | ------------------: |
| 375 × 667   |                    41 |                0 |                  0 |                  No |
| 960 × 412   |                    37 |                0 |                  0 |                  No |
| 820 × 1180  |                    57 |                0 |                  0 |                  No |
| 1440 × 900  |                    27 |                0 |                  0 |                  No |
| 1920 × 1080 |                    59 |                0 |                  0 |                  No |
| 2560 × 1440 |                    60 |                0 |                  0 |                  No |
| 3840 × 2160 |                    42 |                0 |                  0 |                  No |

Native WebP captures at all seven viewports show the settled props feeding clean
circular choreography trails with no connector left across the formation path.
Focused trail and Gate 3 checks pass 6 files / 89 tests. The broader
sequence-viewer and animation-engine run passes 351 tests across 45 files; its
sole failure is the pre-existing `ArtSettingsPanel` 500-line ownership cap,
which reproduces unchanged on `main` at 518 lines. `svelte-check` reports 0
errors and 0 warnings.

#### Formation choreography correction · 2026-09-04

The trail correction removed the connector artifact but left the underlying
motion intact: every additional performer still travelled from the live red / blue
pair into its authored Tunnel pose. With several copies moving and rotating at
once, the entrance read as a scramble even though the trail recorder was now
clean. This was the wrong visual premise. Tunnel is a presentation change, not
choreography performed by the props.

The corrected handoff does not run a second hidden canvas or a duplicate
playback loop. While 2D remains visible, `TunnelViewController` already computes
the lightweight formation sample at the live playhead and `AnimatorCanvas`
preloads the required prop textures without drawing the extra layers. Once that
preparation is ready, every copy is rendered immediately at its sampled Tunnel
pose. Only opacity changes, using the existing 480 ms reveal and its shallow 18%
center-out stagger. The ordinary effect map and trail capture remain live from
the first visible frame, so authored effects play normally from the destination
poses instead of being paused or faked during the handoff.

The previous `interpolateTunnelLayerProp` path and its viewer-owned formation
travel / trail-suppression flags are gone. The generic trail engine boundary is
retained for other composition changes, but Gate 3 no longer needs to invoke it.
The runtime instrument now compares each rendered left/right prop with the
prepared pose for the same layer and playhead. `Formation placement` fails on
any drift above 0.1% of a grid radius or on any drifting reveal frame; this
grades the visible behavior rather than trusting a declarative transition flag.

Before this correction, the 820 × 1180 replay measured a spatial peel reaching
200% of a grid radius over 17 frames, and rapid reversal extended that travel to
59 frames. After the correction, the full viewport sweep records zero formation
drift and zero moving layers while retaining a multi-frame opacity bloom:

| Viewport    | Maximum pose drift | Drifting frames | Layer-bloom frames | Horizontal overflow |
| ----------- | -----------------: | --------------: | -----------------: | ------------------: |
| 375 × 667   |               0.0% |               0 |                 24 |                  No |
| 960 × 412   |               0.0% |               0 |                 11 |                  No |
| 820 × 1180  |               0.0% |               0 |                  7 |                  No |
| 1440 × 900  |               0.0% |               0 |                 13 |                  No |
| 1920 × 1080 |               0.0% |               0 |                 12 |                  No |
| 2560 × 1440 |               0.0% |               0 |                 15 |                  No |
| 3840 × 2160 |               0.0% |               0 |                 18 |                  No |

The 1920 × 1080 stress reversal records the direct
`animation -> tunnel -> animation -> tunnel -> animation` path, 28 bloom
frames, zero moving layers, zero suppressed layers, zero formation trail
captures, and zero pose drift. Mid-transition WebP captures at all seven
viewports show the active Trails effect painting from the already-placed props;
there is no source-to-target line because there is no source-to-target travel.
The reveal, geometry-trace, and orchestration contract checks pass 58 tests.
The broader sequence-viewer run passes 244 of 245 tests; its only failure is the
unchanged `TunnelArtSettings` 500-line ownership cap (518 lines by the test's
newline count on both this branch and `main`). `svelte-check` reports 0 errors
and 0 warnings, and the seven-viewport browser pass produced no console warnings
or errors.

#### Shared Animator presentation ownership · 2026-09-04

2D and Tunnel are now two compositions of one persistent Animator canvas, so a
visibility control cannot honestly belong to either mode. The Grid buttons had
violated that rule: 2D wrote the persisted `AnimationVisibilityStateManager`,
while Tunnel wrote `TunnelViewController.gridVisible`. The two controls could
therefore disagree even though they affected the same rendered layer.

The viewer now supplies its animation visibility manager to the Tunnel
controller. `gridVisible` delegates to that owner and observes changes coming
from the 2D Display panel, making the relationship bidirectional without a
mode-switch copy step. Embedded Tunnel Creator sessions retain the same
behavior through their scoped visibility manager; standalone poster/detail
previews, which intentionally have no surrounding animation scope, keep their
snapshot-local fallback. Loading an older saved Tunnel stages its grid choice
through the shared visibility owner, preserving the saved appearance while
making the next 2D/Tunnel switch coherent.

Effects required no new synchronization mechanism. The orchestrator already
creates one `EffectsConfigState`, both the 2D and Tunnel settings panels edit
that instance, and the persistent Animator canvas reads it. The same ownership
rule applies to effort, path policy, prop choice, tempo, playback mode, and the
playhead. Formation, fold/mirror/flip/echo, copy stagger and speed, Tunnel copy
coloring, and performer selection remain Tunnel-authored state because they do
not describe the base Animator canvas.

The bidirectional grid-owner and saved-Tunnel staging checks pass alongside the
Tunnel snapshot and both viewer URL-slice suites: 5 files / 42 tests.
`svelte-check` reports 0 errors and 0 warnings. The broader sequence-viewer run
passes 40 of 41 files / 370 of 371 tests; its only failure is the same unchanged
`TunnelArtSettings` 500-line ownership cap described above, reproduced on
`main` at 518 lines.

#### Shared Animator inspector shell · 2026-09-04

The shared state described above still arrived through two visibly different
inspectors. 2D Animation owned its rail, section transition, scroll frame, and
bright export footer in `AnimationPanel`; Tunnel duplicated those boundaries in
`TunnelArtSettings`, added a separate heading band, ordered the same concepts
differently, and finished with a subdued bordered export action. Switching the
canvas therefore looked like entering another product even when the selected
effect and visibility values were already the same objects.

Both desktop modes now compose `AnimatorInspectorShell` and
`AnimatorInspectorFooter`. The shell is the single owner of rail geometry,
section fly/fade, body scrolling, headings, wide-container behavior, and the
footer slot. The footer is the single owner of action height, accent fill,
progress, readiness, cancellation, and estimate placement; only the action
label and icon differ (`Export Animation` versus `Export Video`). Tunnel's
former title band is gone.

The common rail leads with the same four pages in the same order:
**Effects, Props, Motion, Display**. Tunnel's color policy lives on Formation
(see the anatomy follow-up below), and its desktop Motion
page combines Effort and Playback exactly as 2D does. Formation and Copy Speed
follow as Tunnel-only pages; Export remains 2D-only because Tunnel exports from
the persistent footer. The substantial Tunnel Motion and Display bodies live in
their own presentation owners, bringing the Tunnel coordinator below its
500-line architecture ceiling instead of weakening that guard.

`ViewerAnimatorInspectorState` lives above both persistent inspector layers.
Selecting a common page in either mode keeps that page open in the other. A
mode-only page remains selected for its owning mode; the other mode temporarily
shows the last common page and returning restores the mode-only page. Existing
setting owners remain unchanged: an interactive browser pass toggled Grid off
in Tunnel and read it back off on 2D Display, then selected Fire in 2D and read
Tunnel's Fire controls on the same Effects page.

Production-route WebP captures at 375 x 667, 960 x 412, 820 x 1180,
1440 x 900, 1920 x 1080, 2560 x 1440, and 3840 x 2160 show the compact bottom
dock at phone/short-landscape layouts and the same persistent inspector shell
at desktop layouts, with no visible clipping or horizontal overflow. At
1440 x 900 the 2D and Tunnel footers have identical geometry and accent styling;
the export actions use the shared footer. Artifacts are retained under
`artifacts/unified-animator-inspector/` in the local main workspace.

The sequence-viewer regression run passes 31 files / 258 tests, including the
new shared-section state and ownership contracts, and `svelte-check` reports
0 errors and 0 warnings.

#### Effects anatomy follow-up · 2026-09-05

The shared inspector shell still composed different Effects pages. Tunnel added
an outer padding wrapper and a Colors prelude; the shorter 2D body centered
vertically while Tunnel aligned at the top. A scrollbar changed the available
width, and only 2D reserved a footer estimate line. The section rail also centered
five buttons in 2D and six in Tunnel, shifting the common controls by 32 px.

Both modes now render the same `EffectsPanel` without a Tunnel padding wrapper,
align Effects at the top, reserve a stable scrollbar gutter, and reserve the
same footer metadata line. The shared shell anchors its rail at the top, keeping
Effects, Props, Motion, and Display in fixed slots when mode-only pages change.
Tunnel color controls retain their existing controller and telemetry and now
live under Formation, where they describe generated copies.

At 1440 × 900, measured Effects selectors begin at y=154.2 in both modes, the
tuning card at y=376.8, the reset section at y=712.2, and the footer at y=802.3
with height 97.7. The four common rail buttons start at y=62.7, 126.7, 190.7,
and 254.7. The common content differs by less than one pixel horizontally due
to fractional panel allocation. Switching keeps Effects selected.

Direct WebP/70 browser inspection covered 375 × 667, 960 × 412, 820 × 1180,
1440 × 900, 1920 × 1080, 2560 × 1440, and 3840 × 2160. Compact layouts retain
their scrollable Effects tray; desktop layouts retain the same grid, tuning,
reset, and footer composition. Both desktop mode endpoints and the intervening
switch were exercised. Formation was opened to verify the color controls remain
available. The sequence-viewer suite passes 30 files / 253 tests; Svelte check
reports zero errors and zero warnings.

## Gate 6 baseline · 2026-09-01

Measured on the integrated `main` checkout through the production iframe of
`/test/sequence-viewer-transitions` at the review page's 1440×900 frame, with
Post Studio reached through the production rail. The shell mounts
`PostStudioPane` inside an `{#if layout.showPostStudio}` branch that replaces
the motion/Performance `DualSourceCrossfade` block, and the layout state closes
any open inspector on the same commit.

- **Surface identity breaks in both directions.** The motion stage element
  (`[data-persistent-motion-stage]`) is destroyed when the studio opens and a
  new instance is mounted on return; the studio pane is created on every entry.
  The 2D canvas count inside the stage container fell to zero on the return
  leg before the Animator re-created its canvases.
- **The studio pops instead of arriving.** While the inspector track animated
  closed (motion stage width `692 → 1062 → 1260 px`), the studio pane sat at
  `x = 1440 px, width 0` for roughly 0.7 s, then appeared at its full
  `1260 × 847 px` box in one frame. There is no crossfade, no shared clock, and
  no readiness gate; the card preview and additional preview canvases start
  rendering after the studio is already visible.
- **Structure.** Inside the viewer body the studio composes its own action bar,
  a canvas panel (`614 px` wide at 1440), a `646 px` inspector rail, and a
  timeline dock, in a `data-mobile-panel` compact layout below its own
  breakpoint. It is a whole-body workspace with its own inspector, not a stage
  source with shell-owned inspector contents.
- **Mobile ingress is unverified.** At the review page's 375×667 frame the
  bottom-bar switcher listed Side by Side, 2D, Card, Performances, and Tunnel
  and no Post Studio entry, although `ViewerModeBottomBar` filters through the
  same `canAccessPostStudio()` gate as the rail. Whether this is the feature
  flag service overwriting the local role override after Firestore load or a
  compact-layout omission must be confirmed with a real early-access grant
  before the Gate 6 contract is approved.
- Sampling ran in a background DevTools page, so frame timing is directional
  (roughly 4 to 15 samples per second); identity and geometry findings do not
  depend on the frame rate.

Baseline grade stays **D**: remount on both legs, a zero-width destination
followed by a one-frame pop, no reduced-motion path of its own, and no
instrumentation.

## Gate 6 contract · recommended, awaiting approval

Post Studio enters as an intentional whole-workspace change, as the review map
already describes. The recommended contract keeps the studio's own composition
and gives it the same persistence and clock discipline as Performances,
without adding a second motion system.

1. **One persistent studio layer.** `PostStudioPane` mounts on first entry and
   stays mounted through the session, using the existing `createPaneKeepAlive`
   owner (`pane-keep-alive.svelte.ts`) so the rendered card preview, timeline,
   and selected layer survive a round trip. The motion/Performance crossfade
   block is never unmounted; it becomes the first source of an outer
   `DualSourceCrossfade` whose second source is the studio layer. Nesting the
   existing primitive is the extension; a third-source variant is not
   introduced unless the nested form measurably fails.
2. **One clock.** The inspector track closing and the outer crossfade run on
   the canonical emphasis duration from the same mode commit. The studio does
   not reserve width at `0 px`; it occupies the full stage box from its first
   visible frame while the inspector releases its allocation.
3. **Readiness.** The studio counts as visually ready when its section and
   action bar have painted, mirroring the Gate 5 poster rule. The transition
   never waits for the card preview or an animation preview to render.
4. **Inert inactive layers.** While the studio owns the workspace the motion
   stage receives paused playback and the Performance player is released; while
   the motion stage owns it the studio's preview playback is paused and its
   export state is preserved but idle.
5. **Reduced motion** commits final geometry immediately and lets the existing
   named viewer snapshot dissolve carry the change; nothing waits inside the
   View Transition update callback.
6. **Mobile.** Post Studio remains reachable from the bottom-bar switcher for
   any user who has access, and its compact `data-mobile-panel` layout stacks
   inside the same bounded stage box the shell already provides.
7. **Instrumentation** extends `transition-geometry-trace.ts` with
   `post-studio-2d`, `post-studio-3d`, and `post-studio-interrupt` commands and
   `stage-to-studio` / `studio-to-stage` / `interrupt-studio` phases, sampling
   studio and motion identity, complementary opacity, layer box equality,
   inspector allocation travel, canvas count continuity, and readiness. The
   review map marks Gate 6 `ready` only when those replays exist.

Acceptance requires zero remount, blank, double-opaque, zero-width-destination,
unready, backtrack, or overshoot frames across 2D, ready 3D, rapid reversal,
reduced motion, and all seven required viewports, plus a confirmed mobile
ingress.

## Approval ledger

| Gate                           | Status            | Approved by | Approved at          | Notes                                                                                |
| ------------------------------ | ----------------- | ----------- | -------------------- | ------------------------------------------------------------------------------------ |
| 1. Side by Side ⇄ 2D / Card    | Approved          | Austen      | 2026-08-29 09:57 CDT | Approved after full/reduced, mobile-to-4K, and transformed-cell QA                   |
| 2. 2D ⇄ 3D                     | Approved          | Austen      | 2026-08-30 16:27 CDT | Approved after shared-clock crossfade and canvas-settle QA                           |
| 3. 2D / 3D ⇄ Tunnel            | Ready for review  |             |                      | Single-owner fade; 3D, reversal, reduced, mobile-to-4K green                         |
| 4. Card ⇄ left-side modes      | Approved          | Austen      | 2026-09-01           | Direct paths; persistent surfaces; mobile-to-4K geometry green                       |
| 5. Viewer stage ⇄ Performances | Ready for review  |             |                      | Seam travel added 2026-09-01 after review; 2D/3D/reversal/reduced/mobile-to-4K green |
| 6. Viewer stage ⇄ Post Studio  | Contract proposed |             |                      | Baseline D measured 2026-09-01; recommended contract awaits Austen                   |
| 7. Export inspector            | Pending           |             |                      |                                                                                      |
| 8. Practice                    | Pending           |             |                      |                                                                                      |
| 9. Mode switchers              | Pending           |             |                      |                                                                                      |
