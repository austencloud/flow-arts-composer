# Construct performance, pass 3

The carousel now mounts the selected letter group first. Hidden groups mount
one at a time after paint opportunities, using the existing background scheduler.
All four outer slide boxes stay present, preserving Embla's dimensions and loop.
Mounted groups remain alive, so later option changes retain their transitions.

The alpha starting position previously mounted 36 pictographs before showing the
first usable option. It now mounts 16, deferring 20 hidden pictographs and their
1,386 SVG descendant nodes. An early drag or direct type selection prepares all
groups immediately, including intermediate slides on a direct jump's path.

## Measurements

Three sequential warmed runs per condition, one isolated Chrome page, no other
page navigations during timing. Both viewports used 1x device scale and no CPU
throttling. Timing starts at selecting alpha and ends at the first option with
an SVG, visible ancestors, nonzero size, and a successful center hit test.

| Viewport                    | Before median | Final median |             Difference |
| --------------------------- | ------------: | -----------: | ---------------------: |
| Desktop, 1280 x 900         |        727 ms |       651 ms |  76 ms / 10.5% shorter |
| Mobile emulation, 390 x 844 |        791 ms |       594 ms | 197 ms / 24.9% shorter |

These are development-server interaction measurements, not production startup
benchmarks. The first after-change series measured 634 ms and 607 ms respectively;
the final series includes navigation preparation and profiler instrumentation.
Both series and every individual run are retained in the evidence file. Shared
machine load, warming and run order limit causal precision.

In a restored Types 4-6 selection, the first observed frame contained only its
four pictographs at 556 ms. The other groups appeared at 631, 704 and 748 ms.
The user could see the selected group while the remainder was prepared.

The existing workspace resizing transition still accounts for roughly 450 ms.
Its measurement gate remains intact so options do not change size under the
pointer. This pass does not reduce repeated updates once all groups are mounted.

## Verification

- Direct Chrome interaction and screenshot inspection at desktop and mobile sizes.
- Immediate Type 1 to Type 3 jump before warming: started with 16 mounted cards,
  target SVG present at 114 ms, zero sampled frames with an exposed empty panel.
- An early synthetic mouse drag through Embla's input handlers reached Type 2;
  frame sampling during and after the drag found no exposed empty panels.
  Physical-device touch latency was not measured.
- Reload restored Type 2; an explicit restored Types 4-6 run mounted that group
  first. Next wrapped 3 to 0 and Previous wrapped 0 to 3.
- Quick Undo returned to three start choices with no option cards left behind.
  Its exit transition let warming complete before teardown; this is not evidence
  of the cancellation branch executing. Cleanup guards queued work in the code.
- Added A successfully, switched All to Continuous and back, and changed turns.
  Every mounted group's markup refreshed; counts remained 16, 8, 8 and 4.
- No browser console errors in the focused verification session.
- Existing letter-type navigation and container-settling suites: 16 tests passed.
- After merging current main, a desktop smoke run still revealed 16 cards first
  at 658 ms; the complete grid was visually inspected again. Main's new optional
  grid rotation props retain their existing defaults on this route.
- The guarded local integration command owns the final Svelte/type check.

## Diagnostics and ownership

With `?profile=1`, `window.__tkaBootProfile.report()` includes the
`construct:carousel-mount` span through completion or teardown, plus the
`construct:carousel-yielded` milestone after the first two animation frames.
That milestone indicates a paint opportunity, not proof that every SVG is ready.
Use the hit-test probe and screenshots for visible readiness.

Scheduling composes the existing
`shared/foundation/utils/background-scheduling.ts` owner. The carousel component
owns its mounted-panel state and cancels animation frames/listeners on teardown;
background callbacks check cancellation before changing state. No shared
carousel geometry or scheduler API changed.

Evidence: [numeric results](2026-09-08-construct-pass-3-evidence.json) and
[repeatable interaction probe](2026-09-08-construct-pass-3-probe.js).
