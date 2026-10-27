# Boot Overture: the loading screen traces a real mandala

Status: concept APPROVED by Austen on 2026-10-26 from the live mockup
(`.superpowers/brainstorm/boot-mockups/overture.html`, served on port 5360).
This spec is the build contract. Implementation is dispatched to an Opus
session; Fable owns the spec and the review.

Related: [self-timing bar](2026-10-14-boot-bar-self-timing.md),
[composed reveal](2026-10-15-boot-composed-reveal.md),
[compositor fill](2026-10-14-boot-bar-compositor-fill.md).

## What we're building

Today the boot screen (`#app-loading` in `src/app.html`) is a sky gradient
with one capsule: a self-timing fill and the words "Opening Flow Arts
Composer". It is honest and quiet, and it shows nothing of what the app is.

The Overture draws the app's own art while the app loads. A mandala, the
four prop-tip trajectories of a real TKA sequence, is traced live on a canvas
above the capsule, and the tracing *is* the progress: at 40 % loaded, 40 % of
each path is drawn, with a hot bright head and sparks at the four tips. The
sequence's letters appear one beat at a time under the mandala in the TKA
glyph font. When the app is composed, the heads flare, the finished mandala
breathes once, and the boot layer flies through the viewer (scale up and
fade) as the app arrives beneath it.

On a warm boot it traces the sequence the user was working on. On a cold
boot it traces one of a small authored pool (the demo word, CAPs, Zan's
Diamond). It never delays the app, never holds the screen, and degrades to
today's capsule wherever it cannot run.

## Why this shape

- The boot main thread is blocked for long stretches (script evaluation,
  hydration). Only the compositor, a `<video>`, or a Web Worker can animate
  through that. The mandala pipeline is already pure and worker-ready
  (`mandala-export.worker.ts` renders the whole thing in a worker), so a
  worker with an `OffscreenCanvas` is the one mechanism that gives us live
  drawing without touching boot time.
- Progress already exists as a model: the self-timing engine
  (`self-timing-bar.engine.js`) predicts where the boot is from the last
  boot's profile. The worker runs its own copy of the engine with the same
  profile and the same milestones relayed, so the drawing never stalls when
  the main thread does.
- The mockup proved the look with the real geometry (the paths were pulled
  from the live calculator). Nothing in this spec invents a visual the
  mockup did not show, except the light-surface palette and the
  reduced-motion variant, which follow the app's existing rules.

## Hard constraints (unchanged from today)

1. The capsule stays the cross-document morph target (`composer-cta` view
   transition name, `tka-handoff` type). The pressed Composer button lands on
   the capsule. The Overture draws in a separate layer and never replaces or
   re-parents `#boot-capsule`.
2. `<link rel="expect" href="#boot-capsule" blocking="render">` stays. The
   canvas must not become render-blocking.
3. `ready` always lets the screen go; `composed` is reported by the holds.
   The Overture registers no hold and cannot postpone `__tkaFinishBoot`.
4. Landing routes and the retro routes (`/1989`, `/1995`, `/1998`, `/2003`)
   hide the boot screen today and keep doing so; no Overture there.
5. The capsule label and its two strings, the German translation, the
   progressbar ARIA on `#app-loading`, and the `tka-boot-profile` learning
   all stay as they are.
6. Main-thread cost of the Overture during boot: at most about 2 ms in total
   (create the worker, transfer the canvas, post a handful of messages).

## Architecture

```
app.html (inline, before any bundle)
  #app-loading
    <canvas id="boot-overture" aria-hidden="true">   worker-owned, OffscreenCanvas
    #boot-capsule (as today, moved low)
  inline overture script
    reads tka-overture snapshot (localStorage) or chooses a pool entry
    new Worker(<url substituted by the server>), transfers the canvas
    forwards each __tkaBootMilestone(name) and finish as messages

overture.worker.ts (own small bundle, no calculator)
    own self-timing engine instance (same profile, ranks, origin)
    frame loop: trace paths to the pace at now → glow, crisp, head, sparks
    letters drawn with the TKA font via FontFace, or omitted
    finish: flare + fly-through, then stops

app side (after ready)
    overture-snapshot.ts writes tka-overture from the user's sequence
    scripts/build-overture-pool.mjs builds static/boot/overture-pool.json
```

### Files

New, all under `src/lib/shared/loading/overture/` unless noted:

| Path | Role |
| --- | --- |
| `overture-trace.ts` | Pure drawing math and frame composition against a minimal 2D-context interface: `pointAt(polyline, t)`, cumulative lengths, `composeFrame(ctx, scene, p, now)`. No DOM, no worker globals. Unit tested. |
| `overture-snapshot.ts` | `OvertureSnapshot` type, `compactPaths(MandalaPaths, beats)`, `writeOvertureSnapshot(sequence)`, `readOvertureSnapshot()`. localStorage key `tka-overture`, version 1. |
| `overture-pace.ts` | The trace's pace (see Progress): a steady speed aimed at the learned boot length, nudged by milestones. Pure, unit tested. |
| `overture-budget.ts` | What the Overture may spend (see Performance budgets): the tier decision, the low tier's frame cap and backing size, and the fetch policy for the pool and the font. Pure, unit tested. |
| `overture.worker.ts` | The boot worker. Imports `overture-pace.ts` and `overture-trace.ts`. Owns the `OffscreenCanvas`, the frame loop, the font, the finish choreography. |
| `overture-boot.js` | Classic inline script for `app.html` (same pattern as the engine: written once, inlined by the server at a placeholder). Picks the scene, starts the worker, relays milestones. Keep it under 3 KB. |
| `src/lib/server/performance/overture-inline.ts` | Mirrors `self-timing-bar-inline.ts`: replaces `<!-- tka-overture -->` with the inline script and the worker URL (from `overture.worker.ts?worker&url`, the pattern `mandala-video-exporter.ts` already uses) and the pool URL. Called from `hooks.server.ts` `transformPageChunk` next to `inlineSelfTimingBar`. |
| `scripts/build-overture-pool.mjs` | Builds `static/boot/overture-pool.json` from authored sequences through the real geometry calculator. Run by hand; the output is checked in. |
| `static/boot/overture-pool.json` | The cold-boot pool, about 10 entries, compacted. |
| `src/routes/test/boot-overture/+page.svelte` | The lab route (see below), following the `src/routes/test/_lab-kit` conventions. |

Changed: `src/app.html` (markup, styles, placeholder, finish hook),
`src/hooks.server.ts` (one call), `MainApplication.svelte` (one idle write
next to `writeBootSnapshot`), `_headers` (long cache for `/boot/*` with the
pool versioned by content hash in its filename, or `no-cache` if the name
stays fixed; implementer picks one and says which).

### Scene data

One scene is four polylines (two tips per hand, matching
`MandalaPaths.left[0..1]` and `right[0..1]`), the letters per beat, and a
palette hint. Compacted to one decimal place in grid units (grid radius 80,
as `MANDALA_GRID_RADIUS`), at most 24 points per beat per path. A 16-beat
sequence is about 18 KB as JSON; a 4-beat CAP about 5 KB.

```ts
interface OvertureScene {
  v: 1;
  word: string;            // display word, e.g. "MYΩNMYΩNMYΩNMYΩN"
  letters: string[];       // one glyph string per beat, TKA font
  unit: number;            // beats in the repeating unit (= beats when none)
  beats: number;
  left: [number, number][][];   // two tip paths, [x, y] in grid units
  right: [number, number][][];
}
```

The snapshot stored in localStorage is `OvertureScene & { at: number }`
where `at` is when it was written. The pool file is `{ v: 1; scenes:
OvertureScene[] }`. A separate integer key `tka-overture-boots`, incremented
by the inline script on every boot, rotates the pool.

`compactPaths` samples each `SVGPathData.beats` list (the on-curve points per
beat the calculator already exposes) down to 24 points per beat by arc
length, so the worker never needs the calculator. If `beats` is missing on a
path, the writer skips the snapshot rather than parsing the `d` string.

### Choosing the scene (inline script, before the worker starts)

1. If `tka-overture` parses and `v === 1`: use it.
2. Otherwise fetch `/boot/overture-pool.json` inside the worker (the fetch is
   off the main thread, at `priority: "low"`) and pick `scenes[(dayOfYear + boots) % n]`, where
   `boots` is the `tka-overture-boots` counter (0 if absent). Until the pool
   arrives (typically under 50 ms from cache or the CDN) the canvas is blank
   and the capsule carries.
3. If the pool fails to load, the worker posts `unavailable` and the canvas
   stays blank. The boot proceeds exactly as today.

### Writing the snapshot (app side)

In `MainApplication.svelte`, right after `writeBootSnapshot`, schedule
`writeOvertureSnapshot` on `requestIdleCallback` (fallback `setTimeout` 2 s).
The source, in order: the active Create tab's working sequence when it has at
least 4 beats; otherwise the sequence most recently opened in the sequence
viewer this session (the viewer calls `writeOvertureSnapshot` on open, also
idle-scheduled); otherwise write nothing and leave any existing snapshot.
The writer runs the geometry calculator once, compacts, derives `unit` from
`simplifyRepeatedWord(word)` (unit = beats when the word does not
simplify), and stores. It never runs during boot and never blocks `ready`.
The pool builder derives `unit` the same way.

The write is idempotent and cheap enough to repeat; a later phase can call it
on every sequence edit if the first version feels stale.

### Progress

Revised 2026-10-26 after the first build: Austen saw the pen run fast, crawl,
then rush at the end, and asked for one steady speed fitted to how long this
machine's boots take. The first build followed the capsule's engine through
an ease-out curve; this replaces it.

The worker paces the trace itself (`overture-pace.ts`); it no longer runs a
copy of the capsule's engine. The trace aims to reach 0.92 at the moment the
boot is expected to end, at one constant speed:

- **Expected length.** The median of this machine's last five boot lengths,
  stored as `tka-overture-pace` (`{v: 1, ms: number[]}`); without any, the
  `tka-boot-profile`'s `composed` (or `ready`), else the default profile's
  6380 ms. A boot length is the moment `finish` arrives, on the page's clock.
  The worker reports it with a `pace` message and the boot script stores it,
  except when the page was hidden at any point, when it reached the 15 s
  safety net, or in the lab. A route that removes the boot screen itself
  sends `abort`, which stops the worker without recording anything.
- **Milestones.** The profile's milestone times, scaled to the expected
  length, say when each step is due. An arrival late (or early) by some
  amount moves the expected end by the same amount. While the next step is
  overdue, the end moves back with the clock, so a slow step slows the pen
  while it is slow instead of all at once when it lands.
- **Speed.** Each frame wants `(0.92 − p) / (end − now)`, which stays constant
  on plan, capped at 1.8× the planned speed. The speed eases toward that over
  about 600 ms, so it never jumps. Past the expected end the pen creeps
  toward 0.97 and never stops dead. A frame gap (a hidden tab) counts as at
  most 100 ms.
- **Finish.** The rest traces at about the speed the pen was running,
  between 120 and 300 ms.

The main-thread engine still owns the capsule fill, the profile save, and
the "Almost there" timer. The trace and the capsule can now disagree a
little; they share an end, and nobody compares them mid-boot.

### Drawing (60 fps while visible, in the worker)

Per frame, in order, on a canvas sized to the layer (see Layout) at
`min(devicePixelRatio, 2)`:

1. Clear. The gradient sky stays on the DOM layer; the canvas is transparent.
2. Slow breath: scale `1 + 0.018·sin(now/900)` about the centre; turn
   `e²·0.35 rad` where `e = p` eased, so the finished mandala has rotated a
   little from where it started.
3. For each of the four paths, traced to `p`: a glow pass (stroke 7 px at
   28 % alpha, hand colour), then a crisp pass (stroke 2 px). Left hand uses
   blue, right hand red (`BLUE_STROKE`/`RED_STROKE` on the dark surface,
   `LIGHT_MOTION_BLUE_STROKE`/`LIGHT_MOTION_RED_STROKE` on the light one).
4. Hot trail: the last 1.2 % of each traced path (`p − 0.012 .. p`) at full
   white-tinted brightness, 3 px.
5. Heads: a radial gradient dot at each `pointAt(path, p)`, radius 5 px with
   a 14 px halo.
6. Sparks: a small particle pool (at most 48 on phones, 96 on desktop)
   emitted from the heads with velocity along the path tangent plus jitter,
   fading over 500 ms. Sparks are decoration; drop them first under load.
7. Letters: the *simplified* word only, never the repeats. The scene's
   `letters` holds one glyph string per beat of the full sequence; the writer
   also stores `unit`, the length in beats of the repeating unit found by
   `simplifyRepeatedWord` (`word-simplifier.ts`), so KECKECKECKEC becomes the
   three glyphs K E C with `unit = 3`. Below the mandala, draw `unit` glyph
   slots in the TKA font at 22 px (18 px on phones) with a soft dark shadow.
   During the first repetition each slot fades in over 240 ms when its beat
   finishes tracing (`p ≥ (i+1)/beats`). On every later repetition the slot
   for the beat being traced pulses once (brightness 1 → 1.5 → 1 over
   240 ms), and a small count to the right of the slots reads `×2`, `×3`, …
   from the second repetition on, incrementing as each repetition begins. A
   word with no repetition has `unit = beats` and no count.

Frame budget: 4 ms on a mid phone. A weak device draws the low tier (see
Performance budgets). On either tier, if a frame takes longer than 12 ms
three times in a row, halve the spark pool, then drop the glow pass.

The loop uses `requestAnimationFrame` in the worker where available (Chrome,
Firefox, Safari 16.4+) and `setTimeout(16)` otherwise. It pauses on a
`{type: "hidden"}` message (relayed from the existing `visibilitychange`
hook) and resumes on `{type: "visible"}`.

### Letters and the font

The worker fetches `/fonts/tka/tka.woff2` (10 KB, already shipped) at
`priority: "low"`, only once the trace is halfway through the first beat
(the first letter lights when that beat finishes), and installs it with
`new FontFace(...)` on `self.fonts`. Reduced motion draws the letters at
once, so there the font is fetched with the scene. If `self.fonts` or
`FontFace` is missing in the worker, or the fetch fails within 1.5 s,
letters are omitted and the mandala stands alone. No DOM letters in this
phase: the main thread is blocked when beats land, so DOM toggles would lag.

### Finish choreography

`__tkaFinishBoot` posts `{type: "finish", at}` to the worker before it does
anything else, then runs exactly as today (fill to 100 in 200 ms,
`.loaded` adds the 400 ms opacity fade, `transitionend` removes the node).
The worker, on `finish`:

- 0–120 ms: traces the remaining path to 1.0 and flares the heads (halo
  radius ×3, alpha to 1 then down).
- 0–420 ms: the whole mandala scales from 1.0 to `flyScale` with ease-in and
  fades from 1 to 0 (the fly-through). `flyScale` defaults to 1.6; Austen
  wants to judge it by eye, so the lab route below exposes it and the worker
  reads an override from `tka-overture-fly` in localStorage while he
  decides. The DOM layer's own 400 ms fade starts at
  200 ms, so the viewer sees the mandala pass through them while the sky
  dissolves; the total is 600 ms, which is what today's finish takes.
- After 420 ms the worker clears the canvas and stops; the node removal
  that follows is unchanged.

No app-side push-through in this phase. Scaling `#app` risks
`position: fixed` descendants and the view-transition handoff; it stays a
phase 2 option gated on a feel check.

### Layout

Dark surface (default) and light surface (`#app-loading[data-surface=
"light"]`) both:

- Canvas layer: a square `min(72vmin, 560px)` centred horizontally, its
  centre at 44 % of the viewport height on tall viewports and 46 % on wide
  ones. Grid radius 80 maps to 38 % of the square's half-width so a
  two-hand mandala's outer loops stay inside with margin.
- Letters sit directly under the square's bottom edge.
- Capsule: moved to the low position, centred horizontally, bottom at 9 % of
  the viewport height (the mockup's `.low`). It stays the morph target; the
  handoff travels to wherever the capsule lays out, so nothing in the
  handoff script changes. (Taste call for Austen, see below: low is the
  default this spec builds.)
- Light surface: strokes use the light motion palette, glow alpha drops to
  18 %, sparks are warm grey-white, letter shadow is light.

Viewport tiers to verify: 360×740, 390×844, 768×1024, 1280×800, 1536×864,
1920×1080, 3840×2160 (the full seven, since this is a new surface).

### Entrance

The canvas and letters are hidden (`opacity: 0`) until the view-transition
handoff has landed on the capsule, then fade in over 300 ms. The inline
script listens for the existing handoff completion signal where the handoff
script exposes one; otherwise it fades in at 350 ms after the script runs.
A boot without a handoff (direct URL, reload) fades in at once.

### Reduced motion

`prefers-reduced-motion: reduce`: no tracing, no sparks, no breath, no
rotation, no fly-through. The worker draws the finished mandala once at 60 %
alpha and fades it in over 400 ms; on `finish` it is simply removed with the
screen (today's reduced-motion path removes the node without a fade).

### Fallbacks

| Condition | Behaviour |
| --- | --- |
| No `Worker`, no `OffscreenCanvas`, or `transferControlToOffscreen` throws | Canvas removed, today's screen exactly. |
| Worker script fails to load or errors | `onerror` removes the canvas; boot unaffected. |
| Pool fetch fails and no snapshot | Canvas blank; boot unaffected. |
| Snapshot malformed | Treated as absent; the writer overwrites it after the next `ready`. |
| Worker never acknowledges within 1 s | Nothing to do; the capsule has been carrying all along. The canvas stays blank. |
| Font unavailable in the worker | Letters omitted. |

The Overture has no path by which it can hold, delay, or throw into the
boot. Every inline call is wrapped in `try {} catch {}` as the boot script
already does.

## Performance budgets

| Item | Budget |
| --- | --- |
| `overture.worker` bundle, gzipped | ≤ 30 KB (engine + trace + worker glue; no calculator, no pictograph modules) |
| Inline boot script | ≤ 3 KB |
| Pool JSON, gzipped | ≤ 40 KB |
| Main-thread time attributable to the Overture during boot | ≤ 2 ms |
| First drawn frame after `DOMContentLoaded` (warm, snapshot present) | ≤ 150 ms |
| Change to `ready` / `composed` timings (boot profiler, 5 warm boots) | within noise (≤ 2 %) |
| Worker frame time, mid phone | ≤ 4 ms |

The worker bundle must not import anything that drags in Svelte runes or
`$app/*` (see the `vite.config.ts` worker notes). `self-timing-bar.ts` is
already DOM-free; `overture-trace.ts` is written DOM-free; check the bundle
size in the build output and add a test that fails if the worker chunk
exceeds 30 KB gzipped.

### Low tier (revised 2026-10-27)

The boot must be ready no later than without the Overture, under 4x CPU
throttling too. The worker picks a tier at init (`overture-budget.ts`):

- **Low** when `navigator.hardwareConcurrency <= 4`, or
  `navigator.deviceMemory <= 4` where the browser reports it, or (on auto)
  the first 5 frames' drawing averages over 12 ms, which drops it mid-run.
- **Full** otherwise.

The low tier draws at 30 fps (a frame is skipped unless 29.3 ms have passed,
so a 60 Hz display draws every other one), at a pixel ratio of 1 or less so
the mandala's square is at most 480 backing px across, with no glow pass and
half the sparks. The slow-frame degradation above still runs on top. Reduced
motion is unchanged. The lab's Tier control (auto, full, low; `?tier=`)
forces either tier so the low look can be judged. The boot asks for auto
unless `localStorage["tka-overture-tier"]` is `"full"` or `"low"`, which
forces that tier on the device for measuring.

### Fetch policy

Both worker fetches carry `priority: "low"` (ignored where unsupported), so
they queue behind the app's own requests. The pool is fetched only when no
valid snapshot exists. The font waits until the first letter is near and
keeps its 1.5 s abort and omit-on-failure behaviour.

### Kill switch

`localStorage["tka-overture-off"] = "1"` leaves today's boot screen on that
device: the inline script removes the canvas before any worker starts. It is
for measuring the boot without the Overture. (A separate key, because
`tka-overture` holds the snapshot and the app rewrites it after `ready`.)
The worker reports what it drew at the finish as `{type: "stats", tier,
fps, drawMs, trail}` (`drawMs` is the mean drawing time per frame; `trail`
is the trace's progress every 250 ms, flat `[ms, traced x 1000, ...]`),
which the inline script keeps on `window.__tkaOvertureStats`.

### Measured (2026-10-27)

Protocol: `scripts/overture-boot-bench.mjs` on d2 (12 threads, nothing else
running), headless Chrome against a worktree Vite dev server, 1280x800,
CPU throttled 4x through DevTools, storage cleared before every boot, two
unthrottled warm-ups, modes alternating each round. Time-to-ready is the
`boot:splash:ready` mark on `/create`; medians over boots with no dev-server
reload. d1 could not be used: with two Unreal Editors running it sat at 100 %
CPU and a throttled boot took over two minutes, on or off.

| Run (4x, 6 boots per mode) | Off | On (auto) | Low (forced) |
| --- | --- | --- | --- |
| 1faa65d6bd | 4209 ms | 4464 ms (+6.1 %), tier full, 60 fps | not run |
| c4e0a8cd18 | 4601 ms | 5543 ms (+20.5 %), tier full, 60 fps | 4705 ms (+2.2 %), 30 fps |

- **The budget is not met on full.** Auto keeps the full tier on d2 under
  4x: its first frames draw well under 12 ms, so the watch never drops.
  Full costs about 6 % on the cleaner run. The second run is noisier: its
  off boots alone spread from 3982 to 6189 ms, and one on boot hit 9747 ms.
- **The low tier lands at +2.2 %**, at the edge of the budget and inside
  this run's noise. It drew at 30 fps on every boot.
- **Main thread:** `__tkaStartOverture` takes 1.9 ms median and the 11
  milestone relays take 0.8 to 1.1 ms in total. With the Overture off, the
  start costs 0.2 ms. Nothing beyond spawning the worker, the canvas
  transfer, postMessage and two storage reads showed up, so nothing was
  moved.
- **First draw without a snapshot:** 132 to 154 ms median after
  DOMContentLoaded, pool fetch included. Not noticeable.
- **Pacing (5 normal boots, unthrottled, learned pace kept):** the trace's
  speed between 250 ms samples stayed within a ratio of 1.10 to 1.36 on
  every boot, starting with the first. The pace learns the finish time,
  4.0 to 6.1 s on d2's dev server. The fifth boot ran 6.1 s against a
  learned median of about 4.6 s, so the trace waited at 97 % for about
  1.1 s before the finish, as designed.
- **Unmeasured:**
  - Whether DevTools' 4x throttle slows the worker at all. If it slows
    only the main thread, auto cannot see it. Commit 3a16eec199 adds the
    mean draw time to the stats so the next bench can tell.
  - A real slow phone, where the cores and memory rules should pick low.
  - A production build. All runs used the dev server.

## Testing

Pure modules first, following `.agents/skills/testing/SKILL.md` (test what
eyes cannot catch):

- `overture-pace.test.ts`: constant speed on an on-time boot; a late step
  slows the pen gradually, before and after it lands, and never backwards;
  a late boot creeps without passing 0.97; the median ignores one odd boot.
- `overture-trace.test.ts`: `pointAt` at 0, 1, and a mid value on a known
  polyline; cumulative length monotonic; `composeFrame` against a
  recording fake context asserts path order (glow before crisp), the number
  of traced points at p = 0.5, that slots `0..k` are lit exactly when
  `p ≥ (k+1)/beats` during the first repetition, that only `unit` slots are
  ever drawn for a 12-beat word with `unit = 3`, and that the count reads
  `×2` from beat `unit + 1` on.
- `overture-snapshot.test.ts`: `compactPaths` keeps endpoints, caps points
  per beat at 24, rounds to one decimal, and round-trips through JSON within
  0.05 grid units; `readOvertureSnapshot` rejects wrong versions and garbage.
- `overture-pool.test.ts`: every pool entry recomputes to within 0.1 grid
  units from its source sequence through the real calculator, so the checked
  in file cannot drift silently from the geometry.
- `overture-budget.test.ts`: the tier from cores, memory and a forced
  setting; the first-frames watch drops to low exactly once; the low tier's
  backing is at most 480 px across and draws every other 60 Hz frame; the
  pool is never fetched when the snapshot is good and goes out at low
  priority otherwise; the font is due halfway through the first beat.
- Worker bundle size test as above.

Browser verification (new surface, so `.agents/skills/ui-bust/SKILL.md` and
`docs/architecture/visual-review.md` apply):

1. Cold boot with cleared storage: pool scene traces, letters appear per
   beat, flare and fly-through at composed.
2. Warm boot after editing a sequence in Create: that sequence traces.
3. Light surface (a bright saved background), dark surface.
4. Reduced motion.
5. Handoff from the landing Composer button: the button still lands on the
   capsule; the mandala fades in after.
6. Phone viewport with throttled CPU: no main-thread regression in the boot
   profiler marks; sparks degrade before the mandala does.
7. The seven viewport tiers, screenshots at p ≈ 0.5 and at the finished
   frame.

### Lab route: `/test/boot-overture`

A test page (not linked from any menu) that mounts the same boot markup and
the same worker against a fake boot: a scene picker (snapshot, each pool
entry), surface (dark/light), reduced motion, boot length (2.4 s / 6.4 s),
`flyScale` (1.25 / 1.4 / 1.6), tier (auto / full / low), and a Replay
button. It is how Austen judges
the fly-through and how the seven-viewport screenshots are taken without
reloading the app each time. It reuses `overture-boot.js` with an injected
fake milestone feed; nothing in it is a second implementation of the
drawing.

## Phases

Phase 1 (this spec): everything above.

Phase 2 (separate spec after Austen's feel check):

- Real effect renderers off the tips in place of the spark pool: the
  DOM-free canvas renderers (petals, frost, bubbles, bloom, ink) take emitter
  tip points already; a seasonal or the user's saved effect rides the heads.
- Optional app-side push-through (`#app` 1.04 → 1 over 500 ms).
- Snapshot on every edit, not only at `ready`.

Phase 3: for boots predicted longer than 6 s, the finished mandala shifts
into a second scene (`mandala-shift-render.ts` is DOM-free); a tunnel finale
(N copies on a ring) for the fly-through on desktop.

## Taste calls (decided 2026-10-26)

1. Capsule position: low (bottom 9 %). Decided.
2. Letters: one per beat, simplified word only, repeats shown as a pulse and
   a count. Decided; the exact pulse and count styling are the implementer's
   first pass, reviewed on the lab route.
3. Fly-through strength: open. Austen judges it on the lab route; 1.6 is the
   shipping default until he picks.

## Out of scope

Landing pages, retro routes, the PWA splash image, the in-app loaders
(`AppShellLoader`, scan loader, museum loader). The Overture as the house
loader for those is a later idea, not this spec.
