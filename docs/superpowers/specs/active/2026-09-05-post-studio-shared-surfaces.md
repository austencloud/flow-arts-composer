# Sequence Viewer ↔ Post Studio: live surface continuity

## Ownership

The viewer owns one mounted AnimatorCanvas and one AnimationPanel. Post Studio
borrows those instances rather than mounting matching copies. The existing
mounted-node action carries each live surface above its clipping hosts using
the canonical layout-motion clock, follows its moving destination, and docks
it when the flight ends. Reversals capture the current painted rectangle and
invalidate the previous completion callback. Reduced motion reparents directly.

The context is viewer-local, never a module-global renderer registry. A Studio
animation slot supplies frames calculated by its existing sequence orchestrator.
The viewer playback clock pauses while the composition clock owns the renderer;
entry adopts the viewer position/tempo/play state, and exit adopts Studio's
position/play state. Scrubbing and the existing frame-by-frame exporter therefore
drive the same canvas. Export is unavailable during the canvas flight.

The inspector preserves its selected section and shared settings. Studio supplies
its playback/tempo/prop callbacks and hides the viewer-only export action. A
parked inspector cannot retain a mobile ControlDock tray that suppresses the
mode bar. Card/art source selections still use their existing inspectors.

One physical canvas cannot appear in two simultaneous slots: the first animation
slot borrows it; additional slots and standalone Studio retain their existing
renderer. This is intentional, not a second always-running preview.

## Regression instrumentation

Workspace replays now record the actual shared canvas and inspector identities,
plus whether each has reached its Studio destination. Zero measured identities
does not pass. The development-only review fixture exposes the Studio mode
without changing production access checks.

## Evidence

- Direct browser equality checks confirmed the same canvas and inspector in both
  directions; Props remained selected on entry and return.
- A paused Studio seek to step 1 produced canvas position 1 and returned to 2D
  paused at position 1. Playing samples matched the composition position exactly.
- A playing Studio return stayed playing in 2D: position advanced from
  2.63676 to 3.17352 during the post-return sample. Studio pauses its outgoing
  clock only after the viewer has adopted that playback state.
- Reduced-motion browser verification retained both instances with no handoff
  overlays. The focused suite passed 84 tests across 11 files; Svelte check
  reported zero errors and zero warnings.
- Five alternating mode selections 90 ms apart retained both instances and left
  zero body-level handoff overlays after settling.
- Live inspection caught and corrected two ownership defects: the canvas needed
  to own its height after leaving the split pane; action cleanup must not restore
  an already-detached node and resurrect a dead canvas over the live one.
- Targeted tests cover single-slot ownership, viewer isolation, stale cleanup,
  interrupted reparenting, reduced motion, and detached-node cleanup. Existing
  composition timing and export-compositor tests remain in the verification set.
- A real 6.4-second MP4 render completed and exposed Download MP4. During export,
  both composition and shared canvas reported position 3.6866666666666665; after
  completion both returned to the previous position 6.113799999999997.
- Selecting the card opened its existing settings while the shared inspector
  returned to its parked host; the animation canvas remained in the phone.
- Responsive passes exercised 375×667, 960×412, 820×1180, 1440×900,
  1920×1080, 2560×1440, and 3840×2160. Measured entries retained the same canvas
  and inspector and introduced no document horizontal overflow. The compact
  action bar now uses labelled menu triggers and drops redundant position words
  before the source labels can overlap; its sound button has a loaded icon.

Visual inspection uses the real shared shell in the deterministic transition
fixture, not a mocked phone or a screenshot replacement. Native browser captures
are used because raw CDP screenshots on this Windows host mis-scale emulated
viewports. The shipping route remains `/sequence/EHWE`.

## Follow-up: coordinate the surrounding controls

The first implementation preserved the canvas but changed its surroundings:
the outer inspector closed while Studio's inner inspector opened, the rail was
top-aligned by Studio overrides, and Studio mounted another Card and transport.
The replacement keeps the desktop inspector in the same outer track and loans
the existing Card and UnifiedTimeline through the viewer-local surface owner.
Only Studio-specific controls arrive with the phone chrome. The old export action
becomes inert and invisible without removing its allocated footer space.

At 1440×900, the inspector, rail, and editor now retain their exact rectangles
in both modes; the editor keeps its 749.7px scroll height. At 1920×1080 and
2560×1440 the same equality checks passed for all six measured identities:
canvas, Card, playback transport, inspector, rail, and editor. Returns restored
the original hosts with no body-level handoff overlays left behind.

Measuring the actual canvas (not its wrapper) caught an extra 60.7px height
jump when its playback bar left. The mounted-node action now supports capturing
the visual child before sibling layout changes. The corrected first painted
frame at 1440×900 stays 692×786.7, then flies to 367.3×366.2 in the phone.
The regression trace records per-surface position backtracking and size reversal,
split by transition direction so a legitimate round trip is not called a wobble.

Compact Studio keeps Canvas/Edit/Timing navigation instead of squeezing a phone
beside a full inspector. An 820px pass caught that incorrect desktop allocation;
the stationary inspector now uses Studio's existing 70rem compact boundary.
Direct checks at 375×667, 960×412, and 820×1180 found the shared inspector
accessible from Edit, and the same transport node moving between Canvas and
Timing. Wide-layout inspection also covered 1440×900, 1920×1080, 2560×1440,
and 3840×2160. At 4K the phone, inspector, and transport fit the measured viewport;
native capture on this Windows host still crops/scales the emulated screenshot.

Five alternating selections 90ms apart retained the same canvas, Card, transport,
and inspector, with zero leftover flight overlays and no document overflow.
The compact playback menu also exposes Studio's Advanced timing action.

Focused ownership/motion tests pass (12 tests), as does Svelte check (zero errors
and warnings). The wider composition suite was initially blocked by a missing
local `zod` package; after shared dependencies became available again it passed
all 59 tests across eight files. Preview delivery uses the task's port 5428 until
guarded integration succeeds.

## Playback continuity follow-up · 2026-09-08

The perceived replacement was measurable without a remount: the wide 2D bar
and narrow Studio bar selected different responsive controls and heights. The
viewer now keeps one compact UnifiedTimeline presentation, including the same
play button, scrubber, and menu button. Tempo and advanced timing remain in its
existing menu. The review trace now tracks scrubber and play-button identities,
not just their wrapper.

Control-row flights resize their layout rather than scaling their buttons. A
stationary flight remains above the entering host's fade. The return also uses
the canvas's stationary home allocation: measuring the flying canvas itself
previously sent the bar toward a 368px phone-sized box before docking at 1260px.
The corrected return grows through 700, 711, 760, 952, 1172, and 1238px toward
1260px, with 44px play-button dimensions throughout. Live underlying endpoint
sizes allow the surrounding panel to finish opening during the flight.

Browser checks covered all seven viewport tiers; the final return-anchor change
was rechecked at desktop, tablet, and phone sizes. Wrapper, timeline, scrubber,
play button, and menu button retained identity. Six selections 110ms apart left
the same scrubber and no flight overlay. Reduced motion skipped the flight.
Keyboard scrubbing in Studio reached step 8 and preserved that pose on return
to 2D. Normalized timeline percentages differ because Studio maps composition
time, not sequence progress. As in the original verification, the 4K geometry
was measured, but the host's screenshot capture crops/scales that viewport.

## Canvas sharpness and scrubber stacking follow-up · 2026-09-08

Two defects were reproduced on the integrated viewer. On Studio return, the
canvas covered the scrubber for ten sampled frames between 65 and 331ms. Both
flights used the same stacking level, and the controls could dock beneath the
still-flying artwork. Repeated Card/Studio switches also left a 41px canvas
bitmap stretched across roughly 489×487 logical pixels. The resize owner had
sampled a transformed rectangle; completing that transform produces no
ResizeObserver notification to repair the backing store.

Control flights now have their own layer above artwork and wait for the canvas
to dock. The dependency uses the canvas-only moving flag, so the transport cannot
wait on itself. CanvasResizer measures untransformed client dimensions and
retains its allocation while parked at zero size. No canvas or timeline clone
was introduced.

Three repeated Card/Studio pairs followed by Studio-to-2D were measured at each
affected layout. All retained the same canvas and transport nodes, with zero
leftover flight overlays. Raster density is backing pixels divided by logical
canvas size and device pixel ratio.

| Viewport | Studio raster density, all three visits | Canvas covering scrubber on return |
| -------- | --------------------------------------- | ---------------------------------- |
| 1440×900 | 1.00×                                   | 0 of 52 sampled frames             |
| 820×1180 | 1.00×                                   | 0 of 39 sampled frames             |
| 375×667  | 1.00×                                   | 0 of 43 sampled frames             |

Direct screenshots show sharp grid points and props inside the phone. Seven
selections 110ms apart retained both nodes and left no flight overlays. That
interrupted pass retained an oversized 2.07× raster, rather than degrading it;
ordinary settled passes use 1.00×. Reduced motion also retained both nodes,
reported 1.00× density, and recorded zero covered frames.

The review trace now exposes canvas-over-scrubber frame counts and final raster
density. Mode assertions reject replays that did not actually change modes;
mobile selection uses aria-current rather than desktop aria-pressed. Focused
tests cover transformed sizing, zero-size parking, dependent docking and reversal,
and the canvas-only moving state: 15 tests pass. Svelte check reports zero errors
and warnings.

## Card / Studio sidebar continuity · 2026-09-09

The animation-half sidebar disappeared in one frame on Studio-to-Card: its
effective opacity fell from 1 to 0 while the outgoing Studio wrapper was still
fully visible. Reparenting had moved the controls into the hidden motion layer,
leaving an empty wrapper to fade. The Card half also mounted a second settings
panel instead of retaining the shell's existing Card controls.

Desktop now keeps both settings panels in their original shell layers. Studio
publishes the selected source kind through the viewer-local surface owner, which
retains it across visits. Animation selection crossfades motion and Card settings;
Card selection keeps the same controls visible throughout. Other source kinds
retain Studio's inspector. Compact and standalone Studio keep their existing Edit
presentation. The Card artwork and its approved animation were not changed.

The motion settings width rule now targets its actual origin wrapper, with right
alignment during the outer track resize. Measured motion-control sideways travel
was 0px at 1440×900, 1920×1080, 2560×1440 and 3840×2160. The respective outgoing
fades contained 5, 3, 3 and 4 intermediate-opacity frames instead of a one-frame
disappearance. With the Card half selected, Card settings opacity stayed at 1 and
the DOM identity was retained. Both selections survived round trips at all seven
viewport tiers, including 375×667, 960×412 and 820×1180. Compact Card settings may
remount in the Edit view; desktop identity guarantees do not claim otherwise.

Screenshots were inspected at all tiers, although this Windows host still
crops/scales its 4K capture; the 4K position and identity results are DOM measures.
Reduced motion retained both desktop settings nodes and the selected half without
flight overlays. Focused surface/reparenting tests pass (13 tests), and Svelte
check reports zero errors and warnings.

Gate 6 now includes separate top-selected and bottom-selected Card/Studio replays.
Its trace reports the selected half, live Card-settings identities, and sampled
motion-settings fade frames so the two cases can be reviewed independently.

### Dissolve pacing correction · 2026-09-09

The first sidebar fix retained the controls but kept the 150ms, front-loaded
button-feedback easing. That was technically a fade, yet visually too close to
a pop. A busy Card return also skipped middle rAF samples, so counting fade
frames alone was not sufficient evidence of a readable handoff.

Motion and Card settings now use the shared 350ms duration with ease-in-out,
and their persistent layers advertise opacity compositing before the switch.
The live preview's Studio entry passed through 12%, 21%, 33%, 46%, 57%, 67%,
74%, 80%, 85% and 89% opacity over roughly 150ms of its middle range. The
return also retained intermediate opacity instead of immediately hiding the
outgoing controls. These are measured CSS samples, not a claim of fixed frame
rate while the Card recomposes. Visibility waits for the full dissolve; reduced
motion clears both duration and delay. No geometry or artwork motion changed.

### Reflow on return to the phone · 2026-09-09

The shared Card could land in a 366×287 phone slot while its Auto grid picker
still read a 760×847 focused-view destination. Clearing the viewer destination
did not clear the sizing state's separate container override. This kept the
portrait grid even though the outer Card already fit the phone.

When both the destination and its motion phase are released, the sizing owner
now returns the grid picker to live container measurements. A collapsing viewer
pane still holds its destination during motion. No column count is forced and
the existing Card flight/reflow animation is unchanged.

Two regression cases failed before the fix with 760×847 instead of 366×287:
direct release into Studio and release after a collapsing pane. Both now pass,
including subsequent live resizing and reuse of a new viewer destination. All
six focused sizing tests pass. Three browser round trips at 1440×900 retained
the same Card node: focused mode chose 3×4, and the phone consistently returned
to 4×3 with a 344×287 Card in its 367×287 slot.
