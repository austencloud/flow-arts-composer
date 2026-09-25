# Post Studio Tutorial Builder

Date: 2026-09-24. Owner surface: Post Studio
(`src/lib/shared/share/components/post-studio/`) on the media-composition model
(`src/lib/shared/media-composition/`). Supersedes the UI and timing parts of
`2026-09-24-post-studio-breakdown-design.md`; that file stays as history.

## Why

Austen makes 90–130 s vertical tutorials (DCKΨ- now, ΩΛ-XJ next) in InShot:

1. A full-speed take on top with the app animation below (trails, beat number,
   letter, element icon), with the tempo matched by hand.
2. A slow take, full frame, with handwritten captions ("Practice with me!",
   "Watch hands closely", "Go slower to learn faster", "Now repeat 100x").
3. Optionally the sequence card with its QR code, held.

Matching the tempo by hand is the part he calls "really annoying". The first
Post Studio breakdown build (Codex, 2026-09-24) added a slow-section strip,
but a review of main found 27 confirmed defects. The largest are:

- The strip's animation square and carousel show different moves for about
  91% of every beat, because one reads the move in flight and the other the
  pose just landed.
- A tap run that stops partway through a pass is thrown away with a false
  error.
- A typed BPM never reaches the tap editor, which spaces at 60 BPM.
- Nothing fits rough taps to a BPM.
- A stored BPM grid silently overrides newer taps.
- Mapping hides behind three conditional buttons.
- The inspector rail is a long stack organised by layer, not by the job.
- Split and Breakdown are exclusive, so the three-part tutorial can't be built.

This design keeps the pure evaluator, the painter contract, the zod schemas,
region motion and the arrival convention. It replaces the timing model, the
post model the UI edits, and the whole UI.

## Two ways Austen uses it

- **Build from takes.** Pick a full-speed take and a slow take, map each once,
  and arrange acts: full speed split with the animation, then the slow take
  full frame with the strip and captions, then the card.
- **Add to an edit.** Pick an already-edited video, such as the InShot export,
  as the only take. Map each section of it at its own tempo, then turn the
  strip on for the slow part.

Both use the same two records: timing per take and a plan of acts.

## Core rule: one clock

Each take has one resolved timing. Every sequence-derived layer in an act reads
the position of that act's take at the take's own media time. That covers the
animation square, the mandala, the carousel, the full-speed animation panel
and the card highlight. The performer, the animation and the carousel
therefore always show the same move. Slowing a take (speed below 1×) needs no
second map, because the position follows media time rather than post time.

Conventions, fixed once in `sequenceFrameAt` (`domain/sequence-frame.ts`),
which every layer reads instead of deriving its own:

- **Arrival count `r`**: 0 is the opening pose; `k` is the landing of move `k`,
  counted across passes. Legacy engine-convention maps convert with
  `r = max(0, e − 1)`.
- **Move at `r`**: `g = ceil(r)`, global. A move owns everything after the
  previous landing up to and including its own, so at exactly `r = k` the frame
  is move `k` finished. The landing that closes a pass stays in that pass.
- **Pass**: `floor((g − 1) / N)`; move within the pass `g − pass·N`.
- **Phase**: `opening` at `r = 0`, `moving`, then `holding` from the take's
  last landing on (`r ≥ endArrival`).
- **Strip pictograph**: shows move `g`. The prop travels from the previous
  landing to this move's end pose while the arrow fades in on the same
  progress (`arrowOpacity(p) = p`, the Construct audition's fade). Move 1 of
  pass 2 and later starts from move `N`'s end pose.
- **Carousel**: opening shows track 0. Moving, the track is
  `g + easeInOut(clamp01((p − 0.82) / 0.18))`, sliding on across the last 18%
  of the move, and is exactly `g` at `p = 1` and while holding. The ring is on
  cell `g`; the tick is `move`.
- **Mandala**: per move, the trail is the prefix of that move's sample range
  up to `p`, so the bright end sits on the prop. It shows on odd passes only
  when set to alternate.
- **Act end**: after the take's last landing every layer holds the final pose.
  Nothing snaps back to the start and nothing slides on to a next move.

## Timing per take

### Record (`TakeTiming`, zod, `media-composition/domain/take-timing.ts`)

```text
TakeTiming {
  schemaVersion: 1
  sequenceId, takeKey
  sections: TimingSection[]       // ordered, non-overlapping media ranges
  movesKey?                       // move lengths it was confirmed against
  confirmedAt?                    // "Looks right"; any edit clears it
  updatedAt
}
TimingSection {
  id
  startSeconds, endSeconds        // media time; one section covers a raw take
  bpm                             // typed tempo, 20–300 (its own range, not the engine's)
  tempo: "locked" | "follow"      // locked: 60/bpm per beat; follow: fitted ±5%
  snap: "grid" | "taps"           // grid: even landings; taps: matched taps win
  taps: number[]                  // raw media seconds, as tapped
  firstTapPosition                // what the earliest tap marks, while no beat 1
  beatOneSeconds?                 // Austen's mark: the landing nearest it is move 1
  lastPosition?                   // the performer's last landing; layers hold after it
  offsetSeconds                   // whole-grid nudge, a frame at a time in the UI
  overrides: { position, seconds }[]  // dragged landings, one per position
}
```

Step durations come from the sequence: move `j` lasts `duration(j)` beats, so
a two-beat move spaces its landing twice as far.

Only Austen's choices are stored. The grid is recomputed from them, so a
better fitter improves every saved take. Both contest sequences repeat four
letters four times, so a map a whole group off still shows the right letter;
that is why beat 1 is a mark he places rather than whichever tap came first,
and why a take counts as checked only after "Looks right".

### Fitter (`media-composition/domain/tap-fit.ts`, pure)

Model: landing `m` (1-based, global) sits at `τ(m) = t0 + s·B(m)`. Here `s` is
seconds per beat and `B(m)` is the cumulative beats from landing 1, using the
durations of the moves labelled from `firstMove`.

0. **Clean.** Taps within 1 ms of each other count once (a key registered
   twice).
1. **Comb search.** Search `s` in `s0·[0.95, 1.05]` (only `s0` when locked)
   and the phase, coarse then fine. Score each pair with `Σ exp(−r²/2σ²)`,
   where `σ = 40 ms` and `r` is each tap's distance to its nearest landing
   (found by bisection over the pass's cumulative beats). The coarse pass
   scores an evenly spread subset of at most 48 taps; the fine pass uses all.
   Following holds the typed tempo until the taps span
   `clamp(beatsPerPass, 8, 16)` beats, because a few taps cannot tell tempo
   from phase.
2. **Label.** Assign each tap to its nearest landing. A second tap on the same
   landing and any tap further than 35% of the shortest move become extras.
   Landings without a tap are misses, which the grid fills.
3. **Refine.** A Huber refit of `t0` (and `s` when following, clamped to the
   ±5% band), then relabel once.
4. **Identity.** With beat 1 marked, the landing nearest the mark is move 1.
   Without it the earliest matched tap is `firstTapPosition`, except that a
   lone early tap followed by at least 3 missed landings and then a run of 3
   is set aside as a stray. That rule is wrong when a real first tap is
   followed by several misses; the seeded sweep allows at most 2 such takes in
   40 at 40% misses, and every one is flagged by `ignoredLeadingTaps` so the UI
   asks. Marking beat 1 removes the guess.
5. **Report.** Fitted BPM, median and worst miss in ms, extras, misses, and
   ignored leading taps.

The unit tests run a seeded sweep (tempo up to 3.4% off the typed BPM, up to
40% missed and 20% extra taps) and require every unflagged take to land within
a quarter beat of the truth everywhere.

**Verdict** (`domain/timing-verdict.ts`). When the fit is loose, sits at the
edge of the tempo band, or the taps look like double or half time, the taps
suggest their own BPM. It replaces the typed one when they disagree by more
than 6%, snapping to the octave (typed ×2 or ÷2) when within 2% of it.

With `snap: "taps"`, each matched tap becomes its landing's time. Misses are
interpolated in beat space between their matched neighbours. This is for slow
takes where a human tempo drifts.

### Resolution (`resolveTakeTiming`)

Each section resolves to an arrival `SequenceTimeMap` and a list of landings
`{ position, seconds, pinned }`. It has an anchor at every landing inside the
section, plus the opening pose one move before landing 1 and one landing past
the section end so the last move interpolates. The resolved take exposes a
`TakeClock` whose `sampleAt(mediaSeconds)` returns `{ arrival, endArrival }`.
A media time in a gap between sections holds the previous section's last pose.

- **Start.** The first landing is found from the section start, including the
  nudge, and steps back while it still falls after the start, so a large
  nudge never leaves the start of a section frozen.
- **End.** `lastPosition` when set. Otherwise the highest matched or dragged
  landing, rounded up to the pass end when within `min(2, floor(N/4))`
  landings of it: Austen often stops tapping a landing or two early while the
  performer finishes the pass. A section with a tempo and beat 1 but no taps
  runs to its end. A partial last pass is otherwise normal: the map stops at
  the last landing.
- **Dragged landings** ignore the nudge. One that no longer sits at least a
  frame (1/30 s) inside its neighbours is set aside and reported in
  `droppedOverrides`, rather than squeezing later moves into a few
  milliseconds. `landingDragRange` gives the UI those bounds, `setLandingAt`
  clamps to them, and `releaseLanding` puts a landing back on the grid.
- **Split.** `splitTimingSection` takes an explicit continuity. `continues`
  (the performer changed tempo) keeps counting from the left side's labels.
  `restarts` (an edited video whose slow replay starts again from the opening
  pose) makes the right side begin at move 1, with its dragged landings and
  end renumbered to match.
- **Legacy step maps** convert with every mark pinned, the opening mark kept
  out of the fit (`taps = marks.slice(1)`, first tap is move 1), and the end at
  the last mark.

### Storage (`media-composition/state/take-timing-store.ts`)

- The key is `tka:post-studio:take-timing:v1:<sequenceId>:<takeKey>`.
- `takeKey` depends on the take: `local:<name>:<size>:<lastModified>` for a
  local file or `catalog:<videoId>` for a catalog video.
- Picking the same local file again reattaches its timing.
- A catalog video with a legacy Firestore `beatMap` and no `TakeTiming` gets one
  seeded on first open: the legacy landings become `taps` with `snap: "taps"`.
  This design writes nothing to Firestore. Syncing timing across devices is a
  follow-up.
- `openTakeTiming` migrates the old per-take local step maps and BPM
  alignments by reading their localStorage keys directly. Their modules are
  deleted.

## The plan

### Record (`PostPlan`, zod, `media-composition/domain/post-plan.ts`)

```text
PostPlan {
  schemaVersion: 1
  sequenceId
  takes: { id, label, takeKey, ref: {kind:"local", name, size, lastModified}
                                 | {kind:"catalog", videoId} | {kind:"linked", url} }[]
  acts: (PerformanceAct | CardAct)[]   // played in order, back to back
  captions: Caption[]
  audio: "takes" | "silent"            // takes: each 1× act carries its take's sound
  updatedAt
}
PerformanceAct {
  id, kind: "performance", label, enabled
  takeId | null, sourceIn, sourceOut | null (to the take's end), speed 0.25–1
  layout: "split" | "full"             // split: take above, animation below
  strip: "off" | "arrows" | "mandala" | "alternate"   // full layout
  carousel: boolean                    // full layout
  framing: { area: "frame" | "above-strip", fit: "cover" | "contain",
             zoom 1–3, panX, panY ±0.5 }
}
CardAct { id, kind: "card", label, enabled, seconds 1–30 }
Caption { id, actId, text, startSeconds, endSeconds, position: "top"|"middle"|"bottom", size: "s"|"m"|"l" }
```

- The plan is a fixed template of three acts: **Full speed** (split),
  **Breakdown** (full frame, strip alternating, carousel on, half speed) and
  **Card**. Each can be switched off. Adding and reordering acts is a
  follow-up.
- The first take drives both performance acts. A second take takes over the
  Breakdown at 1×, since it was performed slowly already.
- An act's length is `(sourceOut − sourceIn) / speed`, or `seconds` for a card.
- Caption times count from the start of their act, so moving an act moves its
  captions.
- A post with no take (animation only) is not supported yet.

### Compiler (`media-composition/domain/post-plan-compiler.ts`, pure)

`compilePostPlan(plan, context) → CompiledPost` (a preset, the act spans and
the resolved captions) with the free layout model:

- One source role per take (`take:<id>`), one per strip mode
  (`strip:arrows|mandala|alternate`), plus the animation, carousel, card,
  captions and animation-overlay roles.
- **Clips.** Each performance act emits the take clip with explicit
  `start/end/sourceIn/sourceOut` in seconds and the act's framing as its
  transform. Its derived clips (the split animation and its overlay, the strip
  square, the carousel) copy the same timing, so their source time is the
  take's media time, and carry `timeMapRole: "take:<id>"`.
- **Acts cut** with a short fade-in on every act after the first. The planned
  region morph between consecutive acts on one take is not built.
- **Card act.** A card clip full frame.
- **Markers.** One per act start.
- The animation overlay clip is emitted only when the host has a painter for
  it (`context.animationOverlay`).

The schema grows two optional fields, and older presets still parse:

- `timeMapRole` on a visual clip.
- `SequenceFrameAlignment` keyed by role in the evaluator (`alignments` map).
  The old single `alignment` stays as the fallback for clips without the field.

Captions are not preset clips. They are an overlay list painted after the
layers by the caption painter, in the preview and in the export alike.

## UI

### Layout

A step bar across the top: **Takes · Timing · Acts · Captions · Render**.

- Each step shows done or to-do, and the studio opens on the first to-do. Steps
  are tabs, never locked.
- The canvas shows on every step except Timing, where the take plays large
  beside the strip square instead.
- The current step's panel sits beside the canvas when the studio is at least
  56rem wide, and below it otherwise. In the sequence viewer the panel moves
  into the viewer's inspector.
- The transport sits under the canvas: play, the post clock and a scrubber.

This replaces the layer-inspector rail, the Split/Breakdown switch,
BreakdownControls, the phone tabs that hid the canvas, and the three mapping
entry points.

### Takes

A list of takes with a name field and a timing badge ("Timing not mapped",
"Timing not checked", "Timing checked"). Controls:

- "Choose a video from this device".
- The sequence's saved (catalog) videos, each with an Add button.
- Remove, and "Map timing", which jumps to Timing.

A local take's file does not survive a reload. The plan remembers it and asks
for the same file again.

### Timing, the heart of it

The take plays large, with a live strip square beside it: the pictograph for
the move in flight, with the prop moving and the arrow fading. Austen checks
the fit by watching the two together.

Controls, in order:

1. **BPM.** A number field.
2. **Tap along.** Plays at a chosen speed (1×, ¾×, ½×). He presses **T** or the
   big Tap button at each landing. Taps record `video.currentTime`, never the
   composition clock. Space plays, and comma and period step a frame.
3. **The fit appears as soon as there are three taps.** Landings show as ticks
   numbered by move, pass boundaries as taller ticks, and each tap as a dot with
   a line to its landing. The result reads in plain words, for example "Fits
   87.2 BPM · taps within 0.03 s · 2 missed, 1 extra ignored".
4. **Adjust:**
   - "Hold 87 exactly" or "Follow the video's tempo".
   - "Move 1 is earlier / later" (±1 move).
   - Nudge the whole grid by ±1 frame. The frame length comes from the video,
     and the picture seeks exactly.
   - Select a landing on the lane and nudge it a frame at a time.
   - "On the taps" (`snap: "taps"`).
   - Mark where the performance ends, or clear the end.
5. **Sections.** "Edited take? Split it into parts" splits at the playhead,
   either continuing the count or restarting from move 1, for an edited video
   that changes speed.
6. **Looks right** marks the timing checked. Any later edit clears it.

The timing saves automatically on every change, with undo. Nothing is lost if
the take ends mid-pass.

### Acts

A picker for the three acts, each with an on/off switch, and one panel for the
selected act:

- **Take.** Picker, the part of the take (start and end in m:ss.ss, or set from
  the playhead), and speed (1×, ¾×, ½×, ¼×).
- **Layout.** "Take over animation" (split) or "Full frame".
  - Full: strip square off, arrows, trails (mandala) or both in turn, one pass
    each; carousel on or off.
- **Framing.** Behind or above the strip, Fill or Whole picture, zoom, and
  left-right and up-down sliders. The strip's area is outlined on the canvas
  while this step is open, so the prop ends can be kept clear of it.
- **Props, trails and colors.** The shared animation panel, for the prop and
  the look.

### Captions

A list of caption rows (text, start and end in seconds into the act, position,
size) with starter phrases from the reference video. "Add at the playhead"
puts one in the act under the playhead.

The font is the app's display face with a heavy outline. A handwritten face
needs a font file download, which waits for Austen's go-ahead.

### Render

The output facts (length, size, frame rate), a sound choice ("The takes' own
sound" or "Silent"), and a to-do list of anything unmapped or unchecked, each
linking to its step. Rendering is allowed anyway. Then Render with progress
and Cancel, Download, and Share where the host has a share sheet.

### Sizes

The desktop and phone arrangements are verified at these widths:

- 1920×1080 and 1440×900 desktop.
- The Z Fold unfolded, about 707×676. The panel goes below the canvas, and the
  canvas keeps at least 280 px of width.
- The Z Fold cover and a phone at 375×667. The canvas stays on top, and the
  step panel scrolls under it.

## Rendering

- **Frame source of truth.** `evaluatePresetFrame` stays the only source of
  timing, for both preview and export.
- **Video.** Each frame seeks exactly and draws. In the preview, the media layer
  sets `video.playbackRate` to the act's speed and re-seeks when drift passes
  one frame while paused, or 0.12 s while playing.
- **Painters.** These draw at output resolution, identically in preview and
  export, and read nothing from the DOM:
  - **Strip pictograph** (new). It uses `Canvas2DDirectRenderer`, extended with
    an arrow opacity and prop placement overrides from
    `calculatePictographMotionPositions`, the same function the Construct
    audition uses. No CSS transition, no DOM screenshot and no 5 s wait.
  - **Strip mandala** (new, from `PostStudioBreakdownMandala`). It uses the
    corrected progress and per-move segment lengths, so the bright end sits on
    the prop.
  - **Carousel** (existing), fed the move-in-flight position.
  - **Captions** (new).
- **Split animation panel.** This uses the live `AnimatorCanvas`, copied into
  the export frame. The beat number, letter glyph, element icon and progress
  bar are a separate painter (`PostAnimationOverlayPainter`, registered with
  the deferred services) that draws them with the compose export's own glyph
  placement, so they match the Animate export. A full output-resolution
  animation painter is a follow-up.
- **Card.** The existing DOM capture, cached per beat.
- **Audio.** `buildPostAudioTrack` decodes each 1× act's take audio with
  `OfflineAudioContext`, places it at the act's post time and renders one WAV.
  Slowed acts are silent. The encoder muxes that WAV through its existing
  `originalAudio` URL input.

## What goes

Deleted, with their tests:

- `PostStudioActionBar`, `PostStudioBreakdownControls`,
  `PostStudioBreakdownDetail`, `PostStudioInspector`,
  `PostStudioPerformancePicker`, `PostStudioPreview`, `PostStudioTimeline`,
  `PostStudioTransport`, `PostStudioSourceSettings`, `PostStudioSourceTrim`.
- `post-studio-source-menu.ts`, `post-studio-performance-selection.ts`,
  `local-performance-step-maps.ts`, `local-performance-bpm-alignments.ts`.
- The Split/Breakdown switch as a user control, the single-pass section grid
  fallback, the phone Canvas/Edit/Timing tabs, and the `StepMapEditor` mount
  inside the picker.

`PostStudio.svelte` is now a thin shell. It keeps what outlives one sequence
(the prop, the link state and the share seam) and opens a fresh
`PostStudioWorkspace` per sequence.

## Verification

- **Unit (Vitest):**
  - Fitter: the seeded simulation sweep, locked and following tempo, the octave
    case, `firstMove`, overrides, step durations of 2, partial passes, sections.
  - Resolver: anchors, holds and gaps.
  - Compiler: the three-act DCK plan, a shared-take morph, a card act and speed
    0.5.
  - Evaluator: square, carousel and pass index agree at `r` = 7.5, 8, 8.5, 16.5
    for N = 8, and slowed acts read the take's media time.
  - Audio planner.
- **Browser** (the in-app browser on a task-owned preview server from this
  worktree):
  - Map the September 6 DCK take at 87 BPM by tapping, and check that the square
    matches the performer across the pass boundary.
  - Build three acts.
  - Render a sample and read frames back from the MP4 at pass boundaries.
  - Check the widths above.
- **Review:** an adversarial review by Codex and an Opus reviewer before
  integration.

## Delivery stages

1. Domain: take timing, fitter, resolver, plan, compiler, and the evaluator's
   per-role maps and convention fixes, with tests.
2. Painters (strip pictograph, mandala, captions) and the audio mixdown.
3. UI: step bar, Takes, Timing, Acts, Captions, Render, and responsive layout.
4. Wiring: the viewer shell, the share sheet, the harness route
   (`/test/post-studio` loads the DCK take), and removals.
5. Verification and review, then guarded integration.
6. Follow-up: adding and reordering acts, animation-only posts, the region
   morph between acts on one take, the output-resolution split-animation
   painter, a handwritten caption font, cloud sync of timing, and AI edits to
   the plan through a documented JSON contract.
